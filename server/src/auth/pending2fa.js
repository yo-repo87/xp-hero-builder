// Bridges "password just checked out" and "second factor just verified"
// during a 2FA login. Deliberately NOT one-time-use on every lookup — a
// wrong code (a typo) should let the user try again within the window,
// not force them back to re-typing their password from scratch. The
// token is only actually deleted once a correct second factor consumes
// it (see consume()) or it naturally expires.
import crypto from 'node:crypto';
import pool from '../db.js';

const TTL_MS = 5 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issue(userId) {
  await pool.query(`DELETE FROM pending_2fa_sessions WHERE expires_at < now()`); // opportunistic cleanup, no cron job in this app
  const raw = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO pending_2fa_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), new Date(Date.now() + TTL_MS)]
  );
  return raw;
}

// Checks validity without consuming — used for each verification attempt,
// including failed ones, so a wrong code doesn't burn the pending session.
export async function peek(rawToken) {
  const { rows } = await pool.query(
    `SELECT user_id FROM pending_2fa_sessions WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(rawToken)]
  );
  return rows[0]?.user_id || null;
}

// Deletes the pending session — called only once a correct second factor
// has been verified, right before issuing the real session.
export async function consume(rawToken) {
  await pool.query(`DELETE FROM pending_2fa_sessions WHERE token_hash = $1`, [hashToken(rawToken)]);
}
