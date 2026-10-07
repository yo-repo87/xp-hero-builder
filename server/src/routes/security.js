import { Router } from 'express';
import pool from '../db.js';
import requireAuth from '../middleware/requireAuth.js';
import { verifyPassword } from '../auth/password.js';
import * as webauthn from '../auth/webauthn.js';
import * as totp from '../auth/totp.js';
import * as pending2fa from '../auth/pending2fa.js';
import { issueSession, publicUser } from './auth.js';

const router = Router();

// --- Status (everything the Profile tab's Security section needs in one call) ---

router.get('/status', requireAuth, async (req, res) => {
  const [credentials, totpOn, backupCount] = await Promise.all([
    webauthn.listCredentials(req.userId),
    totp.isEnabled(req.userId),
    totp.remainingBackupCodeCount(req.userId),
  ]);
  res.json({
    credentials: credentials.map(c => ({
      id: c.id, nickname: c.nickname, isPasskey: c.is_passkey, deviceType: c.device_type,
      createdAt: c.created_at, lastUsedAt: c.last_used_at,
    })),
    totp: { enabled: totpOn, backupCodesRemaining: totpOn ? backupCount : 0 },
  });
});

// --- WebAuthn registration (adding a security key or passkey to your own account) ---

router.post('/webauthn/register-options', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT email, display_name FROM users WHERE id = $1`, [req.userId]);
  const wantPasskey = !!(req.body || {}).passkey;
  const options = await webauthn.getRegistrationOptions(req.userId, rows[0].email, rows[0].display_name, wantPasskey);
  res.json(options);
});

router.post('/webauthn/register-verify', requireAuth, async (req, res) => {
  const { response, nickname, passkey } = req.body || {};
  try {
    await webauthn.verifyRegistration(req.userId, response, nickname, !!passkey);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/webauthn/credentials/:id', requireAuth, async (req, res) => {
  const ok = await webauthn.deleteCredential(req.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Credential not found' });
  res.status(204).end();
});

// --- WebAuthn sign-in (passwordless passkey login, OR the 2FA step for a security key) ---

// email omitted entirely -> a fully passwordless/discoverable flow (the
// browser offers up any resident credential for this site with no
// account hinted first). email present -> narrows to that one account's
// own registered credentials, used for the 2FA-step case where we
// already know who's signing in from the password step.
router.post('/webauthn/login-options', async (req, res) => {
  const { email } = req.body || {};
  let userId = null;
  if (email) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    userId = rows[0]?.id || null;
    // Deliberately still return real options even if no such account
    // exists, with an empty allow-list — revealing "that email doesn't
    // exist" here would be a real account-enumeration leak on a public
    // endpoint.
  }
  const options = await webauthn.getAuthenticationOptions(userId);
  res.json(options);
});

// Two real call sites use this: a full passwordless passkey sign-in
// (pendingToken absent, issues a real session directly), and the 2FA
// step after password login (pendingToken present, verifies the
// credential belongs to that specific pending account before issuing a
// session). passkey credentials never need to go through the
// pendingToken path at all — tapping one is already the complete,
// sufficient act of signing in.
router.post('/webauthn/login-verify', async (req, res) => {
  const { response, pendingToken } = req.body || {};
  try {
    let expectedUserId = null;
    if (pendingToken) {
      expectedUserId = await pending2fa.peek(pendingToken);
      if (!expectedUserId) return res.status(401).json({ error: 'That sign-in attempt expired — sign in again' });
    }
    const userId = await webauthn.verifyAuthentication(expectedUserId, response);
    if (pendingToken) await pending2fa.consume(pendingToken);

    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    const accessToken = await issueSession(res, userId, req.headers['user-agent']);
    res.json({ accessToken, user: publicUser(rows[0]) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- TOTP (authenticator app) 2FA setup/management ---

router.post('/totp/setup', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT email FROM users WHERE id = $1`, [req.userId]);
  const { secret, qrDataUrl } = await totp.startSetup(req.userId, rows[0].email);
  res.json({ secret, qrDataUrl });
});

router.post('/totp/confirm', requireAuth, async (req, res) => {
  try {
    const backupCodes = await totp.confirmSetup(req.userId, (req.body || {}).code);
    res.json({ ok: true, backupCodes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/totp/disable', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.userId]);
  const ok = await verifyPassword((req.body || {}).password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  await totp.disable(req.userId);
  res.json({ ok: true });
});

// --- The 2FA step itself, after a password login returned requiresMfa ---

router.post('/mfa/verify', async (req, res) => {
  const { pendingToken, code } = req.body || {};
  if (!pendingToken || !code) return res.status(400).json({ error: 'Missing pending token or code' });
  try {
    const userId = await pending2fa.peek(pendingToken);
    if (!userId) return res.status(401).json({ error: 'That sign-in attempt expired — sign in again' });

    const valid = await totp.verifyLoginCode(userId, code);
    if (!valid) return res.status(401).json({ error: 'Incorrect code' });

    await pending2fa.consume(pendingToken);
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    const accessToken = await issueSession(res, userId, req.headers['user-agent']);
    res.json({ accessToken, user: publicUser(rows[0]) });
  } catch (err) {
    console.error('mfa/verify failed', err);
    res.status(400).json({ error: 'Could not verify that code' });
  }
});

export default router;
