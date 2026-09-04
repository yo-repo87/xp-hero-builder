// ---------------------------------------------------------------------------
// data.js — loads every extracted game-balance table and builds fast lookup
// indices. Nothing in here mutates; it's the read-only "game database" layer.
// ---------------------------------------------------------------------------

const DATA_FILES = [
  'WeaponData', 'WeaponBonusOptionData', 'WeaponCategoryData',
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
  'MinimapRewardData', 'StageData', 'RewardGroupData',
];

// Rarity/tier color ramp shared by weapons (1-9) and heroes (1-8).
const RARITY_COLORS = {
  1: { name: 'Common',      c: '#8b93a5' },
  2: { name: 'Uncommon',    c: '#4fb56b' },
  3: { name: 'Rare',        c: '#3f8ff2' },
  4: { name: 'Epic',        c: '#a565e8' },
  5: { name: 'Heroic',      c: '#e2559a' },
  6: { name: 'Legendary',   c: '#f0a63d' },
  7: { name: 'Mythic',      c: '#ea4b4b' },
  8: { name: 'Ancestral',   c: '#28c9d6' },
  9: { name: 'Transcendent',c: '#f2d23d' },
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
    idx.minimapRewardsByItem = groupBy(
      this.db.MinimapRewardData.filter(r => r.reward_type === 'StackableItem'),
      r => r.reward_id
    );

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

  rarityColor(tier) { return RARITY_COLORS[tier] || RARITY_COLORS[1]; },

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
