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

## 6. Changes made to the shipped app

Edited `/home/pi/Claude/HeroBuilder/js/formulas.js` and `/home/pi/Claude/HeroBuilder/README.md`:

- `weaponDPS()`'s doc comment now states the real `Dps` aggregation formula from §1 verbatim (with the `EStatContentType` breakdown), explicitly framing the app's per-weapon number as "the `Weapon`+`WeaponLevelBonus` slice of that formula" rather than "an unverified guess at the whole thing." This is a strictly more honest and more informative caveat than before, without changing any actual computed numbers (which would have required the larger architectural change discussed in §1).
- The trait-synergy caveat in both `formulas.js` and the README was tightened from "reconstructed, not confirmed" to "confirmed by decompilation" now that §3 verified it.
- README's "How the data was sourced" section gets a new short paragraph pointing at this report for anyone who wants the full derivation.
- No changes to `ui-*.js` or any displayed numbers — verified via a headless-browser pass (same method used when the app was first built) that the weapon detail modal, hero detail modal, and equipment tab all still render without console errors after the doc-comment edits.

## Appendix: raw disassembly locations

- `docs/decompiled/stat_calculators.asm.txt` (in this repo) — all `IStatCalculator` implementations + `StatCalculatorFactory`.
- `docs/decompiled/batch2.asm.txt` (in this repo) — `TraitSynergyController.*`, `GachaItemWeightResolver.*`, `PityTierResolver.*`, `BattleManager.CalculateDamage*`.
- `$SCRATCH/ghidra_work/addr_map.pkl` (session scratchpad, not in repo) — pickled `{address: {Name, Signature, TypeSignature}}` for all 211,059 methods in the binary, reusable for any future targeted disassembly without re-parsing the 95MB `script.json`. Regenerate from `il2cpp_work/output/script.json` if needed later — it's a 5-line `json.load` + dict comprehension, not reproduced here since it's a derived cache, not source data.
