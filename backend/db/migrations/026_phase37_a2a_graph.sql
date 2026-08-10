-- Phase 37: A2A enterprise cards + graph run checkpoints (optional durability)

CREATE TABLE IF NOT EXISTS a2a_agent_cards (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  role TEXT,
  endpoint TEXT,
  capabilities JSONB NOT NULL DEFAULT '[]',
  enterprise BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS graph_run_checkpoints (
  run_id UUID PRIMARY KEY,
  graph_id TEXT NOT NULL,
  status TEXT NOT NULL,
  node TEXT,
  loop INTEGER NOT NULL DEFAULT 0,
  checkpoint JSONB NOT NULL DEFAULT '{}',
  user_id UUID,
  character_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_checkpoints_status ON graph_run_checkpoints (status);

COMMENT ON TABLE a2a_agent_cards IS 'Agent-to-Agent discovery cards (ACP)';
COMMENT ON TABLE graph_run_checkpoints IS 'LangGraph-style resumable workflow checkpoints';
