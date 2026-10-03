// ---------------------------------------------------------------------------
// auth.js — thin client for the optional xpherobuilder-server backend (see
// server/README.md). Entirely optional: the app works fully on localStorage
// alone with no account. This module only exists to let a signed-in user
// sync State.data to Postgres so it follows them across devices.
//
// Session model: the access token lives ONLY in memory (never localStorage
// — it's a short-lived JWT, losing it on tab close is fine); the refresh
// token is an httpOnly cookie the browser manages on its own. On page load
// we silently try POST /auth/refresh — if the browser still has a valid
// refresh cookie from a previous visit, this picks the session back up
// with no user action. If it fails (no cookie, or expired), the user is
// simply signed out — no error shown, that's the expected logged-out state.
// ---------------------------------------------------------------------------

const Auth = {
  API_BASE: 'https://xpherobuilder-api.arc-it.uk',
  accessToken: null,
  user: null,
  providers: { email: true, google: false, facebook: false, discord: false },
  _listeners: [],

  subscribe(fn) { this._listeners.push(fn); },
  _notify() { for (const fn of this._listeners) fn(this.user); },

  // Set by _tryOAuthRedirect() when the page just came back from an OAuth
  // callback, so app.js knows whether/what to toast. null until then.
  oauthRedirectResult: null,

  async init() {
    try {
      this.providers = await (await fetch(`${this.API_BASE}/auth/providers`)).json();
    } catch {
      // Backend unreachable — the app stays fully usable local-only; just
      // don't show any sign-in affordance for providers we can't confirm.
    }
    const handled = await this._tryOAuthRedirect();
    if (!handled) await this._trySilentResume();
  },

  // Completes sign-in directly from the token the OAuth callback hands
  // back in the URL fragment (see server auth.js for why this exists
  // instead of just relying on the refresh cookie) — returns true if the
  // URL indicated an OAuth return at all (success or error), so init()
  // knows not to also attempt the normal cookie-based silent resume.
  async _tryOAuthRedirect() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const authParam = hash.get('auth');
    if (!authParam) return false;
    const token = hash.get('token');
    history.replaceState({}, '', location.pathname + location.search);
    if (authParam === 'success' && token) {
      this.accessToken = token;
      await this._loadMe();
    }
    this.oauthRedirectResult = this.user ? 'success' : 'error';
    return true;
  },

  async _trySilentResume() {
    try {
      const res = await fetch(`${this.API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return;
      const { accessToken } = await res.json();
      this.accessToken = accessToken;
      await this._loadMe();
    } catch {
      // No session to resume — normal for a first-time or logged-out visitor.
    }
  },

  async _loadMe() {
    const res = await this.authedFetch('/auth/me');
    if (!res.ok) { this.accessToken = null; this.user = null; return; }
    const { user } = await res.json();
    this.user = user;
    this._notify();
  },

  // Attaches the bearer token and transparently retries once via refresh
  // if the access token has expired mid-session.
  async authedFetch(path, opts = {}) {
    const doFetch = () =>
      fetch(`${this.API_BASE}${path}`, {
        ...opts,
        credentials: 'include',
        headers: { ...(opts.headers || {}), ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      });

    let res = await doFetch();
    if (res.status === 401 && this.accessToken) {
      const refreshed = await fetch(`${this.API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (refreshed.ok) {
        this.accessToken = (await refreshed.json()).accessToken;
        res = await doFetch();
      }
    }
    return res;
  },

  async register(email, password, displayName) {
    const res = await fetch(`${this.API_BASE}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Registration failed');
    this.accessToken = body.accessToken;
    this.user = body.user;
    this._notify();
    return this.user;
  },

  async login(email, password) {
    const res = await fetch(`${this.API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Login failed');
    this.accessToken = body.accessToken;
    this.user = body.user;
    this._notify();
    return this.user;
  },

  loginWithProvider(provider) {
    // Full-page redirect (not a fetch) — the provider needs to see the
    // real browser navigate to it. Comes back to FRONTEND_ORIGIN/?auth=...
    window.location.href = `${this.API_BASE}/auth/${provider}`;
  },

  async logout() {
    try { await fetch(`${this.API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch { /* best effort */ }
    this.accessToken = null;
    this.user = null;
    this._notify();
  },

  // --- Cloud saves ---------------------------------------------------------

  async listSaves() {
    const res = await this.authedFetch('/saves');
    if (!res.ok) throw new Error('Could not load your saved builds');
    return (await res.json()).saves;
  },

  async loadSave(id) {
    const res = await this.authedFetch(`/saves/${id}`);
    if (!res.ok) throw new Error('Could not load that build');
    return (await res.json()).save;
  },

  async createSave(name, data) {
    const res = await this.authedFetch('/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not save');
    return (await res.json()).save;
  },

  async updateSave(id, patch) {
    const res = await this.authedFetch(`/saves/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not update save');
    return (await res.json()).save;
  },

  async deleteSave(id) {
    const res = await this.authedFetch(`/saves/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Could not delete that save');
  },
};
