// ---------------------------------------------------------------------------
// ui-search.js — a single global search box that finds any hero, weapon,
// item, or monster by name across all 6 tabs and jumps straight to it.
// Entirely client-side (Game.db is already fully loaded), no new data.
//
// Clicking a result never silently mutates your build. Monsters and items
// are pure read-only catalogs (MonstersUI.openDetail/FarmableUI.openDetail
// already work that way), but Heroes/Weapons are roster-based — the only
// existing "click a catalog card" entry points for those
// (HeroesUI.openAddPicker/WeaponsUI.openPicker) ADD/equip on click, which
// would be a real surprise coming from what looks like a read-only search.
// So a hero/weapon you already own jumps to its own existing detail/enhance
// view (safe, info-only); one you don't own switches to that tab and opens
// the normal picker so you can add/equip it yourself if you want — the
// click to actually add it is still a deliberate, separate action.
// ---------------------------------------------------------------------------

const GlobalSearchUI = {
  _index: null,

  _buildIndex() {
    if (this._index) return this._index;
    const idx = [];
    for (const w of Game.db.WeaponData) idx.push({ type: 'weapon', id: w.id, name: w.Name_en, icon: Game.weaponIcon(w), rarity: w.Rarity });
    for (const c of Game.db.CostumeData) idx.push({ type: 'hero', id: c.id, name: c.Name_en, icon: Game.heroIcon(c), rarity: c.rarity });
    for (const it of Game.db.StackableItemData) idx.push({ type: 'item', id: it.id, name: it.Name_en, icon: Game.itemIcon(it), rarity: it.Rarity });
    for (const e of Game.db.EnemyData) idx.push({ type: 'monster', id: e.id, name: e.Name_en, icon: Game.enemyIcon(e), rarity: e.Rarity });
    this._index = idx.filter(it => it.name);
    return this._index;
  },

  _typeLabel(type) {
    return { weapon: 'Weapon', hero: 'Hero', item: 'Item', monster: 'Monster' }[type] || type;
  },

  open() {
    UI.openModal(`
      <div class="modal-header"><h3>🔍 Search</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <input type="text" id="gs-input" class="gs-input" placeholder="Search heroes, weapons, items, monsters…" autocomplete="off">
        <div id="gs-results"></div>
      </div>
    `, { onMount: () => document.getElementById('gs-input')?.focus() });
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());

    const input = document.getElementById('gs-input');
    const results = document.getElementById('gs-results');
    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.innerHTML = `<div class="empty-state" style="padding:20px">Start typing to search.</div>`; return; }
      const matches = this._buildIndex().filter(it => it.name.toLowerCase().includes(q)).slice(0, 40);
      if (!matches.length) { results.innerHTML = `<div class="empty-state" style="padding:20px">No matches for "${escapeHtml(input.value.trim())}".</div>`; return; }
      results.innerHTML = `<div class="picker-grid">${matches.map(m => `
        <div class="picker-card gs-result" data-type="${m.type}" data-id="${m.id}" style="${rarityStyle(m.rarity)}">
          <img src="${m.icon}" onerror="onImgError(this)" alt="">
          <div class="pc-name">${escapeHtml(m.name)}</div>
          <div class="pc-tag">${this._typeLabel(m.type)}</div>
        </div>`).join('')}</div>`;
      results.querySelectorAll('.gs-result').forEach(el => {
        el.addEventListener('click', () => this._openResult(el.dataset.type, Number(el.dataset.id)));
      });
    };
    input.addEventListener('input', render);
    render();
  },

  _openResult(type, id) {
    UI.closeModal();
    if (type === 'monster') {
      State.setTab('monsters');
      MonstersUI.openDetail(id);
    } else if (type === 'item') {
      State.setTab('farmable');
      FarmableUI.openDetail(id);
    } else if (type === 'hero') {
      const owned = State.data.heroes.find(h => h.costumeId === id);
      State.setTab('heroes');
      if (owned) HeroesUI.openEnhance(owned.id);
      else HeroesUI.openAddPicker();
    } else if (type === 'weapon') {
      const slotIndex = State.data.weapons.findIndex(w => w && w.weaponId === id);
      State.setTab('weapons');
      if (slotIndex !== -1) WeaponsUI.openDetail(slotIndex, id);
      else WeaponsUI.openPicker(0);
    }
  },
};
