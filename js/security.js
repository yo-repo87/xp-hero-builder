// ---------------------------------------------------------------------------
// security.js — thin API client for account security (TOTP 2FA + WebAuthn
// credential management), mirroring forum.js/admin.js's own shape. The
// WebAuthn-specific calls that actually touch navigator.credentials live in
// webauthn-client.js instead — this file is plain REST, no browser crypto.
// ---------------------------------------------------------------------------

const Security = {
  async getStatus() {
    const res = await Auth.authedFetch('/security/status');
    if (!res.ok) throw new Error('Could not load security settings');
    return res.json(); // { credentials, totp: { enabled, backupCodesRemaining } }
  },

  async deleteCredential(id) {
    const res = await Auth.authedFetch(`/security/webauthn/credentials/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Could not remove that credential');
  },

  async totpSetup() {
    const res = await Auth.authedFetch('/security/totp/setup', { method: 'POST' });
    if (!res.ok) throw new Error('Could not start 2FA setup');
    return res.json(); // { secret, qrDataUrl }
  },

  async totpConfirm(code) {
    const res = await Auth.authedFetch('/security/totp/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not confirm 2FA');
    return data; // { ok, backupCodes }
  },

  async totpDisable(password) {
    const res = await Auth.authedFetch('/security/totp/disable', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not disable 2FA');
  },

  // Called during login's 2FA step — no access token exists yet at this
  // point, so this is a plain fetch (not Auth.authedFetch) with the
  // refresh cookie still allowed to ride along via credentials:'include'.
  async verifyTotpLogin(pendingToken, code) {
    const res = await fetch(`${Auth.API_BASE}/security/mfa/verify`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Incorrect code');
    return data; // { accessToken, user }
  },
};
