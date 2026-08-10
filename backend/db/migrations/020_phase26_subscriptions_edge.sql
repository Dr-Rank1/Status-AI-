-- Phase 26: RevenueCat subscriptions & entitlements

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  revenuecat_app_user_id TEXT,
  revenuecat_subscriber_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  entitlements JSONB NOT NULL DEFAULT '[]',
  product_id TEXT,
  store TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_rc ON user_subscriptions (revenuecat_app_user_id);

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  app_user_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users (subscription_tier);

-- Pro tier: unlimited energy cap
COMMENT ON COLUMN users.subscription_tier IS 'free | pro — pro grants unlimited energy and 3D avatar access';
