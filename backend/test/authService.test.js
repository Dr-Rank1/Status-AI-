import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
} from '../src/services/authService.js';

describe('authService', () => {
  beforeEach(() => {
    process.env.PQ_AUTH_ENABLED = 'false';
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('test-password-123');
    assert.ok(hash.startsWith('$2'));
    assert.equal(await comparePassword('test-password-123', hash), true);
    assert.equal(await comparePassword('wrong-password', hash), false);
  });

  it('signs and verifies JWT payloads', () => {
    const user = { id: '00000000-0000-0000-0000-000000000001', username: 'tester' };
    const token = signToken(user);
    const payload = verifyToken(token);
    assert.equal(payload.userId, user.id);
    assert.equal(payload.username, user.username);
  });
});
