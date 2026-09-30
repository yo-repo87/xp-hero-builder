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
// "View Map" opens the game's REAL minimap layout (see js/ui-map.js) — real
// per-stage tile art and exact tile positions extracted from the game's own
// UI files, with the item's own icon pinned on whichever tile(s) are the
// real source.
// ---------------------------------------------------------------------------

const FarmableUI = {
  filterRarity: 'all',

  render() {
    if (!CommunityReports.loaded) CommunityReports.fetchAll().then(() => this.render());

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

    const reports = CommunityReports.forItem(itemId);
    const communityHTML = reports.map((rep, i) => {
      const enemy = rep.enemy_id ? Game.index.enemyById.get(rep.enemy_id) : null;
      const stage = rep.stage_id ? Game.index.stageById.get(rep.stage_id) : null;
      return `
      <div class="farm-source-row farm-source-row--community" data-map-community="${i}">
        <img class="farm-source-thumb" src="${enemy ? Game.enemyIcon(enemy) : ''}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title"><span class="tag tag--community">USER-REPORTED</span> Slay <b>${escapeHtml(rep.enemy_name || 'Unknown creature')}</b></div>
          <div class="fs-sub">${escapeHtml(rep.stage_label || 'Location not given')}${rep.note ? ` — "${escapeHtml(rep.note)}"` : ''}${rep.reporter ? ` <span style="color:var(--ink-faint)">— ${escapeHtml(rep.reporter)}</span>` : ''}</div>
        </div>
        ${stage ? '<button class="btn btn-sm">View Map</button>' : ''}
      </div>`;
    }).join('');

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

            <h4 style="margin:14px 0 6px;font-size:.9rem">Community Reports <span style="color:var(--ink-muted);font-weight:500">(player-submitted, unverified)</span></h4>
            ${communityHTML || `<span style="color:var(--ink-faint);font-size:.82rem">No player reports yet for this item.</span>`}
            <div class="action-row" style="margin-top:8px">
              <button class="btn btn-gold" id="report-find-btn">📢 Report a Find</button>
            </div>
          </div>
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('report-find-btn').addEventListener('click', () => this.openReportForm(item));

    document.querySelectorAll('[data-map-guaranteed]').forEach(el => {
      el.addEventListener('click', () => {
        const { chapter, stageId } = JSON.parse(el.dataset.mapGuaranteed);
        const s = sources.guaranteed.find(x => x.stage?.id === stageId);
        this.openMap(item, [{ chapter, stage: s?.stage?.stage, label: s?.enemy?.Name_en, enemy: s?.enemy }]);
      });
    });
    document.querySelectorAll('[data-map-chest]').forEach(el => {
      el.addEventListener('click', () => {
        const s = sources.chest[Number(el.dataset.mapChest)];
        const pins = s.stages.map(st => ({ chapter: st.chapter, stage: st.stage, label: s.chest.Name }));
        this.openMap(item, pins);
      });
    });
    document.querySelectorAll('[data-map-community]').forEach(el => {
      el.addEventListener('click', () => {
        const rep = reports[Number(el.dataset.mapCommunity)];
        const stage = Game.index.stageById.get(rep.stage_id);
        if (!stage) return;
        const enemy = rep.enemy_id ? Game.index.enemyById.get(rep.enemy_id) : null;
        this.openMap(item, [{ chapter: stage.chapter, stage: stage.stage, label: rep.enemy_name, enemy }]);
      });
    });
  },

  openReportForm(item) {
    const stages = Game.db.StageData.slice().sort((a, b) => a.chapter - b.chapter || a.stage - b.stage);
    const enemies = Game.db.EnemyData.slice().sort((a, b) => a.Name_en.localeCompare(b.Name_en));

    UI.openModal(`
      <div class="modal-header"><h3>Report a Find — ${escapeHtml(item.Name_en)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="caveat">Submitted here goes to a shared, public list anyone using this site can see — don't include personal info. Pick the real stage and creature you got this from; it helps everyone else farm it too.</div>
        <div class="form-field">
          <label for="report-stage">Where (chapter · stage)</label>
          <select id="report-stage">
            <option value="">— Select a stage —</option>
            ${stages.map(s => `<option value="${s.id}">Chapter ${s.chapter} · Stage ${s.stage} — ${escapeHtml(s.Name_en)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="report-enemy-filter">Creature to slay</label>
          <input type="text" id="report-enemy-filter" placeholder="Type to filter...">
          <select id="report-enemy" size="6">
            <option value="">— Select a creature —</option>
            ${enemies.map(e => `<option value="${e.id}" data-name="${escapeHtml(e.Name_en.toLowerCase())}">${escapeHtml(e.Name_en)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="report-note">Note (optional)</label>
          <textarea id="report-note" maxlength="300" placeholder="e.g. dropped on repeat clears, rare drop, etc."></textarea>
        </div>
        <div class="form-field">
          <label for="report-name">Your name/handle (optional)</label>
          <input type="text" id="report-name" maxlength="40" placeholder="Anonymous">
        </div>
        <div class="action-row">
          <button class="btn btn-gold" id="report-submit-btn">Submit Report</button>
          <button class="btn" id="report-cancel-btn">Cancel</button>
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('report-cancel-btn').addEventListener('click', () => this.openDetail(item.id));

    const enemyFilter = document.getElementById('report-enemy-filter');
    const enemySelect = document.getElementById('report-enemy');
    enemyFilter.addEventListener('input', () => {
      const q = enemyFilter.value.trim().toLowerCase();
      enemySelect.querySelectorAll('option[data-name]').forEach(opt => {
        opt.hidden = q.length > 0 && !opt.dataset.name.includes(q);
      });
    });

    document.getElementById('report-submit-btn').addEventListener('click', async (e) => {
      const stageSel = document.getElementById('report-stage');
      const enemySel = document.getElementById('report-enemy');
      const stageId = Number(stageSel.value) || 0;
      const enemyId = Number(enemySel.value) || 0;
      const stage = stageId ? Game.index.stageById.get(stageId) : null;
      const enemy = enemyId ? Game.index.enemyById.get(enemyId) : null;
      const note = document.getElementById('report-note').value.trim();
      const reporter = document.getElementById('report-name').value.trim();

      if (!stage || !enemy) {
        UI.toast('Pick both a stage and a creature first');
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      try {
        await CommunityReports.submit({
          itemId: item.id, itemName: item.Name_en,
          stageId: stage.id, stageLabel: `Chapter ${stage.chapter} · Stage ${stage.stage} — ${stage.Name_en}`,
          enemyId: enemy.id, enemyName: enemy.Name_en,
          note, reporter,
        });
        UI.toast('Report submitted — thank you!');
        this.openDetail(item.id);
      } catch (err) {
        UI.toast(`Couldn't submit: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Submit Report';
      }
    });
  },

  // pins: [{chapter, stage, label, enemy?}] — opens the real in-game map
  // (see js/ui-map.js) with the item's own icon pinned on its real source
  // tile(s).
  openMap(item, pins) {
    const bossPortraits = pins.filter(p => p.enemy).map(p => p.enemy);
    const beforeHTML = bossPortraits.length ? `
      <div class="boss-portrait-row">
        ${bossPortraits.map(e => `
          <div class="boss-portrait">
            <img src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt="">
            <div>${escapeHtml(e.Name_en)}${e.NickName_en ? `<div class="fs-sub">"${escapeHtml(e.NickName_en)}"</div>` : ''}</div>
          </div>`).join('')}
      </div>` : '';

    const mapPins = pins.map(p => ({ chapter: p.chapter, stage: p.stage, iconUrl: Game.itemIcon(item), label: p.label }));
    MapUI.open(`${item.Name_en} — Where to Farm`, mapPins, beforeHTML);
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
