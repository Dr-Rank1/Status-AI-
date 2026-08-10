/**
 * E2EE device key registration (Signal/Olm bridge stores keys server-side for discovery).
 * Message ciphertext is opaque — the server never decrypts payloads.
 */

import { query } from '../config/database.js';

export async function registerDeviceKey({ userId, deviceId, identityKeyPublic, signedPrekeyPublic }) {
  const { rows } = await query(
    `INSERT INTO e2ee_device_keys (user_id, device_id, identity_key_public, signed_prekey_public, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET
       identity_key_public = EXCLUDED.identity_key_public,
       signed_prekey_public = EXCLUDED.signed_prekey_public,
       updated_at = NOW()
     RETURNING id, user_id, device_id, identity_key_public, signed_prekey_public, created_at, updated_at`,
    [userId, deviceId, identityKeyPublic, signedPrekeyPublic ?? null],
  );

  return rows[0];
}

export async function listDeviceKeys(userId) {
  const { rows } = await query(
    `SELECT device_id, identity_key_public, signed_prekey_public, updated_at
     FROM e2ee_device_keys
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );

  return rows;
}
