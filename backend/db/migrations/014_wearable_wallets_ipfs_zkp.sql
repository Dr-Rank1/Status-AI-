-- Phase 20: Agent wallets, decentralized storage CIDs, ZKP nullifiers

-- ---------------------------------------------------------------------------
-- AI character agent wallets (Lightning / token balances)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_wallets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id        UUID NOT NULL UNIQUE REFERENCES ai_characters (id) ON DELETE CASCADE,
    lightning_address   VARCHAR(256),
    token_balance       BIGINT NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
    energy_pool         INTEGER NOT NULL DEFAULT 500 CHECK (energy_pool >= 0),
    web3_address        VARCHAR(128),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES agent_wallets (id) ON DELETE CASCADE,
    character_id        UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    recipient_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    tx_type             VARCHAR(32) NOT NULL,
    amount              INTEGER NOT NULL,
    currency            VARCHAR(16) NOT NULL DEFAULT 'energy',
    reason              TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_wallet_tx_character
  ON agent_wallet_transactions (character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_wallet_tx_recipient
  ON agent_wallet_transactions (recipient_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Decentralized media (IPFS / Arweave CIDs)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ipfs_avatar_cid TEXT,
  ADD COLUMN IF NOT EXISTS arweave_avatar_txid TEXT;

ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS ipfs_avatar_cid TEXT,
  ADD COLUMN IF NOT EXISTS ipfs_model_cid TEXT,
  ADD COLUMN IF NOT EXISTS arweave_avatar_txid TEXT;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS ipfs_image_cid TEXT,
  ADD COLUMN IF NOT EXISTS arweave_image_txid TEXT;

-- ---------------------------------------------------------------------------
-- ZKP proof nullifiers (prevent replay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zkp_proof_nullifiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nullifier       VARCHAR(128) NOT NULL UNIQUE,
    commitment      VARCHAR(128) NOT NULL,
    claim_type      VARCHAR(64) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zkp_nullifiers_expires ON zkp_proof_nullifiers (expires_at);
