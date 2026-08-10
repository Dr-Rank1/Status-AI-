/**
 * Subscription tier management — Pro tier unlocks unlimited energy + 3D avatars.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

export const PRO_ENTITLEMENTS = ['pro', 'unlimited_energy', '3d_avatars'];
export const PRO_ENERGY_MAX = 9999;

export async function getUserEntitlements(userId) {
  const { rows } = await query(
    `SELECT u.subscription_tier, u.revenuecat_app_user_id,
            s.tier, s.entitlements, s.is_active, s.expires_at, s.product_id
     FROM users u
     LEFT JOIN user_subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );

  if (!rows[0]) return { tier: 'free', entitlements: [], isPro: false };

  const row = rows[0];
  const isPro = row.subscription_tier === 'pro'
    || (row.is_active && row.tier === 'pro')
    || (Array.isArray(row.entitlements) && row.entitlements.includes('pro'));

  return {
    tier: isPro ? 'pro' : 'free',
    entitlements: isPro ? PRO_ENTITLEMENTS : [],
    isPro,
    expiresAt: row.expires_at,
    productId: row.product_id,
    revenuecatAppUserId: row.revenuecat_app_user_id,
  };
}

export async function isProUser(userId) {
  const ent = await getUserEntitlements(userId);
  return ent.isPro;
}

export async function applyProTier({ userId, tenantId, appUserId, productId, store, expiresAt, eventType, rawPayload }) {
  await query(
    `UPDATE users SET subscription_tier = 'pro', revenuecat_app_user_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [userId, appUserId],
  );

  await query(
    `INSERT INTO user_subscriptions (
       user_id, tenant_id, revenuecat_app_user_id, tier, entitlements,
       product_id, store, is_active, expires_at, last_event_type, last_event_at, raw_payload
     ) VALUES ($1, $2, $3, 'pro', $4, $5, $6, TRUE, $7, $8, NOW(), $9)
     ON CONFLICT (user_id) DO UPDATE SET
       tier = 'pro',
       entitlements = EXCLUDED.entitlements,
       product_id = EXCLUDED.product_id,
       store = EXCLUDED.store,
       is_active = TRUE,
       expires_at = EXCLUDED.expires_at,
       last_event_type = EXCLUDED.last_event_type,
       last_event_at = NOW(),
       raw_payload = EXCLUDED.raw_payload,
       updated_at = NOW()`,
    [
      userId,
      tenantId,
      appUserId,
      JSON.stringify(PRO_ENTITLEMENTS),
      productId,
      store,
      expiresAt,
      eventType,
      JSON.stringify(rawPayload ?? {}),
    ],
  );

  await query(
    `UPDATE energy_state SET energy_max = $2, energy_remaining = $2, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, PRO_ENERGY_MAX],
  );

  logger.info(`[Subscription] Pro tier applied user=${userId} event=${eventType}`);
  return getUserEntitlements(userId);
}

export async function revokeProTier({ userId, eventType, rawPayload }) {
  await query(
    `UPDATE users SET subscription_tier = 'free', updated_at = NOW() WHERE id = $1`,
    [userId],
  );

  await query(
    `UPDATE user_subscriptions SET is_active = FALSE, tier = 'free', entitlements = '[]',
            last_event_type = $2, last_event_at = NOW(), raw_payload = $3, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, eventType, JSON.stringify(rawPayload ?? {})],
  );

  await query(
    `UPDATE energy_state SET energy_max = 100,
            energy_remaining = LEAST(energy_remaining, 100), updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );

  logger.info(`[Subscription] Pro tier revoked user=${userId} event=${eventType}`);
  return getUserEntitlements(userId);
}

export async function findUserByRevenueCatId(appUserId) {
  const { rows } = await query(
    `SELECT id, tenant_id FROM users WHERE revenuecat_app_user_id = $1 OR id::text = $1`,
    [appUserId],
  );
  return rows[0] ?? null;
}
