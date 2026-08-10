-- Phase 19: E2EE DM payloads + fine-tuning export metadata

ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS encryption_meta JSONB;

CREATE INDEX IF NOT EXISTS idx_dm_messages_encrypted
  ON dm_messages (is_encrypted)
  WHERE is_encrypted = TRUE;

CREATE TABLE IF NOT EXISTS e2ee_device_keys (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id             VARCHAR(128) NOT NULL,
  identity_key_public   TEXT NOT NULL,
  signed_prekey_public  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_e2ee_device_keys_user ON e2ee_device_keys (user_id);
