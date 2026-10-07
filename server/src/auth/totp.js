// TOTP (authenticator-app) 2FA — thin wrapper around otplib + qrcode tying
// them to this app's Postgres schema. The actual HOTP/TOTP RFC math (RFC
// 4226/6238) is handled entirely by otplib, not hand-rolled.
import crypto from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

const ISSUER = 'XP Hero Builder';
const BACKUP_CODE_COUNT = 10;

// Starts (or restarts) TOTP setup — generates a fresh secret and QR code,
// but does NOT enable 2FA yet. enabled only flips true once the user
// proves they actually scanned it correctly (see confirmSetup below); a
// secret that was generated but never confirmed must never gate login.
// Upserted (not inserted) so re-visiting the setup screen before
// confirming just replaces the pending secret rather than erroring on
// the table's own user_id PRIMARY KEY.
export async function startSetup(userId, userEmail) {
  const secret = generateSecret();
  await pool.query(
    `INSERT INTO totp_credentials (user_id, secret, enabled, confirmed_at)
     VALUES ($1, $2, false, NULL)
     ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = false, confirmed_at = NULL`,
    [userId, secret]
  );
  const uri = generateURI({ issuer: ISSUER, label: userEmail || userId, secret });
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { secret, qrDataUrl };
}

// Verifies the user's first real code and, on success, flips enabled=true
// and issues one-time backup codes (returned here in plain text — this is
// the ONLY moment they're ever available in plain text; only their
// bcrypt hashes are stored, same discipline as password_hash).
export async function confirmSetup(userId, token) {
  const { rows } = await pool.query(`SELECT secret FROM totp_credentials WHERE user_id = $1 AND enabled = false`, [userId]);
  if (!rows[0]) throw new Error('No pending 2FA setup for this account — start setup again');
  // Same otplib quirk as verifyLoginCode() above: a malformed (wrong
  // length/non-numeric) token throws instead of returning { valid:
  // false }. Caught here too so a stray paste or empty submit surfaces
  // the same friendly message as a genuinely wrong code, not a raw
  // library error string.
  let result;
  try {
    result = await verify({ secret: rows[0].secret, token });
  } catch {
    result = { valid: false };
  }
  if (!result.valid) throw new Error('That code didn\'t match — check your authenticator app and try again');

  await pool.query(`UPDATE totp_credentials SET enabled = true, confirmed_at = now() WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]); // clear any from a previous enable/disable cycle
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => crypto.randomBytes(5).toString('hex'));
  for (const code of codes) {
    await pool.query(`INSERT INTO mfa_backup_codes (user_id, code_hash) VALUES ($1, $2)`, [userId, await bcrypt.hash(code, 10)]);
  }
  return codes;
}

export async function isEnabled(userId) {
  const { rows } = await pool.query(`SELECT 1 FROM totp_credentials WHERE user_id = $1 AND enabled = true`, [userId]);
  return rows.length > 0;
}

export async function disable(userId) {
  await pool.query(`DELETE FROM totp_credentials WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]);
}

// Verifies a login-time code — either a real TOTP code from the app, or
// (if that fails) a one-time backup code, consumed on use. Returns true/
// false; never throws, since "wrong code" is an expected, routine outcome
// here, not an error condition.
export async function verifyLoginCode(userId, code) {
  const { rows } = await pool.query(`SELECT secret FROM totp_credentials WHERE user_id = $1 AND enabled = true`, [userId]);
  if (rows[0]) {
    // otplib's verify() THROWS (TokenLengthError/TokenFormatError) for
    // anything that isn't a 6-digit numeric string, rather than just
    // returning { valid: false } — a real, non-obvious behavior caught
    // live while testing the backup-code fallback path (a 10-character
    // hex backup code reaching this call crashed the whole request
    // before this try/catch existed). A malformed code is exactly as
    // "wrong" as a correct-length-but-incorrect one from this
    // function's point of view, so it's treated the same way: fall
    // through to the backup-code check rather than erroring out.
    try {
      const result = await verify({ secret: rows[0].secret, token: code });
      if (result.valid) return true;
    } catch { /* malformed token — fall through to backup codes */ }
  }
  // Fall back to backup codes — only reachable if the TOTP check above
  // didn't already pass, so a normal 6-digit code never wastes a backup
  // code by accident.
  const { rows: backups } = await pool.query(
    `SELECT id, code_hash FROM mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  for (const b of backups) {
    if (await bcrypt.compare(code, b.code_hash)) {
      await pool.query(`UPDATE mfa_backup_codes SET used_at = now() WHERE id = $1`, [b.id]);
      return true;
    }
  }
  return false;
}

export async function remainingBackupCodeCount(userId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  return rows[0].n;
}
