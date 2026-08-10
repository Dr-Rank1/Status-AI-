-- Migration 005: JWT auth, media fields, energy store audit
-- Run: psql -d status -f backend/db/migrations/005_auth_media_store.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Backfill image_url from first media_urls entry where present
UPDATE posts
SET image_url = media_urls[1]
WHERE image_url IS NULL
  AND array_length(media_urls, 1) > 0;

CREATE TABLE IF NOT EXISTS energy_purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id      VARCHAR(64) NOT NULL,
    energy_added    INTEGER NOT NULL,
    receipt_token   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_energy_purchases_user ON energy_purchases (user_id);

-- Dev account: player_one / password123
-- bcrypt hash generated at 10 rounds
UPDATE users
SET email = 'player@status.dev',
    password_hash = '$2b$10$ww1SfZhhVrpFlIN33/sw8OTPSEeHdeuehkKWsqv5fkHxqYLDKio/.'
WHERE username = 'player_one' AND password_hash IS NULL;
