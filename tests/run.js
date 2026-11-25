#!/usr/bin/env node
// Regression tests for the core (non-DOM) logic: data indexing, formulas, state + migrations.
// Loads the real js/ files into one vm context with minimal browser stubs.
// Usage: node tests/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const store = {};
const ctx = {
  console,
  atob, btoa, TextDecoder, TextEncoder,
  URL,
  setTimeout, clearTimeout,
  crypto: require('crypto').webcrypto,
  location: { href: 'http://localhost/' },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} },
  fetch: async (url) => {
    const p = path.join(ROOT, url.split('?')[0]);
    if (!fs.existsSync(p)) return { ok: false };
    const body = fs.readFileSync(p, 'utf8');
    return { ok: true, json: async () => JSON.parse(body) };
  },
};
ctx.window = ctx;
vm.createContext(ctx);

const SRC = ['ui-common.js', 'data.js', 'formulas.js', 'state.js', 'screenshot-import.js', 'save-import.js', 'save-edit.js', 'farming.js']
  .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n');
// Top-level const/let aren't context properties; re-export the ones tests need.
vm.runInContext(SRC + '\n;globalThis.__T = { Game, Formulas, State, ScreenshotImport, formatLocaleArgs, SaveImport, SaveEdit, Farming, UpgradeCost, migrate: typeof migrate === "function" ? migrate : null };', ctx);
const { Game, Formulas, State, ScreenshotImport, formatLocaleArgs, SaveImport, SaveEdit, Farming, UpgradeCost } = ctx.__T;

let pass = 0, fail = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };
const fresh = () => { State.resetAll(); };

// ---------------- data ----------------
test('all data tables load and index builds', () => {
  ok(Object.keys(Game.db).length >= 60, 'expected 60+ tables');
  ok(Game.index && Game.index.itemByType, 'itemByType index');
});

// ---------------- Special Upgrade (verified vs real screenshots 2026-10-24) ----------------
test('special max level uses real MaxLevelDatas', () => {
  eq(Formulas.specialMaxLevelForGrade(1, 4), 50);
  eq(Formulas.specialMaxLevelForGrade(1, 1), 5);
});
test('special Load Master cumulative 47 = 47.0%', () => {
  const lm = Game.db.SpecialUpgradeTypeData.find(t => /LOAD MASTER/i.test(t.Title_en || t.Name_en || ''));
  ok(lm, 'Load Master row');
  const row = Formulas.specialRow(lm.OptionType, 47);
  eq(row.RateAmount / 10, 47);
});

// ---------------- Extra Upgrade (verified vs real screenshots 2026-11-21) ----------------
test('extra upgrade values match live game', () => {
  const exp = { 'Bulk Up': [32, 19.2], 'Extra Cargo': [26, 26], 'Strong Heart': [28, 11.2], 'Super Recovery': [50, 20],
    'Lucky Chance': [14, 2.8], 'Spell Overdrive': [23, 9.2], 'Bloodlust': [32, 6.4], 'Quick Cast': [24, 9.6] };
  for (const t of Game.db.ExtraUpgradeTypeData) {
    const e = exp[t.Title_en]; if (!e) continue;
    eq(Formulas.extraRow(t.OptionType, e[0]).RateAmount / 10, e[1], t.Title_en);
  }
});

// ---------------- Ability interpolation (verified 2026-10-24) ----------------
test('ability Cargo interpolates to live value at level 554', () => {
  const cargo = Game.db.AbilityListElementInfo.find(t => /cargo/i.test(t.Title_en));
  eq(Math.round(Formulas.abilityRow(cargo.id, 554).EffectAmount), 829086);
});

// ---------------- Heroes / runes ----------------
test('hero gets 7 rune slots; hero + generic rune coexist', () => {
  fresh();
  const h = State.addHero(Game.db.CostumeData[0].id);
  eq(h.runes.length, 7);
  const generic = Game.db.RuneData.find(r => !r.CostumeID);
  State.setHeroRuneSlot(h.id, 1, generic.id);
  const own = Game.db.RuneData.find(r => r.CostumeID === h.costumeId);
  if (own) State.setHeroRuneSlot(h.id, 0, own.id);
  ok(State.getHero(h.id).runes[1], 'generic slot kept');
});
test('legacy single-rune save migrates into slot 0', () => {
  fresh();
  const s = JSON.parse(State.exportJSON());
  s.heroes = [{ id: 'h1', costumeId: Game.db.CostumeData[0].id, level: 1, starGrade: 1, evoRarity: 0, rune: { runeDataId: 1, level: 3 } }];
  State.importJSON(JSON.stringify(s));
  eq(State.getHero('h1').runes[0], { runeDataId: 1, level: 3 });
  ok(!('rune' in State.getHero('h1')), 'old key removed');
});

// ---------------- Weapons roster / duplicates ----------------
test('duplicate weapon copies level independently and survive re-slotting', () => {
  fresh();
  const wid = Game.db.WeaponData[0].id;
  const a = State.addWeaponCopy(wid), b = State.addWeaponCopy(wid);
  State.equipWeapon(0, a); State.setWeaponLevel(a, 7);
  State.equipWeapon(1, b); State.setWeaponLevel(b, 3);
  State.equipWeapon(0, State.addWeaponCopy(Game.db.WeaponData[1].id));
  eq(State.getWeaponInstance(a).level, 7, 'unslotted copy keeps level');
  eq(State.getWeaponCopies(wid).length, 2);
});
test('legacy embedded-in-slot weapon save migrates', () => {
  fresh();
  const s = JSON.parse(State.exportJSON());
  const wid = Game.db.WeaponData[0].id;
  s.weapons = [{ weaponId: wid, level: 9, bonusRolls: [] }, null, null, null, null, null];
  delete s.weaponRoster;
  State.importJSON(JSON.stringify(s));
  const inst = State.getWeaponInstance(State.data.weapons[0]);
  eq([inst.weaponId, inst.level], [wid, 9]);
});

// ---------------- DPS + advisor ----------------
test('totalDpsBreakdown runs and nextBestUpgrades does not mutate state', () => {
  fresh();
  const h = State.addHero(Game.db.CostumeData[0].id);
  State.updateHero(h.id, { level: 60, starGrade: 3 });
  State.equipWeapon(0, State.addWeaponCopy(Game.db.WeaponData[0].id));
  const r = Formulas.totalDpsBreakdown(h.id);
  ok(r && r.dps > 0, 'positive dps');
  const before = JSON.stringify(State.data);
  Formulas.nextBestUpgrades(h.id);
  eq(JSON.stringify(State.data), before, 'state unchanged');
});

if (typeof Formulas.mergeRule === 'function') {
  test('weapon merge: 3 same copies -> next tier', () => {
    fresh();
    const w = Game.db.WeaponData.find(x => x.NextTierID && Game.db.WeaponData.some(y => y.id === x.NextTierID));
    const ids = [0, 1, 2].map(() => State.addWeaponCopy(w.id));
    State.equipWeapon(0, ids[0]);
    const res = State.mergeWeapons(ids);
    ok(res && res.ok, res && res.error);
    eq(State.getWeaponCopies(w.id).length, 0);
    eq(State.getWeaponCopies(w.NextTierID).length, 1);
    eq(State.data.weapons[0], res.newInstanceId, 'result takes over equipped slot');
  });
}

test('weapon merge: Exotic -> Eternal needs exactly 2', () => {
  fresh();
  const rule = Formulas.mergeRule(1108);
  eq([rule.required, rule.needsStone, rule.next.id], [2, true, 1109]);
  eq(Formulas.mergeRule(1008), null, 'no next tier');
  const three = [0, 1, 2].map(() => State.addWeaponCopy(1108));
  ok(!State.mergeWeapons(three).ok, '3 copies rejected');
  ok(State.mergeWeapons(three.slice(0, 2)).ok, '2 copies accepted');
});

// OCR text shaped like real tesseract output of the UPGRADES screens (numbers altered).
test('screenshot import parses Ability / Extra / Special OCR text', () => {
  const text = `UPGRADES x
POWER
% Increase Your Power
EF 4 70.5K > 70.6K
Level 500 / 2000
A CARGO
-— Increase Cargo Capacity
Level 400 / 1600
HP
HP Increase Your Health
Level 300 / 2000
BULK UP
Increase Extra Power
Level 30 / 50
STRONG HEART @ 15
LA 3 Increase Extra HP
Level 20 / 50
os + POWER 5%
149/220)
~~ MASSIVE MUSCLE
Increase extra Power
Level 20 / 20
LOAD MASTER
.- Increase extra Cargo
Level 17 / 20
Bhp Increase extra HP
HP BOOST
Level 11/20`;
  const r = Object.fromEntries(ScreenshotImport.parse(text).map(x => [`${x.tree}:${x.title}`, x]));
  eq(r['ability:POWER'].level, 500);
  eq(r['ability:CARGO'].level, 400);
  eq(r['ability:HP'].level, 300);
  eq(r['extra:Bulk Up'].level, 30);
  eq(r['extra:Strong Heart'].level, 20);
  eq([r['special:MASSIVE MUSCLE'].grade, r['special:MASSIVE MUSCLE'].level], [4, 50]);
  eq(r['special:LOAD MASTER'].level, 47, 'tier 17/20 at grade 4 = cumulative 47');
  eq(Object.keys(r).length, 8);
});

test('skill text placeholders use .NET formats from LocaleParamData', () => {
  eq(formatLocaleArgs('{0:P0}|{1:0%}|{2:0.0}|{3:N0}|{4:0.#}|{5}', { 0: 1.2, 1: 0.5, 2: 5, 3: 12345, 4: 3 }), '120%|50%|5.0|12,345|3|?');
  const purify = Game.db.SkillData.find(s => s.id === 10053);
  eq(formatLocaleArgs(purify.Desc_en.replace(/<[^>]+>/g, ''), purify.Params).startsWith('Deals 120% damage'), true);
});

test('Lucky Spin odds are normalised per wheel (preset + segment)', () => {
  const wheel = Game.db.LuckySpinRewardData.filter(r => r.preset_id === 1 && r.segment_id === 1);
  eq(wheel.length, 12);
  eq(wheel.reduce((s, r) => s + r.weight, 0), 1000);
});

test('gacha box odds each sum to 100%', () => {
  for (const b of Game.db.GachaOdds) {
    const t = b.outcomes.reduce((s, o) => s + o.pct, 0);
    ok(Math.abs(t - 100) < 0.05, `box ${b.id} sums to ${t}`);
  }
});

test('world map chapters and navmesh load', () => {
  const wm = Game.db.WorldMap;
  eq(wm.chapters.map(c => c.chapter), [1, 2]);
  eq(wm.nav['2'].polys.length, wm.nav['2'].links.length);
});

test('game save files decode (Base64 UTF-16LE name and body)', () => {
  const name = Buffer.from('save_ability_1.1', 'utf16le').toString('base64');
  eq(SaveImport.decodeName(name), 'save_ability_1.1');
  const body = Buffer.concat([Buffer.from([1, 2, 3]), Buffer.from(Buffer.from('{"version":"7","lvs":"{\\"1\\":737}"}', 'utf16le').toString('base64'))]);
  const json = SaveImport.decodeContent(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
  eq(json.version, '7');
  eq(SaveImport.toBuild({ save_ability: json }).build.upgrades.ability[1], 737);
});

test('save editor round-trips wallet, stack items, and weapons', () => {
  const header = Uint8Array.from([0xef, 0xbb, 0xbf]);
  const curNew = {
    version: '5', gold: '92933', gem: '1', crystal: '4549', lv: '219',
    stack: '{"7":32,"20":206,"2001":0}', max: '15', stack_c: '{}',
  };
  const curOld = Object.assign({}, curNew, { version: '2', gold: '1' });
  const weapons = {
    version: '1', l_index: '11', max_sc: '6', nai: '0',
    e_list: '{"0":10,"1":11}',
    o_list: JSON.stringify({
      '10': { UniqueId: 10, WeaponId: 1001, Level: 5, AddRate: 0.0, FixedDPSAdd: 0, IsLock: false, IsNew: false, IsRecommend: false, BonusOptions: [{ BonusOptionType: 5, Value: 0.00342875114 }] },
      '11': { UniqueId: 11, WeaponId: 2001, Level: 2, AddRate: 0, FixedDPSAdd: 0, IsLock: false, IsNew: false, IsRecommend: false, BonusOptions: [] },
    }),
    g_count: '{"1":3}', f_weapon: '[1001,2001]',
  };
  const player = { version: '4', nickname: 'keep' };
  const entries = [
    ['save_currency_1.0', curNew],
    ['save_currency_1.1', curOld],
    ['save_weap_1.0', weapons],
    ['save_player_1.0', player],
  ].map(([logical, json]) => ({ name: logical, logical, bytes: SaveEdit.encodeSave(json, header) }));
  const session = SaveEdit.loadEntries(entries);
  eq(session.groups.save_currency.json.gold, '92933');
  eq(session.groups.save_currency.baseVersion, 5);
  ok(SaveEdit.encodeLogicalName('save_currency_1.0') && SaveImport.decodeName(SaveEdit.encodeLogicalName('save_weap_1.0')) === 'save_weap_1.0');

  const untouched = SaveEdit.buildFiles(session).find(f => f.logical === 'save_player_1.0');
  eq([...untouched.bytes], [...entries.find(e => e.logical === 'save_player_1.0').bytes]);

  SaveEdit.setWallet(session, 'gold', '1000');
  SaveEdit.setWallet(session, 'crystal', SaveEdit.INT64_MAX);
  SaveEdit.setStack(session, 7, '5');
  SaveEdit.setStack(session, 301, '12');
  let threw = false;
  try { SaveEdit.setWallet(session, 'gem', '9223372036854775808'); } catch { threw = true; }
  ok(threw, 'rejects past int64');
  SaveEdit.setWeaponLevel(session, 10, 9);
  let overOwned = false;
  try { SaveEdit.setWeaponLevel(session, 10, 11, 10); } catch (err) { overOwned = /1 to 10/.test(err.message); }
  ok(overOwned, 'owned level rejects a value above the weapon max');
  eq(SaveEdit.readWeapons(session)['10'].Level, 9);
  SaveEdit.removeWeapon(session, 11);
  let overAdd = false;
  try { SaveEdit.addWeapon(session, { weaponId: 1007, level: 11, maxLevel: 10, bonusOptions: [] }); } catch (err) { overAdd = /1 to 10/.test(err.message); }
  ok(overAdd, 'add rejects a level above the weapon max');
  const uid = SaveEdit.addWeapon(session, { weaponId: 1007, level: 3, bonusOptions: [{ BonusOptionType: 1, Value: 0.007 }], placeholder: true, note: 'mid' });
  eq(uid, 12);

  const built = SaveEdit.buildFiles(session);
  const zip = SaveEdit.zipStored(built);
  const back = SaveEdit.loadEntries(SaveEdit.readZip(zip));
  const cur = back.groups.save_currency.json;
  eq(cur.version, '6');
  eq(cur.gold, '1000');
  eq(cur.crystal, SaveEdit.INT64_MAX);
  eq(cur.gem, '1');
  eq(cur.lv, '219');
  eq(cur.stack_c, '{}');
  const stack = JSON.parse(cur.stack);
  eq(stack['7'], 5);
  eq(stack['20'], 206);
  eq(stack['2001'], 0);
  eq(stack['301'], 12);
  const both = SaveEdit.readZip(zip).filter(f => SaveImport.decodeName(f.name).startsWith('save_currency'));
  eq(both.length, 2);
  for (const f of both) eq(SaveEdit.splitSave(f.bytes).json.gold, '1000');

  const wj = back.groups.save_weap.json;
  eq(wj.version, '2');
  eq(wj.g_count, '{"1":3}');
  ok(wj.o_list.includes('0.00342875114'), wj.o_list);
  const owned = JSON.parse(wj.o_list);
  eq(owned['10'].Level, 9);
  ok(!owned['11'], 'removed weapon stays removed');
  eq(owned['12'].WeaponId, 1007);
  eq(owned['12'].Level, 3);
  eq(JSON.parse(wj.e_list)['0'], 10);
  ok(JSON.parse(wj.e_list)['1'] == null);
  ok(JSON.parse(wj.f_weapon).includes(1007));
  const playerBack = SaveEdit.readZip(zip).find(f => SaveImport.decodeName(f.name) === 'save_player_1.0');
  eq(SaveEdit.splitSave(playerBack.bytes).json.nickname, 'keep');
  eq([...SaveEdit.splitSave(both[0].bytes).header], [0xef, 0xbb, 0xbf]);
});

test('save editor promotes one owned weapon to its next tier', () => {
  const weapons = {
    version: '1', l_index: '11',
    e_list: '{"0":10}',
    o_list: JSON.stringify({
      '10': { UniqueId: 10, WeaponId: 1002, Level: 14, AddRate: 0.5, FixedDPSAdd: 0, IsLock: true, IsNew: false, IsRecommend: false, BonusOptions: [{ BonusOptionType: 5, Value: 0.00342875114 }] },
    }),
    f_weapon: '[1002]',
  };
  const session = SaveEdit.loadEntries([{ name: 'save_weap_1.0', bytes: SaveEdit.encodeSave(weapons) }]);
  const rule = Formulas.mergeRule(1002);
  eq(rule.next.id, 1003);
  eq(rule.required, 3);
  ok(!rule.needsStone);
  const eternal = Formulas.mergeRule(1108);
  eq(eternal.required, 2);
  ok(eternal.needsStone);
  const count = Formulas.rarityRow(rule.next).BonusOptionCount;
  eq(count, 2);
  const filled = SaveEdit.fillBonusOptions([{ BonusOptionType: 5, Value: 0.00342875114 }], count, Game.db.WeaponBonusOptionData);
  eq(filled.added, 1);
  eq(filled.bonusOptions[0].Value, 0.00342875114);
  eq(filled.bonusOptions[1].BonusOptionType, 1);
  eq(filled.bonusOptions[1].Value, (0.3 + 1.1) / 200);
  const same = SaveEdit.fillBonusOptions([{ BonusOptionType: 5, Value: 1 }], 1, Game.db.WeaponBonusOptionData);
  eq(same.added, 0);
  eq(same.bonusOptions.length, 1);
  SaveEdit.promoteWeapon(session, 10, { weaponId: rule.next.id, level: 14, bonusOptions: filled.bonusOptions, note: 'up' });
  let threw = false;
  try { SaveEdit.promoteWeapon(session, 99, { weaponId: 1, level: 1, bonusOptions: [] }); } catch { threw = true; }
  ok(threw, 'missing uid');
  const back = SaveEdit.loadEntries(SaveEdit.readZip(SaveEdit.zipStored(SaveEdit.buildFiles(session))));
  const wj = back.groups.save_weap.json;
  const w = JSON.parse(wj.o_list)['10'];
  eq(w.WeaponId, 1003);
  eq(w.Level, 14);
  eq(w.AddRate, 0.5);
  eq(w.IsLock, true);
  eq(w.UniqueId, 10);
  eq(w.BonusOptions.length, 2);
  ok(JSON.stringify(w.BonusOptions).includes('0.00342875114'));
  eq(JSON.parse(wj.e_list)['0'], 10);
  const found = JSON.parse(wj.f_weapon);
  ok(found.includes(1002) && found.includes(1003));
});

test('save editor edits hero tokens and leaves other costume fields', () => {
  const costume = {
    version: '3', e_id: '4',
    o_list_sp17: JSON.stringify({
      '1': { CostumeID: 1, Level: 91, Grade: 3, Rarity: 2, IsPurchased: true, IsMaxRarity: false, UnlockedOptions: { 9: true }, PieceCount: 120 },
      '7': { CostumeID: 7, Level: 1, Grade: 1, Rarity: 6, IsPurchased: false, IsMaxRarity: false, UnlockedOptions: {}, PieceCount: 63 },
    }),
  };
  const session = SaveEdit.loadEntries([{ name: 'save_costume_1.0', bytes: SaveEdit.encodeSave(costume) }]);
  eq(SaveEdit.readHeroes(session)['1'].PieceCount, 120);
  SaveEdit.setHeroPieces(session, 1, '400');
  SaveEdit.setHeroPieces(session, 23, '0', { rarity: 7 });
  eq(SaveEdit.readHeroes(session)['23'], undefined);
  SaveEdit.setHeroPieces(session, 23, '15', { rarity: 7 });
  let threw = false;
  try { SaveEdit.setHeroPieces(session, 99, '4', null); } catch { threw = true; }
  ok(threw, 'unknown hero');
  const big = '9223372036854775807';
  SaveEdit.setHeroPieces(session, 7, big);
  const out = SaveEdit.splitSave(SaveEdit.buildFiles(session)[0].bytes).json;
  eq(out.version, '4');
  eq(out.e_id, '4');
  const raw = out.o_list_sp17;
  ok(raw.includes('"PieceCount":400'), raw);
  ok(raw.includes(`"PieceCount":${big}`), raw);
  ok(!raw.includes(`"PieceCount":"${big}"`), 'big token stays a JSON number');
  const heroes = JSON.parse(raw.replace(big, '1'));
  eq(heroes['1'].Level, 91);
  eq(heroes['1'].Grade, 3);
  eq(heroes['1'].IsPurchased, true);
  eq(heroes['1'].UnlockedOptions['9'], true);
  eq(heroes['1'].PieceCount, 400);
  eq(heroes['23'].CostumeID, 23);
  eq(heroes['23'].Level, 1);
  eq(heroes['23'].Grade, 1);
  eq(heroes['23'].Rarity, 7);
  eq(heroes['23'].IsPurchased, false);
  eq(heroes['23'].PieceCount, 15);
  const locked = SaveEdit.loadEntries([{ name: 'save_costume_1.0', bytes: SaveEdit.encodeSave({ version: '1', e_id: '1', o_list_sp17: '{"1":{"CostumeID":1,"PieceCount":9007199254740993}}' }) }]);
  ok(locked.groups.save_costume.heroesLocked);
  const before = locked.files[0].bytes;
  let refused = false;
  try { SaveEdit.setHeroPieces(locked, 1, '2'); } catch { refused = true; }
  ok(refused, 'locked tokens');
  eq([...SaveEdit.buildFiles(locked)[0].bytes], [...before]);
});

test('save editor edits trait slot option and synergy, keeps the lock flag', () => {
  const sil = '[{"i":0,"o":507,"s":4,"l":true},{"i":1,"o":501,"s":2,"l":false}]';
  const mk = (v) => ({ version: v, sil, sip: '{}', mrc: '306', cuns: '[]' });
  const session = SaveEdit.loadEntries([
    { name: 'save_trait_roll_1.0', bytes: SaveEdit.encodeSave(mk('1')) },
    { name: 'save_trait_roll_1.1', bytes: SaveEdit.encodeSave(mk('2')) },
  ]);
  const allowed = { options: Game.db.TraitOptionData.map(o => o.id), synergies: Game.db.TraitSynergyTypeData.map(t => t.id) };
  eq(SaveEdit.readTraits(session).length, 2);
  SaveEdit.setTraitSlot(session, 1, { optionId: 801, synergyType: 5 }, allowed);
  const rejects = (fn, re) => { let m = ''; try { fn(); } catch (err) { m = err.message; } ok(re.test(m), m || 'did not throw'); };
  rejects(() => SaveEdit.setTraitSlot(session, 1, { optionId: 999, synergyType: 5 }, allowed), /Unknown trait option/);
  rejects(() => SaveEdit.setTraitSlot(session, 1, { optionId: 801, synergyType: 9 }, allowed), /Unknown synergy/);
  rejects(() => SaveEdit.setTraitSlot(session, 7, { optionId: 801, synergyType: 1 }, allowed), /not in this save/);
  ok(Game.index.traitOptionById.get(801), 'option 801 exists');
  const files = SaveEdit.buildFiles(session).filter(f => f.logical.startsWith('save_trait_roll'));
  eq(files.length, 2);
  for (const f of files) {
    const j = SaveEdit.splitSave(f.bytes).json;
    eq(j.version, '3');
    eq(j.sil, '[{"i":0,"o":507,"s":4,"l":true},{"i":1,"o":801,"s":5,"l":false}]');
    eq(j.mrc, '306');
  }
  const bad = SaveEdit.loadEntries([{ name: 'save_trait_roll_1.0', bytes: SaveEdit.encodeSave({ version: '1', sil: '[{"i":0,"o":"x"}]' }) }]);
  ok(bad.groups.save_trait_roll.traitsLocked);
  eq(SaveEdit.readTraits(bad), null);
});

test('save editor edits hero level, stars, rarity, and unlocked within caps', () => {
  const costume = {
    version: '2', e_id: '1',
    o_list_sp17: JSON.stringify({
      '1': { CostumeID: 1, Level: 91, Grade: 3, Rarity: 2, IsPurchased: true, IsMaxRarity: false, UnlockedOptions: { 9: true }, PieceCount: 120 },
    }),
  };
  const session = SaveEdit.loadEntries([{ name: 'save_costume_1.0', bytes: SaveEdit.encodeSave(costume) }]);
  const rejects = (fn, re) => { let m = ''; try { fn(); } catch (err) { m = err.message; } ok(re.test(m), m || 'did not throw'); };
  SaveEdit.setHeroField(session, 1, 'Level', 130, { max: 130 });
  SaveEdit.setHeroField(session, 1, 'Grade', 6, { max: 6 });
  SaveEdit.setHeroField(session, 1, 'Rarity', 8, { allowed: [1, 2, 8] });
  SaveEdit.setHeroField(session, 1, 'IsPurchased', false);
  rejects(() => SaveEdit.setHeroField(session, 1, 'Level', 131, { max: 130 }), /1 to 130/);
  rejects(() => SaveEdit.setHeroField(session, 1, 'Level', 0, { max: 130 }), /1 to 130/);
  rejects(() => SaveEdit.setHeroField(session, 1, 'Grade', 7, { max: 6 }), /1 to 6/);
  rejects(() => SaveEdit.setHeroField(session, 1, 'Rarity', 5, { allowed: [1, 2, 8] }), /tiers/);
  rejects(() => SaveEdit.setHeroField(session, 1, 'IsMaxRarity', true), /Unknown hero field/);
  rejects(() => SaveEdit.setHeroField(session, 1, 'Level', 5, null), /max level/);
  SaveEdit.setHeroField(session, 21, 'IsPurchased', true, null, { rarity: 8 });
  ok(session.groups.save_costume._editedHeroes.has(1) && session.groups.save_costume._editedHeroes.has(21));
  const heroes = JSON.parse(SaveEdit.splitSave(SaveEdit.buildFiles(session)[0].bytes).json.o_list_sp17);
  eq(heroes['1'].Level, 130);
  eq(heroes['1'].Grade, 6);
  eq(heroes['1'].Rarity, 8);
  eq(heroes['1'].IsPurchased, false);
  eq(heroes['1'].IsMaxRarity, false);
  eq(heroes['1'].UnlockedOptions['9'], true);
  eq(heroes['1'].PieceCount, 120);
  eq(heroes['21'].Rarity, 8);
  eq(heroes['21'].Level, 1);
  eq(heroes['21'].IsPurchased, true);
  eq(heroes['21'].PieceCount, 0);
  const me = Game.index.costumeById.get(1);
  eq(me.Max_Lv, 130);
  eq(me.Max_Grade, 6);
  eq(Formulas.heroEvolutionRows(me).map(r => r.Rarity).join(','), '2,3,4,5,6,7,8');
});

test('save editor leaves an oversized stack untouched', () => {
  const json = { version: '1', gold: '3', gem: '0', crystal: '0', stack: '{"7":9007199254740993}' };
  const session = SaveEdit.loadEntries([{ name: 'save_currency_1.0', bytes: SaveEdit.encodeSave(json) }]);
  ok(session.groups.save_currency.stackLocked);
  SaveEdit.setWallet(session, 'gold', '9');
  const out = SaveEdit.splitSave(SaveEdit.buildFiles(session)[0].bytes).json;
  eq(out.gold, '9');
  eq(out.stack, json.stack);
});

test('weapon catalog has a rarity and grade for the save editor cap', () => {
  const missing = Game.db.WeaponData.filter(w => w.Rarity == null || w.Grade == null);
  eq(missing.map(w => w.id), []);
  for (const type of [0, 1, 3]) ok(Game.index.itemByType.get(type)?.Name_en, `wallet type ${type}`);
  eq(Game.index.itemByType.get(5)?.Name_en, 'Elixir');
  eq(Game.index.itemByType.get(6002)?.Name_en, 'S-Ticket');
  eq(Game.index.itemByType.get(8401)?.Name_en, 'Evolution Potion');
  const crude = Game.index.weaponById.get(1001);
  const crudeRow = Game.db.BalancingData_Rarity.find(r => r.Rarity === crude.Rarity && r.Grade === crude.Grade);
  eq(crudeRow.MaxLevel, 10);
});

test('ability gold costs match the live game (interpolated between checkpoints)', () => {
  for (const [type, lv, want] of [[1, 737, 835e3], [2, 720, 1.28e6], [4, 760, 902e3], [10, 517, 3.77e6]]) {
    const t = {}; UpgradeCost.ability(type, lv, lv + 1, t);
    ok(Math.abs(t[0] - want) / want < 0.01, `type ${type} @${lv}: ${t[0]} vs ${want}`);
    eq(Object.keys(t), ['0']);
  }
});

test('time to kill = enemy HP / DPS; DPS-scaled enemies flagged', () => {
  const e = Game.db.EnemyData.find(x => x.key === 'CH12_Lich_Boss');
  eq(Math.round(Farming.ttk(e, 1e6).seconds), Math.round(e.MaxHp / 1e6));
  const crow = Game.db.EnemyData.find(x => x.MaxHp_DPSMult > 0);
  eq(Farming.ttk(crow, 1e6).scales, true);
});

(async () => {
  await Game.load();
  State.init();
  for (const [name, fn] of tests) {
    try { fn(); pass++; console.log('  ✓', name); }
    catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
