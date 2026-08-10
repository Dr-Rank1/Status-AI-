-- Phase 38: Immutable agent audit ledger

CREATE TABLE IF NOT EXISTS agent_audit_ledger (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT,
  decision TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  character_id UUID,
  user_id UUID,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON agent_audit_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_type ON agent_audit_ledger (event_type);

-- Append-only intent: revoke UPDATE/DELETE from app role when provisioned
COMMENT ON TABLE agent_audit_ledger IS 'Hash-chained immutable forensic audit of agent decisions';
