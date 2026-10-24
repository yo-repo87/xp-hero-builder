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
    // weapons: which weapon COPY (an instance id, keyed into weaponRoster
    // below) occupies each of the 6 equip slots — just a pointer.
    // CONFIRMED by decompilation (2026-10-24, direct user follow-up ask —
    // "allow duplicates since this is a mechanic of the game"): the real
    // game's own `WeaponStatus` class (per-copy — UniqueId/WeaponId/Level/
    // BonusOptions) and `WeaponMergeValidator` (`Dictionary<int,
    // List<WeaponStatus>> ownListByWeaponId`, `NORMAL_MERGE_SAME_WEAPON_
    // COUNT = 3` — 3 copies of the same weapon merge into the next fusion
    // tier, `NextTierID`) confirm weapons are real, independent, multi-
    // owned instances, not one slot/one entry per weapon type. This app
    // modeled it as a single slot-embedded object originally (losing a
    // weapon's progress on re-slotting — a real reported bug, fixed
    // 2026-10-24 earlier the same day by moving level/rolls into a
    // weaponId-keyed roster), then as exactly one roster entry per
    // weaponId (still only one copy possible) — this is the third and
    // (per the real WeaponStatus shape) now-correct iteration: a roster
    // of individually-owned COPIES, keyed by a generated instance id, any
    // number of which can share the same weaponId. See "Weapon roster"
    // in CLAUDE.md for the full writeup of all three iterations.
    weapons: [null, null, null, null, null, null],
    // weaponRoster: { [instanceId]: {weaponId, level, bonusRolls:
    // [{optionId,pct}]} } — one entry per OWNED COPY (zero or more per
    // weaponId), persists independent of slot/equip status. A weaponId
    // with zero roster entries is simply not owned — unlike the
    // single-roster-entry iteration this replaces, ownership is now a
    // real, meaningful concept again (you can't have "2 duplicates" of
    // something that's implicitly always owned at level 1).
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
  // every owned COPY of a weapon is its own roster entry (instanceId),
  // independent of whether (or where) that specific copy is equipped.

  // All owned copies of one weaponId, newest-first-added is not
  // guaranteed — callers that care about order should sort by level/etc.
  // themselves. Returns [{instanceId, weaponId, level, bonusRolls}].
  getWeaponCopies(weaponId) {
    return Object.entries(this.data.weaponRoster)
      .filter(([, c]) => c.weaponId === weaponId)
      .map(([instanceId, c]) => ({ instanceId, ...c }));
  },

  getWeaponInstance(instanceId) {
    const c = this.data.weaponRoster[instanceId];
    return c ? { instanceId, ...c } : null;
  },

  // Adds a brand-new owned copy (level 1, no rolls) and returns its id.
  addWeaponCopy(weaponId) {
    const instanceId = weaponInstanceId();
    this.data.weaponRoster[instanceId] = { weaponId, level: 1, bonusRolls: [] };
    this.notify();
    return instanceId;
  },

  // Removes an owned copy entirely (e.g. added by mistake, or spent as
  // merge material once that flow exists) — unequips it first if it's
  // currently in a slot, so a slot never points at a deleted copy.
  removeWeaponCopy(instanceId) {
    const slot = this.data.weapons.indexOf(instanceId);
    if (slot !== -1) this.data.weapons[slot] = null;
    delete this.data.weaponRoster[instanceId];
    this.notify();
  },

  equipWeapon(slotIndex, instanceId) {
    if (instanceId == null) { this.clearWeaponSlot(slotIndex); return; }
    if (!this.data.weaponRoster[instanceId]) return; // unknown copy — no-op
    // One copy can only occupy one slot at a time (a different COPY of
    // the same weaponId is a separate instance and can equip freely).
    const prevSlot = this.data.weapons.indexOf(instanceId);
    if (prevSlot !== -1 && prevSlot !== slotIndex) this.data.weapons[prevSlot] = null;
    this.data.weapons[slotIndex] = instanceId;
    this.notify();
  },

  clearWeaponSlot(slotIndex) {
    // Roster data (level/rolls) is deliberately left untouched.
    this.data.weapons[slotIndex] = null;
    this.notify();
  },

  setWeaponLevel(instanceId, level) {
    const c = this.data.weaponRoster[instanceId];
    if (!c) return;
    c.level = level;
    this.notify();
  },

  setWeaponBonusRolls(instanceId, rolls) {
    const c = this.data.weaponRoster[instanceId];
    if (!c) return;
    c.bonusRolls = rolls;
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

// Weapon saves have been through two prior shapes this same day
// (2026-10-24), both superseded — see the big comment on `weapons` in
// freshState() above for the real-game evidence behind the current,
// instance-based one:
//   1. ancient: `weapons: [{weaponId, level, bonusRolls}|null, ...6]` —
//      level/rolls lived INSIDE the slot, so re-slotting a weapon
//      silently discarded its progress (the first reported bug).
//   2. today's first fix: `weapons: [weaponId|null, ...6]` +
//      `weaponRoster: {[weaponId]: {level, bonusRolls}}` — fixed the
//      data loss, but only one copy of any given weapon could ever
//      exist (the second reported gap — the real game allows owning and
//      leveling multiple copies, confirmed via decompiling
//      WeaponMergeValidator/WeaponStatus).
//   3. current: `weapons: [instanceId|null, ...6]` + `weaponRoster:
//      {[instanceId]: {weaponId, level, bonusRolls}}` — any number of
//      independently-leveled copies per weaponId.
// Detected per-slot/per-roster-entry (object vs number vs string), not
// globally, so a partially-migrated or hand-edited save still comes
// through correctly, and nothing is lost migrating straight from shape 1
// to shape 3 in one pass (most real saves, including this app's own
// already-shipped shape-2 saves from earlier today, will actually be
// shape 2 or 3 by the time anyone hits this with real data).
function migrateWeaponRoster(obj) {
  const weapons = Array.isArray(obj.weapons) && obj.weapons.length === 6 ? obj.weapons : [null, null, null, null, null, null];
  const oldRoster = obj.weaponRoster || {};
  const newRoster = {};
  const weaponIdToInstanceId = {}; // only for shape-2 roster entries, to rewrite shape-2 slot pointers below

  for (const [key, entry] of Object.entries(oldRoster)) {
    if (entry && entry.weaponId != null) {
      // already shape 3 — keep as-is
      newRoster[key] = { weaponId: entry.weaponId, level: entry.level || 1, bonusRolls: entry.bonusRolls || [] };
    } else {
      // shape 2 — the key itself IS the weaponId
      const weaponId = Number(key);
      const instanceId = weaponInstanceId();
      newRoster[instanceId] = { weaponId, level: (entry && entry.level) || 1, bonusRolls: (entry && entry.bonusRolls) || [] };
      weaponIdToInstanceId[weaponId] = instanceId;
    }
  }

  const newWeapons = weapons.map(slot => {
    if (slot == null) return null;
    if (typeof slot === 'object') {
      // shape 1 — level/rolls embedded directly in the slot
      const instanceId = weaponInstanceId();
      newRoster[instanceId] = { weaponId: slot.weaponId, level: slot.level || 1, bonusRolls: slot.bonusRolls || [] };
      return instanceId;
    }
    if (typeof slot === 'number') {
      // shape 2 — slot held a bare weaponId
      if (weaponIdToInstanceId[slot] != null) return weaponIdToInstanceId[slot];
      // weaponId wasn't in the roster for some reason — create a fresh instance defensively rather than drop the slot
      const instanceId = weaponInstanceId();
      newRoster[instanceId] = { weaponId: slot, level: 1, bonusRolls: [] };
      weaponIdToInstanceId[slot] = instanceId;
      return instanceId;
    }
    return slot; // already shape 3 (an instanceId string)
  });

  return { weapons: newWeapons, weaponRoster: newRoster };
}

function cryptoId() {
  return 'h_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function weaponInstanceId() {
  return 'w_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
