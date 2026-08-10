import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  deriveCommitment,
  buildClaims,
  verifyClaim,
} from '../src/services/zkpVerificationService.js';

describe('zkp verification', () => {
  const savedPepper = process.env.ZKP_PEPPER;

  beforeEach(() => {
    process.env.ZKP_PEPPER = 'test-pepper';
  });

  afterEach(() => {
    process.env.ZKP_PEPPER = savedPepper;
  });

  it('derives stable commitments without exposing user id', () => {
    const a = deriveCommitment('user-123');
    const b = deriveCommitment('user-123');
    const c = deriveCommitment('user-456');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.ok(!a.includes('user-123'));
  });

  it('builds vip claim from reputation threshold', () => {
    const claims = buildClaims({
      reputation: 600,
      is_admin: false,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    });
    assert.equal(claims.vip, true);
  });

  it('signs and verifies reputation_min proofs', () => {
    const user = {
      reputation: 120,
      is_admin: false,
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    };
    const commitment = deriveCommitment('abc');
    const claims = buildClaims(user);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 3600000;
    const payload = {
      v: 1,
      commitment,
      claims,
      issuedAt,
      expiresAt,
      nullifier: 'test-nullifier',
    };

    payload.sig = crypto
      .createHmac('sha256', `${process.env.ZKP_PEPPER}:sign`)
      .update(JSON.stringify(payload))
      .digest('hex');

    const proof = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const result = verifyClaim(proof, { type: 'reputation_min', threshold: 50 });
    assert.equal(result.valid, true);
    assert.equal(result.commitment, commitment);
  });
});
