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
  is_admin      boolean NOT NULL DEFAULT false, -- added 2026-10-07 for Forum moderation (delete/pin any thread or reply)
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

-- Forum (added 2026-10-07). Channels are a small fixed set (seeded below,
-- managed by hand — no admin UI to create more yet). Threads/replies store
-- raw user text; markdown rendering + @mention highlighting happen entirely
-- client-side, same discipline as every other user-text field in this app
-- (store raw, escape+format at render time).
CREATE TABLE forum_channels (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO forum_channels (id, name, description, sort_order) VALUES
  ('general', 'General', 'Anything goes — introductions, general chat about the game.', 0),
  ('builds', 'Builds & Strategy', 'Share hero/weapon builds, ask for advice, compare DPS.', 1),
  ('farming', 'Farming & Items', 'Where to find things, drop rates, farming routes.', 2),
  ('feedback', 'Bugs & Feedback', 'Report a bug on this site, or suggest a feature.', 3);

CREATE TABLE forum_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  text NOT NULL REFERENCES forum_channels(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL,
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(), -- bumped only on edit, not on new replies (see forum.js for how "last activity" sort is computed instead)
  edited_at   timestamptz
);
CREATE INDEX forum_threads_channel_id_idx ON forum_threads(channel_id);
CREATE INDEX forum_threads_user_id_idx ON forum_threads(user_id);

CREATE TABLE forum_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz
);
CREATE INDEX forum_replies_thread_id_idx ON forum_replies(thread_id);
CREATE INDEX forum_replies_user_id_idx ON forum_replies(user_id);

-- Covers both a thread-level and a reply-level reaction via nullable FKs;
-- exactly one of thread_id/reply_id is set (CHECK below). Two separate
-- partial unique indexes, not one combined UNIQUE across both nullable
-- columns — Postgres never treats two NULLs as equal for a plain UNIQUE
-- constraint, so a combined constraint would silently fail to stop
-- duplicate reactions on the same reply (thread_id is NULL on every such
-- row, so "equal" never holds there).
CREATE TABLE forum_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id   uuid REFERENCES forum_threads(id) ON DELETE CASCADE,
  reply_id    uuid REFERENCES forum_replies(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_reactions_one_target CHECK (
    (thread_id IS NOT NULL AND reply_id IS NULL) OR (thread_id IS NULL AND reply_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX forum_reactions_thread_unique ON forum_reactions(user_id, thread_id, emoji) WHERE thread_id IS NOT NULL;
CREATE UNIQUE INDEX forum_reactions_reply_unique ON forum_reactions(user_id, reply_id, emoji) WHERE reply_id IS NOT NULL;
CREATE INDEX forum_reactions_thread_id_idx ON forum_reactions(thread_id);
CREATE INDEX forum_reactions_reply_id_idx ON forum_reactions(reply_id);
