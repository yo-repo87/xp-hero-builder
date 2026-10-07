// WebAuthn (security keys + passkeys) — thin wrapper around
// @simplewebauthn/server tying it to this app's Postgres schema. All the
// actual cryptographic verification (attestation/assertion signature
// checks, challenge matching, origin/RP ID checks) is handled by that
// library, not hand-rolled here — WebAuthn is exactly the kind of protocol
// this project's "don't hand-roll crypto" instinct applies to hardest.
import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import pool from '../db.js';

// RP ID must be the exact host the credential is scoped to. This site is
// a GitHub Pages *project* page (yo-repo87.github.io/xp-hero-builder/),
// and github.io is itself on the public suffix list, so the RP ID has to
// be the full host (yo-repo87.github.io) — nothing shorter is a valid
// registrable domain a browser will accept. Derived from the same
// FRONTEND_ORIGIN env var the OAuth/CORS config already uses, not a
// separate setting to keep in sync by hand.
const RP_NAME = 'XP Hero Builder';
const RP_ID = new URL(process.env.FRONTEND_ORIGIN).hostname;
const ORIGIN = process.env.FRONTEND_ORIGIN;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function saveChallenge(userId, challenge, purpose) {
  // Opportunistic cleanup of old expired rows — this app has no cron
  // job runner, so "delete anything stale every time we insert a new
  // one" is the simplest way to keep this table from growing forever,
  // instead of a scheduled sweep.
  await pool.query(`DELETE FROM webauthn_challenges WHERE expires_at < now()`);
  await pool.query(
    `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, challenge, purpose, new Date(Date.now() + CHALLENGE_TTL_MS)]
  );
}

// Reads the challenge value the authenticator actually signed, straight
// out of the response itself (clientDataJSON always embeds it) — not just
// "whatever we most recently stored for this user/purpose." Looking up a
// challenge any other way (e.g. "the newest pending row for this user")
// would be a real race for a discoverable/passkey login specifically,
// where there's no user id yet to scope by at all: two different browsers
// starting a passwordless login around the same moment would both be
// matched against "null-user, purpose=login" with nothing to tell them
// apart. Matching on the exact challenge string sidesteps that entirely.
function challengeFromResponse(response) {
  const clientDataJSON = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
  return clientDataJSON.challenge;
}

// Consumes (deletes) the one challenge row matching this exact value —
// one-time-use by construction, a second verify attempt against the same
// challenge always fails to find a row, the same anti-replay property a
// nonce is supposed to have. userId, when known, is an extra belt-and-
// braces check that the challenge was really issued for this account.
async function consumeChallenge(userId, purpose, challenge) {
  const { rows } = userId
    ? await pool.query(
        `DELETE FROM webauthn_challenges WHERE user_id = $1 AND purpose = $2 AND challenge = $3 AND expires_at > now() RETURNING challenge`,
        [userId, purpose, challenge]
      )
    : await pool.query(
        `DELETE FROM webauthn_challenges WHERE purpose = $1 AND challenge = $2 AND expires_at > now() RETURNING challenge`,
        [purpose, challenge]
      );
  return rows[0]?.challenge || null;
}

export async function getRegistrationOptions(userId, userEmail, userDisplayName, wantPasskey) {
  const { rows: existing } = await pool.query(
    `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1`,
    [userId]
  );
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: userEmail || userDisplayName,
    userDisplayName,
    attestationType: 'none',
    excludeCredentials: existing.map(c => ({ id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: {
      residentKey: wantPasskey ? 'required' : 'discouraged',
      userVerification: 'preferred',
    },
  });
  await saveChallenge(userId, options.challenge, 'register');
  return options;
}

export async function verifyRegistration(userId, response, nickname, wantPasskey) {
  const expectedChallenge = await consumeChallenge(userId, 'register', challengeFromResponse(response));
  if (!expectedChallenge) throw new Error('Registration request expired — try again');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verification.verified) throw new Error('Could not verify that security key/passkey');

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await pool.query(
    `INSERT INTO webauthn_credentials
       (user_id, credential_id, public_key, counter, device_type, backed_up, transports, is_passkey, nickname)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId, credential.id, Buffer.from(credential.publicKey).toString('base64'), credential.counter,
      credentialDeviceType, credentialBackedUp, credential.transports ? JSON.stringify(credential.transports) : null,
      !!wantPasskey, (nickname || 'Security Key').slice(0, 60),
    ]
  );
}

// userId is null for a discoverable (passkey, no email typed) login —
// the browser is left to offer up any resident credential it holds for
// this RP ID; we don't (can't) narrow the list server-side in that case.
export async function getAuthenticationOptions(userId) {
  let allowCredentials;
  if (userId) {
    const { rows } = await pool.query(
      `SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1`,
      [userId]
    );
    allowCredentials = rows.map(c => ({ id: c.credential_id, transports: c.transports ? JSON.parse(c.transports) : undefined }));
  }
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials,
  });
  await saveChallenge(userId || null, options.challenge, 'login');
  return options;
}

// Returns the authenticated user's id on success. For a discoverable
// (passkey) login, userId is null going in — the credential_id in the
// response itself is what tells us who just signed in.
export async function verifyAuthentication(userId, response) {
  const expectedChallenge = await consumeChallenge(userId || null, 'login', challengeFromResponse(response));
  if (!expectedChallenge) throw new Error('Sign-in request expired — try again');

  const { rows } = await pool.query(`SELECT * FROM webauthn_credentials WHERE credential_id = $1`, [response.id]);
  const cred = rows[0];
  if (!cred) throw new Error('That credential is not registered here');
  if (userId && cred.user_id !== userId) throw new Error('That credential belongs to a different account');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64')),
      counter: Number(cred.counter),
      transports: cred.transports ? JSON.parse(cred.transports) : undefined,
    },
  });
  if (!verification.verified) throw new Error('Could not verify that security key/passkey');

  await pool.query(
    `UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2`,
    [verification.authenticationInfo.newCounter, cred.id]
  );
  return cred.user_id;
}

export async function listCredentials(userId) {
  const { rows } = await pool.query(
    `SELECT id, nickname, is_passkey, device_type, created_at, last_used_at
     FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function deleteCredential(userId, credentialRowId) {
  const { rowCount } = await pool.query(
    `DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2`,
    [credentialRowId, userId]
  );
  return rowCount > 0;
}

export async function hasSecondFactorCredential(userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM webauthn_credentials WHERE user_id = $1 AND is_passkey = false LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

export function cryptoRandomNickname() {
  return `Credential ${crypto.randomBytes(2).toString('hex')}`;
}
