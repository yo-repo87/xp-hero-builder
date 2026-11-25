// ---------------------------------------------------------------------------
// ui-save-editor.js — save editor opened from the Admin tab.
// Edits gold, the two gem-like wallet fields, hero tokens, the hero
// level-up and evolution items, other stackable items, and weapons.
// Download writes a new zip; it does not push anything to the VM.
// ---------------------------------------------------------------------------

const SaveEditor = {
  host: null,
  session: null,
  sourceLabel: '',
  error: '',
  loading: false,
  itemQuery: '',
  heroQuery: '',
  weaponQuery: '',
  addQuery: '',
  addPick: null,
  showZero: false,
  heroView: null, // null = closed, 'grid', or a costume id


  open() {
    UI.openModal(`
      <div class="modal-header">
        <h3>Save Editor</h3>
        <button class="modal-close" id="modal-close" type="button" aria-label="Close"></button>
      </div>
      <div class="modal-body" id="admin-save-editor"></div>
    `, {
      wide: true,
      onMount: () => {
        document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
        this.mount(document.getElementById('admin-save-editor'));
      },
    });
  },

  mount(host) {
    if (this.host !== host) {
      this.host = host;
      host.addEventListener('click', e => this.onClick(e));
      host.addEventListener('input', e => this.onInput(e));
      host.addEventListener('change', e => this.onChange(e));
    }
    if (!this._escBound) {
      this._escBound = true;
      // Runs before the modal's own Escape handler: close the hero window first.
      window.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || this.heroView == null || !this.host?.isConnected) return;
        e.stopImmediatePropagation();
        this.setHeroView(this.heroView === 'grid' ? null : 'grid');
      }, true);
    }
    this.render();
  },

  render() {
    const host = this.host;
    if (!host) return;
    host.innerHTML = this.shellHTML() + (this.session && this.heroView != null ? this.heroPopHTML() : '');
    this.renderLists();
  },

  shellHTML() {
    const s = this.session;
    return `
      <div class="action-row" style="margin-bottom:10px">
        <button type="button" class="btn btn-gold" id="se-load-vm" ${this.loading ? 'disabled' : ''}>${this.loading ? 'Loading…' : 'Load current save'}</button>
        <label class="btn" style="cursor:pointer">Choose a zip<input type="file" id="se-file" accept=".zip,application/zip" hidden ${this.loading ? 'disabled' : ''}></label>
        ${s ? `<button type="button" class="btn" id="se-reset">Reset edits</button>` : ''}
        ${s ? `<button type="button" class="btn btn-gold" id="se-download">Download edited save (.zip)</button>` : ''}
      </div>
      ${this.error ? `<div class="empty-state">${escapeHtml(this.error)}</div>` : ''}
      ${s ? this.loadedHTML() : `<p class="section-sub" style="margin:0">Load the backup from the game VM, or a zip you already downloaded. Gold, gems, hero levels, stars, rarity, and tokens, hero upgrade items, other stackable items, and weapons can be edited, then saved as a new zip.</p>`}
    `;
  },

  loadedHTML() {
    const s = this.session;
    const cur = s.groups.save_currency;
    const weap = s.groups.save_weap;
    const level = cur?.json.lv != null ? `Player level ${cur.json.lv}. ` : '';
    return `
      <p class="section-sub" style="margin:0 0 8px">${escapeHtml(level)}Source: ${escapeHtml(this.sourceLabel || 'zip')}.</p>
      <div class="caveat">Gold, BlueStone, and Gem are the wallet fields <span class="mono">gold</span>, <span class="mono">gem</span>, and <span class="mono">crystal</span>. The shop currency named Gem is <span class="mono">crystal</span>. BlueStone, the forge stone, is <span class="mono">gem</span>. Stack items use <span class="mono">StackableItemData.Type</span>. Close the game before copying the zip onto the device. Nothing here is uploaded.</div>
      ${cur ? `<h4 class="section-head" style="margin-top:16px">Money and gems</h4>${this.walletHTML(cur)}` : `<div class="caveat">No currency file in this zip.</div>`}
      ${this.pinnedItemsHTML()}
      ${this.heroesSectionHTML()}
      ${cur && !cur.stackLocked ? `
        <div class="action-row" style="margin:16px 0 8px;align-items:center;justify-content:space-between">
          <h4 class="section-head" style="margin:0">Stackable items</h4>
          <label class="fs-sub"><input type="checkbox" id="se-show-zero" ${this.showZero ? 'checked' : ''}> Show items at zero</label>
        </div>
        <p class="fs-sub" style="margin:0 0 6px">Elixir and S-Ticket are the cards above, including when the count is zero. Evolution Potion is with the heroes.</p>
        <input class="se-input" id="se-item-q" placeholder="Search items" value="${escapeHtml(this.itemQuery)}" autocomplete="off">
        <div class="se-list" id="se-items"></div>` : (cur?.stackLocked ? `<div class="caveat">The stack field is not a plain integer map, so item amounts were left unchanged.</div>` : '')}
      ${weap ? `
        <h4 class="section-head" style="margin-top:18px">Weapons</h4>
        <input class="se-input" id="se-weapon-q" placeholder="Search owned weapons" value="${escapeHtml(this.weaponQuery)}" autocomplete="off">
        <div class="se-list" id="se-weapons"></div>
        <div class="se-add">
          <input class="se-input" id="se-add-q" placeholder="Search the catalog to add a weapon" value="${escapeHtml(this.addQuery)}" autocomplete="off">
          <div class="se-picks" id="se-add-pick" role="listbox"></div>
          <div class="action-row">
            <label class="fs-sub">Level <input class="se-input se-amt" id="se-add-lv" inputmode="numeric" min="1" value="1" autocomplete="off"></label>
            <span class="fs-sub" id="se-add-cap">Pick a weapon to see its max level</span>
            <button type="button" class="btn" id="se-add">Add weapon</button>
            <span class="fs-sub" id="se-add-chosen"></span>
          </div>
        </div>` : `<div class="caveat">No weapon file in this zip.</div>`}
      <p class="fs-sub" id="se-status" style="margin-top:10px"></p>
    `;
  },

  walletHTML(cur) {
    const fields = [
      [0, 'gold', 'Gold'],
      [3, 'crystal', 'Gem'],
      [1, 'gem', 'BlueStone'],
    ];
    return `<div class="se-wallet">${fields.map(([type, key, fallback]) => {
      const item = Game.index.itemByType.get(type);
      const name = item?.Name_en || fallback;
      const value = cur.json[key];
      const editable = value != null && SaveEdit.canonDigit(String(value)) != null;
      return `<label class="se-wallet-card">
        ${item ? this.artHTML(Game.itemIcon(item), item.Rarity, name) : ''}
        <span>
          <span class="fs-title">${escapeHtml(name)}</span>
          <span class="fs-sub mono">${escapeHtml(key)}</span>
        </span>
        ${editable
          ? `<input class="se-input se-amt se-wallet" data-wallet="${key}" inputmode="numeric" autocomplete="off" value="${escapeHtml(String(value))}">`
          : `<span class="fs-sub">${value == null ? 'Not in this save' : escapeHtml(String(value))}</span>`}
      </label>`;
    }).join('')}</div>`;
  },

  // Always shown, including a zero count. Elixir is type 5. S-Ticket is
  // type 6002 (Stackable_TraitSuperTicket). Evolution Potion stays with heroes.
  pinnedItemsHTML() {
    const cur = this.session.groups.save_currency;
    if (!cur) return '';
    if (cur.stackLocked) return `<div class="caveat">The stack field is not a plain integer map, so Elixir and S-Ticket were left unchanged.</div>`;
    return `<h4 class="section-head" style="margin-top:16px">Elixir and S-Ticket</h4>${this.stackCardsHTML([[5, 'Elixir'], [6002, 'S-Ticket']])}`;
  },

  stackCardsHTML(fields) {
    const stack = SaveEdit.readStack(this.session) || {};
    return `<div class="se-wallet">${fields.map(([type, fallback]) => {
      const item = Game.index.itemByType.get(type);
      const name = item?.Name_en || fallback;
      const amount = stack[String(type)] || '0';
      return `<label class="se-wallet-card">
        ${item ? this.artHTML(Game.itemIcon(item), item.Rarity, name) : ''}
        <span>
          <span class="fs-title">${escapeHtml(name)}</span>
          <span class="fs-sub">${escapeHtml((item?.Desc_en || '').replace(/<[^>]+>/g, '') || `type ${type}`)}</span>
        </span>
        <input class="se-input se-amt se-stack" data-type="${type}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(name)} amount" value="${escapeHtml(amount)}">
      </label>`;
    }).join('')}</div>`;
  },

  heroesSectionHTML() {
    const cur = this.session.groups.save_currency;
    const costume = this.session.groups.save_costume;
    const items = cur && !cur.stackLocked
      ? this.stackCardsHTML([[8401, 'Evolution Potion']])
      : `<div class="caveat">${cur?.stackLocked ? 'The stack field is not a plain integer map, so Evolution Potion was left unchanged.' : 'No currency file in this zip, so Evolution Potion is not here.'}</div>`;
    let tokens;
    if (!costume) tokens = `<div class="caveat">No hero file in this zip.</div>`;
    else if (costume.heroesLocked) tokens = `<div class="caveat">Hero token counts are not plain integers, so the hero list was left unchanged.</div>`;
    else {
      const n = costume._editedHeroes?.size || 0;
      tokens = `<div class="action-row" style="align-items:center">
        <button type="button" class="btn btn-gold" id="se-heroes-open">Heroes</button>
        <span class="fs-sub">Level, stars, rarity, unlocked, and tokens for each hero.${n ? ` ${n} hero${n === 1 ? '' : 'es'} edited.` : ''}</span>
      </div>`;
    }
    return `
      <h4 class="section-head" style="margin-top:16px">Heroes</h4>
      <div class="caveat">Hero tokens are each hero's <span class="mono">PieceCount</span> in the costume save. <span class="mono">CostumeData.UnlockRequiredPieces</span> and each evolution row's <span class="mono">Cost_Piece</span> are piece costs. Elixir, the level-up item on every <span class="mono">CostumeLevelData</span> row, is in the cards above. Evolution Potion (type 8401) is the evolution item on every <span class="mono">CostumeEvolutionData</span> row. The Heroes button opens each hero's level, stars, rarity, unlocked flag, and tokens. A hero missing from the save is added as not unlocked, at level 1 and star 1 with its starting rarity, only when one of its values is changed (a token count of zero adds nothing).</div>
      <h4 class="section-head" style="margin-top:12px">Upgrade items</h4>
      ${items}
      <h4 class="section-head" style="margin-top:12px">Hero levels, stars, and tokens</h4>
      ${tokens}`;
  },

  heroRows() {
    const owned = SaveEdit.readHeroes(this.session) || {};
    const q = this.heroQuery.trim().toLowerCase();
    return Game.db.CostumeData.map(costume => ({ costume, status: owned[String(costume.id)] || null }))
      .filter(({ costume }) => {
        if (!q) return true;
        const name = (costume.Name_en || costume.Name || '').toLowerCase();
        return name.includes(q) || String(costume.id).includes(q);
      }).sort((a, b) => {
        const ap = a.status?.IsPurchased ? 0 : 1;
        const bp = b.status?.IsPurchased ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b.costume.rarity || 0) - (a.costume.rarity || 0)
          || (a.costume.Name_en || '').localeCompare(b.costume.Name_en || '')
          || a.costume.id - b.costume.id;
      });
  },

  heroName(costume) { return costume.Name_en || costume.Name || `Hero ${costume.id}`; },

  // Caps come from CostumeData (Max_Lv, Max_Grade) and the hero's
  // CostumeEvolutionData tiers. A saved value past a cap is kept as the cap,
  // same as weapons, so the editor never forces a value down.
  heroLimits(costume, cur) {
    const birth = +costume.rarity || 1;
    const maxLv = Math.max(+costume.Max_Lv || 1, cur.Level || 1);
    const maxGrade = Math.max(+costume.Max_Grade || 1, cur.Grade || 1);
    const tiers = new Set([birth, ...Formulas.heroEvolutionRows(costume).map(r => r.Rarity)]);
    if (Number.isInteger(cur.Rarity)) tiers.add(cur.Rarity);
    return { birth, maxLv, maxGrade, rarities: [...tiers].sort((x, y) => x - y) };
  },

  heroCurrent(costume, status) {
    return status
      ? { Level: status.Level, Grade: status.Grade, Rarity: status.Rarity, IsPurchased: !!status.IsPurchased, PieceCount: String(status.PieceCount) }
      : { Level: 1, Grade: 1, Rarity: +costume.rarity || 1, IsPurchased: false, PieceCount: '0' };
  },

  heroPopHTML() {
    const grid = this.heroView === 'grid';
    const costume = grid ? null : Game.index.costumeById.get(this.heroView);
    const title = grid || !costume ? 'Heroes' : 'Edit hero';
    return `<div class="se-pop" id="se-hero-pop" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="se-pop-panel">
        <div class="se-pop-head">
          ${grid ? '' : `<button type="button" class="btn btn-sm" id="se-hero-back">Back</button>`}
          <h4 class="section-head" style="margin:0;flex:1">${escapeHtml(title)}</h4>
          <button type="button" class="btn btn-sm" id="se-hero-close">Done</button>
        </div>
        ${grid || !costume ? this.heroGridHTML() : this.heroDetailHTML(costume)}
      </div>
    </div>`;
  },

  heroGridHTML() {
    return `<p class="fs-sub" style="margin:0 0 8px">Pick a hero to edit. Dimmed heroes are not unlocked. Edits stay in this session until you download the save.</p>
      <input class="se-input" id="se-hero-q" placeholder="Search heroes" value="${escapeHtml(this.heroQuery)}" autocomplete="off" style="width:100%">
      <div class="se-hero-grid" id="se-hero-grid">${this.heroCardsHTML()}</div>`;
  },

  heroCardsHTML() {
    const rows = this.heroRows();
    if (!rows.length) return `<div class="caveat">No heroes match.</div>`;
    const edited = this.session.groups.save_costume?._editedHeroes;
    return rows.map(({ costume, status }) => {
      const name = this.heroName(costume);
      const cur = this.heroCurrent(costume, status);
      const on = cur.IsPurchased;
      return `<button type="button" class="se-hero-card${on ? '' : ' locked'}" data-hero="${costume.id}">
        ${edited?.has(costume.id) ? '<span class="se-badge">edited</span>' : ''}
        ${this.artHTML(Game.heroIcon(costume), cur.Rarity, name)}
        <span class="fs-title">${escapeHtml(name)}</span>
        <span class="fs-sub">${status ? `Lv ${escapeHtml(String(cur.Level))} · ★${escapeHtml(String(cur.Grade))}` : 'Not in save'}</span>
        <span class="fs-sub">${escapeHtml(Game.rarityColor(cur.Rarity).name)}${on ? '' : ' · locked'}</span>
      </button>`;
    }).join('');
  },

  heroDetailHTML(costume) {
    const status = (SaveEdit.readHeroes(this.session) || {})[String(costume.id)] || null;
    const cur = this.heroCurrent(costume, status);
    const lim = this.heroLimits(costume, cur);
    const name = this.heroName(costume);
    const id = costume.id;
    const rarityOpts = lim.rarities.map(r => {
      const label = r === lim.birth ? `${Game.rarityColor(r).name} (starting)` : `${Game.rarityColor(r).name} (evolution)`;
      return `<option value="${r}" ${r === cur.Rarity ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const starOpts = Array.from({ length: lim.maxGrade }, (_, i) => i + 1)
      .map(g => `<option value="${g}" ${g === cur.Grade ? 'selected' : ''}>★ ${g}</option>`).join('');
    return `
      <div class="se-hero-top">
        ${this.artHTML(Game.heroIcon(costume), cur.Rarity, name)}
        <div class="se-main">
          <div class="fs-title">${escapeHtml(name)}</div>
          <div class="fs-sub" id="se-hero-sub">${escapeHtml(this.heroSub(costume))}</div>
        </div>
      </div>
      <div class="se-hero-form">
        <label class="se-field"><span class="fs-sub">Level (1 to ${lim.maxLv})</span>
          <input class="se-input se-hero-num" data-field="Level" data-max="${lim.maxLv}" data-hid="${id}" inputmode="numeric" autocomplete="off" value="${escapeHtml(String(cur.Level))}"></label>
        <label class="se-field"><span class="fs-sub">Stars (1 to ${lim.maxGrade})</span>
          <select class="se-input se-hero-sel" data-field="Grade" data-hid="${id}">${starOpts}</select></label>
        <label class="se-field"><span class="fs-sub">Rarity</span>
          ${lim.rarities.length > 1
            ? `<select class="se-input se-hero-sel" data-field="Rarity" data-hid="${id}">${rarityOpts}</select>`
            : `<span class="fs-sub">${escapeHtml(Game.rarityColor(cur.Rarity).name)}. No evolution tiers.</span>`}</label>
        <label class="se-field"><span class="fs-sub">Tokens</span>
          <input class="se-input se-amt se-piece" data-piece="${id}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(name)} tokens" value="${escapeHtml(cur.PieceCount)}"></label>
        <label class="se-field se-check"><input type="checkbox" class="se-hero-unlock" data-hid="${id}" ${cur.IsPurchased ? 'checked' : ''}> Unlocked</label>
      </div>
      <div id="se-hero-stats">${this.heroStatsHTML(costume, cur)}</div>
      <div class="caveat">Saved as <span class="mono">Level</span>, <span class="mono">Grade</span> (stars), <span class="mono">Rarity</span>, <span class="mono">IsPurchased</span>, and <span class="mono">PieceCount</span> in the costume save. Caps are <span class="mono">CostumeData.Max_Lv</span>, <span class="mono">Max_Grade</span>, and this hero's <span class="mono">CostumeEvolutionData</span> tiers. Attack and HP are not stored: the game computes them from these values. Nothing is spent (Elixir, tokens, Evolution Potion). <span class="mono">IsMaxRarity</span> and <span class="mono">UnlockedOptions</span> stay as saved, because what the game uses them for is not decoded. Whether the game re-checks these values on load is not confirmed.</div>`;
  },

  heroSub(costume) {
    const g = this.session.groups.save_costume;
    const inSave = !!(SaveEdit.readHeroes(this.session) || {})[String(costume.id)];
    const created = g?._createdHeroes?.has(costume.id);
    return `id ${costume.id} · starts ${Game.rarityColor(+costume.rarity || 1).name}${created ? ' · added by this editor as a new save row' : inSave ? '' : ' · not in this save yet (a change adds it)'}`;
  },

  heroStatsHTML(costume, cur) {
    const evoRarity = cur.Rarity > (+costume.rarity || 0) ? cur.Rarity : 0;
    const full = Formulas.heroFullStats(costume, { level: cur.Level, starGrade: cur.Grade, evoRarity });
    const interp = full.base.interpolated ? ' (interpolated)' : '';
    return `<div class="stat-list" style="margin:10px 0">
        <div class="stat-pill"><span class="stat-name">Attack${interp}</span><span class="stat-val">${fmtNum(full.base.attack)}</span></div>
        <div class="stat-pill"><span class="stat-name">HP${interp}</span><span class="stat-val">${fmtNum(full.base.hp)}</span></div>
      </div>
      ${full.bonuses.length ? `<div class="fs-sub">Bonuses: ${full.bonuses.map(b => escapeHtml(`${b.stat ? b.stat.Title_en : 'Stat ' + b.type} +${fmtNum(b.value)}`)).join(' · ')}</div>` : '<div class="fs-sub">No stat bonuses at these values.</div>'}`;
  },

  setHeroView(view) {
    this.heroView = view;
    if (view == null) this.heroQuery = '';
    const pop = this.host?.querySelector('#se-hero-pop');
    if (view == null) { this.render(); return; }
    const html = this.heroPopHTML();
    if (pop) pop.outerHTML = html; else this.host.insertAdjacentHTML('beforeend', html);
    this.host.querySelector(view === 'grid' ? '#se-hero-q' : '#se-hero-back')?.focus();
  },

  refreshHeroStats(costumeId) {
    const box = this.host?.querySelector('#se-hero-stats');
    const costume = Game.index.costumeById.get(costumeId);
    if (!box || !costume) return;
    const status = (SaveEdit.readHeroes(this.session) || {})[String(costumeId)] || null;
    box.innerHTML = this.heroStatsHTML(costume, this.heroCurrent(costume, status));
  },

  applyHeroField(el, field, value) {
    const id = +el.dataset.hid;
    const costume = Game.index.costumeById.get(id);
    if (!costume) { UI.toast('Unknown hero'); return; }
    const status = (SaveEdit.readHeroes(this.session) || {})[String(id)] || null;
    const lim = this.heroLimits(costume, this.heroCurrent(costume, status));
    const limits = field === 'Level' ? { max: lim.maxLv } : field === 'Grade' ? { max: lim.maxGrade } : field === 'Rarity' ? { allowed: lim.rarities } : null;
    try {
      SaveEdit.setHeroField(this.session, id, field, value, limits, { rarity: costume.rarity });
      el.classList.remove('invalid');
      this.refreshHeroStats(id);
      const sub = this.host.querySelector('#se-hero-sub');
      if (sub) sub.textContent = this.heroSub(costume);
      if (field === 'Rarity') {
        const ring = this.host.querySelector('.se-hero-top .se-icon');
        if (ring) ring.setAttribute('style', rarityStyle(value));
      }
      this.renderStatus();
    } catch (err) { el.classList.add('invalid'); UI.toast(err.message); }
  },

  itemRows() {
    const stack = SaveEdit.readStack(this.session) || {};
    const hidden = new Set([-1, 0, 1, 2, 3, 5, 6002, 8401]);
    const rows = [];
    const seen = new Set();
    for (const item of Game.db.StackableItemData) {
      if (item.Type == null || hidden.has(+item.Type)) continue;
      seen.add(+item.Type);
      rows.push({ item, type: +item.Type, amount: stack[String(item.Type)] || '0' });
    }
    for (const [k, amount] of Object.entries(stack)) {
      const type = +k;
      if (seen.has(type) || hidden.has(type)) continue;
      rows.push({ item: null, type, amount });
    }
    const q = this.itemQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (!this.showZero && SaveEdit.canonDigit(r.amount) === '0') return false;
      if (!q) return true;
      const folded = s => String(s || '').toLowerCase().replace(/[-_\s]/g, '');
      const name = folded(`${r.item?.Name_en || ''} ${r.item?.Name || ''}`);
      return name.includes(folded(q)) || String(r.type).includes(q);
    }).sort((a, b) => {
      const az = SaveEdit.canonDigit(a.amount) === '0' ? 1 : 0;
      const bz = SaveEdit.canonDigit(b.amount) === '0' ? 1 : 0;
      if (az !== bz) return az - bz;
      const an = a.item?.Name_en || a.item?.Name || '';
      const bn = b.item?.Name_en || b.item?.Name || '';
      return an.localeCompare(bn) || a.type - b.type;
    });
  },

  itemsHTML() {
    const rows = this.itemRows();
    if (!rows.length) return `<div class="caveat">No items match.</div>`;
    return rows.map(r => {
      const name = r.item?.Name_en || r.item?.Name || `Item type ${r.type}`;
      return `<div class="se-row">
        ${r.item ? this.artHTML(Game.itemIcon(r.item), r.item.Rarity, name) : ''}
        <div class="se-main"><div class="fs-title">${escapeHtml(name)}</div><div class="fs-sub mono">type ${r.type}</div></div>
        <input class="se-input se-amt se-stack" data-type="${r.type}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(name)} amount" value="${escapeHtml(r.amount)}">
      </div>`;
    }).join('');
  },

  weaponRows() {
    const owned = SaveEdit.readWeapons(this.session) || {};
    const equip = SaveEdit.readEquip(this.session);
    const slots = {};
    for (const [slot, uid] of Object.entries(equip)) {
      const id = String(uid);
      slots[id] = slots[id] ? `${slots[id]}, ${slot}` : slot;
    }
    const q = this.weaponQuery.trim().toLowerCase();
    const notes = this.session.groups.save_weap?.addedNotes;
    return Object.values(owned).map(w => {
      const def = Game.index.weaponById.get(w.WeaponId);
      return { w, def, slot: slots[String(w.UniqueId)] || '', note: notes?.get(w.UniqueId) || '' };
    }).filter(({ w, def }) => {
      if (!q) return true;
      const name = (def?.Name_en || '').toLowerCase();
      return name.includes(q) || String(w.WeaponId).includes(q) || String(w.UniqueId).includes(q);
    }).sort((a, b) => {
      if (!!a.slot !== !!b.slot) return a.slot ? -1 : 1;
      return (b.def?.Rarity || 0) - (a.def?.Rarity || 0) || (a.def?.Name_en || '').localeCompare(b.def?.Name_en || '') || a.w.UniqueId - b.w.UniqueId;
    });
  },

  maxLevel(def, current) {
    if (!def) return Math.max(current, 1);
    const row = Game.db.BalancingData_Rarity.find(r => r.Rarity === def.Rarity && r.Grade === def.Grade);
    return row ? Math.max(row.MaxLevel, current) : Math.max(current, 1);
  },

  weaponsHTML() {
    const rows = this.weaponRows();
    if (!rows.length) return `<div class="caveat">No weapons match.</div>`;
    return rows.map(({ w, def, slot, note }) => {
      const name = def?.Name_en || `Unknown weapon ${w.WeaponId}`;
      const cap = this.maxLevel(def, w.Level || 1);
      const capped = !!def && !!Game.db.BalancingData_Rarity.find(r => r.Rarity === def.Rarity && r.Grade === def.Grade);
      const rule = def ? Formulas.mergeRule(def.id) : null;
      const upgrade = rule
        ? `<button type="button" class="btn btn-sm" data-upgrade="${w.UniqueId}" data-label="${escapeHtml(name)}">Upgrade to ${escapeHtml(rule.next.Name_en)}</button>`
        : `<span class="fs-sub">No next tier</span>`;
      return `<div class="se-row" id="se-w-${w.UniqueId}">
        ${def ? this.artHTML(Game.weaponIcon(def), def.Rarity, name) : ''}
        <div class="se-main">
          <div class="fs-title">${def ? rarityTag(def.Rarity) : ''} ${escapeHtml(name)}</div>
          <div class="fs-sub">id ${w.WeaponId} · uid ${w.UniqueId}${slot ? ` · equipped slot ${escapeHtml(slot)}` : ''}${w.IsLock ? ' · locked' : ''}${capped ? '' : ' · no MaxLevel row for this rarity and grade'}</div>
          ${note ? `<div class="caveat">${escapeHtml(note)}</div>` : ''}
        </div>
        <label class="fs-sub">Lv <input class="se-input se-amt se-level" data-uid="${w.UniqueId}" data-cap="${cap}" min="1" max="${cap}" inputmode="numeric" autocomplete="off" aria-label="${escapeHtml(name)} level" value="${w.Level}"> <span>max ${cap}</span></label>
        ${upgrade}
        <button type="button" class="btn btn-sm btn-danger" data-remove="${w.UniqueId}" data-label="${escapeHtml(name)}">Remove</button>
      </div>`;
    }).join('');
  },

  catalog() {
    const q = this.addQuery.trim().toLowerCase();
    return Game.db.WeaponData.filter(w => {
      if (!q) return true;
      return (w.Name_en || '').toLowerCase().includes(q) || String(w.id).includes(q);
    }).sort((a, b) => (b.Rarity - a.Rarity) || (a.Name_en || '').localeCompare(b.Name_en || '') || a.id - b.id);
  },

  artHTML(src, rarity, name) {
    if (!src) return '';
    const hasTier = rarity != null && rarity !== '' && Number.isFinite(+rarity);
    const ring = hasTier ? ' rarity-ring' : '';
    const style = hasTier ? ` style="${rarityStyle(+rarity)}"` : '';
    return `<span class="se-icon${ring}"${style}><img loading="lazy" decoding="async" src="${escapeHtml(src)}" alt="${escapeHtml(name || '')}" onerror="onImgError(this)"></span>`;
  },

  picksHTML() {
    const rows = this.catalog();
    if (!rows.length) return `<div class="caveat">No match</div>`;
    return rows.map(w => {
      const name = w.Name_en || String(w.id);
      const on = this.addPick === w.id;
      const row = Game.db.BalancingData_Rarity.find(r => r.Rarity === w.Rarity && r.Grade === w.Grade);
      const cap = row ? ` · max ${row.MaxLevel}` : '';
      return `<button type="button" class="se-pick${on ? ' selected' : ''}" data-pick="${w.id}" role="option" aria-selected="${on ? 'true' : 'false'}">
        ${this.artHTML(Game.weaponIcon(w), w.Rarity, name)}
        <span class="se-main"><span class="fs-title">${escapeHtml(name)}</span><span class="fs-sub">${escapeHtml(Game.rarityColor(w.Rarity).name)} · ${w.id}${cap}</span></span>
      </button>`;
    }).join('');
  },

  syncChosen() {
    const el = this.host?.querySelector('#se-add-chosen');
    const capEl = this.host?.querySelector('#se-add-cap');
    const lv = this.host?.querySelector('#se-add-lv');
    if (!el) return;
    const w = this.addPick != null ? Game.index.weaponById.get(this.addPick) : null;
    if (!w) {
      el.textContent = '';
      if (capEl) capEl.textContent = 'Pick a weapon to see its max level';
      if (lv) { lv.removeAttribute('max'); lv.dataset.cap = ''; }
      return;
    }
    const cap = this.maxLevel(w, 1);
    const known = !!Game.db.BalancingData_Rarity.find(r => r.Rarity === w.Rarity && r.Grade === w.Grade);
    el.textContent = `Selected: ${w.Name_en || w.id}`;
    if (capEl) capEl.textContent = known ? `Max level ${cap}` : 'No MaxLevel row for this rarity and grade, so level 1 is the only accepted value';
    if (lv) {
      lv.max = String(cap);
      lv.dataset.cap = String(cap);
      const n = Number(lv.value.trim());
      lv.classList.toggle('invalid', !Number.isInteger(n) || n < 1 || n > cap);
    }
  },

  renderLists() {
    const items = this.host?.querySelector('#se-items');
    const weapons = this.host?.querySelector('#se-weapons');
    const picks = this.host?.querySelector('#se-add-pick');
    if (items) items.innerHTML = this.itemsHTML();
    if (weapons) weapons.innerHTML = this.weaponsHTML();
    if (picks) picks.innerHTML = this.picksHTML();
    this.syncChosen();
    this.renderStatus();
  },

  renderStatus() {
    const status = this.host?.querySelector('#se-status');
    if (!status || !this.session) return;
    const bits = [];
    if (this.session.groups.save_currency?.dirty) bits.push('currency changed');
    if (this.session.groups.save_costume?.dirty) bits.push('heroes changed');
    if (this.session.groups.save_weap?.dirty) bits.push('weapons changed');
    const cur = this.session.groups.save_currency;
    const costume = this.session.groups.save_costume;
    const weap = this.session.groups.save_weap;
    const slots = [];
    if (cur?.dirty) slots.push(`currency ×${cur.slots.length} at version ${cur.baseVersion + 1}`);
    if (costume?.dirty) slots.push(`heroes ×${costume.slots.length} at version ${costume.baseVersion + 1}`);
    if (weap?.dirty) slots.push(`weapons ×${weap.slots.length} at version ${weap.baseVersion + 1}`);
    status.textContent = bits.length
      ? `${bits.join(', ')}. Download writes ${slots.join(' and ')}. Other files are copied unchanged.`
      : 'No edits yet. A download before any edit is a byte-for-byte copy of the files you loaded, with the game’s encoded file names.';
  },

  bonusSpec(weapon) {
    const owned = Object.values(SaveEdit.readWeapons(this.session) || {}).find(w => w.WeaponId === weapon.id);
    if (owned) {
      return {
        bonusOptions: (owned.BonusOptions || []).map(o => ({ BonusOptionType: o.BonusOptionType, Value: o.Value })),
        placeholder: false,
        note: 'Bonus options were copied from your other copy of this weapon.',
      };
    }
    const row = Game.db.BalancingData_Rarity.find(r => r.Rarity === weapon.Rarity && r.Grade === weapon.Grade);
    if (!row) {
      return { bonusOptions: [], placeholder: true, note: 'No BalancingData_Rarity row for this rarity and grade, so no bonus options were added.' };
    }
    const options = Game.db.WeaponBonusOptionData.slice(0, row.BonusOptionCount).map(o => ({
      BonusOptionType: o.OptionType,
      Value: (o.MinValue + o.MaxValue) / 200,
    }));
    const note = row.BonusOptionCount
      ? `Bonus options are midpoints of the data ranges (${row.BonusOptionCount} of them, the count on BalancingData_Rarity). They are not a roll the game made.`
      : 'BalancingData_Rarity lists BonusOptionCount 0 for this rarity and grade, so no bonus options were added.';
    return { bonusOptions: options, placeholder: true, note };
  },

  async onClick(e) {
    const card = e.target.closest('[data-hero]');
    if (card && this.host?.contains(card)) { this.setHeroView(+card.dataset.hero); return; }
    if (e.target.id === 'se-hero-pop') { this.setHeroView(null); return; }
    const pickBtn = e.target.closest('.se-pick');
    if (pickBtn && this.host?.contains(pickBtn)) {
      this.addPick = +pickBtn.dataset.pick;
      for (const el of this.host.querySelectorAll('.se-pick')) {
        const on = el === pickBtn;
        el.classList.toggle('selected', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      this.syncChosen();
      return;
    }
    const t = e.target.closest('button, label');
    if (!t || !this.host?.contains(t)) return;
    if (t.id === 'se-load-vm') {
      this.loading = true; this.error = ''; this.render();
      try {
        const blob = await Admin.getGameSaves();
        await this.loadBlob(blob, 'current VM save');
      } catch (err) {
        this.error = err.message || 'Could not load the save';
      } finally {
        this.loading = false; this.render();
      }
      return;
    }
    if (t.id === 'se-reset') {
      if (!this._sourceEntries) return;
      try { this.session = SaveEdit.loadEntries(this._sourceEntries); this.error = ''; }
      catch (err) { this.error = err.message; }
      this.render();
      return;
    }
    if (t.id === 'se-download') { this.download(); return; }
    if (t.id === 'se-heroes-open') { this.setHeroView('grid'); return; }
    if (t.id === 'se-hero-back') { this.setHeroView('grid'); return; }
    if (t.id === 'se-hero-close') { this.setHeroView(null); return; }
    if (t.id === 'se-add') { this.addSelected(); return; }
    const up = e.target.closest('[data-upgrade]');
    if (up) { this.upgradeWeapon(+up.dataset.upgrade); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const name = rm.dataset.label || 'this weapon';
      if (!confirm(`Remove ${name} from the save?`)) return;
      try { SaveEdit.removeWeapon(this.session, +rm.dataset.remove); }
      catch (err) { UI.toast(err.message); return; }
      this.render();
    }
  },

  onChange(e) {
    if (e.target.id === 'se-file' && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      this.loading = true; this.error = ''; this.render();
      this.loadBlob(file, file.name).catch(err => { this.error = err.message || 'Could not read that zip'; })
        .finally(() => { this.loading = false; this.render(); });
    } else if (e.target.classList.contains('se-hero-sel')) {
      this.applyHeroField(e.target, e.target.dataset.field, Number(e.target.value));
    } else if (e.target.classList.contains('se-hero-unlock')) {
      this.applyHeroField(e.target, 'IsPurchased', e.target.checked);
    } else if (e.target.id === 'se-show-zero') {
      this.showZero = e.target.checked;
      this.renderLists();
    }
  },

  onInput(e) {
    const el = e.target;
    if (el.id === 'se-item-q') { this.itemQuery = el.value; this.renderLists(); return; }
    if (el.id === 'se-hero-q') { this.heroQuery = el.value; const grid = this.host.querySelector('#se-hero-grid'); if (grid) grid.innerHTML = this.heroCardsHTML(); return; }
    if (el.classList.contains('se-hero-num')) {
      const n = Number(el.value.trim());
      const max = +el.dataset.max;
      if (!el.value.trim() || !Number.isInteger(n) || n < 1 || n > max) { el.classList.add('invalid'); return; }
      this.applyHeroField(el, el.dataset.field, n);
      return;
    }
    if (el.id === 'se-weapon-q') { this.weaponQuery = el.value; this.renderLists(); return; }
    if (el.id === 'se-add-lv') { this.syncChosen(); return; }
    if (el.id === 'se-add-q') {
      this.addQuery = el.value;
      const picks = this.host.querySelector('#se-add-pick');
      if (picks) picks.innerHTML = this.picksHTML();
      return;
    }
    if (el.classList.contains('se-wallet')) {
      const d = SaveEdit.canonDigit(el.value.trim());
      el.classList.toggle('invalid', !d);
      if (!d) return;
      try { SaveEdit.setWallet(this.session, el.dataset.wallet, d); this.renderStatus(); }
      catch (err) { el.classList.add('invalid'); UI.toast(err.message); }
      return;
    }
    if (el.classList.contains('se-stack')) {
      const d = SaveEdit.canonDigit(el.value.trim());
      el.classList.toggle('invalid', !d);
      if (!d) return;
      try { SaveEdit.setStack(this.session, el.dataset.type, d); this.renderStatus(); }
      catch (err) { el.classList.add('invalid'); UI.toast(err.message); }
      return;
    }
    if (el.classList.contains('se-piece')) {
      const d = SaveEdit.canonDigit(el.value.trim());
      el.classList.toggle('invalid', !d);
      if (!d) return;
      const costume = Game.index.costumeById.get(+el.dataset.piece);
      try {
        SaveEdit.setHeroPieces(this.session, el.dataset.piece, d, costume ? { rarity: costume.rarity } : null);
        const sub = this.host.querySelector('#se-hero-sub');
        if (sub && costume) sub.textContent = this.heroSub(costume);
        this.renderStatus();
      } catch (err) { el.classList.add('invalid'); UI.toast(err.message); }
      return;
    }
    if (el.classList.contains('se-level')) {
      const n = Number(el.value.trim());
      const cap = +el.dataset.cap || 1000000;
      const ok = Number.isInteger(n) && n >= 1 && n <= cap;
      el.classList.toggle('invalid', !ok);
      if (!ok) return;
      try { SaveEdit.setWeaponLevel(this.session, +el.dataset.uid, n, +el.dataset.cap); this.renderStatus(); }
      catch (err) { el.classList.add('invalid'); UI.toast(err.message); }
    }
  },

  bonusAfterPromote(existing, next) {
    const row = Game.db.BalancingData_Rarity.find(r => r.Rarity === next.Rarity && r.Grade === next.Grade);
    if (!row) {
      const kept = SaveEdit.fillBonusOptions(existing, 0, []);
      return { bonusOptions: kept.bonusOptions, note: 'No BalancingData_Rarity row for the next tier, so its bonus options were left as they were.' };
    }
    const filled = SaveEdit.fillBonusOptions(existing, row.BonusOptionCount, Game.db.WeaponBonusOptionData);
    let note = '';
    if (filled.added) {
      note = `Added ${filled.added} bonus option${filled.added === 1 ? '' : 's'} at the midpoint of the data range so the copy has ${filled.bonusOptions.length}. BalancingData_Rarity lists ${row.BonusOptionCount} for this tier. Those new options are not a roll the game made. The options already on this copy were kept.`;
    } else if (filled.bonusOptions.length < row.BonusOptionCount) {
      note = `BalancingData_Rarity lists ${row.BonusOptionCount} bonus options for this tier. The option table did not have enough unused types to fill that, so this copy has ${filled.bonusOptions.length}.`;
    }
    return { bonusOptions: filled.bonusOptions, note };
  },

  upgradeWeapon(uid) {
    const owned = SaveEdit.readWeapons(this.session) || {};
    const w = owned[String(uid)];
    if (!w) { UI.toast('That weapon is not in this save'); return; }
    const def = Game.index.weaponById.get(w.WeaponId);
    const rule = def && Formulas.mergeRule(def.id);
    if (!rule) { UI.toast('This weapon has no next tier'); return; }
    const next = rule.next;
    const row = Game.db.BalancingData_Rarity.find(r => r.Rarity === next.Rarity && r.Grade === next.Grade);
    let level = Number.isInteger(w.Level) ? w.Level : 1;
    let levelNote;
    if (row && level > row.MaxLevel) {
      const from = level;
      level = row.MaxLevel;
      levelNote = `Its level was lowered from ${from} to ${level}, the MaxLevel on BalancingData_Rarity for this tier.`;
    } else if (!row) {
      levelNote = `Its level was kept at ${level}. There is no MaxLevel row for this tier.`;
    } else {
      levelNote = `Its level was kept at ${level}.`;
    }
    levelNote += ' A real merge does not have a decoded level carry-over.';
    const bonus = this.bonusAfterPromote(w.BonusOptions, next);
    const name = def.Name_en || `weapon ${def.id}`;
    const nextName = next.Name_en || `weapon ${next.id}`;
    const cost = rule.needsStone
      ? 'The game normally spends 2 copies plus 1 Transcendence Stone. This did not spend them.'
      : `The game normally spends ${rule.required} copies of the same weapon. This did not spend them.`;
    const msg = `Upgrade this ${name} to ${nextName} (${Game.rarityColor(next.Rarity).name})?\n\nThis changes only this copy. ${cost}\n${levelNote}${bonus.note ? '\n' + bonus.note : ''}`;
    if (!confirm(msg)) return;
    const note = `Upgraded from ${name} to ${nextName}. ${cost} ${levelNote}${bonus.note ? ' ' + bonus.note : ''}`;
    try { SaveEdit.promoteWeapon(this.session, uid, { weaponId: next.id, level, bonusOptions: bonus.bonusOptions, note }); }
    catch (err) { UI.toast(err.message); return; }
    this.render();
    this.host.querySelector(`#se-w-${uid}`)?.scrollIntoView({ block: 'nearest' });
  },

  addSelected() {
    const lv = this.host.querySelector('#se-add-lv');
    const weapon = Game.index.weaponById.get(this.addPick);
    if (!weapon) { UI.toast('Choose a weapon from the list'); return; }
    const cap = this.maxLevel(weapon, 1);
    const level = Number(lv.value.trim());
    if (!Number.isInteger(level) || level < 1 || level > cap) {
      lv.classList.add('invalid');
      UI.toast(cap === 1 && !Game.db.BalancingData_Rarity.find(r => r.Rarity === weapon.Rarity && r.Grade === weapon.Grade)
        ? 'No MaxLevel row for that weapon'
        : `Level must be a whole number from 1 to ${cap}`);
      return;
    }
    const spec = this.bonusSpec(weapon);
    let uid;
    try { uid = SaveEdit.addWeapon(this.session, { weaponId: weapon.id, level, maxLevel: cap, bonusOptions: spec.bonusOptions, placeholder: spec.placeholder, note: spec.note }); }
    catch (err) { UI.toast(err.message); return; }
    this.weaponQuery = '';
    this.render();
    this.host.querySelector(`#se-w-${uid}`)?.scrollIntoView({ block: 'nearest' });
  },

  async loadBlob(blob, label) {
    const files = await SaveImport.filesFromZip(blob);
    const entries = [];
    for (const f of files) entries.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    const session = SaveEdit.loadEntries(entries);
    this._sourceEntries = entries;
    this.session = session;
    this.sourceLabel = label;
    this.itemQuery = '';
    this.weaponQuery = '';
    this.addQuery = '';
    this.addPick = null;
    this.showZero = false;
    this.heroView = null;
    this.heroQuery = '';
    this.error = '';
  },

  download() {
    if (!this.session) return;
    if (this.host.querySelector('.se-input.invalid')) { UI.toast('Fix the highlighted values first'); return; }
    const files = SaveEdit.buildFiles(this.session);
    const zip = SaveEdit.zipStored(files);
    const blob = new Blob([zip], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xphero-save-edited-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    UI.toast('Edited save downloaded');
  },
};
