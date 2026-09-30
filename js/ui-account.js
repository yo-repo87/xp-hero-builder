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

  init() {
    document.getElementById('btn-account').addEventListener('click', () => {
      if (Auth.user) this.signOut();
      else this.openAuthModal();
    });
    document.getElementById('tab-profile').addEventListener('click', () => State.setTab('profile'));
    Auth.subscribe(() => this.onAuthChange());
    this.onAuthChange();
  },

  onAuthChange() {
    this.renderHeader();
    this.renderProfileTab();
    // Don't strand the user on a tab that just disappeared.
    if (!Auth.user && State.data.ui.activeTab === 'profile') State.setTab('weapons');
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

      <div class="action-row" style="margin:14px 0">
        <button class="btn btn-gold" id="acct-save-new">☁️ Save Current Build to Cloud</button>
      </div>

      <h4 style="margin:14px 0 6px;font-size:.9rem">Cloud Saves</h4>
      <div id="acct-saves-list"><span style="color:var(--ink-faint);font-size:.82rem">Loading…</span></div>
      <div class="caveat">Loading/saving here is manual (like Export/Import) — it doesn't auto-sync in the background, so nothing here can silently overwrite your current local build.</div>
    `;
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
