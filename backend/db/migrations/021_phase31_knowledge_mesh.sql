-- Phase 31: Global knowledge mesh (non-PII insights)

CREATE TABLE IF NOT EXISTS knowledge_mesh_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES ai_characters(id) ON DELETE SET NULL,
  tenant_id UUID,
  topic TEXT NOT NULL,
  fandom TEXT NOT NULL DEFAULT 'general',
  tags JSONB NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  abstraction TEXT NOT NULL DEFAULT 'non_pii_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_mesh_fandom ON knowledge_mesh_insights (fandom, importance DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_mesh_character ON knowledge_mesh_insights (character_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_mesh_created ON knowledge_mesh_insights (created_at DESC);

COMMENT ON TABLE knowledge_mesh_insights IS 'Abstracted non-PII insights shared across characters (Neo4j optional sync)';
