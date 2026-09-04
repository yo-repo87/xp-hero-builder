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
data/*.json                 41 extracted, typed, English-labeled game-balance tables
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
| Weapon base DPS (`base + perLevel*(level-1)`) | Real data (`BalancingData_Rarity`), but confirmed to be only the `Weapon`+`WeaponLevelBonus` **slice** of the real account-wide `Dps` stat, not the full number |
| Hero base stats (level/star/evolution) | Real data, checkpoint-interpolated where needed |
| Trait synergy token-counting | **Confirmed correct by decompilation** (`TraitSynergyController.CalculateSynergyTokens`) |
| Total DPS estimate (Guide tab) | Formula **shape confirmed** by decompiling `DpsStatCalculator`; individual source→data mappings are best-effort (each tagged `mapped`/`manual`/`unmodeled` right in the UI — see `Formulas.totalDpsBreakdown`) |
| Special Upgrade level caps | **Fixed 2026-09-04** per direct user report against the live game: uniform `grade * 10` across all stat types, NOT the per-type `SpecialUpgradeTypeData.MaxLevelDatas` table (that table's cumulative values were internally consistent but simply not what the game displays — see commit `5305f6f`) |
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
  are deliberately zeroed (no data source distinct from the `Equipping`-
  prefixed ones already used) — revisit if a relevant table turns up.
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
