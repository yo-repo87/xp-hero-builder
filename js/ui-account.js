// ---------------------------------------------------------------------------
// ui-account.js — sign-in/sign-up + cloud save management. Entirely
// optional: the header button just says "Sign In" when logged out (which
// is also the fully-functional default — see auth.js's header comment).
// ---------------------------------------------------------------------------

const AccountUI = {
  mode: 'login', // 'login' | 'register', for the auth modal

  init() {
    const btn = document.getElementById('btn-account');
    btn.addEventListener('click', () => (Auth.user ? this.openAccountModal() : this.openAuthModal()));
    Auth.subscribe(() => this.renderHeader());
    this.renderHeader();
  },

  renderHeader() {
    const btn = document.getElementById('btn-account');
    btn.textContent = Auth.user ? `👤 ${Auth.user.displayName}` : 'Sign In';
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
        <div class="caveat">An account is entirely optional — everything in this app already works fully without one, saved locally in your browser. Signing in just lets a build follow you across devices via a small self-hosted backend.</div>

        ${oauthButtons ? `<div class="oauth-row">${oauthButtons}</div><div class="auth-divider">or</div>` : ''}

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
        } else {
          await Auth.login(email, password);
          UI.toast(`Welcome back, ${Auth.user.displayName}!`);
        }
        UI.closeModal();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = '';
        btn.disabled = false;
      }
    });
  },

  async openAccountModal() {
    UI.openModal(`
      <div class="modal-header"><h3>My Account</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="detail-tags"><span class="tag">${escapeHtml(Auth.user.displayName)}</span>${Auth.user.email ? `<span class="tag">${escapeHtml(Auth.user.email)}</span>` : ''}</div>

        <div class="action-row" style="margin:14px 0">
          <button class="btn btn-gold" id="acct-save-new">☁️ Save Current Build to Cloud</button>
          <button class="btn" id="acct-signout">Sign Out</button>
        </div>

        <h4 style="margin:14px 0 6px;font-size:.9rem">Cloud Saves</h4>
        <div id="acct-saves-list"><span style="color:var(--ink-faint);font-size:.82rem">Loading…</span></div>
        <div class="caveat">Loading/saving here is manual (like Export/Import) — it doesn't auto-sync in the background, so nothing here can silently overwrite your current local build.</div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('acct-signout').addEventListener('click', async () => {
      await Auth.logout();
      UI.toast('Signed out');
      UI.closeModal();
    });
    document.getElementById('acct-save-new').addEventListener('click', () => this.saveCurrentBuild());
    this.renderSavesList();
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
              <div class="fs-title">${escapeHtml(s.name)}</div>
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
      await Auth.createSave(name, State.data);
      UI.toast('Saved to cloud');
      this.renderSavesList();
    } catch (err) {
      UI.toast(`Couldn't save: ${err.message}`);
    }
  },

  async loadCloudSave(id) {
    if (!confirm('Load this cloud save? It will replace your current local build (export it first if you want a backup).')) return;
    try {
      const save = await Auth.loadSave(id);
      State.importJSON(JSON.stringify(save.data));
      UI.toast(`Loaded "${save.name}"`);
      UI.closeModal();
    } catch (err) {
      UI.toast(`Couldn't load: ${err.message}`);
    }
  },

  async deleteCloudSave(id) {
    if (!confirm('Delete this cloud save? This cannot be undone.')) return;
    try {
      await Auth.deleteSave(id);
      this.renderSavesList();
    } catch (err) {
      UI.toast(`Couldn't delete: ${err.message}`);
    }
  },
};
