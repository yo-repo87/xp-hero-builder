# xpherobuilder-server

Optional account/persistence backend for XP Hero Builder. The static site
works fully without this — local `localStorage` + Export/Import remains the
default. This only powers: sign-up/sign-in (email+password, Google,
Facebook, Discord) and syncing a build to Postgres so it follows the user
across devices/browsers.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run dev
```

## Production (this box)

Runs as Docker container `xpherobuilder_backend` on the `shared-postgres-net`
network (so it can reach `shared_postgres` by hostname), publishing host
port `3141`. Rebuild + redeploy after a code change:

```bash
cd server
docker build -t xpherobuilder-backend:latest .
docker rm -f xpherobuilder_backend
docker run -d --name xpherobuilder_backend \
  --network shared-postgres-net \
  -p 3141:4000 \
  --restart unless-stopped \
  --env-file .env \
  xpherobuilder-backend:latest
```

`server/.env` is gitignored (holds the real DB password, JWT secret, and
OAuth client secrets) — see `.env.example` for every var it needs.

Reverse-proxied at `https://xpherobuilder-api.arc-it.uk` via
nginx-proxy-manager (Forward Hostname/IP `192.168.50.211`, Forward Port
`3141` — same host-IP-plus-published-port pattern every other proxy host on
this box uses, e.g. n8n's own entry is `192.168.50.211:5680`).

## Database

Database `xpherobuilder`, owned by role `xpherobuilder`, lives on the
`shared_postgres` container (`shared-postgres-net`) — the same shared
Postgres instance already hosting `dollartree`/`mtg`/`yugioh`/`yourspace`/
`financemgr`/`inventory`, one DB + same-named owner role per app, same
convention followed here. Schema: `users`, `oauth_identities`,
`refresh_tokens`, `saves` — see `db/schema.sql` (the exact statements used
to create it). There's no migration framework wired up yet — that file is
a point-in-time record of what was run by hand once, not something
re-runnable against an already-migrated database; if the schema needs to
change, write and apply the `ALTER` by hand too until this grows enough to
justify a real migration tool.

## Auth model

- Access tokens: short-lived (15m) stateless JWTs, `Authorization: Bearer`.
- Refresh tokens: opaque random tokens, stored **hashed** in
  `refresh_tokens`, delivered as an httpOnly `SameSite=None; Secure` cookie
  scoped to `/auth` (cross-site because the frontend origin
  `yo-repo87.github.io` differs from this API's origin). Rotated on every
  use — old token is revoked the instant a new one is issued.
- OAuth (`GET /auth/:provider`, `GET /auth/:provider/callback`): standard
  authorization-code flow, CSRF-protected via a double-submit state cookie.
  A provider only appears "configured" (`GET /auth/providers`) once both
  its `_CLIENT_ID`/`_CLIENT_SECRET` env vars are set — leaving a provider's
  vars blank fully and safely disables it, frontend included.
- `GET /auth/:provider/callback` finds-or-creates a user, links the
  identity in `oauth_identities`, and if the OAuth profile's email matches
  an existing email/password account, links to that same account (so a
  user isn't accidentally split into two accounts by signing in a
  different way with the same email).

## API surface

```
GET  /health
GET  /auth/providers                  -> { email, google, facebook, discord }
POST /auth/register   { email, password, displayName? }
POST /auth/login      { email, password }
POST /auth/refresh    (reads refresh cookie)
POST /auth/logout     (reads refresh cookie)
GET  /auth/me          [Bearer]
GET  /auth/:provider              -> 302 to provider
GET  /auth/:provider/callback     -> 302 back to FRONTEND_ORIGIN

GET    /saves         [Bearer]  -> list (no `data` payload)
POST   /saves         [Bearer]  { name?, data }
GET    /saves/:id     [Bearer]
PUT    /saves/:id     [Bearer]  { name?, data? }
DELETE /saves/:id     [Bearer]
```

`data` on a save is exactly the app's existing Export/Import JSON blob —
no translation layer, so the frontend's existing
`State.export()`/`State.import()` logic is reusable as-is for the sync
path.
