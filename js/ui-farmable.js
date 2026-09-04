// ---------------------------------------------------------------------------
// ui-farmable.js — "Farmable Items" tab: the item catalog plus, per item,
// exactly where it comes from — sourced from real game data, not guessed.
//
// Two source types are modeled, both fully resolved from confirmed data:
//   - "Guaranteed" drops: MinimapRewardData ties a specific named boss enemy
//     in a specific chapter/stage to a guaranteed item reward.
//   - "Chest" drops: ChestData -> RewardGroupData gives a real weighted drop
//     table per chest (RewardType 4 rows resolve cleanly to StackableItemData
//     ids), and ChestSpawnerData.ChestRespawnOrder ties each chest to the
//     specific stage(s) it actually spawns at.
//
// There's no literal x/y map-coordinate data anywhere in the extracted
// assets, so the "map" popup is honestly built from the game's own stage
// list per chapter (a level-select-style path of stage nodes), with the
// item's own icon pinned on whichever node(s) are the real source — not a
// fabricated terrain map.
// ---------------------------------------------------------------------------

const FarmableUI = {
  filterRarity: 'all',

  render() {
    const grid = document.getElementById('farmable-grid');
    const filters = document.getElementById('farmable-filters');
    if (!filters.dataset.wired) {
      const rarities = [...new Set(Game.db.StackableItemData.map(i => i.Rarity))].sort((a, b) => a - b);
      filters.innerHTML = `
        <button class="chip active" data-rarity="all">All</button>
        ${rarities.map(r => `<button class="chip" data-rarity="${r}">${Game.rarityColor(r).name}</button>`).join('')}`;
      filters.dataset.wired = '1';
      filters.querySelectorAll('.chip').forEach(el => el.addEventListener('click', () => {
        this.filterRarity = el.dataset.rarity === 'all' ? 'all' : Number(el.dataset.rarity);
        filters.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === el));
        this.render();
      }));
    }

    const items = Game.db.StackableItemData
      .filter(i => i.id !== 1) // id 1 is the internal "none" placeholder, not a real item
      .filter(i => this.filterRarity === 'all' || i.Rarity === this.filterRarity)
      .slice()
      .sort((a, b) => b.Rarity - a.Rarity || a.Name_en.localeCompare(b.Name_en));

    grid.innerHTML = items.map(item => {
      const sources = computeFarmSources(item.id);
      const r = Game.rarityColor(item.Rarity);
      const total = sources.guaranteed.length + sources.chest.length;
      return `
        <div class="picker-card farm-card" data-item="${item.id}" style="${rarityStyle(item.Rarity)}">
          <img src="${Game.itemIcon(item)}" onerror="onImgError(this)" alt="">
          <div class="pc-name">${escapeHtml(item.Name_en)}</div>
          <div class="pc-tag">${rarityPip(item.Rarity)}${r.name}</div>
          <div class="pc-tag" style="margin-top:2px">${total > 0 ? `${total} known source${total > 1 ? 's' : ''}` : `<span style="color:var(--ink-faint)">source not identified</span>`}</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-item]').forEach(el => {
      el.addEventListener('click', () => this.openDetail(Number(el.dataset.item)));
    });
  },

  openDetail(itemId) {
    const item = Game.index.itemById.get(itemId);
    const sources = computeFarmSources(itemId);
    const r = Game.rarityColor(item.Rarity);

    const guaranteedHTML = sources.guaranteed.map(s => `
      <div class="farm-source-row" data-map-guaranteed='${JSON.stringify({ chapter: s.stage?.chapter, stageId: s.stage?.id })}'>
        <img class="farm-source-thumb" src="${s.enemy ? Game.enemyIcon(s.enemy) : ''}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title">Guaranteed — defeat <b>${escapeHtml(s.enemy ? s.enemy.Name_en : 'Unknown')}</b></div>
          <div class="fs-sub">${s.stage ? `Chapter ${s.stage.chapter} · Stage ${s.stage.stage} — ${escapeHtml(s.stage.Name_en)}` : 'Location unknown'} · drops ×${s.amount}</div>
        </div>
        <button class="btn btn-sm">View Map</button>
      </div>`).join('');

    const chestHTML = sources.chest.map((s, i) => `
      <div class="farm-source-row" data-map-chest="${i}">
        <img class="farm-source-thumb" src="${Game.chestIcon(s.chest)}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title">${escapeHtml(s.chest.Name)} <span class="mono" style="color:var(--gold)">${fmtNum(s.pct)}%</span></div>
          <div class="fs-sub">${s.stages.length ? s.stages.map(st => `Ch${st.chapter}·St${st.stage}`).join(', ') : 'Stage unknown'} · yields ${s.amountMin === s.amountMax ? s.amountMin : `${s.amountMin}-${s.amountMax}`}</div>
        </div>
        <button class="btn btn-sm">View Map</button>
      </div>`).join('');

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(item.Name_en)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="detail-layout">
          <div class="detail-art" style="${rarityStyle(item.Rarity)}"><img src="${Game.itemIcon(item)}" onerror="onImgError(this)" alt=""></div>
          <div>
            <div class="detail-name">${escapeHtml(item.Name_en)}</div>
            <div class="detail-tags">${rarityTag(item.Rarity)}</div>
            ${item.Desc_en ? `<div class="detail-desc">${escapeHtml(item.Desc_en)}</div>` : ''}

            ${sources.guaranteed.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Guaranteed Boss Drops</h4>${guaranteedHTML}` : ''}
            ${sources.chest.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Chest Drop Rates</h4>${chestHTML}` : ''}
            ${sources.guaranteed.length === 0 && sources.chest.length === 0 ? `
              <div class="caveat">No confirmed farm source found for this item in the extracted data — it likely comes from a system this app hasn't mapped yet (missions, events, shop, etc.), not that it's unobtainable.</div>` : `
              <div class="caveat">Guaranteed drops come directly from the game's own boss-reward table. Chest percentages are this chest's real weighted drop table, normalized within its reward bundle — a chest with multiple bundles may show more than one line per item.</div>`}
          </div>
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());

    document.querySelectorAll('[data-map-guaranteed]').forEach(el => {
      el.addEventListener('click', () => {
        const { chapter, stageId } = JSON.parse(el.dataset.mapGuaranteed);
        const s = sources.guaranteed.find(x => x.stage?.id === stageId);
        this.openMap(item, [{ chapter, stageId, label: s?.enemy?.Name_en, enemy: s?.enemy }]);
      });
    });
    document.querySelectorAll('[data-map-chest]').forEach(el => {
      el.addEventListener('click', () => {
        const s = sources.chest[Number(el.dataset.mapChest)];
        const pins = s.stages.map(st => ({ chapter: st.chapter, stageId: st.id, label: s.chest.Name }));
        this.openMap(item, pins);
      });
    });
  },

  // pins: [{chapter, stageId, label, enemy?}]
  openMap(item, pins) {
    const byChapter = groupBy(pins, p => p.chapter);
    const chapters = [...byChapter.keys()].sort((a, b) => a - b);

    const bossPortraits = pins.filter(p => p.enemy).map(p => p.enemy);

    const chapterRows = chapters.map(ch => {
      const stages = Game.db.StageData.filter(s => s.chapter === ch).sort((a, b) => a.stage - b.stage);
      const highlightIds = new Set(byChapter.get(ch).map(p => p.stageId));
      return `
        <div class="stage-map-row">
          <div class="stage-map-chapter">Chapter ${ch}</div>
          <div class="stage-map-path">
            ${stages.map(s => `
              <div class="stage-node ${highlightIds.has(s.id) ? 'hit' : ''}">
                ${highlightIds.has(s.id) ? `<img class="stage-node-pin" src="${Game.itemIcon(item)}" onerror="onImgError(this)" alt="">` : ''}
                <div class="stage-node-circle">${s.stage}</div>
                <div class="stage-node-label">${escapeHtml(s.Name_en)}</div>
              </div>
            `).join('<div class="stage-node-connector"></div>')}
          </div>
        </div>`;
    }).join('');

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(item.Name_en)} — Where to Farm</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${bossPortraits.length ? `
          <div class="boss-portrait-row">
            ${bossPortraits.map(e => `
              <div class="boss-portrait">
                <img src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt="">
                <div>${escapeHtml(e.Name_en)}${e.NickName_en ? `<div class="fs-sub">"${escapeHtml(e.NickName_en)}"</div>` : ''}</div>
              </div>`).join('')}
          </div>` : ''}
        ${chapterRows}
        <div class="caveat">There's no literal in-game world-map coordinate data in the extracted assets — this shows the real chapter/stage progression path with the exact stage(s) this item comes from pinned using the item's own icon, rather than a fabricated terrain map.</div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
  },
};

function computeFarmSources(itemId) {
  const sources = { guaranteed: [], chest: [] };

  for (const r of (Game.index.minimapRewardsByItem.get(itemId) || [])) {
    const enemy = Game.index.enemyById.get(r.enemy_id);
    const stage = Game.index.stageByChapterStage.get(`${r.chapter}:${r.stage}`);
    sources.guaranteed.push({ enemy, stage, amount: r.reward_amount });
  }

  for (const chest of Game.db.ChestData) {
    const rows = Game.index.rewardRowsByGroup.get(chest.RewardGroupId) || [];
    const byBundle = groupBy(rows, r => r.BundleGroup);
    for (const bundleRows of byBundle.values()) {
      const totalWeight = bundleRows.reduce((s, r) => s + r.Rate, 0);
      if (totalWeight <= 0) continue;
      for (const r of bundleRows) {
        if (r.RewardType !== 4 || r.RewardParam !== itemId) continue;
        const stageIds = Game.index.stageIdsByChestId.get(chest.id) || [];
        const stages = stageIds.map(id => Game.index.stageById.get(id)).filter(Boolean);
        sources.chest.push({
          chest, pct: (r.Rate / totalWeight) * 100,
          amountMin: r.RewardCount_Min, amountMax: r.RewardCount_Max, stages,
        });
      }
    }
  }
  return sources;
}
