-- Phase 35: Temporal knowledge graph (Postgres fallback) + agent economy ledger

CREATE TABLE IF NOT EXISTS temporal_memories (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL,
  user_id UUID,
  content TEXT NOT NULL,
  importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  previous_memory_id UUID,
  evolution_reason TEXT,
  topics JSONB NOT NULL DEFAULT '[]',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temporal_memories_char_time
  ON temporal_memories (character_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS temporal_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  character_id UUID NOT NULL,
  affinity DOUBLE PRECISION NOT NULL DEFAULT 0,
  depth INTEGER NOT NULL DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temporal_relations_pair
  ON temporal_relations (user_id, character_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS agent_economy_ledger (
  id UUID PRIMARY KEY,
  payer_role TEXT NOT NULL,
  payee_role TEXT NOT NULL,
  payer_character_id UUID,
  payee_character_id UUID,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'token',
  method TEXT NOT NULL,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economy_ledger_created
  ON agent_economy_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economy_ledger_edge
  ON agent_economy_ledger (payer_role, payee_role);

COMMENT ON TABLE temporal_memories IS 'Chronological memory versions for temporal KG RAG (Neo4j mirror)';
COMMENT ON TABLE agent_economy_ledger IS 'HTTP 402 MCP micro-transactions between autonomous agents';
