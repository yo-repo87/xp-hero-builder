// ---------------------------------------------------------------------------
// ui-weapons.js — the 6-slot weapon loadout grid + weapon picker/upgrade modal.
// ---------------------------------------------------------------------------

const WeaponsUI = {

  // Layout matches the real in-game Equipment screen: 3 slots flanking each
  // side of a center hero-preview panel, slot 1 marked MAIN (real screen's
  // top-left slot is a distinct, larger "main hand" slot).
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
  },

  _slotHTML(slot, i) {
    const mainTag = i === 0 ? `<span class="slot-main-tag">MAIN</span>` : '';
    if (!slot) {
      return `
        <div class="weapon-slot" data-slot="${i}">
          ${mainTag}
          <span class="slot-level-badge slot-level-badge--empty">Lv —</span>
          <div class="slot-empty-icon">+</div>
        </div>`;
    }
    const w = Game.index.weaponById.get(slot.weaponId);
    if (!w) return this._slotHTML(null, i);
    return `
      <div class="weapon-slot filled" data-slot="${i}" style="${rarityStyle(w.Rarity)}">
        ${mainTag}
        <span class="slot-level-badge">Lv ${slot.level}</span>
        <div class="slot-art"><img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt=""></div>
      </div>`;
  },

  openPicker(slotIndex) {
    const currentSlot = State.data.weapons[slotIndex];
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
            const r = Game.rarityColor(w.Rarity);
            const isCurrent = currentSlot && currentSlot.weaponId === w.id;
            return `
              <div class="picker-card ${isCurrent ? 'selected' : ''}" data-weapon="${w.id}" style="${rarityStyle(w.Rarity)}">
                <img src="${Game.weaponIcon(w)}" onerror="onImgError(this)" alt="">
                <div class="pc-name">${escapeHtml(w.Name_en)}</div>
                <div class="pc-tag">${rarityPip(w.Rarity)}${r.name}</div>
              </div>`;
          }).join('')}
        </div>`;
      body.innerHTML = filterHTML;
      body.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => {
        state.category = el.dataset.cat === 'all' ? 'all' : Number(el.dataset.cat);
        renderBody();
      }));
      body.querySelectorAll('[data-weapon]').forEach(el => el.addEventListener('click', () => {
        this.openDetail(slotIndex, Number(el.dataset.weapon));
      }));
    };

    UI.openModal(`
      <div class="modal-header">
        <h3>Weapon ${slotIndex + 1} — Choose Weapon</h3>
        ${currentSlot ? `<button class="btn btn-sm btn-danger" id="unequip-btn">Unequip</button>` : ''}
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('unequip-btn')?.addEventListener('click', () => {
      State.clearWeaponSlot(slotIndex);
      UI.closeModal();
      UI.toast('Weapon unequipped');
    });
    renderBody();
  },

  openDetail(slotIndex, weaponId) {
    const w = Game.index.weaponById.get(weaponId);
    const rarityRow = Formulas.rarityRow(w);
    const maxLevel = Formulas.weaponMaxLevel(w);
    const currentSlot = State.data.weapons[slotIndex];
    const isEquippedHere = currentSlot && currentSlot.weaponId === weaponId;

    // draft mirrors state if already equipped in this slot, else starts fresh
    const draft = isEquippedHere
      ? { level: currentSlot.level, bonusRolls: [...(currentSlot.bonusRolls || [])] }
      : { level: 1, bonusRolls: [] };

    const r = Game.rarityColor(w.Rarity);
    const chain = Game.weaponChain(w.id);
    const bonusPool = Formulas.bonusOptionPool();

    const renderBody = () => {
      const dps = Formulas.weaponDPS(w, draft.level);
      const scrollCost = Formulas.scrollCostForLevel(draft.level);
      const maxAffixes = rarityRow ? rarityRow.BonusOptionCount : 0;
      const levelBonusRows = Formulas.weaponLevelBonusRows(w, slotIndex);

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
            </div>
            ${w.Story_en ? `<div class="detail-desc">${escapeHtml(w.Story_en)}</div>` : ''}

            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Atk Speed</span><span class="stat-val">${fmtNum(w.AtkSpeed)}/s</span></div>
              <div class="stat-pill"><span class="stat-name">Atk Range</span><span class="stat-val">${fmtNum(w.AtkRange)}</span></div>
              <div class="stat-pill"><span class="stat-name">Splash Count</span><span class="stat-val">${fmtNum(w.SplashAtkCount)}</span></div>
              <div class="stat-pill"><span class="stat-name">Max Level</span><span class="stat-val">${maxLevel}</span></div>
            </div>

            <h4 style="margin:14px 0 6px;font-size:.9rem">Upgrade Level</h4>
            <div class="level-control">
              <input type="range" id="lvl-slider" min="1" max="${maxLevel}" value="${draft.level}">
              <span class="level-num mono" id="lvl-num">${draft.level} / ${maxLevel}</span>
            </div>
            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Weapon DPS (this weapon's slice)</span><span class="stat-val">${fmtNum(dps.total)}</span></div>
              <div class="stat-pill"><span class="stat-name">Rarity Multiplier</span><span class="stat-val">×${fmtNum(dps.mult)}</span></div>
              <div class="stat-pill"><span class="stat-name">Scroll cost (this level)</span><span class="stat-val">${scrollCost != null ? fmtNum(scrollCost) : '—'}</span></div>
            </div>
            <div class="caveat">DPS = base ${fmtNum(dps.base)} + ${fmtNum(dps.perLevel)} × (level−1), from this weapon's rarity/grade tier data. Confirmed by decompiling the game's real Dps formula: your actual in-game Dps stat multiplies this weapon's contribution by three more percentage brackets from your player level, ability/extra/special/soul upgrades, hero grade/level/evolution, VIP, and trait roll all at once — so this number is this weapon's own slice, not your full build's Dps. See docs/game_logic_deep_dive.md for the exact formula.</div>

            ${levelBonusRows.length ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Level-Up Bonuses <span style="color:var(--ink-muted);font-weight:500">(fixed, unlocks automatically as this weapon is fused to higher rarity)</span></h4>
              <div class="milestone-list">${this._levelBonusListHTML(levelBonusRows)}</div>
            ` : ''}

            ${maxAffixes > 0 ? `
              <h4 style="margin:16px 0 6px;font-size:.9rem">Rolled Bonus Affixes <span style="color:var(--ink-muted);font-weight:500">(random — this rarity rolls up to ${maxAffixes})</span></h4>
              <div id="affix-list">${this._affixListHTML(draft, bonusPool, maxAffixes)}</div>
            ` : ''}

            <div class="action-row">
              <button class="btn btn-gold" id="equip-btn">${isEquippedHere ? 'Save Changes' : `Equip to Slot ${slotIndex + 1}`}</button>
              ${chain.length > 1 ? `<button class="btn" id="tier-btn">${'View Fusion Chain'}</button>` : ''}
              <button class="btn" id="back-btn">← Back to list</button>
            </div>
          </div>
        </div>`;

      document.getElementById('lvl-slider').addEventListener('input', (e) => {
        draft.level = Number(e.target.value);
        renderBody();
      });
      document.getElementById('back-btn').addEventListener('click', () => this.openPicker(slotIndex));
      document.getElementById('equip-btn').addEventListener('click', () => {
        State.setWeaponSlot(slotIndex, w.id);
        State.setWeaponLevel(slotIndex, draft.level);
        State.setWeaponBonusRolls(slotIndex, draft.bonusRolls);
        UI.closeModal();
        UI.toast(isEquippedHere ? 'Weapon updated' : `Equipped to Weapon ${slotIndex + 1}`);
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
    return rows.map(({ row, unlocked, slotOk }) => {
      const rarityName = Game.rarityColor(row.Rarity).name;
      const pct = fmtNum(row.Amount * 100);
      const slotTag = row.SlotType === 1 ? ' · Main slot only' : row.SlotType === 2 ? ' · Off-hand slots only' : '';
      const active = unlocked && slotOk;
      return `
        <div class="milestone-row${active ? '' : ' milestone-row--locked'}">
          ${active ? '' : '🔒 '}${escapeHtml(row.PropertyName_en)} +${pct}%
          <span style="color:var(--ink-muted);font-weight:500"> — unlocks at ${rarityName} rarity${slotTag}${unlocked && !slotOk ? ' (wrong slot for this weapon)' : ''}</span>
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
          ${checked ? `<input type="range" data-affix-roll="${opt.id}" min="0" max="100" value="${pct}">` : ''}
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
    document.querySelectorAll('[data-affix-roll]').forEach(sl => {
      sl.addEventListener('input', (e) => {
        const id = Number(e.target.dataset.affixRoll);
        const roll = draft.bonusRolls.find(r => r.optionId === id);
        if (roll) roll.pct = Number(e.target.value);
        rerender();
      });
    });
  },
};
