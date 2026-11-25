// ---------------------------------------------------------------------------
// save-edit.js — read an XP Hero save zip, edit wallet / stack items /
// hero tokens / weapons, and write a zip the game can load.
//
// File format (same as save-import.js): name = Base64 of UTF-16LE
// "save_<key>_1.0|1.1", body = header (a UTF-8 BOM on real files) plus
// Base64 of UTF-16LE JSON. Two slots; the higher "version" wins.
//
// Confirmed from SaveData_UserCurrency in the v27.2.0 dump and from a live
// save: wallet keys are "gold", "gem", "crystal", all decimal strings.
// Those match E_StackableItemType 0 / 1 / 3, which are StackableItemData
// Gold / BlueStone / Gem. The shop currency named Gem is the "crystal"
// field. Other stackable amounts are a JSON object in "stack", keyed by
// E_StackableItemType. Weapons are save_weap: "o_list" (owned), "e_list"
// (slot → unique id), "l_index", "f_weapon".
// Hero tokens are CostumeStatus.PieceCount inside save_costume
// "o_list_sp17" (a JSON string keyed by costume id). Elixir (stack type 5)
// and Evolution Potion (stack type 8401) are ordinary stack amounts.
//
// Amounts are kept as digit strings. Wallet fields are int64 decimals in
// the file (up to 9223372036854775807). Stack values are JSON numbers, so
// they are only edited when every value is an integer JSON.parse can
// round-trip (within 2^53).
// ---------------------------------------------------------------------------

const SaveEdit = {
  INT64_MAX: '9223372036854775807',
  WALLET_KEYS: ['gold', 'gem', 'crystal'],

  canonDigit(value) {
    const s = String(value ?? '').trim();
    if (!/^(0|[1-9]\d*)$/.test(s)) return null;
    const max = this.INT64_MAX;
    if (s.length > max.length || (s.length === max.length && s > max)) return null;
    return s;
  },

  _apply(u8, fn) {
    let s = '';
    for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 4096)));
    return fn(s);
  },

  bytesToB64(u8) { return this._apply(u8, s => btoa(s)); },

  utf16le(text) {
    const u16 = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      u16[i * 2] = c & 0xff;
      u16[i * 2 + 1] = (c >> 8) & 0xff;
    }
    return u16;
  },

  encodeLogicalName(name) { return this.bytesToB64(this.utf16le(name)); },

  _marker(u8) {
    for (let i = 0; i <= u8.length - 4; i++) {
      if (u8[i] === 0x65 && u8[i + 1] === 0x77 && u8[i + 2] === 0x41 && u8[i + 3] === 0x69) return i;
    }
    return -1;
  },

  splitSave(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const at = this._marker(u8);
    if (at < 0) return null;
    let json;
    try { json = SaveImport.decodeContent(u8); } catch { return null; }
    if (!json || typeof json !== 'object') return null;
    return { header: u8.slice(0, at), json };
  },

  encodeSave(json, header) {
    const b64 = this.bytesToB64(this.utf16le(JSON.stringify(json)));
    const head = header || new Uint8Array([0xef, 0xbb, 0xbf]);
    const out = new Uint8Array(head.length + b64.length);
    out.set(head, 0);
    for (let i = 0; i < b64.length; i++) out[head.length + i] = b64.charCodeAt(i);
    return out;
  },

  _embedded(v) {
    if (v == null || v === '') return {};
    return typeof v === 'string' ? JSON.parse(v) : v;
  },

  _parseDigitMap(raw) {
    let obj;
    try { obj = this._embedded(raw); } catch { return null; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!/^-?\d+$/.test(k)) return null;
      const d = this.canonDigit(typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : String(v));
      if (d == null) return null;
    }
    for (const [k, v] of Object.entries(obj)) out[k] = this.canonDigit(String(v));
    return out;
  },

  _stringifyDigitMap(map) {
    const parts = [];
    for (const [k, v] of Object.entries(map)) {
      if (!/^-?\d+$/.test(k) || this.canonDigit(v) !== v) throw new Error('Refusing to write a stack amount that is not a plain integer');
      parts.push(`${JSON.stringify(k)}:${v}`);
    }
    return `{${parts.join(',')}}`;
  },

  _groupKey(logical) { return logical.replace(/_1\.[01]$/, ''); },
  _slot(logical) { return logical.endsWith('_1.1') ? 1 : 0; },

  // entries: [{ name, bytes:Uint8Array }] from a backup zip (decoded or encoded names).
  loadEntries(entries) {
    const files = [];
    for (const e of entries) {
      const logical = SaveImport.decodeName(e.name);
      if (!logical || !/^save_\w+_1\.[01]$/.test(logical)) continue;
      const split = this.splitSave(e.bytes);
      if (!split) continue;
      files.push({ logical, bytes: e.bytes, header: split.header, json: split.json });
    }
    if (!files.length) throw new Error('No XP Hero save files in that zip.');
    const groups = {};
    for (const key of ['save_currency', 'save_weap', 'save_costume', 'save_trait_roll']) {
      const slots = files.filter(f => this._groupKey(f.logical) === key);
      if (!slots.length) continue;
      const best = slots.reduce((a, b) => {
        const av = +a.json.version || 0, bv = +b.json.version || 0;
        if (bv > av || (bv === av && this._slot(b.logical) > this._slot(a.logical))) return b;
        return a;
      });
      const json = JSON.parse(JSON.stringify(best.json));
      const group = { key, json, baseVersion: +best.json.version || 0, dirty: false, slots: slots.map(s => s.logical) };
      if (key === 'save_currency') {
        const rawStack = typeof json.stack === 'string' ? json.stack : '';
        // JSON.parse cannot round-trip integers past 2^53. 16+ digits is past
        // that, so leave the stack string untouched rather than rewrite it wrong.
        group.stackLocked = /:\s*-?\d{16,}/.test(rawStack) || this._parseDigitMap(json.stack || '{}') == null;
      }
      if (key === 'save_costume') {
        const rawHeroes = typeof json.o_list_sp17 === 'string' ? json.o_list_sp17 : '';
        // Same limit as the stack: a 16-digit PieceCount cannot round-trip
        // through JSON.parse, so the hero list is left byte-for-byte.
        group.heroesLocked = !rawHeroes || /"PieceCount"\s*:\s*-?\d{16,}/.test(rawHeroes) || this._parseHeroes(rawHeroes) == null;
      }
      if (key === 'save_trait_roll') group.traitsLocked = this._parseTraits(json.sil) == null;
      groups[key] = group;
    }
    if (!groups.save_currency && !groups.save_weap && !groups.save_costume && !groups.save_trait_roll) throw new Error('That zip has no currency, weapon, hero, or trait save.');
    return { files, groups };
  },

  _group(session, key) {
    const g = session.groups[key];
    if (!g) {
      const missing = { save_currency: 'currency file', save_weap: 'weapon file', save_costume: 'hero file', save_trait_roll: 'trait file' };
      throw new Error(`This save has no ${missing[key] || 'file for that edit'}.`);
    }
    return g;
  },

  setWallet(session, key, digits) {
    if (!this.WALLET_KEYS.includes(key)) throw new Error('Unknown wallet field');
    const d = this.canonDigit(digits);
    if (d == null) throw new Error('Enter a whole number from 0 to 9223372036854775807');
    const g = this._group(session, 'save_currency');
    if (g.json[key] == null) throw new Error(`This save has no ${key} field`);
    g.json[key] = d;
    g.dirty = true;
  },

  readStack(session) {
    const g = session.groups.save_currency;
    if (!g || g.stackLocked) return null;
    return g._stack || this._parseDigitMap(g.json.stack || '{}');
  },

  setStack(session, type, digits) {
    const d = this.canonDigit(digits);
    if (d == null) throw new Error('Enter a whole number from 0 to 9223372036854775807');
    const t = String(type);
    if (!/^-?\d+$/.test(t)) throw new Error('Unknown item type');
    const g = this._group(session, 'save_currency');
    if (g.stackLocked) throw new Error('The stack field is not a plain integer map, so it was left unchanged.');
    if (!g._stack) g._stack = this._parseDigitMap(g.json.stack || '{}');
    g._stack[t] = d;
    g._stackDirty = true;
    g.dirty = true;
  },

  _parseHeroes(raw) {
    let obj;
    try { obj = this._embedded(raw); } catch { return null; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    for (const [k, hero] of Object.entries(obj)) {
      if (!/^[1-9]\d*$/.test(k) || !hero || typeof hero !== 'object' || Array.isArray(hero)) return null;
      const pc = hero.PieceCount;
      if (typeof pc === 'number') {
        if (!Number.isSafeInteger(pc) || pc < 0) return null;
      } else if (this.canonDigit(pc) == null) return null;
    }
    return obj;
  },

  _storeCount(digits) {
    const n = Number(digits);
    if (Number.isSafeInteger(n) && String(n) === digits) return n;
    return digits;
  },

  _stringifyHeroes(list) {
    const body = JSON.stringify(list, (k, v) => {
      if (k !== 'PieceCount') return v;
      const digits = typeof v === 'number' ? String(v) : v;
      if (this.canonDigit(digits) !== digits) throw new Error('Hero token count is not a plain integer');
      return `__PC_${digits}__`;
    });
    return body.replace(/"__PC_(\d+)__"/g, '$1');
  },

  readHeroes(session) {
    const g = session.groups.save_costume;
    if (!g || g.heroesLocked) return null;
    if (!g._heroes) g._heroes = this._parseHeroes(g.json.o_list_sp17);
    return g._heroes;
  },

  // Returns the hero row, creating it only when create is true. birth is
  // { rarity } from CostumeData, used only for a new row.
  _heroRow(session, costumeId, birth, create) {
    const id = String(costumeId);
    if (!/^[1-9]\d*$/.test(id)) throw new Error('Unknown hero');
    const g = this._group(session, 'save_costume');
    if (g.heroesLocked) throw new Error('Hero token counts are not plain integers, so the hero list was left unchanged.');
    if (!g._heroes) g._heroes = this._parseHeroes(g.json.o_list_sp17);
    if (!g._heroes) throw new Error('The hero list could not be read.');
    let hero = g._heroes[id];
    if (!hero && create) {
      const rarity = birth && Number.isInteger(+birth.rarity) ? +birth.rarity : null;
      if (rarity == null) throw new Error('That hero is not in this save.');
      hero = {
        CostumeID: +id, Level: 1, Grade: 1, Rarity: rarity,
        IsPurchased: false, IsMaxRarity: false, UnlockedOptions: {}, PieceCount: 0,
      };
      g._heroes[id] = hero;
      if (!g._createdHeroes) g._createdHeroes = new Set();
      g._createdHeroes.add(+id);
    }
    return { g, hero };
  },

  _heroTouched(g, id) {
    if (!g._editedHeroes) g._editedHeroes = new Set();
    g._editedHeroes.add(+id);
    g._heroesDirty = true;
    g.dirty = true;
  },

  // A zero on a missing hero writes nothing.
  setHeroPieces(session, costumeId, digits, birth) {
    const d = this.canonDigit(digits);
    if (d == null) throw new Error('Enter a whole number from 0 to 9223372036854775807');
    const { g, hero } = this._heroRow(session, costumeId, birth, d !== '0');
    if (!hero) return;
    hero.PieceCount = this._storeCount(d);
    this._heroTouched(g, costumeId);
  },

  // field is Level, Grade, Rarity, or IsPurchased. limits: { max } for Level
  // and Grade (min 1), { allowed: [rarities] } for Rarity. IsMaxRarity and
  // UnlockedOptions are never changed: what the game uses them for is not decoded.
  setHeroField(session, costumeId, field, value, limits, birth) {
    if (field === 'IsPurchased') {
      if (typeof value !== 'boolean') throw new Error('Unlocked must be true or false');
    } else if (field === 'Level' || field === 'Grade') {
      const max = limits && Number.isInteger(limits.max) && limits.max >= 1 ? limits.max : null;
      if (max == null) throw new Error(`No ${field === 'Level' ? 'max level' : 'max star'} for this hero`);
      if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${field === 'Level' ? 'Level' : 'Stars'} must be a whole number from 1 to ${max}`);
    } else if (field === 'Rarity') {
      const allowed = limits && Array.isArray(limits.allowed) ? limits.allowed : [];
      if (!Number.isInteger(value) || !allowed.includes(value)) throw new Error('That rarity is not one of this hero’s tiers');
    } else {
      throw new Error('Unknown hero field');
    }
    const { g, hero } = this._heroRow(session, costumeId, birth, true);
    hero[field] = value;
    this._heroTouched(g, costumeId);
  },

  // save_trait_roll "sil" is UserTraitSlotInfo[]: i slot index, o
  // TraitOptionData id, s synergy type, l _isLocked (all per the decompiled
  // JsonProperty names). Only o and s are edited; slots are never added.
  _parseTraits(raw) {
    let list;
    try { list = this._embedded(raw); } catch { return null; }
    if (!Array.isArray(list)) return null;
    for (const t of list) {
      if (!t || typeof t !== 'object' || ![t.i, t.o, t.s].every(Number.isSafeInteger) || typeof t.l !== 'boolean') return null;
    }
    return list;
  },

  // What a real roll can produce, derived from the game's roll tables the same
  // way TraitRollController.RollSingleSlot picks (decompiled): a TraitRollData
  // row by rate within the roll group -> a TraitOptionData row by rate within
  // that row's option group -> a TraitSynergyGroupData row by rate within its
  // synergy group. Only the rolled slot is read, so duplicates across slots are
  // allowed and there is no per-slot grade limit. Zero-rate rows are unreachable.
  traitRollRules(db) {
    const rollGroups = new Map();
    for (const r of db.TraitRollData || []) {
      if (!(r.rate > 0)) continue;
      if (!rollGroups.has(r.group)) rollGroups.set(r.group, []);
      rollGroups.get(r.group).push(r);
    }
    const optGroups = new Set(), synGroups = new Set(), odds = {};
    for (const [group, rows] of rollGroups) {
      const total = rows.reduce((t, r) => t + r.rate, 0);
      for (const r of rows) {
        optGroups.add(r.option_group_id); synGroups.add(r.synergy_group_id);
        (odds[r.option_group_rarity] ||= {})[group] = (odds[r.option_group_rarity]?.[group] || 0) + r.rate / total;
      }
    }
    const options = (db.TraitOptionData || []).filter(o => o.rate > 0 && optGroups.has(o.option_group_id));
    const synergies = [...new Set((db.TraitSynergyGroupData || []).filter(x => x.rate > 0 && synGroups.has(x.group)).map(x => x.synergy_type))];
    return {
      options: options.map(o => o.id),
      synergies: synergies.sort((x, y) => x - y),
      grades: [...new Set(options.map(o => o.option_rarity))].sort((x, y) => x - y),
      odds, // { grade: { rollGroup: probability } }
    };
  },

  readTraits(session) {
    const g = session.groups.save_trait_roll;
    if (!g || g.traitsLocked) return null;
    if (!g._traits) g._traits = this._parseTraits(g.json.sil);
    return g._traits;
  },

  // spec: { optionId, synergyType }, each checked against the allowed lists.
  setTraitSlot(session, slotIndex, spec, allowed) {
    const g = this._group(session, 'save_trait_roll');
    if (g.traitsLocked) throw new Error('The trait slot list could not be read, so it was left unchanged.');
    const list = this.readTraits(session);
    const slot = list.find(t => t.i === slotIndex);
    if (!slot) throw new Error('That trait slot is not in this save.');
    const o = spec.optionId, sy = spec.synergyType;
    if (!Number.isInteger(o) || !(allowed?.options || []).includes(o)) throw new Error('Unknown trait option');
    if (!Number.isInteger(sy) || !(allowed?.synergies || []).includes(sy)) throw new Error('Unknown synergy type');
    slot.o = o;
    slot.s = sy;
    if (!g._editedTraits) g._editedTraits = new Set();
    g._editedTraits.add(slotIndex);
    g.dirty = true;
  },

  readWeapons(session) {
    const g = session.groups.save_weap;
    if (!g) return null;
    return g._weapons || this._embedded(g.json.o_list || '{}');
  },

  readEquip(session) {
    const g = session.groups.save_weap;
    if (!g) return {};
    return g._equip || this._embedded(g.json.e_list || '{}');
  },

  _touchWeapons(session) {
    const g = this._group(session, 'save_weap');
    if (!g._weapons) g._weapons = this._embedded(g.json.o_list || '{}');
    g.dirty = true;
    return g;
  },

  setWeaponLevel(session, uid, level, cap) {
    const max = Number.isInteger(cap) && cap >= 1 ? cap : 1000000;
    if (!Number.isInteger(level) || level < 1 || level > max) throw new Error(`Level must be a whole number from 1 to ${max}`);
    const g = this._touchWeapons(session);
    const w = g._weapons[String(uid)];
    if (!w) throw new Error('That weapon is not in this save');
    w.Level = level;
  },

  // Keep the options already on the copy. If the next tier's BonusOptionCount
  // is higher, append unused WeaponBonusOptionData rows at the midpoint of
  // MinValue..MaxValue. Stored values are that range divided by 100, same as
  // a newly added weapon. This is not a game roll.
  fillBonusOptions(existing, count, pool) {
    const kept = (Array.isArray(existing) ? existing : []).map(o => ({
      BonusOptionType: o.BonusOptionType,
      Value: o.Value,
    }));
    const need = Number.isInteger(count) && count > 0 ? count : 0;
    if (kept.length >= need) return { bonusOptions: kept, added: 0 };
    const have = new Set(kept.map(o => o.BonusOptionType));
    const extras = [];
    for (const o of pool || []) {
      if (kept.length + extras.length >= need) break;
      if (have.has(o.OptionType)) continue;
      extras.push({ BonusOptionType: o.OptionType, Value: (o.MinValue + o.MaxValue) / 200 });
      have.add(o.OptionType);
    }
    return { bonusOptions: kept.concat(extras), added: extras.length };
  },

  // Change one owned copy to another weapon id. UniqueId, equip slots,
  // AddRate, FixedDPSAdd, and the lock flags stay. The caller decides the
  // level and bonus options.
  promoteWeapon(session, uid, spec) {
    const weaponId = +spec.weaponId;
    const level = spec.level;
    if (!Number.isInteger(weaponId) || weaponId <= 0) throw new Error('Unknown weapon');
    if (!Number.isInteger(level) || level < 1 || level > 1000000) throw new Error('Level must be a whole number from 1 to 1000000');
    if (!Array.isArray(spec.bonusOptions)) throw new Error('Missing bonus options');
    const g = this._touchWeapons(session);
    const w = g._weapons[String(uid)];
    if (!w) throw new Error('That weapon is not in this save');
    w.WeaponId = weaponId;
    w.Level = level;
    w.BonusOptions = spec.bonusOptions;
    if (g.json.f_weapon != null) {
      if (!g._first) g._first = this._embedded(g.json.f_weapon);
      if (Array.isArray(g._first) && !g._first.includes(weaponId)) g._first.push(weaponId);
    }
    if (spec.note) {
      g.addedNotes = g.addedNotes || new Map();
      g.addedNotes.set(+uid, spec.note);
    }
    return w;
  },

  removeWeapon(session, uid) {
    const g = this._group(session, 'save_weap');
    const list = g._weapons || this._embedded(g.json.o_list || '{}');
    if (!list[String(uid)]) throw new Error('That weapon is not in this save');
    g._weapons = list;
    if (!g._equip) g._equip = this._embedded(g.json.e_list || '{}');
    delete g._weapons[String(uid)];
    for (const k of Object.keys(g._equip)) if (String(g._equip[k]) === String(uid)) delete g._equip[k];
    if (g.placeholderUids) g.placeholderUids.delete(+uid);
    if (g.addedNotes) g.addedNotes.delete(+uid);
    g.dirty = true;
  },

  // bonusOptions is the save's BonusOptions array. placeholder marks a row
  // whose rolls were not copied from a real owned weapon.
  addWeapon(session, spec) {
    const weaponId = +spec.weaponId;
    const level = spec.level;
    const max = Number.isInteger(spec.maxLevel) && spec.maxLevel >= 1 ? spec.maxLevel : 1000000;
    if (!Number.isInteger(weaponId) || weaponId <= 0) throw new Error('Unknown weapon');
    if (!Number.isInteger(level) || level < 1 || level > max) throw new Error(`Level must be a whole number from 1 to ${max}`);
    if (!Array.isArray(spec.bonusOptions)) throw new Error('Missing bonus options');
    const g = this._touchWeapons(session);
    let maxUid = +g._lindex || +g.json.l_index || 0;
    for (const w of Object.values(g._weapons)) maxUid = Math.max(maxUid, +w.UniqueId || 0);
    const uid = maxUid + 1;
    g._weapons[String(uid)] = {
      UniqueId: uid, WeaponId: weaponId, Level: level, AddRate: 0, FixedDPSAdd: 0,
      IsLock: false, IsNew: true, IsRecommend: false, BonusOptions: spec.bonusOptions,
    };
    g._lindex = String(uid);
    if (g.json.f_weapon != null) {
      if (!g._first) g._first = this._embedded(g.json.f_weapon);
      if (Array.isArray(g._first) && !g._first.includes(weaponId)) g._first.push(weaponId);
    }
    if (spec.placeholder) {
      g.placeholderUids = g.placeholderUids || new Set();
      g.placeholderUids.add(uid);
    }
    if (spec.note) {
      g.addedNotes = g.addedNotes || new Map();
      g.addedNotes.set(uid, spec.note);
    }
    return uid;
  },

  _editedJson(g) {
    const json = Object.assign({}, g.json);
    json.version = String(g.baseVersion + 1);
    if (g._stackDirty) json.stack = this._stringifyDigitMap(g._stack);
    if (g._heroesDirty) json.o_list_sp17 = this._stringifyHeroes(g._heroes);
    if (g._editedTraits) json.sil = JSON.stringify(g._traits);
    if (g._weapons) json.o_list = JSON.stringify(g._weapons);
    if (g._equip) json.e_list = JSON.stringify(g._equip);
    if (g._lindex != null) json.l_index = g._lindex;
    if (g._first) json.f_weapon = JSON.stringify(g._first);
    return json;
  },

  // One entry per loaded save file. Edited groups are rewritten into every
  // slot they already had, at version = previous max + 1. Nothing else changes.
  buildFiles(session) {
    return session.files.map(f => {
      const g = session.groups[this._groupKey(f.logical)];
      const bytes = g && g.dirty ? this.encodeSave(this._editedJson(g), f.header) : f.bytes;
      return { name: this.encodeLogicalName(f.logical), logical: f.logical, bytes };
    });
  },

  _crcTable() {
    if (this._crc) return this._crc;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    this._crc = t;
    return t;
  },

  _crc32(u8) {
    const CRC = this._crcTable();
    let c = 0xffffffff;
    for (const x of u8) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  },

  // Stored (uncompressed) zip. Same layout the save puller writes.
  zipStored(entries) {
    const CRC = this._crc32.bind(this);
    const parts = [];
    const central = [];
    let off = 0;
    for (const { name, bytes } of entries) {
      const n = new Uint8Array([...name].map(ch => ch.charCodeAt(0)));
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const crc = CRC(data);
      const h = new Uint8Array(30);
      const hv = new DataView(h.buffer);
      hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint32(14, crc, true);
      hv.setUint32(18, data.length, true); hv.setUint32(22, data.length, true); hv.setUint16(26, n.length, true);
      parts.push(h, n, data);
      const c = new Uint8Array(46);
      const cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, off, true);
      central.push(c, n);
      off += 30 + n.length + data.length;
    }
    const cdLen = central.reduce((s, b) => s + b.length, 0);
    const e = new Uint8Array(22);
    const ev = new DataView(e.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdLen, true); ev.setUint32(16, off, true);
    const chunks = [...parts, ...central, e];
    const out = new Uint8Array(chunks.reduce((s, b) => s + b.length, 0));
    let p = 0;
    for (const b of chunks) { out.set(b, p); p += b.length; }
    return out;
  },

  readZip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (method !== 0) throw new Error('Compressed zip entries are not supported here');
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      out.push({ name: name.split('/').pop(), bytes: u8.slice(start, start + csize) });
    }
    return out;
  },
};
