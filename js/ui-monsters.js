// ---------------------------------------------------------------------------
// ui-monsters.js — "Monsters" tab: every enemy in the game, real portraits,
// filterable by chapter and boss/non-boss.
//
// Chapter is inferred from each enemy's own internal `key` field (there's no
// explicit per-enemy chapter column in EnemyData) — e.g. "CH3_GreenOrc" ->
// chapter 3, via Game.enemyChapter(). Confirmed consistent rather than
// assumed: every enemy sharing a "CHn_" prefix also shares one exact
// ThemeId, and for chapters 1-3 (the only chapters with extracted
// StageData) it lines up with the real chapter numbers used everywhere else
// in this app. A handful of enemies have no "CHn_" prefix at all (e.g.
// "World3_Dron_1") — shown under a separate "Special/Raid" bucket rather
// than guessing a chapter for them.
//
// "Boss" = has a NickName_en (a real in-game title, e.g. "Sovereign of the
// Desert"). Checked against EnemyType before picking this: EnemyType 2 rows
// ALL have a NickName_en (46/46), but 4 more bosses are typed 0/1 and would
// be missed by EnemyType alone — NickName_en presence is the cleaner,
// complete signal (50 bosses total out of 208 enemies).
//
// Exact stage (not just chapter) is only shown for the 20 enemies with a
// confirmed MinimapRewardData tie — the same guaranteed-boss-drop data the
// Farmable Items tab uses. Regular monsters roam a whole chapter in this
// game's own data, not one specific stage, so this app doesn't claim
// otherwise for the rest.
//
// 15 of 208 enemies (mostly the Chapter 1 raid-boss set) reference an
// IconSprite that wasn't captured in this app's original asset-extraction
// pass — they fall back to the standard onImgError placeholder like any
// other missing asset elsewhere in the app, rather than being hidden.
// ---------------------------------------------------------------------------

const MonstersUI = {
  filterChapter: 'all', // 'all' | 'special' | <number>
  filterBoss: 'all', // 'all' | 'boss' | 'normal'

  render() {
    const grid = document.getElementById('monster-grid');
    const filters = document.getElementById('monster-filters');
    if (!filters.dataset.wired) {
      const chapters = [...new Set(Game.db.EnemyData.map(e => Game.enemyChapter(e)))]
        .filter(c => c !== null)
        .sort((a, b) => a - b);
      const hasSpecial = Game.db.EnemyData.some(e => Game.enemyChapter(e) === null);
      filters.innerHTML = `
        <div class="picker-filters">
          <button class="chip active" data-chapter="all">All Chapters</button>
          ${chapters.map(c => `<button class="chip" data-chapter="${c}">Ch ${c}</button>`).join('')}
          ${hasSpecial ? `<button class="chip" data-chapter="special">Special/Raid</button>` : ''}
        </div>
        <div class="picker-filters">
          <button class="chip active" data-boss="all">All</button>
          <button class="chip" data-boss="boss">Bosses Only</button>
          <button class="chip" data-boss="normal">Non-Boss Only</button>
        </div>`;
      filters.dataset.wired = '1';
      filters.querySelectorAll('[data-chapter]').forEach(el => el.addEventListener('click', () => {
        this.filterChapter = el.dataset.chapter === 'all' ? 'all' : (el.dataset.chapter === 'special' ? 'special' : Number(el.dataset.chapter));
        filters.querySelectorAll('[data-chapter]').forEach(c => c.classList.toggle('active', c === el));
        this.render();
      }));
      filters.querySelectorAll('[data-boss]').forEach(el => el.addEventListener('click', () => {
        this.filterBoss = el.dataset.boss;
        filters.querySelectorAll('[data-boss]').forEach(c => c.classList.toggle('active', c === el));
        this.render();
      }));
    }

    const enemies = Game.db.EnemyData
      .filter(e => {
        if (this.filterChapter === 'all') return true;
        const ch = Game.enemyChapter(e);
        if (this.filterChapter === 'special') return ch === null;
        return ch === this.filterChapter;
      })
      .filter(e => {
        if (this.filterBoss === 'all') return true;
        const isBoss = !!e.NickName_en;
        return this.filterBoss === 'boss' ? isBoss : !isBoss;
      })
      .sort((a, b) => (Game.enemyChapter(a) ?? 99) - (Game.enemyChapter(b) ?? 99) || a.Name_en.localeCompare(b.Name_en));

    grid.innerHTML = enemies.length ? enemies.map(e => {
      const isBoss = !!e.NickName_en;
      const ch = Game.enemyChapter(e);
      const r = Game.rarityColor(e.Rarity);
      return `
        <div class="picker-card monster-card" data-enemy="${e.id}" style="${rarityStyle(e.Rarity)}">
          ${isBoss ? '<span class="tag tag--boss">BOSS</span>' : ''}
          <img src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt="">
          <div class="pc-name">${escapeHtml(e.Name_en)}</div>
          ${isBoss ? `<div class="pc-tag" style="font-style:italic">${escapeHtml(e.NickName_en)}</div>` : ''}
          <div class="pc-tag">${rarityPip(e.Rarity)}${r.name} · Lv ${fmtNum(e.Level)}</div>
          <div class="pc-tag">${ch !== null ? `Chapter ${ch}` : 'Special/Raid'}</div>
        </div>`;
    }).join('') : `<div class="empty-state"><div class="es-icon">👻</div>No monsters match these filters.</div>`;

    grid.querySelectorAll('[data-enemy]').forEach(el => {
      el.addEventListener('click', () => this.openDetail(Number(el.dataset.enemy)));
    });
  },

  openDetail(enemyId) {
    const e = Game.index.enemyById.get(enemyId);
    const isBoss = !!e.NickName_en;
    const ch = Game.enemyChapter(e);
    const tie = Game.index.minimapRewardByEnemyId.get(enemyId);

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(e.Name_en)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="detail-layout">
          <div class="detail-art" style="${rarityStyle(e.Rarity)}"><img src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt=""></div>
          <div>
            <div class="detail-name">${escapeHtml(e.Name_en)}</div>
            <div class="detail-tags">
              ${rarityTag(e.Rarity)}
              ${isBoss ? '<span class="tag tag--boss">BOSS</span>' : '<span class="tag">Common Enemy</span>'}
              <span class="tag">Level ${fmtNum(e.Level)}</span>
            </div>
            ${isBoss ? `<div class="detail-desc" style="font-style:italic">"${escapeHtml(e.NickName_en)}"</div>` : ''}
            ${e.Story_en ? `<div class="detail-desc">${escapeHtml(e.Story_en)}</div>` : ''}

            <div class="stat-list">
              <div class="stat-pill"><span class="stat-name">Max HP</span><span class="stat-val">${fmtNum(e.MaxHp)}</span></div>
              <div class="stat-pill"><span class="stat-name">Attack Power</span><span class="stat-val">${fmtNum(e.AttackPower)}</span></div>
              <div class="stat-pill"><span class="stat-name">Move Speed</span><span class="stat-val">${fmtNum(e.MoveSpeed)}</span></div>
              <div class="stat-pill"><span class="stat-name">Location</span><span class="stat-val">${ch !== null ? `Chapter ${ch}` : 'Special/Raid'}${tie ? ` · Stage ${tie.stage}` : ''}</span></div>
            </div>

            ${tie
              ? `<div class="caveat">Confirmed spawn location: Chapter ${tie.chapter}, Stage ${tie.stage} — this is also a guaranteed boss-drop source, see the Farmable Items tab for exactly what it drops.</div>`
              : isBoss
                ? `<div class="caveat">This boss doesn't have a confirmed exact stage in the extracted data — only its chapter is known.</div>`
                : `<div class="caveat">Regular enemies roam their whole chapter rather than one specific stage in this game's own data, so only chapter-level location is shown here.</div>`}
          </div>
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
  },
};
