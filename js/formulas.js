// ---------------------------------------------------------------------------
// formulas.js — turns raw game-balance rows into displayed stats.
//
// HONESTY NOTE: a follow-up pass decompiled real method bodies out of
// libil2cpp.so (not just metadata signatures) to check these formulas
// against the actual compiled logic. Findings below are cited per-function;
// see game_logic_deep_dive.md for the full derivation. Where something is
// still unverified, that's called out explicitly rather than presented as
// confirmed.
// ---------------------------------------------------------------------------

const Formulas = {

  // --- Weapons ---------------------------------------------------------

  rarityRow(weapon) {
    return Game.index.rarityRowByKey.get(`${weapon.Rarity}:${weapon.Grade}`);
  },

  weaponMaxLevel(weapon) {
    const row = this.rarityRow(weapon);
    return row ? row.MaxLevel : 1;
  },

  // CONFIRMED BY DECOMPILATION (DpsStatCalculator.GetCalculatedValue,
  // RVA 0x27F3C50): the game's real "Dps" stat is a whole-BUILD aggregate,
  // not a per-weapon number. It sums 17 different EStatContentType sources
  // (PlayerLevel, Ability, Weapon, WeaponOption, WeaponLevelBonus, hero
  // grade/level/evolution/equip options, SpecialUpgrade, ExtraUpgrade,
  // VipSubscription, TraitRoll, SoulUpgrade) into:
  //
  //   rawBase = (PlayerLevel + Ability + Weapon)
  //           + (1000 + CostumeEquippingGradeOption + CostumeEquippingLevelOption)
  //             * CostumeEquippingLevelAttackOption / 1000
  //   mult1 = (1000 + WeaponOption + WeaponLevelBonus + SpecialUpgrade
  //           + ExtraUpgrade + VipSubscription) / 1000
  //   mult2 = (1000 + CostumeOwnGradeOption + CostumeOwnLevelOption
  //           + CostumeOwnEvolutionOption + CostumeEquipMainWeaponBonusOption) / 1000
  //   mult3 = (1000 + TraitRoll + SoulUpgrade) / 1000
  //   Dps = round(rawBase * mult1 * mult2 * mult3)
  //
  // (source values are per-mille: 1000 = +100%). What this function computes
  // — base + perLevel*(level-1) from BalancingData_Rarity — is a reasonable
  // proxy for just the Weapon + WeaponLevelBonus slice of that formula, i.e.
  // this weapon's own raw contribution *before* it gets scaled by the
  // player's level/ability/hero/VIP/trait/soul investment. Modeling the full
  // aggregate would mean wiring every other tab's state into one combined
  // pipeline — not attempted, so treat this as "this weapon's slice," not
  // "your real in-game DPS number." WeaponDPSMult is shown separately as a
  // rarity multiplier badge; it isn't part of the confirmed Dps formula
  // above, so its exact role elsewhere in the client is still unconfirmed.
  weaponDPS(weapon, level) {
    const row = this.rarityRow(weapon);
    if (!row) return { base: 0, perLevel: 0, total: 0, mult: 1 };
    const base = num(row.WeaponDPSAdd);
    const perLevel = num(row.WeaponDPS_LevelUpAdd);
    const total = base + perLevel * Math.max(0, level - 1);
    return { base, perLevel, total, mult: row.WeaponDPSMult, bonusOptionCount: row.BonusOptionCount };
  },

  scrollCostForLevel(level) {
    const row = Game.index.scrollCostByLevel.get(level);
    return row ? row.RequireAmount : null;
  },

  // Bonus affix roll: a weapon gets `BonusOptionCount` affixes from the
  // WeaponBonusOptionData pool (Attack / LifeSteal / SkillCooldown / HP /
  // HPRegen / Dodge / MoveSpeed), each landing somewhere between the
  // option's MinValue-MaxValue multiplier range. The builder lets the user
  // pick which affixes rolled and where in the range they landed, to mirror
  // whatever their actual in-game weapon shows.
  bonusOptionPool() { return Game.db.WeaponBonusOptionData; },

  // --- Heroes ------------------------------------------------------------

  // Base Attack/HP curve is sampled at levels [1,10,20,...,130] per rarity
  // tier (CostumeLevelData, keyed by the costume's shared lv_gid). Levels
  // between checkpoints are linearly interpolated — flagged in the UI as
  // interpolated since only checkpoint rows exist in the source data.
  heroBaseStats(costume, level) {
    const rows = (Game.index.costumeLevelByGroup.get(costume.lv_gid) || [])
      .slice().sort((a, b) => a.Level - b.Level);
    if (rows.length === 0) return { attack: 0, hp: 0, interpolated: false };
    if (level <= rows[0].Level) return { attack: num(rows[0].Attack), hp: num(rows[0].HP), interpolated: false };
    if (level >= rows[rows.length - 1].Level) {
      const r = rows[rows.length - 1];
      return { attack: num(r.Attack), hp: num(r.HP), interpolated: false };
    }
    let lo = rows[0], hi = rows[rows.length - 1];
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].Level <= level && level <= rows[i + 1].Level) { lo = rows[i]; hi = rows[i + 1]; break; }
    }
    if (lo.Level === hi.Level) return { attack: num(lo.Attack), hp: num(lo.HP), interpolated: false };
    const t = (level - lo.Level) / (hi.Level - lo.Level);
    return {
      attack: Math.round(num(lo.Attack) + t * (num(hi.Attack) - num(lo.Attack))),
      hp: Math.round(num(lo.HP) + t * (num(hi.HP) - num(lo.HP))),
      interpolated: true,
    };
  },

  // Cumulative per-level bonus options unlocked at/under the current level.
  heroLevelBonuses(costume, level) {
    const rows = Game.index.costumeLevelOptByGroup.get(costume.Lv_Opt_GID) || [];
    return rows.filter(r => r.Level <= level).map(r => ({
      level: r.Level, optionType: r.OptionType, optionValue: r.OptionValue,
      name: r.OptionName,
    }));
  },

  // Cumulative star-grade bonuses unlocked at/under the current star grade.
  // OptionStyle 3 rows are skill-unlock flavor text with no numeric bonus.
  heroStarBonuses(costume, starGrade) {
    const rows = Game.index.costumeStarOptByGroup.get(costume.Star_Opt_GID) || [];
    return rows.filter(r => r.Star_Grade <= starGrade).map(r => ({
      star: r.Star_Grade,
      label: r.StarBonus_OptionName,
      optionType: toArray(r.OptionType),
      optionValue: toArray(r.OptionValue),
      isSkillUnlock: r.OptionStyle === 3,
    }));
  },

  heroStarGradeRows(costume) {
    return (Game.index.costumeStarOptByGroup.get(costume.Star_Opt_GID) || [])
      .slice().sort((a, b) => a.Star_Grade - b.Star_Grade);
  },

  // Cumulative evolution bonuses unlocked at/under the current evolution rarity.
  heroEvolutionBonuses(costume, evoRarity) {
    const rows = Game.index.costumeEvoByCostume.get(costume.id) || [];
    return rows.filter(r => r.Rarity <= evoRarity).map(r => ({
      rarity: r.Rarity, optionType: r.OptionType, optionValue: r.OptionValue,
      statReduction: r.StatReduction,
    }));
  },

  heroEvolutionRows(costume) {
    return (Game.index.costumeEvoByCostume.get(costume.id) || [])
      .slice().sort((a, b) => a.Rarity - b.Rarity);
  },

  // Aggregate a hero's fully-built stat sheet: base attack/hp + every
  // cumulative bonus rolled up per stat-option-type, using StatData's
  // display names.
  heroFullStats(costume, { level, starGrade, evoRarity }) {
    const base = this.heroBaseStats(costume, level);
    const bonusByType = new Map();
    const add = (type, value) => {
      if (type === null || type === undefined || value === null || value === undefined) return;
      bonusByType.set(type, (bonusByType.get(type) || 0) + num(value));
    };
    for (const b of this.heroLevelBonuses(costume, level)) add(b.optionType, b.optionValue);
    for (const b of this.heroStarBonuses(costume, starGrade)) {
      b.optionType.forEach((t, i) => add(t, b.optionValue[i]));
    }
    for (const b of this.heroEvolutionBonuses(costume, evoRarity)) add(b.optionType, b.optionValue);
    const bonuses = [...bonusByType.entries()].map(([type, value]) => ({
      type, value, stat: Game.index.statById.get(type),
    }));
    return { base, bonuses };
  },

  // --- Ability / Extra / Special / Soul upgrade trees ---------------------
  // All four share a shape: a "type" catalog + a per-type level curve.
  // `level` is a plain integer counter the user dials up; we look up the
  // closest defined row at-or-below it (these tables are checkpoint curves,
  // not necessarily one row per integer level, particularly Ability which
  // runs to level 2000 on some types).

  _closestRow(rows, levelField, level) {
    if (!rows || rows.length === 0) return null;
    let best = rows[0];
    for (const r of rows) { if (r[levelField] <= level) best = r; else break; }
    return best;
  },

  abilityRow(abilityType, level) {
    return this._closestRow(Game.index.abilityLevelsByType.get(abilityType), 'CurLevel', level);
  },
  abilityMaxLevel(abilityType) {
    const rows = Game.index.abilityLevelsByType.get(abilityType) || [];
    return rows.length ? rows[rows.length - 1].CurLevel : 0;
  },

  extraRow(optionType, level) {
    return this._closestRow(Game.index.extraLevelsByOptionType.get(optionType), 'Level', level);
  },
  extraMaxLevel(optionType) {
    const rows = Game.index.extraLevelsByOptionType.get(optionType) || [];
    return rows.length ? rows[rows.length - 1].Level : 0;
  },

  specialRow(optionType, level) {
    // `level` here is the cumulative counter (matches UpgradeLevel, not the
    // per-tier-resetting raw Level field — see the index-building note in
    // data.js).
    return this._closestRow(Game.index.specialLevelsByOptionType.get(optionType), 'UpgradeLevel', level);
  },
  // CORRECTED per direct user report against the live game (Equipment >
  // Special tab): every stat's level cap at Altar Grade N is a flat N*10,
  // uniform across all stat types. `SpecialUpgradeTypeData.MaxLevelDatas`
  // looked like a plausible per-type cumulative-cap table (its 4 entries
  // summed correctly against the raw level-cost data: 5, 15, 30, 50) and was
  // used for this originally, but it does not match what's actually shown
  // in-game at grade 2 (20, not 15) — so it's evidently the wrong table for
  // this, despite being internally consistent on its own. Left unused
  // rather than removed in case it's the right source for something else.
  specialMaxLevelForGrade(optionType, grade) {
    return grade * 10;
  },

  soulRow(optionType, level) {
    return this._closestRow(Game.index.soulLevelsByOptionType.get(optionType), 'Level', level);
  },
  soulMaxLevel(optionType) {
    const rows = Game.index.soulLevelsByOptionType.get(optionType) || [];
    return rows.length ? rows[rows.length - 1].Level : 0;
  },

  // --- Traits --------------------------------------------------------------
  // 2 trait groups x 5 synergy slots (Fist/Vampire/Claw/Heart/Hourglass).
  // Each slot holds a rolled TraitOptionData pick. When N slots share the
  // same option_type, TraitSynergyInfoData(option_type, N) gives the extra
  // synergy-set bonus achieved at that stack count.
  //
  // CONFIRMED BY DECOMPILATION (TraitSynergyController.CalculateSynergyTokens,
  // RVA 0x2432EEC + GetSynergyEffect, RVA 0x2439108): the client does exactly
  // this — walks every filled slot, tallies a Dictionary<optionType, count>,
  // then for each option_type does a linear scan over its synergy thresholds
  // picking the highest one at-or-under the tallied count. This was an
  // unverified reconstruction before; it's now a confirmed match, not a guess.
  traitSynergyBonus(optionType, count) {
    if (count < 1) return null;
    // walk down to the highest achieved threshold at/under `count`
    const candidates = (Game.index.traitSynergyInfoByType.get(optionType) || [])
      .slice().sort((a, b) => a.synergy_value - b.synergy_value);
    let best = null;
    for (const c of candidates) if (c.synergy_value <= count) best = c; else break;
    return best;
  },

  computeTraitSynergies(filledSlots) {
    // filledSlots: array of TraitOptionData rows (nulls skipped)
    const countByType = new Map();
    for (const opt of filledSlots) {
      if (!opt) continue;
      countByType.set(opt.option_type, (countByType.get(opt.option_type) || 0) + 1);
    }
    const results = [];
    for (const [type, count] of countByType.entries()) {
      const bonus = this.traitSynergyBonus(type, count);
      if (bonus) results.push({ optionType: type, count, bonus });
    }
    return results;
  },

  // --- Total DPS estimate ---------------------------------------------------
  // Wires the CONFIRMED whole-build Dps formula (see formulas.js header note
  // + docs/game_logic_deep_dive.md §1) up to every source of real data this
  // app already tracks. This is necessarily a best-effort reconstruction in
  // places — the decompile confirmed the FORMULA SHAPE (three per-mille
  // multiplier brackets over a flat base) with certainty, but not every
  // exact table→EStatContentType wire. Every source below is tagged:
  //   'mapped'  — a specific extracted table plausibly/directly feeds this
  //               source, reasoned from field semantics (documented inline).
  //   'manual'  — no matching data table was found; the user types in a
  //               value from their own game screen if they know it.
  //   'unmodeled' — deliberately left at 0 rather than guessed.
  //
  // Known unit assumption: Extra/Special/Soul upgrade RateAmount and Trait
  // rate_amount fields are stored as plain percent in their tables (e.g. 6 =
  // 6%) but the confirmed Dps formula's source dictionary is per-mille
  // (1000 = 100%) — so each is multiplied by 10 here. This conversion itself
  // was not independently confirmed by decompilation; flagged as 'mapped',
  // not 'confirmed'.
  totalDpsBreakdown(heroId) {
    const hero = State.getHero(heroId);
    const src = {}; // EStatContentType key -> { value, tag, note }
    const set = (key, value, tag, note) => { src[key] = { value: Math.round(value), tag, note }; };

    // PlayerLevel — PlayerLevelData.Attack, interpolated at checkpoints like hero stats.
    {
      const rows = Game.index.playerLevelRows;
      const level = State.data.player.level;
      let val = 0;
      if (rows.length) {
        if (level <= rows[0].id) val = rows[0].Attack;
        else if (level >= rows[rows.length - 1].id) val = rows[rows.length - 1].Attack;
        else {
          let lo = rows[0], hi = rows[rows.length - 1];
          for (let i = 0; i < rows.length - 1; i++) if (rows[i].id <= level && level <= rows[i + 1].id) { lo = rows[i]; hi = rows[i + 1]; break; }
          const t = lo.id === hi.id ? 0 : (level - lo.id) / (hi.id - lo.id);
          val = lo.Attack + t * (hi.Attack - lo.Attack);
        }
      }
      set('PlayerLevel', val, 'mapped', `PlayerLevelData.Attack @ player level ${level} (interpolated)`);
    }

    // Ability — AbilityListElementInfo id 1 = "POWER", flat EffectAmount.
    {
      const level = State.data.upgrades.ability[1] || 0;
      const row = this.abilityRow(1, level);
      set('Ability', row ? num(row.EffectAmount) : 0, 'mapped', `Ability tree "POWER" @ level ${level}`);
    }

    // Weapon / WeaponLevelBonus / WeaponOption — summed across all 6 equipped slots.
    {
      let weaponBase = 0, weaponLevelBonus = 0, weaponOption = 0;
      for (const slot of State.data.weapons) {
        if (!slot) continue;
        const w = Game.index.weaponById.get(slot.weaponId);
        if (!w) continue;
        const dps = this.weaponDPS(w, slot.level);
        weaponBase += dps.base;
        weaponLevelBonus += dps.perLevel * Math.max(0, slot.level - 1);
        for (const roll of (slot.bonusRolls || [])) {
          const opt = Game.index.weaponBonusOptionById.get(roll.optionId);
          if (!opt || opt.PropertyName !== 'WEAPON_BONUS_OP_ATTACK') continue;
          const mult = opt.MinValue + (roll.pct / 100) * (opt.MaxValue - opt.MinValue);
          weaponOption += (mult - 1) * 1000;
        }
      }
      set('Weapon', weaponBase, 'mapped', 'Sum of each equipped weapon’s base DPS (BalancingData_Rarity.WeaponDPSAdd)');
      set('WeaponLevelBonus', weaponLevelBonus, 'mapped', 'Sum of each equipped weapon’s per-level DPS gain');
      set('WeaponOption', weaponOption, 'mapped', 'Sum of equipped weapons’ rolled "Attack" bonus affixes, converted to per-mille');
    }

    // Hero-related sources (all keyed off the hero passed in, treated as "the equipped hero").
    let heroAttack = 0, heroGradePermille = 0, heroLevelPermille = 0, heroEvoPermille = 0;
    if (hero) {
      const costume = Game.index.costumeById.get(hero.costumeId);
      heroAttack = this.heroBaseStats(costume, hero.level).attack;
      const starBonus = this.heroStarBonuses(costume, hero.starGrade)
        .flatMap(b => b.optionType.map((t, i) => ({ t, v: b.optionValue[i] })))
        .filter(x => x.t === 1).reduce((s, x) => s + num(x.v), 0);
      const levelBonus = this.heroLevelBonuses(costume, hero.level)
        .filter(b => b.optionType === 1).reduce((s, b) => s + num(b.optionValue), 0);
      const evoBonus = this.heroEvolutionBonuses(costume, hero.evoRarity)
        .filter(b => b.optionType === 1).reduce((s, b) => s + num(b.optionValue), 0);
      heroGradePermille = starBonus;
      heroLevelPermille = levelBonus;
      heroEvoPermille = evoBonus;
    }
    set('CostumeEquippingLevelAttackOption', heroAttack, 'mapped', hero ? 'Active hero’s own base Attack (CostumeLevelData)' : 'No active hero selected');
    set('CostumeEquippingGradeOption', heroGradePermille, 'mapped', 'Active hero’s Star Grade "Power" bonus rows (CostumeStarGradeOptionData, option_type 1)');
    set('CostumeEquippingLevelOption', heroLevelPermille, 'mapped', 'Active hero’s per-level "Power" bonus rows (CostumeLevelOptionData, option_type 1)');
    set('CostumeOwnEvolutionOption', heroEvoPermille, 'mapped', 'Active hero’s Evolution "Power" bonus rows (CostumeEvolutionData, option_type 1)');
    // CostumeOwnGradeOption / CostumeOwnLevelOption deliberately left unmodeled: the
    // decompile confirms these are DISTINCT from the Equipping-prefixed sources above,
    // but there's no second data table found that's clearly "owning vs equipping" split
    // — reusing the same numbers here would double-count, so these stay at 0 rather
    // than guess.
    set('CostumeOwnGradeOption', 0, 'unmodeled', 'No distinct data source found separate from CostumeEquippingGradeOption above');
    set('CostumeOwnLevelOption', 0, 'unmodeled', 'No distinct data source found separate from CostumeEquippingLevelOption above');

    // CostumeEquipMainWeaponBonusOption — Weapon 1's category affinity bonus, if it grants Power (type 1).
    {
      const slot0 = State.data.weapons[0];
      let val = 0, note = 'No weapon in Weapon 1 slot';
      if (slot0) {
        const w = Game.index.weaponById.get(slot0.weaponId);
        const cat = w && Game.index.weaponCategoryById.get(w.Category);
        if (cat) {
          // Class_OptionType/Value come through as a plain string (not an
          // array) for categories with only one bonus stat (e.g. Sword),
          // unlike the multi-value categories — normalize both shape and
          // type here or the lookup below silently no-ops for those.
          const types = toArray(cat.Class_OptionType).map(Number), values = toArray(cat.Class_OptionValue);
          const i = types.indexOf(1);
          val = i >= 0 ? num(values[i]) : 0;
          note = `Weapon 1’s category (${cat.Name_en}) class-affinity bonus`;
        }
      }
      set('CostumeEquipMainWeaponBonusOption', val, 'mapped', note);
    }

    // SpecialUpgrade / ExtraUpgrade / SoulUpgrade — each system's "Power"-type track (option_type 1), percent->per-mille.
    {
      const specialRec = State.data.upgrades.special[1];
      const specialRow = specialRec ? this.specialRow(1, specialRec.level) : null;
      set('SpecialUpgrade', specialRow ? num(specialRow.RateAmount) * 10 : 0, 'mapped', 'Special Upgrade "MASSIVE MUSCLE" (option_type 1)');

      const extraLevel = State.data.upgrades.extra[1] || 0;
      const extraRow = this.extraRow(1, extraLevel);
      set('ExtraUpgrade', extraRow ? num(extraRow.RateAmount) * 10 : 0, 'mapped', 'Extra Upgrade "Bulk Up" (option_type 1)');

      const soulLevel = State.data.upgrades.soul[1] || 0;
      const soulRow = this.soulRow(1, soulLevel);
      set('SoulUpgrade', soulRow ? num(soulRow.RateAmount) * 10 : 0, 'mapped', 'Soul Upgrade "Battle Boost" (option_type 1)');
    }

    // TraitRoll — achieved synergy bonus for option_type 1 ("Total Attack Power"), percent->per-mille.
    {
      const filled = State.data.traits.slots.map(id => id ? Game.index.traitOptionById.get(id) : null);
      const synergies = this.computeTraitSynergies(filled);
      const hit = synergies.find(s => s.optionType === 1);
      set('TraitRoll', hit ? num(hit.bonus.rate_amount) * 10 : 0, 'mapped', 'Trait synergy bonus for "Total Attack Power"');
    }

    // VipSubscription — no VIP-tier data table found; manual per-mille input.
    set('VipSubscription', State.data.player.vipPerMille, 'manual', 'No VIP-tier bonus table found in extracted data — enter your in-game VIP bonus % × 10');

    // BlessingBuff — a real table exists (BlessingBuffData) but which of its 3 buff_types
    // feeds the Dps stat specifically wasn't identified; left unmodeled rather than guessed.
    set('BlessingBuff', 0, 'unmodeled', 'BlessingBuffData exists (3 buff types) but which one feeds Dps wasn’t confirmed');

    const flatBase = src.PlayerLevel.value + src.Ability.value + src.Weapon.value;
    const heroTerm = src.CostumeEquippingLevelAttackOption.value
      * (1000 + src.CostumeEquippingGradeOption.value + src.CostumeEquippingLevelOption.value) / 1000;
    const rawBase = flatBase + heroTerm;

    const mult1 = (1000 + src.WeaponOption.value + src.WeaponLevelBonus.value + src.SpecialUpgrade.value + src.ExtraUpgrade.value + src.VipSubscription.value) / 1000;
    const mult2 = (1000 + src.CostumeOwnGradeOption.value + src.CostumeOwnLevelOption.value + src.CostumeOwnEvolutionOption.value + src.CostumeEquipMainWeaponBonusOption.value) / 1000;
    const mult3 = (1000 + src.TraitRoll.value + src.SoulUpgrade.value) / 1000;

    const dps = Math.round(rawBase * mult1 * mult2 * mult3);

    return { sources: src, flatBase, heroTerm, rawBase, mult1, mult2, mult3, dps, hero };
  },
};
