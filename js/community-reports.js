// ---------------------------------------------------------------------------
// community-reports.js — crowd-sourced "I found this item here, from this
// creature" reports for the Farmable Items tab. This is the one part of the
// app with a real backend: a small n8n webhook + Data Table, self-hosted by
// the maintainer, added 2026-09-29 specifically so reports are shared across
// every visitor (not just saved to one person's browser). See CLAUDE.md for
// the full writeup — this is a deliberate, discussed exception to the
// project's "static site, no backend" architecture, not an accident.
//
// Anyone can POST here from the public site, so treat every report as
// UNVERIFIED user input, never as "confirmed" data — it's rendered in its
// own clearly-labeled section, separate from the real ChestData/
// MinimapRewardData sources in ui-farmable.js.
// ---------------------------------------------------------------------------

const CommunityReports = {
  API_BASE: 'https://n8n.arc-it.uk/webhook',

  cache: new Map(), // item_id -> report[]
  loaded: false,
  _loading: null,

  fetchAll() {
    if (this._loading) return this._loading;
    this._loading = fetch(`${this.API_BASE}/xp-hero-farmable-list`)
      .then(res => res.text())
      .then(text => {
        const rows = text ? JSON.parse(text) : [];
        const byItem = new Map();
        for (const r of rows) {
          if (!byItem.has(r.item_id)) byItem.set(r.item_id, []);
          byItem.get(r.item_id).push(r);
        }
        this.cache = byItem;
      })
      .catch(err => {
        console.error('Community reports: fetch failed', err);
      })
      .finally(() => {
        this.loaded = true;
        this._loading = null;
      });
    return this._loading;
  },

  forItem(itemId) {
    return this.cache.get(itemId) || [];
  },

  async submit({ itemId, itemName, stageId, stageLabel, enemyId, enemyName, note, reporter }) {
    const res = await fetch(`${this.API_BASE}/xp-hero-farmable-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        item_name: itemName || '',
        stage_id: stageId || 0,
        stage_label: stageLabel || '',
        enemy_id: enemyId || 0,
        enemy_name: enemyName || '',
        note: note || '',
        reporter: reporter || '',
      }),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok || !data.success) throw new Error(data.error || `Submit failed (${res.status})`);
    // Optimistically fold the new report into the local cache so it shows up
    // immediately without waiting on a re-fetch.
    const row = { item_id: itemId, item_name: itemName, stage_id: stageId, stage_label: stageLabel, enemy_id: enemyId, enemy_name: enemyName, note, reporter, id: data.id, createdAt: new Date().toISOString() };
    if (!this.cache.has(itemId)) this.cache.set(itemId, []);
    this.cache.get(itemId).unshift(row);
    return data;
  },
};
