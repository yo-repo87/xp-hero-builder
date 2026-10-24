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
    // weapons: which weapon (by id) occupies each of the 6 equip slots —
    // just a pointer, not where level/rolls live (see weaponRoster below).
    // Matches the real game directly: a direct user report with 3 real
    // screenshots (2026-10-24) showed every weapon in the whole catalog
    // keeps its own level even while unequipped (shown "Lv.1" in the
    // roster grid, not absent) — this app previously stored level/rolls
    // INSIDE the slot itself, so swapping a weapon out silently discarded
    // its progress. See "Weapon roster" in CLAUDE.md for the full writeup.
    weapons: [null, null, null, null, null, null],
    // weaponRoster: { [weaponId]: {level, bonusRolls:[{optionId,pct}]} } —
    // persists independent of slot/equip status. A weaponId with no entry
    // here is implicitly level 1 / no rolls (matching the real game's own
    // default), not "doesn't exist" — every weapon in the catalog is
    // always browsable/levelable, there's no separate "ownership" gate
    // the way Heroes has (confirmed: the real roster grid shows literally
    // every weapon in the game, not just ones explicitly added).
    weaponRoster: {},
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
  // See the `weapons`/`weaponRoster` field comments in freshState() above —
  // level/rolls live in the roster, keyed by weaponId, independent of
  // whether (or where) that weapon is currently equipped.

  getWeaponState(weaponId) {
    return this.data.weaponRoster[weaponId] || { level: 1, bonusRolls: [] };
  },

  _ensureWeaponRosterEntry(weaponId) {
    if (!this.data.weaponRoster[weaponId]) this.data.weaponRoster[weaponId] = { level: 1, bonusRolls: [] };
    return this.data.weaponRoster[weaponId];
  },

  equipWeapon(slotIndex, weaponId) {
    if (weaponId == null) { this.clearWeaponSlot(slotIndex); return; }
    // A weapon can only occupy one slot at a time — if it's already
    // equipped elsewhere, move it rather than leaving a duplicate.
    const prevSlot = this.data.weapons.indexOf(weaponId);
    if (prevSlot !== -1 && prevSlot !== slotIndex) this.data.weapons[prevSlot] = null;
    this._ensureWeaponRosterEntry(weaponId);
    this.data.weapons[slotIndex] = weaponId;
    this.notify();
  },

  clearWeaponSlot(slotIndex) {
    // Roster data (level/rolls) is deliberately left untouched — this is
    // the actual fix for the reported data-loss bug.
    this.data.weapons[slotIndex] = null;
    this.notify();
  },

  setWeaponLevel(weaponId, level) {
    this._ensureWeaponRosterEntry(weaponId).level = level;
    this.notify();
  },

  setWeaponBonusRolls(weaponId, rolls) {
    this._ensureWeaponRosterEntry(weaponId).bonusRolls = rolls;
    this.notify();
  },

  // --- Heroes --------------------------------------------------------------

  addHero(costumeId) {
    if (this.data.heroes.some(h => h.costumeId === costumeId)) return;
    // runes: 7 slots, index 0 = this hero's own named Hero Rune, indices
    // 1-6 = free-choice general (Melee/Ranged/Universal) slots — confirmed
    // real via MilestonePresetEquipEntryData's own slot_index usage (0-6)
    // and the real RemoteConfig key RUNE_SLOT_OPENCONDITION_PLAYERLEVEL
    // ("1,1,200,250,300,350,400"); each entry is {runeDataId, level} | null.
    // See CLAUDE.md "Rune system" / "Multiple rune slots" for the full
    // writeup — this app originally modeled only slot 0 as a single `rune`
    // field, which a direct user report caught as a real, confirmed gap.
    const hero = { id: cryptoId(), costumeId, level: 1, starGrade: 1, evoRarity: 0, runes: Array(7).fill(null) };
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

  // --- Hero rune slots (7 per hero — see the `runes` field comment in
  // addHero above) -----------------------------------------------------

  setHeroRuneSlot(heroId, slotIndex, runeDataId) {
    const hero = this.getHero(heroId);
    if (!hero) return;
    hero.runes[slotIndex] = { runeDataId, level: 1 };
    this.notify();
  },
  setHeroRuneSlotLevel(heroId, slotIndex, level) {
    const hero = this.getHero(heroId);
    if (!hero || !hero.runes[slotIndex]) return;
    hero.runes[slotIndex].level = level;
    this.notify();
  },
  removeHeroRuneSlot(heroId, slotIndex) {
    const hero = this.getHero(heroId);
    if (!hero) return;
    hero.runes[slotIndex] = null;
    this.notify();
  },

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
  const { weapons, weaponRoster } = migrateWeaponRoster(obj);
  merged.weapons = weapons;
  merged.weaponRoster = weaponRoster;
  merged.traits = obj.traits && Array.isArray(obj.traits.slots) ? obj.traits : fresh.traits;
  merged.upgrades = { ...fresh.upgrades, ...(obj.upgrades || {}) };
  merged.heroes = (Array.isArray(obj.heroes) ? obj.heroes : []).map(migrateHeroRunes);
  merged.player = { ...fresh.player, ...(obj.player || {}) };
  merged.ui = { ...fresh.ui, ...(obj.ui || {}) };
  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

// A build saved before the 7-slot rune system (2026-10-24) has a single
// `rune: {runeDataId, level} | null` field instead of `runes: [...7]` —
// migrate it into slot 0 (the Hero Rune slot, matching where a
// hero-specific rune always lived under the old single-slot model) rather
// than losing it, and defensively backfill `runes` for any hero missing it
// for any other reason.
function migrateHeroRunes(hero) {
  if (Array.isArray(hero.runes) && hero.runes.length === 7) return hero;
  const runes = Array(7).fill(null);
  if (hero.rune) runes[0] = hero.rune;
  const { rune, ...rest } = hero;
  return { ...rest, runes };
}

// A build saved before the weapon-roster system (2026-10-24) has
// `weapons: [{weaponId, level, bonusRolls}|null, ...6]` — level/rolls
// lived INSIDE the slot, so re-slotting a weapon silently discarded its
// progress (the reported bug). Migrates each slot's embedded data into a
// real roster entry (keyed by weaponId, surviving unequip) and reduces
// the slot itself to a bare weaponId pointer. A save already on the new
// format (slot entries are plain ids/null, not objects) passes through
// unchanged — detected per-slot, not globally, so a partially-migrated
// or hand-edited save still comes through correctly.
function migrateWeaponRoster(obj) {
  const weapons = Array.isArray(obj.weapons) && obj.weapons.length === 6 ? obj.weapons : [null, null, null, null, null, null];
  const roster = { ...(obj.weaponRoster || {}) };
  const newWeapons = weapons.map(slot => {
    if (slot == null) return null;
    if (typeof slot === 'object') {
      if (!roster[slot.weaponId]) roster[slot.weaponId] = { level: slot.level || 1, bonusRolls: slot.bonusRolls || [] };
      return slot.weaponId;
    }
    return slot;
  });
  return { weapons: newWeapons, weaponRoster: roster };
}

function cryptoId() {
  return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
