// ---------------------------------------------------------------------------
// ui-account.js — sign-in/sign-up, plus (once signed in) a dedicated
// "Profile" tab with a personalized avatar and cloud save management.
// Entirely optional: logged out, the header just shows "Sign In" — see
// auth.js's header comment for why this is the fully-functional default.
// ---------------------------------------------------------------------------

// Two-letter initials from a display name ("Matthew Gibson" -> "MG",
// "alice" -> "AL", empty -> "?"). Deliberately simple — this is the
// *default* avatar; nothing here stops a future "upload a real picture"
// feature from overriding it per user later.
function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic per-user color (hashed from their id) so different
// people's avatars are visually distinguishable at a glance, without
// needing any actual uploaded image.
function avatarColorFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 50%, 38%)`;
}

function avatarHTML(user, extraClass = '') {
  const initials = initialsFor(user.displayName);
  const color = avatarColorFor(user.id);
  return `<span class="profile-avatar ${extraClass}" style="background:${color}">${escapeHtml(initials)}</span>`;
}

// Updates an existing avatar <span> in place (keeps its id/class from the
// static HTML) rather than replacing the element outright.
function paintAvatar(el, user) {
  el.textContent = initialsFor(user.displayName);
  el.style.background = avatarColorFor(user.id);
}

const AccountUI = {
  mode: 'login', // 'login' | 'register', for the auth modal

  // The cloud save this device currently mirrors — set on sign-in (to the
  // most recently updated save), on "Save as New Build" (to the new one),
  // or on "Load" (to whichever was loaded). Every local change auto-syncs
  // here while it's set; null means "signed out" or "no cloud save yet,"
  // in which case auto-sync is a no-op.
  activeSaveId: null,
  _suppressAutoSave: false, // true only while we're programmatically importing a cloud save, so loading one doesn't immediately re-save it
  _saveDebounceTimer: null,
  _lastSyncAt: null,
  _syncError: null,
  _wasSignedIn: false, // tracks sign-in/out *transitions* in onAuthChange, since Auth.subscribe also fires for unrelated re-renders

  init() {
    document.getElementById('btn-account').addEventListener('click', () => {
      if (Auth.user) this.signOut();
      else this.openAuthModal();
    });
    document.getElementById('tab-profile').addEventListener('click', () => State.setTab('profile'));
    document.getElementById('tab-admin').addEventListener('click', () => State.setTab('admin'));
    Auth.subscribe(() => this.onAuthChange());
    // Every local change (weapons, heroes, traits, upgrades...) runs
    // through State.notify() — this is the one hook point that lets
    // "changes auto-sync to the cloud" apply everywhere without each
    // individual State.set*() call needing to know about accounts.
    State.subscribe(() => this.scheduleAutoSave());
    this.onAuthChange();
  },

  onAuthChange() {
    this.renderHeader();
    this.renderProfileTab();
    SecurityUI.render();
    // Don't strand the user on a tab that just disappeared.
    if (!Auth.user && State.data.ui.activeTab === 'profile') State.setTab('weapons');
    if (!Auth.user?.isAdmin && State.data.ui.activeTab === 'admin') State.setTab('weapons');
    document.getElementById('tab-admin').hidden = !Auth.user?.isAdmin;

    if (Auth.user && !this._wasSignedIn) {
      // Just signed in — either a fresh login or a silently-resumed
      // session from a previous visit. Either way, pull the most recent
      // cloud save down so this device picks up where any other one
      // left off, same as the user explicitly asked for.
      this._wasSignedIn = true;
      this.syncOnSignIn();
    } else if (!Auth.user && this._wasSignedIn) {
      // Just signed out. The screen was mirroring that account's cloud
      // save, so clear it rather than leave a signed-out session still
      // showing a signed-in account's heroes/weapons/etc.
      this._wasSignedIn = false;
      this.activeSaveId = null;
      this._lastSyncAt = null;
      this._syncError = null;
      State.resetAll();
    }
  },

  // Pulls the newest cloud save (Auth.listSaves() is already sorted
  // newest-first by the server) and makes it the local build. First-time
  // sign-in with no cloud save yet instead pushes whatever's currently
  // local up as the first one, so there's something for future auto-syncs
  // to write to rather than silently doing nothing.
  async syncOnSignIn() {
    try {
      const saves = await Auth.listSaves();
      if (saves.length > 0) {
        const save = await Auth.loadSave(saves[0].id);
        this._suppressAutoSave = true;
        State.importJSON(JSON.stringify(save.data));
        this._suppressAutoSave = false;
        this.activeSaveId = save.id;
        this._lastSyncAt = new Date();
        UI.toast(`Loaded your most recent cloud save, "${save.name}"`);
      } else {
        const save = await Auth.createSave('My Build', State.data);
        this.activeSaveId = save.id;
        this._lastSyncAt = new Date();
        UI.toast('Cloud sync started for this build');
      }
    } catch (err) {
      UI.toast(`Couldn't sync your cloud save: ${err.message}`);
    }
    this.renderSavesList();
    this._renderSyncStatus();
  },

  // Debounced so a burst of edits (e.g. dragging a level slider) collapses
  // into one PUT a moment after the user stops, not one per tick.
  scheduleAutoSave() {
    if (!Auth.user || !this.activeSaveId || this._suppressAutoSave) return;
    clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => this._doAutoSave(), 1500);
  },

  async _doAutoSave() {
    if (!Auth.user || !this.activeSaveId) return;
    try {
      await Auth.updateSave(this.activeSaveId, { data: State.data });
      this._lastSyncAt = new Date();
      this._syncError = null;
    } catch (err) {
      this._syncError = err.message;
    }
    this._renderSyncStatus();
  },

  _renderSyncStatus() {
    const el = document.getElementById('acct-sync-status');
    if (!el) return;
    if (this._syncError) {
      el.textContent = `⚠️ Cloud sync failed: ${this._syncError}`;
      el.style.color = 'var(--danger, #a33)';
    } else if (this._lastSyncAt) {
      el.textContent = `☁️ Synced ${this._lastSyncAt.toLocaleTimeString()}`;
      el.style.color = 'var(--ink-faint)';
    } else {
      el.textContent = '';
    }
  },

  renderHeader() {
    const btn = document.getElementById('btn-account');
    const tab = document.getElementById('tab-profile');
    btn.textContent = Auth.user ? 'Sign Off' : 'Sign In';
    tab.hidden = !Auth.user;
    if (Auth.user) paintAvatar(document.getElementById('profile-avatar-tab'), Auth.user);
  },

  async signOut() {
    await Auth.logout();
    UI.toast('Signed out');
  },

  openAuthModal(mode = 'login') {
    this.mode = mode;
    const isRegister = this.mode === 'register';
    const oauthButtons = ['google', 'facebook', 'discord']
      .filter(p => Auth.providers[p])
      .map(p => `<button type="button" class="btn oauth-btn" data-oauth="${p}">Continue with ${p[0].toUpperCase()}${p.slice(1)}</button>`)
      .join('');

    UI.openModal(`
      <div class="modal-header"><h3>${isRegister ? 'Create Account' : 'Sign In'}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="caveat">An account is entirely optional — everything in this app already works fully without one, saved locally in your browser. Signing in loads your most recent cloud save automatically (replacing what's here now) and keeps it synced across devices from then on via a small self-hosted backend.</div>

        ${oauthButtons ? `<div class="oauth-row">${oauthButtons}</div>` : ''}
        ${!isRegister && WebAuthnClient.supported() ? `<div class="oauth-row"><button type="button" class="btn oauth-btn" id="auth-passkey-btn">🔑 Sign in with a Passkey</button></div>` : ''}
        ${oauthButtons || (!isRegister && WebAuthnClient.supported()) ? `<div class="auth-divider">or</div>` : ''}

        <div class="form-field">
          <label for="auth-email">Email</label>
          <input type="email" id="auth-email" autocomplete="email">
        </div>
        ${isRegister ? `
        <div class="form-field">
          <label for="auth-name">Display name (optional)</label>
          <input type="text" id="auth-name" maxlength="40" autocomplete="nickname">
        </div>` : ''}
        <div class="form-field">
          <label for="auth-password">Password</label>
          <input type="password" id="auth-password" autocomplete="${isRegister ? 'new-password' : 'current-password'}">
          ${isRegister ? '<div class="fs-sub">At least 8 characters.</div>' : ''}
        </div>
        <div id="auth-error" class="caveat" style="display:none;border-color:var(--danger,#a33)"></div>

        <div class="action-row">
          <button class="btn btn-gold" id="auth-submit">${isRegister ? 'Create Account' : 'Sign In'}</button>
          <button class="btn" id="auth-toggle">${isRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('auth-toggle').addEventListener('click', () => this.openAuthModal(isRegister ? 'login' : 'register'));
    document.querySelectorAll('[data-oauth]').forEach(el => {
      el.addEventListener('click', () => Auth.loginWithProvider(el.dataset.oauth));
    });
    document.getElementById('auth-passkey-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const { accessToken, user } = await WebAuthnClient.signInWithPasskey();
        Auth.completeSession(accessToken, user);
        UI.toast(`Welcome back, ${Auth.user.displayName}!`);
        UI.closeModal();
      } catch (err) {
        UI.toast(err.message);
        btn.disabled = false;
      }
    });

    document.getElementById('auth-submit').addEventListener('click', async (e) => {
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errorEl = document.getElementById('auth-error');
      errorEl.style.display = 'none';
      if (!email || !password) {
        errorEl.textContent = 'Email and password are required.';
        errorEl.style.display = '';
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (isRegister) {
          const name = document.getElementById('auth-name').value.trim();
          await Auth.register(email, password, name);
          UI.toast(`Welcome, ${Auth.user.displayName}!`);
          UI.closeModal();
        } else {
          const result = await Auth.login(email, password);
          if (result.requiresMfa) {
            this._openMfaStep(email, result.pendingToken, result.methods);
          } else {
            UI.toast(`Welcome back, ${Auth.user.displayName}!`);
            UI.closeModal();
          }
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = '';
        btn.disabled = false;
      }
    });
  },

  // The second step after a password login when the account has 2FA
  // enabled — a fresh modal (replacing the email/password one) offering
  // a TOTP code field and, if the account also has a registered security
  // key, a "use your security key instead" button as an alternative.
  _openMfaStep(email, pendingToken, methods) {
    UI.openModal(`
      <div class="modal-header"><h3>Two-Factor Verification</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="caveat">Enter the 6-digit code from your authenticator app, or a backup code.</div>
        <div class="form-field"><label for="mfa-code">Code</label><input type="text" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" autofocus></div>
        <div id="mfa-error" class="caveat" style="display:none;border-color:var(--danger,#a33)"></div>
        <div class="action-row">
          <button class="btn btn-gold" id="mfa-submit">Verify</button>
          ${methods.webauthn ? '<button class="btn" id="mfa-use-key">Use my security key instead</button>' : ''}
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('mfa-submit').addEventListener('click', async (e) => {
      const code = document.getElementById('mfa-code').value.trim();
      const errEl = document.getElementById('mfa-error');
      errEl.style.display = 'none';
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const { accessToken, user } = await Security.verifyTotpLogin(pendingToken, code);
        Auth.completeSession(accessToken, user);
        UI.toast(`Welcome back, ${Auth.user.displayName}!`);
        UI.closeModal();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = '';
        btn.disabled = false;
      }
    });
    document.getElementById('mfa-use-key')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const { accessToken, user } = await WebAuthnClient.verifyMfaWithSecurityKey(email, pendingToken);
        Auth.completeSession(accessToken, user);
        UI.toast(`Welcome back, ${Auth.user.displayName}!`);
        UI.closeModal();
      } catch (err) {
        UI.toast(err.message);
        btn.disabled = false;
      }
    });
  },

  renderProfileTab() {
    const root = document.getElementById('profile-root');
    if (!root) return;
    if (!Auth.user) {
      root.innerHTML = `<div class="empty-state"><div class="es-icon">👤</div>Sign in to see your profile.</div>`;
      return;
    }
    const user = Auth.user;
    root.innerHTML = `
      <div class="profile-header">
        ${avatarHTML(user, 'profile-avatar--large')}
        <div>
          <div class="detail-name">${escapeHtml(user.displayName)}</div>
          <div class="detail-tags">${user.email ? `<span class="tag">${escapeHtml(user.email)}</span>` : ''}</div>
        </div>
      </div>

      <div class="action-row" style="margin:14px 0;align-items:center">
        <button class="btn btn-gold" id="acct-save-new">☁️ Save as New Build</button>
        <span id="acct-sync-status" style="font-size:.78rem"></span>
      </div>

      <h4 style="margin:14px 0 6px;font-size:.9rem">Cloud Saves</h4>
      <div id="acct-saves-list"><span style="color:var(--ink-faint);font-size:.82rem">Loading…</span></div>
      <div class="caveat">Your build auto-syncs to the cloud a moment after each change, and signing in anywhere loads your most recent cloud save automatically — replacing whatever was here before. "Save as New Build" starts a separate named save; "Load" switches which save auto-syncs from here on. Export first if you want an offline backup that auto-sync can't touch.</div>
    `;
    document.getElementById('acct-save-new').addEventListener('click', () => this.saveCurrentBuild());
    this.renderSavesList();
    this._renderSyncStatus();
  },

  async renderSavesList() {
    const el = document.getElementById('acct-saves-list');
    if (!el) return;
    try {
      const saves = await Auth.listSaves();
      el.innerHTML = saves.length
        ? saves.map(s => `
          <div class="farm-source-row" data-save-id="${s.id}">
            <div class="farm-source-info">
              <div class="fs-title">${escapeHtml(s.name)}${s.id === this.activeSaveId ? ' <span class="tag" style="font-size:.6rem">ACTIVE</span>' : ''}</div>
              <div class="fs-sub">Updated ${new Date(s.updated_at).toLocaleString()}</div>
            </div>
            <button class="btn btn-sm" data-load-save="${s.id}">Load</button>
            <button class="btn btn-sm btn-danger" data-delete-save="${s.id}">Delete</button>
          </div>`).join('')
        : `<span style="color:var(--ink-faint);font-size:.82rem">No cloud saves yet.</span>`;

      el.querySelectorAll('[data-load-save]').forEach(btn => {
        btn.addEventListener('click', () => this.loadCloudSave(btn.dataset.loadSave));
      });
      el.querySelectorAll('[data-delete-save]').forEach(btn => {
        btn.addEventListener('click', () => this.deleteCloudSave(btn.dataset.deleteSave));
      });
    } catch (err) {
      el.innerHTML = `<span style="color:var(--ink-faint);font-size:.82rem">${escapeHtml(err.message)}</span>`;
    }
  },

  async saveCurrentBuild() {
    const name = prompt('Name this save:', `My Build — ${new Date().toLocaleDateString()}`);
    if (!name) return;
    try {
      const save = await Auth.createSave(name, State.data);
      this.activeSaveId = save.id; // this new save is now the one auto-sync writes to
      this._lastSyncAt = new Date();
      this._syncError = null;
      UI.toast('Saved to cloud — this build will auto-sync here from now on');
      this.renderSavesList();
      this._renderSyncStatus();
    } catch (err) {
      UI.toast(`Couldn't save: ${err.message}`);
    }
  },

  async loadCloudSave(id) {
    if (!confirm('Load this cloud save? It will replace your current local build (export it first if you want a backup).')) return;
    try {
      const save = await Auth.loadSave(id);
      this._suppressAutoSave = true;
      State.importJSON(JSON.stringify(save.data));
      this._suppressAutoSave = false;
      this.activeSaveId = id; // future changes now sync to this save instead
      this._lastSyncAt = new Date();
      this._syncError = null;
      UI.toast(`Loaded "${save.name}" — this build will auto-sync here from now on`);
      this.renderSavesList();
      this._renderSyncStatus();
    } catch (err) {
      this._suppressAutoSave = false;
      UI.toast(`Couldn't load: ${err.message}`);
    }
  },

  async deleteCloudSave(id) {
    if (!confirm('Delete this cloud save? This cannot be undone.')) return;
    try {
      await Auth.deleteSave(id);
      if (this.activeSaveId === id) {
        this.activeSaveId = null; // nothing left to auto-sync to until the user picks/creates another
        this._lastSyncAt = null;
      }
      this.renderSavesList();
      this._renderSyncStatus();
    } catch (err) {
      UI.toast(`Couldn't delete: ${err.message}`);
    }
  },
};
