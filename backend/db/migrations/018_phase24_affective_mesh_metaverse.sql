-- Phase 24: Affective biometrics, P2P mesh sessions, metaverse sync

CREATE TABLE IF NOT EXISTS affective_biometric_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES ai_characters(id) ON DELETE SET NULL,
  hrv_score NUMERIC(5, 3),
  facial_valence NUMERIC(4, 3),
  voice_stress NUMERIC(4, 3),
  empathy_level NUMERIC(4, 3),
  pacing_hint TEXT,
  processed_only BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affective_events_user ON affective_biometric_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mesh_peer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cluster_id TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_peer_id ON mesh_peer_sessions (peer_id);
CREATE INDEX IF NOT EXISTS idx_mesh_cluster ON mesh_peer_sessions (cluster_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS mesh_gossip_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  origin_peer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mesh_gossip_cluster ON mesh_gossip_records (cluster_id, record_type, created_at DESC);

CREATE TABLE IF NOT EXISTS metaverse_sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES ai_characters(id) ON DELETE CASCADE,
  engine_type TEXT NOT NULL DEFAULT 'generic',
  export_format TEXT NOT NULL DEFAULT 'vrm',
  sync_token TEXT NOT NULL UNIQUE,
  manifest JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metaverse_sync_token ON metaverse_sync_sessions (sync_token);
CREATE INDEX IF NOT EXISTS idx_metaverse_sync_user ON metaverse_sync_sessions (user_id, created_at DESC);
