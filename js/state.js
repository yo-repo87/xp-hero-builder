// ---------------------------------------------------------------------------
// state.js — the user's build: owned heroes, the 6 equipped weapon slots,
// trait loadout, and the four upgrade trees. Persisted to localStorage and
// (de)serializable to a single portable JSON file via import/export.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'xphero-builder-state-v1';
const SCHEMA_VERSION = 1;

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    weapons: [null, null, null, null, null, null], // {weaponId, level, bonusRolls:[{optionId,pct}]}
    traits: { slots: Array(10).fill(null) },        // traitOptionId per slot (2 groups x 5 synergy types)
    upgrades: {
      ability: {},  // { [abilityType]: level }
      extra: {},    // { [optionType]: level }
      special: {},  // { [optionType]: { grade, level } }
      soul: {},     // { [optionType]: level }
    },
    heroes: [],       // { id (local uid), costumeId, level, starGrade, evoRarity }
    activeHeroId: null,
    player: { level: 1, vipPerMille: 0 }, // account-wide inputs for the Total DPS estimate
    ui: { activeTab: 'weapons', guideHeroId: null },
  };
}

const State = {
  data: null,
  _listeners: [],

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { this.data = migrate(JSON.parse(saved)); }
      catch { this.data = freshState(); }
    } else {
      this.data = freshState();
    }
    return this.data;
  },

  subscribe(fn) { this._listeners.push(fn); },

  notify() {
    this.persist();
    for (const fn of this._listeners) fn(this.data);
  },

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  },

  // --- Weapons -----------------------------------------------------------

  setWeaponSlot(slotIndex, weaponId) {
    this.data.weapons[slotIndex] = weaponId == null ? null : { weaponId, level: 1, bonusRolls: [] };
    this.notify();
  },

  clearWeaponSlot(slotIndex) {
    this.data.weapons[slotIndex] = null;
    this.notify();
  },

  setWeaponLevel(slotIndex, level) {
    const slot = this.data.weapons[slotIndex];
    if (!slot) return;
    slot.level = level;
    this.notify();
  },

  setWeaponBonusRolls(slotIndex, rolls) {
    const slot = this.data.weapons[slotIndex];
    if (!slot) return;
    slot.bonusRolls = rolls;
    this.notify();
  },

  // --- Heroes --------------------------------------------------------------

  addHero(costumeId) {
    if (this.data.heroes.some(h => h.costumeId === costumeId)) return;
    const hero = { id: cryptoId(), costumeId, level: 1, starGrade: 1, evoRarity: 0 };
    this.data.heroes.push(hero);
    if (this.data.activeHeroId === null) this.data.activeHeroId = hero.id;
    this.notify();
    return hero;
  },

  removeHero(heroId) {
    this.data.heroes = this.data.heroes.filter(h => h.id !== heroId);
    if (this.data.activeHeroId === heroId) {
      this.data.activeHeroId = this.data.heroes[0]?.id ?? null;
    }
    if (this.data.ui.guideHeroId === heroId) this.data.ui.guideHeroId = null;
    this.notify();
  },

  setActiveHero(heroId) {
    this.data.activeHeroId = heroId;
    this.notify();
  },

  updateHero(heroId, patch) {
    const hero = this.data.heroes.find(h => h.id === heroId);
    if (!hero) return;
    Object.assign(hero, patch);
    this.notify();
  },

  getHero(heroId) { return this.data.heroes.find(h => h.id === heroId) || null; },
  getActiveHero() { return this.getHero(this.data.activeHeroId); },

  // --- Traits ------------------------------------------------------------

  setTraitSlot(slotIndex, traitOptionId) {
    this.data.traits.slots[slotIndex] = traitOptionId;
    this.notify();
  },

  // --- Upgrades ------------------------------------------------------------

  setAbilityLevel(abilityType, level) {
    this.data.upgrades.ability[abilityType] = level;
    this.notify();
  },
  setExtraLevel(optionType, level) {
    this.data.upgrades.extra[optionType] = level;
    this.notify();
  },
  setSpecialLevel(optionType, grade, level) {
    this.data.upgrades.special[optionType] = { grade, level };
    this.notify();
  },
  setSoulLevel(optionType, level) {
    this.data.upgrades.soul[optionType] = level;
    this.notify();
  },

  // --- Player (account-wide, for Total DPS estimate) ----------------------

  setPlayerLevel(level) {
    this.data.player.level = level;
    this.notify();
  },
  setPlayerVip(perMille) {
    this.data.player.vipPerMille = perMille;
    this.notify();
  },

  // --- Tabs/UI ---------------------------------------------------------

  setTab(tab) { this.data.ui.activeTab = tab; this.notify(); },
  setGuideHero(heroId) { this.data.ui.guideHeroId = heroId; this.notify(); },

  // --- Import / Export -----------------------------------------------------

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    this.data = migrate(parsed);
    this.notify();
  },

  resetAll() {
    this.data = freshState();
    this.notify();
  },
};

function migrate(obj) {
  // Single version so far — just backfill any missing keys defensively so
  // an older/partial export never crashes the app.
  const fresh = freshState();
  const merged = { ...fresh, ...obj };
  merged.weapons = Array.isArray(obj.weapons) && obj.weapons.length === 6 ? obj.weapons : fresh.weapons;
  merged.traits = obj.traits && Array.isArray(obj.traits.slots) ? obj.traits : fresh.traits;
  merged.upgrades = { ...fresh.upgrades, ...(obj.upgrades || {}) };
  merged.heroes = Array.isArray(obj.heroes) ? obj.heroes : [];
  merged.player = { ...fresh.player, ...(obj.player || {}) };
  merged.ui = { ...fresh.ui, ...(obj.ui || {}) };
  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

function cryptoId() {
  return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
