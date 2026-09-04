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
      <div class="hero-card ${isActive ? 'active' : ''}" data-hero="${hero.id}">
        ${isActive ? '<span class="hc-active-badge">Active</span>' : ''}
        <button class="hc-remove" title="Remove">✕</button>
        <img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt="">
        <div class="hc-name">${escapeHtml(c.Name_en)}</div>
        <div class="hc-meta">${rarityPip(c.rarity)}Lv ${hero.level} · ★${hero.starGrade}</div>
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
              <div class="picker-card" data-costume="${c.id}" style="border-color:${r.c}55">
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
            <div class="detail-art" style="--rc:${r.c}"><img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt=""></div>
            <div class="action-row" style="margin-top:10px">
              <button class="btn ${State.data.activeHeroId === hero.id ? 'btn-gold' : ''}" id="active-btn" style="flex:1">
                ${State.data.activeHeroId === hero.id ? '★ Active Hero' : 'Set as Active'}
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

            <h4 style="margin:14px 0 6px;font-size:.9rem">Level</h4>
            <div class="level-control">
              <input type="range" id="lvl-slider" min="1" max="${c.Max_Lv}" value="${hero.level}">
              <span class="level-num mono" id="lvl-num">${hero.level} / ${c.Max_Lv}</span>
            </div>

            <h4 style="margin:14px 0 6px;font-size:.9rem">Star Grade (Enhance)</h4>
            <div class="level-control">
              <input type="range" id="star-slider" min="1" max="${c.Max_Grade}" value="${hero.starGrade}">
              <span class="level-num mono">★ ${hero.starGrade} / ${c.Max_Grade}</span>
            </div>

            ${evoRows.length ? `
            <h4 style="margin:14px 0 6px;font-size:.9rem">Evolution</h4>
            <div class="level-control">
              <input type="range" id="evo-slider" min="0" max="${evoRows[evoRows.length - 1].Rarity}" value="${hero.evoRarity}">
              <span class="level-num mono">${hero.evoRarity === 0 ? 'None' : 'Tier ' + hero.evoRarity}</span>
            </div>` : ''}

            <h4 style="margin:16px 0 6px;font-size:.9rem">Stat Bonuses Unlocked</h4>
            <div class="stat-list">
              ${full.bonuses.length === 0 ? `<span style="color:var(--ink-faint);font-size:.82rem">None yet at this level/star/evolution.</span>` :
                full.bonuses.map(b => `
                  <div class="stat-pill"><span class="stat-name">${escapeHtml(b.stat ? b.stat.Title_en : 'Stat ' + b.type)}</span><span class="stat-val">+${fmtNum(b.value)}${b.value < 10 ? '' : ''}</span></div>
                `).join('')}
            </div>

            ${c.Costume_Skill_List && c.Costume_Skill_List.filter(s => s).length ? `
            <div class="caveat">Skill IDs from this hero's kit: ${toArray(c.Costume_Skill_List).filter(s => s).join(', ')} (skill effect text lives in a separate table not surfaced in this build).</div>` : ''}

            <div class="action-row">
              <button class="btn btn-danger" id="remove-btn">Remove Hero</button>
            </div>
          </div>
        </div>`;

      document.getElementById('lvl-slider').addEventListener('input', (e) => {
        State.updateHero(heroId, { level: Number(e.target.value) });
        renderBody();
      });
      document.getElementById('star-slider').addEventListener('input', (e) => {
        State.updateHero(heroId, { starGrade: Number(e.target.value) });
        renderBody();
      });
      document.getElementById('evo-slider')?.addEventListener('input', (e) => {
        State.updateHero(heroId, { evoRarity: Number(e.target.value) });
        renderBody();
      });
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
};
