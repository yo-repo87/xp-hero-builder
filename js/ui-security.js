// ---------------------------------------------------------------------------
// ui-security.js — the Profile tab's "Security" section: passkeys, security
// keys, and TOTP 2FA management. See CLAUDE.md "Account security" for the
// design reasoning (passkeys = full passwordless sign-in; security keys +
// TOTP = a required second factor after the password).
// ---------------------------------------------------------------------------

const SecurityUI = {
  _status: null,

  render() {
    const root = document.getElementById('security-root');
    if (!root) return;
    if (!Auth.user) { root.innerHTML = ''; this._status = null; return; }
    this._load();
  },

  async _load() {
    const root = document.getElementById('security-root');
    if (!root) return;
    root.innerHTML = `<div class="fm-loading">Loading…</div>`;
    try {
      this._status = await Security.getStatus();
    } catch (err) {
      root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
      return;
    }
    this._renderAll();
  },

  _renderAll() {
    const root = document.getElementById('security-root');
    if (!root || !this._status) return;
    const { credentials, totp } = this._status;
    const passkeys = credentials.filter(c => c.isPasskey);
    const keys = credentials.filter(c => !c.isPasskey);
    const supported = WebAuthnClient.supported();

    root.innerHTML = `
      <h4 class="section-head">🔑 Passkeys</h4>
      <p class="fs-sub">Sign in without typing a password at all, straight from the sign-in screen's "Sign in with a Passkey" button.</p>
      <div id="sec-passkeys-list">${this._credsListHTML(passkeys, 'No passkeys registered yet.')}</div>
      <div class="action-row" style="margin:10px 0 22px">
        <button class="btn btn-gold" id="sec-add-passkey" ${supported ? '' : 'disabled'}>+ Add a Passkey</button>
      </div>

      <h4 class="section-head">🔐 Security Keys</h4>
      <p class="fs-sub">A required second step after your password — you'll be prompted to tap it at sign-in.</p>
      <div id="sec-keys-list">${this._credsListHTML(keys, 'No security keys registered yet.')}</div>
      <div class="action-row" style="margin:10px 0 22px">
        <button class="btn btn-gold" id="sec-add-key" ${supported ? '' : 'disabled'}>+ Add a Security Key</button>
      </div>
      ${!supported ? `<div class="caveat">Your browser doesn't support passkeys or security keys.</div>` : ''}

      <h4 class="section-head">📱 Authenticator App (2FA)</h4>
      ${totp.enabled
        ? `<div class="caveat">2FA is enabled. ${totp.backupCodesRemaining} backup code${totp.backupCodesRemaining === 1 ? '' : 's'} remaining — use one if you lose access to your authenticator app.</div>
           <div class="action-row" style="margin-top:10px"><button class="btn btn-danger" id="sec-totp-disable">Disable 2FA</button></div>`
        : `<p class="fs-sub">Require a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) after your password.</p>
           <div class="action-row"><button class="btn btn-gold" id="sec-totp-enable">Enable 2FA</button></div>`}
    `;

    document.getElementById('sec-add-passkey')?.addEventListener('click', () => this._addCredential(true));
    document.getElementById('sec-add-key')?.addEventListener('click', () => this._addCredential(false));
    document.getElementById('sec-totp-enable')?.addEventListener('click', () => this._openTotpSetup());
    document.getElementById('sec-totp-disable')?.addEventListener('click', () => this._openTotpDisable());
    root.querySelectorAll('[data-remove-cred]').forEach(btn => {
      btn.addEventListener('click', () => this._removeCredential(btn.dataset.removeCred));
    });
  },

  _credsListHTML(list, emptyMsg) {
    if (!list.length) return `<div class="caveat">${escapeHtml(emptyMsg)}</div>`;
    return list.map(c => `
      <div class="farm-source-row">
        <div class="farm-source-info">
          <div class="fs-title">${escapeHtml(c.nickname)}</div>
          <div class="fs-sub">Added ${new Date(c.createdAt).toLocaleDateString()}${c.lastUsedAt ? ` · last used ${new Date(c.lastUsedAt).toLocaleDateString()}` : ' · never used'}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-remove-cred="${c.id}">Remove</button>
      </div>`).join('');
  },

  async _addCredential(wantPasskey) {
    const nickname = prompt(`Name this ${wantPasskey ? 'passkey' : 'security key'} (e.g. "${wantPasskey ? 'My Phone' : 'YubiKey 5'}"):`, wantPasskey ? 'My Device' : 'Security Key');
    if (!nickname) return;
    try {
      await WebAuthnClient.registerCredential(nickname, wantPasskey);
      UI.toast(`${wantPasskey ? 'Passkey' : 'Security key'} added`);
      this._load();
    } catch (err) {
      UI.toast(err.message);
    }
  },

  async _removeCredential(id) {
    if (!confirm('Remove this credential? You will no longer be able to use it to sign in.')) return;
    try {
      await Security.deleteCredential(id);
      UI.toast('Removed');
      this._load();
    } catch (err) {
      UI.toast(err.message);
    }
  },

  async _openTotpSetup() {
    let setup;
    try {
      setup = await Security.totpSetup();
    } catch (err) {
      UI.toast(err.message);
      return;
    }
    UI.openModal(`
      <div class="modal-header"><h3>Enable 2FA</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <p class="fs-sub">Scan this with your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the key manually.</p>
        <div style="text-align:center;margin:14px 0"><img src="${setup.qrDataUrl}" alt="2FA QR code" style="width:200px;height:200px;border-radius:8px"></div>
        <div class="form-field"><label>Manual entry key</label><input type="text" readonly value="${escapeHtml(setup.secret)}" onclick="this.select()"></div>
        <div class="form-field"><label for="sec-totp-code">Enter the 6-digit code to confirm</label><input type="text" id="sec-totp-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
        <div id="sec-totp-error" class="caveat" style="display:none;border-color:var(--danger,#a33)"></div>
        <div class="action-row"><button class="btn btn-gold" id="sec-totp-confirm">Confirm & Enable</button></div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('sec-totp-confirm').addEventListener('click', async (e) => {
      const code = document.getElementById('sec-totp-code').value.trim();
      const errEl = document.getElementById('sec-totp-error');
      errEl.style.display = 'none';
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const result = await Security.totpConfirm(code);
        this._showBackupCodes(result.backupCodes);
        this._load();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = '';
        btn.disabled = false;
      }
    });
  },

  _showBackupCodes(codes) {
    UI.openModal(`
      <div class="modal-header"><h3>✅ 2FA Enabled — Save Your Backup Codes</h3></div>
      <div class="modal-body">
        <div class="caveat">Each code works once, if you ever lose access to your authenticator app. Save them somewhere safe — <strong>this is the only time they'll be shown.</strong></div>
        <div class="admin-chart" style="height:auto;flex-direction:column;align-items:stretch;padding:12px;font-family:'JetBrains Mono',monospace;font-size:0.9rem;gap:6px">
          ${codes.map(c => `<div>${escapeHtml(c)}</div>`).join('')}
        </div>
        <div class="action-row" style="margin-top:14px"><button class="btn btn-gold" id="sec-backup-done">I've saved these</button></div>
      </div>
    `);
    document.getElementById('sec-backup-done').addEventListener('click', () => UI.closeModal());
  },

  _openTotpDisable() {
    UI.openModal(`
      <div class="modal-header"><h3>Disable 2FA</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="caveat">Confirm your password to turn off 2FA. Your registered security keys/passkeys, if any, are unaffected.</div>
        <div class="form-field"><label for="sec-disable-password">Password</label><input type="password" id="sec-disable-password" autocomplete="current-password"></div>
        <div id="sec-disable-error" class="caveat" style="display:none;border-color:var(--danger,#a33)"></div>
        <div class="action-row"><button class="btn btn-danger" id="sec-disable-confirm">Disable 2FA</button></div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('sec-disable-confirm').addEventListener('click', async (e) => {
      const password = document.getElementById('sec-disable-password').value;
      const errEl = document.getElementById('sec-disable-error');
      errEl.style.display = 'none';
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await Security.totpDisable(password);
        UI.closeModal();
        UI.toast('2FA disabled');
        this._load();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = '';
        btn.disabled = false;
      }
    });
  },
};
