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

  // --- Rune (equip/level a rune on this hero) -------------------------------
  // See CLAUDE.md "Rune system" for the full data-shape writeup: each
  // equipped rune is one RuneData row (a hero's own named rune, or one of
  // the 3 generic Melee/Ranged/Universal families at a given grade — grade
  // is baked into which row is picked, mirroring how weapon fusion-chain
  // links work, not a separately-tracked player stat) plus a player-set
  // level (1..that grade's MaxLevel).

  _runeSectionHTML(hero) {
    if (!hero.rune) {
      return `<button class="btn btn-gold" id="rune-choose-btn">Choose a Rune</button>`;
    }
    const rune = Game.index.runeById.get(hero.rune.runeDataId);
    if (!rune) return `<button class="btn btn-gold" id="rune-choose-btn">Choose a Rune</button>`; // stale id (e.g. an older export) -- just let the user pick again
    const grade = Game.index.runeGradeById.get(rune.GradeID);
    const rarity = grade ? grade.Rarity : 1;
    const typeRow = Game.index.runeTypeById.get(rune.TypeID);
    const maxLevel = Formulas.runeMaxLevel(rune);
    const level = Math.min(hero.rune.level, maxLevel);
    const unique = Formulas.runeUniqueOption(rune, level);
    const bonusRows = Formulas.runeLevelBonusRows(rune, level);
    const nextCost = level < maxLevel ? Formulas.runeCostForLevel(rune, level + 1) : null;

    return `
      <div class="rune-panel">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
          <div class="detail-art" style="width:64px;height:64px;flex-shrink:0;${rarityStyle(rarity)}"><img src="${Game.runeIcon(rune)}" onerror="onImgError(this)" alt=""></div>
          <div style="flex:1;min-width:0">
            <div class="detail-name" style="font-size:.92rem">${escapeHtml(rune.Name_en)}</div>
            <div class="detail-tags">${rarityTag(rarity)}${typeRow ? `<span class="tag">${escapeHtml(typeRow.Name_en)}</span>` : ''}</div>
          </div>
        </div>
        <div class="action-row" style="margin:0 0 10px">
          <button class="btn btn-sm" id="rune-choose-btn">Change</button>
          <button class="btn btn-sm btn-danger" id="rune-remove-btn">Remove</button>
        </div>
        ${levelControlHTML('rune-lvl-slider', 1, maxLevel, level, `${level} / ${maxLevel}`)}
        ${unique ? `<div class="milestone-row" style="margin-bottom:8px">${escapeHtml(unique.desc)}</div>` : ''}
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
        <div class="caveat">No decompiled evidence ties Runes into the confirmed Dps formula (docs/game_logic_deep_dive.md) — shown here as this hero's own stat panel, not folded into the Guide tab's Total DPS estimate.</div>
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
    document.getElementById('rune-choose-btn')?.addEventListener('click', () => this._openRunePicker(heroId));
    document.getElementById('rune-remove-btn')?.addEventListener('click', () => {
      State.updateHero(heroId, { rune: null });
      renderBody();
    });
    wireLevelControl('rune-lvl-slider', (level) => {
      const hero = State.getHero(heroId);
      State.updateHero(heroId, { rune: { ...hero.rune, level } });
      renderBody();
    });
  },

  _openRunePicker(heroId) {
    const hero = State.getHero(heroId);
    if (!hero) return;
    const ownRunes = (Game.index.runesByCostumeId.get(hero.costumeId) || []).slice().sort((a, b) => a.id - b.id);
    const generic = Game.index.runesByCostumeId.get(0) || [];
    const tabs = [
      ...(ownRunes.length ? [{ key: 'own', label: "This Hero's Rune", rows: ownRunes }] : []),
      { key: '101', label: 'Melee', rows: generic.filter(r => r.TypeID === 101) },
      { key: '102', label: 'Ranged', rows: generic.filter(r => r.TypeID === 102) },
      { key: '103', label: 'Universal', rows: generic.filter(r => r.TypeID === 103) },
    ];
    let activeKey = tabs[0].key;

    const renderGrid = () => {
      const tab = tabs.find(t => t.key === activeKey);
      const rows = tab.rows.slice().sort((a, b) => a.Name_en.localeCompare(b.Name_en) || a.GradeID - b.GradeID);
      const grid = document.getElementById('rune-picker-grid');
      grid.innerHTML = rows.length ? rows.map(r => {
        const grade = Game.index.runeGradeById.get(r.GradeID);
        const rarity = grade ? grade.Rarity : 1;
        const selected = hero.rune && hero.rune.runeDataId === r.id;
        return `
          <div class="picker-card ${selected ? 'selected' : ''}" data-rune="${r.id}" style="${rarityStyle(rarity)}">
            <img src="${Game.runeIcon(r)}" onerror="onImgError(this)" alt="">
            <div class="pc-name">${escapeHtml(r.Name_en)}</div>
            <div class="pc-tag">${rarityPip(rarity)}${Game.rarityColor(rarity).name}</div>
          </div>`;
      }).join('') : `<div class="empty-state">No runes in this category.</div>`;
      grid.querySelectorAll('[data-rune]').forEach(el => {
        el.addEventListener('click', () => {
          State.updateHero(heroId, { rune: { runeDataId: Number(el.dataset.rune), level: 1 } });
          this.openEnhance(heroId);
        });
      });
    };

    UI.openModal(`
      <div class="modal-header"><h3>Choose a Rune</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="picker-filters">${tabs.map(t => `<button class="chip${t.key === activeKey ? ' active' : ''}" data-rune-tab="${t.key}">${escapeHtml(t.label)}</button>`).join('')}</div>
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
