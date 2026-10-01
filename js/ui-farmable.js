// ---------------------------------------------------------------------------
// ui-farmable.js — "Farmable Items" tab: the item catalog plus, per item,
// exactly where it comes from — sourced from real game data, not guessed.
//
// A dozen source types are modeled, all fully resolved from confirmed data
// (see CLAUDE.md "Monster kill drops" and "Boss Raid / Challenge Tower /
// Hero's Tomb rewards" plus "More item/monster location data" for the
// full writeups and confidence checks):
//   - "Guaranteed" drops: MinimapRewardData ties a specific named boss enemy
//     in a specific chapter/stage to a guaranteed item reward.
//   - "Chest" drops: ChestData -> RewardGroupData gives a real weighted drop
//     table per chest. Fixed 2026-10-01: a chest's own bundles mix TWO reward
//     codes (RewardType 4, resolved via StackableItemData.id, and RewardType
//     1, resolved via .Type — the previous code only implemented the first,
//     silently dropping every chest's BlueStone/Weapon Scroll rows). Zero-Rate
//     rows (locked/placeholder slots this table carries but the live client
//     apparently never rolls) are skipped rather than shown as a false "0%".
//     ChestSpawnerData.ChestRespawnOrder ties each chest to the specific
//     stage(s) it actually spawns at.
//   - "Monster" drops: EnemyData's own DropItemType/DropItemType2 fields,
//     resolved via StackableItemData.Type (idx.itemByType).
//   - "Boss Raid" / "Hero's Tomb" rewards: BossRaidStageData /
//     HeroTombRuneDropData each point at a RewardGroupData group too, but
//     via RewardType==1 (also resolved via .Type, NOT the chest convention's
//     .id match — a different code in the same table, see
//     idx.resolveRewardGroup in data.js).
//   - "Challenge Tower" rewards: ChallengeTowerStageData encodes its reward
//     directly as parallel arrays, no RewardGroupData indirection at all.
//   - "Other Confirmed Sources" (Mission / Invasion / Lucky Spin / 7-Day
//     Carnival): six more tables, all resolving the exact same way (either
//     through idx.resolveRewardGroup, or a field holding a .Type code
//     directly), folded into one combined idx.otherDropsByItemId since
//     they're all the same shape — see its comment in data.js for exactly
//     which field on which table does the resolving.
//
// "View Map" / "Track on Map" behavior is intentionally split by source
// type, because only some of them actually have a monster to go find:
//   - Guaranteed boss drops and community reports both name a specific
//     enemy, so their "Track on Map" button routes straight into that
//     monster's own full detail view (MonstersUI.openDetail) — the real
//     spawn-position + patrol-route overlay this app already builds for
//     the Monsters tab, so a farmable item's source is something you can
//     actually go stand next to in-game, not just a stage number.
//   - Chest drops have no monster at all (a chest just spawns at a stage),
//     so those keep the item's own icon pinned on the real story-stage
//     tile board (js/ui-map.js's MapUI) — the only representation that
//     makes sense for a source with no creature attached.
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
      const total = sources.guaranteed.length + sources.chest.length + sources.kill.length
        + sources.bossRaid.length + sources.tower.length + sources.heroTomb.length + sources.other.length;
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

    const killHTML = sources.kill.slice().sort((a, b) => (a.chapter ?? 99) - (b.chapter ?? 99) || a.enemy.Name_en.localeCompare(b.enemy.Name_en)).map(s => `
      <div class="farm-source-row" data-track-enemy="${s.enemy.id}">
        <img class="farm-source-thumb" src="${Game.enemyIcon(s.enemy)}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title">Kill <b>${escapeHtml(s.enemy.Name_en)}</b>${s.enemy.NickName_en ? ` <span style="font-style:italic;font-weight:400">"${escapeHtml(s.enemy.NickName_en)}"</span>` : ''}</div>
          <div class="fs-sub">${s.chapter !== null ? `Chapter ${s.chapter}` : 'Special/Raid'} · drops ×${fmtNum(s.amount)}${s.pieces !== s.amount ? ` (${fmtNum(s.pieces)} piece${s.pieces === 1 ? '' : 's'})` : ''}</div>
        </div>
        <button class="btn btn-sm">Track on Map</button>
      </div>`).join('');

    const guaranteedHTML = sources.guaranteed.map(s => `
      <div class="farm-source-row" data-track-enemy="${s.enemy ? s.enemy.id : ''}">
        <img class="farm-source-thumb" src="${s.enemy ? Game.enemyIcon(s.enemy) : ''}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title">Guaranteed — defeat <b>${escapeHtml(s.enemy ? s.enemy.Name_en : 'Unknown')}</b></div>
          <div class="fs-sub">${s.stage ? `Chapter ${s.stage.chapter} · Stage ${s.stage.stage} — ${escapeHtml(s.stage.Name_en)}` : 'Location unknown'} · drops ×${s.amount}</div>
        </div>
        ${s.enemy ? '<button class="btn btn-sm">Track on Map</button>' : ''}
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

    const bossRaidHTML = sources.bossRaid.slice().sort((a, b) => a.enemy.Name_en.localeCompare(b.enemy.Name_en) || a.pct - b.pct).map(s => `
      <div class="farm-source-row" data-track-enemy="${s.enemy.id}">
        <img class="farm-source-thumb" src="${Game.enemyIcon(s.enemy)}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title">Boss Raid — defeat <b>${escapeHtml(s.enemy.Name_en)}</b> (${s.difficulty}) <span class="mono" style="color:var(--gold)">${fmtNum(s.pct)}%</span></div>
          <div class="fs-sub">${s.repeatable ? 'Every clear' : 'First clear only'} · yields ${s.amountMin === s.amountMax ? s.amountMin : `${s.amountMin}-${s.amountMax}`}</div>
        </div>
        <button class="btn btn-sm">Track on Map</button>
      </div>`).join('');

    const towerHTML = sources.tower.slice().sort((a, b) => a.floor - b.floor).map(s => `
      <div class="farm-source-row">
        <div class="farm-source-info">
          <div class="fs-title">Challenge Tower — clear <b>Floor ${s.floor}</b></div>
          <div class="fs-sub">Chapter ${s.chapter} · guaranteed ×${fmtNum(s.amount)}</div>
        </div>
      </div>`).join('');

    const heroTombHTML = sources.heroTomb.slice().sort((a, b) => a.floor - b.floor || a.enemyType.localeCompare(b.enemyType)).map(s => `
      <div class="farm-source-row">
        <div class="farm-source-info">
          <div class="fs-title">Hero's Tomb — kill a <b>${escapeHtml(s.enemyType)}</b>-type monster <span class="mono" style="color:var(--gold)">${fmtNum(s.pct)}%</span></div>
          <div class="fs-sub">Floor ${s.floor} · yields ${s.amountMin === s.amountMax ? s.amountMin : `${s.amountMin}-${s.amountMax}`}</div>
        </div>
      </div>`).join('');

    const otherHTML = sources.other.slice().sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title)).map(s => `
      <div class="farm-source-row">
        <div class="farm-source-info">
          <div class="fs-title"><span class="tag">${escapeHtml(s.source)}</span> ${escapeHtml(s.title)}${s.pct != null ? ` <span class="mono" style="color:var(--gold)">${fmtNum(s.pct)}%</span>` : ''}</div>
          <div class="fs-sub">yields ${s.amount != null ? fmtNum(s.amount) : (s.amountMin === s.amountMax ? s.amountMin : `${s.amountMin}-${s.amountMax}`)}</div>
        </div>
      </div>`).join('');

    const reports = CommunityReports.forItem(itemId);
    const communityHTML = reports.map((rep, i) => {
      const enemy = rep.enemy_id ? Game.index.enemyById.get(rep.enemy_id) : null;
      const stage = rep.stage_id ? Game.index.stageById.get(rep.stage_id) : null;
      return `
      <div class="farm-source-row farm-source-row--community" data-track-enemy="${enemy ? enemy.id : ''}">
        <img class="farm-source-thumb" src="${enemy ? Game.enemyIcon(enemy) : ''}" onerror="onImgError(this)" alt="">
        <div class="farm-source-info">
          <div class="fs-title"><span class="tag tag--community">USER-REPORTED</span> Slay <b>${escapeHtml(rep.enemy_name || 'Unknown creature')}</b></div>
          <div class="fs-sub">${escapeHtml(rep.stage_label || 'Location not given')}${rep.note ? ` — "${escapeHtml(rep.note)}"` : ''}${rep.reporter ? ` <span style="color:var(--ink-faint)">— ${escapeHtml(rep.reporter)}</span>` : ''}</div>
        </div>
        ${enemy ? '<button class="btn btn-sm">Track on Map</button>' : ''}
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

            ${sources.kill.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Monster Drops</h4>${killHTML}` : ''}
            ${sources.guaranteed.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Guaranteed Boss Drops</h4>${guaranteedHTML}` : ''}
            ${sources.chest.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Chest Drop Rates</h4>${chestHTML}` : ''}
            ${sources.bossRaid.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Boss Raid Rewards</h4>${bossRaidHTML}` : ''}
            ${sources.tower.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Challenge Tower Rewards</h4>${towerHTML}` : ''}
            ${sources.heroTomb.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Hero's Tomb Rewards</h4>${heroTombHTML}` : ''}
            ${sources.other.length ? `<h4 style="margin:14px 0 6px;font-size:.9rem">Other Confirmed Sources</h4>${otherHTML}` : ''}
            ${sources.kill.length === 0 && sources.guaranteed.length === 0 && sources.chest.length === 0 && sources.bossRaid.length === 0 && sources.tower.length === 0 && sources.heroTomb.length === 0 && sources.other.length === 0 ? `
              <div class="caveat">No confirmed farm source found for this item in the extracted data — it likely comes from a system this app hasn't mapped yet (shop, chapter-clear rewards, player-level rewards, etc.), not that it's unobtainable.</div>` : `
              <div class="caveat">Monster Drops come directly from that enemy's own EnemyData row (DropItemType/DropItemType2 fields) — confirmed real per-kill drops, though whether they're guaranteed on every kill or roll against some other chance this table doesn't capture wasn't independently verified, and the "pieces" count shown alongside the drop amount (when it differs) is the field's own second number, not yet decompiled to confirm exactly what it means. Guaranteed drops come directly from the game's own boss-reward table. Chest percentages are this chest's real weighted drop table, normalized within its reward bundle — a chest with multiple bundles may show more than one line per item. Boss Raid / Hero's Tomb / Invasion Ranking percentages work the same way, from their own reward tables; Challenge Tower and 7-Day Carnival rewards are flat and guaranteed (no weighted roll exists in those tables). "Other Confirmed Sources" covers Mission, Invasion, and Lucky Spin rewards — real reward-table data, but this app doesn't model exactly how to unlock/progress each of those modes, so these show the real reward math, not a walkthrough.</div>`}

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

    // Guaranteed-drop and community-report rows both name a real enemy —
    // route straight to that monster's own detail view (real spawn
    // position + patrol route overlay, plus its story-stage tile if it
    // has one) rather than just pinning the item icon on a stage tile.
    document.querySelectorAll('[data-track-enemy]').forEach(el => {
      const enemyId = Number(el.dataset.trackEnemy);
      if (!enemyId) return;
      el.querySelector('button')?.addEventListener('click', () => MonstersUI.openDetail(enemyId));
    });
    document.querySelectorAll('[data-map-chest]').forEach(el => {
      el.addEventListener('click', () => {
        const s = sources.chest[Number(el.dataset.mapChest)];
        const pins = s.stages.map(st => ({ chapter: st.chapter, stage: st.stage, label: s.chest.Name }));
        this.openMap(item, pins);
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

  // pins: [{chapter, stage, label}] — opens the real in-game story-stage
  // board (see js/ui-map.js) with the item's own icon pinned on its real
  // source tile(s). Only used for chest sources now — chests have no
  // monster to track, so the item icon is the right thing to pin here.
  // Guaranteed/community sources route to MonstersUI.openDetail instead
  // (see the click-wiring above).
  openMap(item, pins) {
    const mapPins = pins.map(p => ({ chapter: p.chapter, stage: p.stage, iconUrl: Game.itemIcon(item), label: p.label }));
    MapUI.open(`${item.Name_en} — Where to Farm`, mapPins);
  },
};

function computeFarmSources(itemId) {
  const sources = { guaranteed: [], chest: [], kill: [], bossRaid: [], tower: [], heroTomb: [], other: [] };

  sources.bossRaid = Game.index.bossRaidDropsByItemId.get(itemId) || [];
  sources.tower = Game.index.towerDropsByItemId.get(itemId) || [];
  sources.heroTomb = Game.index.heroTombDropsByItemId.get(itemId) || [];
  sources.other = Game.index.otherDropsByItemId.get(itemId) || [];

  for (const r of (Game.index.killDropsByItemId.get(itemId) || [])) {
    sources.kill.push({ enemy: r.enemy, amount: r.amount, pieces: r.pieces, chapter: Game.enemyChapter(r.enemy) });
  }

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
        if (r.Rate <= 0) continue;
        // RewardType 4 resolves via StackableItemData.id directly; RewardType 1
        // (found 2026-10-01 — the same bundles mix both codes) resolves via
        // .Type, same convention as Monster/Boss Raid/Hero's Tomb drops above.
        let resolvedId = null;
        if (r.RewardType === 4) resolvedId = r.RewardParam;
        else if (r.RewardType === 1) { const it = Game.index.itemByType.get(r.RewardParam); resolvedId = it ? it.id : null; }
        if (resolvedId !== itemId) continue;
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
