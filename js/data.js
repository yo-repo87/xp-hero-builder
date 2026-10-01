// ---------------------------------------------------------------------------
// data.js — loads every extracted game-balance table and builds fast lookup
// indices. Nothing in here mutates; it's the read-only "game database" layer.
// ---------------------------------------------------------------------------

const DATA_FILES = [
  'WeaponData', 'WeaponBonusOptionData', 'WeaponCategoryData', 'WeaponLevelUpBonusGroup',
  'WeaponLevelUpScrollCostData', 'WeaponLevelUpGoldCostData', 'SubWeaponUnlockCostData',
  'CostumeData', 'CostumeLevelData', 'CostumeLevelOptionData',
  'CostumeStarGradeOptionData', 'CostumeEvolutionData',
  'TraitOptionData', 'TraitOptionTypeData', 'TraitSynergyGroupData',
  'TraitSynergyInfoData', 'TraitSynergyTypeData', 'TraitRollData', 'TraitPresetSlotData',
  'AbilityListElementInfo', 'AbilityLevelUpCostInfo',
  'ExtraUpgradeTypeData', 'ExtraUpgradeLevelData',
  'SpecialUpgradeTypeData', 'SpecialUpgradeGradeData', 'SpecialUpgradeLevelData',
  'SoulUpgradeTypeData', 'SoulUpgradeLevelData',
  'StatData', 'BalancingData_Rarity', 'BalancingData_Currency',
  'PlayerLevelData', 'BlessingBuffData',
  'StackableItemData', 'EnemyData', 'ChestData', 'ChestSpawnerData',
  'MinimapRewardData', 'StageData', 'RewardGroupData', 'StageMapLayout',
  'EnemySpawnPoints', 'BossRaidStageData', 'ChallengeTowerStageData',
  'HeroTombRuneDropData', 'MissionCenterRewardGroupData', 'InvasionWinStreakRewardData',
  'InvasionRankingTierRewardData', 'InvasionPassRewardData', 'LuckySpinRewardData',
  'SevenDayCarnivalRewardData',
];

// BossRaidStageData.bossraid_difficulty — confirmed by cross-referencing
// against the real prefab names each difficulty's enemy_id resolves to
// (e.g. enemy_id for difficulty 10 is CH1_RaidBoss_CrystalCrab_Normal,
// for 40 it's ..._Hell — see CLAUDE.md "Boss Raid / Challenge Tower /
// Hero's Tomb rewards").
const BOSSRAID_DIFFICULTY_NAMES = { 10: 'Normal', 20: 'Hard', 30: 'Extreme', 40: 'Hell' };

// Rarity/tier system shared by weapons (1-9) and heroes (1-8). Names come
// directly from the game's own localization (CODEX_RARITY_* keys); the
// ordering (1=Normal ... 9=Eternal) matches how those keys are authored in
// the Locale table and lines up with the WeaponData/BalancingData_Rarity
// integer scale. `c` is the real color sampled directly from each tier's
// actual in-game rarity-ring art (assets/img/ui/circle/), not invented.
// `art` is the sprite-name stem used across circle/ribbon/grade art.
const RARITY_COLORS = {
  1: { name: 'Normal',    art: 'Normal',    c: '#74969c' },
  2: { name: 'Fine',      art: 'Fine',      c: '#529b10' },
  3: { name: 'Rare',      art: 'Rare',      c: '#2974d5' },
  4: { name: 'Epic',      art: 'Epic',      c: '#a700db' },
  5: { name: 'Legendary', art: 'Legendary', c: '#e48400' },
  6: { name: 'Ancient',   art: 'Ancient',   c: '#ff4357' },
  7: { name: 'Mythic',    art: 'Mythic',    c: '#0b9c89' },
  8: { name: 'Exotic',    art: 'Exotic',    c: '#df5a90' },
  9: { name: 'Eternal',   art: 'Eternal',   c: '#7bb2c9' },
};

// Real chapter names, resolved from the game's own Locale table
// (CHAPTER1_NAME/etc — via the real ChapterData table, 3 rows only; the
// game has no name yet for chapter 4+). Chapters beyond 3 fall back to a
// plain "Chapter N" label rather than inventing a name.
const CHAPTER_NAMES = {
  1: 'Lost Sanctuary',
  2: 'Fallen Kingdoms',
  3: 'Invaded City',
};

// E_BonusOption (compiled C# enum, TypeDefIndex 5592) — the option-type
// space used by CostumeLevelOptionData, CostumeStarGradeOptionData,
// CostumeEvolutionData, and WeaponCategoryData.Class_OptionType. CONFIRMED
// BY DECOMPILATION (2026-09-04): all four tables' OptionType fields are
// declared `E_BonusOption`, NOT StatData's id space — the two numbering
// schemes only agree at 1 (Attack/Power) and diverge everywhere else (e.g.
// StatData's id 12 is "Cargo" but E_BonusOption's 12 is "Skill Damage" —
// this project's earlier code used StatData for these fields and got
// visibly wrong labels for it, like "CARGO" as a Gun/Gunslinger stat
// recommendation). Names are the real `HERO_BONUS_OPTION_*` Locale strings
// (a decompiled-confirmed hero-flavored label set distinct from the
// weapon-flavored `WEAPON_BONUS_OP_*` keys used in WeaponBonusOptionData /
// WeaponLevelUpBonusGroup), not invented.
const BONUS_OPTION_NAMES = {
  1: 'Attack Power Up', 2: 'Critical Damage Up', 3: 'Life Steal Up',
  4: 'Skill Cooldown Reduce', 5: 'HP Up', 6: 'HP Recovery Up',
  7: 'Evasion Up', 8: 'Move Speed Up', 9: 'Critical Rate Up',
  10: 'Attack Speed Up', 11: 'Cargo Up', 12: 'Skill Damage Up',
  13: 'Multi-Attack Up', 14: 'Triple Attack Up', 15: 'Gold Gain Up',
  16: 'EXP Gain Up', 17: 'Enhanced Atk Up', 18: 'Enemy Heal Down',
  19: 'Ranged DMG Up', 20: 'Melee DMG Up', 21: 'Status Resist Up',
  22: 'Basic Atk Up',
};

const Game = {
  db: {},
  index: {},

  async load() {
    const entries = await Promise.all(
      DATA_FILES.map(name =>
        fetch(`data/${name}.json`).then(r => {
          if (!r.ok) throw new Error(`Failed to load ${name}.json`);
          return r.json();
        }).then(json => [name, json])
      )
    );
    for (const [name, json] of entries) this.db[name] = json;
    this._buildIndex();
    return this;
  },

  _buildIndex() {
    const idx = this.index;

    idx.weaponById = new Map(this.db.WeaponData.map(w => [w.id, w]));
    idx.weaponsByCategory = groupBy(this.db.WeaponData, w => w.Category);
    idx.weaponCategoryById = new Map(this.db.WeaponCategoryData.map(c => [c.id, c]));
    idx.weaponBonusOptionById = new Map(this.db.WeaponBonusOptionData.map(o => [o.id, o]));
    idx.weaponLevelBonusByGroup = groupBy(this.db.WeaponLevelUpBonusGroup, r => r.GroupID);
    idx.rarityRowByKey = new Map(this.db.BalancingData_Rarity.map(r => [`${r.Rarity}:${r.Grade}`, r]));
    idx.scrollCostByLevel = new Map(this.db.WeaponLevelUpScrollCostData.map(r => [r.id, r]));
    idx.goldCostCheckpoints = [...this.db.WeaponLevelUpGoldCostData].sort((a, b) => a.id - b.id);

    idx.costumeById = new Map(this.db.CostumeData.map(c => [c.id, c]));
    idx.costumeLevelByGroup = groupBy(this.db.CostumeLevelData, r => r.Group_Id);
    idx.costumeLevelOptByGroup = groupBy(this.db.CostumeLevelOptionData, r => r.Group_Id);
    idx.costumeStarOptByGroup = groupBy(this.db.CostumeStarGradeOptionData, r => r.Group_Id);
    idx.costumeEvoByCostume = groupBy(this.db.CostumeEvolutionData, r => r.Costume_Id);

    idx.statById = new Map(this.db.StatData.map(s => [s.id, s]));

    idx.playerLevelRows = [...this.db.PlayerLevelData].sort((a, b) => a.id - b.id);
    idx.blessingBuffByType = groupBy(this.db.BlessingBuffData, b => b.buff_type);
    for (const arr of idx.blessingBuffByType.values()) arr.sort((a, b) => a.buff_level - b.buff_level);

    // --- Farmable items -----------------------------------------------------
    idx.itemById = new Map(this.db.StackableItemData.map(i => [i.id, i]));
    idx.enemyById = new Map(this.db.EnemyData.map(e => [e.id, e]));
    idx.chestById = new Map(this.db.ChestData.map(c => [c.id, c]));
    idx.stageById = new Map(this.db.StageData.map(s => [s.id, s]));
    idx.stageByChapterStage = new Map(this.db.StageData.map(s => [`${s.chapter}:${s.stage}`, s]));
    idx.rewardRowsByGroup = groupBy(this.db.RewardGroupData, r => r.Group);

    // Direct per-kill item drops — a third farm-source mechanism, distinct
    // from guaranteed boss rewards (MinimapRewardData) and chest tables
    // (ChestData/RewardGroupData), found 2026-09-30 after a user report
    // that Crimson Orb is a real monster drop even though neither of the
    // other two systems had it. EnemyData.DropItemType/DropItemType2 (two
    // independent slots per enemy) reference StackableItemData.Type — a
    // stable per-item type code confirmed 1:1-unique across the whole
    // catalog (every Type value maps to exactly one item id) — NOT
    // StackableItemData.id directly. See CLAUDE.md "Monster kill drops".
    idx.itemByType = new Map(this.db.StackableItemData.filter(i => i.Type != null && i.Type !== -1).map(i => [i.Type, i]));
    idx.killDropsByItemId = new Map();
    for (const e of this.db.EnemyData) {
      for (const slot of ['', '2']) {
        const type = e[`DropItemType${slot}`];
        if (type == null || type === -1) continue;
        const item = idx.itemByType.get(type);
        if (!item) continue;
        if (!idx.killDropsByItemId.has(item.id)) idx.killDropsByItemId.set(item.id, []);
        idx.killDropsByItemId.get(item.id).push({
          enemy: e, amount: e[`DropItemAmount${slot}`], pieces: e[`DropItemPieceCount${slot}`],
        });
      }
    }

    // Resolves a RewardGroupData Group id into real catalog items via the
    // RewardType==1 convention: RewardParam -> StackableItemData.Type (the
    // SAME idx.itemByType lookup killDropsByItemId above already uses).
    // Confirmed 2026-10-01 by checking every one of the 898 RewardType==1
    // rows in the whole table: all 26 distinct RewardParam values resolve
    // cleanly via itemByType with zero orphans. This is a DIFFERENT
    // RewardType than chests use (RewardType==4, resolved via
    // StackableItemData.id directly in ui-farmable.js's own chest loop,
    // left untouched) — the two codes coexist in the same table for
    // different source systems. RewardType==0 rows are real "nothing"
    // filler slots (RewardParam always -1) and are skipped, not errors.
    // See CLAUDE.md "Boss Raid / Challenge Tower / Hero's Tomb rewards".
    idx.resolveRewardGroup = (groupId) => {
      const rows = idx.rewardRowsByGroup.get(groupId) || [];
      const byBundle = groupBy(rows, r => r.BundleGroup);
      const out = [];
      for (const bundleRows of byBundle.values()) {
        const total = bundleRows.reduce((s, r) => s + r.Rate, 0);
        if (total <= 0) continue;
        for (const r of bundleRows) {
          if (r.RewardType !== 1 || r.Rate <= 0) continue;
          const item = idx.itemByType.get(r.RewardParam);
          if (!item) continue;
          out.push({ item, pct: (r.Rate / total) * 100, amountMin: r.RewardCount_Min, amountMax: r.RewardCount_Max });
        }
      }
      return out;
    };

    // Boss Raid clear rewards — a 4th farm-source mechanism, found
    // 2026-10-01. BossRaidStageData ties 6 named Chapter-1 raid bosses (at
    // 4 difficulty tiers each, confirmed via enemy_id resolving to the
    // real CH1_RaidBoss_*_Normal/Hard/Extreme/Hell EnemyData rows) to two
    // reward groups each: clear_reward_group_id (repeatable every clear)
    // and first_clear_reward_group_id (one-time bonus only). Both resolve
    // through the same RewardGroupData pipeline as everything else.
    idx.bossRaidDropsByItemId = new Map();
    for (const row of this.db.BossRaidStageData) {
      const enemy = idx.enemyById.get(row.enemy_id);
      if (!enemy) continue;
      const difficulty = BOSSRAID_DIFFICULTY_NAMES[row.bossraid_difficulty] || `Difficulty ${row.bossraid_difficulty}`;
      for (const [groupId, repeatable] of [[row.clear_reward_group_id, true], [row.first_clear_reward_group_id, false]]) {
        if (!groupId) continue;
        for (const r of idx.resolveRewardGroup(groupId)) {
          if (!idx.bossRaidDropsByItemId.has(r.item.id)) idx.bossRaidDropsByItemId.set(r.item.id, []);
          idx.bossRaidDropsByItemId.get(r.item.id).push({
            enemy, difficulty, repeatable, pct: r.pct, amountMin: r.amountMin, amountMax: r.amountMax,
          });
        }
      }
    }

    // Challenge Tower floor-clear rewards — a 5th farm-source mechanism,
    // found 2026-10-01. Unlike every other source here, ChallengeTowerStageData
    // encodes its rewards directly as two parallel comma-separated arrays
    // (reward_param_array / reward_amount_array) with no RewardGroupData
    // indirection at all — confirmed by resolving all 3 distinct param
    // values (0, 3, 301) via itemByType (Gold, Gem, Weapon Scroll), zero
    // orphans. Every one of the 250 floors gives a flat, guaranteed reward
    // on clear (no Rate/weight field exists on this table), so these show
    // as guaranteed, not a percentage chance.
    idx.towerDropsByItemId = new Map();
    for (const row of this.db.ChallengeTowerStageData) {
      const params = String(row.reward_param_array).split(',').map(Number);
      const amounts = String(row.reward_amount_array).split(',').map(Number);
      params.forEach((p, i) => {
        const item = idx.itemByType.get(p);
        if (!item) return;
        if (!idx.towerDropsByItemId.has(item.id)) idx.towerDropsByItemId.set(item.id, []);
        idx.towerDropsByItemId.get(item.id).push({ floor: row.floor, chapter: row.chapter, amount: amounts[i] });
      });
    }

    // Hero's Tomb per-kill-type rewards — a 6th farm-source mechanism,
    // found 2026-10-01 while tracing the "Rune" reward type discovered in
    // the v26.2.0 refresh (see CLAUDE.md Open Items). HeroTombRuneDropData
    // ties a specific floor (`difficulty`, really a floor number 1-20 —
    // confirmed matching HeroTombStageData.id 1:1, not a tiered-difficulty
    // scale despite the field name) and a monster category killed there
    // (`enemy_type`: Normal/Elite/Unique/Boss, not a specific enemy id) to
    // a reward group (`reward_id`) via the same resolver above. This is
    // how this app's first confirmed source for Rune Powder (item id 96)
    // was found — previously had zero confirmed sources.
    idx.heroTombDropsByItemId = new Map();
    for (const row of this.db.HeroTombRuneDropData) {
      for (const r of idx.resolveRewardGroup(row.reward_id)) {
        if (!idx.heroTombDropsByItemId.has(r.item.id)) idx.heroTombDropsByItemId.set(r.item.id, []);
        idx.heroTombDropsByItemId.get(r.item.id).push({
          floor: row.difficulty, enemyType: row.enemy_type, pct: r.pct, amountMin: r.amountMin, amountMax: r.amountMax,
        });
      }
    }

    // Meta-mode rewards — a 7th-through-12th farm-source mechanism, found
    // 2026-10-01 while widening the search for the 78 catalog items that
    // still had zero confirmed source after the Boss Raid/Challenge
    // Tower/Hero's Tomb pass above. Six real tables, all resolving via the
    // same confirmed StackableItemData.Type convention used everywhere
    // else in this pipeline (verified zero-orphan on every row actually
    // used below), folded into one combined index since they're all the
    // same shape (a labeled reward row, sometimes with a weighted %):
    //   - MissionCenterRewardGroupData: `reward_param` -> .Type directly
    //     (no RewardGroupData indirection — this table already IS the
    //     resolved reward list, one row per mission-reward slot).
    //   - InvasionWinStreakRewardData: its own `reward_type` field holds
    //     the .Type code directly (a misleading field name — there's no
    //     separate "param" field on this table at all).
    //   - InvasionRankingTierRewardData: `reward_group_id` resolves through
    //     the normal idx.resolveRewardGroup (RewardType==1) pipeline.
    //   - InvasionPassRewardData: `stackableItem_type` -> .Type directly,
    //     but ONLY on `item_type===1` rows — `item_type===7` rows also set
    //     `stackableItem_type` but to values that don't correspond to real
    //     items when checked (likely a Hero/Weapon reward category reusing
    //     the field name for something else) — skipped rather than guessed.
    //   - LuckySpinRewardData: `reward_param` -> .Type, weighted by `weight`
    //     within each `preset_id` (a spin wheel, not a `Rate`/`BundleGroup`
    //     table like the chest/raid ones, so weighted manually here).
    //   - SevenDayCarnivalRewardData: `reward_param` -> .Type, one fixed
    //     reward per `order` (day number) — no weight field exists, so
    //     these are flat/deterministic like Challenge Tower floors.
    // Every table above also has rows using OTHER reward_type codes (2, 7,
    // etc. — almost certainly Weapon/Hero rewards, a different reward
    // category this app's item catalog doesn't cover) — only the
    // confirmed StackableItem-resolving rows are included here.
    idx.otherDropsByItemId = new Map();
    const pushOther = (itemId, row) => {
      if (!idx.otherDropsByItemId.has(itemId)) idx.otherDropsByItemId.set(itemId, []);
      idx.otherDropsByItemId.get(itemId).push(row);
    };

    for (const r of this.db.MissionCenterRewardGroupData) {
      if (r.reward_type !== 1) continue;
      const item = idx.itemByType.get(r.reward_param);
      if (!item) continue;
      pushOther(item.id, { source: 'Mission', title: `Mission reward (group ${r.reward_group_id})`, pct: null, amount: r.reward_count });
    }

    for (const r of this.db.InvasionWinStreakRewardData) {
      if (r.item_type !== 1) continue;
      const item = idx.itemByType.get(r.reward_type);
      if (!item) continue;
      pushOther(item.id, { source: 'Invasion', title: `Win Streak reward (checkpoint group ${r.group})`, pct: null, amount: r.reward_amount });
    }

    for (const r of this.db.InvasionRankingTierRewardData) {
      for (const res of idx.resolveRewardGroup(r.reward_group_id)) {
        pushOther(res.item.id, {
          source: 'Invasion',
          title: `Ranking reward — ${r.tier_type} tier, rank ${r.rank_range_min}-${r.rank_range_max} (${r.period_type})`,
          pct: res.pct, amountMin: res.amountMin, amountMax: res.amountMax,
        });
      }
    }

    for (const r of this.db.InvasionPassRewardData) {
      if (r.item_type !== 1) continue;
      const item = idx.itemByType.get(r.stackableItem_type);
      if (!item) continue;
      // unlock_level is a real sentinel -1 for rows gated by unlock_point
      // instead (a separate point-milestone track alongside the pass's
      // level track, confirmed by the paired real unlock_point value on
      // every -1 row rather than it also being 0/missing).
      const gate = r.unlock_level === -1 ? `${r.unlock_point} pts` : `Lv.${r.unlock_level}`;
      pushOther(item.id, { source: 'Invasion', title: `Invasion Pass season ${r.group_order} — unlock ${gate}${r.is_vip ? ' (VIP track)' : ''}`, pct: null, amount: r.reward_amount });
    }

    const spinWeightByPreset = new Map();
    for (const r of this.db.LuckySpinRewardData) {
      if (r.reward_type !== 1) continue;
      if (!spinWeightByPreset.has(r.preset_id)) spinWeightByPreset.set(r.preset_id, 0);
      spinWeightByPreset.set(r.preset_id, spinWeightByPreset.get(r.preset_id) + r.weight);
    }
    for (const r of this.db.LuckySpinRewardData) {
      if (r.reward_type !== 1) continue;
      const item = idx.itemByType.get(r.reward_param);
      if (!item) continue;
      const total = spinWeightByPreset.get(r.preset_id) || 0;
      if (total <= 0) continue;
      pushOther(item.id, {
        source: 'Lucky Spin',
        title: `Spin reward${r.is_free ? ' (free spin)' : ''}`,
        pct: (r.weight / total) * 100, amount: r.reward_amount,
      });
    }

    for (const r of this.db.SevenDayCarnivalRewardData) {
      if (r.reward_type !== 1) continue;
      const item = idx.itemByType.get(r.reward_param);
      if (!item) continue;
      pushOther(item.id, { source: '7-Day Carnival', title: `Day ${r.order}`, pct: null, amount: r.reward_amount });
    }

    // Real in-game minimap layout (see CLAUDE.md "Real map art" entry) —
    // exact normalized x/y/w/h per chapter+stage, extracted straight from
    // the actual Minimap popup prefab's RectTransform data, not estimated.
    idx.stageMapLayoutByChapterStage = new Map(this.db.StageMapLayout.map(r => [`${r.chapter}:${r.stage}`, r]));
    idx.stageMapLayoutByChapter = groupBy(this.db.StageMapLayout, r => r.chapter);

    // Parse "Chest_Stage14" -> stage id 14 on each spawner.
    idx.chestSpawnersByStageId = new Map();
    for (const sp of this.db.ChestSpawnerData) {
      const m = /Stage(\d+)/.exec(sp.key || '');
      if (m) idx.chestSpawnersByStageId.set(Number(m[1]), sp);
    }
    // Which stage(s) each chest (by ChestData.id) actually spawns at, via
    // ChestSpawnerData.ChestRespawnOrder (a cycle of ChestData ids per stage).
    idx.stageIdsByChestId = new Map();
    for (const [stageId, sp] of idx.chestSpawnersByStageId.entries()) {
      const order = String(sp.ChestRespawnOrder || '').split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
      for (const chestId of new Set(order)) {
        if (!idx.stageIdsByChestId.has(chestId)) idx.stageIdsByChestId.set(chestId, []);
        idx.stageIdsByChestId.get(chestId).push(stageId);
      }
    }

    // MinimapRewardData rows grouped by their reward (item or weapon) so the
    // farmable-items view can look up guaranteed boss-kill sources per item.
    // Fixed 2026-10-01: `reward_id` on a StackableItem row is in
    // StackableItemData.Type space, NOT .id — the exact same convention as
    // EnemyData's DropItemType/DropItemType2 and RewardGroupData's
    // RewardType==1 (see idx.itemByType/resolveRewardGroup above). The
    // previous code keyed this map directly by the raw reward_id and then
    // looked it up by .id in computeFarmSources, which only "worked" by
    // coincidence for the one row whose Type number happened to collide
    // with a different item's id (reward_id 3 is really Gem's Type, but
    // id 3 is BlueStone — so this was silently showing BlueStone as having
    // a guaranteed boss-drop source that actually belongs to Gem). Found
    // while re-auditing Farmable Items source coverage end-to-end.
    idx.minimapRewardsByItem = new Map();
    for (const r of this.db.MinimapRewardData) {
      if (r.reward_type !== 'StackableItem') continue;
      const item = idx.itemByType.get(r.reward_id);
      if (!item) continue;
      if (!idx.minimapRewardsByItem.has(item.id)) idx.minimapRewardsByItem.set(item.id, []);
      idx.minimapRewardsByItem.get(item.id).push(r);
    }
    // Same table, keyed by enemy instead — lets the Monsters tab show a
    // boss's one confirmed exact stage (no enemy has more than one row here).
    idx.minimapRewardByEnemyId = new Map(this.db.MinimapRewardData.map(r => [r.enemy_id, r]));

    // Real placed-in-world enemy spawn point coordinates (see CLAUDE.md
    // "Enemy spawn points" entry) — extracted by walking the actual Transform
    // hierarchy of the game's own EnemySpawnGroups scene data, joined against
    // EnemySpawnGroupData_158's key->EnemyDataId table. Coordinates are real
    // (x,z) positions in the game's own free-roam world space for that
    // chapter's region — a DIFFERENT coordinate system from StageMapLayout's
    // story-stage board tiles above, not directly comparable to it.
    idx.spawnPointsByEnemyId = groupBy(this.db.EnemySpawnPoints, p => p.enemy_data_id);
    idx.spawnPointsByChapter = groupBy(this.db.EnemySpawnPoints, p => p.chapter);

    idx.traitOptionById = new Map(this.db.TraitOptionData.map(t => [t.id, t]));
    idx.traitOptionsByGroupRarity = groupBy(this.db.TraitOptionData, t => `${t.option_group_id}:${t.option_rarity}`);
    idx.traitOptionTypeById = new Map(this.db.TraitOptionTypeData.map(t => [t.option_type ?? t.id, t]));
    idx.traitSynergyTypeById = new Map(this.db.TraitSynergyTypeData.map(t => [t.id, t]));
    idx.traitSynergyGroups = groupBy(this.db.TraitSynergyGroupData, g => g.group);
    idx.traitSynergyInfoByTypeValue = new Map(
      this.db.TraitSynergyInfoData.map(s => [`${s.option_type}:${s.synergy_value}`, s])
    );
    idx.traitSynergyInfoByType = groupBy(this.db.TraitSynergyInfoData, s => s.option_type);

    idx.abilityTypeById = new Map(this.db.AbilityListElementInfo.map(a => [a.id, a]));
    idx.abilityLevelsByType = groupBy(this.db.AbilityLevelUpCostInfo, a => a.AbilityType);
    for (const arr of idx.abilityLevelsByType.values()) arr.sort((a, b) => a.CurLevel - b.CurLevel);

    idx.extraTypeByOptionType = new Map(this.db.ExtraUpgradeTypeData.map(e => [e.OptionType, e]));
    idx.extraLevelsByOptionType = groupBy(this.db.ExtraUpgradeLevelData, e => e.OptionType);
    for (const arr of idx.extraLevelsByOptionType.values()) arr.sort((a, b) => a.Level - b.Level);

    idx.specialTypeByOptionType = new Map(this.db.SpecialUpgradeTypeData.map(s => [s.OptionType, s]));
    idx.specialGradeById = new Map(this.db.SpecialUpgradeGradeData.map(g => [g.id, g]));
    idx.specialLevelsByOptionType = groupBy(this.db.SpecialUpgradeLevelData, s => s.OptionType);
    // Sort/step by UpgradeLevel, not the raw Level field: Level resets to 1
    // at the start of every GradeLevel tier (1-5, then 1-10, then 1-15...),
    // so it's not unique/monotonic across tiers. UpgradeLevel is the true
    // cumulative counter (1, 2, 3, ... 50) that matches a single flat stepper.
    for (const arr of idx.specialLevelsByOptionType.values()) arr.sort((a, b) => a.UpgradeLevel - b.UpgradeLevel);

    idx.soulTypeByOptionType = new Map(this.db.SoulUpgradeTypeData.map(s => [s.OptionType, s]));
    idx.soulLevelsByOptionType = groupBy(this.db.SoulUpgradeLevelData, s => s.OptionType);
    for (const arr of idx.soulLevelsByOptionType.values()) arr.sort((a, b) => a.Level - b.Level);
  },

  weaponIcon(weapon) { return `assets/img/weapons/${weapon.id}.png`; },
  heroIcon(costume) { return `assets/img/heroes/${costume.id}.png`; },
  itemIcon(item) { return `assets/img/items/${item.PackageIcon}.png`; },
  enemyIcon(enemy) { return `assets/img/enemies/${enemy.IconSprite}.png`; },
  chestIcon(chest) { return `assets/img/chests/${chest.PrefabName}.png`; },
  stageMapTile(layoutRow) { return `assets/img/map/${layoutRow.sprite}.png`; },
  chapterName(chapter) { return CHAPTER_NAMES[chapter] || `Chapter ${chapter}`; },

  // No per-enemy chapter field exists in EnemyData — every enemy's own
  // internal `key` encodes it instead (e.g. "CH3_GreenOrc" -> chapter 3).
  // Confirmed consistent: every enemy sharing a "CHn_" prefix also shares
  // one exact ThemeId, and for chapters 1-3 (the only ones with extracted
  // StageData) it lines up with the real chapter numbers used everywhere
  // else in the app. Returns null for the handful of enemies with no "CHn_"
  // prefix (raid/special content, e.g. "World3_Dron_1").
  enemyChapter(enemy) {
    const m = /^CH(\d+)_/.exec(enemy.key || '');
    return m ? Number(m[1]) : null;
  },

  rarityColor(tier) { return RARITY_COLORS[tier] || RARITY_COLORS[1]; },

  // See BONUS_OPTION_NAMES above — the E_BonusOption id space, not StatData.
  bonusOptionName(type) { return BONUS_OPTION_NAMES[type] || `Option ${type}`; },

  // Real in-game rarity chrome — the game's own per-tier circular icon
  // background ring, ribbon banner, and text-plate badge (not redrawn).
  // NOTE: these are only ever used as CSS custom-property url() values
  // (--ring-img etc, set inline but consumed by rules in css/style.css) —
  // url() inside a custom property resolves relative to the *stylesheet
  // that reads it*, not the HTML page, so these need the `../` prefix that
  // style.css itself uses. Don't reuse these for <img src> (relative to the
  // HTML page instead) — use weaponIcon/heroIcon/itemIcon/etc. for that.
  rarityCircle(tier) { return `../assets/img/ui/circle/Circle_WeaponBg_${this.rarityColor(tier).art}.png`; },
  rarityRibbon(tier) { const a = this.rarityColor(tier).art; return `../assets/img/ui/ribbon/Ribbon_${a === 'Normal' ? 'Nomal' : a}.png`; },
  rarityGrade(tier) { return `../assets/img/ui/grade/Grade_${this.rarityColor(tier).art}.png`; },

  // Full fusion chain for a weapon (walks NextTierID both directions).
  weaponChain(weaponId) {
    const byId = this.index.weaponById;
    let w = byId.get(weaponId);
    if (!w) return [];
    // walk backward to the root of the chain
    let root = w;
    const all = [...this.db.WeaponData];
    let parent = all.find(x => x.NextTierID === root.id);
    while (parent) { root = parent; parent = all.find(x => x.NextTierID === root.id); }
    // walk forward from root
    const chain = [root];
    let cur = root;
    while (cur.NextTierID) {
      const next = byId.get(cur.NextTierID);
      if (!next) break;
      chain.push(next);
      cur = next;
    }
    return chain;
  },
};

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

function toArray(v) { return Array.isArray(v) ? v : (v === null || v === undefined ? [] : [v]); }
function num(v, fallback = 0) { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : fallback; }
