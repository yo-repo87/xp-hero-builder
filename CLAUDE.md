# XP Hero Builder — Project Reference

This file exists so a future session (this one after context compaction, or a
fresh one) can reconstruct full context from disk instead of the user
re-explaining or re-spending tokens. Written 2026-09-04. Update it as the
project evolves — don't let it go stale.

## What this project is

A fan-made, unofficial companion web app for the mobile game **XP Hero:
Weapon RPG** (`io.supercent.weaponrpg`, publisher Supercent; internal
codename **DevilHunterIdle**). User (GitHub `yo-repo87`, personal email
`mgibson041387@gmail.com`) plays the real game and wants a browser tool that
mirrors their actual in-game account state (heroes, weapons, traits,
upgrades) so they can plan builds and get advice.

- **Live site:** https://yo-repo87.github.io/xp-hero-builder/
- **Repo:** https://github.com/yo-repo87/xp-hero-builder (**public** — see
  Risk Accepted below)
- **Local path:** `/home/pi/Claude/HeroBuilder`
- Static HTML/CSS/vanilla-JS, no build step, no backend. State lives in
  `localStorage` + JSON import/export.

## Risk accepted — read before touching anything art-related

This repo embeds **real sprites ripped from the game's APK** (weapon/hero
icons, item icons, enemy portraits, chest icons — see `assets/img/`). This
was flagged to the user as a real copyright/DMCA risk **twice**, explicitly,
via `AskUserQuestion`, and both times the user chose to proceed anyway and
publish the repo **publicly** (not private). This is a known, accepted,
already-made decision — do not re-litigate it or "fix" it by stripping art
unless the user asks. If the user ever asks to reduce exposure, the honest
options are: make the repo private, or swap ripped art for original
placeholder art (was offered originally, declined).

## How the source data was obtained (methodology, for future extraction work)

The user provided a signed download URL for the APK once, at the start of
this project. It was downloaded, unpacked (`.apks` → `base.apk` +
`split_config.arm64_v8a.apk`), and mined via:

1. **IL2CPP metadata + decompilation** — `Il2CppDumper` against
   `lib/arm64-v8a/libil2cpp.so` + `global-metadata.dat` gave full C#
   class/method/field **signatures** (not bodies) for the whole game
   (`Assembly-CSharp.dll`, namespace root `DevilHunterIdle.*`,
   shared framework `Supercent.*`). For actual method **bodies** (real
   formulas), this machine turned out to be a **shared host near its RAM
   limit** (other live services: Plex, Emby, Docker, n8n) — running Ghidra's
   headless analyzer was judged too risky (OOM risk to services not owned by
   this session), so targeted functions were hand-disassembled with
   `capstone` instead (near-zero memory), using `dump.cs`'s RVA/Offset
   annotations + a sorted map of all 211,059 method addresses from
   `script.json` to resolve call targets to real names. **If Ghidra is
   available/safe in a future environment, prefer it** — capstone-by-hand
   is slower per function. Full writeup + raw disassembly:
   `docs/game_logic_deep_dive.md`, `docs/decompiled/*.asm.txt` (committed).

2. **Unity asset extraction** — `UnityPy` against the ~8,300 serialized
   files under `assets/bin/Data/` in the APK. This is how every `data/*.json`
   table and every image in `assets/img/` was obtained — table schemas were
   read directly from each TextAsset's own embedded schema row (never
   assumed), localized strings resolved against the game's own `Locale`
   table (3,543 rows, 11 languages), and sprites exported via `Sprite.image`
   (correctly atlas-cropped).

3. **Android/dex layer** — `androguard` against the dex files. Confirmed the
   whole Java/Kotlin layer is 100% third-party SDK glue (ad mediation,
   analytics, billing) with **zero custom game code** — the entire game is
   Unity/IL2CPP. Not really relevant to this app's ongoing work, but
   explains why nothing here looks at the dex layer.

**⚠️ Ephemeral scratch data**: all raw extraction artifacts (the full
`dump.cs`, `stringliteral.json`, `script.json`, the raw ~8,300-file Unity
asset tree, `catalog.json`, and the original 3 deep-dive analysis reports)
live under a **session-specific scratchpad**, not in this repo:
```
/tmp/claude-1000/-home-pi-Claude-HeroBuilder/02f52606-3961-4ca8-b582-5f08d0f66961/scratchpad/
  unpack/                 the unpacked APK (base.apk, split apk)
  il2cpp_work/            Il2CppDumper output + capstone disassembly work
    output/dump.cs          1M-line full signature dump (grep this for RVAs)
    output/stringliteral.json   ~122K string literals from the compiled game
    output/script.json      method address -> name map (211,059 entries)
  unity_work/
    textassets/            all 152 game-data tables as raw schema-row JSON
    data/                  the raw ~8,300-file Unity SerializedFile tree
                            (re-scan target for pulling more art/data later)
    catalog.json            object census from the original full scan
  reports/                the 3 original deep-dive reports (Android/SDK,
                           IL2CPP, Unity assets) — broader than what ended
                           up in this app; useful background reading
```
**This directory will not exist in a future session.** If it's gone and more
extraction is needed, the APK itself is also gone (signed URL, long expired)
— you'd need the user to provide a fresh download link and redo extraction.
Treat everything already converted into `data/*.json` and `assets/img/` in
this repo as the durable record; don't assume you can re-derive more without
a fresh APK.

## Architecture

```
index.html
css/style.css              one dark-fantasy design system, rarity-color-driven
js/
  data.js                  loads data/*.json, builds all lookup indices (Game.index.*)
  formulas.js               stat-calculation logic — every formula has an inline
                             comment stating whether it's CONFIRMED (by decompilation),
                             a reasoned 'mapped' best-effort, or a flagged approximation
  state.js                  user's build (State.data), localStorage, import/export
  ui-common.js               modal/toast helpers, rarity color/tag helpers
  ui-weapons.js               Weapons tab: 6 slots + picker/upgrade modal
  ui-heroes.js                Heroes tab: roster + picker + enhance modal
  ui-equipment.js             Equipment tab: traits (2x5 slots) + 4 upgrade trees
  ui-farmable.js               Farmable Items tab: item catalog + drop sources + stage map
  ui-guide.js                  Guide tab: per-hero advice engine + Total DPS estimate
  ui-importexport.js           save-file download/upload
  app.js                     bootstrap: Game.load() -> State.init() -> renderAll()
data/*.json                 42 extracted, typed, English-labeled game-balance tables
assets/img/weapons/          84 icons, filename = WeaponData.id
assets/img/heroes/           24 icons, filename = CostumeData.id
assets/img/items/            47 icons, filename = StackableItemData.PackageIcon
assets/img/enemies/          154 portraits, filename = EnemyData.IconSprite
assets/img/chests/           3 icons, filename = ChestData.PrefabName
docs/game_logic_deep_dive.md  decompilation writeup (formulas, confidence levels)
docs/decompiled/*.asm.txt     raw annotated AArch64 disassembly
```

Rendering pattern throughout: **full re-render on every state change** (no
diffing/virtual DOM). `State.notify()` → every `*UI.render()` re-runs. This
is simple and was a deliberate choice for a small app; don't "optimize" it
without reason.

## Data provenance & confidence — read before trusting a number

Every formula in `formulas.js` is commented with its confidence level. The
short version:

| System | Status |
|---|---|
| Weapon base DPS (`base + perLevel*(level-1)`) | Real data (`BalancingData_Rarity`), but confirmed to be only the `Weapon` slice of the real account-wide `Dps` stat, not the full number (`WeaponLevelBonus` is now its own confirmed source — see next row) |
| Weapon Level-Up Bonuses (fixed, up to 8 per weapon fusion chain) | **Confirmed by decompilation**, corrected 2026-09-04 (`RegistWeaponLevelBonus`, RVA `0x2796544`) — a completely separate mechanic from the random-roll "Bonus Affixes" (`WeaponBonusOptionData`/`BonusOptionCount`, sibling function `RegistWeaponBonusOption`). Unlock gate is the weapon's own LEVEL crossing `BalancingData_Rarity.Get(row.Rarity,1).MaxLevel`, not fused rarity (first-pass guess was wrong — corrected same day per a direct user report). See chronological log entries below. |
| Hero base stats (level/star/evolution) | Real data, checkpoint-interpolated where needed |
| Hero bonus stat labels (Level/Star/Evolution "Stat Bonuses Unlocked", Guide tab "Recommended Stat Focus") | **Fixed 2026-09-04** — these OptionType fields are `E_BonusOption`-typed in the compiled game (confirmed by decompilation), not `StatData`'s id space; the two only agree at id 1. Now uses `BONUS_OPTION_NAMES` (data.js), sourced from the real `HERO_BONUS_OPTION_*` Locale strings. |
| Hero Evolution bonus value | **Fixed 2026-09-04** by decompilation (`AddOwnEvolveStatModifications`) — was wrongly modeled as cumulative-sum across every reached tier; the real client does a single lookup at the exact current tier (`GetByCostumeAndRarity`) and multiplies its `OptionValue` by 10. |
| Trait synergy token-counting | **Confirmed correct by decompilation** (`TraitSynergyController.CalculateSynergyTokens`) |
| Trait/synergy percent display (Equipment tab) and `TraitRoll` Dps source | **Fixed 2026-09-04** — `rate_amount` (`TraitOptionData`, `TraitSynergyInfoData`) is per-mille (confirmed by decompiling `TraitSynergyController.GetStatModifications`), the same convention as Extra/Special/SoulUpgrade's `RateAmount`. Display now divides by 10 uniformly (replacing a guessed, inconsistent ">100 ? /100 : /1" heuristic); the Dps formula's `TraitRoll` source uses the raw value directly (no ×10 — that had been an unverified guess borrowed from the RateAmount fix and was wrong). |
| Total DPS estimate (Guide tab) | Formula **shape confirmed** by decompiling `DpsStatCalculator`; individual source→data mappings are tagged `confirmed`/`mapped`/`manual`/`unmodeled` right in the UI (see `Formulas.totalDpsBreakdown`). `WeaponLevelBonus`, `CostumeOwnEvolutionOption`'s underlying data, and `TraitRoll` are now `confirmed`; `CostumeOwnGradeOption`/`CostumeOwnLevelOption` remain `unmodeled` — their real source functions (`AddOwnGradeStatModifications`/`AddOwnLevelStatModifications`) were found but route through interface/vtable dispatch that wasn't fully traced by hand; left honestly at 0 rather than guessed. |
| Special Upgrade level caps | **Fixed 2026-09-04** per direct user report against the live game: uniform `grade * 10` across all stat types, NOT the per-type `SpecialUpgradeTypeData.MaxLevelDatas` table (that table's cumulative values were internally consistent but simply not what the game displays — see commit `5305f6f`) |
| Special Upgrade type unlock gating (6 of 11 stat types don't exist until a later Altar Grade) | **Confirmed by decompilation** 2026-09-04 (`SpecialUpgradeManager.GetUnlockGrade`, RVA `0x250D6F0`) — previously unmodeled entirely (all 11 types were shown upgradable from grade 1). `MaxLevelDatas`'s zero-vs-nonzero pattern (the same field whose exact cap *numbers* were already known-wrong, see row above) is genuinely read by the real client to find each type's first-available grade. `Formulas.specialUnlockGrade()` + locked-card UI added. |
| Farmable Items sources | Only 4/56 catalog items (Gold, BlueStone, EXP, Wood) have a confirmed source. This is real, not a bug — only chest drop tables (`ChestData`→`RewardGroupData`) and guaranteed boss kills (`MinimapRewardData`) resolve without guessing. Shop, missions, quests, chapter-clear rewards, and boss raids were **not** explored as reward sources. |
| Combat damage formula (not used by app) | Mostly confirmed structurally; two basic-attack-only normalizer values in `CalculateDamageInternal` were left unidentified rather than guessed |

**General rule this project follows**: if a table→formula mapping can't be
confirmed or cleanly inferred, the app shows it as zero/unmodeled/manual
input with an explanation, rather than presenting a guess as fact. If you
extend this app, keep that norm — the user has corrected wrong assumptions
before (Special Upgrade caps) and values honesty over completeness.

## Git / deploy

- Local git identity is **repo-scoped** (not global): `user.name yo-repo87`,
  `user.email 317706226+yo-repo87@users.noreply.github.com`. This was set
  deliberately after the user provided a GitHub token; global git config was
  never touched (that's a hard rule regardless of context).
- `gitkey` in the repo root is a GitHub fine-grained PAT for account
  `yo-repo87`, used to create the repo and push. It's `.gitignore`d — never
  commit it. To push: `export GH_TOKEN=$(cat gitkey)` then normal git/gh
  commands.
- Deploys via GitHub Pages (branch `main`, root). **After every push, Pages
  takes ~1-2 minutes to rebuild** — a 404 right after pushing is normal, not
  a bug; it resolves itself.

## Chronological summary of work done

1. Downloaded + unpacked the APK; deep-dive analysis across 3 parallel forks
   (Android/SDK layer, IL2CPP signatures, Unity asset content) → published as
   an Artifact teardown report (not part of this repo).
2. User asked for a character-builder web app. Clarified two things upfront
   via `AskUserQuestion`: real ripped art vs. placeholder art (chose real,
   accepted risk), and repo push flow (chose build-locally-then-push).
3. Built the full app: Weapons tab (6 slots, picker/upgrade modal), Heroes
   tab (roster, picker, enhance modal), Equipment tab (traits + 4 upgrade
   trees), Guide tab (per-hero advice engine), import/export. All data/art
   extracted fresh via a dedicated fork, verified end-to-end with a headless
   Playwright pass at every stage (this is the standing QA method for this
   project — screenshot + zero-console-errors check before calling anything
   done).
4. User asked to "deep dive into the game logic" — triggered the
   Ghidra→capstone decompilation pass described above, confirming/correcting
   several formulas and updating the app's caveats to match.
5. User asked to wire the confirmed whole-account `Dps` formula into the app
   for real (not just better caveats) — added the Total DPS estimate panel
   to the Guide tab, with full per-source transparency.
6. Set up GitHub: token discovered (`gitkey`), confirmed target
   account/repo/visibility explicitly via `AskUserQuestion` (user chose
   public), created+pushed the repo, enabled Pages.
7. Added the Farmable Items tab: item catalog + drop-rate/location lookup +
   a stage-progression "map" popup (no real map-coordinate data exists in
   the game's assets, so this honestly uses the real chapter/stage list with
   the item's own icon pinned on the actual source stage(s), not a
   fabricated terrain map).
8. User reported the Special Upgrade grade-2 cap was wrong (20, not 15).
   Root-caused via full empirical re-derivation of `SpecialUpgradeLevelData`
   (found `MaxLevelDatas` was the wrong table entirely — real cap is uniform
   `grade*10`), fixed, verified, shipped.
9. User asked to reskin the UI to match the real game's menus. No screenshots
   were available (user explicitly declined to provide any — asked once via
   `AskUserQuestion`, proceed with extracted-assets-only per their answer);
   instead extracted 755 real UI chrome sprites (buttons, panels, frames,
   gauges, rarity circle/ribbon/grade art, star icons, etc.) via a dedicated
   fork — manifest at `assets/img/ui/MANIFEST.md`, real 9-slice border insets
   read straight from each sprite's Unity metadata at
   `assets/img/ui/nine-slice.json` (not guessed). Also discovered from the
   game's own Locale table that the real rarity tier names/order are Normal,
   Fine, Rare, Epic, Legendary, Ancient, Mythic, Exotic, Eternal (1-9) —
   corrected `RARITY_COLORS` in `data.js`, which had invented wrong names.
   Rebuilt `css/style.css` around a warm brown/parchment palette (colors
   sampled from the real textures, not invented) with `border-image`-based
   9-slice buttons/panels, the game's real display font (`BakbakOne`, a
   legitimate open Google Font that happens to be what the game itself
   uses), and real star icons/rarity chrome wired into every tab via a new
   `rarityStyle()`/`rarityStar()` helper in `ui-common.js`. All existing
   class names were kept so the JS structure barely changed — this was
   almost entirely a CSS + asset-extraction effort, not a rewrite. Caught
   and fixed a real pre-existing bug along the way (unrelated to the reskin,
   found by chance while testing it): `WeaponCategoryData.Class_OptionType`
   comes through as a bare string for Sword specifically (every other
   category has it as a number array), silently breaking two features that
   read it (`Formulas.totalDpsBreakdown`'s `CostumeEquipMainWeaponBonusOption`
   source, and the Guide tab's "Recommended Stat Focus" advice, which
   rendered a fully empty `<ul>` for any Sword-leaning loadout).
10. User came back with 7 real phone screenshots of their own account (via
    Google Drive share links — plain `curl`/anonymous-browser access got a
    sign-in wall even with "anyone with the link" sharing, which resolved
    itself once the user re-shared; a `usp=sharing` link opened directly in
    a fresh Playwright browser context, and the actual images were pulled
    via `ctx.request.get()` on the page's real `<img src>`, upsized by
    editing the `=w####-h####` suffix Google's image-serving CDN uses).
    **These screenshots were not committed anywhere** — they show the
    user's real account (level, currency balances, actual roster), not just
    generic game UI, and the repo is public. Findings were written up here
    instead. What they showed, and what changed as a result:
    - The **Equipment screen** flanks the character preview with 3 weapon
      slots on each side (not a plain 6-across row like this app had), each
      slot a pink/salmon rounded-square with a level badge, and the
      top-left slot marked "MAIN". Rebuilt `ui-weapons.js`/`.weapon-slot` to
      match — `.equip-rig`/`.equip-col`/`.equip-center` in `style.css`, with
      the active hero's portrait standing in for the real screen's 3D
      character model in the center (no 3D asset exists to actually render
      one). Found and fixed a real bug in the process: the new `--ring-img`
      custom property (rarity circle art) was 404ing everywhere because
      `url()` inside a CSS custom property resolves relative to the
      *stylesheet that consumes it* (`css/style.css`), not the HTML page
      that sets the property inline — `Game.rarityCircle/rarityRibbon/
      rarityGrade` in `data.js` needed a `../` prefix that plain `<img src>`
      paths (`weaponIcon` etc.) don't; this had been silently broken since
      the original reskin pass and nothing had actually surfaced it as a
      visible bug before now.
    - The **Upgrades screen** (Ability/Special/Extra tabs) is a stacked list
      of wide horizontal rows — icon in a colored slot on the left (brown
      for Ability, indigo for Special, magenta for Extra — Soul wasn't in
      any screenshot, given its own teal accent by inference), title/desc/
      "current › next" value in the middle, stepper on the right — not the
      card grid this app had. Rebuilt as `.upgrade-row` in both
      `ui-equipment.js` and `style.css`; also added a real "current › next"
      preview (this app already had the data for it via `abilityRow`/
      `extraRow`/`specialRow`/`soulRow` at level+1, just wasn't showing it).
    - The **hero detail screen** has three real tabs — "Level Up", "Upgrade"
      (= star grade), "Evolve" — confirmed this app's three mechanics map
      1:1 to those, just needed the real names/icons (⬆/★/👑). Its per-level
      bonus list is a stacked pill style, not a stat grid — adopted that for
      "Stat Bonuses Unlocked" (`.milestone-row`). One thing from the
      screenshot deliberately **not** copied: some of the real game's
      milestone rows carry an "ALL HERO" tag (account-wide bonuses vs.
      hero-specific ones) — this app's own bonus list is built entirely
      from this hero's own `CostumeLevelOptionData`/etc., which are already
      hero-specific by construction, so tagging them "ALL HERO" would have
      been factually wrong. Caught before shipping, not after.
    - The **Traits screen** turned out to run on a completely different
      *blue* color theme, not brown/parchment — deliberately left
      unmatched (documented below) rather than fragmenting the app's visual
      identity into a per-tab patchwork on the strength of one screenshot.
11. User compared the Extra tab against their live account and caught a real
    data bug (not a reskin/layout issue): every Extra/Special/Soul upgrade
    percent was showing exactly **10x too high** (Bulk Up: 48% here vs. the
    real game's 4.8% at the same level). Root cause: `RateAmount` in
    `ExtraUpgradeLevelData`/`SpecialUpgradeLevelData`/`SoulUpgradeLevelData`
    is stored at 10x the displayed percent (verified: Level 8 Bulk Up has
    `RateAmount=48`, real screen shows 4.8%) — the app had assumed it was
    the plain percent already. Fixed the display (÷10) in all three trees.
    Since `Formulas.totalDpsBreakdown` reads this exact same field for its
    `SpecialUpgrade`/`ExtraUpgrade`/`SoulUpgrade` sources, the bug was live
    there too, just in the *opposite* direction — it had been multiplying
    by 10 to convert an assumed "plain percent" into per-mille, but
    `RateAmount` turns out to already **be** per-mille-scale, so the fix
    there was to remove the ×10 entirely, not flip its sign. `TraitRoll`'s
    source (`TraitSynergyInfoData.rate_amount` — a different table) was
    deliberately left untouched — no screenshot evidence either way on
    whether it shares this same 10x convention, and after two units bugs in
    a row in this exact area, guessing a third time felt like the wrong
    instinct. If that one turns out wrong too, it needs its own real
    evidence to fix, not an assumption borrowed from this fix.
12. User reported that the Weapons tab's bonus-effect editor only let them
    add up to 2 (or 3) bonus effects, while their real weapon shows more.
    Investigation found this wasn't a cap bug — it was two genuinely
    different game mechanics that had been conflated. The app only ever
    modeled the RANDOM roll system (`WeaponBonusOptionData` pool +
    `BalancingData_Rarity.BonusOptionCount`, correctly capped at 1-3
    depending on rarity/grade — this is real and stays as-is, relabeled
    "Rolled Bonus Affixes" for clarity). What the user was actually seeing
    in-game is a **second, separate, fully deterministic mechanic** that had
    never been extracted or wired in at all: `WeaponLevelUpBonusGroup` (96
    rows, newly extracted from the scratchpad's raw Unity asset tree since
    it wasn't among the original 41 tables — labels resolved from the same
    real `Locale` table used everywhere else). Every weapon carries a fixed
    `LevelUpBonusGroup` shared by its *entire fusion chain* (e.g. Crude
    Dagger through Absolute Radiance all share `GroupID 1`); that group has
    one row per rarity tier (typically 1-8), each a fixed, non-random bonus
    stat that unlocks permanently once the weapon is fused to that rarity —
    cumulative across the whole chain, up to 8 unlocked at once, not capped
    at 2. **Confirmed by hand-disassembling the real compiled function**
    (`RegistWeaponLevelBonus`, RVA `0x2796544`, called via
    `WeaponData.LevelUpBonusGroup` at struct offset `0x6C`): it walks
    `WeaponLevelUpBonusGroup.GetGroupList(groupId)`, keeps every row whose
    `Rarity <= ` the weapon's current fused rarity (proving unlocks are
    cumulative, not "current tier only"), further gates some rows by
    `SlotType` (0 = any slot, 1 = main-hand/slot-0 only, 2 = the five
    secondary slots only — confirmed by the same function branching on
    `slotIndex==0`), and sums each unlocked row's `Amount × 1000` directly
    into per-mille math. This also let a real gap get closed with actual
    evidence instead of a guess: the confirmed real `Dps` formula (see
    `docs/game_logic_deep_dive.md`) has always listed `WeaponLevelBonus` as
    one of its 17 sources, but `Formulas.totalDpsBreakdown` had it wired to
    a guess (`WeaponDPS_LevelUpAdd * (level-1)`, tagged `mapped`) — replaced
    with the real formula above and upgraded to a new `confirmed` tag (added
    to the Guide tab's source-tagging vocabulary, alongside the existing
    `mapped`/`manual`/`unmodeled`). Shipped: `data/WeaponLevelUpBonusGroup.json`
    (new table), `Formulas.weaponLevelBonusRows()` (new), the weapon detail
    modal's new "Level-Up Bonuses" list (auto-computed, shows locked *and*
    unlocked rows so the user can see what's still ahead in the fusion
    chain — no manual "add" UI at all, since none is needed for a
    deterministic mechanic), and the `totalDpsBreakdown` fix.
13. User reported a concrete counter-example against entry #12's Level-Up
    Bonuses feature the same day: their real, un-fused "Relic Beam" (still
    at its original rarity) already had Lv10 Attack+1%, Lv20 LifeSteal+2%,
    and Lv30 HP+2% all unlocked — impossible under entry #12's "gated by
    fused Rarity" model. Re-disassembled `RegistWeaponLevelBonus` more
    carefully and found the actual comparison: it calls
    `BalancingData_Rarity.Get(row.Rarity, grade=1).MaxLevel` (row.Rarity is
    just an index into the grade-1 level-curve table, always grade 1
    regardless of the weapon's own grade) and compares that threshold
    against `WeaponStatus.Level` (the `_originLevel` backing field, struct
    offset `0x18` — not the weapon's Rarity as originally misread). So
    row.Rarity=1 really means "unlocks at weapon level 10", row.Rarity=2
    means "level 20", etc. — exactly matching the user's report. Fusing to
    a higher rarity is still what makes the higher rows *reachable* (each
    rarity has a hard level cap in `BalancingData_Rarity.MaxLevel`), but the
    runtime gate itself is purely level-based. Fixed
    `Formulas.weaponLevelBonusRows()` to take the weapon's current level and
    check it against each row's threshold instead of checking fused Rarity;
    updated the weapon detail modal's "Level-Up Bonuses" list to show
    "unlocks at Level N" instead of a rarity name; updated
    `totalDpsBreakdown`'s `WeaponLevelBonus` source to pass the weapon's
    real level through. This is the kind of thing that's genuinely hard to
    get right from static disassembly alone without a live counter-example
    to check against — worth remembering if similar "which condition gates
    this" mechanics come up again.

    The same conversation also asked for a broader audit: "list anything
    else not deep-dived and check whether it feeds wrong data to the page."
    That pass used the same disassembly technique across every remaining
    unverified `OptionType`/`rate_amount`/percent field in the hero and
    trait systems, and found four more real, previously-shipped bugs (not
    hypothetical — all four were live on the deployed site):
    - **Hero bonus labels used the wrong enum.** `CostumeLevelOptionData`,
      `CostumeStarGradeOptionData`, `CostumeEvolutionData`, and
      `WeaponCategoryData.Class_OptionType` are all declared `E_BonusOption`
      in the compiled game (22 values: Attack, CritDamage, LifeSteal,
      SkillCooldown, HP, HPRegen, Dodge, MoveSpeed, CritRate, AttackSpeed,
      Cargo, SkillDamage, DoubleAttack, TripleAttack, Coin, Exp, ...) — a
      completely different, differently-numbered table from `StatData`,
      which is what the app had been using to label them. The two only
      agree at id 1 (Attack/Power); everywhere else they diverge. Concrete
      visible symptom: the Guide tab's "Recommended Stat Focus" showed
      **"CARGO"** as a natural strength for the Gun weapon category —
      StatData id 12 is Cargo, but `E_BonusOption` 12 is really Skill
      Damage, which is obviously the intended reading for a Gunslinger.
      Cross-checked all 6 weapon categories' real `Class_OptionType` values
      against both enumerations before concluding — the `E_BonusOption`
      reading was thematically sound for every single one (Bruiser→HP,
      Marksman→AttackSpeed/CritRate, Mage→SkillDamage/SkillCooldown) where
      the `StatData` reading produced nonsense for at least two of them.
      Fixed by adding `BONUS_OPTION_NAMES` to `data.js` (real
      `HERO_BONUS_OPTION_*` Locale strings for this exact enum) and
      switching both the Heroes tab's "Stat Bonuses Unlocked" list and the
      Guide tab's stat-focus lookup to it.
    - **Hero Evolution bonus was both mis-summed and unscaled.** It was
      modeled as a cumulative sum across every evolution tier reached
      (mirroring how Level and Star bonuses work), but the real function
      (`AddOwnEvolveStatModifications`) does a single lookup at the *exact
      current* tier only (`CostumeEvolutionData.GetByCostumeAndRarity`) —
      confirmed by the data itself once looked at closely: every costume's
      evolution rows count their own `OptionValue` up 1, 2, 3...7 in
      lockstep with row position regardless of `OptionType`, which is a
      checkpoint-magnitude pattern, not a delta-to-be-summed pattern. The
      disassembly also showed the value gets ×10 before use, which the app
      wasn't doing. Both bugs together meant a mid-evolution hero's
      "Stat Bonuses Unlocked" total and the Total DPS estimate's
      `CostumeOwnEvolutionOption` source were both wrong (direction depends
      on how far evolved — could be too high or too low depending on tier).
    - **`TraitRoll`'s ×10 was itself an unverified guess, and it was
      wrong.** Entry #11 fixed Extra/Special/Soul's `RateAmount` (real
      display = stored value ÷10) but left `TraitRoll`'s `×10` (the
      opposite direction, on a different table, `TraitSynergyInfoData`)
      "pending real evidence" rather than assuming it shared the fix.
      Decompiling `TraitSynergyController.GetStatModifications` (not just
      the token-counting logic already confirmed in an earlier pass) shows
      `rate_amount` is read straight into the StatModification value for
      the `TraitRoll` content type with no multiply anywhere in the path.
      Removed the ×10.
    - **The Traits tab's own percent display was a separate, wronger bug.**
      Both `TraitOptionData.rate_amount` (single rolled trait) and
      `TraitSynergyInfoData.rate_amount` (stacked synergy bonus) were
      displayed through a guessed, undocumented heuristic —
      `rate_amount > 100 ? rate_amount/100 : rate_amount` — that also
      silently dropped the `%` sign above 100. It produced genuinely broken
      output (a rarity-3 trait showed a bare "1.2" with no unit). The
      `TraitRoll` finding above establishes that `rate_amount` is per-mille
      across both trait tables (same convention as
      Extra/Special/SoulUpgrade's `RateAmount`), and both description
      templates (`option_info_desc_en` / `synergy_info_desc_en`) already
      bake a literal `%` into their `{0}%` format string. Replaced the
      heuristic with a uniform ÷10 in all three call sites in
      `ui-equipment.js`.
    `CostumeOwnGradeOption`/`CostumeOwnLevelOption` were also investigated
    (their real source functions, `AddOwnGradeStatModifications`/
    `AddOwnLevelStatModifications`, were located) but not resolved — unlike
    every function fixed above, these route through IL2CPP interface/vtable
    dispatch that would take meaningfully longer to trace by hand. Left
    `unmodeled` rather than guessed, consistent with this project's norm.
14. User asked to specifically check for other "level-based unlock" gates
    like the weapon one (entry #13), across every stat/effect/ability
    system. Swept every remaining type-catalog table (Ability, Extra,
    Special, Soul upgrade types; hero skill list) for an unlock-condition
    field. Found one real, previously-unmodeled gate: **6 of the 11 Special
    Upgrade stat types don't exist at Altar Grade 1** — FAST HEAL/LUCKY
    PUNCH need grade 2, DUAL TRIGGER/SKILL DAMAGE need grade 3, TRIPLE
    EDGE/SKILL COOLDOWN RATE need grade 4. The app had been showing all 11
    as upgradable from grade 1. Confirmed by disassembling
    `SpecialUpgradeManager.GetUnlockGrade` (RVA `0x250D6F0`): it calls
    `SpecialUpgradeTypeData.GetGradeMaxLevel(grade)` for grade 1, 2, 3...
    and returns the first grade whose `MaxLevelDatas` entry is nonzero —
    e.g. FAST HEAL's `MaxLevelDatas` is `[0,10,25,45]`, so grade 1's entry
    being 0 means it isn't unlocked yet. This is the SAME field whose exact
    cap *numbers* were already known to be wrong (entry #8, fixed to a flat
    `grade*10`) — but the zero/nonzero *pattern* turned out to be a
    completely separate, still-valid fact encoded in the same column;
    fixing the wrong numbers didn't mean the whole field was noise. Added
    `Formulas.specialUnlockGrade()` (returns the first grade with a nonzero
    `MaxLevelDatas` entry) and folded it into `specialMaxLevelForGrade`
    (returns 0 below the unlock grade). `ui-equipment.js`'s Special tab now
    shows locked types with a "🔒 Unlocks at Altar Grade N" row instead of
    a stepper. Checked every other tree for the same pattern and found
    nothing else: Ability/Extra/Soul upgrade TypeData tables carry no
    grade/tier field at all (just a flat per-type level curve, no unlock
    gate), and the hero skill list (`Costume_Skill_List`) has no unlock
    condition table wired in but was already disclosed as raw IDs with an
    explicit "not surfaced in this build" caveat — not a wrong-data bug,
    just a pre-existing known gap.

## Open items / plausible next steps (not started)

- Expand Farmable Items coverage beyond the 4 currently-confirmed items —
  would need to explore shop/mission/quest/chapter-reward/boss-raid systems'
  `RewardGroupData` associations (the reward-group resolution mechanism
  itself is understood and working; it's the *other* systems' group IDs
  that haven't been mapped).
- `BlessingBuffData` was extracted (`data/BlessingBuffData.json`) but never
  wired into anything — 3 buff types, unclear which (if any) maps to a stat
  the app tracks.
- `VipSubscription` source in the Total DPS formula has no matching data
  table at all — stays a manual input unless one is found.
- `CostumeOwnGradeOption`/`CostumeOwnLevelOption` in the Total DPS formula
  are deliberately zeroed. Their real source functions ARE now known
  (`AddOwnGradeStatModifications`/`AddOwnLevelStatModifications`, found
  2026-09-04) but not disassembled to completion — they route through
  IL2CPP interface/vtable dispatch (indirect calls resolved through a type
  interface table at runtime), which takes meaningfully longer to trace by
  hand than the direct-call functions fixed the same day. Worth revisiting
  with more time/budget rather than assumed to be unreachable.
- If re-extracting art/data ever becomes necessary and the scratchpad is
  gone, you need a fresh APK download link from the user first.
- Reskin polish not done: native `<input type=range>` sliders (weapon/hero
  level, star grade) still use the browser's default track styling, not a
  real `Gauge_*` texture — `.rt-gauge`/`.rt-gauge-fill` classes exist in
  `style.css` for this but nothing wires them to the actual slider elements
  yet. The real bottom-nav tab icons (`assets/img/ui/misc_tab/Button_Tab_*`)
  were deliberately **not** used for this app's 5 tabs — they're 4 specific
  icons for whatever real menu items they represent, not a generic
  4-or-5-tab template, and forcing them onto mismatched tabs would be
  actively misleading rather than authentic.
- The Traits tab still uses the app's one brown/parchment theme, but the one
  real screenshot seen of it shows the actual game runs that screen on a
  completely different *blue* theme. Deliberately not chased — matching it
  would mean guessing how many *other* unseen screens also have their own
  bespoke theme, and fragmenting this app's visual identity on the strength
  of a single data point seemed worse than staying internally consistent.
  Revisit if more screenshots of Traits (or other screens) surface.
- The Weapons tab's center "hero preview" is a 2D portrait standing in for
  the real screen's animated 3D character model — there's no 3D asset to
  actually render one, so this is the closest honest equivalent, not a
  literal copy.
- 7 screenshots of the user's own account were used to correct layout for
  Equipment, Upgrades, and the hero detail screen (see chronological log
  entry 10) — not committed to the repo (personal account data, public
  repo). If the user provides more screenshots later, the biggest unseen
  gaps are: the Farmable Items tab has no real-game equivalent to compare
  against at all (it's this app's own invention, not a screen the game
  has), and the Guide tab similarly has no real analog.
