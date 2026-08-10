-- Phase 50: Multi-epoch chrono-vector storage (additive)
-- Allows agents/processes to index & query memories by epoch_id across loop iterations.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS multi_epoch_memories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epoch_id        INTEGER NOT NULL DEFAULT 0,
    phase           INTEGER,
    kind            VARCHAR(64) NOT NULL DEFAULT 'memory',
    content         TEXT NOT NULL,
    embedding       vector(32) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multi_epoch_memories_epoch
  ON multi_epoch_memories (epoch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_multi_epoch_memories_phase
  ON multi_epoch_memories (phase, epoch_id)
  WHERE phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multi_epoch_memories_hnsw
  ON multi_epoch_memories
  USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE multi_epoch_memories IS
  'Phase 50 multi-epoch chrono-vector store — past/present/future loop iteration recall';
