import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifyRevenueCatWebhook,
  processRevenueCatWebhook,
} from '../src/services/revenueCatService.js';
import { PRO_ENTITLEMENTS, PRO_ENERGY_MAX } from '../src/services/subscriptionService.js';

describe('Phase 26 — RevenueCat subscriptions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.REVENUECAT_WEBHOOK_SECRET = 'test-webhook-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('verifyRevenueCatWebhook accepts Bearer token', () => {
    const req = {
      headers: { authorization: 'Bearer test-webhook-secret' },
    };
    assert.equal(verifyRevenueCatWebhook(req), true);
  });

  it('verifyRevenueCatWebhook rejects invalid token in production', () => {
    process.env.NODE_ENV = 'production';
    const req = { headers: { authorization: 'Bearer wrong' } };
    assert.equal(verifyRevenueCatWebhook(req), false);
  });

  it('verifyRevenueCatWebhook validates HMAC signature', () => {
    const body = JSON.stringify({ event: { type: 'INITIAL_PURCHASE' } });
    const signature = crypto
      .createHmac('sha256', 'test-webhook-secret')
      .update(body)
      .digest('hex');
    const req = {
      headers: { 'x-revenuecat-signature': signature },
      rawBody: Buffer.from(body),
    };
    assert.equal(verifyRevenueCatWebhook(req), true);
  });

  it('subscriptionSyncSchema validates client payload', async () => {
    const { subscriptionSyncSchema } = await import('../src/validation/schemas.js');
    const result = subscriptionSyncSchema.safeParse({
      appUserId: 'user-123',
      activeEntitlements: ['pro', 'status_pro'],
    });
    assert.equal(result.success, true);
  });

  it('Pro tier entitlements include unlimited energy and 3D avatars', () => {
    assert.ok(PRO_ENTITLEMENTS.includes('pro'));
    assert.ok(PRO_ENTITLEMENTS.includes('unlimited_energy'));
    assert.ok(PRO_ENTITLEMENTS.includes('3d_avatars'));
    assert.equal(PRO_ENERGY_MAX, 9999);
  });

  it('processRevenueCatWebhook skips events without app_user_id', async () => {
    const result = await processRevenueCatWebhook({ event: { type: 'TEST' } });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'missing app_user_id');
  });
});
