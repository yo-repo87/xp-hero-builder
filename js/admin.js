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

  // Returns a Blob (zip of the game's save files pulled from the VM).
  async getGameSaves() {
    const res = await Auth.authedFetch('/admin/game-saves');
    if (!res.ok) { let msg = 'Could not fetch game saves'; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
    return res.blob();
  },

  // Uploads a save zip. The server writes those save files onto the VM.
  async applyGameSaves(file) {
    const res = await Auth.authedFetch('/admin/game-saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: file,
    });
    if (!res.ok) { let msg = 'Could not apply the save'; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
    return res.json();
  },

  async deleteUser(id) {
    const res = await Auth.authedFetch(`/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || 'Could not delete user');
  },
};
