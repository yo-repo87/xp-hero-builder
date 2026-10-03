import crypto from 'node:crypto';
import { Router } from 'express';
import pool from '../db.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_MS,
} from '../auth/tokens.js';
import { configuredProviders, buildAuthorizeUrl, exchangeCodeForProfile } from '../auth/oauth.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

// Cross-site cookie (frontend is on a different origin from this API),
// so it must be SameSite=None + Secure; the browser then still attaches
// it on fetch() calls from the frontend as long as those calls use
// credentials: 'include' and CORS allows credentials (see app.js).
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  path: '/auth',
};
const STATE_COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'none', maxAge: 5 * 60 * 1000, path: '/auth' };

// FRONTEND_ORIGIN is the bare origin (scheme+host, no path) — that's all
// CORS's Origin header ever contains, so app.js's cors() config uses it
// as-is. But the actual page GitHub Pages serves for a *project* repo
// (not a username.github.io root repo) lives under a /reponame/ path —
// hitting the bare origin alone 404s ("There isn't a GitHub Pages site
// here"). OAuth callback redirects need the real page URL, so they use
// this instead, which defaults to FRONTEND_ORIGIN + '/' only if
// FRONTEND_REDIRECT_URL isn't set (keeps a plain root-domain deployment
// working without extra config, while this app's own real deployment
// sets FRONTEND_REDIRECT_URL explicitly in .env).
function frontendUrl() {
  const base = process.env.FRONTEND_REDIRECT_URL || process.env.FRONTEND_ORIGIN;
  return base.endsWith('/') ? base : `${base}/`;
}

function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, emailVerified: row.email_verified };
}

async function issueSession(res, userId, userAgent) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId),
    issueRefreshToken(userId, userAgent),
  ]);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTS);
  return accessToken;
}

router.get('/providers', (req, res) => {
  const oauth = configuredProviders();
  res.json({ email: true, google: oauth.includes('google'), facebook: oauth.includes('facebook'), discord: oauth.includes('discord') });
});

router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'email and a password of at least 8 characters are required' });
  }
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)
       RETURNING id, email, display_name, email_verified`,
      [email, passwordHash, displayName || email.split('@')[0]]
    );
    const user = rows[0];
    const accessToken = await issueSession(res, user.id, req.headers['user-agent']);
    res.status(201).json({ accessToken, user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
    console.error('register failed', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

  const accessToken = await issueSession(res, user.id, req.headers['user-agent']);
  res.json({ accessToken, user: publicUser(user) });
});

router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!raw) return res.status(401).json({ error: 'No refresh token' });

  const result = await rotateRefreshToken(raw, req.headers['user-agent']);
  if (!result) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
    return res.status(401).json({ error: 'Refresh token invalid or expired' });
  }
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTS);
  const accessToken = signAccessToken(result.userId);
  res.json({ accessToken });
});

router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (raw) await revokeRefreshToken(raw);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, email, display_name, email_verified FROM users WHERE id = $1`, [req.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(rows[0]) });
});

// --- OAuth (google/facebook/discord) --------------------------------------

router.get('/:provider', (req, res) => {
  const { provider } = req.params;
  if (!configuredProviders().includes(provider)) return res.status(404).json({ error: 'Provider not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(`xhb_oauth_state_${provider}`, state, STATE_COOKIE_OPTS);
  res.redirect(buildAuthorizeUrl(provider, state));
});

router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state } = req.query;
  const cookieName = `xhb_oauth_state_${provider}`;
  const expectedState = req.cookies?.[cookieName];
  res.clearCookie(cookieName, { path: '/auth' });

  if (!configuredProviders().includes(provider) || !code || !state || state !== expectedState) {
    return res.redirect(`${frontendUrl()}#auth=error`);
  }

  try {
    const profile = await exchangeCodeForProfile(provider, code);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2`,
        [provider, profile.providerUserId]
      );

      let userId;
      if (existing.rows[0]) {
        userId = existing.rows[0].user_id;
      } else if (profile.email) {
        // Link to an existing email/password account with the same
        // verified email if one exists, otherwise create a new user.
        const byEmail = await client.query(`SELECT id FROM users WHERE email = $1`, [profile.email]);
        if (byEmail.rows[0]) {
          userId = byEmail.rows[0].id;
        } else {
          const created = await client.query(
            `INSERT INTO users (email, display_name, email_verified) VALUES ($1, $2, true) RETURNING id`,
            [profile.email, profile.name]
          );
          userId = created.rows[0].id;
        }
        await client.query(
          `INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email) VALUES ($1, $2, $3, $4)`,
          [userId, provider, profile.providerUserId, profile.email]
        );
      } else {
        const created = await client.query(
          `INSERT INTO users (display_name, email_verified) VALUES ($1, false) RETURNING id`,
          [profile.name]
        );
        userId = created.rows[0].id;
        await client.query(
          `INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email) VALUES ($1, $2, $3, $4)`,
          [userId, provider, profile.providerUserId, null]
        );
      }
      await client.query('COMMIT');

      // The refresh cookie below is still set as the normal long-lived
      // session mechanism, but mobile browsers (Safari in particular) can
      // silently refuse to send a just-set cross-site cookie back on the
      // frontend's own subsequent fetch(credentials:'include') call to
      // /auth/refresh — meaning the OAuth exchange above succeeds server-
      // side, but the browser never actually looks signed in. Handing the
      // access token straight back via the URL *fragment* (never sent to
      // any server, unlike a query string) lets the frontend complete
      // sign-in immediately, with no dependency on that cookie read at
      // all. See CLAUDE.md "OAuth mobile sign-in" for the full writeup.
      const accessToken = await issueSession(res, userId, req.headers['user-agent']);
      res.redirect(`${frontendUrl()}#auth=success&token=${encodeURIComponent(accessToken)}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`${provider} OAuth callback failed`, err);
    res.redirect(`${frontendUrl()}#auth=error`);
  }
});

export default router;
