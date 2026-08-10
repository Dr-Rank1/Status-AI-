-- Phase 12: live streaming, super chat, TTS broadcast

CREATE TABLE IF NOT EXISTS live_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    host_user_id    UUID REFERENCES users (id) ON DELETE SET NULL,
    title           VARCHAR(256) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'live',
    livekit_room    VARCHAR(128) NOT NULL,
    viewer_count    INTEGER NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_character ON live_sessions (character_id, status);

CREATE TABLE IF NOT EXISTS live_chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_super_chat   BOOLEAN NOT NULL DEFAULT FALSE,
    energy_spent    INTEGER NOT NULL DEFAULT 0,
    pinned_until    TIMESTAMPTZ,
    acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_chat_session ON live_chat_messages (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_chat_pinned
  ON live_chat_messages (session_id, pinned_until DESC NULLS LAST)
  WHERE is_super_chat = TRUE AND acknowledged = FALSE;

ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS simli_face_id VARCHAR(128);
