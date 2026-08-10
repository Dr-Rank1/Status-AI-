-- Phase 34: MCP Multi Round-Trip Request (MRTR) durable requestState

CREATE TABLE IF NOT EXISTS mcp_mrtr_states (
  id UUID PRIMARY KEY,
  user_id UUID,
  character_id UUID,
  status TEXT NOT NULL DEFAULT 'awaiting_human',
  request_state JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_mrtr_status ON mcp_mrtr_states (status);
CREATE INDEX IF NOT EXISTS idx_mcp_mrtr_expires ON mcp_mrtr_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_mrtr_user ON mcp_mrtr_states (user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE mcp_mrtr_states IS 'Stateless MCP MRTR pause/resume state shared across serverless swarm instances';
