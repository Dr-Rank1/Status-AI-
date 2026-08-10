-- Phase 33: Sovereign agent escrow contracts

CREATE TABLE IF NOT EXISTS agent_escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES ai_characters(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES agent_wallets(id) ON DELETE CASCADE,
  counterparty TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'token',
  purpose TEXT NOT NULL DEFAULT 'compute_hire',
  status TEXT NOT NULL DEFAULT 'locked',
  metadata JSONB NOT NULL DEFAULT '{}',
  salt TEXT,
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_escrows_character ON agent_escrows (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_escrows_status ON agent_escrows (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_escrows_contract ON agent_escrows (contract_address);

COMMENT ON TABLE agent_escrows IS 'Smart-contract-style escrow locks for sovereign agent compute hiring';
