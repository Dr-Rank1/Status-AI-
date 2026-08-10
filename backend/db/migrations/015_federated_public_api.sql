-- Phase 21: Federated learning, OAuth public API clients, webhooks

-- Federated learning rounds
CREATE TABLE IF NOT EXISTS federated_rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_number    INTEGER NOT NULL UNIQUE,
    status          VARCHAR(32) NOT NULL DEFAULT 'open',
    baseline_version INTEGER NOT NULL DEFAULT 1,
    contributor_count INTEGER NOT NULL DEFAULT 0,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS federated_contributions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id        UUID NOT NULL REFERENCES federated_rounds (id) ON DELETE CASCADE,
    user_commitment VARCHAR(128) NOT NULL,
    encrypted_payload TEXT NOT NULL,
    sample_count    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (round_id, user_commitment)
);

CREATE INDEX IF NOT EXISTS idx_federated_contributions_round
  ON federated_contributions (round_id);

CREATE TABLE IF NOT EXISTS federated_global_weights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version         INTEGER NOT NULL UNIQUE,
    weights         JSONB NOT NULL,
    contributor_count INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OAuth2 public API clients
CREATE TABLE IF NOT EXISTS api_oauth_clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       VARCHAR(64) NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    name            VARCHAR(128) NOT NULL,
    owner_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    scopes          TEXT[] NOT NULL DEFAULT '{feed:read,characters:read}',
    rate_limit_max  INTEGER NOT NULL DEFAULT 120,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_oauth_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       VARCHAR(64) NOT NULL REFERENCES api_oauth_clients (client_id) ON DELETE CASCADE,
    token_hash      VARCHAR(128) NOT NULL UNIQUE,
    scopes          TEXT[] NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Developer webhooks
CREATE TABLE IF NOT EXISTS developer_webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       VARCHAR(64) NOT NULL REFERENCES api_oauth_clients (client_id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    secret_hash     TEXT NOT NULL,
    events          TEXT[] NOT NULL DEFAULT '{narrative.event,character.status}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES developer_webhooks (id) ON DELETE CASCADE,
    event_type      VARCHAR(64) NOT NULL,
    payload         JSONB NOT NULL,
    status_code     INTEGER,
    success         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON webhook_deliveries (webhook_id, created_at DESC);
