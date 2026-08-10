-- Phase 11: pgvector long-term character memory (RAG)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS character_memories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    thread_id       UUID REFERENCES dm_threads (id) ON DELETE SET NULL,
    memory_type     VARCHAR(32) NOT NULL DEFAULT 'dm_turn',
    content         TEXT NOT NULL,
    embedding       vector(1536) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    importance      REAL NOT NULL DEFAULT 1.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_memories_user_character
  ON character_memories (user_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_character_memories_hnsw
  ON character_memories
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS model_3d_url TEXT;

-- Demo 3D model URLs for seed characters
UPDATE ai_characters SET model_3d_url = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb'
  WHERE handle = 'nova_star' AND model_3d_url IS NULL;
UPDATE ai_characters SET model_3d_url = 'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb'
  WHERE handle = 'kai_mori' AND model_3d_url IS NULL;
