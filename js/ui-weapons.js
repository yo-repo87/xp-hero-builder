// ---------------------------------------------------------------------------
// ui-weapons.js — the 6-slot weapon loadout grid, a persistent "every
// weapon in the game" roster grid below it, a slot-scoped quick-pick
// modal, and the per-weapon level/bonus-roll detail modal.
//
// Weapon level/bonusRolls live in State.data.weaponRoster, keyed by
// weaponId, independent of whether (or where) that weapon is currently
// equipped — see the field comment in state.js for the full writeup.
// This mirrors the real game directly: a direct user report with 3 real
// screenshots (2026-10-24) showed every weapon in the whole catalog is
// always browsable/levelable (shown "Lv.1" by default, not absent) and
// keeps its own level even while unequipped — this app previously stored
// level/rolls INSIDE the equip slot itself, so swapping a weapon out of a
// slot silently discarded its progress. See "Weapon roster" in CLAUDE.md.
// ---------------------------------------------------------------------------

const WeaponsUI = {

  // Layout matches the real in-game Equipment screen: 3 slots flanking each
  // side of a center hero-preview panel, slot 1 marked MAIN (real screen's
  // top-left slot is a distinct, larger "main hand" slot). Below that, a
  // persistent roster grid (every weapon in the game, real level, EQUIPPED
  // tag) — the real screen's own always-visible "WEAPON" grid, not a modal.
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
      el.addEventListener('click', () => this.openDetail(Number(el.dataset.weapon)));
    });
  },

  _rosterCardHTML(w) {
    const slotIndex = State.data.weapons.indexOf(w.id);
    const ws = State.getWeaponState(w.id);
    const r = Game.rarityColor(w.Rarity);
    return `
      <div class="picker-card weapon-roster-card" data-weapon="${w.id}" style="${rarityStyle(w.Rarity)}">
        ${slotIndex !== -1 ? `<span class="pc-equipped-badge">EQUIPPED</span>` : ''}
        <img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt="">
        <div class="pc-name">${escapeHtml(w.Name_en)}</div>
        <div class="pc-tag">${rarityPip(w.Rarity)}${r.name}</div>
        <div class="pc-level">Lv ${ws.level}</div>
      </div>`;
  },

  _slotHTML(weaponId, i) {
    const mainTag = i === 0 ? `<span class="slot-main-tag">MAIN</span>` : '';
    const w = weaponId && Game.index.weaponById.get(weaponId);
    if (!w) {
      return `
        <div class="weapon-slot" data-slot="${i}">
          ${mainTag}
          <span class="slot-level-badge slot-level-badge--empty">Lv —</span>
          <div class="slot-empty-icon">+</div>
        </div>`;
    }
    const ws = State.getWeaponState(weaponId);
    return `
      <div class="weapon-slot filled" data-slot="${i}" style="${rarityStyle(w.Rarity)}">
        ${mainTag}
        <span class="slot-level-badge">Lv ${ws.level}</span>
        <div class="slot-art"><img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt=""></div>
      </div>`;
  },

  // Slot-scoped quick-pick: clicking any of the 6 equip slots (empty or
  // filled) opens this, scoped to swapping that one slot specifically.
  // The standalone roster grid below the rig is the other, unscoped way
  // to reach a weapon's detail view (see _renderRoster above).
  openPicker(slotIndex) {
    const currentWeaponId = State.data.weapons[slotIndex];
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
            const isCurrent = currentWeaponId === w.id;
            const card = this._rosterCardHTML(w);
            return isCurrent ? card.replace('class="picker-card weapon-roster-card"', 'class="picker-card weapon-roster-card selected"') : card;
          }).join('')}
        </div>`;
      body.innerHTML = filterHTML;
      body.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => {
        state.category = el.dataset.cat === 'all' ? 'all' : Number(el.dataset.cat);
        renderBody();
      }));
      body.querySelectorAll('[data-weapon]').forEach(el => el.addEventListener('click', () => {
        this.openDetail(Number(el.dataset.weapon), slotIndex);
      }));
    };

    UI.openModal(`
      <div class="modal-header">
        <h3>Weapon ${slotIndex + 1} — Choose Weapon</h3>
        ${currentWeaponId ? `<button class="btn btn-sm btn-danger" id="unequip-btn">Unequip</button>` : ''}
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('unequip-btn')?.addEventListener('click', () => {
      State.clearWeaponSlot(slotIndex);
      UI.closeModal();
      UI.toast('Weapon unequipped — its level and rolls are kept, find it again in the weapon roster below');
    });
    renderBody();
  },

  // weaponId is always the primary key now (level/rolls live in the
  // roster, not in any one slot). `fromSlotIndex` is optional context:
  // set when opened via openPicker's "fill this one empty/filled slot"
  // flow (shows a single "Equip to Slot N" button and a "Back to list"
  // link back to that picker); left null when opened from the standalone
  // roster grid or global search (shows a per-slot equip choice instead,
  // since there's no single slot already implied).
  openDetail(weaponId, fromSlotIndex = null) {
    const w = Game.index.weaponById.get(weaponId);
    const rarityRow = Formulas.rarityRow(w);
    const maxLevel = Formulas.weaponMaxLevel(w);
    const equippedSlotIndex = State.data.weapons.indexOf(weaponId);
    const ws = State.getWeaponState(weaponId);

    // draft is a local, unsaved working copy — "Save Changes"/"Equip"/
    // "Unequip" below all commit it to the roster explicitly, so a
    // half-adjusted slider never silently persists on its own.
    const draft = { level: ws.level, bonusRolls: [...(ws.bonusRolls || [])] };

    const r = Game.rarityColor(w.Rarity);
    const chain = Game.weaponChain(w.id);
    const bonusPool = Formulas.bonusOptionPool();

    const commitDraft = () => {
      State.setWeaponLevel(weaponId, draft.level);
      State.setWeaponBonusRolls(weaponId, draft.bonusRolls);
    };

    const renderBody = () => {
      const dps = Formulas.weaponDPS(w, draft.level);
      const scrollCost = Formulas.scrollCostForLevel(draft.level);
      const maxAffixes = rarityRow ? rarityRow.BonusOptionCount : 0;
      // Level-bonus SlotType preview: use the real equipped slot if this
      // weapon is currently in one, else whichever slot this view was
      // opened for (quick-pick flow), else slot 0 as a neutral default —
      // cosmetic preview only, doesn't change what's actually saved.
      const previewSlot = equippedSlotIndex !== -1 ? equippedSlotIndex : (fromSlotIndex ?? 0);
      const levelBonusRows = Formulas.weaponLevelBonusRows(w, previewSlot, draft.level);

      const equipControlsHTML = (() => {
        if (equippedSlotIndex !== -1) {
          return `<button class="btn" id="unequip-btn">Unequip (keeps level &amp; rolls)</button>`;
        }
        if (fromSlotIndex != null) {
          return `<button class="btn btn-gold" id="equip-btn" data-slot="${fromSlotIndex}">Equip to Slot ${fromSlotIndex + 1}</button>`;
        }
        // Opened unscoped (roster grid / search) and not currently
        // equipped anywhere — offer every slot explicitly rather than
        // guessing which one the user wants replaced.
        return `
          <div class="weapon-equip-choices">
            <div class="ur-sub" style="width:100%;margin-bottom:4px">Equip to:</div>
            ${State.data.weapons.map((id, i) => {
              const cur = id && Game.index.weaponById.get(id);
              const label = cur ? `Slot ${i + 1} (replace ${escapeHtml(cur.Name_en)})` : `Slot ${i + 1} (empty)`;
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
              <div class="stat-pill"><span class="stat-name">Weapon DPS (this weapon's slice)</span><span class="stat-val">${fmtNum(dps.total)}</span></div>
              <div class="stat-pill"><span class="stat-name">Rarity Multiplier</span><span class="stat-val">×${fmtNum(dps.mult)}</span></div>
              <div class="stat-pill"><span class="stat-name">Scroll cost (this level)</span><span class="stat-val">${scrollCost != null ? fmtNum(scrollCost) : '—'}</span></div>
            </div>
            <div class="caveat">DPS = base ${fmtNum(dps.base)} + ${fmtNum(dps.perLevel)} × (level−1), from this weapon's rarity/grade tier data. Confirmed by decompiling the game's real Dps formula: your actual in-game Dps stat multiplies this weapon's contribution by three more percentage brackets from your player level, ability/extra/special/soul upgrades, hero grade/level/evolution, VIP, and trait roll all at once — so this number is this weapon's own slice, not your full build's Dps. See docs/game_logic_deep_dive.md for the exact formula.</div>

            ${levelBonusRows.length ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Level-Up Bonuses <span style="color:var(--ink-muted);font-weight:500">(fixed, unlocks automatically as this weapon's level crosses each threshold)</span></h4>
              <div class="milestone-list">${this._levelBonusListHTML(levelBonusRows)}</div>
            ` : ''}

            ${maxAffixes > 0 ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Rolled Bonus Affixes <span style="color:var(--ink-muted);font-weight:500">(random — this rarity rolls up to ${maxAffixes})</span></h4>
              <div id="affix-list">${this._affixListHTML(draft, bonusPool, maxAffixes)}</div>
            ` : ''}

            <div class="action-row">
              <button class="btn btn-gold" id="save-btn">Save Changes</button>
              ${equipControlsHTML}
              ${chain.length > 1 ? `<button class="btn" id="tier-btn">View Fusion Chain</button>` : ''}
              ${fromSlotIndex != null ? `<button class="btn" id="back-btn">← Back to list</button>` : ''}
            </div>
          </div>
        </div>`;

      wireLevelControl('lvl-slider', (level) => { draft.level = level; renderBody(); });
      document.getElementById('back-btn')?.addEventListener('click', () => this.openPicker(fromSlotIndex));
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
        State.equipWeapon(slot, weaponId);
        UI.closeModal();
        UI.toast(`Equipped to Weapon ${slot + 1}`);
      });
      body.querySelectorAll('[data-equip-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = Number(btn.dataset.equipSlot);
          commitDraft();
          State.equipWeapon(slot, weaponId);
          UI.closeModal();
          UI.toast(`Equipped to Weapon ${slot + 1}`);
        });
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
