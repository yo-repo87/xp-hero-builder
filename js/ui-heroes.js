// ---------------------------------------------------------------------------
// ui-heroes.js — hero roster grid + add-hero picker + per-hero enhance modal
// (level / star grade / evolution).
// ---------------------------------------------------------------------------

const HeroesUI = {

  render() {
    const grid = document.getElementById('hero-roster-grid');
    const cards = State.data.heroes.map(h => this._cardHTML(h)).join('');
    grid.innerHTML = cards + `
      <div class="add-hero-card" id="add-hero-card">
        <span class="plus">+</span><span>Add Hero</span>
      </div>`;
    grid.querySelectorAll('.hero-card').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.hc-remove')) return;
        this.openEnhance(el.dataset.hero);
      });
      el.querySelector('.hc-remove')?.addEventListener('click', () => {
        if (confirm('Remove this hero from your roster?')) State.removeHero(el.dataset.hero);
      });
    });
    document.getElementById('add-hero-card').addEventListener('click', () => this.openAddPicker());
  },

  _cardHTML(hero) {
    const c = Game.index.costumeById.get(hero.costumeId);
    if (!c) return '';
    const isActive = State.data.activeHeroId === hero.id;
    return `
      <div class="hero-card ${isActive ? 'active' : ''}" data-hero="${hero.id}" style="${rarityStyle(c.rarity)}">
        ${isActive ? '<span class="hc-active-badge">Active</span>' : ''}
        <button class="hc-remove" title="Remove">✕</button>
        <img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt="">
        <div class="hc-name">${escapeHtml(c.Name_en)}</div>
        <div class="hc-meta">Lv ${hero.level} · ${rarityStar(true)}${hero.starGrade}</div>
      </div>`;
  },

  openAddPicker() {
    const owned = new Set(State.data.heroes.map(h => h.costumeId));
    const available = Game.db.CostumeData.filter(c => !owned.has(c.id)).sort((a, b) => a.rarity - b.rarity);
    UI.openModal(`
      <div class="modal-header"><h3>Add a Hero</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${available.length === 0
          ? `<div class="empty-state"><div class="es-icon">🎉</div>You already own every hero in the game.</div>`
          : `<div class="picker-grid">${available.map(c => {
              const r = Game.rarityColor(c.rarity);
              return `
              <div class="picker-card" data-costume="${c.id}" style="${rarityStyle(c.rarity)}">
                <img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt="">
                <div class="pc-name">${escapeHtml(c.Name_en)}</div>
                <div class="pc-tag">${rarityPip(c.rarity)}${r.name}</div>
              </div>`;
            }).join('')}</div>`}
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.querySelectorAll('[data-costume]').forEach(el => {
      el.addEventListener('click', () => {
        const hero = State.addHero(Number(el.dataset.costume));
        this.openEnhance(hero.id);
      });
    });
  },

  openEnhance(heroId) {
    const hero = State.getHero(heroId);
    if (!hero) return;
    const c = Game.index.costumeById.get(hero.costumeId);
    const r = Game.rarityColor(c.rarity);
    const bonusCat = Game.index.weaponCategoryById.get(c.BonusWeaponCategory);
    const starRows = Formulas.heroStarGradeRows(c);
    const evoRows = Formulas.heroEvolutionRows(c);

    const renderBody = () => {
      const full = Formulas.heroFullStats(c, { level: hero.level, starGrade: hero.starGrade, evoRarity: hero.evoRarity });
      body.innerHTML = `
        <div class="detail-layout">
          <div>
            <div class="detail-art" style="${rarityStyle(c.rarity)}"><img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt=""></div>
            <div class="action-row" style="margin-top:10px">
              <button class="btn ${State.data.activeHeroId === hero.id ? 'btn-gold' : ''}" id="active-btn" style="flex:1">
                ${State.data.activeHeroId === hero.id ? rarityStar(true, true) + ' Active Hero' : 'Set as Active'}
              </button>
            </div>
          </div>
          <div>
            <div class="detail-name">${escapeHtml(c.Name_en)}</div>
            <div class="detail-tags">
              ${rarityTag(c.rarity)}
              <span class="tag">Bonus: ${escapeHtml(bonusCat ? bonusCat.Name_en : '—')}</span>
            </div>
            ${c.Description_en ? `<div class="detail-desc">${escapeHtml(c.Description_en)}</div>` : ''}

            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Attack ${full.base.interpolated ? '(interp.)' : ''}</span><span class="stat-val">${fmtNum(full.base.attack)}</span></div>
              <div class="stat-pill"><span class="stat-name">HP ${full.base.interpolated ? '(interp.)' : ''}</span><span class="stat-val">${fmtNum(full.base.hp)}</span></div>
            </div>

            <h4 class="section-head"><span class="section-head-icon">⬆</span>Level Up</h4>
            ${levelControlHTML('lvl-slider', 1, c.Max_Lv, hero.level, `${hero.level} / ${c.Max_Lv}`)}

            <h4 class="section-head"><span class="section-head-icon">★</span>Upgrade <span class="section-head-sub">(Star Grade)</span></h4>
            ${levelControlHTML('star-slider', 1, c.Max_Grade, hero.starGrade, `${rarityStar(true)}${hero.starGrade} / ${c.Max_Grade}`)}

            ${evoRows.length ? `
            <h4 class="section-head"><span class="section-head-icon">👑</span>Evolve</h4>
            ${levelControlHTML('evo-slider', 0, evoRows[evoRows.length - 1].Rarity, hero.evoRarity, hero.evoRarity === 0 ? 'None' : 'Tier ' + hero.evoRarity)}` : ''}

            <h4 class="section-head" style="margin-top:16px"><span class="section-head-icon">🔮</span>Rune</h4>
            <div id="rune-section">${this._runeSectionHTML(hero)}</div>

            <h4 class="section-head" style="margin-top:16px">Stat Bonuses Unlocked</h4>
            <div class="milestone-list">
              ${full.bonuses.length === 0 ? `<span style="color:var(--ink-faint);font-size:.82rem">None yet at this level/star/evolution.</span>` :
                full.bonuses.map(b => `
                  <div class="milestone-row">
                    <span class="milestone-label">${escapeHtml(b.stat ? b.stat.Title_en : 'Stat ' + b.type)} +${fmtNum(b.value)}</span>
                  </div>
                `).join('')}
            </div>

            ${c.Costume_Skill_List && c.Costume_Skill_List.filter(s => s).length ? `
            <div class="caveat">Skill IDs from this hero's kit: ${toArray(c.Costume_Skill_List).filter(s => s).join(', ')} (skill effect text lives in a separate table not surfaced in this build).</div>` : ''}

            <div class="action-row">
              <button class="btn btn-danger" id="remove-btn">Remove Hero</button>
            </div>
          </div>
        </div>`;

      wireLevelControl('lvl-slider', (level) => { State.updateHero(heroId, { level }); renderBody(); });
      wireLevelControl('star-slider', (starGrade) => { State.updateHero(heroId, { starGrade }); renderBody(); });
      wireLevelControl('evo-slider', (evoRarity) => { State.updateHero(heroId, { evoRarity }); renderBody(); });
      this._wireRuneEvents(heroId, renderBody);
      document.getElementById('active-btn').addEventListener('click', () => {
        State.setActiveHero(hero.id);
        renderBody();
      });
      document.getElementById('remove-btn').addEventListener('click', () => {
        if (confirm('Remove this hero from your roster?')) { State.removeHero(hero.id); UI.closeModal(); }
      });
    };

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(c.Name_en)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body" id="modal-body-target"></div>
    `);
    const body = document.getElementById('modal-body-target');
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    renderBody();
  },

  // --- Rune (equip/level this hero's runes) ---------------------------------
  // See CLAUDE.md "Rune system" / "Multiple rune slots" for the full
  // data-shape writeup. A hero has 7 rune slots (Formulas.
  // RUNE_SLOT_UNLOCK_LEVELS), not 1 — confirmed 2026-10-24 after a direct
  // user report that there was no way to equip a general (Melee/Ranged/
  // Universal) rune alongside a hero-specific one. Slot 0 is always this
  // hero's own named Hero Rune; slots 1-6 are free-choice general slots
  // (any Melee/Ranged/Universal rune), gated behind the account-wide
  // Player Level. Each equipped rune is one RuneData row (grade is baked
  // into which row is picked, mirroring how weapon fusion-chain links
  // work, not a separately-tracked player stat) plus a player-set level
  // (1..that grade's MaxLevel).

  _runeSectionHTML(hero) {
    const playerLevel = State.data.player.level;
    return `
      <div class="rune-panel">
        ${hero.runes.map((_, i) => this._runeSlotHTML(hero, i, playerLevel)).join('')}
        <div class="caveat">No decompiled evidence ties Runes into the confirmed Dps formula (docs/game_logic_deep_dive.md) — shown here as this hero's own stat panel, not folded into the Guide tab's Total DPS estimate.</div>
      </div>`;
  },

  _runeSlotHTML(hero, slotIndex, playerLevel) {
    const reqLevel = Formulas.runeSlotUnlockLevel(slotIndex);
    const slotLabel = slotIndex === 0 ? 'Hero Rune' : `General Rune ${slotIndex}`;
    if (playerLevel < reqLevel) {
      return `
        <div class="rune-slot rune-slot--locked">
          <span class="rune-slot-label">${slotLabel}</span>
          <span style="color:var(--ink-faint);font-size:.82rem">🔒 Unlocks at Player Level ${reqLevel}</span>
        </div>`;
    }
    const slotData = hero.runes[slotIndex];
    const rune = slotData ? Game.index.runeById.get(slotData.runeDataId) : null;
    if (!slotData || !rune) { // empty, or a stale id (e.g. an older export) -- just let the user pick again
      return `
        <div class="rune-slot">
          <div class="rune-slot-header">
            <span class="rune-slot-label">${slotLabel}</span>
            <button class="btn btn-sm" data-rune-choose="${slotIndex}">+ Choose a Rune</button>
          </div>
        </div>`;
    }
    const grade = Game.index.runeGradeById.get(rune.GradeID);
    const rarity = grade ? grade.Rarity : 1;
    const typeRow = Game.index.runeTypeById.get(rune.TypeID);
    const maxLevel = Formulas.runeMaxLevel(rune);
    const level = Math.min(slotData.level, maxLevel);
    const unique = Formulas.runeUniqueOption(rune, level);
    const bonusRows = Formulas.runeLevelBonusRows(rune, level);
    const nextCost = level < maxLevel ? Formulas.runeCostForLevel(rune, level + 1) : null;
    const sliderId = `rune-lvl-slider-${slotIndex}`;

    return `
      <div class="rune-slot">
        <div class="rune-slot-header">
          <span class="rune-slot-label">${slotLabel}</span>
          <div class="action-row" style="margin:0">
            <button class="btn btn-sm" data-rune-choose="${slotIndex}">Change</button>
            <button class="btn btn-sm btn-danger" data-rune-remove="${slotIndex}">Remove</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin:8px 0">
          <div class="detail-art" style="width:52px;height:52px;flex-shrink:0;${rarityStyle(rarity)}"><img src="${Game.runeIcon(rune)}" onerror="onImgError(this)" alt=""></div>
          <div style="flex:1;min-width:0">
            <div class="detail-name" style="font-size:.88rem">${escapeHtml(rune.Name_en)}</div>
            <div class="detail-tags">${rarityTag(rarity)}${typeRow ? `<span class="tag">${escapeHtml(typeRow.Name_en)}</span>` : ''}</div>
          </div>
        </div>
        ${levelControlHTML(sliderId, 1, maxLevel, level, `${level} / ${maxLevel}`)}
        ${unique ? `<div class="milestone-row" style="margin:8px 0">${escapeHtml(unique.desc)}</div>` : ''}
        ${unique && unique.hiddenEffects.length ? `
          <div class="milestone-row" style="margin-bottom:8px">
            ✨ Also increases <b>${escapeHtml(unique.hiddenEffects[0].effectName || 'an unnamed effect')}</b>
            by +${fmtNum(unique.hiddenEffects[0].boost)}${unique.hiddenEffects[0].base != null ? ` (${fmtNum(unique.hiddenEffects[0].base)} → ${fmtNum(unique.hiddenEffects[0].total)})` : ''}
            <span style="color:var(--ink-muted);font-weight:500"> — confirmed by decompilation, applies to ${unique.hiddenEffects.length > 1 ? `all ${unique.hiddenEffects.length} of this hero's skill levels` : `skill level ${unique.hiddenEffects[0].costumeSkillSlot}`}</span>
          </div>` : ''}
        ${nextCost ? `<div class="caveat">Cost to reach Lv ${level + 1}: ${this._runeCostLineHTML(nextCost)}</div>`
          : level >= maxLevel ? `<div class="caveat">Max level for this grade — pick a higher-grade version via "Change" to continue leveling.</div>` : ''}
        ${bonusRows.length ? `
          <h4 class="section-head" style="margin-top:12px;font-size:.82rem">Level Bonuses</h4>
          <div class="milestone-list">
            ${bonusRows.map(({ row, unlocked, desc }) => `
              <div class="milestone-row${unlocked ? '' : ' milestone-row--locked'}">
                ${unlocked ? '' : '🔒 '}${desc ? escapeHtml(desc) : '🎲 Grants 1 random attribute (roll mechanic not decoded)'}
                <span style="color:var(--ink-muted);font-weight:500"> — Lv ${row.Level}</span>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  },

  _runeCostLineHTML(cost) {
    const parts = [];
    if (cost.CostValue1 && cost.CostType1) {
      const item = Game.index.itemByType.get(cost.CostType1);
      parts.push(`${cost.CostValue1} ${escapeHtml(item ? item.Name_en : `Type ${cost.CostType1}`)}`);
    }
    if (cost.CostValue2 && cost.CostType2) {
      const item = Game.index.itemByType.get(cost.CostType2);
      parts.push(`${cost.CostValue2} ${escapeHtml(item ? item.Name_en : `Type ${cost.CostType2}`)}`);
    }
    return parts.join(' + ') || '—';
  },

  _wireRuneEvents(heroId, renderBody) {
    document.querySelectorAll('[data-rune-choose]').forEach(btn => {
      btn.addEventListener('click', () => this._openRunePicker(heroId, Number(btn.dataset.runeChoose)));
    });
    document.querySelectorAll('[data-rune-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        State.removeHeroRuneSlot(heroId, Number(btn.dataset.runeRemove));
        renderBody();
      });
    });
    for (let i = 0; i < 7; i++) {
      wireLevelControl(`rune-lvl-slider-${i}`, (level) => {
        State.setHeroRuneSlotLevel(heroId, i, level);
        renderBody();
      });
    }
  },

  // slotIndex 0 (the Hero Rune slot) only offers this hero's own named
  // rune(s), if any; slots 1-6 (general slots) only offer the 3 generic
  // Melee/Ranged/Universal families — matching the real game's own
  // slot-type split confirmed via MilestonePresetEquipEntryData (slot 0 is
  // always a TypeID-1 Hero Rune across every sampled preset; slots 1+ are
  // always one of the 3 generic families, freely mixed).
  _openRunePicker(heroId, slotIndex) {
    const hero = State.getHero(heroId);
    if (!hero) return;
    const isHeroSlot = slotIndex === 0;
    const generic = Game.index.runesByCostumeId.get(0) || [];
    const tabs = isHeroSlot
      ? [{ key: 'own', label: "This Hero's Rune", rows: (Game.index.runesByCostumeId.get(hero.costumeId) || []).slice().sort((a, b) => a.id - b.id) }]
      : [
          { key: '101', label: 'Melee', rows: generic.filter(r => r.TypeID === 101) },
          { key: '102', label: 'Ranged', rows: generic.filter(r => r.TypeID === 102) },
          { key: '103', label: 'Universal', rows: generic.filter(r => r.TypeID === 103) },
        ];
    let activeKey = tabs[0].key;

    const renderGrid = () => {
      const tab = tabs.find(t => t.key === activeKey);
      const rows = tab.rows.slice().sort((a, b) => a.Name_en.localeCompare(b.Name_en) || a.GradeID - b.GradeID);
      const grid = document.getElementById('rune-picker-grid');
      const currentSlot = hero.runes[slotIndex];
      grid.innerHTML = rows.length ? rows.map(r => {
        const grade = Game.index.runeGradeById.get(r.GradeID);
        const rarity = grade ? grade.Rarity : 1;
        const selected = currentSlot && currentSlot.runeDataId === r.id;
        return `
          <div class="picker-card ${selected ? 'selected' : ''}" data-rune="${r.id}" style="${rarityStyle(rarity)}">
            <img src="${Game.runeIcon(r)}" onerror="onImgError(this)" alt="">
            <div class="pc-name">${escapeHtml(r.Name_en)}</div>
            <div class="pc-tag">${rarityPip(rarity)}${Game.rarityColor(rarity).name}</div>
          </div>`;
      }).join('') : `<div class="empty-state">${isHeroSlot ? 'This hero has no named rune yet.' : 'No runes in this category.'}</div>`;
      grid.querySelectorAll('[data-rune]').forEach(el => {
        el.addEventListener('click', () => {
          State.setHeroRuneSlot(heroId, slotIndex, Number(el.dataset.rune));
          this.openEnhance(heroId);
        });
      });
    };

    UI.openModal(`
      <div class="modal-header"><h3>Choose a Rune — ${isHeroSlot ? 'Hero Rune' : `General Slot ${slotIndex}`}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${tabs.length > 1 ? `<div class="picker-filters">${tabs.map(t => `<button class="chip${t.key === activeKey ? ' active' : ''}" data-rune-tab="${t.key}">${escapeHtml(t.label)}</button>`).join('')}</div>` : ''}
        <div class="picker-grid" id="rune-picker-grid"></div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.querySelectorAll('[data-rune-tab]').forEach(el => {
      el.addEventListener('click', () => {
        activeKey = el.dataset.runeTab;
        document.querySelectorAll('[data-rune-tab]').forEach(c => c.classList.toggle('active', c === el));
        renderGrid();
      });
    });
    renderGrid();
  },
};
