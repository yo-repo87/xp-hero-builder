// ---------------------------------------------------------------------------
// ui-admin.js — the Admin tab: site analytics + user management. Only ever
// shown to an account with users.is_admin=true (gated server-side too, not
// just hidden client-side — see server/src/middleware/requireAdmin.js).
//
// Like ForumUI, this mounts lazily and manages its own refresh rather than
// joining the blind full-rerender-on-notify chain — admin data comes from
// the server, not State.data, and State.notify() fires on ordinary build
// edits that have nothing to do with it.
// ---------------------------------------------------------------------------

const AdminUI = {
  _mounted: false,

  render() {
    const visible = !!Auth.user?.isAdmin;
    if (!visible) { this._mounted = false; return; }
    if (!this._mounted) { this._mounted = true; this._boot(); }
  },

  async _boot() {
    const root = document.getElementById('admin-root');
    root.innerHTML = `<div class="fm-loading">Loading…</div>`;
    await Promise.all([this._loadAnalytics(), this._loadUsers()]);
  },

  async refresh() {
    await Promise.all([this._loadAnalytics(), this._loadUsers()]);
  },

  async _loadAnalytics() {
    const root = document.getElementById('admin-root');
    if (!root) return;
    try {
      this._analytics = await Admin.getAnalytics();
    } catch (err) {
      root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
      return;
    }
    this._renderAll();
  },

  async _loadUsers() {
    try {
      this._users = await Admin.listUsers();
    } catch { /* analytics load's own error already shown if both fail */ }
    this._renderAll();
  },

  _renderAll() {
    const root = document.getElementById('admin-root');
    if (!root || !this._analytics) return;
    const a = this._analytics;
    const maxDay = Math.max(1, ...a.signupsByDay.map(d => d.count));

    root.innerHTML = `
      <div class="admin-stat-grid">
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.totalUsers}</div><div class="admin-stat-label">Total Users</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.onlineNow}</div><div class="admin-stat-label">Online Now</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.totalAdmins}</div><div class="admin-stat-label">Admins</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.newSignups7d}</div><div class="admin-stat-label">New (7 days)</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.newSignups30d}</div><div class="admin-stat-label">New (30 days)</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.forumThreads}</div><div class="admin-stat-label">Forum Threads</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.forumReplies}</div><div class="admin-stat-label">Forum Replies</div></div>
        <div class="admin-stat-tile"><div class="admin-stat-num">${a.totalSaves}</div><div class="admin-stat-label">Cloud Saves</div></div>
      </div>

      <h4 class="section-head" style="margin-top:20px">Signups — last 30 days</h4>
      ${a.signupsByDay.length ? `
        <div class="admin-chart">
          ${a.signupsByDay.map(d => `
            <div class="admin-chart-bar" style="height:${Math.max(4, (d.count / maxDay) * 100)}%" title="${escapeHtml(new Date(d.day).toLocaleDateString())}: ${d.count}"></div>
          `).join('')}
        </div>` : `<div class="caveat">No signups in the last 30 days.</div>`}

      <div class="action-row" style="margin:20px 0 8px;align-items:center;justify-content:space-between">
        <h4 class="section-head" style="margin:0">Users</h4>
        <button class="btn btn-sm" id="admin-refresh-users">🔄 Refresh</button>
      </div>
      <div id="admin-users-table"></div>
      <div class="caveat">"Online" is approximate — this app has no live-presence system, so it means the account's most recent active session was refreshed within the last 15 minutes, not a true real-time connection count.</div>
    `;
    this._renderUsersTable();
    document.getElementById('admin-refresh-users').addEventListener('click', () => this.refresh());
  },

  _renderUsersTable() {
    const table = document.getElementById('admin-users-table');
    if (!table || !this._users) return;
    table.innerHTML = `
      <div class="admin-users-table">
        ${this._users.map(u => this._userRowHTML(u)).join('')}
      </div>`;
    table.querySelectorAll('[data-promote]').forEach(btn => {
      btn.addEventListener('click', () => this._act(() => Admin.promoteUser(btn.dataset.promote), 'Promoted to admin'));
    });
    table.querySelectorAll('[data-demote]').forEach(btn => {
      btn.addEventListener('click', () => this._act(() => Admin.demoteUser(btn.dataset.demote), 'Admin access removed'));
    });
    table.querySelectorAll('[data-delete-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Permanently delete ${btn.dataset.userLabel}'s account? This cannot be undone — their saves and forum posts go with it.`)) return;
        this._act(() => Admin.deleteUser(btn.dataset.deleteUser), 'User deleted');
      });
    });
  },

  async _act(fn, successToast) {
    try {
      await fn();
      UI.toast(successToast);
      await this.refresh();
    } catch (err) {
      UI.toast(err.message);
    }
  },

  _userRowHTML(u) {
    const isSelf = u.id === Auth.user.id;
    const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : 'never';
    return `
      <div class="admin-user-row">
        <span class="admin-online-dot${u.online ? ' online' : ''}" title="${u.online ? 'Online now' : 'Offline'}"></span>
        ${avatarHTML(u)}
        <div class="admin-user-info">
          <div class="fs-title">${escapeHtml(u.displayName)}${isSelf ? ' <span class="tag" style="font-size:.6rem">YOU</span>' : ''}${u.isAdmin ? ' <span class="tag tag--craft" style="font-size:.6rem">ADMIN</span>' : ''}</div>
          <div class="fs-sub">${escapeHtml(u.email || '(no email — OAuth only)')} · ${u.saveCount} save${u.saveCount === 1 ? '' : 's'} · last active ${escapeHtml(lastActive)}</div>
        </div>
        <div class="action-row" style="flex-wrap:nowrap">
          ${!isSelf && !u.isAdmin ? `<button class="btn btn-sm" data-promote="${u.id}">Make Admin</button>` : ''}
          ${!isSelf && u.isAdmin ? `<button class="btn btn-sm" data-demote="${u.id}">Remove Admin</button>` : ''}
          ${!isSelf ? `<button class="btn btn-sm btn-danger" data-delete-user="${u.id}" data-user-label="${escapeHtml(u.displayName)}">Delete</button>` : ''}
        </div>
      </div>`;
  },
};
