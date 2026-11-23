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

const SRC = ['ui-common.js', 'data.js', 'formulas.js', 'state.js', 'screenshot-import.js', 'save-import.js', 'farming.js']
  .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n');
// Top-level const/let aren't context properties; re-export the ones tests need.
vm.runInContext(SRC + '\n;globalThis.__T = { Game, Formulas, State, ScreenshotImport, formatLocaleArgs, SaveImport, Farming, UpgradeCost, migrate: typeof migrate === "function" ? migrate : null };', ctx);
const { Game, Formulas, State, ScreenshotImport, formatLocaleArgs, SaveImport, Farming, UpgradeCost } = ctx.__T;

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
