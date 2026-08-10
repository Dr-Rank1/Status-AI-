-- Phase 14: spatial scenes, processed context, geofencing

CREATE TABLE IF NOT EXISTS spatial_scenes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID NOT NULL REFERENCES ai_characters (id) ON DELETE CASCADE,
    scene_key       VARCHAR(128) NOT NULL,
    anchor_label    VARCHAR(128),
    world_position  JSONB NOT NULL DEFAULT '{}',
    world_rotation  JSONB NOT NULL DEFAULT '{}',
    scale           REAL NOT NULL DEFAULT 1.0,
    is_persistent   BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, scene_key)
);

CREATE INDEX IF NOT EXISTS idx_spatial_scenes_user ON spatial_scenes (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS spatial_context_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID REFERENCES ai_characters (id) ON DELETE SET NULL,
    scene_id        UUID REFERENCES spatial_scenes (id) ON DELETE SET NULL,
    proxemic_zone   VARCHAR(32) NOT NULL DEFAULT 'personal',
    room_type       VARCHAR(64),
    lighting_level  VARCHAR(32),
    furniture_density VARCHAR(32),
    ambient_mood    VARCHAR(64),
    residency_region VARCHAR(16) NOT NULL DEFAULT 'local',
    processed_only  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spatial_context_user ON spatial_context_snapshots (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS spatial_geofence_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    zone_id         VARCHAR(64) NOT NULL,
    event_type      VARCHAR(32) NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_characters
  ADD COLUMN IF NOT EXISTS spatial_scene_enabled BOOLEAN NOT NULL DEFAULT TRUE;
