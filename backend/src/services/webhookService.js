/**
 * Developer webhook registry and delivery.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const ALLOWED_EVENTS = new Set([
  'narrative.event',
  'character.status',
  'feed.post',
  'character.message',
]);

export async function registerWebhook({ clientId, url, secret, events }) {
  const normalizedEvents = (events ?? ['narrative.event']).filter((e) => ALLOWED_EVENTS.has(e));
  if (normalizedEvents.length === 0) {
    throw new Error('At least one valid event type is required');
  }

  const secretHash = await bcrypt.hash(secret, 10);

  const { rows } = await query(
    `INSERT INTO developer_webhooks (client_id, url, secret_hash, events)
     VALUES ($1, $2, $3, $4)
     RETURNING id, client_id, url, events, is_active, created_at`,
    [clientId, url, secretHash, normalizedEvents],
  );

  return rows[0];
}

export async function listWebhooks(clientId) {
  const { rows } = await query(
    `SELECT id, url, events, is_active, created_at
     FROM developer_webhooks
     WHERE client_id = $1
     ORDER BY created_at DESC`,
    [clientId],
  );
  return rows;
}

export async function deleteWebhook({ clientId, webhookId }) {
  const { rowCount } = await query(
    `DELETE FROM developer_webhooks WHERE id = $1 AND client_id = $2`,
    [webhookId, clientId],
  );
  return rowCount > 0;
}

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export async function dispatchWebhookEvent(eventType, payload) {
  if (!ALLOWED_EVENTS.has(eventType)) return [];

  const { rows: hooks } = await query(
    `SELECT id, url, secret_hash, events FROM developer_webhooks WHERE is_active = TRUE`,
  );

  const targets = hooks.filter((h) => h.events.includes(eventType));
  const results = [];

  for (const hook of targets) {
    const body = {
      id: crypto.randomUUID(),
      type: eventType,
      created_at: new Date().toISOString(),
      data: payload,
    };

    let statusCode = null;
    let success = false;

    try {
      const response = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Status-Webhooks/1.0',
          'X-Status-Event': eventType,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? '8000', 10)),
      });

      statusCode = response.status;
      success = response.ok;
    } catch (err) {
      logger.warn(`[Webhook] delivery failed ${hook.url}: ${err.message}`);
    }

    await query(
      `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status_code, success)
       VALUES ($1, $2, $3, $4, $5)`,
      [hook.id, eventType, JSON.stringify(body), statusCode, success],
    );

    results.push({ webhookId: hook.id, success, statusCode });
  }

  return results;
}

export { ALLOWED_EVENTS };
