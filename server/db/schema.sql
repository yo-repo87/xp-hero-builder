-- XP Hero Builder — accounts + persistent saves
-- Owned by role xpherobuilder, database xpherobuilder on shared_postgres.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email column

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE,               -- null allowed only if user has >=1 oauth identity
  password_hash text,                        -- null for OAuth-only users
  display_name  text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_must_have_login_method CHECK (password_hash IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE oauth_identities (
  id                serial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('google','facebook','discord')),
  provider_user_id  text NOT NULL,
  provider_email    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX oauth_identities_user_id_idx ON oauth_identities(user_id);

-- Short-lived JWT access tokens stay stateless (not stored); refresh tokens
-- are stored (hashed) so a logout/revoke/device-list is actually possible.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);

-- One row per saved build. `data` is exactly the app's existing
-- Export/Import JSON blob, unmodified — no schema translation needed.
CREATE TABLE saves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'My Build',
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saves_user_id_idx ON saves(user_id);
