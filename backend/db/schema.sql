-- Status — initial PostgreSQL schema
-- Run: psql -d status -f backend/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users (human players)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(32)  NOT NULL UNIQUE,
    email           VARCHAR(255) UNIQUE,
    password_hash   TEXT,
    display_name    VARCHAR(64)  NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    reputation      INTEGER      NOT NULL DEFAULT 0,
    follower_count  INTEGER      NOT NULL DEFAULT 0,
    following_count INTEGER      NOT NULL DEFAULT 0,
    is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);

-- ---------------------------------------------------------------------------
-- AI Characters (bot personas in fandoms)
-- ---------------------------------------------------------------------------
CREATE TABLE ai_characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(64)  NOT NULL,
    handle          VARCHAR(32)  NOT NULL UNIQUE,
    avatar_url      TEXT,
    bio             TEXT,
    fandom          VARCHAR(64)  NOT NULL,
    personality     JSONB        NOT NULL DEFAULT '{}',
    -- OpenAI/Anthropic system prompt fragments, tone sliders, etc.
    follower_count  INTEGER      NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_characters_fandom ON ai_characters (fandom);
CREATE INDEX idx_ai_characters_handle ON ai_characters (handle);

-- ---------------------------------------------------------------------------
-- User ↔ Character relationships (follows, affinity, reputation deltas)
-- ---------------------------------------------------------------------------
CREATE TABLE character_relationships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID         NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    affinity        INTEGER      NOT NULL DEFAULT 0 CHECK (affinity BETWEEN -100 AND 100),
    is_following    BOOLEAN      NOT NULL DEFAULT FALSE,
    last_interaction_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, character_id)
);

CREATE INDEX idx_character_relationships_user ON character_relationships (user_id);

-- ---------------------------------------------------------------------------
-- Posts (authored by users or AI characters)
-- ---------------------------------------------------------------------------
CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id  UUID REFERENCES users (id) ON DELETE SET NULL,
    author_character_id UUID REFERENCES ai_characters (id) ON DELETE SET NULL,
    content         TEXT         NOT NULL,
    media_urls      TEXT[]       NOT NULL DEFAULT '{}',
    image_url       TEXT,
    like_count      INTEGER      NOT NULL DEFAULT 0,
    reply_count     INTEGER      NOT NULL DEFAULT 0,
    repost_count    INTEGER      NOT NULL DEFAULT 0,
    fandom          VARCHAR(64),
    parent_post_id  UUID REFERENCES posts (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (
        (author_user_id IS NOT NULL AND author_character_id IS NULL)
        OR (author_user_id IS NULL AND author_character_id IS NOT NULL)
    )
);

CREATE INDEX idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX idx_posts_fandom ON posts (fandom);
CREATE INDEX idx_posts_author_user ON posts (author_user_id);
CREATE INDEX idx_posts_author_character ON posts (author_character_id);

-- ---------------------------------------------------------------------------
-- Direct messages (1:1 threads between user and character)
-- ---------------------------------------------------------------------------
CREATE TABLE dm_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID         NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, character_id)
);

CREATE TABLE dm_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID         NOT NULL REFERENCES dm_threads (id) ON DELETE CASCADE,
    sender_type     VARCHAR(16)  NOT NULL CHECK (sender_type IN ('user', 'character')),
    content         TEXT         NOT NULL,
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dm_messages_thread ON dm_messages (thread_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Energy state (daily action budget per user)
-- ---------------------------------------------------------------------------
CREATE TABLE energy_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    energy_remaining INTEGER     NOT NULL DEFAULT 100 CHECK (energy_remaining >= 0),
    energy_max      INTEGER      NOT NULL DEFAULT 100,
    reset_at        DATE         NOT NULL DEFAULT CURRENT_DATE,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ai_characters_updated_at
    BEFORE UPDATE ON ai_characters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER character_relationships_updated_at
    BEFORE UPDATE ON character_relationships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER energy_state_updated_at
    BEFORE UPDATE ON energy_state
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed data (dev only)
-- ---------------------------------------------------------------------------
INSERT INTO users (username, display_name, bio, reputation)
VALUES ('player_one', 'Player One', 'Just vibing across fandoms.', 42);

INSERT INTO ai_characters (name, handle, fandom, bio, personality, follower_count)
VALUES
    ('Nova Starling', 'nova_star', 'Stellar Chronicles',
     'Captain of the Nebula Fleet. Bold, witty, fiercely loyal.',
     '{"tone": "confident", "traits": ["leader", "sarcastic"]}', 12800),
    ('Kai Mori', 'kai_mori', 'Shadow District',
     'Street-smart detective with a soft spot for cats.',
     '{"tone": "dry", "traits": ["observant", "guarded"]}', 9400);

INSERT INTO posts (author_character_id, content, fandom, like_count, reply_count)
SELECT id, 'The nebula never sleeps. Neither do I. ☄️', fandom, 312, 28
FROM ai_characters WHERE handle = 'nova_star';

INSERT INTO posts (author_character_id, content, fandom, like_count, reply_count)
SELECT id, 'Found another clue. This city keeps its secrets close.', fandom, 189, 14
FROM ai_characters WHERE handle = 'kai_mori';

INSERT INTO energy_state (user_id)
SELECT id FROM users WHERE username = 'player_one';

CREATE TABLE energy_purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id      VARCHAR(64) NOT NULL,
    energy_added    INTEGER NOT NULL,
    receipt_token   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_energy_purchases_user ON energy_purchases (user_id);

CREATE TABLE ai_context_summaries (
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

CREATE INDEX idx_ai_context_user ON ai_context_summaries (user_id);

CREATE TABLE analytics_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
    event_type  VARCHAR(64) NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_type ON analytics_events (event_type);
CREATE INDEX idx_analytics_events_user ON analytics_events (user_id);
CREATE INDEX idx_analytics_events_created ON analytics_events (created_at DESC);

UPDATE users SET is_admin = TRUE WHERE username = 'player_one';

-- Phase 10: community platform (see migrations/008_community_platform.sql)
ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS creator_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS creator_energy_earned INTEGER NOT NULL DEFAULT 0;

UPDATE ai_characters SET is_published = TRUE WHERE creator_user_id IS NULL;

CREATE TABLE IF NOT EXISTS creator_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    reward_type VARCHAR(32) NOT NULL,
    energy_amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES group_threads (id) ON DELETE CASCADE,
    member_type VARCHAR(16) NOT NULL CHECK (member_type IN ('user', 'character')),
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    character_id UUID REFERENCES ai_characters (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (member_type = 'user' AND user_id IS NOT NULL AND character_id IS NULL)
        OR (member_type = 'character' AND character_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_user ON group_members (group_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_character ON group_members (group_id, character_id) WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES group_threads (id) ON DELETE CASCADE,
    sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('user', 'character')),
    sender_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    sender_character_id UUID REFERENCES ai_characters (id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS narrative_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(256) NOT NULL,
    global_prompt TEXT NOT NULL,
    fandom VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    content_type VARCHAR(16) NOT NULL,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    categories JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 11: pgvector long-term memory (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS character_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    thread_id UUID REFERENCES dm_threads (id) ON DELETE SET NULL,
    memory_type VARCHAR(32) NOT NULL DEFAULT 'dm_turn',
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    importance REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_memories_user_character
  ON character_memories (user_id, character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_character_memories_hnsw
  ON character_memories
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS model_3d_url TEXT;

-- Phase 12: live streaming
CREATE TABLE IF NOT EXISTS live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    host_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    title VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'live',
    livekit_room VARCHAR(128) NOT NULL,
    viewer_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_super_chat BOOLEAN NOT NULL DEFAULT FALSE,
    energy_spent INTEGER NOT NULL DEFAULT 0,
    pinned_until TIMESTAMPTZ,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS simli_face_id VARCHAR(128);
