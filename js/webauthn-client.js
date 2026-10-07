// ---------------------------------------------------------------------------
// webauthn-client.js — everything that actually touches navigator.credentials
// (via the @simplewebauthn/browser CDN bundle loaded in index.html, chosen
// deliberately over hand-rolling the base64url<->ArrayBuffer conversion:
// it's the official, wire-compatible client for the @simplewebauthn/server
// package the backend already uses, and getting WebAuthn's binary encoding
// subtly wrong by hand is a real, easy-to-hit risk this app would rather
// not take on for a security feature). Plain REST calls for the rest of
// account security (TOTP, listing credentials) live in security.js instead.
// ---------------------------------------------------------------------------

const WebAuthnClient = {
  supported() {
    return !!window.SimpleWebAuthnBrowser && window.SimpleWebAuthnBrowser.browserSupportsWebAuthn();
  },

  // Registers a new security key or passkey for the already-signed-in
  // user. wantPasskey=true requests a resident/discoverable credential
  // (usable later for a full passwordless sign-in); false registers a
  // plain non-resident key (usable only as a 2FA step after a password).
  async registerCredential(nickname, wantPasskey) {
    const optionsRes = await Auth.authedFetch('/security/webauthn/register-options', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passkey: wantPasskey }),
    });
    if (!optionsRes.ok) throw new Error('Could not start registration');
    const optionsJSON = await optionsRes.json();

    const response = await window.SimpleWebAuthnBrowser.startRegistration({ optionsJSON });

    const verifyRes = await Auth.authedFetch('/security/webauthn/register-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, nickname, passkey: wantPasskey }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Could not register that key');
  },

  // Fully passwordless sign-in — no email typed, the browser offers up
  // any resident credential it holds for this site. Returns the same
  // { accessToken, user } shape Auth.login()/register() do.
  async signInWithPasskey() {
    const optionsRes = await fetch(`${Auth.API_BASE}/security/webauthn/login-options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const optionsJSON = await optionsRes.json();

    const response = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });

    const verifyRes = await fetch(`${Auth.API_BASE}/security/webauthn/login-verify`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Could not sign in with that passkey');
    return data;
  },

  // The 2FA step after a password login, using a registered (non-passkey)
  // security key instead of a TOTP code. email narrows the server's
  // allow-list to this one account's own credentials — we already know
  // it, the user just typed it into the login form moments before.
  async verifyMfaWithSecurityKey(email, pendingToken) {
    const optionsRes = await fetch(`${Auth.API_BASE}/security/webauthn/login-options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const optionsJSON = await optionsRes.json();

    const response = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });

    const verifyRes = await fetch(`${Auth.API_BASE}/security/webauthn/login-verify`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, pendingToken }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Could not verify that security key');
    return data;
  },
};
