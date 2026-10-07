// ---------------------------------------------------------------------------
// admin.js — thin API client for the Admin tab, mirroring forum.js's own
// shape. Every call requires an admin account; the server re-checks
// is_admin on every request regardless of what the client thinks.
// ---------------------------------------------------------------------------

const Admin = {
  async getAnalytics() {
    const res = await Auth.authedFetch('/admin/analytics');
    if (!res.ok) throw new Error('Could not load analytics');
    return res.json();
  },

  async listUsers() {
    const res = await Auth.authedFetch('/admin/users');
    if (!res.ok) throw new Error('Could not load users');
    return (await res.json()).users;
  },

  async promoteUser(id) {
    const res = await Auth.authedFetch(`/admin/users/${id}/promote`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not promote user');
  },

  async demoteUser(id) {
    const res = await Auth.authedFetch(`/admin/users/${id}/demote`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not demote user');
  },

  async deleteUser(id) {
    const res = await Auth.authedFetch(`/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || 'Could not delete user');
  },
};
