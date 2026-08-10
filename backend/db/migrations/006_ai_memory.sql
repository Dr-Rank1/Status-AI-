-- Migration 006: AI context summaries for memory management
-- Run: psql -d status -f backend/db/migrations/006_ai_memory.sql

CREATE TABLE IF NOT EXISTS ai_context_summaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID REFERENCES ai_characters (id) ON DELETE CASCADE,
    thread_id       UUID REFERENCES dm_threads (id) ON DELETE CASCADE,
    context_type    VARCHAR(32) NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    message_count   INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, character_id, context_type, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_context_user ON ai_context_summaries (user_id);
