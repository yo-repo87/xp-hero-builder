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

  // --- Costume "Own" vs "Equipping" stat sources (Total DPS formula) -------
  // CONFIRMED BY DECOMPILATION (2026-10-03): `GetStatModifications(costumeId)`
  // (RVA 0x284B154) builds a hero's full stat-modification list by calling
  // THREE separate functions and concatenating the results —
  // `CalculateOwnStatModifications()` (no costumeId param!),
  // `CalculateEquippingStatModifications(costumeId)`, and
  // `CalculateEquippingStaticStatModifications(costumeId)`. Tracing
  // `CalculateOwnStatModifications()` itself (RVA 0x284AD88) revealed the
  // real surprise: it loops EVERY costume in the player's owned roster
  // (not just the one costumeId passed in), and for each one that's
  // purchased, adds ITS OWN `OptionStyle==Always_Option(2)` grade/level/
  // evolution rows (`AddOwnGradeStatModifications`/`AddOwnLevelStatModifications`/
  // `AddOwnEvolveStatModifications`, each gated by that hero's own current
  // Star_Grade/Level/evolution tier) into one shared total. So
  // `CostumeOwnGradeOption`/`CostumeOwnLevelOption`/`CostumeOwnEvolutionOption`
  // are genuine ROSTER-WIDE "collection" sums — every hero you own and have
  // developed contributes a little, regardless of which one is active —
  // not a per-hero number. This app's `State.data.heroes` (every hero the
  // user has added) is the direct analog of "owned/purchased costumes."
  //
  // `CalculateEquippingStatModifications(costumeId)` (RVA 0x284C10C/
  // 0x284C5CC family), by contrast, genuinely IS scoped to one specific
  // hero — confirmed via its own `OptionStyle==EquipOnly_Option(1)` filter
  // plus an explicit `data.id == targetCostumeId` check. This is a
  // DIFFERENT, non-overlapping subset of the SAME CostumeStarGradeOptionData/
  // CostumeLevelOptionData rows (style 1 vs style 2) — real evidence that
  // Own/Equipping were never meant to double-count, confirmed by reading
  // both compiled functions side by side.
  //
  // heroStarBonuses()/heroLevelBonuses() (above) deliberately stay
  // UNFILTERED by OptionStyle — they feed the Heroes tab's "Stat Bonuses
  // Unlocked" list, which is honestly answering "what does leveling/
  // starring this hero get me" (every row, regardless of style), not
  // trying to isolate the Dps formula's own Own/Equipping split. The
  // functions below are the Dps-formula-specific, style-filtered versions.

  // Equipping: OptionStyle==1 only, gated by the hero's own grade/level.
  costumeEquippingGradeSum(costume, starGrade, wantType = 1) {
    let total = 0;
    for (const r of (Game.index.costumeStarOptByGroup.get(costume.Star_Opt_GID) || [])) {
      if (r.OptionStyle !== 1 || r.Star_Grade > starGrade) continue;
      toArray(r.OptionType).forEach((t, i) => { if (Number(t) === wantType) total += num(toArray(r.OptionValue)[i]); });
    }
    return total;
  },
  costumeEquippingLevelSum(costume, level, wantType = 1) {
    let total = 0;
    for (const r of (Game.index.costumeLevelOptByGroup.get(costume.Lv_Opt_GID) || [])) {
      if (r.optionStyle !== 1 || r.Level > level) continue;
      if (r.OptionType === wantType) total += num(r.OptionValue);
    }
    return total;
  },

  // Own: OptionStyle==2, summed across every hero in the roster (each at
  // its own grade/level/evolution — not the active hero's).
  costumeOwnGradeSum(wantType = 1) {
    let total = 0;
    for (const hero of State.data.heroes) {
      const costume = Game.index.costumeById.get(hero.costumeId);
      if (!costume) continue;
      for (const r of (Game.index.costumeStarOptByGroup.get(costume.Star_Opt_GID) || [])) {
        if (r.OptionStyle !== 2 || r.Star_Grade > hero.starGrade) continue;
        toArray(r.OptionType).forEach((t, i) => { if (Number(t) === wantType) total += num(toArray(r.OptionValue)[i]); });
      }
    }
    return total;
  },
  costumeOwnLevelSum(wantType = 1) {
    let total = 0;
    for (const hero of State.data.heroes) {
      const costume = Game.index.costumeById.get(hero.costumeId);
      if (!costume) continue;
      for (const r of (Game.index.costumeLevelOptByGroup.get(costume.Lv_Opt_GID) || [])) {
        if (r.optionStyle !== 2 || r.Level > hero.level) continue;
        if (r.OptionType === wantType) total += num(r.OptionValue);
      }
    }
    return total;
  },
  costumeOwnEvolutionSum(wantType = 1) {
    let total = 0;
    for (const hero of State.data.heroes) {
      const costume = Game.index.costumeById.get(hero.costumeId);
      if (!costume) continue;
      for (const b of this.heroEvolutionBonuses(costume, hero.evoRarity)) {
        if (b.optionType === wantType) total += num(b.optionValue);
      }
    }
    return total;
  },

  // --- Runes ---------------------------------------------------------------
  // Each equipped rune is one RuneData row (like a weapon fusion-chain
  // link — grade is baked into which row is equipped, not a separate
  // player stat) + a player-set level.
  //
  // CORRECTED 2026-10-24, per a direct user report ("I believe the runes do
  // effect the dps") that challenged this exact comment's prior claim.
  // CONFIRMED BY DECOMPILATION (fresh v27.0.0 dump — see
  // docs/game_logic_deep_dive.md §8 for the full writeup): `Rune` (=24) IS a
  // real EStatContentType, and IS one of the ~20 sources
  // `DpsStatCalculator.GetCalculatedValue` (RVA 0x22B1C5C) actually reads —
  // the prior "no decompiled evidence ties Runes into the Dps formula" claim
  // was wrong and is now corrected. Fed via a confirmed real chain:
  // `RuneManager : IStatModifier` -> `RuneStatProvider.GetStatModifications()`
  // -> `RuneStatContributionHelper.AddRuneContributions()` (MILLI_SCALE=1000,
  // confirming the same per-mille convention this app's own
  // runeUniqueOption()/runeLevelBonusRows() already use).
  //
  // BUT this is still deliberately NOT folded into totalDpsBreakdown() below,
  // for two confirmed, specific reasons rather than a blanket "unmodeled":
  // (1) hero-specific named runes (OptionType 0, e.g. Misty's "Growth
  // Potion") are confirmed to bypass this pipeline entirely — a real
  // `cmp w0,#1; b.lt <bail>` gate in AddUniqueStat skips them with zero
  // StatModification added; their effect instead reaches the player only via
  // the already-decoded RuneUniqueOptionSubSkillResolver.Grow() skill-value
  // boost (a different mechanism, not a Dps source at all). (2) For the 3
  // generic Melee/Ranged/Universal families, a further resolver call (RVA
  // 0x2eb0f5c, NOT decoded this session) converts each rune's raw OptionType
  // into a real EStat value before a bitmask filter — confirmed structurally
  // that EStat.Dps itself can pass that filter, but the exact OptionType ->
  // EStat mapping wasn't traced, so which of this app's already-extracted
  // generic-rune stat rows (HP / Skill Damage / the 6 weapon-type damage
  // rates) actually lands on EStat.Dps (vs. a Dps-irrelevant EStat) is
  // genuinely unresolved. Adding a guessed numeric contribution here would
  // be exactly the kind of unconfirmed mapping this project's norm forbids —
  // shown as its own stat panel, not a guessed Total DPS term.

  runeMaxLevel(rune) {
    const grade = Game.index.runeGradeById.get(rune.GradeID);
    return grade ? grade.MaxLevel : 1;
  },

  // A hero has 7 rune slots, not 1 — confirmed 2026-10-24 after a direct
  // user report that there was no way to equip a general (Melee/Ranged/
  // Universal) rune alongside a hero-specific one. Slot 0 is always the
  // hero's own named Hero Rune; slots 1-6 are free-choice general slots
  // (confirmed via MilestonePresetEquipEntryData's real slot_index usage,
  // 0-6, freely mixing Melee/Ranged/Universal runes across them — slot
  // *index* isn't tied to a fixed rune *type*). Unlock gate is the
  // account-wide Player Level (State.data.player.level, already modeled
  // for the Total DPS estimate) against the real
  // RUNE_SLOT_OPENCONDITION_PLAYERLEVEL Remote Config value,
  // "1,1,200,250,300,350,400" — read directly from the game's own
  // RemoteConfig defaults table, not guessed.
  RUNE_SLOT_UNLOCK_LEVELS: [1, 1, 200, 250, 300, 350, 400],
  runeSlotUnlockLevel(slotIndex) {
    return this.RUNE_SLOT_UNLOCK_LEVELS[slotIndex] ?? Infinity;
  },

  // The rune's own unique effect (RuneUniqueOptionData, base+perLevel*level).
  // Hero-specific runes (OptionType 0) have a real `{0}%`-templated
  // description straight from the game's own Locale (e.g. "Bonus Skill
  // Damage increases by {0}%.") — used directly. The 3 generic Melee/
  // Ranged/Universal rune families DON'T: their own Desc_en field is, on
  // every single row, just the plain rarity-tier word ("Normal"/"Fine"/
  // etc. — confirmed by checking every row, not a one-off) rather than a
  // real description, so for those this builds "<Stat> +X%" from
  // RuneOptionTypeData's real stat name instead of surfacing that rarity
  // word as if it were the effect text. Rich-text `<color=...>` tags are
  // stripped either way (see stripRichText in ui-common.js).
  runeUniqueOption(rune, level) {
    const opt = Game.index.runeUniqueOptionById.get(rune.UniqueOptionID);
    if (!opt) return null;
    const value = opt.BaseValue + opt.ValuePerLevel * level;
    if (opt.OptionType === 0) {
      // Misty/Vlad's hero-rune templates (added 2026-10-23) use a
      // `{0:0%}`-style placeholder instead of the older bare `{0}` +
      // trailing literal "%" every other hero rune's Desc_en uses. Only
      // one value exists per rune, so every numbered placeholder (there's
      // occasionally a second `{1:...}` in a dual-effect description,
      // e.g. Misty's "Growth Potion") gets the same value — the data
      // genuinely has no second number to offer. The raw stored value is
      // already percent-point scale (consistent with every other row in
      // this column, e.g. "8" meaning 8%), so this does NOT re-apply the
      // literal C#-style "multiply by 100" `0%` format semantics — doing
      // so would be presenting an unconfirmed scaling guess as fact.
      const desc = stripRichText(opt.Desc_en).replace(/\{\d+(:[^}]*)?\}/g, (m, fmt) =>
        fmtNum(value) + (fmt && fmt.includes('%') ? '%' : ''));
      return { opt, value, desc, hiddenEffects: this._runeHiddenEffects(opt, level) };
    }
    const statRow = Game.index.runeOptionTypeByType.get(opt.OptionType);
    const statName = statRow ? statRow.Desc_en : `Option ${opt.OptionType}`;
    return { opt, value, desc: `${statName} +${fmtNum(value)}%`, hiddenEffects: this._runeHiddenEffects(opt, level) };
  },

  // A rune's Unique Option can carry a SECOND effect alongside the main
  // BaseValue/ValuePerLevel stat above, confirmed real 2026-10-23 while
  // deep-diving Misty/Vlad's new hero runes (RuneUniqueOptionSubSkillData —
  // see the comment on idx.runeSubSkillsByUniqueOptionId in data.js for the
  // full writeup). 4 of their 6 runes have BaseValue/ValuePerLevel both at
  // 0 — rendering a flat, WRONG "0%" above if this were ignored — while
  // actually carrying a real, scaling effect here instead.
  //
  // CONFIRMED BY DECOMPILATION (2026-10-23, same day): a .NET 6 runtime +
  // Il2CppDumper were installed into this environment specifically to
  // chase this down (no Il2CppDumper/.NET runtime had been available
  // earlier the same day). The real resolver
  // (DevilHunterIdle.Rune.RuneUniqueOptionSubSkillResolver.Grow, RVA
  // 0x249DF98) disassembles to a plain `fadd` — the rune's computed growth
  // (ValuePerLevel * level) is ADDED to the hero's own base SkillSubData
  // value, not multiplied or replaced — confirming `base + boost` (used
  // below) is the real formula, not a guess. Separately, each
  // `SubskillID` is a real `E_SkillSubType` enum constant with a real
  // compiled name (e.g. `Costume_Misty_AtkDmgUp_1`) — confirmed against
  // the real enum definition with zero orphans across all 241 distinct
  // SubskillIDs this table actually uses, so `EffectName_readable` is a
  // confirmed real name, not invented flavor text (stored on the data row
  // itself, data/RuneUniqueOptionSubSkillData.json).
  _runeHiddenEffects(opt, level) {
    const rows = Game.index.runeSubSkillsByUniqueOptionId.get(opt.id) || [];
    return rows.filter(r => r.ValuePerLevel !== 0).map(r => {
      const skillSub = Game.index.skillSubById.get(r.SubskillID);
      const base = skillSub ? (r.GrowthValueSlot === 2 ? skillSub.value2 : skillSub.value1) : null;
      const boost = r.ValuePerLevel * level;
      return {
        row: r,
        skillSub,
        effectName: r.EffectName_readable,
        costumeSkillSlot: r.CostumeSkillIndex + 1, // 0-based -> human-facing "1st/2nd/3rd skill"
        valueField: r.GrowthValueSlot === 2 ? 'value2' : 'value1',
        boost,
        base,
        total: base != null ? base + boost : null, // confirmed by decompilation: base + boost, see comment above
      };
    });
  },

  // Level-milestone bonuses (RuneLevelBonusGroupData), same shape as
  // weaponLevelBonusRows: every row in the rune's group, flagged
  // unlocked/locked against the current level. GrantType 1 rows are a
  // confirmed fixed stat bonus (real `{0}`-templated desc); GrantType 2
  // ("grants 1 random attribute") is a real field but its actual roll
  // mechanic was never decompiled — shown honestly, not guessed at.
  // Display note added 2026-10-24: none of the 200 GrantType===1 rows bake
  // a "%" into Desc_en, but every OptionType's Value sits in the same
  // small 30-550 range this app's other confirmed per-mille sources use
  // (RateAmount, rate_amount) — and CONFIRMED by decompilation that the
  // real game feeds this raw Value directly into the Dps-formula's
  // per-mille sum with zero scaling (AddLevelBonusStats loads it via
  // `ldrsw`, a plain integer load, never touched by float math). So this
  // divides by 10 for human display here (matching the established
  // RateAmount convention), while totalDpsBreakdown below uses the raw
  // value directly, per-mille, exactly as the real formula does.
  runeLevelBonusRows(rune, level) {
    const rows = Game.index.runeLevelBonusByGroup.get(rune.LevelBonusGroupID) || [];
    return rows.map(row => ({
      row,
      unlocked: level >= row.Level,
      desc: row.GrantType === 1 ? stripRichText(row.Desc_en).replace('{0}', fmtNum(row.Value / 10) + '%') : null,
    }));
  },

  // Informational only (this app tracks no currency/material inventory
  // anywhere — same convention as the weapon Scroll-cost display): what it
  // costs to reach `level` from `level-1`, and what breaking the rune at
  // `level` refunds. Both resolve real items via the same StackableItemData
  // .Type convention used throughout this app's reward/cost pipeline.
  runeCostForLevel(rune, level) {
    return Game.index.runeLevelCostByKey.get(`${rune.TypeID}:${rune.GradeID}:${level}`) || null;
  },
  runeBreakRewardForLevel(rune, level) {
    return Game.index.runeBreakRewardByKey.get(`${rune.TypeID}:${rune.GradeID}:${level}`) || null;
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

  // CONFIRMED 2026-10-24 by decompilation (DevilHunterIdle.Common.
  // InterpolationHelper<T>.CreateData, RVA 0x3F272E4 — the generic helper
  // AbilityLevelUpCostInfo.GetAbilityLevelUpCostData()/GetEffectAmount()
  // actually use): the real game does plain LINEAR interpolation between
  // whichever two checkpoint rows bracket the requested level
  // (`origin + (next-origin)*(level-originLevel)/(nextLevel-originLevel)`,
  // confirmed via the exact `fsub/fdiv/fmul/fadd` sequence in the
  // disassembly), not "closest row at-or-below" as `_closestRow` above
  // does. Caught via a direct user report with real screenshots: Cargo's
  // real screen at level 554 shows "829K", and this interpolation formula
  // reproduces that exactly (829,086) from the surrounding checkpoints —
  // `_closestRow` would have returned the checkpoint AT 527 (763,870,
  // "764K"), silently under-reporting every level that isn't exactly on a
  // checkpoint. Cross-checked the same way against HP Recovery (level
  // 416 -> 632,663, matching the screenshot's "632K" exactly). Extracted
  // as a shared helper (mirrors the pre-existing PlayerLevel interpolation
  // in totalDpsBreakdown below, now the second confirmed real use of this
  // exact technique) since Ability is the one tree whose checkpoint tables
  // are genuinely sparse (Extra/Special/Soul's own level tables are dense,
  // one row per level, so interpolation there would be a no-op — not
  // changed, to keep this fix scoped to the actual confirmed bug).
  _interpolatedRow(rows, levelField, valueFields, level) {
    if (!rows || rows.length === 0) return null;
    if (level <= rows[0][levelField]) return rows[0];
    const last = rows[rows.length - 1];
    if (level >= last[levelField]) return last;
    let lo = rows[0], hi = last;
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i][levelField] <= level && level <= rows[i + 1][levelField]) { lo = rows[i]; hi = rows[i + 1]; break; }
    }
    if (lo[levelField] === hi[levelField]) return lo;
    const t = (level - lo[levelField]) / (hi[levelField] - lo[levelField]);
    const out = { ...lo };
    for (const f of valueFields) out[f] = num(lo[f]) + t * (num(hi[f]) - num(lo[f]));
    return out;
  },

  abilityRow(abilityType, level) {
    return this._interpolatedRow(Game.index.abilityLevelsByType.get(abilityType), 'CurLevel', ['EffectAmount'], level);
  },
  abilityMaxLevel(abilityType) {
    const rows = Game.index.abilityLevelsByType.get(abilityType) || [];
    return rows.length ? rows[rows.length - 1].CurLevel : 0;
  },
  // Confirmed real percent-type abilities (Critical Chance/Attack Speed/
  // Double Attack/Triple Attack directly against real screenshots —
  // e.g. Attack Speed maxes at EffectAmount 1800 -> displayed "180%",
  // confirming the same ÷10 convention this app already uses for Extra/
  // Special/Soul's RateAmount; Critical Damage (id 9) was not shown in
  // any screenshot but is grouped here as a confident inference — it's
  // the direct sibling of Critical Chance, same "Icon_Critical*" naming,
  // same rate/chance semantics). Every other ability type (Power/Cargo/
  // HP/HP Recovery/Move Speed) is a flat absolute quantity, shown as-is.
  // AbilityListElementInfo itself carries no display-type field to read
  // this from directly, so it's listed explicitly rather than guessed per
  // row.
  ABILITY_PERCENT_TYPES: new Set([5, 8, 9, 11, 12]),

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
  // MaxLevelDatas' zero-vs-nonzero PATTERN is real (confirmed 2026-09-04 by
  // decompilation) and is exactly what `SpecialUpgradeManager.GetUnlockGrade`
  // (RVA 0x250D6F0) reads to decide which Altar Grade a stat type first
  // becomes available at: it calls `SpecialUpgradeTypeData.GetGradeMaxLevel
  // (grade)` for grade=1,2,3... and returns the first grade whose entry is
  // nonzero. E.g. FAST HEAL's MaxLevelDatas is `[0,10,25,45]` — grade 1's
  // entry is 0, so it isn't unlocked until grade 2; DUAL TRIGGER's
  // `[0,0,15,35]` doesn't unlock until grade 3; TRIPLE EDGE's `[0,0,0,20]`
  // not until grade 4. Only 5 of the 11 types (the ones with a nonzero
  // first entry) are available from grade 1.
  specialUnlockGrade(optionType) {
    const type = Game.index.specialTypeByOptionType.get(optionType);
    const levels = type ? toArray(type.MaxLevelDatas) : [];
    for (let i = 0; i < levels.length; i++) if (num(levels[i]) > 0) return i + 1;
    return 1;
  },
  // CORRECTED 2026-10-24 per a direct user report with 3 real in-game
  // screenshots (Equipment > Special tab, all 11 stat types visible at the
  // player's real Altar Grade). The 2026-09-04 "flat grade*10" fix above
  // was itself wrong — it was reasoned from a single ambiguous data point
  // (grade 2's cap reported as "20, not 15", which is consistent with
  // EITHER grade*10 OR a misreading of the real table) and never actually
  // matched any of the 11 types at any grade except by coincidence.
  //
  // Re-verified directly against SpecialUpgradeLevelData's own real rows,
  // cross-checked digit-for-digit against the screenshots (not just row
  // counts): e.g. LOAD MASTER's real screen shows "47% > 48%, Level
  // 17/20" — and SpecialUpgradeLevelData's own UpgradeLevel=47 row has
  // RateAmount=470 (470/10 = 47.0%, an exact match), sitting at
  // GradeLevel=4, Level=17 (also an exact match). This confirms
  // `SpecialUpgradeTypeData.MaxLevelDatas[grade-1]` IS the real, correct
  // CUMULATIVE max level at that grade (not "internally consistent but
  // unused" as the 2026-09-04 comment assumed) — this app's internal
  // `rec.level` is already a cumulative counter (see specialRow above), so
  // this is the correct quantity to cap it at. Verified the same way for
  // LIFE STEAL (maxes at cumulative level 50 -> 10%, matching "Level
  // 20/20 MAX, 10%") and SKILL COOLDOWN RATE (maxes at cumulative level 20
  // -> 20%, matching "Level 20/20 MAX, 20%").
  //
  // Correction, same day: an earlier draft of this comment claimed MASSIVE
  // MUSCLE (OptionType 1) has no SpecialUpgradeTypeData row at all — that
  // was wrong, an artifact of an ad-hoc exploration script that incorrectly
  // `.slice(1)`'d this table assuming a schema-row prefix. The committed
  // `data/*.json` files carry no such prefix (confirmed directly: index 0
  // of SpecialUpgradeTypeData really is Massive Muscle's own real row, id
  // 1, MaxLevelDatas [5,15,30,50]) — `Game.load()` never slices anything,
  // so the real app and `Game.index.specialTypeByOptionType` were never
  // affected by this; only that one draft comment's narrative was wrong,
  // now fixed. No fallback is needed below — every OptionType, Massive
  // Muscle included, always resolves a real row.
  specialMaxLevelForGrade(optionType, grade) {
    if (grade < this.specialUnlockGrade(optionType)) return 0;
    const type = Game.index.specialTypeByOptionType.get(optionType);
    const levels = toArray(type.MaxLevelDatas).map(num);
    const i = Math.min(grade, levels.length) - 1;
    return i >= 0 ? levels[i] : 0;
  },
  // The real in-game UI shows a PER-GRADE-TIER-relative "Level N/M" that
  // resets at each grade transition — NOT the cumulative counter this app
  // stores internally. Confirmed via the LOAD MASTER example above: real
  // cumulative level 47 displays as "Level 17/20" because grade 4's own
  // tier spans cumulative levels 31-50 (a 20-level tier — the DELTA
  // between grade 4's cap, 50, and grade 3's cap, 30), and 47 is 17 levels
  // into that tier. Returns the tier's own size (`tierMax`, the "/M") and
  // the cumulative level the tier starts at (`priorCap`, subtract this
  // from a cumulative level to get the "N" shown before the slash).
  specialTierBounds(optionType, grade) {
    const priorCap = this.specialMaxLevelForGrade(optionType, grade - 1);
    const tierCap = this.specialMaxLevelForGrade(optionType, grade);
    return { priorCap, tierMax: tierCap - priorCap };
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

    // Ability — AbilityListElementInfo id 1 = "POWER", flat EffectAmount,
    // now correctly interpolated between checkpoints (see abilityRow
    // above). KNOWN OPEN ISSUE (2026-10-24, direct user report with real
    // screenshots, not yet resolved): even with correct interpolation,
    // this app's committed AbilityLevelUpCostInfo checkpoint VALUES for
    // POWER specifically appear stale vs. the live game — a real
    // screenshot at level 631 showed "70.5K" where this table's own
    // interpolated value is ~21.9K (a ~3.2x gap). Cargo and HP Recovery,
    // checked the same way, match the live game exactly — so this isn't
    // a formula bug, it's specific underlying data that's gone stale
    // (HP, id 4, shows the same pattern, ~4.8x low) and would need a
    // fresh data pull to actually confirm/correct — not guessed at here.
    {
      const level = State.data.upgrades.ability[1] || 0;
      const row = this.abilityRow(1, level);
      set('Ability', row ? num(row.EffectAmount) : 0, 'mapped', `Ability tree "POWER" @ level ${level} (interpolated; underlying data may be stale, see comment above)`);
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

    // Hero-related sources. CostumeEquipping* are scoped to the active hero
    // (hero passed into this function); CostumeOwn* are roster-wide sums —
    // see the big comment above costumeOwnGradeSum() for the decompiled
    // evidence (GetStatModifications -> CalculateOwnStatModifications,
    // confirmed 2026-10-03) that these are genuinely two different things,
    // not a guessed split.
    let heroAttack = 0, heroGradePermille = 0, heroLevelPermille = 0;
    if (hero) {
      const costume = Game.index.costumeById.get(hero.costumeId);
      heroAttack = this.heroBaseStats(costume, hero.level).attack;
      heroGradePermille = this.costumeEquippingGradeSum(costume, hero.starGrade, 1);
      heroLevelPermille = this.costumeEquippingLevelSum(costume, hero.level, 1);
    }
    set('CostumeEquippingLevelAttackOption', heroAttack, 'mapped', hero ? 'Active hero’s own base Attack (CostumeLevelData)' : 'No active hero selected');
    set('CostumeEquippingGradeOption', heroGradePermille, 'confirmed', 'Active hero’s OptionStyle==EquipOnly_Option Star Grade rows (CostumeStarGradeOptionData, option_type 1) — confirmed via AddEquippingGradeStatModifications');
    set('CostumeEquippingLevelOption', heroLevelPermille, 'confirmed', 'Active hero’s OptionStyle==EquipOnly_Option per-level rows (CostumeLevelOptionData, option_type 1) — confirmed via AddEquippingLevelStatModifications');
    set('CostumeOwnEvolutionOption', this.costumeOwnEvolutionSum(1), 'confirmed', 'Sum of EVERY owned hero’s Evolution "Power" bonus (CostumeEvolutionData, option_type 1) — confirmed roster-wide via CalculateOwnStatModifications, not just the active hero');
    set('CostumeOwnGradeOption', this.costumeOwnGradeSum(1), 'confirmed', 'Sum of EVERY owned hero’s OptionStyle==Always_Option Star Grade rows (CostumeStarGradeOptionData, option_type 1) — confirmed via AddOwnGradeStatModifications, roster-wide');
    set('CostumeOwnLevelOption', this.costumeOwnLevelSum(1), 'confirmed', 'Sum of EVERY owned hero’s OptionStyle==Always_Option per-level rows (CostumeLevelOptionData, option_type 1) — confirmed via AddOwnLevelStatModifications, roster-wide');

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

    // Rune — CONFIRMED by decompilation (2026-10-24, resolved past the
    // "unmodeled" state from the same day's earlier correction): the real
    // E_BonusOptionExtensions.ToStat() lookup table (read directly from
    // the binary's own data, not inferred from names) confirms
    // E_BonusOption.DpsMult(1) -> EStat.Dps. RuneLevelBonusGroupData's
    // GrantType===1 rows use this exact E_BonusOption-space OptionType
    // field (confirmed: the real RuneOptionTypeData catalog's own
    // OptionType numbering matches E_BonusOption's 1:1, e.g. 2="CRITICAL
    // DAMAGE"=CritDamageMult), and AddLevelBonusStats (RVA 0x249A9E0)
    // passes an OptionType===1 row's raw Value straight into the
    // StatModification with zero scaling. Checked every currently-shipped
    // RuneUniqueOptionData row (the OTHER source AddRuneContributions
    // feeds): none uses OptionType===1 for any rune in the real game data,
    // so only the level-milestone "TOTAL POWER" bonus contributes here,
    // never the rune's own main effect. Sums every equipped slot's
    // unlocked TOTAL POWER row, across all 7 slots (hero-specific runes
    // ARE eligible for this — only their separate Unique Option is gated
    // out, confirmed no such gate exists in AddLevelBonusStats).
    {
      let runeTotal = 0;
      if (hero) {
        for (const slot of hero.runes) {
          if (!slot) continue;
          const rune = Game.index.runeById.get(slot.runeDataId);
          if (!rune) continue;
          for (const { row, unlocked } of this.runeLevelBonusRows(rune, slot.level)) {
            if (unlocked && row.GrantType === 1 && row.OptionType === 1) runeTotal += num(row.Value);
          }
        }
      }
      set('Rune', runeTotal, 'confirmed', 'Sum of every equipped rune slot’s unlocked "TOTAL POWER" level-milestone bonus (RuneLevelBonusGroupData GrantType 1/OptionType 1 — confirmed via AddLevelBonusStats + the real E_BonusOption→EStat lookup table, read directly from the binary)');
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
    // Rune placed in mult3 alongside TraitRoll/SoulUpgrade: the real
    // disassembly fetches Rune immediately after TraitRoll (the last two
    // of 20 fetches, right before the combine step) — the best available
    // signal for bracket placement without a fully-traced fadd tree (see
    // docs/game_logic_deep_dive.md §8), consistent with this formula's
    // existing, already-disclosed "shape confirmed, not every bracket
    // assignment" limitation.
    const mult3 = (1000 + src.TraitRoll.value + src.SoulUpgrade.value + src.Rune.value) / 1000;

    const dps = Math.round(rawBase * mult1 * mult2 * mult3);

    return { sources: src, flatBase, heroTerm, rawBase, mult1, mult2, mult3, dps, hero };
  },

  // --- Next Best Upgrade (Guide tab) ----------------------------------------
  // For each of this hero's directly-steppable progression levers (weapon
  // level, hero level/star grade/evolution, and the four upgrade trees'
  // own "Power"-type track — the exact same inputs totalDpsBreakdown's
  // Weapon/CostumeEquipping*/Ability/ExtraUpgrade/SpecialUpgrade/
  // SoulUpgrade sources already read above), simulates stepping it by
  // exactly one unit and re-runs the REAL totalDpsBreakdown formula to
  // see the resulting Dps delta — rather than hand-deriving a partial
  // derivative, which would be a second, unverified formula shadowing
  // the first. State is mutated and synchronously reverted within this
  // one call; nothing here calls State.notify()/persist(), so it never
  // touches localStorage or triggers a re-render. Trait rolls, VIP, and
  // Runes are deliberately excluded — traits are rolled not leveled, VIP
  // is a manual input with no step to simulate, and Runes aren't wired
  // into this formula at all (see "Rune system" in CLAUDE.md), so
  // including any of them here would compare apples to oranges.
  nextBestUpgrades(heroId) {
    const hero = State.getHero(heroId);
    if (!hero) return [];
    const costume = Game.index.costumeById.get(hero.costumeId);
    const baseline = this.totalDpsBreakdown(heroId).dps;
    const candidates = [];

    const tryStep = (label, nav, mutate, revert) => {
      mutate();
      const delta = this.totalDpsBreakdown(heroId).dps - baseline;
      revert();
      if (delta > 0) candidates.push({ label, delta, nav });
    };

    State.data.weapons.forEach((slot, i) => {
      if (!slot) return;
      const w = Game.index.weaponById.get(slot.weaponId);
      if (!w || slot.level >= this.weaponMaxLevel(w)) return;
      tryStep(`${w.Name_en} (Weapon ${i + 1}) → Lv ${slot.level + 1}`, 'weapons',
        () => { slot.level += 1; }, () => { slot.level -= 1; });
    });

    if (hero.level < costume.Max_Lv) {
      tryStep(`${costume.Name_en} Level → ${hero.level + 1}`, 'heroes',
        () => { hero.level += 1; }, () => { hero.level -= 1; });
    }
    if (hero.starGrade < costume.Max_Grade) {
      tryStep(`${costume.Name_en} Star Grade → ${hero.starGrade + 1}`, 'heroes',
        () => { hero.starGrade += 1; }, () => { hero.starGrade -= 1; });
    }
    {
      const next = this.heroEvolutionRows(costume).find(r => r.Rarity > hero.evoRarity);
      if (next) {
        const prev = hero.evoRarity;
        tryStep(`${costume.Name_en} Evolve → Tier ${next.Rarity}`, 'heroes',
          () => { hero.evoRarity = next.Rarity; }, () => { hero.evoRarity = prev; });
      }
    }

    {
      const level = State.data.upgrades.ability[1] || 0;
      if (level < this.abilityMaxLevel(1)) {
        tryStep(`Ability "POWER" → Lv ${level + 1}`, 'equipment',
          () => { State.data.upgrades.ability[1] = level + 1; }, () => { State.data.upgrades.ability[1] = level; });
      }
    }
    {
      const level = State.data.upgrades.extra[1] || 0;
      if (level < this.extraMaxLevel(1)) {
        tryStep(`Extra "Bulk Up" → Lv ${level + 1}`, 'equipment',
          () => { State.data.upgrades.extra[1] = level + 1; }, () => { State.data.upgrades.extra[1] = level; });
      }
    }
    {
      // __grade is the account-wide Altar Grade (ui-equipment.js's
      // globalGrade) — each type's own {grade,level} record just mirrors
      // whatever the global grade was when last saved, same convention
      // State.setSpecialLevel already uses.
      const globalGrade = State.data.upgrades.special.__grade || 1;
      if (globalGrade >= this.specialUnlockGrade(1)) {
        const rec = State.data.upgrades.special[1];
        const level = rec ? rec.level : 0;
        if (level < this.specialMaxLevelForGrade(1, globalGrade)) {
          tryStep(`Special "MASSIVE MUSCLE" → Lv ${level + 1}`, 'equipment',
            () => { State.data.upgrades.special[1] = { grade: globalGrade, level: level + 1 }; },
            () => { State.data.upgrades.special[1] = rec; });
        }
      }
    }
    {
      const level = State.data.upgrades.soul[1] || 0;
      if (level < this.soulMaxLevel(1)) {
        tryStep(`Soul "Battle Boost" → Lv ${level + 1}`, 'equipment',
          () => { State.data.upgrades.soul[1] = level + 1; }, () => { State.data.upgrades.soul[1] = level; });
      }
    }

    candidates.sort((a, b) => b.delta - a.delta);
    return candidates;
  },
};
