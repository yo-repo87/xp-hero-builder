// Access tokens: short-lived, stateless JWTs (sub = user id). Refresh
// tokens: opaque random strings, stored hashed in Postgres so they're
// individually revocable (logout, "sign out other devices") without
// needing a JWT blocklist. Refresh is rotated on every use — the old
// token is revoked the moment a new one is issued, so a stolen-and-reused
// refresh token is detectable (the legitimate client's next refresh will
// fail against an already-revoked token).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // throws on invalid/expired
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueRefreshToken(userId, userAgent) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(raw), userAgent || null, expiresAt]
  );
  return raw;
}

// Validates a presented refresh token, revokes it, and issues a new one
// (rotation). Returns { userId, refreshToken } or null if invalid/expired/revoked.
export async function rotateRefreshToken(rawToken, userAgent) {
  const hash = hashToken(rawToken);
  const { rows } = await pool.query(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
    [hash]
  );
  const row = rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) return null;

  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
  const newToken = await issueRefreshToken(row.user_id, userAgent);
  return { userId: row.user_id, refreshToken: newToken };
}

export async function revokeRefreshToken(rawToken) {
  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hashToken(rawToken),
  ]);
}

export const REFRESH_COOKIE_NAME = 'xhb_refresh';
export const REFRESH_COOKIE_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
