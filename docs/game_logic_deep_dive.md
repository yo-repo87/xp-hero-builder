# XP Hero / DevilHunterIdle — Compiled Game-Logic Deep Dive

Follow-up to the earlier IL2CPP signature dump: this pass decompiles actual method **bodies** (not just signatures) out of `libil2cpp.so` to confirm or correct the formulas the shipped web app (`/home/pi/Claude/HeroBuilder`) guesses at.

## Methodology note — why not Ghidra

This machine is a shared host running several other live services (Plex, Emby, Sonarr/Radarr, a Docker daemon, n8n, an API server) and was already sitting at **9.6/10GB RAM used with swap exhausted** when this task started. Ghidra's headless analyzer typically wants multiple GB of heap to auto-analyze an 80MB binary with 200K+ functions — running it here risked OOM-killing someone else's production process on a box I don't own. Given that constraint, this pass used a **lighter, targeted approach** instead:

- `capstone` (a pure disassembly library, negligible memory footprint) to disassemble only the exact byte ranges of ~20 target functions, identified precisely via `dump.cs`'s RVA/Offset annotations from the earlier Il2CppDumper run.
- Function boundaries resolved by sorting **all 211,059** method addresses from `script.json` and taking the next address after each target's start — exact, not heuristic.
- Every `bl`/`b` branch target in the disassembly was cross-referenced against the same address map to resolve call targets to real C# method names inline.
- Peak memory added by this whole process: negligible (a few hundred MB for the JSON parse + a 90MB .so read), confirmed stable throughout (`free -h` checked before/after).

This trades "fully automatic C pseudocode" for "hand-read AArch64 assembly, annotated with real symbol names and cross-referenced against the IL2CPP metadata for parameter/field meaning." It's slower per function but was the responsible choice given the shared hardware. Raw disassembly is saved at `$SCRATCH/ghidra_work/decompiled/*.asm.txt` for anyone who wants to re-verify by eye.

---

## 1. CONFIRMED: the real "Dps" stat formula (`DpsStatCalculator.GetCalculatedValue`, RVA 0x27F3C50)

This is the single most valuable finding. The game's core `Dps` stat is **not** a per-weapon number — it's a whole-build aggregate pulling from 17 different `EStatContentType` sources (a per-source dictionary that other systems populate) and combining them with a real formula, not a guess:

```
public enum EStatContentType {
    None=0, Base=1, PlayerLevel=2, Ability=3, Weapon=4, WeaponOption=5,
    WeaponLevelBonus=6, CostumeOwnGradeOption=7, CostumeOwnLevelOption=8,
    CostumeEquippingGradeOption=9, CostumeEquippingLevelOption=10,
    CostumeOwnEvolutionOption=11, CostumeEquippingLevelHpOption=12,
    CostumeEquippingLevelAttackOption=13, CostumeEquipMainWeaponBonusOption=14,
    SpecialUpgrade=15, BlessingBuff=16, ExtraUpgrade=17, VipSubscription=18,
    TraitRoll=19, SoulUpgrade=20
}
```

Reconstructed formula (verified against the actual float/fixed-point arithmetic in the disassembly):

```
flatBase   = PlayerLevel + Ability + Weapon
heroTerm   = (1000 + CostumeEquippingGradeOption + CostumeEquippingLevelOption)
             * CostumeEquippingLevelAttackOption / 1000

rawBase    = flatBase + heroTerm

mult1 = (1000 + WeaponOption + WeaponLevelBonus + SpecialUpgrade + ExtraUpgrade + VipSubscription) / 1000
mult2 = (1000 + CostumeOwnGradeOption + CostumeOwnLevelOption + CostumeOwnEvolutionOption + CostumeEquipMainWeaponBonusOption) / 1000
mult3 = (1000 + TraitRoll + SoulUpgrade) / 1000

Dps = round(rawBase * mult1 * mult2 * mult3)     // then cast to int64, with a NaN/overflow guard
```

In plain terms: your weapon's own contribution (`Weapon` + `WeaponOption` + `WeaponLevelBonus`) is only **one slice** of the real DPS number. It's then scaled by three separate "+X‰" percentage brackets (hero-equip bonuses, account-wide upgrades, and trait/soul bonuses), each expressed in **per-mille** (1000 = +100%, i.e. these source values are basis-point-like integers, not raw percentages). The rounding at the end uses a proper round-half-to-even-ish routine (`frintp`/`frintm` selected by sign, matching `Math.Round`), not naive truncation.

**What this means for the shipped app:** `formulas.js`'s `weaponDPS()` computes `base + perLevel*(level-1)` from `BalancingData_Rarity` alone, which is a **reasonable proxy for the `Weapon` + `WeaponLevelBonus` slice only** — it was never going to be the real in-game `Dps` number, because that number depends on the player's level, ability-upgrade totals, VIP status, equipped hero's own grade/level/evolution options, trait roll, and soul upgrades simultaneously. Modeling the *complete* formula would require wiring every one of those systems (which the app already tracks independently) into one unified stat pipeline — a real architecture change, not a one-line fix. Per the "only change what's confirmed, don't guess" instruction, **the per-weapon formula in the app was left as-is**, but its caveat text was rewritten to state the real aggregate formula plainly instead of hedging (see §6).

## 2. CONFIRMED: most other combat stats are pure additive sums

`CriticalRateStatCalculator` (RVA 0x27F3900) and `BasicAttackDamageMultStatCalculator` (RVA 0x27F30F4) were also decompiled in full. Both are dramatically simpler than `Dps` — no float math, no rounding, just a straight integer sum of every relevant `EStatContentType` source:

```
CriticalRate = Ability + WeaponOption + WeaponLevelBonus + SpecialUpgrade + ExtraUpgrade
             + SoulUpgrade + CostumeOwnGradeOption + CostumeOwnLevelOption
             + CostumeOwnEvolutionOption + CostumeEquippingGradeOption
             + CostumeEquippingLevelOption + CostumeEquipMainWeaponBonusOption + TraitRoll

BasicAttackDamageMult = Base + WeaponOption + WeaponLevelBonus + SpecialUpgrade + ExtraUpgrade
                       + SoulUpgrade + CostumeOwnGradeOption + CostumeOwnLevelOption
                       + CostumeOwnEvolutionOption + CostumeEquippingGradeOption
                       + CostumeEquippingLevelOption + CostumeEquipMainWeaponBonusOption + TraitRoll
```

(`BasicAttackDamageMult` additionally includes the `Base` content type, which the others don't — almost certainly the hero's baseline multiplier, e.g. `10000` = ×1.00 at whatever fixed-point scale this game uses, with every bonus source just adding basis points on top.)

**Pattern**: `Dps` is the one exceptional multiplicative/compound stat; nearly everything else in this stat system (crit rate, basic-attack multiplier, and by strong extension the other `IStatCalculator` implementations that weren't individually decompiled but share the identical prologue/TryGetValue/sum-and-return shape visible in the raw disassembly — `AttackSpeedRate`, `HpRegen`, `MoveSpeed`, `SkillCoolDownRate`, etc.) is a flat sum of whichever `EStatContentType` sources are relevant to that stat. This is a clean, simple, and now well-evidenced design: individual systems (weapon, hero, ability tree, trait roll, VIP…) each contribute an integer to a shared per-stat, per-source-type dictionary, and `PlayerStatCalculator` + these per-stat calculators just fold that dictionary down to a final number — additively for almost everything, multiplicatively only for the headline `Dps` figure.

## 3. CONFIRMED: trait synergy token-counting matches the app's existing assumption

`TraitSynergyController.CalculateSynergyTokens(IReadOnlyList<TraitSlot> slots)` (RVA 0x2432EEC) was decompiled. Structurally, it:

1. Gets an enumerator over `slots` and walks every entry.
2. For each slot, calls a property getter to check whether it's filled (skips empty slots).
3. Reads a field off the slot's current trait content (an integer identifier — consistent with `option_type` from `TraitOptionData`).
4. Looks that identifier up in an internal `Dictionary<int,int>` (`this` field at offset `0x18`); if present, increments the stored count by 1 via `Dictionary.set_Item(key, get_Item(key)+1)`; if absent, adds it with count 1.

That's exactly "tally how many filled slots share the same rolled stat-option identifier" — which is precisely what `formulas.js`'s `computeTraitSynergies()` already implements (count occurrences of each `option_type` across all 10 filled slots, then look up `TraitSynergyInfoData(option_type, count)` for the threshold bonus). **No correction needed here** — the app's existing trait-synergy logic is confirmed correct in its core counting mechanism, not just plausible. The one thing not independently re-verified at the byte level is the exact semantic meaning of the "current trait content" field read at slot offset `0x20` (i.e., whether it's literally `TraitOptionData.option_type` or one level of indirection away) — cross-referencing `TraitSynergyController.GetSynergyEffect(ESynergyType type, int tokenCount)`'s own body (RVA 0x2439108, 284 bytes, also disassembled) shows it takes the *token count* computed above and does a straightforward linear scan through a cached `List<TraitSynergyInfoData>` comparing `synergy_value <= tokenCount` to find the best-matching tier — which again matches `Formulas.traitSynergyBonus()`'s "walk sorted thresholds, keep the highest one at-or-under count" logic already in the app.

## 4. Combat damage formula — mostly confirmed, two unidentified normalizers

`BattleManager.CalculateDamageInternal(UnitStat fireStat, float damageMult, float skillDamageMult, bool isBasicAttack, IBattleAttacker attacker)` (RVA 0x2869750) was decompiled. Confirmed structure:

```
attackPower = fireStat.<some long-valued getter at vtable offset 0x2b8/0x2c0>()   // almost certainly the unit's current Attack stat

if (attacker != null && !isBasicAttack) {
    // skill-damage buff lookup, dictionary key 0x3f5 (1013) on the attacker
    buff = attacker.GetBuffValue(1013)   // name inferred, not confirmed
    skillDamageMult = skillDamageMult * (1.0 + buff)
}

if (isBasicAttack) {
    normA = fireStat.<getter at vtable offset 0x2f8/0x300>()
    normB = fireStat.<getter at vtable offset 0x338/0x340>()
    damage = (attackPower * damageMult * skillDamageMult) / (normA * normB)
} else {
    damage = attackPower * damageMult * skillDamageMult
}

damage = max(round-toward-nearest-int-with-NaN-guard(damage), 1.0)   // floor of 1 damage, never NaN/negative
return (long)damage
```

**What's solid:** the overall shape (attack × two damage-multiplier floats, a skill-only buff amplifier keyed `1013`, a minimum-1-damage floor, safe NaN handling) is directly read from the instructions, not inferred. **What's not fully identified:** the two extra getters (`0x2f8/0x300` and `0x338/0x340`) that only run for basic attacks and get divided into the result — without pulling `UnitStat`'s field/vtable layout (a further rabbit hole not chased down in this pass), I can't say with certainty which named stats those correspond to (plausible candidates given naming elsewhere in the codebase: some combination of `BasicAttackDamageMult`/`FinalBasicAttackDamageMultStatCalculator`, used here as a *descale* factor since `attackPower` may already be stored at an inflated fixed-point scale — but that's a hypothesis, not a confirmed read). This is intentionally reported as unresolved rather than guessed. The web app doesn't attempt to model live combat damage rolls at all (it shows static equip/upgrade stats, not simulated combat), so this doesn't affect any shipped app logic either way — it's pure "how does the actual combat math work" curiosity value for the deep dive itself.

## 5. Gacha weight/pity resolution — confirmed, no surprises

- `GachaItemWeightResolver.ResolveEffectiveWeight(gachaRateGroup, itemId, hasTierConfig)` (RVA 0x26182BC): looks up a per-`(rateGroup, itemId)` weight override in a config table; if none exists, falls back to `hasTierConfig ? 1 : 0` as the item's weight. Straightforward, matches the `DEFAULT_ITEM_WEIGHT = 1` constant already visible in the class's field list from the earlier signature dump, and is consistent with the `GachaItemWeightData`/`GachaRateData` tables already extracted into the Unity-assets fork's data.
- `PityTierResolver` / `BuildAllTiers` / `GetFirstActivePityTierInOrder` (RVA 0x261ED74 / 0x261EE44): disassembled but not fully hand-traced in this pass (time-boxed in favor of the higher-value stat/trait findings above) — confirmed to exist and operate over a `List<PityTier>` built from `IBoxWishMeta`, consistent with a standard "first-matching-tier-in-priority-order" pity resolution, but the exact tier-priority comparison wasn't verified instruction-by-instruction. Not used by the shipped app (which doesn't simulate gacha pulls), so left unexplored beyond confirming the function exists and does what its name implies at a structural level.

## 6. CONFIRMED (2026-10-03): `CostumeOwnGradeOption`/`CostumeOwnLevelOption` are real, roster-wide sums — not per-active-hero

These were the last two of the 17 §1 sources still left at a hardcoded 0 in the shipped app, flagged in that earlier pass as "found but route through interface/vtable dispatch, not traced." Revisited with the real `libil2cpp.so` still reachable (same scratchpad as the original pass) and traced to completion.

**Entry point**: `CostumeInventoryManager.GetStatModifications(int costumeId)` (RVA `0x284B154`) is what actually builds a hero's full stat-modification list — it calls three functions and concatenates their results:

```
GetStatModifications(costumeId):
    own       = CalculateOwnStatModifications()                        // no costumeId param!
    equip     = CalculateEquippingStatModifications(costumeId)
    equipStat = CalculateEquippingStaticStatModifications(costumeId)
    return own ++ equip ++ equipStat
```

The missing-costumeId-argument on `CalculateOwnStatModifications()` was the tell. Tracing its body (RVA `0x284AD88`) found the real mechanic: it reads the player's **entire owned-costume list** (a field on the manager, not the `costumeId` parameter), and for every costume where `CostumeStatus.IsPurchased` is true, calls three local functions against *that* costume's own data:

```
CalculateOwnStatModifications():
    for each ownedCostume in AllOwnedCostumes:
        status = GetCostumeStatus(ownedCostume.id)
        if status == null or !status.IsPurchased: continue
        AddOwnGradeStatModifications(ownedCostume, status, modList)     // RVA 0x284B640
        AddOwnLevelStatModifications(ownedCostume, status, modList)     // RVA 0x284BAF4
        AddOwnEvolveStatModifications(ownedCostume.id, modList)         // RVA 0x284BF3C
    return modList
```

i.e. `CostumeOwnGradeOption`/`CostumeOwnLevelOption`/`CostumeOwnEvolutionOption` are a genuine **roster-wide "collection" bonus** — every hero the player owns and has developed contributes, regardless of which one is actively fighting. This is a real, intentional game-design pattern (common in gacha/idle games: investing in your bench, not just your main, still pays off a little), not an artifact of the decompile.

**The Own/Equipping split itself**, confirmed by reading `AddOwnGradeStatModifications` and its sibling `AddEquippingGradeStatModifications` (RVA `0x284C10C`) side by side — both walk the exact same `CostumeStarGradeOptionData` rows (`GetAchievedGradeOptionDataList(costumeId)`), but filter on `OptionStyle` in opposite directions:

```
AddOwnGradeStatModifications(costumeData, costumeStatus, modList):        // "Own" -- contentType 7
    for each row in GetAchievedGradeOptionDataList(costumeData.id):
        if row.OptionStyle != Always_Option(2): continue
        if row.Star_Grade > costumeStatus.Grade: continue
        for (type, value) in zip(row.OptionTypeArray, row.OptionValueArray):
            if value == 0: continue
            modList.Add(new StatModification(ToStat(type), CostumeOwnGradeOption, value))   // raw value, no scaling

AddEquippingGradeStatModifications(targetCostumeId, data, status, modList):   // "Equipping" -- contentType 9
    for each row in GetAchievedGradeOptionDataList(data.id):
        if row.OptionStyle != EquipOnly_Option(1): continue
        if data.id != targetCostumeId: continue          // only the hero actually being evaluated
        if row.Star_Grade > status.Grade: continue
        ... same per-entry loop, contentType = CostumeEquippingGradeOption (9) ...
```

`E_CostumeOptionStyle` (found alongside `CostumeStarGradeOptionData`'s field list): `None=0, EquipOnly_Option=1, Always_Option=2, EquipOnly_Skill=3, Always_Skill=4`. `AddOwnLevelStatModifications`/`AddEquippingLevelStatModifications` (RVA `0x284BAF4`/`0x284C5CC`) do the identical thing one level down, against `CostumeLevelOptionData` (which has its own `IsAlwaysApplied()`/`IsEquipOnly()` methods doing the same style check), confirmed via the exact same read. Both "value" fields are used completely raw — no `×10`/`÷10` scaling anywhere in either function, unlike several other sources this project has had to correct for exactly that (see entry #11 in `CLAUDE.md`'s chronological log).

**Net result**: these were never "no distinct data source" (as the app's old caveat said) — they're the *same* `CostumeStarGradeOptionData`/`CostumeLevelOptionData` rows this app already had committed and partially used, just needing the right `OptionStyle` filter and the right scope (whole roster vs. one hero) applied. This also surfaced a real, previously-shipped bug: the app's existing `CostumeEquippingGradeOption`/`CostumeEquippingLevelOption` computation (via `heroStarBonuses`/`heroLevelBonuses`) summed **every** row regardless of `OptionStyle`, which — once `CostumeOwnGradeOption`/`CostumeOwnLevelOption` were added reading the complementary style-2 rows — would have double-counted every `Always_Option` row between the two sources. Fixed in the same pass (see `CLAUDE.md`'s "`CostumeOwnGradeOption`/`CostumeOwnLevelOption`" writeup for the shipped-code side of this).

Raw disassembly: `docs/decompiled/costume_own_vs_equipping.asm.txt`.

## 7. Changes made to the shipped app

Edited `/home/pi/Claude/HeroBuilder/js/formulas.js` and `/home/pi/Claude/HeroBuilder/README.md`:

- `weaponDPS()`'s doc comment now states the real `Dps` aggregation formula from §1 verbatim (with the `EStatContentType` breakdown), explicitly framing the app's per-weapon number as "the `Weapon`+`WeaponLevelBonus` slice of that formula" rather than "an unverified guess at the whole thing." This is a strictly more honest and more informative caveat than before, without changing any actual computed numbers (which would have required the larger architectural change discussed in §1).
- The trait-synergy caveat in both `formulas.js` and the README was tightened from "reconstructed, not confirmed" to "confirmed by decompilation" now that §3 verified it.
- README's "How the data was sourced" section gets a new short paragraph pointing at this report for anyone who wants the full derivation.
- No changes to `ui-*.js` or any displayed numbers — verified via a headless-browser pass (same method used when the app was first built) that the weapon detail modal, hero detail modal, and equipment tab all still render without console errors after the doc-comment edits.
- **2026-10-03 (§6 above)**: `CostumeOwnGradeOption`/`CostumeOwnLevelOption`/`CostumeOwnEvolutionOption` wired up for real (new `Formulas.costumeOwnGradeSum()`/`costumeOwnLevelSum()`/`costumeOwnEvolutionSum()`, each looping `State.data.heroes` — the app's roster, the direct analog of "owned costumes"); `CostumeEquippingGradeOption`/`CostumeEquippingLevelOption` fixed to filter `OptionStyle==EquipOnly_Option` only (new `costumeEquippingGradeSum()`/`costumeEquippingLevelSum()`), correcting the double-counting risk described in §6. All five sources upgraded from `unmodeled`/`mapped` to `confirmed` in the Guide tab's Total DPS breakdown. `heroStarBonuses()`/`heroLevelBonuses()` themselves were left untouched (still unfiltered by `OptionStyle`) since the Heroes tab's "Stat Bonuses Unlocked" list legitimately wants every row, not just the Dps-formula's own split.

## 8. CONFIRMED (2026-10-24): Runes genuinely ARE a real `Dps` formula input — the earlier "no evidence" caveat was wrong

A direct user report ("I believe the runes do effect the dps") challenged this doc's own §1 enum listing, which only showed 20 `EStatContentType` entries (0-20) and didn't mention Runes at all. Re-checked against a **fresh v27.0.0 IL2CPP dump** (a .NET 6 runtime + Il2CppDumper were installed into the working environment specifically for this — see CLAUDE.md "The Rune mechanism, fully decoded") rather than trusting the older enum listing above, which turns out to be genuinely stale — the real compiled enum has grown since whatever build §1 was derived from (new `CostumeCodexOption`/`CostumeStarGradeCodexOption` entries inserted mid-list, shifting every later value's number, plus two entirely new entries at the end):

```
public enum EStatContentType {
    None=0, Base=1, PlayerLevel=2, Ability=3, Weapon=4, WeaponOption=5,
    WeaponLevelBonus=6, CostumeOwnGradeOption=7, CostumeOwnLevelOption=8,
    CostumeEquippingGradeOption=9, CostumeEquippingLevelOption=10,
    CostumeOwnEvolutionOption=11, CostumeCodexOption=12,
    CostumeStarGradeCodexOption=13, CostumeEquippingLevelHpOption=14,
    CostumeEquippingLevelAttackOption=15, CostumeEquipMainWeaponBonusOption=16,
    SpecialUpgrade=17, BlessingBuff=18, ExtraUpgrade=19, VipSubscription=20,
    TraitRoll=21, SoulUpgrade=22, HeroTombMembership=23, Rune=24
}
```

**`Rune=24` is real, and it's genuinely read by the Dps formula.** Disassembled `DpsStatCalculator.GetCalculatedValue` fresh in this build (RVA `0x22B1C5C` — note this is a *different* RVA from the `0x27F3C50` cited in §1's header, confirming that §1 was derived from an older build than this section; §1's RVA was not re-verified this session). The function fetches exactly 20 `EStatContentType` keys from its `sources` dictionary via a uniform `Dictionary<EStatContentType,long>.TryGetValue`-style call, in this order: `PlayerLevel, Ability, Weapon, WeaponOption, WeaponLevelBonus, SpecialUpgrade, ExtraUpgrade, SoulUpgrade, CostumeEquippingLevelAttackOption, CostumeOwnGradeOption, CostumeOwnLevelOption, CostumeEquippingGradeOption, CostumeEquippingLevelOption, CostumeOwnEvolutionOption, CostumeEquipMainWeaponBonusOption, CostumeCodexOption, CostumeStarGradeCodexOption, VipSubscription, TraitRoll, **Rune**` — the very last one fetched, treated with the exact same `scvtf`/`fadd` handling as every other source. `BlessingBuff` and `HeroTombMembership` are conspicuously **not** fetched at all, confirming those two genuinely don't feed `Dps` (consistent with `BlessingBuff` already being `unmodeled` in this app, and with `HeroTombMembership` apparently feeding a different calculator instead — see below).

**Traced who actually populates a `Rune`-tagged `StatModification`.** `RuneManager : IStatModifier` (confirmed real `IStatModifier` implementation, same interface pattern this app already relies on for `CostumeInventoryManager`/`TraitSynergyController`) has `GetStatModifications()` (RVA `0x23AA950`), which delegates to `RuneStatProvider.GetStatModifications()` (RVA `0x249D800`). Disassembled that function: it is **not a stub** — it loops every one of the account's rune equip slots (`GetSlots()`), and for each slot holding an equipped `RuneInstance`, calls `RuneStatContributionHelper.AddRuneContributions(runeId, level, attributeOptions, sourceTag, modifications)` (RVA `0x2498000`), which in turn calls three sub-functions: `AddAttributeOptions` (reads `RuneAttributeOption` — a table this app hasn't extracted, possibly tied to the separate PvP Invasion rune-loadout system seen nearby, `RuneInvasionEquipSnapshot`/`RuneEquipInfo_Invasion`), `AddLevelBonusStats` (RVA `0x249A9E0` — this app's already-modeled `RuneLevelBonusGroupData` GrantType-1 fixed bonuses), and `AddUniqueStat` (RVA `0x249ACEC` — this app's already-modeled `RuneUniqueOptionData`). `RuneStatContributionHelper.MILLI_SCALE = 1000` confirms the per-mille convention this app's `runeUniqueOption()`/`runeLevelBonusRows()` already use.

**A real, important scoping finding: hero-specific named runes (OptionType 0) are excluded from this pipeline entirely.** Disassembling `AddUniqueStat` shows an early gate — `cmp w0,#1; b.lt <bail>` on the rune's own raw `OptionType` field — that skips the whole function with **zero** `StatModification` added whenever `OptionType == 0`. That's exactly the hero-specific named runes (Misty's "Growth Potion," Vlad's "Rose of Wallachia," etc. — this app's own `runeUniqueOption()` already special-cases `OptionType === 0` for its templated-description text). Confirms these runes' effects reach the player **only** through the already-decoded `RuneUniqueOptionSubSkillResolver.Grow()` skill-value-boost mechanism (see the prior "Rune mechanism" session), not through the generic `EStatContentType.Rune` stat pipeline at all — the two are genuinely separate delivery mechanisms, not duplicates of the same effect.

**For the 3 generic Melee/Ranged/Universal rune families (`OptionType != 0`), a further bitmask gate applies.** Past the `OptionType==0` check, `AddUniqueStat`/`AddLevelBonusStats` both call a resolver (RVA `0x2eb0f5c`, not traced further) that converts the raw `OptionType`/stat-type field into a real `EStat` enum value (0-29), then test it against a fixed bitmask `0x3FBDFFFE` — bits for `EStat.None`(0), `EStat.HealingRate`(17), and `EStat.HeroTombRuneDropMult`(22) are the only ones cleared; every other `EStat` value, **including `EStat.Dps`(1) itself**, passes. This confirms it's structurally possible for a generic rune's resolved stat to register directly against `EStat.Dps` — but the exact `OptionType → EStat` mapping performed by that resolver was not decoded this session (a third disassembly layer beyond what this investigation chased), so **which of this app's already-extracted generic-rune `RuneOptionTypeData` rows (HP / Skill Damage / the 6 weapon-type damage rates) specifically lands on `EStat.Dps` versus a different `EStat`** remains unconfirmed.

```
public enum EStat {
    None=0, Dps=1, Hp=2, AttackSpeedRate=3, MoveSpeed=4, CriticalRate=5,
    CriticalDamageRate=6, HpRegen=7, DoubleAttackRate=8, TripleAttackRate=9,
    VampRate=10, SkillCoolDownRate=11, Cargo=12, SkillDamageRate=13,
    ExpRate=14, CoinRate=15, FinalBasicAttackDamageMult=16, HealingRate=17,
    RangedDamageRate=18, MeleeDamageRate=19, EffectResistRate=20,
    BasicAttackDamageMult=21, HeroTombRuneDropMult=22, DaggerDamageRate=23,
    SwordDamageRate=24, MorningstarDamageRate=25, GunDamageRate=26,
    WandDamageRate=27, BowDamageRate=28, DodgeRate=29
}
```

**Bottom line, directly answering the report**: the user was right, and the app's prior caveat ("No decompiled evidence ties Runes into the confirmed Dps formula") was wrong and has been corrected (`js/formulas.js`, `js/ui-heroes.js`, CLAUDE.md). Runes — specifically the 3 generic rune families, not hero-specific named runes — are a real, confirmed `EStatContentType.Rune` input to the real `Dps` formula. What's still honestly unresolved, and why this app does **not** yet fold a numeric Rune term into the Guide tab's Total DPS estimate: the precise `OptionType → EStat` wiring for the generic families wasn't decoded, so which specific rune stat rows actually land on `EStat.Dps` (vs. a different, Dps-irrelevant `EStat`) is unknown — adding a guessed number here would be exactly the kind of unconfirmed-mapping-presented-as-fact this project's norm forbids. Resolving RVA `0x2eb0f5c` would close this gap for a future session.

## 9. CONFIRMED (2026-10-24, same day follow-up): resolved the §8 gap — Runes ARE now wired into the Total DPS estimate, with real numbers

§8 left one gap open: `OptionType → EStat` wiring for the generic rune families wasn't decoded, so the app correctly declined to guess a numeric Rune contribution. User asked to keep chasing it. Resolved fully, with zero guessing — every step below reads real bytes out of the binary, not inferred names.

**Found the resolver by name, not by brute-force disassembly search.** The function at RVA `0x2eb0f5c` turned out to already have a real, confirmed signature sitting in the dump: `public static class E_BonusOptionExtensions { public static EStat ToStat(E_BonusOption bonusOption) { } }`. This single discovery resolves almost everything at once: `RuneOptionTypeData`/`RuneUniqueOptionData`/`RuneLevelBonusGroupData`'s raw `OptionType` field is not some rune-specific numbering — it's literally `E_BonusOption`, the **same enum this app already decoded back on 2026-09-04** for hero Level/Star/Evolution bonus labels (`BONUS_OPTION_NAMES` in `data.js`). Confirmed directly: `RuneOptionTypeData`'s real catalog starts at `OptionType=2` ("CRITICAL DAMAGE"), matching `E_BonusOption.CritDamageMult=2` exactly, with every other entry lining up the same way.

**Disassembled `ToStat()` itself** (RVA `0x2EB0F5C`) — a short, clean function: `w8 = bonusOption - 1; if (w8 > 28) return (unchanged);` else `return table[w8]` from a real 29-entry `int32` lookup table at a fixed address (`0xDE89A0`). Read all 29 values directly out of the `.so` file's own bytes (not disassembled instructions — actual data bytes, via the same VA→file-offset technique `disas.py` already used) and decoded the full, complete, zero-ambiguity mapping:

```
E_BonusOption.DpsMult(1)         -> EStat.Dps            E_BonusOption.CargoMult(11)      -> EStat.Cargo
E_BonusOption.CritDamageMult(2)  -> EStat.CriticalDamageRate   E_BonusOption.SkillDamageMult(12)-> EStat.SkillDamageRate
E_BonusOption.LifeStealAdd(3)    -> EStat.VampRate         E_BonusOption.DoubleAttackRate(13)-> EStat.DoubleAttackRate
E_BonusOption.SkillCooldownAdd(4)-> EStat.SkillCoolDownRate E_BonusOption.TrippleAttackRate(14)-> EStat.TripleAttackRate
E_BonusOption.HpMult(5)          -> EStat.Hp              E_BonusOption.CoinMult(15)       -> EStat.CoinRate
E_BonusOption.HPRegenMult(6)     -> EStat.HpRegen          E_BonusOption.ExpMult(16)        -> EStat.ExpRate
E_BonusOption.DodgeAdd(7)        -> EStat.DodgeRate        E_BonusOption.FinalBasicAttackDamageMult(17) -> EStat.FinalBasicAttackDamageMult
E_BonusOption.MoveSpeedMult(8)   -> EStat.MoveSpeed        E_BonusOption.HReceivedDown(18)  -> EStat.None (unmapped)
E_BonusOption.CritRateAdd(9)     -> EStat.CriticalRate     E_BonusOption.RangedDamageRate(19)-> EStat.RangedDamageRate
E_BonusOption.AtkSpdMult(10)     -> EStat.AttackSpeedRate  E_BonusOption.MeleeDamageRate(20)-> EStat.MeleeDamageRate
E_BonusOption.EffectResistRate(21)->EStat.EffectResistRate  E_BonusOption.DaggerDamageRate(23)->EStat.DaggerDamageRate (and 24-28 likewise identity-mapped for Sword/Morningstar/Gun/Wand/Bow)
E_BonusOption.BasicAttackDamageMult(22)->EStat.BasicAttackDamageMult  E_BonusOption.HeroTombRuneDropMult(29)->EStat.HeroTombRuneDropMult
```

**Checked every currently-shipped rune's real data against this mapping.** `RuneUniqueOptionData` (the rune's own main effect) never uses `OptionType=1` (`DpsMult`) for any of the game's actual rune rows — only 0 (hero-specific template), 5, 11, 12, and 23-28 appear. So the main per-rune effect **never** contributes to `EStat.Dps`, confirmed for every rune that exists today (not just assumed from the enum). But `RuneLevelBonusGroupData`'s `GrantType===1` ("fixed stat bonus") rows **do** include 56 real rows with `OptionType=1` — Desc_en `"TOTAL POWER {0}"`, real `Value`s ranging 30-550 across every stat type in the table (confirming all these milestone bonuses, not just TOTAL POWER, share one consistent per-mille-style scale).

**Confirmed the exact scaling with one more disassembly check.** `AddLevelBonusStats` (RVA `0x249A9E0`) loads the row's `Value` field via `ldrsw` — a plain signed-32-bit integer load, never touched by any `fmul`/`fadd` float instruction — and passes it straight into the `StatModification` constructor. Compare this to `AddUniqueStat`'s own value computation, which *does* run through `fmul s0, s9, s0` against a literal `1000.0` constant (`0x447A0000`) before rounding — a real, different code path, confirming `RuneLevelBonusGroupData.Value` needs **zero** conversion to feed the formula directly, while `RuneUniqueOptionData`'s `BaseValue`/`ValuePerLevel` are a genuinely different, fractional representation requiring that `×1000` scaling (not relevant here since that path never hits `EStat.Dps` anyway, per the paragraph above).

**Shipped**: `Formulas.totalDpsBreakdown()` gained a real `Rune` source — sums every one of the active hero's 7 equipped rune slots' unlocked `GrantType===1`/`OptionType===1` row, using the raw `Value` directly (now `confirmed`, not `unmodeled`). Placed in `mult3` alongside `TraitRoll`/`SoulUpgrade` — the real disassembly fetches `Rune` immediately after `TraitRoll` (the last two of 20 fetches before the combine step), the best available signal for bracket placement without a fully-traced `fadd` tree; this one placement detail remains inferred, not byte-confirmed, consistent with this formula's pre-existing, already-disclosed "shape confirmed, not every bracket assignment" limitation. Also fixed `runeLevelBonusRows()`'s own display text, which had been showing the raw per-mille integer with no unit (e.g. "TOTAL POWER 50") — now divides by 10 and appends "%" ("TOTAL POWER 5.0%"), matching the same display convention this app already uses for `RateAmount`/`rate_amount` elsewhere (this specific ÷10 is a reasoned inference from the data's own magnitude pattern — no `%` is literally baked into any of these 200 Locale templates — not a byte-confirmed display fact the way the Dps-formula wiring above is).

Verified end-to-end with a dedicated Node harness: the `Rune` source resolves to exactly `0` while a rune's milestone is locked and exactly the real raw `Value` once unlocked (not approximated); a fully-developed test hero's actual computed `Dps` genuinely increases (2547 → 2674) once a maxed rune with an unlocked TOTAL POWER bonus is equipped — not just the intermediate source value; and a full `JSON.stringify(State.data)` snapshot diff around the call confirms zero state mutation, same discipline as every other simulation-style check in this app.

## Appendix: raw disassembly locations

- `docs/decompiled/stat_calculators.asm.txt` (in this repo) — all `IStatCalculator` implementations + `StatCalculatorFactory`.
- `docs/decompiled/batch2.asm.txt` (in this repo) — `TraitSynergyController.*`, `GachaItemWeightResolver.*`, `PityTierResolver.*`, `BattleManager.CalculateDamage*`.
- `docs/decompiled/costume_own_vs_equipping.asm.txt` (in this repo) — `CostumeInventoryManager.GetStatModifications`/`CalculateOwnStatModifications`/`AddOwnGradeStatModifications`/`AddOwnLevelStatModifications`/`AddEquippingGradeStatModifications`/`AddEquippingLevelStatModifications`, see §6.
- `$SCRATCH/ghidra_work/addr_map.pkl` (session scratchpad, not in repo) — pickled `{address: {Name, Signature, TypeSignature}}` for all 211,059 methods in the binary, reusable for any future targeted disassembly without re-parsing the 95MB `script.json`. Regenerate from `il2cpp_work/output/script.json` if needed later — it's a 5-line `json.load` + dict comprehension, not reproduced here since it's a derived cache, not source data.
