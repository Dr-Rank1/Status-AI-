-- Phase 36: zk agent governance nullifiers + consensus audit log

CREATE TABLE IF NOT EXISTS zk_agent_proof_nullifiers (
  nullifier TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  commitment TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zk_agent_proof_expires
  ON zk_agent_proof_nullifiers (expires_at);

CREATE TABLE IF NOT EXISTS consensus_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL,
  term INTEGER NOT NULL DEFAULT 0,
  entry_index INTEGER,
  command JSONB NOT NULL DEFAULT '{}',
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consensus_audit_created
  ON consensus_audit_log (created_at DESC);

COMMENT ON TABLE zk_agent_proof_nullifiers IS 'zk-SNARK agent governance nullifiers (no private witness stored)';
COMMENT ON TABLE consensus_audit_log IS 'Raft consensus committed entries for planetary mesh';
