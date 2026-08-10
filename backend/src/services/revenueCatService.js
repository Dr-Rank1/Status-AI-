/**
 * RevenueCat webhook processing — sync Pro tier entitlements across devices.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  applyProTier,
  revokeProTier,
  findUserByRevenueCatId,
  getUserEntitlements,
} from './subscriptionService.js';

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET ?? '';
const PRO_PRODUCT_IDS = (process.env.REVENUECAT_PRO_PRODUCT_IDS ?? 'status_pro_monthly,status_pro_yearly,pro')
  .split(',')
  .map((s) => s.trim());

const ACTIVATION_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);

const REVOCATION_EVENTS = new Set([
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
]);

export function verifyRevenueCatWebhook(req) {
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token === WEBHOOK_SECRET) return true;

  const signature = req.headers['x-revenuecat-signature'];
  if (signature && req.rawBody) {
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  }

  return false;
}

export async function processRevenueCatWebhook(body) {
  const event = body.event ?? body;
  const eventId = event.id ?? event.event_timestamp_ms ?? `${event.type}-${Date.now()}`;
  const eventType = event.type ?? body.type ?? 'UNKNOWN';
  const appUserId = event.app_user_id ?? event.appUserId ?? body.app_user_id;

  if (!appUserId) {
    return { skipped: true, reason: 'missing app_user_id' };
  }

  const duplicate = await query(
    `SELECT id FROM subscription_events WHERE event_id = $1`,
    [String(eventId)],
  );
  if (duplicate.rows.length > 0) {
    return { skipped: true, reason: 'duplicate event' };
  }

  const user = await findUserByRevenueCatId(appUserId);
  const productId = extractProductId(event);
  const expiresAt = extractExpiration(event);
  const store = event.store ?? event.store_type ?? null;

  let entitlements = null;

  if (shouldActivate(eventType, event, productId)) {
    if (!user) {
      await recordEvent({ eventId, eventType, appUserId, userId: null, payload: event });
      return { skipped: true, reason: 'user not found', appUserId };
    }
    entitlements = await applyProTier({
      userId: user.id,
      tenantId: user.tenant_id,
      appUserId,
      productId,
      store,
      expiresAt,
      eventType,
      rawPayload: event,
    });
  } else if (REVOCATION_EVENTS.has(eventType)) {
    if (user) {
      entitlements = await revokeProTier({ userId: user.id, eventType, rawPayload: event });
    }
  }

  await recordEvent({
    eventId,
    eventType,
    appUserId,
    userId: user?.id ?? null,
    payload: event,
  });

  return { eventType, appUserId, userId: user?.id, entitlements };
}

export async function syncEntitlementsFromClient({ userId, appUserId, activeEntitlements = [] }) {
  const hasPro = activeEntitlements.some((e) =>
    PRO_PRODUCT_IDS.includes(e) || e === 'pro' || e === 'status_pro');

  if (hasPro) {
    return applyProTier({
      userId,
      tenantId: null,
      appUserId,
      productId: activeEntitlements[0],
      store: 'client_sync',
      expiresAt: null,
      eventType: 'CLIENT_SYNC',
      rawPayload: { entitlements: activeEntitlements },
    });
  }

  return getUserEntitlements(userId);
}

function shouldActivate(eventType, event, productId) {
  if (ACTIVATION_EVENTS.has(eventType)) return true;
  if (productId && PRO_PRODUCT_IDS.some((p) => productId.includes(p))) return true;

  const entitlements = event.entitlement_ids ?? event.entitlements ?? [];
  if (Array.isArray(entitlements) && entitlements.some((e) => e === 'pro' || e === 'status_pro')) {
    return true;
  }

  return false;
}

function extractProductId(event) {
  return event.product_id
    ?? event.new_product_id
    ?? event.presented_offering_id
    ?? event.entitlement_ids?.[0]
    ?? null;
}

function extractExpiration(event) {
  const ms = event.expiration_at_ms ?? event.expires_at_ms;
  if (ms) return new Date(Number(ms)).toISOString();
  if (event.expiration_at) return new Date(event.expiration_at).toISOString();
  return null;
}

async function recordEvent({ eventId, eventType, appUserId, userId, payload }) {
  await query(
    `INSERT INTO subscription_events (event_id, event_type, app_user_id, user_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id) DO NOTHING`,
    [String(eventId), eventType, appUserId, userId, JSON.stringify(payload)],
  );
}
