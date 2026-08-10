-- Phase 10: user-created characters, group chats, narrative events, creator rewards

-- User-created characters
ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS creator_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS creator_energy_earned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ai_characters_creator ON ai_characters (creator_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_characters_published ON ai_characters (is_published) WHERE is_published = TRUE;

-- Backfill: seed/admin characters are published
UPDATE ai_characters SET is_published = TRUE WHERE creator_user_id IS NULL;

-- Creator reward ledger
CREATE TABLE IF NOT EXISTS creator_rewards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    actor_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    reward_type     VARCHAR(32) NOT NULL,
    energy_amount   INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_rewards_creator ON creator_rewards (creator_user_id);

-- Multi-user group chat threads
CREATE TABLE IF NOT EXISTS group_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(128) NOT NULL,
    created_by      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        UUID NOT NULL REFERENCES group_threads (id) ON DELETE CASCADE,
    member_type     VARCHAR(16) NOT NULL CHECK (member_type IN ('user', 'character')),
    user_id         UUID REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID REFERENCES ai_characters (id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (member_type = 'user' AND user_id IS NOT NULL AND character_id IS NULL)
        OR (member_type = 'character' AND character_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_user
  ON group_members (group_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_character
  ON group_members (group_id, character_id) WHERE character_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members (group_id);

CREATE TABLE IF NOT EXISTS group_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id            UUID NOT NULL REFERENCES group_threads (id) ON DELETE CASCADE,
    sender_type         VARCHAR(16) NOT NULL CHECK (sender_type IN ('user', 'character')),
    sender_user_id      UUID REFERENCES users (id) ON DELETE SET NULL,
    sender_character_id UUID REFERENCES ai_characters (id) ON DELETE SET NULL,
    content             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages (group_id, created_at DESC);

-- Global narrative events
CREATE TABLE IF NOT EXISTS narrative_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(256) NOT NULL,
    global_prompt   TEXT NOT NULL,
    fandom          VARCHAR(64),
    status          VARCHAR(32) NOT NULL DEFAULT 'active',
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_events_active
  ON narrative_events (status, triggered_at DESC) WHERE status = 'active';

-- Moderation audit log
CREATE TABLE IF NOT EXISTS moderation_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users (id) ON DELETE SET NULL,
    content_type    VARCHAR(16) NOT NULL,
    flagged         BOOLEAN NOT NULL DEFAULT FALSE,
    categories      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_user ON moderation_logs (user_id);
