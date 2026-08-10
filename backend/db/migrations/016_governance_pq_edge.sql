-- Phase 22: AI governance, compliance audit, post-quantum key registry

CREATE TABLE IF NOT EXISTS ai_governance_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(64) NOT NULL,
    user_id         UUID REFERENCES users (id) ON DELETE SET NULL,
    character_id    UUID REFERENCES ai_characters (id) ON DELETE SET NULL,
    model_provider  VARCHAR(64),
    model_name      VARCHAR(128),
    decision        JSONB NOT NULL DEFAULT '{}',
    data_provenance JSONB NOT NULL DEFAULT '{}',
    human_oversight BOOLEAN NOT NULL DEFAULT FALSE,
    regulatory_tags TEXT[] NOT NULL DEFAULT '{EU_AI_ACT,GDPR}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_governance_logs_created
  ON ai_governance_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_governance_logs_user
  ON ai_governance_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_consent_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    consent_type    VARCHAR(64) NOT NULL,
    granted         BOOLEAN NOT NULL,
    policy_version  VARCHAR(32) NOT NULL DEFAULT '2026-01',
    ip_hash         VARCHAR(128),
    metadata        JSONB NOT NULL DEFAULT '{}',
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consent_user
  ON user_consent_records (user_id, consent_type, recorded_at DESC);

CREATE TABLE IF NOT EXISTS pq_device_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id       VARCHAR(128) NOT NULL,
    kyber_public_key TEXT NOT NULL,
    algorithm       VARCHAR(32) NOT NULL DEFAULT 'kyber768',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS ai_anomaly_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_type    VARCHAR(64) NOT NULL,
    severity        VARCHAR(16) NOT NULL DEFAULT 'warning',
    provider        VARCHAR(64),
    mode            VARCHAR(32),
    details         JSONB NOT NULL DEFAULT '{}',
    alerted         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_anomaly_created
  ON ai_anomaly_events (created_at DESC);
