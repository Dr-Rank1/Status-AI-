-- Phase 25: Multi-tenant white-label architecture

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  redis_namespace TEXT NOT NULL,
  theme_config JSONB NOT NULL DEFAULT '{}',
  ai_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (slug, name, redis_namespace, theme_config)
VALUES (
  'default',
  'Status Default',
  'status:default',
  '{"appName":"Status","primaryColor":"#8B5CF6","accentColor":"#22D3EE","backgroundColor":"#0A0A0B","fontFamily":"Inter"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ── users ──────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username ON users (tenant_id, username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

-- ── ai_characters ──────────────────────────────────────────────────────
ALTER TABLE ai_characters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE ai_characters SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;
ALTER TABLE ai_characters ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE ai_characters DROP CONSTRAINT IF EXISTS ai_characters_handle_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_tenant_handle ON ai_characters (tenant_id, handle);
CREATE INDEX IF NOT EXISTS idx_characters_tenant ON ai_characters (tenant_id);

-- ── posts ──────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE posts SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;
ALTER TABLE posts ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_tenant ON posts (tenant_id);

-- ── dm_threads ─────────────────────────────────────────────────────────
ALTER TABLE dm_threads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE dm_threads t SET tenant_id = u.tenant_id
FROM users u WHERE t.user_id = u.id AND t.tenant_id IS NULL;
UPDATE dm_threads SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;
ALTER TABLE dm_threads ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_threads_tenant ON dm_threads (tenant_id);

-- ── dm_messages ──────────────────────────────────────────────────────────
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE dm_messages m SET tenant_id = t.tenant_id
FROM dm_threads t WHERE m.thread_id = t.id AND m.tenant_id IS NULL;
UPDATE dm_messages SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
WHERE tenant_id IS NULL;
ALTER TABLE dm_messages ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_messages_tenant ON dm_messages (tenant_id);

-- ── Row-Level Security ───────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

DROP POLICY IF EXISTS tenant_isolation_characters ON ai_characters;
CREATE POLICY tenant_isolation_characters ON ai_characters
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

DROP POLICY IF EXISTS tenant_isolation_posts ON posts;
CREATE POLICY tenant_isolation_posts ON posts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

DROP POLICY IF EXISTS tenant_isolation_dm_threads ON dm_threads;
CREATE POLICY tenant_isolation_dm_threads ON dm_threads
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

DROP POLICY IF EXISTS tenant_isolation_dm_messages ON dm_messages;
CREATE POLICY tenant_isolation_dm_messages ON dm_messages
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Force RLS for table owners (superuser bypass still applies at PG level)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_characters FORCE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
ALTER TABLE dm_threads FORCE ROW LEVEL SECURITY;
ALTER TABLE dm_messages FORCE ROW LEVEL SECURITY;
