// ---------------------------------------------------------------------------
// ui-weapons.js — the 6-slot weapon loadout grid, a persistent "every
// weapon in the game" roster grid below it, a slot-scoped quick-pick
// modal, a per-weapon "your copies" list, and the per-copy level/bonus-
// roll detail modal.
//
// Every owned COPY of a weapon is its own entry in State.data.weaponRoster
// (keyed by a generated instanceId), independent of whether/where that
// specific copy is equipped — see the field comments in state.js for the
// full real-game evidence (WeaponStatus/WeaponMergeValidator, confirmed
// by decompilation 2026-10-24) behind this shape. A weaponId can have
// zero, one, or several owned copies at once, each independently leveled
// — matching the real game's own duplicate-ownership + merge mechanic,
// which this app doesn't automate (no Merge action yet) but no longer
// structurally prevents either.
// ---------------------------------------------------------------------------

const WeaponsUI = {

  // Layout matches the real in-game Equipment screen: 3 slots flanking each
  // side of a center hero-preview panel, slot 1 marked MAIN. Below that, a
  // persistent roster grid — every weapon in the game, ownership-aware
  // (not owned / 1 copy / multiple copies), the real screen's own
  // always-visible "WEAPON" grid, not a modal.
  render() {
    const grid = document.getElementById('weapon-slot-grid');
    const left = [0, 1, 2].map(i => this._slotHTML(State.data.weapons[i], i)).join('');
    const right = [3, 4, 5].map(i => this._slotHTML(State.data.weapons[i], i)).join('');
    const hero = State.getActiveHero();
    const costume = hero && Game.index.costumeById.get(hero.costumeId);
    grid.innerHTML = `
      <div class="equip-rig">
        <div class="equip-col">${left}</div>
        <div class="equip-center">
          ${costume ? `
            <div class="equip-center-portrait" style="${rarityStyle(costume.rarity)}"><img src="${Game.heroIcon(costume)}" onerror="onImgError(this)" alt=""></div>
            <div class="equip-center-name">${escapeHtml(costume.Name_en)}</div>` : `
            <div class="equip-center-portrait empty">?</div>
            <div class="equip-center-name" style="color:var(--ink-faint)">No active hero</div>`}
        </div>
        <div class="equip-col">${right}</div>
      </div>`;
    grid.querySelectorAll('.weapon-slot').forEach(el => {
      el.addEventListener('click', () => this.openPicker(Number(el.dataset.slot)));
    });
    this._renderRoster();
  },

  _renderRoster() {
    const grid = document.getElementById('weapon-roster-grid');
    if (!grid) return;
    const weapons = Game.db.WeaponData.slice().sort((a, b) => a.Category - b.Category || a.Rarity - b.Rarity);
    grid.innerHTML = weapons.map(w => this._rosterCardHTML(w)).join('');
    grid.querySelectorAll('[data-weapon]').forEach(el => {
      el.addEventListener('click', () => this.openWeaponEntry(Number(el.dataset.weapon)));
    });
  },

  // One card per weaponId in the catalog, ownership-aware: dimmed "not
  // owned" state, a plain level for exactly one copy, or a "×N" badge
  // (plus the highest-leveled copy's level) when multiple are owned.
  _rosterCardHTML(w) {
    const copies = State.getWeaponCopies(w.id);
    const equippedCount = copies.filter(c => State.data.weapons.includes(c.instanceId)).length;
    const r = Game.rarityColor(w.Rarity);
    const owned = copies.length > 0;
    const bestLevel = owned ? Math.max(...copies.map(c => c.level)) : null;
    return `
      <div class="picker-card weapon-roster-card${owned ? '' : ' weapon-roster-card--unowned'}" data-weapon="${w.id}" style="${rarityStyle(w.Rarity)}">
        ${equippedCount > 0 ? `<span class="pc-equipped-badge">EQUIPPED${equippedCount > 1 ? ` ×${equippedCount}` : ''}</span>` : ''}
        ${copies.length > 1 ? `<span class="pc-copies-badge">×${copies.length}</span>` : ''}
        <img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt="">
        <div class="pc-name">${escapeHtml(w.Name_en)}</div>
        <div class="pc-tag">${rarityPip(w.Rarity)}${r.name}</div>
        <div class="pc-level">${owned ? `Lv ${bestLevel}` : 'Not Owned'}</div>
      </div>`;
  },

  _slotHTML(instanceId, i) {
    const mainTag = i === 0 ? `<span class="slot-main-tag">MAIN</span>` : '';
    const ws = instanceId && State.getWeaponInstance(instanceId);
    const w = ws && Game.index.weaponById.get(ws.weaponId);
    if (!w) {
      return `
        <div class="weapon-slot" data-slot="${i}">
          ${mainTag}
          <span class="slot-level-badge slot-level-badge--empty">Lv —</span>
          <div class="slot-empty-icon">+</div>
        </div>`;
    }
    return `
      <div class="weapon-slot filled" data-slot="${i}" style="${rarityStyle(w.Rarity)}">
        ${mainTag}
        <span class="slot-level-badge">Lv ${ws.level}</span>
        <div class="slot-art"><img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt=""></div>
      </div>`;
  },

  // Shared entry point (roster grid, global search, and the quick-pick
  // picker all route through this) — resolves straight to a single
  // copy's detail view when there's exactly one, otherwise to the
  // copies list so the user picks which owned copy (or adds a new one).
  openWeaponEntry(weaponId, fromSlotIndex = null) {
    const copies = State.getWeaponCopies(weaponId);
    if (copies.length === 1) { this.openDetail(copies[0].instanceId, fromSlotIndex); return; }
    this.openCopiesList(weaponId, fromSlotIndex);
  },

  // Lists every owned copy of one weapon (icon, level, equipped-slot tag)
  // plus an "Add a copy" action — the real game's own grouping (owning
  // multiple copies of the same weapon, confirmed via decompiling
  // WeaponMergeValidator's `Dictionary<int, List<WeaponStatus>>`).
  openCopiesList(weaponId, fromSlotIndex = null) {
    const w = Game.index.weaponById.get(weaponId);

    const renderBody = () => {
      const copies = State.getWeaponCopies(weaponId)
        .slice()
        .sort((a, b) => b.level - a.level);
      body.innerHTML = `
        ${copies.length ? `<div class="picker-grid">${copies.map(c => this._copyCardHTML(w, c)).join('')}</div>` :
          `<p class="ur-sub">You don't own any copies of ${escapeHtml(w.Name_en)} yet.</p>`}
        <div class="action-row">
          <button class="btn btn-gold" id="add-copy-btn">+ Add ${copies.length ? 'Another' : 'a'} Copy</button>
          ${fromSlotIndex != null ? `<button class="btn" id="back-btn">← Back to list</button>` : ''}
        </div>`;
      body.querySelectorAll('[data-instance]').forEach(el => {
        el.addEventListener('click', () => this.openDetail(el.dataset.instance, fromSlotIndex));
      });
      document.getElementById('add-copy-btn').addEventListener('click', () => {
        const instanceId = State.addWeaponCopy(weaponId);
        this.openDetail(instanceId, fromSlotIndex);
      });
      document.getElementById('back-btn')?.addEventListener('click', () => this.openPicker(fromSlotIndex));
    };

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(w.Name_en)} — Your Copies</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    renderBody();
  },

  _copyCardHTML(w, copy) {
    const slotIndex = State.data.weapons.indexOf(copy.instanceId);
    return `
      <div class="picker-card weapon-roster-card" data-instance="${copy.instanceId}" style="${rarityStyle(w.Rarity)}">
        ${slotIndex !== -1 ? `<span class="pc-equipped-badge">SLOT ${slotIndex + 1}</span>` : ''}
        <img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt="">
        <div class="pc-level">Lv ${copy.level}</div>
      </div>`;
  },

  // Slot-scoped quick-pick: clicking any of the 6 equip slots (empty or
  // filled) opens this, scoped to swapping that one slot specifically.
  openPicker(slotIndex) {
    const currentInstanceId = State.data.weapons[slotIndex];
    const state = { category: 'all' };

    const renderBody = () => {
      const weapons = Game.db.WeaponData
        .filter(w => state.category === 'all' || w.Category === state.category)
        .sort((a, b) => a.Category - b.Category || a.Rarity - b.Rarity);

      const cats = Game.db.WeaponCategoryData;
      const filterHTML = `
        <div class="picker-filters">
          <button class="chip ${state.category === 'all' ? 'active' : ''}" data-cat="all">All</button>
          ${cats.map(c => `<button class="chip ${state.category === c.id ? 'active' : ''}" data-cat="${c.id}">${escapeHtml(c.Name_en)}</button>`).join('')}
        </div>
        <div class="picker-grid">
          ${weapons.map(w => {
            const equippedHere = State.getWeaponCopies(w.id).some(c => c.instanceId === currentInstanceId);
            const card = this._rosterCardHTML(w);
            return equippedHere ? card.replace('class="picker-card weapon-roster-card"', 'class="picker-card weapon-roster-card selected"') : card;
          }).join('')}
        </div>`;
      body.innerHTML = filterHTML;
      body.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => {
        state.category = el.dataset.cat === 'all' ? 'all' : Number(el.dataset.cat);
        renderBody();
      }));
      body.querySelectorAll('[data-weapon]').forEach(el => el.addEventListener('click', () => {
        this.openWeaponEntry(Number(el.dataset.weapon), slotIndex);
      }));
    };

    UI.openModal(`
      <div class="modal-header">
        <h3>Weapon ${slotIndex + 1} — Choose Weapon</h3>
        ${currentInstanceId ? `<button class="btn btn-sm btn-danger" id="unequip-btn">Unequip</button>` : ''}
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('unequip-btn')?.addEventListener('click', () => {
      State.clearWeaponSlot(slotIndex);
      UI.closeModal();
      UI.toast('Weapon unequipped — its level and rolls are kept, find it in the weapon roster below');
    });
    renderBody();
  },

  // instanceId is the primary key (one specific owned copy). `fromSlotIndex`
  // is optional context: set when opened via openPicker's "fill this one
  // slot" flow (shows a single "Equip to Slot N" button); left null when
  // opened from the standalone roster grid, the copies list, or search.
  openDetail(instanceId, fromSlotIndex = null) {
    const owned = State.getWeaponInstance(instanceId);
    if (!owned) { UI.closeModal(); return; } // copy was removed elsewhere — bail safely
    const w = Game.index.weaponById.get(owned.weaponId);
    const rarityRow = Formulas.rarityRow(w);
    const maxLevel = Formulas.weaponMaxLevel(w);

    // draft is a local, unsaved working copy — "Save Changes"/"Equip"/
    // "Unequip" below all commit it to the roster explicitly, so a
    // half-adjusted slider never silently persists on its own.
    const draft = { level: owned.level, bonusRolls: [...(owned.bonusRolls || [])] };

    const r = Game.rarityColor(w.Rarity);
    const chain = Game.weaponChain(w.id);
    const bonusPool = Formulas.bonusOptionPool();

    const commitDraft = () => {
      State.setWeaponLevel(instanceId, draft.level);
      State.setWeaponBonusRolls(instanceId, draft.bonusRolls);
    };

    const renderBody = () => {
      const equippedSlotIndex = State.data.weapons.indexOf(instanceId);
      const otherCopies = State.getWeaponCopies(w.id).filter(c => c.instanceId !== instanceId);
      const dps = Formulas.weaponDPS(w, draft.level);
      const scrollCost = Formulas.scrollCostForLevel(draft.level);
      const maxAffixes = rarityRow ? rarityRow.BonusOptionCount : 0;
      const previewSlot = equippedSlotIndex !== -1 ? equippedSlotIndex : (fromSlotIndex ?? 0);
      const levelBonusRows = Formulas.weaponLevelBonusRows(w, previewSlot, draft.level);

      const equipControlsHTML = (() => {
        if (equippedSlotIndex !== -1) {
          return `<button class="btn" id="unequip-btn">Unequip (keeps level &amp; rolls)</button>`;
        }
        if (fromSlotIndex != null) {
          return `<button class="btn btn-gold" id="equip-btn" data-slot="${fromSlotIndex}">Equip to Slot ${fromSlotIndex + 1}</button>`;
        }
        return `
          <div class="weapon-equip-choices">
            <div class="ur-sub" style="width:100%;margin-bottom:4px">Equip to:</div>
            ${State.data.weapons.map((id, i) => {
              const curWs = id && State.getWeaponInstance(id);
              const curW = curWs && Game.index.weaponById.get(curWs.weaponId);
              const label = curW ? `Slot ${i + 1} (replace ${escapeHtml(curW.Name_en)} Lv ${curWs.level})` : `Slot ${i + 1} (empty)`;
              return `<button class="btn btn-sm" data-equip-slot="${i}">${label}</button>`;
            }).join('')}
          </div>`;
      })();

      body.innerHTML = `
        <div class="detail-layout">
          <div>
            <div class="detail-art" style="${rarityStyle(w.Rarity)}"><img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt=""></div>
            ${chain.length > 1 ? `
              <div style="margin-top:10px;font-size:.74rem;color:var(--ink-muted)">
                Fusion chain: ${chain.map(c => c.id === w.id ? `<b style="color:var(--ink)">${escapeHtml(c.Name_en)}</b>` : escapeHtml(c.Name_en)).join(' → ')}
              </div>` : ''}
          </div>
          <div>
            <div class="detail-name">${escapeHtml(w.Name_en)}</div>
            <div class="detail-tags">
              ${rarityTag(w.Rarity)}
              <span class="tag">${escapeHtml(weaponCategoryName(w.Category))} · ${escapeHtml(weaponClassName(w.Category))}</span>
              <span class="tag">${w.IsRanged ? 'Ranged' : 'Melee'}</span>
              <span class="tag">Grade ${w.Grade}</span>
              ${equippedSlotIndex !== -1 ? `<span class="tag" style="color:var(--gold)">Equipped — Slot ${equippedSlotIndex + 1}</span>` : ''}
              ${otherCopies.length ? `<span class="tag">+${otherCopies.length} other cop${otherCopies.length > 1 ? 'ies' : 'y'} owned</span>` : ''}
            </div>
            ${w.Story_en ? `<div class="detail-desc">${escapeHtml(w.Story_en)}</div>` : ''}

            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Atk Speed</span><span class="stat-val">${fmtNum(w.AtkSpeed)}/s</span></div>
              <div class="stat-pill"><span class="stat-name">Atk Range</span><span class="stat-val">${fmtNum(w.AtkRange)}</span></div>
              <div class="stat-pill"><span class="stat-name">Splash Count</span><span class="stat-val">${fmtNum(w.SplashAtkCount)}</span></div>
              <div class="stat-pill"><span class="stat-name">Max Level</span><span class="stat-val">${maxLevel}</span></div>
            </div>

            <h4 style="margin:14px 0 6px;font-size:.9rem">Upgrade Level</h4>
            ${levelControlHTML('lvl-slider', 1, maxLevel, draft.level, `${draft.level} / ${maxLevel}`)}
            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Weapon DPS (this copy's slice)</span><span class="stat-val">${fmtNum(dps.total)}</span></div>
              <div class="stat-pill"><span class="stat-name">Rarity Multiplier</span><span class="stat-val">×${fmtNum(dps.mult)}</span></div>
              <div class="stat-pill"><span class="stat-name">Scroll cost (this level)</span><span class="stat-val">${scrollCost != null ? fmtNum(scrollCost) : '—'}</span></div>
            </div>
            <div class="caveat">DPS = base ${fmtNum(dps.base)} + ${fmtNum(dps.perLevel)} × (level−1), from this weapon's rarity/grade tier data. Confirmed by decompiling the game's real Dps formula: your actual in-game Dps stat multiplies this weapon's contribution by three more percentage brackets from your player level, ability/extra/special/soul upgrades, hero grade/level/evolution, VIP, and trait roll all at once — so this number is this weapon's own slice, not your full build's Dps. See docs/game_logic_deep_dive.md for the exact formula.</div>

            ${levelBonusRows.length ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Level-Up Bonuses <span style="color:var(--ink-muted);font-weight:500">(fixed, unlocks automatically as this copy's level crosses each threshold)</span></h4>
              <div class="milestone-list">${this._levelBonusListHTML(levelBonusRows)}</div>
            ` : ''}

            ${maxAffixes > 0 ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Rolled Bonus Affixes <span style="color:var(--ink-muted);font-weight:500">(random — this rarity rolls up to ${maxAffixes})</span></h4>
              <div id="affix-list">${this._affixListHTML(draft, bonusPool, maxAffixes)}</div>
            ` : ''}

            <div class="action-row">
              <button class="btn btn-gold" id="save-btn">Save Changes</button>
              ${equipControlsHTML}
              ${otherCopies.length ? `<button class="btn" id="copies-btn">View All ${otherCopies.length + 1} Copies</button>` : ''}
              ${chain.length > 1 ? `<button class="btn" id="tier-btn">View Fusion Chain</button>` : ''}
              <button class="btn btn-danger" id="remove-btn">Remove This Copy</button>
              ${fromSlotIndex != null ? `<button class="btn" id="back-btn">← Back to list</button>` : ''}
            </div>
          </div>
        </div>`;

      wireLevelControl('lvl-slider', (level) => { draft.level = level; renderBody(); });
      document.getElementById('back-btn')?.addEventListener('click', () => this.openPicker(fromSlotIndex));
      document.getElementById('copies-btn')?.addEventListener('click', () => this.openCopiesList(w.id, fromSlotIndex));
      document.getElementById('save-btn').addEventListener('click', () => {
        commitDraft();
        UI.closeModal();
        UI.toast(`${w.Name_en} saved — Lv ${draft.level}`);
      });
      document.getElementById('unequip-btn')?.addEventListener('click', () => {
        commitDraft();
        State.clearWeaponSlot(equippedSlotIndex);
        UI.closeModal();
        UI.toast('Weapon unequipped — its level and rolls are kept');
      });
      document.getElementById('equip-btn')?.addEventListener('click', (e) => {
        const slot = Number(e.target.dataset.slot);
        commitDraft();
        State.equipWeapon(slot, instanceId);
        UI.closeModal();
        UI.toast(`Equipped to Weapon ${slot + 1}`);
      });
      body.querySelectorAll('[data-equip-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = Number(btn.dataset.equipSlot);
          commitDraft();
          State.equipWeapon(slot, instanceId);
          UI.closeModal();
          UI.toast(`Equipped to Weapon ${slot + 1}`);
        });
      });
      document.getElementById('remove-btn').addEventListener('click', () => {
        if (!confirm(`Remove this copy of ${w.Name_en} (Lv ${draft.level})? This can't be undone.`)) return;
        State.removeWeaponCopy(instanceId);
        UI.closeModal();
        UI.toast('Copy removed');
      });
      this._wireAffixEvents(draft, bonusPool, maxAffixes, renderBody);
    };

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(w.Name_en)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    renderBody();
  },

  _levelBonusListHTML(rows) {
    return rows.map(({ row, requiredLevel, unlocked, slotOk }) => {
      const pct = fmtNum(row.Amount * 100);
      const slotTag = row.SlotType === 1 ? ' · Main slot only' : row.SlotType === 2 ? ' · Off-hand slots only' : '';
      const active = unlocked && slotOk;
      const levelLabel = Number.isFinite(requiredLevel) ? `Level ${requiredLevel}` : 'unknown level';
      return `
        <div class="milestone-row${active ? '' : ' milestone-row--locked'}">
          ${active ? '' : '🔒 '}${escapeHtml(row.PropertyName_en)} +${pct}%
          <span style="color:var(--ink-muted);font-weight:500"> — unlocks at ${levelLabel}${slotTag}${unlocked && !slotOk ? ' (wrong slot for this weapon)' : ''}</span>
        </div>`;
    }).join('');
  },

  _affixListHTML(draft, pool, maxAffixes) {
    return pool.map(opt => {
      const roll = draft.bonusRolls.find(r => r.optionId === opt.id);
      const checked = !!roll;
      const disabled = !checked && draft.bonusRolls.length >= maxAffixes;
      const pct = roll ? roll.pct : 50;
      const val = opt.MinValue + (pct / 100) * (opt.MaxValue - opt.MinValue);
      return `
        <div class="stat-pill" style="flex-direction:column;align-items:stretch;gap:6px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" data-affix="${opt.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span class="stat-name" style="flex:1">${escapeHtml((opt.PropertyName_en || '').replace('{0}', ''))}</span>
            <span class="stat-val">${checked ? `+${fmtNum((val - 1) * 100)}%` : '—'}</span>
          </label>
          ${checked ? levelControlHTML(`affix-roll-${opt.id}`, 0, 100, pct, `${pct}%`) : ''}
        </div>`;
    }).join('');
  },

  _wireAffixEvents(draft, pool, maxAffixes, rerender) {
    document.querySelectorAll('[data-affix]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.affix);
        if (e.target.checked) {
          if (draft.bonusRolls.length < maxAffixes) draft.bonusRolls.push({ optionId: id, pct: 50 });
        } else {
          draft.bonusRolls = draft.bonusRolls.filter(r => r.optionId !== id);
        }
        rerender();
      });
    });
    draft.bonusRolls.forEach(roll => {
      wireLevelControl(`affix-roll-${roll.optionId}`, (pct) => { roll.pct = pct; rerender(); });
    });
  },
};
