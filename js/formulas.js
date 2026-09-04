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

  // CONFIRMED BY DECOMPILATION (RegistWeaponLevelBonus, RVA 0x2796544, and
  // the WeaponData.LevelUpBonusGroup field at 0x6C): every weapon carries a
  // fixed LevelUpBonusGroup shared by its whole fusion chain (e.g. Crude
  // Dagger through Absolute Radiance all share GroupID 1, one row per chain
  // link). WeaponLevelUpBonusGroup has one row per rarity tier (typically
  // 1-8) in that group, each a FIXED, non-random bonus stat.
  //
  // CORRECTED 2026-09-04 per direct user report against the live game
  // (their un-fused "Relic Beam" unlocking Lv10 Attack+1% / Lv20
  // LifeSteal+2% / Lv30 HP+2%): the unlock gate is NOT the weapon's fused
  // Rarity as first implemented — it's the weapon's own current LEVEL
  // crossing each row's rarity-tier LEVEL THRESHOLD. Re-disassembly
  // confirms this precisely: the comparison calls
  // `BalancingData_Rarity.Get(row.Rarity, grade=1).MaxLevel` (RVA
  // 0x292538C — row.Rarity is just used as an index into the grade-1
  // level-curve table, always grade 1 regardless of the weapon's own
  // grade) and compares it against `WeaponStatus.Level` (the `_originLevel`
  // backing field at struct offset 0x18, not the weapon's Rarity at
  // offset-adjacent fields as originally assumed). So row.Rarity=1 asks
  // "is this weapon level >= 10" (rarity 1's MaxLevel), row.Rarity=2 asks
  // ">= 20", row.Rarity=3 asks ">= 30", etc. — matching the user's report
  // exactly. In practice a low-rarity weapon instance can never reach the
  // higher thresholds (BalancingData_Rarity caps MaxLevel per rarity), so
  // fusing to a higher rarity is still what makes the higher rows reachable
  // — but the runtime check itself is purely level-based, unlocks are
  // cumulative (every threshold at/under the current level stays unlocked),
  // and this now correctly matches un-fused weapons too. Some rows are
  // further gated by SlotType: 0 = any slot, 1 = main-hand slot only (index
  // 0, the real screen's "MAIN" slot), 2 = the five secondary slots only —
  // confirmed by the same function branching on slotIndex==0. This is a
  // COMPLETELY SEPARATE system from the random-roll "Bonus Affixes" above
  // (WeaponBonusOptionData / BonusOptionCount, registered by the sibling
  // function RegistWeaponBonusOption) — the two must not be conflated; a
  // weapon shows both a handful of random rolled affixes AND this fixed
  // unlock list at the same time.
  weaponLevelBonusRows(weapon, slotIndex = 0, level = 1) {
    const rows = Game.index.weaponLevelBonusByGroup.get(weapon.LevelUpBonusGroup) || [];
    return rows.map(row => {
      const thresholdRow = Game.index.rarityRowByKey.get(`${row.Rarity}:1`);
      const requiredLevel = thresholdRow ? thresholdRow.MaxLevel : Infinity;
      return {
        row,
        requiredLevel,
        unlocked: level >= requiredLevel,
        slotOk: row.SlotType === 0 || (row.SlotType === 1 && slotIndex === 0) || (row.SlotType === 2 && slotIndex !== 0),
      };
    });
  },

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

  // CORRECTED BY DECOMPILATION (2026-09-04, AddOwnEvolveStatModifications,
  // RVA 0x25E9964): this was originally modeled as cumulative (summing
  // every evolution tier's row up to the current one), like Level and Star
  // bonuses. It isn't. The real client calls
  // `CostumeEvolutionData.GetByCostumeAndRarity(costumeId, currentRarity)`
  // — a SINGLE-ROW lookup at the exact current tier, not a list walk — and
  // the row's own OptionValue already represents the full bonus at that
  // tier (each costume's rows even count up 1,2,3...7 in lockstep with
  // their own array position, confirming they're checkpoint magnitudes, not
  // incremental deltas meant to be added together). The disassembly also
  // shows the stored value gets ×10 before use (OptionValue parsed as a
  // long, then `x*5` then `<<1` = ×10) — e.g. tier-7's OptionValue "7"
  // contributes 70 (7.0%), not 7. Both the old cumulative-sum and the old
  // missing ×10 were live bugs feeding both this hero's displayed "Stat
  // Bonuses Unlocked" list and the Total DPS estimate's
  // CostumeOwnEvolutionOption source.
  heroEvolutionBonuses(costume, evoRarity) {
    if (!evoRarity) return [];
    const rows = Game.index.costumeEvoByCostume.get(costume.id) || [];
    const row = rows.find(r => r.Rarity === evoRarity);
    if (!row) return [];
    return [{
      rarity: row.Rarity, optionType: row.OptionType, optionValue: num(row.OptionValue) * 10,
      statReduction: row.StatReduction,
    }];
  },

  heroEvolutionRows(costume) {
    return (Game.index.costumeEvoByCostume.get(costume.id) || [])
      .slice().sort((a, b) => a.Rarity - b.Rarity);
  },

  // Aggregate a hero's fully-built stat sheet: base attack/hp + every
  // cumulative bonus rolled up per stat-option-type.
  //
  // CORRECTED BY DECOMPILATION (2026-09-04): this used to label each bonus
  // via `Game.index.statById` (the StatData table). CostumeLevelOptionData,
  // CostumeStarGradeOptionData, and CostumeEvolutionData's OptionType
  // fields are all declared `E_BonusOption` in the compiled game, a
  // DIFFERENT, differently-numbered enum from StatData's id space — they
  // only happen to agree at 1 (Attack/Power). Confirmed wrong in practice:
  // the same mistake on WeaponCategoryData (also E_BonusOption-typed) was
  // producing a nonsensical "CARGO" stat recommendation for Gun-category
  // loadouts on the Guide tab (StatData id 12 = Cargo, but E_BonusOption 12
  // is really Skill Damage). Now uses BONUS_OPTION_NAMES (data.js), built
  // from the real `HERO_BONUS_OPTION_*` Locale strings for this exact enum.
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
      type, value, stat: { Title_en: Game.bonusOptionName(type) },
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
  // Special tab): every stat's level cap at Altar Grade N, ONCE UNLOCKED, is
  // a flat N*10, uniform across all stat types. `SpecialUpgradeTypeData.
  // MaxLevelDatas`'s own 4 numbers looked like a plausible per-type
  // cumulative-cap table but don't match what's shown in-game at grade 2
  // (20, not 15) — wrong table for the cap *magnitude*.
  //
  // BUT (2026-09-04, by decompilation, following up on the weapon Level-Up
  // Bonus fix): MaxLevelDatas' zero-vs-nonzero PATTERN turns out to be real
  // and is a separate fact from the cap magnitude — it's exactly what
  // `SpecialUpgradeManager.GetUnlockGrade` (RVA 0x250D6F0) reads to decide
  // which Altar Grade a stat type first becomes available at: it calls
  // `SpecialUpgradeTypeData.GetGradeMaxLevel(grade)` for grade=1,2,3...
  // and returns the first grade whose entry is nonzero. E.g. FAST HEAL's
  // MaxLevelDatas is `[0,10,25,45]` — grade 1's entry is 0, so it isn't
  // unlocked until grade 2; DUAL TRIGGER's `[0,0,15,35]` doesn't unlock
  // until grade 3; TRIPLE EDGE's `[0,0,0,20]` not until grade 4. Only 5 of
  // the 11 types (the ones with a nonzero first entry) are available from
  // grade 1. This had never been modeled — every type was previously shown
  // upgradable at every grade — so `specialUnlockGrade` + the 0-below-
  // unlock-grade branch below are both new.
  specialUnlockGrade(optionType) {
    const type = Game.index.specialTypeByOptionType.get(optionType);
    const levels = type ? toArray(type.MaxLevelDatas) : [];
    for (let i = 0; i < levels.length; i++) if (num(levels[i]) > 0) return i + 1;
    return 1;
  },
  specialMaxLevelForGrade(optionType, grade) {
    if (grade < this.specialUnlockGrade(optionType)) return 0;
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
  //   'confirmed' — the exact table field AND its scale/unit conversion (or
  //               lack thereof) were verified by disassembling the real
  //               function that registers this source's StatModification.
  //   'mapped'  — a specific extracted table plausibly/directly feeds this
  //               source, reasoned from field semantics (documented inline),
  //               but not decompiled byte-for-byte.
  //   'manual'  — no matching data table was found; the user types in a
  //               value from their own game screen if they know it.
  //   'unmodeled' — deliberately left at 0 rather than guessed.
  //
  // CONFIRMED unit fix (2026-09-04, against the real game): Extra/Special/
  // Soul upgrade RateAmount is stored at 10x the displayed percent (e.g. 48
  // means 4.8%, confirmed against a live account's Bulk Up row) — i.e. it's
  // already directly in the Dps formula's per-mille scale (1000 = 100%), so
  // these sources use RateAmount as-is, no conversion.
  //
  // CONFIRMED unit fix (2026-09-04, by decompilation this time, not a live
  // report): `TraitRoll` used to ×10 `TraitSynergyInfoData.rate_amount` as
  // an unverified guess borrowed from the Extra/Special/Soul fix above.
  // Disassembling TraitSynergyController.GetStatModifications (RVA
  // 0x2433688) shows it reads `rate_amount` (struct offset 0x2C) straight
  // into the StatModification value for content type 0x13 (TraitRoll = 19)
  // with no multiply instruction anywhere in the path — unlike the
  // Extra/Special/Soul case, this one is NOT stored at 10x. The ×10 was
  // removed and this source is now tagged 'confirmed'.
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
      State.data.weapons.forEach((slot, i) => {
        if (!slot) return;
        const w = Game.index.weaponById.get(slot.weaponId);
        if (!w) return;
        const dps = this.weaponDPS(w, slot.level);
        weaponBase += dps.base;
        for (const { row, unlocked, slotOk } of this.weaponLevelBonusRows(w, i, slot.level)) {
          if (unlocked && slotOk) weaponLevelBonus += num(row.Amount) * 1000;
        }
        for (const roll of (slot.bonusRolls || [])) {
          const opt = Game.index.weaponBonusOptionById.get(roll.optionId);
          if (!opt || opt.PropertyName !== 'WEAPON_BONUS_OP_ATTACK') continue;
          const mult = opt.MinValue + (roll.pct / 100) * (opt.MaxValue - opt.MinValue);
          weaponOption += (mult - 1) * 1000;
        }
      });
      set('Weapon', weaponBase, 'mapped', 'Sum of each equipped weapon’s base DPS (BalancingData_Rarity.WeaponDPSAdd)');
      set('WeaponLevelBonus', weaponLevelBonus, 'confirmed', 'Sum of each equipped weapon’s unlocked Level-Up Bonuses (WeaponLevelUpBonusGroup, confirmed via RegistWeaponLevelBonus decompilation)');
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
      set('SpecialUpgrade', specialRow ? num(specialRow.RateAmount) : 0, 'mapped', 'Special Upgrade "MASSIVE MUSCLE" (option_type 1)');

      const extraLevel = State.data.upgrades.extra[1] || 0;
      const extraRow = this.extraRow(1, extraLevel);
      set('ExtraUpgrade', extraRow ? num(extraRow.RateAmount) : 0, 'mapped', 'Extra Upgrade "Bulk Up" (option_type 1)');

      const soulLevel = State.data.upgrades.soul[1] || 0;
      const soulRow = this.soulRow(1, soulLevel);
      set('SoulUpgrade', soulRow ? num(soulRow.RateAmount) : 0, 'mapped', 'Soul Upgrade "Battle Boost" (option_type 1)');
    }

    // TraitRoll — achieved synergy bonus for option_type 1 ("Total Attack Power"), percent->per-mille.
    {
      const filled = State.data.traits.slots.map(id => id ? Game.index.traitOptionById.get(id) : null);
      const synergies = this.computeTraitSynergies(filled);
      const hit = synergies.find(s => s.optionType === 1);
      set('TraitRoll', hit ? num(hit.bonus.rate_amount) : 0, 'confirmed', 'Trait synergy bonus for "Total Attack Power" (TraitSynergyController.GetStatModifications, confirmed no ×10)');
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
