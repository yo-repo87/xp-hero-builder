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
- Static HTML/CSS/vanilla-JS, no build step, still deploys via GitHub
  Pages — **but as of 2026-09-30 this is no longer a purely serverless
  app**. Two deliberate backend exceptions exist, both fully optional
  (the site works completely without either):
  1. Crowd-sourced Farmable Items reports (added 2026-09-29) go through a
     small self-hosted n8n webhook + Data Table, shared across every
     visitor. See "Community Reports backend" below.
  2. Optional user accounts + cross-device save persistence (added
     2026-09-30) — a real dedicated Node/Express backend
     (`server/`) talking to a Postgres database on the user's own
     `shared_postgres` container, with email/password login plus
     Google/Facebook/Discord OAuth (all four now live in production, set
     up incrementally through 2026-09-30 — see "Accounts backend" below
     for exactly what and when). This is a genuinely different scale of
     addition from #1 (a whole standalone service + database, not a
     couple of webhooks) and is
     documented there in full.
  Everything else in the app remains fully static/client-only.

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
  ui-farmable.js               Farmable Items tab: item catalog + drop sources
  ui-monsters.js               Monsters tab: full bestiary, chapter + boss/non-boss filters
  ui-map.js                    MapUI (shared "View Map" popup, real in-game minimap — see
                                below, used by Farmable Items + Monsters), SpawnMapUI
                                (real enemy spawn-position scatter view, Monsters only —
                                see "Enemy spawn points" below; a deliberately separate
                                coordinate system from MapUI, not the same map), and
                                GiftChestMapUI (in-world gift chest spawn points,
                                Farmable Items only — see "Gift Chest spawn map" below;
                                reuses SpawnMapUI's board-as-backdrop technique)
  ui-guide.js                  Guide tab: per-hero advice engine + Total DPS estimate
                                + Next Best Upgrade advisor
  ui-importexport.js           save-file download/upload
  app.js                     bootstrap: Game.load() -> State.init() -> renderAll()
data/*.json                 71 extracted, typed, English-labeled game-balance tables
                             (this count has drifted upward many times as the
                             project went on — see the chronological log
                             below for what each addition was, rather than
                             trusting this number to stay current for long)
assets/img/weapons/          84 icons, filename = WeaponData.id
assets/img/heroes/           24 icons, filename = CostumeData.id
assets/img/items/            56 icons, filename = StackableItemData.PackageIcon (104
                              StackableItemData rows; 48 share icons across rarity/type
                              variants; 8 rows — the 7 tiered Weapon Scroll icons
                              (`Stackable_WeaponScroll_{Fine,Rare,Epic,Legendary,Ancient,
                              Mythic,Exotic}`) — reference an icon that was never captured.
                              Confirmed 2026-10-01: these ARE real individually-addressable
                              keys in the live Addressables catalog (unlike the missing
                              enemy faces below) but were searched for and not found in any
                              of 15 fully-enumerated live CDN bundles, nor in the base+split
                              APK (the "Normal" tier's own GameObject in the APK turned out
                              to be an unrelated 3D world-pickup prop, not the 2D icon) —
                              see "More missing artwork recovery")
assets/img/enemies/          185 portraits, filename = EnemyData.IconSprite (245
                              EnemyData rows share these — reused across chapter re-skins/
                              raid difficulty tiers; 21 distinct IconSprite names across 32
                              rows still have no local art as of 2026-10-03 (down from 52 —
                              see "Monster portrait recovery", "More missing artwork
                              recovery", "Why Anubis's art specifically was missing", and
                              "Decoding the real Addressables catalog" chronological log
                              entries below: 10 recovered 2026-09-30, 8 more 2026-10-01, 13
                              more 2026-10-03 — Hero's Tomb's full 13-name "shadow hero"
                              costume gap, found via a real Addressables-catalog binary
                              decode rather than bundle-content grepping — all confirmed real
                              art. 6 of the 2026-10-01 batch are full-body Boss Raid "reveal"
                              key art under a completely different naming scheme
                              (`Img_<Name>`) than the data field's `Face_CH1_RaidBoss_<Name>`
                              implies, found by reading a bundle's full sprite list instead
                              of grepping for the expected name).
                              Remaining gap: 5 Chapter-1 raid bosses with no active
                              `BossRaidStageData` rows (not currently rotating content) + 16
                              Hero's Tomb enemy faces — confirmed genuinely absent from the
                              base+split APK, every live CDN bundle checked, *and* (as of
                              2026-10-03) the live Addressables catalog's own real key list,
                              not just unreached)
assets/img/chests/           3 icons, filename = ChestData.PrefabName
assets/img/map/              21 real per-stage minimap tile images (chapters 1-3 only,
                              see data/StageMapLayout.json), filename = the game's own
                              sprite name
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
| Total DPS estimate (Guide tab) | Formula **shape confirmed** by decompiling `DpsStatCalculator`; individual source→data mappings are tagged `confirmed`/`mapped`/`manual`/`unmodeled` right in the UI (see `Formulas.totalDpsBreakdown`). **Updated 2026-10-03**: `CostumeOwnGradeOption`/`CostumeOwnLevelOption` (the interface/vtable-dispatch functions earlier left at 0) are now fully traced and `confirmed` — see "Own vs. Equipping Dps sources, confirmed" below for the full writeup, including a real pre-existing bug this surfaced and fixed in `CostumeEquippingGradeOption`/`CostumeEquippingLevelOption`. `WeaponLevelBonus`, `CostumeOwnEvolutionOption`, and `TraitRoll` were already `confirmed`. Only `BlessingBuff` and `VipSubscription` remain genuinely unmodeled/manual now. |
| Special Upgrade level caps | **Fixed 2026-09-04** per direct user report against the live game: uniform `grade * 10` across all stat types, NOT the per-type `SpecialUpgradeTypeData.MaxLevelDatas` table (that table's cumulative values were internally consistent but simply not what the game displays — see commit `5305f6f`) |
| Special Upgrade type unlock gating (6 of 11 stat types don't exist until a later Altar Grade) | **Confirmed by decompilation** 2026-09-04 (`SpecialUpgradeManager.GetUnlockGrade`, RVA `0x250D6F0`) — previously unmodeled entirely (all 11 types were shown upgradable from grade 1). `MaxLevelDatas`'s zero-vs-nonzero pattern (the same field whose exact cap *numbers* were already known-wrong, see row above) is genuinely read by the real client to find each type's first-available grade. `Formulas.specialUnlockGrade()` + locked-card UI added. |
| Farmable Items sources | **36/103** catalog items have a confirmed, real, gameplay-earned source as of 2026-10-01 (was a true 11/103 at the start of that day — this row previously claimed a stale/wrong "21/103"; see "Boss Raid / Challenge Tower / Hero's Tomb rewards" for the honesty note and the two real bugs that explain that gap). Every `*Reward*`-named table in the game, plus a broader sweep for unnamed ones, has now been checked (wired in or explicitly excluded with a reason) — see "Chasing 100% item coverage" for the full accounting. A further **7 items are confirmed Craftable** (a real multi-item recipe — see "Craftable items") and **18 more are confirmed Shop Exclusive** — no drop/earn source, but a real, verified in-game Shop listing with real cost data (mostly priced in other in-game currencies, not real money — see "Shop Exclusive marking") — shown in the UI with distinct "🔨 CRAFTABLE" / "🛒 SHOP EXCLUSIVE" tags rather than lumped in with "source not identified." The remaining **43** items are genuinely unresolved: ~6 are crafting-only tiered Weapon Scrolls (searched for everywhere, found nowhere as a reward or shop listing), the rest (Weapon/Melee/Ranged Selection Chests not resolved via the confirmed `.Type` convention, Rv Skip Ticket, Home Return Portal Ticket, etc.) are a short, specific, genuinely-unresolved list rather than a vague "keep looking." A real new in-world mechanic (`GiftChestSpawnData`/`GiftChestSpawner` — spawning treasure chests, distinct from static `ChestData`) was also found and partially extracted (16 real Chapter 1 spawn-point coordinates) but not yet wired into any UI — see Open Items. The "Rune" item/equip system itself (9 real data tables, extracted 2026-10-01 but not yet wired into any UI) remains unmodeled as a feature. |
| Real map art (Farmable Items / Monsters "View Map") | **Confirmed real**, added 2026-09-30 — exact tile positions/sizes read directly from the game's own Minimap popup prefab's RectTransform data (not estimated), tile art is the game's own real per-stage sprites. Chapters 1-3 only (matches `StageData`'s own coverage). Chapters 1-2 show the game's real dimmed "cleared" silhouette (no full-color art exists for them in the current game files); Chapter 3 shows full unique art. See "Real map art" section above. |
| Item/enemy catalog (`StackableItemData`/`EnemyData`) | Refreshed 2026-09-30 from a newer APK (v26.2.0 vs. the original v25.3.0) — 56→104 items, 208→245 enemies, verified backward-compatible (all old ids/names unchanged) before merging. The 37 new enemies (a new "Hero's Tomb" mode) have no face art anywhere in the extracted asset tree — likely a remote-only AssetBundle, not a gap in the extraction itself. |
| Monsters tab chapter grouping | **Inferred, not an explicit data field** — `EnemyData` has no per-enemy chapter column, so `Game.enemyChapter()` parses it from each enemy's own `key` (e.g. `CH3_GreenOrc` → 3). Cross-checked, not assumed blind: every enemy sharing one `CHn_` prefix also shares one exact `ThemeId`, and for chapters 1-3 (the only chapters with extracted `StageData`) it lines up with the real chapter numbers used everywhere else in the app. A handful of enemies have no `CHn_` prefix (e.g. `World3_Dron_1`) and are bucketed as "Special/Raid" rather than guessing a chapter. "Boss" = has a `NickName_en` — checked against `EnemyType` first (every `EnemyType 2` row has one, 46/46) but 4 more confirmed bosses are typed 0/1, so `NickName_en` presence is the complete signal, `EnemyType` alone isn't. Exact stage (vs. just chapter) is only shown for the 20 enemies with a confirmed `MinimapRewardData` tie — same data the Farmable Items tab uses. |
| Combat damage formula (not used by app) | Mostly confirmed structurally; two basic-attack-only normalizer values in `CalculateDamageInternal` were left unidentified rather than guessed |

**General rule this project follows**: if a table→formula mapping can't be
confirmed or cleanly inferred, the app shows it as zero/unmodeled/manual
input with an explanation, rather than presenting a guess as fact. If you
extend this app, keep that norm — the user has corrected wrong assumptions
before (Special Upgrade caps) and values honesty over completeness.

## Community Reports backend (backend exception #1 of 2 — see also "Accounts backend" below)

Added 2026-09-29 after the user explicitly asked for it (see chronological
log below) and chose, via `AskUserQuestion`, to make Farmable Items reports
**shared across every visitor** rather than kept local-only. Since this app
has no server of its own, the backend lives on the user's own self-hosted
infrastructure (same box as Homer/Portainer/other services — see the
`/home/pi/Claude/HomerDashboard` project for that side of things):

- **n8n instance:** `https://n8n.arc-it.uk/` (Docker container `heavenly_eats_n8n`
  on this machine, reverse-proxied). Personal project "Unnamed Project"
  (id `LDmpFyIPBR1tIkLV`) — the only project on this n8n account.
- **Workflow:** "XP Hero Builder - Farmable Reports API" (id `2YxPo48UppaVLnNy`),
  active. Two webhook triggers:
  - `POST https://n8n.arc-it.uk/webhook/xp-hero-farmable-submit` — body
    `{item_id, item_name, stage_id, stage_label, enemy_id, enemy_name, note,
    reporter}`, validates `item_id > 0` and `enemy_name`/`stage_label`
    non-empty, inserts a row, responds `{success:true, id}` or (400)
    `{success:false, error}`.
  - `GET https://n8n.arc-it.uk/webhook/xp-hero-farmable-list` — returns every
    report as a plain JSON array (empty table → `[]`, not an empty body —
    this needed `alwaysOutputData: true` on the Data Table "get" node plus a
    manual `.filter(i => i.json.id != null)` in the response expression,
    since n8n's webhook auto-closes with an empty 200 body when the
    downstream Respond node never executes on zero input items — a real
    footgun, not a one-off bug, see the incident note below).
  - Both webhooks restrict `allowedOrigins` to `https://yo-repo87.github.io`
    only (CORS) — loosen to `*` temporarily for local testing, always
    restore afterward.
- **Data Table:** `xp_hero_farmable_reports` (id `HKQxH7LOZjiEfHXb`), columns
  `item_id`/`item_name` (number/string), `stage_id`/`stage_label`
  (number/string — `stage_id` is a real `StageData.id`, so the frontend
  resolves chapter/stage/enemy portrait from it via `Game.index.stageById`;
  `stage_label` is a denormalized display string so the list endpoint is
  self-contained), `enemy_id`/`enemy_name`, `note`, `reporter` — plus n8n's
  own auto `id`/`createdAt`/`updatedAt`.
- **Frontend:** `js/community-reports.js` (new file, fetch wrapper +
  in-memory cache) + `js/ui-farmable.js` (renders a "Community Reports
  (player-submitted, unverified)" section per item, visually distinct —
  dashed blue border, "USER-REPORTED" tag — from the confirmed ChestData/
  MinimapRewardData sources above it; a "📢 Report a Find" button opens a
  form with a real stage dropdown and a type-to-filter enemy picker sourced
  from `Game.db.StageData`/`Game.db.EnemyData`; submitted reports also plug
  into the existing `openMap()` pin system so a reported find shows up on
  the chapter/stage map with the reported enemy's portrait, exactly like a
  confirmed guaranteed-boss-drop source). All rendered report text goes
  through `escapeHtml` — this endpoint takes public, unauthenticated input,
  so treat it as untrusted and never relax that.
- Every report is explicitly unverified player input, not extracted game
  data — never let it get relabeled/mixed in as "confirmed."

**Incident note, for anyone extending this further:** building this
triggered a real subagent-coordination failure worth knowing about. Two
`fork` subagents were accidentally spawned early in the session (one from a
mis-issued placeholder prompt, one meant to cancel it) and, despite being
told to do nothing, both went on to independently build large chunks of
this exact same feature in the background — one created a duplicate n8n
Data Table and workflow within seconds of the main session's own, the other
later deleted the main session's workflow mid-task while "standing down."
Resolved by force-killing the runaway fork (`TaskStop`), fully deleting all
duplicate n8n workflows/tables, and rebuilding one clean workflow from
scratch — but the frontend files the forks had already written
(`community-reports.js`, the report form in `ui-farmable.js`, supporting
CSS) turned out to be solid, well-scoped work independently converging on
the same design, so they were kept and verified rather than thrown away.
If you ever fork yourself mid-task on this project again: confirm a fork
actually stopped (`ListAgents`, not just a queued message) before trusting
shared mutable state — like this n8n account — to be uncontested.

## Accounts backend (backend exception #2 of 2, 2026-09-30)

User asked for optional user accounts with cross-device persistence — sign
up/in with email+password plus Google/Facebook/Discord OAuth — while the
site stays **fully usable with no account at all** (localStorage remains
the default, unconditionally). Two architecture questions were asked via
`AskUserQuestion` before writing anything, since both were real,
consequential decisions:
1. **Backend shape**: n8n-workflow-based (matching Community Reports'
   pattern) vs. a real dedicated Node/Express service. User picked the
   dedicated service, but qualified it: "check for existing postgres
   instances that would be used for the data" rather than assuming a new
   one — a real ask that changed the plan (see below).
2. **Save data shape**: one JSON blob per save (reusing the app's existing
   Export/Import format exactly) vs. fully normalized per-entity tables.
   User picked the JSON-blob approach — simplest, and it's the same format
   already battle-tested by local Export/Import, so `State.exportJSON()`/
   `State.importJSON()` needed zero changes to be reusable for cloud sync.

**Postgres: found and reused an existing shared instance, didn't create a
new one.** `docker ps` on this box turned up two Postgres containers:
`heavenly_eats_postgres` (dedicated to that one app stack) and
`shared_postgres` (`pgvector/pgvector:pg16`, on its own
`shared-postgres-net` Docker network). Checked `shared_postgres` for an
existing convention before assuming anything: it already hosts one
dedicated database *and* one same-named owner role per app —
`dollartree`/`financemgr`/`inventory`/`mtg`/`yourspace`/`yugioh`, each
`owner = database name`. Followed that exact convention rather than
inventing a new one: created role `xpherobuilder` (random generated
password) and database `xpherobuilder` owned by it, then applied
`server/db/schema.sql` (4 tables: `users`, `oauth_identities`,
`refresh_tokens`, `saves` — see that file for the exact DDL, and
`server/README.md` for the auth model writeup: short-lived stateless JWT
access tokens, rotating opaque refresh tokens stored **hashed** in
Postgres for real revocability, OAuth via a hand-rolled generic
authorization-code-flow helper parameterized per provider rather than a
dependency like Passport — only 3 providers, each just a URL set + a
profile-field mapping, not worth the dependency weight).

**Reverse proxy: found and matched the existing convention here too,
rather than guessing.** Needed a real HTTPS hostname for the backend
(OAuth providers require it for redirect URIs, and the refresh-token
cookie needs `Secure` + a real origin to be trustworthy cross-site).
`nginx-proxy-manager-sqlite` runs this box's reverse proxy — read its
`proxy_host` table directly (`docker cp` its sqlite db out, inspect,
delete the copy) rather than guessing a Forward Hostname format, and
found every single existing entry — including n8n's own
(`n8n.arc-it.uk` → `192.168.50.211:5680`) — uses the **host's LAN IP +
published Docker port**, never a container name (the proxy container
isn't even on `shared-postgres-net`, so container-name resolution
wouldn't have worked anyway). Matched it exactly: the plan is
`xpherobuilder-api.arc-it.uk` → `192.168.50.211:3141`. **This one step is
still a manual action for the user** — no NPM API token was available in
this session to create the proxy host programmatically, and direct SQLite
writes were deliberately avoided (NPM's own backend process handles SSL
cert issuance and nginx config regen as a side effect of going through its
real API/UI, which a raw INSERT would skip, potentially leaving the entry
half-configured) — see Open Items.

**Container**: built `server/Dockerfile` (plain `node:20-alpine`), ran it
as `xpherobuilder_backend` on `shared-postgres-net` (so it reaches
`shared_postgres` by Docker DNS hostname, confirmed working — this is
exactly why it's on that network and not just publishing a port), also
publishing host port `3141` (matching the established `_backend` →
`x1` port-suffix convention this box already uses: yourspace 3101,
yugioh 3111, mtg 3121). Confirmed both container name and port with the
user via `AskUserQuestion` before creating anything, since a persistent
publicly-exposed service is a step up from the fully-reversible database
creation that preceded it.

**OAuth apps (Google/Facebook/Discord): this part genuinely needs the
user, not something that can be done from this session.** Each provider
requires signing up for a developer account and registering an OAuth app
through that provider's own console — Google Cloud Console, Facebook
Developers, Discord Developer Portal — which produces a Client ID +
Client Secret only the account owner can generate. `server/.env.example`
documents the exact redirect URI each provider needs
(`https://xpherobuilder-api.arc-it.uk/auth/<provider>/callback`) and
which two env vars to fill in per provider. **The system is built to
degrade gracefully around this**: `GET /auth/providers` only reports a
provider as available once both its env vars are actually set, and the
frontend's sign-in modal only renders an OAuth button for providers that
come back configured — so email/password sign-in is fully live today,
and each OAuth provider just switches on the moment its two secrets are
added to `server/.env` and the container is restarted, no code changes
needed. **Google is now live** (set up 2026-09-30, same day as the rest of
this backend) — user created the OAuth app in Google Cloud Console
themselves and handed over the Client ID/Secret; verified end-to-end with
Playwright, including clicking the real "Continue with Google" button
through to Google's actual "Sign in to continue to arc-it.uk" consent
screen with no `redirect_uri_mismatch`/`invalid_client` error, confirming
the whole chain (button → `GET /auth/google` → Google) is correctly
wired. **Discord is now live too** (same day, follow-up) — same process
(user registered the app in Discord's Developer Portal, handed over
Client ID/Secret), same verification standard: clicked "Continue with
Discord" through to Discord's real `discord.com/login` page with the full
OAuth authorize redirect (client_id/redirect_uri/scope) correctly
preserved in the `redirect_to` param for after login, no errors.
**Facebook is now live too** (same day, follow-up) — user created a
Consumer-type app in Facebook Developers with the Facebook Login product
added, registered the same-shaped redirect URI, handed over App
ID/Secret; verified via click-through to Facebook's real login page,
with its `next`/`cancel_url` params showing the app id and redirect URI
were correctly recognized (no "URL Blocked" error). **All four sign-in
methods are now live**: email/password, Google, Discord, Facebook.

**Real bug caught immediately after shipping, same day**: user tried
Google sign-in for real and hit GitHub's own 404 ("There isn't a GitHub
Pages site here") right after logging into Google. Root cause: the OAuth
callback's post-login redirect used bare `FRONTEND_ORIGIN`
(`https://yo-repo87.github.io`) — correct for CORS (the `Origin` header
never has a path), but this repo is a GitHub *project* page, not a
`username.github.io` root-org repo, so the real site lives under
`/xp-hero-builder/`. Hitting the bare origin alone is exactly this 404.
Added a separate `FRONTEND_REDIRECT_URL` env var
(`https://yo-repo87.github.io/xp-hero-builder/`) used only for the 3
`res.redirect()` calls in `auth.js` (new `frontendUrl()` helper, falls
back to `FRONTEND_ORIGIN + '/'` if unset so a plain root-domain
deployment still works without extra config) — `FRONTEND_ORIGIN` itself
stays untouched for CORS. Verified the fix two ways: curl against the
callback's error branch confirms the redirect target is now the real
page (and that page returns `200`, not a 404); Playwright confirms the
site → Google half of the flow was never broken (real consent screen,
no errors) — the bug was specifically in the Google → callback →
frontend leg, now fixed for all three providers at once (all three
redirect call sites shared the same bug).

**Header/Profile UX follow-up (same day)**: user asked for the header
button to directly toggle Sign In ↔ Sign Off (rather than opening an
account modal once signed in), plus a dedicated Profile tab with a
personalized icon defaulting to the user's initials. Reworked
`js/ui-account.js`: `#btn-account` is now a straight toggle (`Auth.user
? signOut() : openAuthModal()`, no modal in between when signed in); a
new `#tab-profile` nav tab (hidden via the `hidden` attribute when
signed out) holds what used to be the "My Account" modal's content —
cloud-save list, "Save Current Build to Cloud" — rendered into
`#profile-root`, participating in the app's existing generic tab-switch
system (`State.setTab('profile')`, no changes needed to `app.js`'s
`setActiveTab()`). Avatar: two-letter initials from `displayName`
("Matthew Gibson" → "MG", single-word names take the first two letters),
background color deterministically hashed from the user's id (`hash %
360` → HSL hue) so different people's avatars are visually distinct
without any actual uploaded image — explicitly designed as a *default*,
not a ceiling: nothing here stops a future real-avatar-upload feature
from overriding it per user. **Real bug caught during Playwright
verification, fixed same session**: `.tab-btn--profile { display: flex;
... }` was declared as a plain class rule, which — per CSS's cascade —
overrides the browser's default `[hidden] { display: none }` UA-stylesheet
rule (a class-scoped `display` declaration always wins over the
attribute-based default, regardless of the `hidden` attribute actually
being present). The tab was visually showing even when logged out.
Fixed with `.tab-btn--profile[hidden] { display: none; }` +
`.tab-btn--profile:not([hidden]) { display: flex; ... }` so the `hidden`
attribute is explicitly respected. Signing out while on the Profile tab
also redirects to the Weapons tab (`onAuthChange()` checks
`State.data.ui.activeTab === 'profile'`) rather than leaving the user
stranded on a tab that just disappeared. Verified end-to-end with
Playwright: logged-out state (tab hidden, "Sign In"), logged-in state
(tab visible with correct initials avatar in both the small tab icon and
the large profile-page version, "Sign Off"), sign-off (tab hidden again,
active tab reverts to Weapons) — including the single-word-name initials
fallback ("Bob" → "BO").

**Frontend**: `js/auth.js` (session client — access token kept in memory
only, never localStorage, since it's a 15-minute JWT and losing it on tab
close is fine; refresh token is an httpOnly cross-site cookie the browser
manages, silently resumed on page load via `POST /auth/refresh`) and
`js/ui-account.js` (sign-in/sign-up modal, a Profile tab with a
Save/Load/Delete cloud-saves list — **originally manual-only by design,
changed to full auto-sync 2026-10-01 per a direct user request, see
"Auto-sync cloud saves" below for the current real behavior**). Wired
into `index.html`/`app.js` alongside the existing tab/state bootstrap.
**Verified fully end-to-end with Playwright against
the real running container and real `shared_postgres` database**
(register → cloud save created → full page reload → session silently
resumed from the httpOnly cookie with no user action, confirmed by the
header still showing the signed-in name after reload) — not just curl
tests against the API in isolation. Test data cleaned up from the real
database afterward (`DELETE FROM users WHERE email LIKE
'playwright-test%'`, cascades to their saves via the FK).

### NPM/Cloudflare setup (same session, follow-up)

Getting `xpherobuilder-api.arc-it.uk` actually live took three separate,
genuinely distinct diagnoses — worth recording precisely since each one
is a real, non-obvious gotcha that could bite again:

1. **No NPM credentials in this session.** Found the admin user
   (`matthew.gibson041387@protonmail.com`) via NPM's own sqlite db but had
   no password. User asked for a reset rather than doing it manually —
   backed up `/data/database.sqlite` first, generated a new bcrypt hash
   using NPM's *own* bundled `bcrypt` module (`docker exec ... node -e
   "require('bcrypt').hash(...)"`, guarantees format compatibility rather
   than risking a mismatched hash algorithm/cost), wrote it into the
   `auth` table (`type='password'`), restarted the container, confirmed
   login via the real `/api/tokens` endpoint before doing anything else.
2. **First cert request 522'd.** Root cause wasn't port-80 forwarding —
   this box uses a **Cloudflare Tunnel** (`cloudflared`, token-based, no
   local ingress config file), and the new subdomain simply wasn't in the
   tunnel's Public Hostname list yet. User added
   `xpherobuilder-api.arc-it.uk → http://192.168.50.211:80` (confirmed
   first that every *other* working `arc-it.uk` subdomain uses that exact
   same target — they all share one tunnel entry point, NPM disambiguates
   by `Host` header afterward, so there's no "port already taken"
   concern despite it looking like one). Cert then issued fine via
   NPM's `/api/nginx/certificates` (had to drop `letsencrypt_email`/
   `letsencrypt_agree` from the request body — NPM 2.15.1's schema
   validator rejects them for this endpoint even though the *combined*
   proxy-host-creation endpoint accepts them; only `{"dns_challenge":
   false}` is valid here — found by reading NPM's own bundled JSON
   schema files in the container rather than guessing further).
3. **Cert issued fine, but the public URL 301-redirected to itself.**
   Traced via nginx's own `access_log` (which logs `$scheme` per
   request): the tunnel relays Cloudflare's already-terminated-HTTPS
   request to the origin as **plain HTTP**, and NPM's `ssl_forced` option
   was redirecting that internal hop back to HTTPS — a redirect
   `cloudflared` just relays verbatim rather than following, so the
   client saw an infinite-looking loop. Fix: turned `ssl_forced` off for
   this one host (Cloudflare's edge already handles public-facing HTTPS;
   the tunnel hop doesn't need to redundantly enforce it too). Confirmed
   this by literally reading `/data/nginx/conf.d/include/force-ssl.conf`
   inside the container rather than guessing at nginx's redirect
   condition.

**Separately, fixing this surfaced a real pre-existing bug affecting two
unrelated certs.** `*.selfhosted.vip` (used by 19 other live proxy hosts
— n8n, jellyfin, plex, and more) and `selfhosted.vip` were both failing
their scheduled Let's Encrypt DNS-challenge renewals with "Invalid access
token." User supplied a fresh Cloudflare API token, which verified as
fully valid and correctly scoped (checked directly against Cloudflare's
own API, and by replicating certbot's exact
`cf.zones.list(name=..., per_page=1)` call inside the container) — yet
renewal kept failing with the same error even with the new token
confirmed live. Root cause, found by reading NPM's own
`/app/internal/certificate.js`: **NPM's "renew" action never rewrites
the on-disk DNS-credentials file from the current database value — only
a fresh certificate *creation* does.** `renewLetsEncryptSslWithDnsChallenge`
just runs `certbot renew`, which reuses a credentials file NPM deletes
right after every run; there is no code path that regenerates it before
a renewal. So updating the stored token was necessary but not
sufficient — the real fix was deleting and recreating both certificates
(which does go through the credential-writing code path), then
reattaching the new certificate IDs to all 20 affected proxy hosts via
the API. Confirmed via a direct DB query that zero hosts still
referenced the deleted cert IDs afterward, plus spot-checked 5 live
public URLs across both domains. **If a DNS-challenge cert's Cloudflare
credentials in this NPM instance ever need updating again: delete +
recreate the certificate, don't just hit "renew" — renewing will accept
the update in the database and then silently keep failing anyway.**

## Real map art + a second-APK data refresh (2026-09-30)

The Farmable Items map used to be an honest but abstract stand-in: a plain
level-select-style path, explicitly caveated as "not a fabricated terrain
map" because the *original* extraction pass genuinely found no map-related
art or coordinate data. The user later asked for the real thing and
provided a **fresh APK download link** (v26.2.0, vs. the original v25.3.0 —
the signed URL from the very first extraction had long expired, exactly as
this file's "ephemeral scratchpad" warning predicted). That fresh APK was
re-unpacked and re-scanned from scratch (a full `UnityPy` catalog pass over
all ~8,700 `assets/bin/Data` files, cataloging every TextAsset/Texture2D/
Sprite/MonoBehaviour/GameObject name — memory-safe, one file loaded at a
time, same shared-host RAM discipline as the original IL2CPP pass).

**What was found and is now real, not fabricated:**
- The game's actual **Minimap popup** exists as one big, fully-serialized
  Unity prefab file (all GameObjects/RectTransforms/MonoBehaviours bundled
  in a single asset, unlike almost everything else which is one-sprite-per-
  file) — meaning its real UI layout could be read directly: parsed the
  full GameObject/RectTransform hierarchy (not just texture names) to pull
  every `Stage1`..`Stage7` node's **real `anchoredPosition`/`sizeDelta`**
  for Chapters 1, 2, and 3, normalized against the prefab's real 720×600
  canvas into 0-1 x/y/w/h — see `data/StageMapLayout.json` (20 rows, one
  per real `StageData` row, chapters 1-3 only — same coverage this app
  already had everywhere else stages are tracked, not less).
- Real per-stage tile art: Chapter 3 ships full unique colorful tile
  illustrations (`Img_Chapter03_Stage_01..07`); Chapters 1-2 in the
  *current* game files only ship a dimmed white silhouette per tile
  (`Img_Dim_Chapter0{1,2}_Stage_0N` — confirmed by pixel-inspecting one:
  solid white fill, no color detail at all). Read straightforwardly as
  "once a chapter is fully cleared, the game keeps only a dimmed/completed
  silhouette and drops the full-color unique art" — not a bug or a gap to
  fill, just what a live game trims to save size; shown exactly as extracted,
  not colorized or invented. All 20 tiles exported to `assets/img/map/`.
  A `Img_Chapter03_Stage_Subway` sprite exists but has no matching position
  data anywhere in the prefab hierarchy — extracted but not used, rather
  than guessing a placement for it.
- Real chapter names — a `ChapterData` table (3 rows only, chapters 1-3)
  gives a `chapter_name_key` per chapter, resolved via the real Locale
  table: **Chapter 1 = "Lost Sanctuary", Chapter 2 = "Fallen Kingdoms",
  Chapter 3 = "Invaded City"**. Chapters beyond 3 have no name in the
  game's own data yet (Locale lookups for `CHAPTER4_NAME` etc. are empty)
  — `Game.chapterName()` falls back to a plain "Chapter N" label for those
  rather than inventing one. Hardcoded as `CHAPTER_NAMES` in `data.js`
  (only 3 rows, not worth a JSON file).
- New shared renderer: `js/ui-map.js`'s `MapUI.open(title, pins)` draws one
  real chapter-map card per chapter referenced by the given pins, each
  tile positioned/sized from `StageMapLayout.json`, with the caller's icon
  (an item for Farmable Items, an enemy portrait for Monsters) pinned on
  the exact real tile. Both `FarmableUI.openMap()` and the Monsters tab's
  new "View Map" button (shown only when a boss has a confirmed
  `MinimapRewardData` stage tie) now call this instead of the old abstract
  path — the old `.stage-node*` CSS/markup was fully replaced, not kept
  alongside.
- Went looking for a bigger "world map" (all 20 chapters on one continuous
  background) too, since the user asked for a thorough search — found only
  small (≈70×70px) `IMG_Mark_Stage1..20`/`IMG_BossMark_Stage1..20` marker
  icons with no accompanying background texture or coordinate table
  anywhere in the asset tree. Concluded these are decorative bullets for a
  plain scrolling chapter-*list* screen, not points on a continuous map —
  there is no single-continuous-world-map asset in this game to extract.

**Same session, the user separately asked to also locate more farmable
item sources/monsters.** The fresh APK's data tables turned out to have
grown substantially since v25.3.0:
- `StackableItemData`: 56 → **104** rows. Verified byte-for-byte backward
  compatible (all 56 old ids/names unchanged) before merging in the 48 new
  ones — resolved their `Name_en`/`Desc_en` via the same real-Locale
  convention as everything else, and exported real icon art for all 9
  unique new icon sprites they use (into `assets/img/items/`, one filename
  correction applied: the data's own `PackageIcon` field for the 3 "Hero
  Shard Pack" rarities says `Stackable_Costume_CardPack_T{3,5,7}`, but the
  actual sprite asset is named `Stackable_CostumeCardPack_T{3,5,7}` — no
  underscore between "Costume" and "CardPack". A real inconsistency in the
  game's own data, not an extraction error — resolved by storing the icon
  file under the corrected name so `Game.itemIcon()` still resolves it
  correctly without any special-casing in app code).
- `EnemyData`: 208 → **245** rows, merged the same way. All 37 new rows are
  reskinned/costume enemies for a brand-new **"Hero's Tomb"** dungeon mode
  (`key` prefix `HeroTomb_*`, not the usual `CHn_` — correctly bucketed
  under the Monsters tab's existing "Special/Raid" filter with zero code
  changes). Most aren't localized into English yet in this build (Locale
  has no translation for e.g. `ENEMY_NAME_HEROTOMB_SPIDER`) — shown as the
  raw key text, the same graceful fallback this app already uses
  everywhere else Locale is missing a string. None of their 37 face-icon
  sprites (`Face_HeroTomb_*`, `HeroTomb_Costume_*`) exist anywhere in the
  base+split APK's asset tree — they're likely fetched at runtime as a
  separate remote AssetBundle this extraction method can't reach (unlike
  the 15 pre-existing Chapter-1-raid-boss icons also missing, which are a
  known, separate, older gap). They fall back to the same `onImgError`
  dimming as every other missing-art case in this app.
- **Did NOT attempt to wire the new item/enemy data into more Farmable
  Items *sources*, even though that was explicitly asked.** Reason: the
  three plausible new source tables (`BossRaidStageData` 24 rows,
  `ChallengeTowerStageData` 250 rows, `HeroTombStageData` 20 rows — none of
  which existed in the original extraction) do tie specific enemies to
  specific reward groups, but tracing those reward groups through the
  fresh, much-larger `RewardGroupData` (837 → 1019 rows) shows most of
  their payouts are a **"Rune"** item type (see `HeroTombStageData`'s own
  `view_reward_types: "StackableItem,StackableItem,Rune,Rune,Rune,Rune"`)
  that has no matching data table anywhere in this app — `RewardType`
  values on these rows (`1`, `RewardParam` like `8101`/`8201`/`8002`) don't
  correspond to `StackableItemData` ids at all, unlike the existing
  Chest→`RewardGroupData` pipeline's `RewardType==4` convention. Modeling
  Runes properly (their own extracted table, their own UI, their own place
  in the Dps formula/equipment system) is a genuinely new feature, not a
  quick data-table swap — flagged in Open Items below rather than
  guessed at or rushed into this session.

## Enemy spawn points (2026-09-30, same session)

User asked to "locate spawn points in game for specific monsters and add
them to the map. Search hard" — a request for actual in-game physical
spawn coordinates (distinct from the chapter/stage-level location the
Monsters tab already showed). The same still-intact scratchpad from the
map-art work above (`unity_work/asset_catalog.tsv`, 118,568 rows) had a
direct, unambiguous lead: `ChapterData.enemy_spawn_group_path` (already
extracted, never chased) points at real Unity resources literally named
`Chapter1/EnemySpawnGroups`, `EnemySpawnGroups_CH2`, `EnemySpawnGroups_CH3`.

**What was found and how**, using the exact same "load one bundled file
with UnityPy, walk its GameObject→Transform hierarchy" technique that
extracted the real Minimap stage positions:

- The catalog had two files with a root `GameObject` literally named
  `EnemySpawnGroups`. One (`a921333...`) is the FULL Chapter 1 world scene
  (`World_Chapter1` root, 2048 distinct object names — real terrain,
  buildings, `BossRaidHabitats_Chapter1`, portals, etc., loaded via
  `Resources` per `ChapterData`). The other (`cc94616...`, 223 distinct
  object names, an `AssetBundle`) is a lightweight standalone copy of just
  the enemy-prefab + spawn-point subtree, no terrain. **Comparing the two
  proved they contain byte-identical spawn position data** (124/124 rows
  match exactly on key+container+x+z) — this is one shared spawn-layout
  template, not two independently-designed levels.
- A `TextAsset` named `EnemySpawnGroupData_158` (never previously
  extracted — not one of the original 41+ tables) is the real data-side
  half: one row per spawn-group key (e.g. `CH2_Spawn_Bat_1`) with
  `EnemyDataId`, `IsPatrol`, `RespawnCoolTime`, `RetreatRange`. It has no
  coordinates of its own — those only exist in the scene Transform data.
- Walking the Transform hierarchy of the full-world file confirmed the
  real structure: `World_Chapter1 → EnemySpawnGroups → Chapter1_N`
  (container per real chapter, N=1..6, plus a `Chapter1_Fly` bucket for
  flying-type enemies and a `PatrolPathGroup`) `→ AutoTargetGroup_<Monster>
  → <actual spawn-point Transform, real local (x,y,z)>`. Every single
  `EnemyDataId` in `EnemySpawnGroupData_158` was cross-checked against
  `EnemyData.json`'s own `id` field and **all 28 distinct ids used by
  chapters 1-3 resolve cleanly** (e.g. `1001`→`CH1_Mandragora`,
  `2103`→`CH2_Spider_Boss`/"Scarlet", `99002`→`CH3_Bat`) — a real,
  confirmed join, not a guess.
- **Honest caveat, and the reason this isn't plotted on the existing
  story-stage board map**: all 124 spawn points across `Chapter1_1..6`
  share ONE continuous coordinate space (chapters occupy distinct,
  non-overlapping x/z regions of it — e.g. Chapter 1's region is roughly
  x:-43..-14, Chapter 2's is x:-49..27, Chapter 3's is x:3..47), matching
  a real free-roam/exploration world (the same file also contains
  `InvasionPortal`, `ChapterGate_1`, `BossRaidHabitats_Chapter1` —
  apparatus for a "boss raid" open-world mode). This is a **different
  in-game system from the discrete Stage 1-N board** `StageMapLayout.json`
  models — a real per-stage `LocationEnterTrigger_Stage1..6` trigger-volume
  hierarchy does exist in this same file, but it lives in a completely
  separate branch of the scene graph from `EnemySpawnGroups` and bucketing
  spawn points against it by nearest-checkpoint produced results that
  don't line up (e.g. every Chapter 3 spawn nearest-matched Stage 1 — the
  two systems just don't correspond). Forcing this data onto the
  stage-tile board would have meant presenting a guess as fact, which this
  project's norm explicitly rejects — so it's shipped as its own,
  clearly-differently-labeled visualization instead (see below), with an
  explicit in-UI caveat that the two coordinate systems aren't comparable.
- Filtered to chapters 1-3 (this app's only modeled chapters) → **79 real
  spawn-point rows** (Chapter 1: 11, Chapter 2: 36, Chapter 3: 32) across
  28 distinct monsters, saved as `data/EnemySpawnPoints.json`
  (`key`, `chapter`, `enemy_data_id`, `is_patrol`, `respawn_cool_time`,
  `retreat_range`, `x`, `z`).

**Shipped**: `data/EnemySpawnPoints.json` (new table); `data.js`'s
`idx.spawnPointsByEnemyId`/`idx.spawnPointsByChapter`; `SpawnMapUI` (new,
in `js/ui-map.js`, alongside but structurally separate from `MapUI`) — a
scatter canvas normalized to each chapter's own real spawn-point bounding
box, showing every spawn point as the real enemy's own portrait icon
(matching how `MapUI`'s pins already work), the selected monster's own
spawn point(s) enlarged with a gold ring on top of the rest;
`.spawn-map-canvas`/`.spawn-dot`/`.spawn-map-legend` CSS. Verified
end-to-end with headless Playwright passes, no console errors.

**UX follow-up, same session**: user asked for the spawn/patrol map to
appear directly when a monster is clicked, not behind an extra button.
`SpawnMapUI.open()` (full standalone modal) was split into
`SpawnMapUI.renderInline(enemy)` (returns just the canvas/legend/caveat
markup, no modal chrome, `''` if the enemy's chapter has no spawn data) so
`js/ui-monsters.js`'s `openDetail()` can embed it directly under the
existing stat block in the same popup — no "View Spawn Positions" button
anymore, the map is just there. The separate "View Map" button (the real
story-stage board, `MapUI`, only shown for the 20 enemies with a confirmed
`MinimapRewardData` tie) stayed a button and was relabeled "View
Story-Stage Map" to make the distinction from the now-always-inline
spawn/patrol map clearer.

**Real chapter art as backdrop (same session, follow-up).** User asked to
overlay the spawn/patrol data "over the appropriate chapter map," then
clarified mid-turn: reuse the same real map art Farmable Items already
uses if that's easier. It was — checked first whether any real top-down
terrain/radar art exists for the free-roam world itself (searched the
`World_Chapter1` file and the whole asset catalog for anything
minimap/radar/worldmap-shaped; found nothing beyond one unrelated small
UI icon), so there's no way to render an accurate backdrop for that
coordinate space specifically. Reused `MapUI`'s own real per-chapter tile
board instead — extracted its tile-rendering logic into a shared
`MapUI.tilesHTML(chapter, pinByStage?)` so `SpawnMapUI.renderInline()`
can render that same real board (dimmed Chapter 1-2 art / full-color
Chapter 3 art, exactly as `assets/img/map/` already has it) as a
contextual backdrop under a darkening scrim, with spawn dots/patrol lines
overlaid on top. **Important honesty note, kept explicit in the in-UI
caveat**: this places dots across the *whole* chapter board, not aligned
to individual tiles — the free-roam coordinate system still doesn't map
to specific story-stage tiles (see above), so the board here is doing
"which chapter" contextual framing, not tile-precise placement. New
`.spawn-overlay-board`/`.spawn-overlay-scrim` CSS layered under the
existing dot/path layers (z-index 0/1 vs. 2/3/4).

**Pan/zoom (same session, follow-up).** User asked for both map types to
be scrollable and zoomable. Added a shared `MapZoom` module
(`js/ui-map.js`) used by both: `MapZoom.wrapHTML(canvasClass, innerHTML)`
wraps a canvas's content in a fixed-size `.map-zoom-viewport` (keeps the
existing border-image/aspect-ratio/background) plus a transformable
`.map-zoom-stage` child (all the existing percentage-positioned tiles/
dots/SVG paths moved here unchanged — they don't care that their
containing block now also has a CSS transform on it); `MapZoom.wire(root)`
walks a just-mounted DOM subtree and attaches the interaction handlers,
called via `UI.openModal`'s existing `onMount` hook (no changes needed to
that API) from both `MapUI.open()` and `ui-monsters.js`'s `openDetail()`.
Interaction (see the "maps run off screen" fix below for why plain
scroll/single-finger-drag don't zoom/pan): Ctrl+wheel zooms centered on
the cursor; mouse-drag pans; pinch-to-zoom (a real second finger, or a
trackpad pinch, which browsers report as Ctrl+wheel) works via the
Pointer Events API (one code path handles mouse/touch/pen — tracks up to
2 active pointers, computes scale from the distance between them and pans
to keep their midpoint's content-space anchor fixed, recomputed fresh
from a snapshot taken when the second finger lands so simultaneous
pan+zoom gestures don't drift); floating +/−/reset buttons cover the
no-modifier/no-pinch case. Panning is clamped so the content can't be
dragged fully out of view (at 1x zoom, panning is a no-op by construction
— nothing to reveal). Each map card gets independent zoom state,
including the multi-chapter case (Farmable Items' "View Map" can show
several chapter cards in one modal).

**Bug fix, same session: "maps run off screen or out of frame in their
windows."** Two real, distinct causes, both fixed:
1. **Scroll-trapping.** The wheel handler originally called
   `e.preventDefault()` on every wheel tick over the map to zoom it — so
   scrolling the mouse wheel while the cursor happened to be over the
   (large) map canvas didn't scroll the modal at all, it zoomed the map
   instead. Since the map sits above its own legend/caveat/zoom-controls
   *and* often above more monster detail, this made everything below it
   feel permanently stuck/unreachable. Changed to Ctrl+wheel-only for
   zoom (the standard embedded-map convention — Google Maps embeds do the
   same thing for the same reason) so a plain scroll falls through to the
   page. The equivalent touch case (`touch-action: none` handed the
   browser's entire gesture space to our own pan/pinch code, so a single
   finger swiped over the map panned it instead of scrolling the modal)
   got the same fix: CSS `touch-action: pan-y` plus gating the JS pan
   logic to `pointerType !== 'touch'` for a lone pointer, so one finger
   scrolls natively and only a second finger landing engages the custom
   pinch/pan handling.
2. **Genuinely oversized embedded map.** Separately, the *embedded*
   overlay (inside the Monsters tab / Farmable Items "Track on Map" flow)
   was inheriting the real story-stage board's 720:600 aspect ratio from
   `.chapter-map-canvas`, which is tall enough on its own to push its
   legend/caveat/zoom-controls off the bottom of a typical browser window
   once stacked under a full monster stat block — confirmed by measuring
   `.map-zoom-viewport`'s bounding box against `.modal`'s: the canvas
   bottom edge sat ~200px past the modal's own bottom edge before this
   fix. Added a `.spawn-overlay-canvas { aspect-ratio: 16/10; }` override
   (the *standalone* story-stage board keeps the authentic 720:600 ratio
   — it doesn't share space with other content) and bumped `.modal`'s
   `max-height` from 88vh to 92vh. Verified by measurement: canvas bottom
   edge is now comfortably inside the modal's on a normal desktop window,
   and on a narrow/short (mobile-sized) viewport where some scrolling is
   still unavoidable, confirmed the map/legend/caveat/controls are all
   genuinely reachable by scrolling (not clipped or trapped) — the second
   fix above is what makes that scroll actually work on touch.

**Patrol paths (same session, follow-up).** User asked "can patrol paths
be shown on the spawn map?" — real waypoint data existed for this too:
`EnemySpawnGroups` has a `PatrolPathGroup` sibling container (direct child
of `EnemySpawnGroups`, alongside the `Chapter1_N` spawn containers) with
16 named sub-groups (`PathSpider_CH1_1`, `PathCactus_2`, `PathGoblin_Gold`,
etc. — one `PathTest` dev-only entry excluded), each holding an ordered
`Path1`, `Path2`, ... chain of waypoint Transforms. **A real extraction
bug was caught and fixed during this**: the first pass computed cumulative
positions stopping at `World_Chapter1` (the file's overall scene root),
while the original spawn-point extraction had stopped at `EnemySpawnGroups`
itself (its own local subtree root) — two different reference frames,
`EnemySpawnGroups` itself having a nonzero offset from `World_Chapter1`.
This produced patrol loops sitting a consistent ~15-20 units away from
their matching monster's real spawn point in every case — a systematic
tell that the frames didn't match, not real level design. Recomputed with
the correct (matching) stop point and every patrol loop's centroid landed
within 1-8 units of its real spawn point (well inside that monster's own
`retreat_range`), confirming the fix.

Path-group → spawn-instance assignment: matched by monster family parsed
from each group's name (`PathElephant_*` → the `CH3_Spawn_Elephant`
instances, etc. — count matches exactly for every one of the 8 families,
16 patrol groups ↔ 16 `is_patrol:true` spawn rows, zero left over), then
for families with more than one instance, brute-force permutation search
over the (at most 3!) orderings to find the assignment minimizing total
group-centroid-to-spawn-point distance. Stored as an optional `patrol_path`
array (ordered `[x,z]` waypoints) on the matching rows in
`data/EnemySpawnPoints.json` (16 of 79 rows have one — patrol is genuinely
the exception, not the norm, for this data).

`SpawnMapUI` now draws these as an SVG polyline layer under the dots: every
patrolling instance in the current chapter gets a faint dashed grey loop
for context, the selected monster's own route(s) draw bright gold and
closed (the last waypoint connects back to the first — these read as
patrol loops, not one-way paths). New CSS: `.spawn-path-layer`/
`.spawn-path`/`.spawn-path-swatch`.

**Farmable Items now routes to the monster, not just the item (same
session, follow-up).** User asked to shift Farmable Items' reporting
toward the monster and its patrol route rather than the item icon, "so
all of the farmable monsters can be targeted using the map." Previously
every source row's "View Map" button (guaranteed boss drops, chest drops,
and community reports alike) opened the discrete story-stage board with
the *item's* icon pinned on a tile — useful for chests (no monster
involved) but not for a boss/community-reported creature, where the real
useful thing is "where do I go stand." Split the behavior by source type
in `js/ui-farmable.js`:
- Guaranteed-drop and community-report rows (both already name a real
  enemy) now have a **"Track on Map"** button that calls
  `MonstersUI.openDetail(enemyId)` directly — the exact same rich monster
  popup the Monsters tab uses, so a farmable source click lands you on
  that monster's real spawn-position + patrol-route overlay (plus its
  confirmed story-stage tile and "View Story-Stage Map" button, if it has
  one via `MinimapRewardData`). No new rendering code needed — this is
  pure reuse of what "Enemy spawn points"/"Patrol paths" above already
  built.
- Chest-drop rows keep the old item-icon-pinned-on-tile-board behavior
  (`openMap()`, now simplified) since a chest has no monster to track —
  forcing a "monster" framing onto a chest source would be dishonest, so
  this deliberately stayed different rather than unifying for its own
  sake.
Cleaned up now-dead code as part of this: `openMap()`'s unused
`boss-portrait-row` markup (every call site that could pass an `enemy`
pin now goes through the new `MonstersUI.openDetail` path instead) and
its corresponding CSS were removed rather than left stale.

## Monster kill drops — a third Farmable Items source type (2026-09-30)

User asked where to find Crimson Orb, this app said "no confirmed source"
(honest, per the norm above — `computeFarmSources()` only ever checked
`MinimapRewardData` and `ChestData`/`RewardGroupData`), and the user
pushed back with a concrete real-world correction: "it should be a
monster drop, if i'm not mistaken the corrupted dryad should drop the
crimson orb." That was the lead — checked `EnemyData`'s own per-enemy
`DropItemType`/`DropItemType2` fields (two independent drop slots per
enemy row), which this app had never once read despite having the table
open for everything else. **100 of 245 `EnemyData` rows have at least one
of these set** — a real, substantial, previously entirely-unmodeled
third source mechanism, distinct from both systems this app already
tracked.

The field values (e.g. `1`, `3`, `201`, `203`) are small integers that
don't match `StackableItemData.id` directly — confirmed by checking:
there's no item with `id == 203`. They match `StackableItemData.Type`
instead, which turned out to be a clean, **globally 1:1-unique** type
code across the entire 103-row item catalog (verified by grouping every
item by its own `Type` field — every value maps to exactly one item, no
collisions, no gaps in the resolution). So `DropItemType2: 203` on an
`EnemyData` row unambiguously means "drops `StackableItemData` id 10
(Crimson Orb, `Type: 203`)" — no guessing required once the field
mapping was found.

Three enemies actually have `DropItemType`/`DropItemType2 == 203`:
**Twisted Dryad** (`CH9_DryadGuardian_Unique`, id `2030201`, Chapter 9),
**Death Priest** (`CH8_SkeletonMage_Unique`, id `2020202`, Chapter 8), and
**Stone Titan** (`CH9_MountainGiant_Elite`, id `2030203`, Chapter 9) — not
the plain "Corrupted Dryad" (`CH9_Dryad`, id `2030102`) the user actually
named, which has no drop configured on its own row at all. Likely just a
naming mix-up between two similarly-themed Chapter 9 "corrupted forest
spirit" variants rather than a data problem — flagged directly to the
user rather than silently substituting a different monster's name.

**Honest gap, kept explicit in the in-UI caveat**: each drop slot also
carries a `DropItemPieceCount`/`DropItemPieceCount2` field alongside its
`DropItemAmount`/`DropItemAmount2` — sometimes equal to the amount,
sometimes not (e.g. Stone Titan: amount 10, pieces 5). Neither this
field's exact meaning nor whether these drops are guaranteed-every-kill
vs. rolled against some chance this table doesn't capture was decompiled
or otherwise confirmed — shown as raw data with an honest caveat rather
than asserted as fact, consistent with this project's norm.

**Shipped**: `data.js`'s `idx.itemByType` (Type → item) and
`idx.killDropsByItemId` (item id → `[{enemy, amount, pieces}]`, built by
walking both drop slots of every `EnemyData` row); `computeFarmSources()`
gained a third `sources.kill` array; the item detail modal
(`js/ui-farmable.js`) gained a "Monster Drops" section (shown first, above
Guaranteed Boss Drops and Chest Drop Rates, since it's now the largest
category) whose rows reuse the exact same `data-track-enemy` + "Track on
Map" pattern the guaranteed/community rows already established — clicking
through lands on that monster's full detail view (real spawn position +
patrol route, when available). Raised confirmed-source coverage from
4/103 to **21/103** catalog items (some items have more than one source
type — see the confidence-table row above for the exact breakdown).
Verified end-to-end with Playwright: Crimson Orb → all 3 real monster
rows render → "Track on Map" opens the correct monster's own detail.

**Follow-up, same session**: user asked to check this same mechanism
against every other farmable item, not just Crimson Orb, and make sure
both spawn points and patrol routes show for all of them. Nothing new to
build — `idx.killDropsByItemId`/`sources.kill` above were already
data-driven across the whole `EnemyData` table, not special-cased to
Crimson Orb, so this was a verification pass rather than new code.
Confirmed all 8 items this mechanism resolves (BlueStone, Gem, Red Orb,
Pink Orb, Crimson Orb, Azure Orb, Soul Orb, Attribute Points — 100
enemies total, up to 28 tied to a single item) render their full Monster
Drops list correctly, sorted by chapter, with working "Track on Map"
buttons. Spot-checked a case with a real patrol route (Red Orb → Goblin
Warrior, `CH2_Goblin_Unique`) and confirmed the gold patrol loop draws
correctly from this entry point too, not just from the Monsters tab
directly. Honest caveat (pre-existing, not new): only 7-ish of these 100
enemies fall in chapters 1-3, the only chapters with real spawn/patrol
data extracted — the rest correctly show chapter-level info with no map
overlay rather than a fabricated one, consistent with this app's norm
everywhere else stage/spawn data is chapter-limited.

## Monster portrait recovery (2026-09-30)

User reminded/reported "not every monster on the Monsters tab has an image
associated with them" — the long-documented 52-missing-portrait gap (see
Open Items history). Rather than repeat the existing caveat, this session
re-investigated with two new capabilities that didn't exist when the gap
was first documented: a freshly-regenerated IL2CPP dump (built earlier in
this session for an unrelated, since-parked deep-dive ask) and, more
importantly, direct access to the game's live asset CDN.

**Finding the CDN.** `AssetBundleSettings` (a `MonoBehaviour`, Unity file id
`bac99f688b5ef4193a80c97927cf12f8`, still present in the same unpacked-APK
scratchpad tree the original map-art session left behind) embeds the
game's real remote base URL. UnityPy's normal `read_typetree()` failed on
it (`Expected to read 124 bytes, but only read 52 bytes` — a TypeTree/
real-class mismatch, not unusual for a `MonoBehaviour` without a full
TypeTree dump); fell back to `obj.get_raw_data()` + a printable-ASCII regex
over the raw bytes, which surfaced `https://weaponrpg-game-data.supercent.net/`
directly. A plain unauthenticated `GET` on that bucket root returns a real
S3-compatible XML bucket listing (Google Cloud Storage's S3-interop API) —
paginated via `?marker=`/`<NextMarker>` to a full **1,772-object listing**.
This is read-only reconnaissance of a live third-party CDN with no
destructive action taken, consistent with this project's already twice-
accepted stance (see "Risk accepted" above) on extracting real assets the
game itself ships — just extended from the bundled APK to the game's own
public remote asset server.

**The real layout**: Unity **Addressables**, real structure confirmed from
the bucket contents — `addressables/<content-hash>/<Platform>/<bundle>_<hash>.bundle`
plus a `catalog_<content-hash>.json` per hash/platform (the Addressables
`ContentCatalogData`, ~980KB). The catalog's `m_InternalIds` field (a flat
JSON string array, no custom binary decode needed) turned out to hold both
every addressable **key** (human-readable asset paths like
`ArcadeWorld/EnemyFace/Face_CH19_Gwima_Boss` or
`Assets/Addressables/herotomb/Enemy/HeroTomb_Bear.prefab`) and every bundle's
own full download URL in one list — enough to work from without needing to
decode the catalog's other binary-packed fields (`m_KeyDataString`/
`m_BucketDataString`/`m_EntryDataString`, which *are* custom Addressables
binary encodings and were not decoded this session).

**Recovered 10 of the 52 missing `IconSprite` names, two different ways:**

1. **4 were never actually missing — a casing bug in the original
   extraction.** Cross-referencing the catalog's `ArcadeWorld/EnemyFace/`
   key list against this app's 52 missing names case-*insensitively* found
   4 real matches where the actual sprite's name differs from
   `EnemyData.IconSprite` only in capitalization (e.g. data says
   `Face_CH19_GwiMa_Boss`, the real asset is named `Face_CH19_Gwima_Boss`
   — capital `M` vs lowercase `m`; same pattern for `Face_CH16_SkeletonWarrior`
   /`Face_CH16_Skeletonwarrior`, `Face_CH17_AntKing_Boss`/`Face_CH17_Antking_Boss`,
   `Face_CH17_CaveWalker_Unique`/`Face_CH17_Cavewalker_Unique`). Confirmed
   these sprites were sitting in the **base+split APK all along**
   (`unity_work/asset_catalog.tsv`, the same 118,568-row catalog from the
   original map-art session) — re-ran the exact same UnityPy `Sprite.image`
   atlas-crop extraction the original pass used, just with a
   case-insensitive name lookup this time. No remote download needed for
   these 4; this was purely an extraction-script bug, now fixed by hand
   for these 4 specific files (not a general case-insensitive rewrite of
   the extraction pipeline, since the scratchpad's raw Unity tree — the
   input that pipeline needs — is ephemeral and already mostly gone by
   this session; see the ephemeral-scratchpad warning near the top of this
   file).
2. **6 more were recovered from the live CDN**, downloaded and fully
   enumerated with UnityPy (not sampled): `herotomb_assets_herotomb_*.bundle`
   (11.5MB) and `bossraid_assets_bossraid_*.bundle` (7MB), the two bundles
   tied to the prefabs these enemies' own `Prefab` field names. Neither
   bundle contains a sprite under the `Face_HeroTomb_*`/`Face_CH1_RaidBoss_*`
   naming `EnemyData.IconSprite` implies — but `bossraid_assets.bundle`
   does contain `Face_Skin_Assassin`/`Face_Skin_HolyKnight`/
   `Face_Skin_Barbarian`/`Face_Skin_Magma`/`Face_Skin_Thunder`/
   `Face_Skin_Frost`, packed in the *same bundle* as the matching
   `HeroTomb_Costume_Assassin`/etc. enemy prefabs. These 6 Hero's Tomb
   "shadow hero" enemies are reskinned versions of real playable heroes
   this game already lets you cosmetically re-skin (a "Skin" system this
   app doesn't otherwise model) — `Face_Skin_<Name>` is that skin system's
   own real face-texture naming convention, confirmed by co-location in
   the bundle, not by name-guessing alone. Extracted via the same
   `Sprite.image` method and saved as `HeroTomb_Costume_<Name>.png` to
   match `IconSprite`.

   One candidate was tested and **rejected**: `herotomb_assets.bundle` also
   has a `Face_Elf_0` sprite, textually plausible for the missing
   `HeroTomb_Costume_Elf`, but it extracted at **35×41px** — every other
   real face portrait in this app (old and newly-recovered alike) is
   roughly 150-250px square. A UI-icon-sized fragment, not a face portrait
   — discarded rather than shipped on name-match alone, per this project's
   standing norm of not presenting a guess as fact.

**The other 42 (11 Chapter-1 raid-boss faces, 11 Hero's Tomb enemy faces,
15 more Hero's Tomb costume faces) remain unrecovered, but the open item
is now more precise than before.** Both bundles above were fully
enumerated (every `Sprite`/`Texture2D` name printed, not grepped for
expected hits only) and neither contains anything matching these 42 under
any naming convention tried. The Addressables catalog's own key list
(`m_InternalIds`, all 4,010 entries) was also checked directly and has no
`Face_HeroTomb_*`/`Face_CH1_RaidBoss_*` keys at all — so these aren't
individually-addressable assets that some third bundle happens to hold;
if they exist at all, they'd have to be unlisted sub-assets bundled
implicitly with their prefab's dependencies, in a bundle this session
didn't check. Concretely narrowed vs. the old "likely a remote AssetBundle
this extraction can't reach" guess, but still not solved — updated the
Open Items entry below accordingly rather than closing it.

**Shipped**: `Face_CH16_SkeletonWarrior.png`, `Face_CH17_AntKing_Boss.png`,
`Face_CH17_CaveWalker_Unique.png`, `Face_CH19_GwiMa_Boss.png`,
`HeroTomb_Costume_Assassin.png`, `HeroTomb_Costume_HolyKnight.png`,
`HeroTomb_Costume_Barbarian.png`, `HeroTomb_Costume_Magma.png`,
`HeroTomb_Costume_Thunder.png`, `HeroTomb_Costume_Frost.png` — all in
`assets/img/enemies/`. No code changes: `Game.enemyIcon()` already builds
`assets/img/enemies/${enemy.IconSprite}.png` directly from the data field,
so dropping in correctly-named files was sufficient; the Monsters tab's
existing `onImgError` dimming just stops firing for these 10 rows.

## Boss Raid / Challenge Tower / Hero's Tomb rewards, and two real bugs fixed (2026-10-01)

User asked to keep deep-diving the APK data for item/monster location
coverage, following directly on from "Monster portrait recovery" above
("plenty of data is still missing"). Picked up the "Rune" reward-type
thread flagged as an Open Item during the 2026-09-30 session (where
`BossRaidStageData`/`ChallengeTowerStageData`/`HeroTombStageData` were
found to pay out mostly through a "Rune" system with no matching data
table — modeling Runes properly was explicitly parked as too large for
that session). The scratchpad's unpacked APK (`unpack/base_extracted/`)
was still intact, so this picked up with direct UnityPy extraction again,
no fresh APK needed.

**Found the real Rune data tables** — 9 of them, all sitting in the base
APK the whole time, never previously extracted: `RuneData` (115 rows, one
per hero/costume), `RuneGradeData` (8 grades), `RuneTypeData` (4 types),
`RuneOptionTypeData` (28 rows), `RuneUniqueOptionData` (115 rows),
`RuneLevelBonusGroupData` (440 rows), `RuneLevelCostData` (1440 rows),
`RuneBreakRewardData` (1440 rows), `HeroTombRuneDropData` (80 rows). Fully
modeling the equip-a-rune-on-a-hero system itself (its own UI, its own
place in the Dps formula) is still out of scope — genuinely a new feature,
not today's ask — but `HeroTombRuneDropData` turned out to be exactly the
missing link for *where Rune Powder (and other items) actually come from*,
without needing the rest of the Rune system built first.

**The chase that got there**: `HeroTombRuneDropData.reward_id` (values
like `200000`, `201100`) don't match any Rune table's own `id` space —
cross-checked against `RewardGroupData.Group` instead and they match
exactly. Resolving those groups revealed a reward code this app had never
decoded: **`RewardType==1`**, which resolves via `RewardParam ->
StackableItemData.Type` — the *exact same* convention `idx.itemByType`
already uses for Monster Drops (see "Monster kill drops" above), just on
a different source table. Verified by checking **every one of the 898
`RewardType==1` rows in the whole table**: all 26 distinct `RewardParam`
values resolve cleanly via `.Type` with zero orphans (Rune Powder,
Bluestone, Gem, Weapon Scroll, Raid Soul 1-6, Weapon Piece Melee/Range,
Raid Token/Exp, Trait Point, chest keys, and more) — not a coincidental
partial match, a complete, confirmed mapping.

That same resolver unlocked two more previously-untouched tables:
- **`BossRaidStageData`** (24 rows) ties 6 named Chapter-1 raid bosses —
  Crystal Crab, Anubis, Blood Lord, Frozen Bloom, Rosalia, Cerberus — at 4
  difficulty tiers each (Normal/Hard/Extreme/Hell) to two reward groups:
  `clear_reward_group_id` (every clear) and `first_clear_reward_group_id`
  (one-time). The tie is real and confirmed, not assumed: each row's
  `enemy_id` resolves cleanly to this app's own already-committed
  `EnemyData` rows (e.g. `1110001` → `CH1_RaidBoss_CrystalCrab_Normal`) —
  the same 6-of-11 Chapter-1 raid bosses this app already shows (missing
  portrait art for all of them, see "Monster portrait recovery" above,
  still unrecovered) now have a confirmed, farmable item source and a
  real "Track on Map" tie into the Monsters tab.
- **`ChallengeTowerStageData`** (250 rows, floors 1-250 across multiple
  chapters) encodes its own reward directly as two parallel arrays
  (`reward_param_array`/`reward_amount_array`) with **no**
  `RewardGroupData` indirection at all — a flat, guaranteed reward per
  floor clear (Gold/Gem/Weapon Scroll, confirmed via the same `.Type`
  check), not a weighted roll.

**Two real, previously-shipped bugs found and fixed while re-auditing the
*existing* two source types for this same work** (not hypothetical —
both were live on the deployed site):
- **Guaranteed boss drops were using the wrong id space.**
  `idx.minimapRewardsByItem` keyed `MinimapRewardData` rows directly by
  their raw `reward_id` and the lookup in `computeFarmSources` then
  queried it by `StackableItemData.id` — but `reward_id` on a
  `StackableItem`-type row is in `.Type` space, the same convention as
  everywhere else in this pipeline, not `.id`. It had been silently
  "working" for exactly one row by coincidence (`reward_id 3` is Gem's
  real `Type`, but `.id 3` is BlueStone — so the app was showing BlueStone
  as having a guaranteed boss-kill source that actually belongs to Gem).
  Fixed by resolving `reward_id` through `idx.itemByType` before keying
  the map, matching the convention used everywhere else. Guaranteed-source
  coverage went from 1 real item to the correct 4 (Gem, Red Orb, Warrior
  Chest Key, S-Tier Chest Key).
- **Chest drop tables were silently missing half their own reward rows.**
  `computeFarmSources`'s chest loop only ever checked `RewardType === 4`
  (resolved via `.id`) — but a chest's own `RewardGroupData` bundles
  genuinely mix TWO reward codes in the same bundle: `RewardType 4` *and*
  `RewardType 1` (resolved via `.Type`, the same code found above). The
  `RewardType 1` rows (BlueStone, Weapon Scroll) were being silently
  dropped entirely — not shown as a 0% chance, just absent, since the
  `!== 4` check skipped them before any resolution was attempted. Fixed
  by resolving both codes; also skip `Rate === 0` rows (real rows this
  table carries — reserved/locked bundle slots, confirmed present but
  inert — that would otherwise render a confusing "0%" chance rather than
  being silently absent like before). Chest-source coverage went from 3
  items to 5 (added BlueStone and Weapon Scroll).

These two bugs were caught specifically *because* this session's new
`RewardType==1` discovery gave a reason to re-examine the two existing
reward-reading code paths side by side — worth remembering as a pattern:
when a new confirmed convention surfaces, re-check whether any *existing*
code already had the same field confusion.

**Confirmed-source coverage raised from 11/103 (the true pre-session
count — see honesty note below) to 25/103** catalog items — Monster
Drops 8, Guaranteed 4, Chest 5, Boss Raid 11, Challenge Tower 3, Hero's
Tomb 2 (some items appear under more than one source type).

**Honesty note on the coverage number**: this file's confidence table
previously claimed "21/103" for Farmable Items sources (4
guaranteed + 13 chest + 8 kill, 3 overlapping). Re-measured directly
against the live `computeFarmSources()` output before touching any code
this session and got **11/103**, not 21 — the "4 guaranteed" and "13
chest" figures were themselves already wrong in the committed app (the
two bugs above are exactly why: 1 real guaranteed item, not 4; 3 real
chest items, not 13). The doc had drifted from the real app state at some
earlier point. Corrected both in the same pass rather than leaving a
discrepancy for a future session to trip over.

**A real pre-existing data-staleness gap, also fixed**: `data/RewardGroupData.json`
in this repo was still the original 837-row table from the first
extraction (v25.3.0). The 2026-09-30 session had already pulled a fresh,
1019-row version from the v26.2.0 APK during its own investigation (per
that session's own notes) but never actually committed it — all of
today's new Boss Raid / Hero's Tomb groups (`200000`+, `90110101`+) only
exist in the newer table. Before swapping it in, checked for backward
compatibility the same way this project always does: diffed every
`RewardGroupData` row belonging to the 9 `Group` ids this app's existing
`ChestData` actually references (101-303) between old and new — byte-for-
byte identical, zero changes. Safe to replace outright. Also committed
`data/BossRaidStageData.json` (24 rows), `data/ChallengeTowerStageData.json`
(250 rows), `data/HeroTombRuneDropData.json` (80 rows) — all newly
extracted this session, converted from the raw schema-row format to this
app's usual typed-JSON convention (see `data/*.json` elsewhere).

**Shipped**: the 4 new/updated `data/*.json` tables above;
`idx.resolveRewardGroup()`, `idx.bossRaidDropsByItemId`,
`idx.towerDropsByItemId`, `idx.heroTombDropsByItemId` (`data.js`); the
`idx.minimapRewardsByItem`/chest-loop bug fixes (`data.js`/`ui-farmable.js`);
three new sections in the item detail modal ("Boss Raid Rewards",
"Challenge Tower Rewards", "Hero's Tomb Rewards") reusing the existing
"Track on Map" → `MonstersUI.openDetail` pattern for Boss Raid rows (a
real named enemy) and plain info rows for Tower/Hero's Tomb (no single
enemy to tie to — Tower fights an array of enemies per floor, Hero's Tomb
drops are keyed by monster *category* not a specific enemy id, so neither
forces a fake "track this monster" affordance it can't back up). Verified
end-to-end with Playwright: all three new sections render for real items
(Rune Dust/Gem/Weapon Scroll/Water Orb), "Track on Map" from a Boss Raid
row correctly opens Crystal Crab's own monster detail, zero new console
errors, and a full tab-by-tab sweep of the rest of the app confirmed no
regressions from either the RewardGroupData swap or the two bug fixes.

**Not pursued this session, for later**: `HeroTombRuneDropData` also
carries `gacha_reward_id`/`gacha_reward_count`/`gacha_reward_drop_rate`
fields alongside the `reward_id` this session resolved — a second,
unexplored bonus-roll layer, left as raw data rather than guessed at.
`RuneBreakRewardData`/`RuneLevelCostData` (both extracted, not yet
wired into anything) describe the cost/reward of leveling and
"breaking" a rune — real data for a future "model the actual Rune
system" feature, not touched here since it's genuinely new scope, not a
quick source-table addition like today's work.

## More item/monster location data (2026-10-01, same session follow-up)

User asked to keep digging for more item/monster location data right
after the Boss Raid/Challenge Tower/Hero's Tomb work above shipped.
Checked which of the 103 catalog items still had zero confirmed source
(78 of them) and went looking for which other real tables reference the
271 `RewardGroupData` groups none of the already-wired-in systems use.

**Found and wired in 6 more real reward tables**, all previously
unextracted, all resolving the exact same confirmed
`StackableItemData.Type` convention (verified zero-orphan on every row
actually used):
- `MissionCenterRewardGroupData` (19 rows) — already-resolved reward rows
  (no `RewardGroupData` indirection), `reward_param` → `.Type` directly.
- `InvasionWinStreakRewardData` (72 rows) — its own `reward_type` field
  holds the `.Type` code directly (misleadingly named; there's no
  separate "param" field on this table).
- `InvasionRankingTierRewardData` (162 rows) — `reward_group_id` resolves
  through the normal `idx.resolveRewardGroup` pipeline; real tier labels
  (`tier_type`: Bronze/Silver/etc., `period_type`: Daily, real
  `rank_range_min/max`) come straight off the row, not invented.
- `InvasionPassRewardData` (126 rows, `item_type===1` subset only —
  `item_type===7` rows also set `stackableItem_type` but to values that
  don't resolve to real items, almost certainly a different reward
  category reusing the field name, so those were left alone rather than
  guessed). **Caught and fixed a real display bug of my own making
  mid-session**: `unlock_level` carries a genuine sentinel value `-1` for
  rows actually gated by `unlock_point` instead (a separate point-
  milestone track alongside the pass's level track — confirmed by every
  `-1` row having a real, nonzero `unlock_point`) — the first version of
  this code rendered a nonsensical "unlock Lv.-1"; fixed to show the
  point threshold instead when `unlock_level === -1`, and added the real
  `group_order` (3 distinct pass "seasons") to each row's label since
  without it, 3 genuinely-different reward rows were rendering as
  identical-looking duplicates.
- `LuckySpinRewardData` (24 rows) — `reward_param` → `.Type`, weighted by
  `weight` within each `preset_id` (a spin wheel, not the `Rate`/
  `BundleGroup` convention the chest/raid tables use, so the weighting is
  computed by hand here rather than reusing `idx.resolveRewardGroup`).
- `SevenDayCarnivalRewardData` (49 rows) — `reward_param` → `.Type`, one
  fixed reward per `order` (day number), no weight field at all —
  deterministic like Challenge Tower floors, not a roll.

All six folded into one combined `idx.otherDropsByItemId` (same row
shape: `{source, title, pct, amount}`) rather than six separate indices,
since they're all genuinely the same kind of data — rendered in the item
detail modal as one "Other Confirmed Sources" section with each row's own
title naming its real mechanism (e.g. "Invasion Pass season 101 — unlock
Lv.11"), so nothing is blurred together despite sharing a heading.

**Looked at, deliberately left unresolved**: `LevelUpRewardData` (200
rows, player-level milestone rewards) has no `reward_param`/`.Type`-style
field at all — just a bare `reward_type` (values 0/1/3) with no other
table to cross-reference it against. The amount-scaling pattern per type
looked suggestive (type 0 scales with level like a currency, types 1/3
are small flat amounts like item counts) but that's pattern-matching, not
confirmation — left out entirely rather than guessed, per this project's
standing norm. Also found but not chased: `BossRaidRankingRewardData`,
`FivePackGiftRewardData`, `FootboardProductRVRewardData`,
`NewCostumeRevenuePassRewardData`, `ShopDynamicReward` (3,600 rows),
`ShopProductRewardData` (1,009 rows) — likely monetization/IAP-tied
systems (shop purchases, ranked-PvP payouts, revenue-pass tiers), lower
priority than the repeatable-gameplay sources above and genuinely large
tables to audit; real candidates for a future pass if more coverage is
wanted. Also checked whether the game's remote CDN (see "Monster
portrait recovery" above) has any `chapter4`+ open-world content that
might unlock more `EnemySpawnPoints` coverage — confirmed via the live
bucket listing that only `chapter2`/`chapter3` exist as remote scene
bundles (chapter 1 ships in the base APK) and nothing beyond chapter 3 —
the game genuinely hasn't shipped chapter 4+ open-world content yet, not
an extraction gap, consistent with `StageData`'s own chapters-1-3-only
coverage everywhere else in this app.

**Confirmed-source coverage raised from 25/103 to 34/103** catalog items.
Verified end-to-end with Playwright (new sections render correctly for
real items — Invasion Shop Coin, Expert Chest Key — the `unlock_level`
fix confirmed with a before/after check, zero console errors, full
tab-by-tab sweep clean).

## Chasing 100% item coverage, and where the line actually is (2026-10-01, same session)

User pushed further: "find as many monster and item locations... aiming
for 100% of item locations." Took this as license to exhaustively sweep
every remaining `TextAsset` table in the game for a reward connection,
not just the obvious "Reward"-named ones.

**Systematically confirmed every `*Reward*`-named table in the entire
game is now either wired in or explicitly, deliberately excluded** — ran
`grep` across the full ~380-table asset catalog for anything matching
`*reward*` and checked every single hit. Three more real, clean sources
found and wired in, all resolving via the same confirmed conventions:
- **`QuestData`** (1,122 rows — the single largest new source this
  session) — `Reward_Type_1`/`_2` are a real string enum
  (`E_ItemType`: `Exp`/`Rune`/`StackableItem`/`NONE`); when
  `StackableItem`, `Reward_Id_1`/`_2` hold the `.Type` code directly
  (confirmed across all 17 distinct values used, zero orphans —
  including `0`, which really is Gold's `Type`, not a null placeholder,
  so it was *not* mistakenly skipped). Real quest titles/descriptions
  resolved via the Locale table at extraction time
  (`QuestData.json`'s `Title_en`/`Desc_en`), the same convention every
  other `Name_en`/`Desc_en` field in this app already uses.
- **`BossRaidRankingRewardData`** (9 rows) — PvP leaderboard payout,
  `reward_group_id` resolves through the normal
  `idx.resolveRewardGroup` pipeline (every bundle is `Rate=100`, i.e.
  guaranteed once you place in that rank).
- **`FivePackGiftRewardData`** (49 rows) — same `item_type===1` →
  `stackableItem_type` → `.Type` shape as Invasion Pass. Its companion
  table `FivePackGiftSegmentData` was found and checked too, but
  **deliberately not used**: its `day_N_reward_group`/`final_reward_group`
  fields point at `RewardGroupData.Group` ids (101, 102...) that collide
  with ids `ChestData` already uses for unrelated chests —
  `RewardGroupData.Group` is evidently *not* a globally unique namespace
  per-system, so resolving this table's groups risked silently
  attributing a chest's own contents to this system instead. Skipped
  rather than risk a wrong source — this is also noted directly in the
  `data.js` code as a warning for future extensions of this same
  resolver.

**Two more found via a broader non-"Reward"-named sweep** (searched for
`daily`/`login`/`quest`/`gift`/`product` across the same catalog):
- **`FootboardProductRVRewardData`** (400 rows, "RV" = Rewarded Video —
  watch an ad) — a flat per-player-level table with fixed named currency
  columns instead of a generic type/param pair. Only
  `gem_amount`/`gold_amount`/`elixer_amount` map to real catalog items;
  `crystal_amount` and 4 `soulstone_N_amount` columns reference
  currencies with **no matching `StackableItemData` row at all** (a
  premium-currency system this app's catalog genuinely doesn't track,
  not an extraction miss) — those 5 columns are skipped.
- **`NewCostumeRevenuePassRewardData`** (41 rows) — same shape as
  Invasion Pass, gave this app's first confirmed source for Hero Coin
  (item id 56). Also has the same `-1` sentinel pattern Invasion Pass's
  `unlock_level` had — caught and fixed *before* shipping this time
  (learned from the Invasion Pass mistake earlier this session): this
  table has no companion points field at all (unlike Invasion Pass),
  so the single `-1` row is labeled "no level gate" rather than
  inventing a points narrative the data doesn't support.

**A genuine new "location" discovery, not yet wired into any UI**: the
sweep for "gift"/"spawn"-named tables also turned up
`GiftChestData` (1,160 rows, a per-player-level reward table — Gold/Gem/
Elixir, all already-covered items, so no new catalog coverage) and
**`GiftChestSpawnData`** (59 rows) — a genuine **in-world spawning
treasure chest mechanic**, completely distinct from the static
`ChestData` (chests fixed to a stage) and `MinimapRewardData` (guaranteed
boss drops) this app already models: real `Chapter`/`MinLevel`/
`MaxLevel`/`SpawnRate`/`RespawnTime`/`LifeTime` fields, with weighted
`SpawnerIds` picking which numbered spawn point in the world gets an
active chest. Checked the Chapter 1 world scene file (same one
`EnemySpawnGroups` was extracted from in the 2026-09-30 session) and
found the real spawner GameObjects — 16 confirmed, real `GiftChestSpawner`/
`GiftChestSpawner (N)` nodes, extracted using the exact same
Transform-walk technique as `EnemySpawnPoints.json`, converted into the
same `EnemySpawnGroups`-relative coordinate frame so they're directly
comparable/plottable alongside the existing enemy spawn scatter data.
Saved as `data/GiftChestSpawnPoints.json` (16 rows: `chapter`, `name`,
`x`, `z`) — **committed but not yet loaded by the app or wired into any
UI**, consistent with this project's precedent for "extracted, real, but
a genuinely new feature to surface, not a quick addition" (see the Rune
tables above). Chapters 2-3 almost certainly have their own
`GiftChestSpawner` sets too, but (like their enemy-spawn counterparts)
that data only exists in the remote-CDN `chapter2`/`chapter3` scene
bundles, not the base APK — not fetched this session, flagged in Open
Items.

**Checked but deliberately left out of the "farmable" count, with
reasoning — corrected 2026-10-01, see "Shop Exclusive marking" below**:
- `ShopDynamicReward` (3,600 rows) and `ShopProductRewardData`
  (1,009 rows), plus their newly-found companions `ShopProductData`
  (777 rows) and `ShopProductCostData` (829 rows) — traced the full
  chain. **This session's first pass at this got the conclusion wrong**:
  it read `ShopProductCostData.cost_type` (only ever `1` or `2`) as
  "real money or Gems, never free" without actually checking what those
  two cost *types* pay in. The real, verified breakdown (done properly
  in a same-day follow-up, see "Shop Exclusive marking"): only **12 of
  829** cost rows (`org_price_iap > 0`) are real money — the other 817
  are priced in ordinary in-game currencies (Gold, Gems, Chest Keys,
  Orbs, Shards, Raid Tokens, Invasion Shop Coin...), i.e. this "Shop" is
  overwhelmingly an in-game *crafting/exchange* system, not an IAP
  storefront. Still correctly kept **out of the farmable-source count**
  (spending currency isn't "farming," and conflating the two would
  misrepresent what this tab answers) — but now surfaced explicitly as
  "Shop Exclusive" with its real cost, instead of silently excluded, once
  a direct user request asked for exactly that. This is also where the
  "Weapon/Melee/Ranged/S-Rank Selection Chest" and "Hero Shard Pack"/
  "Hero Shard Selection Box" catalog items actually come from — confirmed
  via their `reward_group_id`s, not guessed.
- `LevelUpRewardData` — re-confirmed still unresolvable (see earlier in
  this file), no new angle found.
- The 6 remaining tiered "Weapon Scroll (Fine/Rare/Epic/.../Exotic)"
  catalog rows (ids 14-20, `Type` 302-308) were searched for specifically
  across every table touched this session (`RewardType==1`'s full
  distinct param list, `QuestData`, every other direct-`.Type` field) and
  found **nowhere** — the base "Weapon Scroll" (`Type 301`, no rarity
  suffix) has several confirmed sources, but these tiered variants don't
  appear as a reward anywhere in the data. Most likely obtained by
  converting/crafting lower scrolls into higher ones (a mechanic this
  app doesn't model), not a drop — shown honestly as zero-source rather
  than incorrectly attributed to the base Weapon Scroll's sources.

**Where this leaves "100%"**: every `*Reward*`-named table in the game
has now been checked (wired in or excluded with a real reason), plus a
broader sweep for non-"Reward"-named reward tables. The **67 items still
showing zero source are not a research gap** — 44 are shop-exclusive
(Selection Chests/Shard Packs, confirmed via `ShopProductData`), 6 are
"Eternal Stone" weapon-crafting materials and 2 are "Gold Sack"/"Gold
Package" (same shop system, not individually traced further since the
pattern is already established), 6 are tiered Weapon Scrolls (crafting-
only, not a drop), and the remaining handful (Challenge Ticket, Raid
Ticket, Heroes' Tomb Ticket, Home Return Portal Ticket ×2, Rv Skip
Ticket, Evolution Potion, Stone) didn't surface in anything checked this
session — real remaining gaps, but a short, specific list rather than a
vague "more to find." **36/103 items have a confirmed, real,
gameplay-earned source** — this is very close to this game's actual
ceiling for "earnable without spending money or converting currency,"
not an incomplete search.

## Shop Exclusive marking (2026-10-01, same session follow-up)

User asked directly: for items with no farm source, mark them as Shop
Exclusive in the UI so visitors know where to actually get them, rather
than leaving a bare "source not identified." This meant going back and
properly resolving `ShopProductRewardData`/`ShopProductData`/
`ShopProductCostData` instead of the shallow pass above that stopped at
"every row costs real money or Gems, never free" — which **turned out to
be wrong** once actually checked field-by-field (see the correction in
the confidence table and "Chasing 100% item coverage" above).

**What's really in `ShopProductCostData`**: `org_price_iap` (a real
cents-value real-money price) is nonzero on only **12 of 829** rows —
the other 817 are priced in ordinary catalog currencies via `cost_param`
(resolved through the same `.Type` convention as everything else in this
pipeline — Gold, Gems, Chest Keys, Orbs, Shards, Raid Tokens, Invasion
Shop Coin). Concretely: `Eternal Stone Dagger` costs 20 Earth Orb + 20
Night Orb + 20 Leaf Orb (a real crafting recipe, built entirely from
already-farmable materials, not a cash purchase at all). This is a
genuinely more useful and more accurate "where do I get this" answer
than "excluded as IAP" — it just isn't *farming* in the sense this tab's
other sections mean, so it stays a clearly-separate, clearly-labeled
fallback rather than folding into the main source count.

**Resolution chain** (precomputed in Python at extraction time, not
replicated client-side — too many cross-table joins to do cleanly in
JS): `ShopProductRewardData.item_id` (when `reward_type===1`) resolves
via `.Type` exactly like every other source in this app, giving which
item a given shop listing's `group_id` sells; `ShopProductData.reward_group_id
=== ShopProductRewardData.group_id` (a per-shop-system namespace,
**not** the shared `RewardGroupData.Group` table every other source uses
— confirmed by checking: resolving `ShopProductData.reward_group_id`
against `RewardGroupData` instead, as an earlier same-session draft of
this code briefly did, returned *coincidentally real-looking but wrong*
results, the same `Group`-id-collision risk already flagged for
`FivePackGiftSegmentData` — caught and fixed before shipping, not
after) ties a listing to its real product; `ShopProductData.cost_group_id
=== ShopProductCostData.group_id` gives its real cost(s); only
**currently-`enable==TRUE`** products are used, and zero-value cost rows
(a placeholder pattern seen elsewhere in this app's reward tables) are
filtered out. The "which reward_type values are safe to trust" check
itself was done per-row (does *this specific* `item_id` resolve via the
globally-unique `.Type` space), not per-table — `reward_type` values
2/5/6/7/9 mix real `StackableItem` references with ids from some other,
unidentified category in the *same* bucket, so only rows that
individually resolve cleanly were kept, from any `reward_type`. This
raised the confirmed shop-item count from the 21 found checking only the
single cleanest `reward_type` to a real **24** once mined more carefully
(added Stone, Gold Sack, Gold Package).

**Shipped**: `data/ShopItemSources.json` (new, precomputed table — item
id → up to 5 real cost-option strings, cheapest first), `idx.shopCostsByItemId`
(`data.js`), and in `js/ui-farmable.js`: grid cards for zero-farm-source
items now show a gold "🛒 SHOP EXCLUSIVE" tag instead of a bare "source
not identified" when shop data exists; the item detail modal gains a
matching "🛒 Shop Exclusive" section (dashed gold border, same
visual-distinction pattern Community Reports already established for
"this is a different kind of source," so a shop listing is never
confused with a real drop) showing the real purchase cost(s) and an
honest caveat that this app doesn't track every price tier or whether a
listing is time-limited. Deliberately **not** counted toward the
"known sources" number shown elsewhere — a currency purchase isn't
farming, and blurring the two would misrepresent what the rest of this
tab is answering. Verified end-to-end with Playwright: 24 items
correctly tagged on the grid, detail modal renders real cost data for
Eternal Stone Dagger/Hero Shard Selection Box/Raid Ticket, items that
are genuinely unresolved (e.g. Weapon Selection Chest) correctly still
show "source not identified" rather than being over-tagged, zero console
errors, full tab sweep clean.

## Craftable items (2026-10-01, same session follow-up)

User asked a direct follow-up: items obtained through crafting should be
marked "Craftable" with their required ingredients, distinct from a
plain Shop purchase. This meant going back into the same
`ShopProductData`/`ShopProductRewardData`/`ShopProductCostData` chain
"Shop Exclusive marking" had just resolved and applying a stricter,
different signal: a real **recipe** is a single product listing whose
cost is **2+ distinct item types at once**, not a single
item/currency paid in some quantity. "170 Gem" is a currency purchase;
"20 Earth Orb + 20 Night Orb + 20 Leaf Orb" is a recipe.

**A real false-positive was caught and filtered before shipping**: a
naive first pass flagged already-farmable items like Gold, BlueStone,
and Weapon Scroll as "craftable," each apparently costing "1 EXP + 50
Gem." `EXP` (catalog item id 4) turned out to be a near-universal 1-unit
"tax" tacked onto dozens of unrelated generic Gem-purchase listings
across the whole shop table, not a meaningful recipe ingredient —
excluding it from the ingredient count dropped these false positives
immediately, leaving only genuine multi-material recipes.

**Result: exactly 7 items in the whole game have a real crafting
recipe** — the 6 **Eternal Stones** (Dagger/Sword/Mace/Crossbow/Gun/Wand,
each a 3-Orb recipe, e.g. Eternal Stone Dagger = 20 Earth Orb + 20 Night
Orb + 20 Leaf Orb — confirmed consistent with the item's own real
description, "Used for Eternal Dagger merge") and **S-Tier Chest Key**
(1 of each of the 6 Orb types). S-Tier Chest Key is a special case worth
noting: it *also* has a real farm source (Boss Raid Ranking rewards,
found in "Boss Raid / Challenge Tower / Hero's Tomb rewards" above) — both
are genuinely true at once, so its detail view shows both sections
rather than picking one. The 6 Eternal Stones move out of the Shop
Exclusive bucket entirely (they were there before this session) since
"Craftable" is the more specific and accurate label for them.

**Shipped**: `data/CraftableItems.json` (new, precomputed — item id →
ordered ingredient list of `{item_id, amount}`, using real item ids so
the UI can link to each ingredient's own detail, not just show a name);
`data/ShopItemSources.json` regenerated to exclude the now-reclassified
6 Eternal Stones; `idx.craftRecipeByItemId` (`data.js`); in
`js/ui-farmable.js`: grid cards for craftable items show a green "🔨
CRAFTABLE" tag (takes priority over the known-source count, since it's
the more specific/actionable answer); the detail modal gains a matching
"🔨 Craftable" section (dashed green border, its own color distinct from
both the blue Community Reports and gold Shop Exclusive treatments) —
each ingredient row shows the real item's icon/name/amount and a "View
Item" button that jumps straight to that ingredient's own detail via
the existing `openDetail()`, so a user can trace a full recipe chain
(e.g. click into Earth Orb to see where *that* farms from) without
leaving the tab. Verified end-to-end with Playwright: 7 cards correctly
tagged, Eternal Stone Dagger's 3 ingredients render with working
click-through, S-Tier Chest Key correctly shows both its farm sources
and its recipe in the same modal, zero console errors, full tab sweep
clean.

## More missing artwork recovery (2026-10-01, same session follow-up)

User asked to keep chasing the remaining missing art (40 enemy portraits,
7 item icons at the time) and specifically floated the right lead: some
assets are downloaded by the game at load time — the same live
`weaponrpg-game-data` CDN discovered in "Monster portrait recovery"
above. Picked that back up: re-fetched a **fresh** bucket listing
(1,806 objects now, up from 1,772 — the live game updated since that
session) and downloaded today's newest Addressables catalog
(`addressables/21f79b6b.../Android/catalog_21f79b6b....json`, built
2026-10-01, one day newer than the one used previously).

**Confirmed via the catalog that the 7 missing item icons
(`Stackable_WeaponScroll_{Fine,Rare,Epic,Legendary,Ancient,Mythic,Exotic}`)
are real, individually-addressable keys** (`ArcadeWorld/Stackable/
Stackable_WeaponScroll_<Tier>`) — unlike the enemy faces, these aren't
embedded-only sub-assets. Chased down which bundle actually holds them:
checked the base+split APK first (confirmed absent — only the "Normal"
tier has a real `Sprite`/`Texture2D` locally; the other 7 tiers exist
only as unrelated 3D world-pickup prefabs whose `SpriteRenderer`
references a generic "WhiteCircle" shadow decal, not the item's own 2D
icon, so there was genuinely nothing to extract from those prefab files
despite the name match), then downloaded and fully enumerated **all 15
remote bundles under the newest build hash** (≈83MB total: bossraid,
bossraid_outgame, chapter2, chapter2_enemy, chapter3, chapter3_enemy,
herotomb, herotomb_outgame, and 6 `liveopsevent_*` bundles, two of them
brand new since the last session — `chapter2_enemy`/`chapter3_enemy`
didn't exist in the Sep-30 listing) — **zero matches for any Weapon
Scroll tier sprite in any of them.** These 7 icons remain unrecovered;
the bundle that actually holds them (if any single one does — Unity
Addressables can also duplicate small shared UI assets across several
groups rather than owning them in exactly one place) wasn't identified.
Properly resolving this would need decoding the Addressables catalog's
binary `m_BucketDataString`/`m_EntryDataString` fields for a real
key→bundle lookup instead of brute-force bundle enumeration — not done
this session (see Open Items).

**The same 15-bundle sweep did recover 2 more enemy portraits**, found
by broadening the earlier session's search beyond just the 2 bundles
checked back then: `liveopsevent_bossraid_ranking_assets_*.bundle` (a
bundle that didn't exist to check in the prior session — it's new to
the live CDN) contains `Face_Skin_DevilHunter` and `Face_Skin_Elf`,
matching 2 of the still-missing Hero's Tomb "shadow hero" costumes
(`HeroTomb_Costume_DevilHunter`, `HeroTomb_Costume_Elf`) via the same
confirmed `Face_Skin_<Name>` convention established last session.
Extracted at real portrait resolution (248×220 and 235×210 — clearly
real face art, not a UI-fragment false positive like the rejected
`Face_Elf_0` from last session) and saved as
`HeroTomb_Costume_DevilHunter.png`/`HeroTomb_Costume_Elf.png`.

**Confirmed genuinely still absent, not just unreached**: searched every
one of the 15 downloaded bundles' full `Sprite`/`Texture2D` name list
(not a targeted grep — the complete list was enumerated and checked)
for every remaining missing name. Zero matches anywhere for the 11
`Face_CH1_RaidBoss_*` enemy faces, the 11 `Face_HeroTomb_*` enemy faces,
or 11 of the remaining 13 `HeroTomb_Costume_*` names (Berserker,
Cactus, Cat, Cop, Cow, Cupid, Dragon, Pirate, Guardian, Princess,
Ranger, Skull — 6 of these happen to share a name with an existing
playable hero this app already has real portrait art for, but that art
was deliberately **not** reused as a stand-in here, consistent with
last session's explicit reasoning: no real evidence ties a Hero's Tomb
"shadow" reskin's face to the base hero's own portrait art, so
substituting it would be presenting a guess as fact).

**Shipped**: `HeroTomb_Costume_DevilHunter.png`, `HeroTomb_Costume_Elf.png`
in `assets/img/enemies/` — no code changes needed, same as every prior
portrait recovery (`Game.enemyIcon()` resolves by filename directly).
Missing-enemy-portrait count: 42 → **40**. Missing-item-icon count
unchanged at 7 (searched hard, confirmed not recoverable from any
currently-known bundle). Verified both new files serve correctly.

## Why Anubis's art specifically was missing — found and fixed (2026-10-01, same session)

User asked directly why the Chapter-1 raid boss art (naming Anubis) kept
coming up empty despite the exhaustive bundle sweep above. This had a
real, findable answer rather than just "the asset doesn't exist" —
investigated properly instead of repeating the prior conclusion.

**Root cause**: `EnemyData.IconSprite` for these bosses follows the
game's standard per-chapter-enemy naming convention
(`Face_CH1_RaidBoss_Anubis`, matching every other enemy's
`Face_CH<N>_<Name>` pattern) — and that convention's real asset group,
`ArcadeWorld/EnemyFace`, genuinely has zero Raid Boss entries (confirmed
again against today's freshest catalog). But the *data field* following
that naming convention doesn't mean the *art* was ever produced under
that name. Boss Raid is a flashier, separate feature with its own
dedicated promotional "boss reveal" key art, shipped under a
**completely different naming scheme** (`Img_<Name>`/`Img_<Name>_Glow`)
in a bundle this session had already downloaded for the Shop Exclusive
work (`bossraid_outgame_assets_*.bundle`) but had only grepped for
narrow target strings in, not read as a full unfiltered list — the
earlier "More missing artwork recovery" pass's bundle sweep checked for
the *expected* name pattern and found nothing, which is a different
conclusion from "the art doesn't exist."

Dumping that bundle's **complete** Sprite name list (137 real UI/art
asset names, not filtered) turned up `Img_Anubis`, `Img_Anubis_Glow`,
`Img_BloodLord(_Glow)`, `Img_Cerberus(_Glow)`, `Img_CrystalCrab(_Glow)`,
`Img_FrozenBloom(_Glow)`, `Img_Rosalia(_Glow)` — real, high-resolution
(≈330-510px), full-body character key art for exactly the **6 raid
bosses that have active `BossRaidStageData` difficulty-tier rows**
(Normal/Hard/Extreme/Hell — see "Boss Raid / Challenge Tower / Hero's
Tomb rewards" above). Confirmed by inspecting the real prefab's own
component tree first (`CH1_RaidBoss_Anubis_Normal` in
`bossraid_assets.bundle` — Transform/MonoBehaviour(combat
stats)/SphereCollider/Rigidbody/NavMeshAgent, no icon-holding component
at all on the 3D prefab itself) that the face icon was never going to be
attached to the monster prefab the way a regular numbered-chapter
enemy's is — it lives entirely in the separate menu/lobby ("outgame")
UI bundle instead, as dedicated promotional art, not a generic face
icon.

**Why the other 5 (`Coffin`, `ExplosiveMummy`, `FrostBud`, `IceFlower`,
`Mummy`) are still genuinely missing, confirmed not just unfound**:
searched for `Img_<Name>`/`Img_<Name>_Glow` (and a looser substring
match) for all 5 across all 15 downloaded bundles — zero hits anywhere.
These 5 have no `BossRaidStageData` rows at all (no difficulty tiers,
not part of the currently-active Boss Raid rotation) — consistent with
them simply never having received this same dedicated key-art treatment
because they aren't live/rotating content in the current build, not a
gap in this extraction.

**This art is full-body "key art," not a tight face crop** like the
regular per-chapter enemy icons — an honest visual difference from the
rest of the Monsters tab grid, shown as-is (not cropped or altered)
rather than force-fit to match, consistent with this project's norm of
presenting real extracted art exactly as shipped.

**Shipped**: `Face_CH1_RaidBoss_{Anubis,BloodLord,Cerberus,CrystalCrab,
FrozenBloom,Rosalia}.png` in `assets/img/enemies/` — no code changes.
Missing-enemy-portrait count: 40 → **34**. Verified end-to-end with
Playwright: all 6 files serve correctly, Anubis's own Monsters-tab
detail view renders the real portrait.

## Exhausted the remaining 34 — confirmed genuinely unrecoverable, not just unfound (2026-10-01, same session)

User asked to re-check the Monsters tab for everyone still missing art
and apply the same technique that found Anubis (reading a bundle's full
sprite list rather than grepping for the expected name) to the rest.
Did exactly that — a much more thorough pass than "More missing artwork
recovery" above, including two new leads that turned out to be real
dead ends, confirmed rather than assumed.

**Pass 1 — broad re-search across all 15 current bundles.** Dumped
every `Sprite`/`Texture2D` name from all 15 downloaded bundles into one
combined list (3,288 rows) and grepped it for every remaining missing
enemy's core name (Coffin, ExplosiveMummy, FrostBud, IceFlower, Mummy,
and all 11 Hero's Tomb enemy names + 13 costume names), plus manually
read the complete list of every `Img_`-prefixed sprite across all 15
bundles end to end (the exact convention that found Anubis). Zero
genuine hits — every apparent match was a false positive from loose
substring matching (e.g. "Cop" matching "Copy", "Skull" matching an
unrelated generic UI icon).

**Pass 2 — checked whether this live CDN prunes old content, using the
real file-size history as a signal.** The bucket listing's own historical
entries revealed `herotomb_assets_*.bundle` was **16.3MB in the earliest
available build (2026-09-07/08) vs. 11.5MB today** — a genuine ~5MB drop,
a real lead worth chasing (unlike the false-positive greps above).
Downloaded the oldest available version and compared directly: the
`Sprite` list is **byte-identical** between old and new (same 117 names) —
the size difference comes entirely from 3D content (the old build has
15,158 GameObjects/8,439 MeshRenderers vs. far fewer now, almost
certainly duplicate/unoptimized monster prefabs that got cleaned up),
not any removed 2D icon. Checked the same history for
`bossraid_outgame_assets` too (where Anubis's real art was found) and
downloaded its own oldest available version (2026-09-09) — same result,
the extra 5 raid bosses (Coffin/ExplosiveMummy/FrostBud/IceFlower/Mummy)
aren't in that older build either.

**Pass 3 — inspected real GameObject component trees directly**, the
same technique that explained *why* Anubis's icon wasn't on the monster
prefab itself. Checked `HeroTomb_Bear`, `HeroTomb_Lich`, `HeroTomb_Spider`,
and `HeroTomb_Costume_Berserker`'s real prefabs (in the old, larger
build) — every one has the exact same component shape as the Boss Raid
monsters (Transform + a combat-stats MonoBehaviour + physics/nav
components, nothing icon-holding). Combined with `herotomb_outgame`'s
own full sprite list (dumped in the prior session — 137 names, all
generic "Tomb Of Heroes" UI chrome, not a single per-monster name) and
the real generic tier-badge icons that DO exist there
(`Icn_Tomb_Of_Heroes_Monster_Boss`/`_Elite`/`_Nomal`), the most likely
real explanation: **Hero's Tomb's live UI shows a generic Boss/Elite/
Normal tier badge per monster, not an individually-illustrated portrait**
— unlike Boss Raid, which has a small, curated roster of named bosses
worth a dedicated "reveal" splash image each. If that's right, there
may be no 2D per-monster art to find for Hero's Tomb at all, in any
build, because the live game itself may never render one.

**Conclusion, stated plainly**: the remaining 34 (5 Chapter-1 raid
bosses with no active `BossRaidStageData` rows + 11 Hero's Tomb enemy
faces + 13 Hero's Tomb costume faces — the `Face_HeroTomb_Elf _Archer`
entry's odd embedded space is the data's own typo, not an extraction
artifact) are now backed by real, multi-angle negative evidence — not
merely "not found in a grep" but "checked under every naming convention
discovered so far, checked historical versions for pruned content,
and checked the actual prefab component trees for an unnamed
reference" — across every bundle this live CDN currently serves. No
further leads identified this session. If more art ever surfaces, it
would most likely require either a fresh APK/CDN snapshot after a
future game update that adds Hero's Tomb portrait art for the first
time, or decoding the Addressables binary catalog properly instead of
bundle-content enumeration (still not done — see Open Items).

## Auto-sync cloud saves (2026-10-01)

User asked for a real behavior change plus reported a real bug in the
same message: (1) signing in should automatically load the newest cloud
save, (2) local changes should automatically keep that save updated, and
(3) signing out should clear the on-screen build — and separately
reported that signing out was actually leaving the previous account's
heroes/weapons visible, which they'd noticed directly. This is a
deliberate reversal of the accounts feature's original manual-only
design (see "Accounts backend" above) — the user was told the tradeoff
explicitly in the UI copy (now updated) rather than silently assumed.

**The sign-out bug was real and simple**: `onAuthChange()` only ever
re-rendered the header/profile tab on a sign-out transition — it never
touched `State.data` at all, so whatever was loaded (locally, or from a
previously-loaded cloud save) just stayed on screen. Fixed by calling
the same `State.resetAll()` the "Reset" button already uses, on the
`Auth.user` → signed-out transition specifically (tracked via a new
`_wasSignedIn` flag on `AccountUI`, since `Auth.subscribe` also fires
for unrelated re-renders, not just real sign-in/out transitions).

**Auto-sync design**: `AccountUI.activeSaveId` is the one cloud save
this device currently mirrors — set on sign-in (to the newest save, or
a freshly-created one if the account has none yet), on "Save as New
Build," or on "Load." Every `State.notify()` call (the single hook point
already used for both persistence and re-rendering) schedules a
debounced (1.5s) `PUT /saves/:id` via a new `scheduleAutoSave()`/
`_doAutoSave()` pair — one hook covers every kind of edit (weapons,
heroes, traits, upgrades) with no per-feature wiring needed, same as how
local persistence already works. A `_suppressAutoSave` flag guards the
one case that would otherwise immediately re-save data right back where
it came from: programmatically importing a just-loaded cloud save.

**Honest tradeoff, stated plainly** (and now in the Profile tab's own
caveat text, not just here): auto-load-on-sign-in **replaces** whatever
was on screen, including unsaved local-only progress if a newer cloud
save exists — this is exactly what was asked for, not an oversight, but
it is a real behavior change from the old "nothing here can silently
overwrite your current local build" guarantee. Export remains available
as an auto-sync-independent manual backup for anyone who wants one.
First-time sign-in with no cloud save yet does the safe thing instead —
pushes whatever's currently local up as the first save, so no data is
lost and future edits have somewhere to sync to.

**Shipped**: `AccountUI.activeSaveId`/`syncOnSignIn()`/
`scheduleAutoSave()`/`_doAutoSave()`/`_renderSyncStatus()` in
`js/ui-account.js`; a small "☁️ Synced HH:MM:SS" / "⚠️ Cloud sync
failed: ..." status line in the Profile tab, updated after every sync
attempt; an "ACTIVE" tag on whichever cloud save in the list is
currently being auto-synced; `saveCurrentBuild()`/`loadCloudSave()`/
`deleteCloudSave()` all updated to keep `activeSaveId` correct when the
user manually creates/switches/removes a save; the Reset confirmation
dialog (`js/ui-importexport.js`) now warns when it's also about to
overwrite an active cloud save. No server changes — `PUT /saves/:id`
already existed and already does exactly a "patch this save's data"
operation.

**Verified fully end-to-end against the real production backend and
real database** (not a mock): registered a fresh test account with zero
existing cloud saves → confirmed `syncOnSignIn()` auto-created the first
save from local state → called `State.addHero()` directly (a real local
change) → waited past the debounce window → fetched the save directly
from the live API and confirmed its hero count matches local → signed
out → confirmed local hero count dropped to 0 (the bug, fixed) → signed
back in → confirmed the hero reappeared and `activeSaveId` resolved to
the same save. Zero new console errors across a full tab sweep.
Test account deleted from the real `shared_postgres` database afterward
(`DELETE FROM users WHERE email LIKE 'playwright-test%'`, cascades to
its save via the FK) — same cleanup discipline as every previous
against-production test in this project.

## Mobile layout (2026-10-02)

User asked for "a mobile app version of the page that loads when a user
accesses the site from a mobile phone or tablet and the regular page
loads when accessed by a PC," pointing at the `YourSpace` project's
`MobileNav.jsx` for inspiration. That component turned out to be a
useful pattern reference but NOT a literal template: YourSpace's own
"mobile app" is itself just one React SPA with a component conditionally
shown via Tailwind's `md:hidden` breakpoint class — i.e. one codebase,
CSS-breakpoint-driven layout swap, not a server-side device split or a
separate bundle. That's the right model for HeroBuilder too (GitHub
Pages can't do real server-side UA sniffing anyway, and a true second
page/bundle would mean keeping two copies of every tab's logic in sync)
— so this shipped as a pure CSS-media-query layer on the EXISTING
single `index.html`/`style.css`/vanilla-JS app, no build step or
framework introduced, adapting YourSpace's fixed-top-bar +
fixed-bottom-tab-bar + compact-overflow-menu interaction pattern rather
than porting any of its code.

**What changed, under `@media (max-width: 860px)`** (phones and
portrait tablets; desktops/landscape tablets above that width see the
unchanged existing layout):
- The header shrinks to brand + Sign In/Off + a new "⋮" button. The 6
  main tabs (`#tabs`'s pill row) are hidden via
  `#tabs > .tab-btn:not(.tab-btn--profile) { display:none }` — note this
  keeps `#tab-profile` itself untouched and still fully functional
  (same real element, just restyled by the surrounding rule going
  transparent), so signed-in profile access needs no duplicate markup
  or extra JS at all.
- A new fixed bottom tab bar (`<nav id="mobile-tabs">` in `index.html`,
  `.mobile-tabbar`/`.mobile-tab-btn` in `style.css`) holds the 6 main
  tabs as icon+label buttons. Each button reuses the existing
  `.tab-btn` class and `data-tab` attribute, so `app.js`'s
  `setActiveTab()` (already a blanket `document.querySelectorAll('.tab-btn')`,
  not scoped to the desktop `#tabs` container) keeps it in sync for
  free — the only new JS is a second `wireTabClicks('mobile-tabs')`
  call (factored out of the existing inline listener into a tiny
  reusable `wireTabClicks(containerId)` helper that both the desktop
  and mobile nav now call) and `env(safe-area-inset-bottom, 0px)`
  padding for iOS home-indicator clearance.
- Import/Export/Reset (no room for 3 extra buttons on a phone-width
  header) move into a "⋯"-triggered modal — reusing the app's own
  existing `UI.openModal()` system (not a new dropdown component) and
  calling the real `ImportExportUI.exportFile()`/`.reset()` methods and
  the real hidden `#file-import` input directly, so there's no
  duplicated import/export/reset logic anywhere — the mobile menu is
  pure wiring, zero new business logic.
- `main`'s bottom padding and the toast's bottom offset both account for
  the new fixed bar's height + safe-area inset so neither gets hidden
  behind it. Virtual-keyboard-avoidance (which YourSpace's `MobileNav`
  handles via a `visualViewport` resize listener) was deliberately
  **not** ported — checked first whether HeroBuilder has any main-page
  text inputs a keyboard could cover, and it doesn't: the only text
  inputs are the auth modal's email/password fields and the "Report a
  Find" modal's two text fields, both already inside a modal (z-index
  100) that sits above the bottom bar (z-index 50) regardless, so there
  was no real problem to solve by porting that complexity.
- Existing picker/roster grids (`auto-fill`/`minmax` CSS Grid) and
  several components' own pre-existing narrow-viewport media queries
  (`.equip-rig`, `.upgrade-row`, `.detail-layout`, `.guide-layout`,
  `.de-row`) already reflow correctly at phone width — verified via
  Playwright screenshots at an iPhone-13-sized viewport (Weapons,
  Monsters, Farmable Items, Equipment, Guide tabs) and a tablet-portrait
  width (810px), not just assumed from reading the CSS.

**A real, substantial pre-existing bug found and fixed in the process
(not caused by this mobile work, but only ever visible at a narrow
viewport, which nothing had tested before)**: switching to the Monsters
tab at a 390px-wide viewport made `window.innerWidth` itself balloon
from 390 to 514px — confirmed via Chrome DevTools Protocol's
`Page.getLayoutMetrics()` that the browser's **layout viewport**
(`clientWidth`) was inflating to 514 while the real **visual viewport**
stayed correctly pinned at 390 (`scale:1`), i.e. a genuine "page content
forces the layout viewport wider than the device" condition, not a
measurement artifact — confirmed reproducible with zero Playwright
clicks involved (triggered purely by `State.setTab('monsters')`), and
confirmed NOT caused by any single oversized element (an exhaustive
`getBoundingClientRect()` sweep of every element under
`#panel-monsters` found nothing wider than its 362px-wide grid
container). The 245-card unpaginated Monsters grid produces a very tall
page (~22,000px), and this is a known class of mobile-browser behavior
where an extreme-aspect-ratio page can trigger the layout viewport to
re-expand horizontally in a way that doesn't fully reproduce from
inspecting individual element widths — rather than keep chasing the
exact internal trigger, applied the standard, broadly-safe fix:
`overflow-x: hidden` on `html, body` (previously absent from this
app's CSS entirely). Verified via the same CDP layout-metrics check
that this fully pins `layoutViewport`/`contentSize.width` to 390 across
all 6 tabs post-fix, with no loss of any content (nothing in this app
relies on intentional horizontal page scroll — all internal
horizontal-scroll surfaces like the map canvases use their own
`overflow` containers, untouched by this change). Without this fix, the
new fixed-position bottom tab bar (`left:0;right:0`) would stretch to
match the inflated layout viewport on the Monsters tab specifically,
visibly hanging off the right edge of the real screen — this is also
why plain visual-only testing (screenshots at just the Weapons tab, as
an easy first smoke test) would have shipped this bug: it only
reproduces on the one unusually-tall, unpaginated tab, which is exactly
why this project's `CLAUDE.md` methodology note (Playwright testing
across every tab, not just the one feature touched) exists.

Verified end-to-end with Playwright across both the new mobile layout
and the unchanged desktop layout in the same test run: mobile bottom-nav
tab switching (`active` class sync confirmed on the real button
elements, not just the panel), the "⋯" overflow modal opening and its
3 actions correctly wired, zero horizontal overflow on any of the 6
tabs at phone width, the profile-avatar-in-header path untouched and
still functioning, and a full desktop-viewport pass confirming the
mobile nav stays `display:none` and the original header/tabs/actions
render exactly as before (no regression from the new CSS/markup).

## Slider step buttons (2026-10-02)

User asked for "a set of buttons on any screen with a slider for
adjusting levels one stat at a time rather than having to click on the
slider every time... this would also help make the adjustments more
accurate" — i.e. every bare `<input type=range>` in the app needed
−/+ step buttons alongside it so a single click nudges the value by
exactly 1, instead of needing to re-grab and drag the handle precisely
(especially painful on a long range like a weapon's 1-130 level, or a
touchscreen).

This app already had two different existing patterns for numeric
controls: a bare slider + readout (`.level-control`, used for hero
level/star/evolution and weapon level) and a full −/+-button-plus-
number-input `.stepper` (already used for the Ability/Extra/Special/
Soul upgrade trees in the Equipment tab, which was never a slider to
begin with). This request was specifically about the slider case —
the stepper-based Equipment rows already had click-to-adjust buttons
and needed no change.

**Shipped**: two new shared helpers in `js/ui-common.js`,
`levelControlHTML(id, min, max, value, labelHTML, step=1)` (renders the
slider with a −/+ button on each side, auto-disabling a button once the
value is already at that bound) and `wireLevelControl(id, onChange)`
(wires the slider's own drag AND both buttons to one callback — every
existing call site already had a full `renderBody()`/`rerender()` that
recomputes everything else, so this only needed to hand back the new
clamped value, not duplicate any state-update logic). Replaced every
bare `.level-control` slider with this pair:
- `js/ui-heroes.js` — level, star grade, and evolution tier sliders in
  the hero enhance modal.
- `js/ui-weapons.js` — the weapon upgrade-level slider, and the
  per-affix roll% slider in the Rolled Bonus Affixes editor (this one
  is dynamically keyed by `affix-roll-${opt.id}` since multiple can be
  checked at once — `_wireAffixEvents` now loops `draft.bonusRolls` and
  wires one `wireLevelControl` call per currently-checked affix).

New CSS: `.lc-step` (32×32px dark circular-ish button matching the
existing `.stepper button` look), plus `.level-control` gained
`flex-wrap: wrap` and the slider got `min-width: 80px` so the row
degrades gracefully rather than overflowing if ever squeezed
(verified at phone width — see below — though in practice the existing
`.detail-layout` single-column mobile breakpoint already gives this row
plenty of room).

Verified end-to-end with Playwright, both desktop and iPhone-13-width
mobile viewports: hero level +1/+1/−1 clicks landed on the expected
1→2→3→2 sequence and the − button correctly disabled at the min bound
(1); weapon level and a checked affix's roll% both stepped correctly
via their own buttons; zero horizontal overflow introduced on mobile;
a full 6-tab sweep showed zero new console/page errors. Screenshots
confirmed the buttons render at a comfortable thumb-sized tap target on
both the hero and weapon detail modals, phone width included.

## Rune system (2026-10-02)

User asked what else should be added given everything learned about the
game, was offered three concrete options via `AskUserQuestion` (the Rune
system, the already-extracted-but-unwired Gift Chest spawn map, or a
slider gauge-texture reskin) and picked the Rune system — the single
largest confirmed-real gap this project had tracked (see Open Items: 9
real data tables extracted back on 2026-10-01 during the "Boss Raid /
Challenge Tower / Hero's Tomb rewards" session, but only one of them
(`HeroTombRuneDropData`) ever got committed or wired in, with the rest
explicitly parked as "a real new feature, not a quick table swap").

**The scratchpad was still intact** (this session picked up the same
`02f52606-...` session lineage), so no fresh APK pull was needed — the 8
remaining raw Rune tables plus the full raw Locale table were sitting
exactly where the prior session's own notes said they'd be
(`unity_work/textassets/Rune*.json`).

**What the data actually shows, confirmed by reading real rows rather
than trusting the prior session's one-line summary** (which had called
`RuneData` "115 rows, one per hero/costume" — true as a row count, false
as a description once actually checked):
- **115 `RuneData` rows split into two genuinely different kinds of
  rune.** 43 rows (`TypeID 1`, "HERO RUNE") are hero-specific — tied to a
  real `CostumeID` — covering 24 of this game's heroes (3 heroes, e.g.
  Cupid, have 2 distinct named runes; the rest have exactly 1; the other
  ~90 heroes have none yet). The other 72 rows (`TypeID 101/102/103` =
  Melee/Ranged/Universal) all share `CostumeID 0` (equippable on any
  hero) and break down as 3 named subtypes × 8 grades each (Melee:
  Sword/Blunt/Dagger; Ranged: Gun/Staff/Bow; Universal:
  Skill/Utility/Protect) — confirmed by checking the real per-subtype
  `icon` field, not assumed from the name alone.
- **Grade is baked into which row is equipped, not a separate player
  stat** — exactly like a `WeaponData` fusion chain (confirmed by the
  data itself: the 3 Melee subtypes each have 8 separate `RuneData` rows,
  one per grade, each with its own `icon`/`prefab`/`level_bonus_group_id`
  — not one row with a mutable grade field). Hero runes, by contrast,
  only ever have 1 row per named rune at a single fixed `GradeID` (e.g.
  both Cupid runes sit at grade 4, not grade 1) — there's no "fuse a hero
  rune to a higher grade" mechanic visible in this data at all.
  `RuneGradeData` (8 rows, `MaxLevel` 10/20/30.../80 per grade, 1:1 with
  this game's real 1-8 rarity scale) gives each grade's level ceiling.
- **The rune's own "Unique Option" (`RuneUniqueOptionData`, 115 rows,
  1:1 via `UniqueOptionID`) is a real `base_value + value_per_level ×
  level` formula** — and for hero runes specifically, its `Desc_en`
  field is a genuine `{0}%`-templated description straight from the
  game's own Locale (e.g. "Bonus Skill Damage increases by {0}%."),
  confirmed present (not guessed) by actually reading the resolved
  value, complete with a `<color=#0D9538>` rich-text tag the game's own
  UI would render but this app's plain-text rendering strips (new
  `stripRichText()` helper, `ui-common.js`). The 3 generic Melee/Ranged/
  Universal families do **not** have a real description template at
  all — every single one of their `Desc_en` values is just the plain
  rarity-tier word ("Normal"/"Fine"/etc.), confirmed by checking every
  row, not a one-off — so for those, `Formulas.runeUniqueOption()`
  builds its own `"<Stat> +X%"` line from `RuneOptionTypeData`'s real
  stat name (confirmed: `OptionType` codes 5/11/12/23-28 resolve
  cleanly there — HP/Bag/Skill Damage/Dagger-Sword-Morningstar-Gun-
  Wand-Crossbow Damage) instead of surfacing that rarity word as if it
  were the effect text. **A real bug caught during Playwright
  verification, fixed before shipping**: the first version of this
  function applied the hero-rune `{0}`-template path universally, which
  rendered a generic Dagger Rune's stat line as the literal word
  "Normal" — caught by actually looking at the rendered screenshot, not
  assumed correct from the code.
- **Level-milestone bonuses** (`RuneLevelBonusGroupData`, 440 rows, keyed
  by `GroupID` off `RuneData.LevelBonusGroupID` — same shape as
  `WeaponLevelUpBonusGroup`) split into two real `GrantType` values:
  `GrantType 1` (200 rows) is a confirmed fixed stat bonus with a real
  `{0}`-templated desc (e.g. "TOTAL POWER {0}"); `GrantType 2` (240
  rows) is a genuinely different mechanic — its own desc resolves to
  "Grants 1 random attribute" with no further table describing what
  gets rolled or how — shown honestly as locked/unresolved (🎲 icon,
  "roll mechanic not decoded") rather than guessed at, per this
  project's standing norm.
- **Leveling cost and "break" (dismantle) refund** (`RuneLevelCostData`/
  `RuneBreakRewardData`, 1440 rows each, keyed by `TypeID`+`GradeID`+
  `Level` — shared across every named rune of that type/grade, not
  per-specific-rune) resolve via the exact same `StackableItemData.Type`
  convention this app's whole reward/cost pipeline already uses (e.g.
  cost type `4002` → Rune Dust, confirmed zero-orphan). Shown as
  informational text only ("Cost to reach Lv N: ...") — this app tracks
  no currency/material inventory anywhere, same convention as the
  existing weapon Scroll-cost display.
- **No decompiled evidence ties Runes into the confirmed Dps formula**
  (`docs/game_logic_deep_dive.md` doesn't mention Runes at all, and this
  session didn't attempt new decompilation work to go looking) — so
  Runes are shown as their own standalone stat panel on the hero, with
  an explicit in-UI caveat, and are deliberately **not** folded into the
  Guide tab's Total DPS estimate. This is the same discipline as
  `CostumeOwnGradeOption`/`CostumeOwnLevelOption` being left `unmodeled`
  rather than presenting an unconfirmed mapping as fact.

**Real art, not placeholders.** Hero runes reuse the hero's own already-
extracted portrait (`RuneData.Icon` for a hero rune is literally the
same path as that hero's `CostumeData.IconSprite` — confirmed by
checking the raw field, not assumed — so `Game.runeIcon()` just calls
the existing `Game.heroIcon()` for these, zero new art needed). The 9
generic Melee/Ranged/Universal icons (`Img_Rune_{Red,Blue,Yellow}_
{Sword,Mace,Dagger,Crossbow,Wand,Gun,Defense,Skill,Utility}_S128`) were
genuinely missing and got extracted fresh via the same UnityPy
`Sprite.image` technique this project always uses, straight from the
still-intact unpacked base APK (confirmed real icon art by viewing each
exported PNG before shipping, same verification discipline as every
prior art-recovery session) — saved to the new `assets/img/runes/`
folder. Grade/rarity chrome (ring/ribbon/grade-plate) needed no new
extraction at all — `RuneGradeData.Rarity` maps directly onto this
app's existing 1-9 rarity scale, so `rarityStyle()`/`rarityTag()` just
work as-is.

**Shipped**: 8 new `data/Rune*.json` tables (typed + Locale-resolved
via a one-off Python conversion script, following this project's usual
convention — raw field names preserved, `_en` suffix added for
resolved text); `assets/img/runes/` (9 new icons);
`Game.index.rune*`/`Game.runeIcon()` (`data.js`);
`Formulas.runeMaxLevel()`/`runeUniqueOption()`/`runeLevelBonusRows()`/
`runeCostForLevel()`/`runeBreakRewardForLevel()` (`formulas.js`);
`stripRichText()` (`ui-common.js`); a new "Rune" section in the hero
enhance modal (`js/ui-heroes.js`) — equip/level/remove, reusing the
`levelControlHTML`/`wireLevelControl` step-button sliders shipped
earlier this same day, plus a "Choose a Rune" picker modal with 4 tabs
(the hero's own named rune(s), and the 3 generic families' full 8-grade
card lists) following the exact same flat-picker-grid pattern already
established for weapons (no "fuse" UI — like weapons, you just pick
whichever exact grade-tier card matches your real in-game rune, same as
picking a specific fused weapon rarity directly from its picker); a new
`rune: {runeDataId, level} | null` field per hero in `State` (round-
trips cleanly through Export/Import with zero special-casing, verified).

**A real mobile-layout bug found and fixed during Playwright
verification, same session**: the Rune panel's header row (icon + name/
tags + Change/Remove buttons) overflowed the viewport at phone width —
traced to the classic CSS Grid "a child's intrinsic min-content width
doesn't shrink to fit a `1fr` track" issue (same root-cause *class* as
the Monsters-tab mobile bug fixed earlier this same day, a different
specific trigger: this time a bare `.stat-pill` — a component built for
short name:value pairs like "Atk Speed: 2.7/s" — being used for a full
sentence-length rune description, which doesn't wrap and forced the
whole grid column wider than the modal). Fixed two ways: swapped that
`.stat-pill` for a `.milestone-row` (already proven to wrap correctly
elsewhere in this exact modal), and restructured the header's Change/
Remove buttons out of a fragile `flex-wrap`-on-one-row layout into their
own explicit second row using the already-proven `.action-row` pattern,
rather than relying on flex-wrap alone (which, when first tried, wrapped
the buttons on top of the tags row instead of cleanly below it). New
CSS: `.rune-panel`. Verified via the same `getBoundingClientRect()`
widest-element sweep used in the mobile-layout work earlier today —
zero elements exceeding the viewport afterward, screenshots confirmed
clean wrapping with no overlap.

Verified end-to-end with Playwright: equipped a hero's own named rune,
stepped its level 1→3 via the new slider buttons (description and cost
both recomputed correctly at each step — "1.05%"→"1.15%", "14 Rune
Dust"→"17 Rune Dust + 2 BlueStone"), switched to the Melee tab (24
cards = 3 subtypes × 8 grades, confirmed), equipped a generic Dagger
Rune and confirmed its stat line now reads "DAGGER DAMAGE +0.11%" (the
generic-rune bug fix), removed the rune and confirmed the panel reverts
to "Choose a Rune," a full 6-tab desktop sweep plus the full mobile flow
above — zero console/page errors throughout, zero horizontal overflow.

**Deliberately not pursued this session** (parking these honestly rather
than guessing): what `GrantType 2`'s random-attribute roll actually
picks from or how (would need new decompilation work, not just data
reading); whether Runes feed into the real Dps formula at all (same —
no decompiled evidence either way); a "fuse a generic rune to the next
grade" convenience flow (this app has never modeled owning multiple
copies of anything or a fuse/convert action — equipping is pick-the-
exact-row-you-have, same as weapons, so this wasn't a gap specific to
Runes); and the Gift Chest spawn map / slider gauge-texture reskin
options the user didn't pick this time (still open, still real, see
Open Items).

## Next Best Upgrade advisor (2026-10-02)

Same session, immediate follow-up: asked again what else was worth
building, offered the same two still-open options from last time (Gift
Chest spawn map, slider gauge-texture reskin) plus one new idea, and
picked the new one — a feature that ranks a hero's available upgrades by
real Dps impact, using the app's own already-confirmed Total DPS formula
rather than any new game-data extraction at all.

**Design**: rather than hand-deriving a second formula (a partial
derivative of the real one, which would be a brand-new, unverified piece
of math shadowing the actual confirmed `totalDpsBreakdown`), this
literally **runs the real formula twice** per candidate — mutate one
piece of `State.data` by exactly one step, call
`Formulas.totalDpsBreakdown(heroId)` again, read the new `.dps`, then
synchronously revert the mutation before returning. Since this all
happens within one plain synchronous function call with no
`State.notify()`/`persist()` anywhere in it, there's no risk of a
stray render or localStorage write mid-simulation — verified directly
by diffing a full `JSON.stringify(State.data)` snapshot taken
immediately before and after calling `Formulas.nextBestUpgrades()`, byte
for byte identical across multiple scenarios (fresh hero, heavily
leveled hero with ability/extra/soul/special all invested).

**Candidates evaluated** (every directly-steppable, single-click lever
the app's own formula already reads from): one weapon-level+1 candidate
per filled, not-maxed equipped slot; hero level+1, star grade+1, and
next evolution tier (if available); and the four upgrade trees' own
"Power"-type track (`OptionType 1` — the exact same track
`totalDpsBreakdown`'s `Ability`/`ExtraUpgrade`/`SpecialUpgrade`/
`SoulUpgrade` sources already read), each capped against its own real
max (`abilityMaxLevel`/`extraMaxLevel`/`specialMaxLevelForGrade`/
`soulMaxLevel`) so maxed-out levers never show up as "available."
Special specifically needed its account-wide Altar Grade
(`State.data.upgrades.special.__grade`, the same field
`ui-equipment.js`'s global-grade stepper already writes) rather than a
per-type grade, and is also gated behind `specialUnlockGrade(1)` so a
locked type never gets simulated. **Deliberately excluded**: trait
rolls (rolled, not leveled — there's no single "+1 step" for a trait),
VIP bonus (a manual numeric input, same reasoning), and Runes (not wired
into this formula at all, per "Rune system" above — including any of
these would be comparing apples to oranges against the genuinely
steppable levers).

A zero-or-negative computed delta (which does happen — e.g. a single
Ability level-up at a low checkpoint-curve resolution, or a weak
early weapon's near-zero per-level DPS, can legitimately round to 0
Dps difference once the whole formula rounds its final output) is
filtered out rather than shown as a confusing "+0 Dps" row — confirmed
this is real rounding behavior, not a bug, by testing both a level-1
fresh hero (where almost every candidate correctly produces zero
candidates at all, since everything is too small to move the rounded
total) and a heavily-developed one (level 60, star 3, ability 50/extra
30/soul 20/special grade 2 level 5, weapon equipped) where 6 real,
sensibly-ordered candidates appeared (Star Grade +149 > Level +91 >
Soul +14 > Evolve +12 > Extra ≈ Special +6 each).

**Shipped**: `Formulas.nextBestUpgrades(heroId)` (`formulas.js`, right
after `totalDpsBreakdown`); a new "🎯 Next Best Upgrade" panel in the
Guide tab (`ui-guide.js`'s `_nextUpgradeHTML`), rendered directly below
the existing Total DPS estimate panel, showing the top 5 ranked
candidates as clickable rows (🏆 on the top pick) — clicking one jumps
to wherever that upgrade actually lives (`State.setTab()`, and for
hero-level/star/evolution rows, also opens that hero's enhance modal
directly via `HeroesUI.openEnhance()` so there's no second click needed
to find the right slider). New CSS: `.nbu-row`/`.nbu-delta`, built with
`flex-wrap: wrap` from the start (applying the lesson from the Rune
panel's mobile-overflow bug fixed earlier this same session) so a long
label and its Dps delta stack cleanly on narrow screens instead of
risking the same class of overflow.

Verified end-to-end with Playwright, desktop and iPhone-13-width mobile:
a full 6-tab desktop sweep plus the dedicated mobile flow above, zero
console/page errors, zero horizontal overflow at any point; confirmed
zero state mutation leaks from the simulation itself via the
`JSON.stringify` snapshot diff described above; confirmed the ranking
is sensible and the numbers match manually re-running
`totalDpsBreakdown` before/after a real (non-simulated) change via
the UI.

## Gift Chest spawn map (2026-10-02)

User asked directly for this one, the last of the two remaining options
offered alongside the Rune system and the Next Best Upgrade advisor —
the last genuinely open "real data, no UI" gap this project had been
tracking since the 2026-10-01 session that found it.

**The raw tables were still sitting in the same intact scratchpad** that
supplied the Rune system earlier this session —
`unity_work/textassets/GiftChestSpawnData.json` (60 schema+data rows)
and `GiftChestData.json` (1,161 rows) — so no fresh APK pull was needed
here either.

**What the mechanic table actually says, read directly rather than
re-trusting the one-line prior summary**: `GiftChestSpawnData` has real
rows for **all 3 chapters** (19 for Chapter 1, 20 each for Chapters 2
and 3) — not just Chapter 1 as the position data implied. Each row is a
player-level bracket (`MinLevel`/`MaxLevel`) naming which numbered
`SpawnerIds` are eligible to produce a chest at that level, with a
parallel `SpawnWeights` array — later brackets reference more spawner
ids cumulatively (bracket 1 references just id `1`; by Chapter 1's
highest bracket, all 16 ids 1-16 are referenced somewhere). `SpawnRate`/
`RespawnTime`/`LifeTime` are uniform across every single Chapter 1
bracket (600/300/300 — confirmed by checking, not assumed), so those are
shown as one simple fact rather than a row-by-row table. **Honest
caveat, not glossed over**: there's no numeric spawner-ID field on the
*position* extraction (`GiftChestSpawnPoints.json`'s 16 rows only ever
had Unity's own auto-generated GameObject names — "GiftChestSpawner",
"GiftChestSpawner (1)".."GiftChestSpawner (14)", and one oddly-named
"GiftChestSpawner 2" breaking that pattern) — so there's no confirmed
join from "`SpawnerIds` 7" to "this specific dot." Rather than guess a
name→id mapping (even though a plausible-looking one exists by simple
elimination), the map shows all 16 real points together with one
chapter-wide "active between player level X–Y" range, not a per-dot
claim.

**`GiftChestData`** (the reward-amount side) resolves cleanly via the
same `StackableItemData.Type` convention this app's whole reward
pipeline already uses — `currency_type` 0/3/5 are confirmed Gold/Gem/
Elixir. Mentioned in the caveat text for completeness, but not built
into its own UI section: all three items already have other confirmed
farmable sources, so this table doesn't change any coverage numbers,
and a full per-player-level reward table felt like scope beyond what
was actually asked for (a spawn *map*).

**Real icon, not a reused substitute.** Checked the asset catalog for
anything actually named for this mechanic before reaching for the
existing generic `Item_Chest_{Wood,Silver,Gold}.png` art already in the
app — found a real `AcquireGiftChest` Sprite (89×94px, a genuine gift-
box icon, clearly the UI's own "you got a gift chest" art) and extracted
it the same way every other icon in this app has been — confirmed by
viewing the exported PNG before shipping, not shipped on a name match
alone.

**UI**: reused `SpawnMapUI`'s exact established pattern — the real
per-chapter story-stage tile board as a contextual "which chapter"
backdrop (not tile-precise placement, same honest caveat language as
there, since this is the identical `EnemySpawnGroups`-relative
coordinate frame per the 2026-10-01 session's own notes) — rather than
inventing a new visualization style. New `GiftChestMapUI.open()`
(`js/ui-map.js`, appended after `SpawnMapUI`) builds one card per
chapter with real coordinates, normalizing (x,z) into 0-1 the same way
`SpawnMapUI.renderInline()` already does. Entry point: a new "🎁 View
In-World Gift Chest Spawns" button at the top of the Farmable Items tab
(`index.html`/`js/ui-farmable.js`) — this mechanic isn't tied to any one
item or monster, so unlike every other "View Map"/"Track on Map" button
in this app (which hang off a specific item or enemy's detail view),
this one needed its own standalone entry point rather than reusing an
existing click target.

**Shipped**: `data/GiftChestSpawnData.json` (new, 59 typed rows —
`Chapter` resolved from the raw `E_Chapter` string enum to a plain
number matching this app's convention everywhere else, `SpawnerIds`/
`SpawnWeights` parsed from comma-separated strings into real arrays);
`assets/img/chests/AcquireGiftChest.png` (new icon); `GiftChestSpawnPoints`
(already-committed from 2026-10-01, loaded into `Game.db` for the first
time here) wired into `data.js`'s `DATA_FILES` plus two new indices
(`idx.giftChestSpawnPointsByChapter`/`idx.giftChestSpawnDataByChapter`);
`GiftChestMapUI` (`js/ui-map.js`); the new button + its click wiring.
Verified end-to-end with Playwright on both desktop and iPhone-13-width
mobile: all 16 real spawn points render with the real gift-box icon,
legend shows the correct chapter-wide level range (1-1300, matching the
real data), zero console/page errors, zero horizontal overflow, and a
full 6-tab regression sweep confirmed no regressions elsewhere.

## Own vs. Equipping Dps sources, confirmed (2026-10-03)

User picked this directly out of 3 offered options (the other two: a
global search bar, and the slider gauge-texture reskin that's been
offered — and passed on — twice now) as "any other features," explicitly
choosing the hardest/riskiest one: finishing the IL2CPP decompilation of
`CostumeOwnGradeOption`/`CostumeOwnLevelOption`, the last two sources in
the Total DPS formula still left at a hardcoded 0 since 2026-09-04
("found the real functions, but they route through interface/vtable
dispatch — takes meaningfully longer to trace by hand"). This session
finished that trace. Full technical writeup — the real disassembly,
the `E_CostumeOptionStyle` enum, the exact filter logic — lives in
`docs/game_logic_deep_dive.md` §6 and `docs/decompiled/
costume_own_vs_equipping.asm.txt`; this entry covers what changed in the
shipped app and why, plus the session's own research process.

**The scratchpad's IL2CPP tooling was still intact** (same session
lineage as every other 2026-10-02 addition) — `il2cpp_work/output/
dump.cs` (the full RVA-annotated signature dump), the raw `libil2cpp.so`
in the unpacked split APK, and `capstone` were all still reachable, so
this picked up with zero fresh extraction needed. Built one small reusable
tool first: `il2cpp_work/build_addr_map.py` parses `dump.cs` once into a
`{RVA: signature}` pickle (131,175 entries — not all 211,059 methods
have a body-carrying RVA comment, e.g. properties/fields), and `il2cpp_
work/disas.py` wraps `capstone` + `pyelftools` (VA→file-offset via the
ELF's own `PT_LOAD` segment table, not guessed) to disassemble from any
RVA and auto-resolve every `bl`/`b` branch target to a real method name
inline — the same "disassemble, cross-reference call targets against
the address map" technique this project's original decompile pass used,
just finally written down as a small reusable script instead of re-done
ad hoc each time.

**The real finding, and it was a genuine surprise, not just "filled in
two zeros":** `CostumeOwnGradeOption`/`CostumeOwnLevelOption` (and,
turns out, the already-shipped `CostumeOwnEvolutionOption` too) are
**roster-wide sums**, not per-active-hero numbers. Traced the real
entry point, `CostumeInventoryManager.GetStatModifications(costumeId)`
(RVA `0x284B154`) — it calls `CalculateOwnStatModifications()` with
**no `costumeId` argument at all**, which was the tell. That function's
own body (RVA `0x284AD88`) loops the player's **entire owned-costume
list**, and for every costume that's purchased, adds *that* costume's
own Grade/Level/Evolution bonuses into one shared total — a real,
intentional "your whole collection contributes a little, not just your
main" design, not an extraction quirk. `State.data.heroes` (every hero
the user has added in this app) is the direct, correct analog of "owned
costumes" here.

**The Own/Equipping split** turned out to be genuinely clean once
found: both read the exact same `CostumeStarGradeOptionData`/
`CostumeLevelOptionData` rows this app already had committed, just
filtered by `OptionStyle` in opposite directions — `Own` wants
`OptionStyle==Always_Option(2)` (applies regardless of which hero is
active), `Equipping` wants `OptionStyle==EquipOnly_Option(1)` plus an
explicit "is this the hero actually being evaluated" id check. Two
genuinely non-overlapping subsets of the same data, confirmed by
reading both compiled functions side by side rather than assumed from
the naming alone. Values are used completely raw in both — no `×10`/
`÷10` scaling anywhere, unlike several other sources this project has
had to correct for exactly that (see chronological log entry #11).

**A real, previously-shipped bug this surfaced and fixed in the same
pass**: the app's existing `CostumeEquippingGradeOption`/
`CostumeEquippingLevelOption` computation (via `heroStarBonuses()`/
`heroLevelBonuses()`) summed **every** row regardless of `OptionStyle` —
meaning once the new `Own` sources were wired to read the complementary
`Always_Option` rows, the two sources would have double-counted every
one of those rows between them. Fixed by adding dedicated,
`OptionStyle`-filtered versions (`costumeEquippingGradeSum()`/
`costumeEquippingLevelSum()`) used only by the Dps formula —
`heroStarBonuses()`/`heroLevelBonuses()` themselves were deliberately
**left untouched** (still unfiltered), since the Heroes tab's own "Stat
Bonuses Unlocked" list is honestly answering "what does leveling/
starring this hero get me" — every row, not just the Dps-formula's
internal split — and filtering it would have made that list quietly
*less* complete, not more correct.

**Shipped**: `Formulas.costumeEquippingGradeSum()`/
`costumeEquippingLevelSum()` (single hero, style-1 filtered) and
`costumeOwnGradeSum()`/`costumeOwnLevelSum()`/`costumeOwnEvolutionSum()`
(roster-wide, style-2 filtered — the latter replacing the old
single-hero `heroEvolutionBonuses()` call `totalDpsBreakdown` used to
make) in `formulas.js`, right after `heroFullStats()`; `totalDpsBreakdown`
updated to use all five, with `CostumeOwnGradeOption`/
`CostumeOwnLevelOption`/`CostumeOwnEvolutionOption`/
`CostumeEquippingGradeOption`/`CostumeEquippingLevelOption` all upgraded
from `unmodeled`/`mapped` to `confirmed` in the Guide tab's breakdown
display, each with a note naming the real decompiled function.

Verified end-to-end with Playwright: added a hero, leveled/starred it,
confirmed `CostumeEquippingGradeOption`/`LevelOption` matched the
expected values for that one hero; added a **second**, non-active hero
and leveled it too — confirmed `CostumeOwnLevelOption` correctly
**increased** (roster-wide sum picking up the new hero) while
`CostumeEquippingGradeOption`/`LevelOption` stayed **exactly
unchanged** (still scoped to only the active hero) — the precise
behavior the decompiled split predicts; confirmed the Heroes tab's
"Stat Bonuses Unlocked" list (deliberately left unfiltered) still shows
every bonus row correctly; a full desktop 6-tab sweep plus the mobile
Guide-tab flow, zero console/page errors throughout.

## OAuth mobile sign-in bug, found and fixed (2026-10-03)

User reported: "When trying to sign in using google, discord, and
facebook on my mobile phone the authentication fails or never signs
in." All four sign-in methods had been verified end-to-end back when the
accounts backend was built (see "Accounts backend" above) — but those
verifications were all done with desktop Playwright, never a real mobile
browser, so a mobile-specific bug in a feature that "already worked" was
a real gap rather than a regression anyone would have caught earlier.

**Root cause, found by reading the callback code rather than guessing**:
`GET /:provider/callback` (`server/src/routes/auth.js`) sets the
long-lived refresh-token cookie (`issueSession()`) and redirects to
`${frontendUrl()}?auth=success` — that's it. The frontend's own
completion of sign-in was never driven by that query param directly;
`js/app.js` only showed the "Signed in as ..." toast *if `Auth.user` was
already populated*, which only happens if `Auth.init()`'s
`_trySilentResume()` — a plain cross-site `fetch('/auth/refresh', {
credentials: 'include' })` from `yo-repo87.github.io` to
`xpherobuilder-api.arc-it.uk` — successfully read back the httpOnly
refresh cookie that was just set, moments earlier, during the top-level
OAuth redirect chain. **This is exactly the kind of cross-site cookie
read that mobile browsers — Safari's Intelligent Tracking Prevention in
particular — are specifically designed to block**, even for a cookie set
instants before by a legitimate same-chain top-level redirect: ITP's
"recent top-level interaction" exceptions are heuristic, version-
dependent, and not reliably granted the moment a plain `fetch()`
subresource request asks for that cookie back. So the provider's own
login screen completes successfully and the backend's OAuth exchange
genuinely succeeds server-side (new user row or linked identity, refresh
token issued and stored) — but the browser's `fetch()` right after
silently gets no cookie back, `Auth.user` never gets set, and the user
lands back on the app looking exactly as if nothing happened. All three
providers funnel through this identical post-callback resume step, which
is why all three failed the same way — this was never a per-provider
OAuth-config problem (each provider's own authorize/token exchange was
already confirmed working individually when each was wired in, see
"Accounts backend" above).

**Fix**: stop depending on that fragile cross-site cookie read for the
critical moment sign-in actually completes. The callback now mints the
access token it already has (`issueSession()` already returns it) and
hands it straight back via the URL **fragment** —
`${frontendUrl()}#auth=success&token=<jwt>` — never `?auth=success`. A
fragment is deliberately used over a query string since it's never sent
to any server (not in the request line, not in `Referer` headers), so
this doesn't introduce a new place the token could leak server-side.
`Auth.init()` (`js/auth.js`) gained `_tryOAuthRedirect()`, called before
`_trySilentResume()`: if the URL has `#auth=...`, it reads the token (if
any), sets `Auth.accessToken` directly, calls the existing `_loadMe()`
to populate `Auth.user`, strips the fragment via `history.replaceState`,
and records `Auth.oauthRedirectResult` ('success'/'error') for
`app.js`'s toast — and short-circuits the normal cookie-based silent
resume entirely in that case, since the fragment already answered the
question. The refresh cookie is still set exactly as before and remains
the normal mechanism for a *returning* visit's silent resume (unrelated
to the bug fixed here — not reported as broken, and a much lower-stakes
failure mode than "can't sign in at all": worst case there, a user just
has to sign in again).

**Verified end-to-end against the real production backend and the real
live site**, not a mock — three checks, iPhone-13 Playwright emulation
throughout:
1. A real account was registered via `POST /auth/register` (shares the
   exact same `issueSession()`/JWT-signing code path the OAuth callback
   uses) to get a real valid access token. Loaded
   `.../#auth=success&token=<that real token>` with `/auth/refresh`
   **forced to return 401 via Playwright route interception** — i.e.
   deliberately simulating the exact mobile-cookie-blocked scenario this
   fix targets — and confirmed sign-in still completed correctly:
   `Auth.user` populated, header showed "Sign Off", Profile tab visible.
   This is the core proof: sign-in no longer depends on that cookie read
   at all.
2. Loaded `.../#auth=error` and confirmed the toast
   ("Sign-in didn't go through — try again") renders and the header
   correctly stays "Sign In".
3. `curl`'d the live callback endpoint directly with a deliberately
   invalid `code`/`state` and confirmed the real redirect `Location`
   header is now `.../#auth=error` (fragment, not query string).
   Test account cleaned up from the real `shared_postgres` database
   afterward (`DELETE FROM users WHERE email LIKE 'playwright-test%'`),
   same discipline as every prior against-production test in this
   project.

**Deployment note**: the backend container (`xpherobuilder_backend`) had
no bind-mount — its image was built once from `server/Dockerfile` and
never rebuilt since. Patching the running container's filesystem
directly would've been a live-only fix that a future `docker rm`+
recreate from the stale image would silently undo, so the image was
properly rebuilt (`docker build`) and the container recreated from it
(env vars preserved via a one-time `docker inspect`-dumped env file,
deleted immediately after use — never left on disk) rather than just
`docker cp`-patching the running container.

## Decoding the real Addressables catalog, and 13 more missing portraits recovered (2026-10-03)

User asked what else was worth doing and picked "chase the last missing
artwork properly" — specifically, decoding the Addressables catalog's
binary `m_BucketDataString`/`m_EntryDataString`/`m_KeyDataString` fields
for a real key→bundle lookup, flagged as not-yet-done in Open Items ever
since "Monster portrait recovery" (2026-09-30) first found this live CDN.
Every prior art-recovery session (2026-09-30 through 2026-10-01, see the
chronological log) worked by brute-force *enumerating bundle contents*
and grepping for expected names — useful, but never actually used the
catalog's own real key→location resolution logic, which is a different
and more authoritative question ("what does the game's own Addressables
system say this key resolves to," not "does this name appear in a
bundle I happened to download").

**Built a real decoder**, not a guess: `ContentCatalogData`'s 4 binary-
packed fields follow Unity's own `com.unity.addressables` runtime
serialization format exactly — `m_BucketDataString` is `[keyCount, then
per-key: (offset-into-KeyData, entryCount, entry-indices[])]` as
little-endian int32s; `m_KeyDataString` holds one tagged value per key
(a 1-byte `ObjectType` enum + type-specific payload — ASCII/Unicode
string, uint16/32, int32, Hash128, or a nested `SerializedType`); and
`m_EntryDataString` is `[entryCount, then per-entry: 7 little-endian
int32 fields]` (internalId index, provider index, dependency-key index,
dep hash, extra-data index, primary-key index, resource-type index).
Reimplemented this precisely in Python
(`addrtools/decode_catalog.py` in the scratchpad), then **validated it
against a known-good case before trusting it for anything new**:
resolved `Face_Skin_DevilHunter` (a key whose containing bundle was
already confirmed by brute force in the 2026-10-01 session) and got a
real, internally-consistent entry back before using the tool on
anything not already cross-checked.

**The real finding, and it overturned the operating assumption of every
prior art-recovery session**: `Costume/Costume_Face/Face_Skin_<Name>` is
a real, complete key family in the catalog — one row per Hero's Tomb
"shadow hero" costume, **all 26 of them**, including all 13 names every
previous session had declared genuinely exhausted (Berserker, Cactus,
Cat, Cop, Cow, Cupid, Dragon, Flame, Guardian, Pirate, Princess, Ranger,
Skull). Every single one resolves via provider
`LegacyResourcesProvider`, not `AssetBundleProvider` — meaning these
assets were **never remote** at all. `LegacyResourcesProvider` means
Unity's classic `Resources.Load()`, which only ever loads content
compiled directly into the player build itself. Every prior session's
negative result was real and correctly executed (these names genuinely
aren't in any of the 15 downloaded bundles, because they were never
going to be — they were sitting in the base APK's own serialized files
the entire time, just never searched for under this specific
`Face_Skin_<Name>` convention since every prior pass searched for
`Face_HeroTomb_<Name>`/`HeroTomb_Costume_<Name>` instead, matching the
*enemy data field's* own naming, not the asset's real name). Confirmed
present in the base APK's own pre-existing 118,568-row asset catalog
(`unity_work/asset_catalog.tsv`, from the original map-art session) by
exact file-id lookup for all 13 before extracting — not assumed from the
addressables key alone. Extracted via the project's usual `Sprite.image`
technique, straight from the base APK's own serialized files (no
download needed), and visually verified (not just non-zero file size)
before shipping. 2 more generic-family names, `Face_Skin_Misty`/
`Face_Skin_Vlad`, exist as real catalog keys but have no matching row in
the (slightly older) local `asset_catalog.tsv` — likely added to the
live game after that catalog scan was taken; not chased further this
session since neither corresponds to any `HeroTomb_Costume_*` name this
app's `EnemyData` actually references.

**The same tool gave a real, stronger negative result for the other two
still-missing categories**, not just silence. Both the 15 `Face_HeroTomb_*`
enemy-face keys and the 5 `Face_CH1_RaidBoss_{Coffin,ExplosiveMummy,
FrostBud,IceFlower,Mummy}` keys were searched for directly in the
catalog's full real key list (not a bundle's content list) and
**genuinely do not exist under any name** — the only catalog entries
matching those monsters at all are their 3D `.prefab` keys (`herotomb/
Enemy/HeroTomb_<Name>.prefab`, `bossraid/Enemy/CH1_RaidBoss_<Name>.prefab`)
and unrelated VFX (`FX_*`/`B_*` bullet/effect keys) — no face/icon key
of any kind. This is the authoritative version of "Exhausted the
remaining 34"'s (2026-10-01) same conclusion, reached by asking the
actual system that resolves these keys rather than inferring absence
from what 15 downloaded bundles happened to contain.

**Also properly re-chased the 7 missing Weapon Scroll tier item icons**
with the same tool. `ArcadeWorld/Stackable/Stackable_WeaponScroll_<Tier>`
*is* a real catalog key (confirmed back on 2026-10-01) and, like the
Hero's Tomb faces, turned out to be `LegacyResourcesProvider` too — but
resolves to a `GameObject`, not a `Sprite`/`Texture2D`. Opened that
GameObject's real file directly: it has a `SpriteRenderer`, but its
`m_Sprite` reference resolves (confirmed by walking the actual object
reference, not assumed) to a generic `Shadow` sprite in a different
file — the same "this is a 3D world-pickup prop with a generic ground
shadow, not the item's own 2D icon" conclusion the 2026-10-01 session
reached for the "Normal" tier specifically, now confirmed for the other
7 tiers too via the real object graph rather than a name-based guess.
Genuinely unrecoverable under any addressable key this game ships.

**Shipped**: `HeroTomb_Costume_{Berserker,Cactus,Cat,Cop,Cow,Cupid,
Dragon,Flame,Guardian,Pirate,Princess,Ranger,Skull}.png` in
`assets/img/enemies/` — no code changes, same as every prior portrait
recovery. Missing-enemy-portrait count: 34 → **21** (15 `Face_HeroTomb_*`
+ 5 `Face_CH1_RaidBoss_*`, now backed by the strongest evidence yet that
they don't exist as addressable assets at all — not just "not found in
a grep"). Missing-item-icon count unchanged at 7, now similarly
confirmed via the real object graph rather than bundle enumeration. The
decoder itself (`addrtools/decode_catalog.py` in the scratchpad) is a
genuinely reusable tool for any future art/data chase against this
game's live Addressables catalog — not committed to the repo (matches
this project's existing convention of keeping one-off extraction
tooling in the scratchpad, like `il2cpp_work/disas.py`), but the
technique and validation method are fully written up here so a future
session doesn't have to re-derive the binary format from scratch.

## Enemy spawn maps extended to chapters 4-6 (2026-10-03)

User asked what else was worth doing and picked extending the Monsters
tab's spawn/patrol map past chapter 3, an Open Item since the original
"Enemy spawn points" session (2026-09-30) explicitly noted the raw
coordinate dump physically contained chapters 4-6 already — it was just
never filtered in, since this app's stage-aware features generally stop
at chapter 3 (matching `StageData`'s own coverage) and nobody had
revisited whether this specific table needed that same limit.

**Confirmed before building anything**: the scratchpad's
`unity_work/all_spawn_positions.json` (the original 124-row raw
extraction, both its `fileA`/`fileB` copies) and
`unity_work/textassets/EnemySpawnGroupData_158.bin` (214 rows — the
EnemyDataId/IsPatrol/RespawnCoolTime/RetreatRange side) were both still
intact. Grouping the 124 raw positions by their own key's `CHn_` prefix
confirmed the committed 79-row chapters-1-3 file used exactly rows
1/2/3, and the remaining 45 rows are real, confirmed chapters 4 (16, incl.
2 flying-type instances), 5 (12), and 6 (17, incl. 3 flying-type) — not a
guess, cross-checked against each row's own container name (`Chapter1_N`)
agreeing with its key's `CHn_` prefix for every single row.

**Joined and merged the same way chapters 1-3 originally were**: each of
the 45 new rows' `key` resolves to exactly one `EnemySpawnGroupData_158`
row (zero orphans) giving `EnemyDataId`/`IsPatrol`/etc., and every
resulting `EnemyDataId` resolves cleanly to this app's own committed
`EnemyData.json` (zero orphans there either). None of the 45 are
patrol-type, so no new patrol-path work was needed. Merged into
`data/EnemySpawnPoints.json`, with the original 79 rows verified
byte-identical afterward (a pure 45-row addition, nothing rewritten).

**Zero application code changes were needed for the core feature** —
`idx.spawnPointsByChapter`/`spawnPointsByEnemyId` (`data.js`) are plain
`groupBy` calls over the whole table with no chapter filter baked in, and
`SpawnMapUI.renderInline()` already had a graceful `hasBoard` fallback
for "no real story-stage tile board for this chapter" (that board only
covers Chapters 1-3, via `StageMapLayout.json`) — written defensively
from the start, even though it had never actually been exercised until
now. Only the caveat text's hardcoded "Only Chapters 1-3 have this data
extracted" needed updating, to accurately say 1-6 and explain the
chapter-7+ gap (would need locating whichever further remote AssetBundles
hold their own copies of this same shared spawn-layout template, per the
original 2026-09-30 writeup).

**A real, pre-existing (not new) behavior surfaced during verification,
confirmed correct rather than a bug**: Chapter 5's "Bat" enemy
(`CH5_Bat`, `EnemyData` id `99004`) shows no spawn map section at all,
even though Chapter 5 overall has 12 real spawn points. Root cause: the
raw position dump simply has no `CH5_Spawn_Bat_*` entry at all (checked
directly — `EnemySpawnGroupData_158` defines the spawn *group* for
Chapter 5 bats, but no matching Transform position was ever captured in
the original scene extraction), and `ui-monsters.js`'s `openDetail()`
gates the whole "Spawn & Patrol Map" section on *this specific enemy*
having at least one own point (`spawnPoints.length ? ... : ''`), not on
the chapter having any data at all — a deliberate, pre-existing design
choice (this feature answers "where is THIS monster," not "what's
happening in this chapter"), not something introduced by this session's
extension work.

**Shipped**: `data/EnemySpawnPoints.json` (45 new rows, chapters 4-6);
`js/ui-map.js` caveat text update (no logic changes). Verified end-to-end
with Playwright: Chapter 4's Frost Goblin renders its real 3-point spawn
scatter correctly with the expected no-board fallback (screenshot
confirmed clean layout); Chapter 6's Baal renders correctly too; Chapter
1 re-confirmed still shows its real tile board (no regression); a full
6-tab desktop sweep plus a Chapter-6 mobile detail-view pass, zero
console/page errors throughout, zero horizontal overflow.

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
- **Cache-busting (added 2026-09-30)**: every `<script src="js/...">` and
  the `<link rel="stylesheet">` in `index.html` carries a `?v=<short
  commit hash>` query string. GitHub Pages serves these with
  `Cache-Control: max-age=600` (10 min) — without a version string, a
  visitor who loaded the site shortly before a deploy can keep seeing the
  *old* JS/CSS for up to 10 minutes after a push even though the new
  files are already live (confirmed this exact scenario: user reported a
  just-shipped feature "not showing up," direct `curl` against the live
  URLs proved the new code was already deployed correctly — it was pure
  browser caching of the old asset URLs). **Whenever you change any
  `js/*.js` or `css/style.css` file, bump the `?v=` on every reference in
  `index.html` to the new commit's short hash** (`git log -1
  --format=%h` after committing) as part of that same change — otherwise
  this exact confusion recurs on every future update. `index.html` itself
  is also subject to the 10-minute cache, but that's normal/expected (a
  hard refresh always fixes it); the query-string bump is what makes a
  *normal* revisit reliably pick up new JS/CSS without requiring one.

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
15. User asked whether the Farmable Items tab could let users report finding
    a specific item at a specific location from a specific creature, so
    reports could show up on the map as "what creature to focus on." Since
    the app is fully static with no backend, this meant a real architecture
    decision — asked via `AskUserQuestion`: personal-only (localStorage),
    shared-across-visitors (needs a real backend), or user curates it
    manually and it ships as static data. User picked shared-across-
    visitors. Built a small self-hosted backend on the user's own n8n
    instance (webhook + Data Table) — full details in "Community Reports
    backend" above, including a subagent-coordination incident during the
    build (two accidentally-spawned forks independently built large parts
    of this same feature in the background despite being told to stop; see
    that section for what happened and how it was resolved). End state:
    one clean n8n workflow + Data Table, `js/community-reports.js` (new),
    and a "Report a Find" flow in `ui-farmable.js` with a real stage/enemy
    picker, all verified end-to-end via Playwright (submit → shows in the
    item's Community Reports section → shows on the map with the reported
    enemy's portrait as the pin). Community reports are always rendered
    `escapeHtml`'d and visually tagged "USER-REPORTED" / dashed-blue-border,
    kept structurally separate from the confirmed ChestData/
    MinimapRewardData sources so the two are never confused.
16. User asked for a new tab listing every in-game monster with real
    artwork, filterable by chapter/stage and boss/non-boss. `EnemyData` (208
    rows) has no explicit chapter column and no boss flag, so both had to be
    derived and cross-checked rather than assumed — see the "Monsters tab
    chapter grouping" confidence-table row above for exactly how (chapter
    from each enemy's own `key` prefix, confirmed via matching `ThemeId`
    per chapter; boss = has a real `NickName_en` title, confirmed more
    complete than `EnemyType` alone). Exact per-stage filtering only exists
    for the 20 enemies with a `MinimapRewardData` tie (the same guaranteed-
    boss data the Farmable Items tab already uses) — regular monsters roam
    a whole chapter in this game's own data, so the UI doesn't invent
    stage-level precision it doesn't have; those 20 show their confirmed
    exact stage on top of chapter. Shipped `js/ui-monsters.js` (new),
    `Game.enemyChapter()` + `idx.minimapRewardByEnemyId` (`data.js`), a grid
    with chapter-chip + boss/non-boss filters, and a detail modal with real
    stats/story text/location. Also discovered in passing (not fixed, just
    disclosed): 15 of 208 `EnemyData` rows — mostly the Chapter-1 raid-boss
    set (Anubis, Cerberus, Mummy, etc.) — reference an `IconSprite` that was
    never captured in the original asset-extraction pass; they fall back to
    this app's standard dimmed-broken-image handling (`onImgError`, used
    everywhere else for missing art) rather than being hidden or faked.
    Re-extracting them would need a fresh APK (the scratchpad with the raw
    Unity asset tree was already gone by this session — see the ephemeral-
    scratchpad warning near the top of this file, which is exactly the
    situation it warned about).
17. User asked for the Farmable Items "View Map" popup to show the actual
    in-game map with the farmable creature positioned on it, instead of the
    honest-but-abstract stand-in from entry #7. Since the original
    extraction had genuinely found no map art/coordinates, this needed a
    fresh APK — user provided one (v26.2.0). Full writeup of what was found
    and built (a real Minimap prefab's exact stage positions, real tile
    art, real chapter names, the new shared `js/ui-map.js`) is in "Real map
    art + a second-APK data refresh" above. Mid-task, the user also asked
    to locate more farmable item drop locations/monsters given the fresh
    APK was already in hand — merged in the fresh, much larger
    `StackableItemData` (56→104) and `EnemyData` (208→245) tables (verified
    backward-compatible first), but deliberately stopped short of wiring
    the new `BossRaidStageData`/`ChallengeTowerStageData`/
    `HeroTombStageData` tables into more Farmable Items *sources* once it
    became clear their payouts run through a brand-new "Rune" item system
    this app has no data table or model for at all — see Open Items.
18. User asked to "locate spawn points in game for specific monsters and
    add them to the map. Search hard." Full writeup (methodology, the
    shared-coordinate-space finding, why it's a separate visualization from
    the story-stage board) is in "Enemy spawn points" above. Shipped
    `data/EnemySpawnPoints.json` (79 real rows, chapters 1-3) and a new
    `SpawnMapUI` scatter-dot popup wired into the Monsters tab. Follow-up
    same session: user asked whether patrol paths could be shown too —
    real waypoint-loop data existed (`PatrolPathGroup`), extracted and
    matched to 16 of the 79 spawn rows (full writeup, including a real
    coordinate-frame bug caught mid-extraction, in "Enemy spawn points" →
    "Patrol paths" above), now drawn as SVG polyline loops on the same
    scatter view. Two more same-session follow-ups: both maps gained real
    pan/zoom (shared `MapZoom` module, see "Enemy spawn points" → "Pan/zoom"
    above), and Farmable Items' monster-tied sources now route straight to
    `MonstersUI.openDetail()` instead of pinning the item icon on the
    story-stage board (see "Enemy spawn points" → "Farmable Items now
    routes to the monster" above).
19. User asked where to find Crimson Orb, then corrected this app's "no
    confirmed source" answer with a real lead ("the corrupted dryad should
    drop the crimson orb") — found a genuine third, previously-unmodeled
    Farmable Items source mechanism as a result. Full writeup in "Monster
    kill drops" above. `EnemyData.DropItemType`/`DropItemType2` (100 of 245
    enemies have one set) resolve through `StackableItemData.Type` (a
    confirmed 1:1-unique type code, not `.id`) to real items — raised
    confirmed-source coverage from 4/103 to 21/103 catalog items. Shipped
    `idx.itemByType`/`idx.killDropsByItemId` (`data.js`), `sources.kill`
    (`computeFarmSources`), and a new "Monster Drops" section in the item
    detail modal reusing the existing "Track on Map" → `MonstersUI.openDetail`
    pattern. Verified this was already fully generic (not special-cased to
    Crimson Orb) across all 8 items the mechanism resolves, per a same-day
    follow-up ask.
20. User reported "not every monster/item has a map, and also that the
    maps seem to run off screen or out of frame in their windows." The
    first is expected/honest (only Chapters 1-3 have real spawn/patrol
    data — explained, not "fixed" with a guess); the second was a real
    bug, actually two of them (wheel/touch scroll-trapping, and an
    oversized embedded map pushing its own controls off the bottom of the
    modal) — full root-cause writeup and fix in "Enemy spawn points" →
    "Bug fix... maps run off screen" above.
21. User asked to remove all manual Community Reports. Checked the live
    `xp_hero_farmable_reports` Data Table first rather than assuming
    (`mcp__n8n__n8n_manage_datatable`) — found exactly 6 rows, all "Red
    Orb", all submitted within a 6-minute window with no reporter name
    (clearly test data from when that feature was verified, not real
    player activity). Dry-ran the delete filter first, confirmed it
    matched only those 6 rows, then deleted and verified via the live
    public list endpoint that it now returns `[]`. The "Report a Find"
    feature itself was left fully intact — only the existing data was
    cleared, per what was actually asked.
22. User asked for optional user accounts (email/password + Google/
    Facebook/Discord OAuth) with persistent cross-device build data,
    backed by an existing Postgres instance on the user's network, while
    keeping the site fully usable with no account. Full writeup — the two
    `AskUserQuestion` architecture decisions, finding and reusing the
    existing `shared_postgres` container's established one-db-one-role-
    per-app convention instead of creating a new instance, finding and
    matching nginx-proxy-manager's existing host-IP-plus-port proxy
    convention by reading its sqlite db directly, the new dedicated
    `server/` Node/Express backend, and the Playwright-verified frontend
    integration — is in "Accounts backend" above. Two things remain
    genuinely outside this session's control and are tracked in Open
    Items: the user manually adding the nginx-proxy-manager entry (2-line
    curl/UI step), and the user registering OAuth apps with Google/
    Facebook/Discord to get real Client ID/Secret pairs (each provider's
    login button switches on automatically the moment its two secrets
    land in `server/.env` — no code changes needed to activate one).
23. User asked to actually set up the nginx-proxy-manager entry — full
    troubleshooting writeup (NPM password reset, the Cloudflare Tunnel
    Public Hostname finding, the force-SSL redirect loop, and the
    unrelated-but-discovered DNS-credential-renewal bug that had been
    silently breaking 2 other certs covering 20 total hosts) is in
    "Accounts backend" → "NPM/Cloudflare setup" above. Same-day follow-up:
    user provided Google OAuth credentials, wired into `server/.env`,
    verified end-to-end including clicking through to Google's real
    consent screen with no redirect/client-id errors. Accounts backend is
    now fully live in production.
24. User asked to set up Discord sign-in too. Same process as Google:
    user registered the app in Discord's Developer Portal, provided
    Client ID/Secret, wired into `server/.env`, container restarted,
    verified end-to-end via Playwright click-through to Discord's real
    login page with the OAuth authorize params correctly preserved for
    post-login redirect.
25. User asked to set up Facebook sign-in, the last of the four planned
    methods. Same process again: user created the app in Facebook
    Developers (Consumer type + Facebook Login product), provided App
    ID/Secret, wired in, verified end-to-end via Playwright click-through
    to Facebook's real login page — the `next`/`cancel_url` params show
    Facebook correctly recognized the app id and registered redirect URI,
    no "URL Blocked"/app-config error. **All four sign-in methods
    (email/password, Google, Discord, Facebook) are now live in
    production** — the accounts backend is fully complete, nothing left
    outstanding from the original ask.
26. User reminded that not every monster on the Monsters tab has a
    portrait. Full writeup — finding the live asset CDN via a raw-bytes
    fallback on a `MonoBehaviour` TypeTree failure, decoding the
    Addressables catalog's plain-string `m_InternalIds` field, and
    recovering 10 of the 52 missing portraits (4 a casing bug in the
    existing base-APK extraction, 6 from the live CDN's Hero's Tomb/boss-
    raid bundles) while confirming the remaining 42 are genuinely absent
    from the two most relevant bundles checked — is in "Monster portrait
    recovery" above.
27. User asked to keep deep-diving the APK for item/monster location data,
    since "plenty of data is still missing." Picked up the "Rune" reward
    type parked as an Open Item the prior session — found and extracted
    all 9 real Rune data tables (sitting in the base APK all along), and
    traced `HeroTombRuneDropData`/`BossRaidStageData` through a
    previously-undecoded `RewardGroupData.RewardType==1` convention
    (resolves via `.Type`, confirmed across all 898 rows of that type).
    While re-auditing the existing Guaranteed/Chest source types for this
    same work, found and fixed two real, previously-shipped bugs: Guaranteed
    boss drops were keyed by the wrong id space (showing BlueStone's source
    as Gem's by coincidence), and Chest drops were silently missing every
    `RewardType==1` row in their own reward bundles. Also discovered and
    corrected a stale doc claim (this file previously said "21/103"
    Farmable Items coverage; the true pre-session figure was 11/103, now
    25/103) and committed a newer, previously-unmerged 1019-row
    `RewardGroupData.json` (verified backward-compatible against every
    group this app's existing `ChestData` references before swapping it
    in). Full writeup, including the two bugs and the honesty note on the
    doc discrepancy, is in "Boss Raid / Challenge Tower / Hero's Tomb
    rewards" above.
28. User asked to keep digging for more item/monster location data,
    directly following on from entry 27. Found and wired in 6 more real
    reward tables (Mission, Invasion Win Streak/Ranking/Pass, Lucky Spin,
    7-Day Carnival), all resolving via the same confirmed `.Type`
    convention, raising confirmed Farmable Items coverage from 25/103 to
    34/103. Caught and fixed a real display bug introduced mid-session
    (Invasion Pass rows showing a nonsensical "unlock Lv.-1" for rows
    actually gated by points, not level). Checked the live CDN for
    chapter 4+ open-world content that might expand `EnemySpawnPoints`
    coverage and confirmed the game genuinely hasn't shipped any yet
    (not an extraction gap). Full writeup in "More item/monster location
    data" above.
29. User asked to keep digging further, explicitly aiming for 100% item
    coverage. Systematically checked every remaining `*Reward*`-named
    table in the game (wired in 3 more: `QuestData` — the single largest
    source this session, 1,122 rows — plus `BossRaidRankingRewardData`
    and `FivePackGiftRewardData`) and swept beyond reward-named tables
    too (`FootboardProductRVRewardData`, `NewCostumeRevenuePassRewardData`
    — this app's first source for Hero Coin). Found a genuine new
    mechanic, `GiftChestSpawnData`/`GiftChestSpawner` (in-world spawning
    treasure chests), and extracted 16 real Chapter 1 spawn coordinates
    using the same technique as the prior session's `EnemySpawnPoints`
    work — committed but not yet wired into any UI. Traced
    `ShopProductData`→`ShopProductCostData` end-to-end; a first-pass read
    of `cost_type` concluded every shop product costs real money or
    Gems, never free (this turned out to be wrong, corrected the same
    day — see entry 30). Raised confirmed coverage from 34/103 to
    36/103, and — more importantly — established that this is close to
    the real ceiling for gameplay-earned items in this game, not an
    incomplete search. Full writeup is in "Chasing 100% item coverage"
    above.
30. User asked directly: mark Shop Exclusive items as such in the
    Farmable Items UI so visitors know where to get them. This meant
    properly re-resolving the Shop tables instead of the shallow pass in
    entry 29 — found that read was wrong: only 12 of 829
    `ShopProductCostData` rows are real money, the other 817 are priced
    in ordinary farmable in-game currencies (a crafting/exchange system,
    not an IAP storefront). Corrected the confidence table and Chasing
    100% writeup, resolved 24 items' real shop costs (precomputed into
    `data/ShopItemSources.json`), and shipped a distinct gold "🛒 SHOP
    EXCLUSIVE" tag/section in `js/ui-farmable.js` — kept deliberately out
    of the "known sources" count, since a purchase isn't farming, but no
    longer left as a bare "source not identified" either. Full writeup
    in "Shop Exclusive marking" above.
31. User asked a direct follow-up: mark items obtained through crafting
    as "Craftable" with their required ingredients, distinct from a
    plain Shop purchase. Applied a stricter signal (2+ distinct item
    types in one product listing = a recipe, vs. a single item/currency
    = a purchase) to the same Shop tables, catching and filtering a real
    false-positive along the way (`EXP` acting as a near-universal "+1"
    tax on unrelated listings, which had wrongly flagged already-farmable
    items as craftable). Found exactly 7 real recipes — the 6 Eternal
    Stones and S-Tier Chest Key — and shipped a green "🔨 CRAFTABLE"
    tag/section with clickable ingredient rows that jump to each
    ingredient's own detail. Full writeup in "Craftable items" above.
32. User asked to keep chasing missing artwork, correctly guessing the
    lead: assets downloaded at load time from the CDN found in "Monster
    portrait recovery." Re-fetched a fresh bucket listing (grew to 1,806
    objects) and the newest catalog, downloaded and fully enumerated all
    15 remote bundles under the current build (≈83MB), and recovered 2
    more real enemy portraits (`Face_Skin_DevilHunter`/`Face_Skin_Elf` in
    a bundle — `liveopsevent_bossraid_ranking` — that didn't exist to
    check in the prior session). Also traced down that the 7 missing
    Weapon Scroll tier item icons are real addressable keys (unlike the
    enemy faces) but confirmed them absent from all 15 bundles checked —
    narrowed, not solved. Full writeup in "More missing artwork recovery"
    above.
33. User asked directly why Anubis's art specifically kept coming up
    missing. Investigated properly instead of repeating the prior
    conclusion: the real cause was that Boss Raid's promotional "reveal"
    key art ships under a completely different naming scheme
    (`Img_Anubis`, not `Face_CH1_RaidBoss_Anubis`) in a bundle
    (`bossraid_outgame_assets`) already downloaded but only grepped for
    the expected name, not read as a full list. Dumping its complete
    sprite list found real full-body art for all 6 raid bosses with
    active `BossRaidStageData` rows (the currently-rotating ones);
    confirmed the other 5 (no active rows) are genuinely still absent
    everywhere. Missing-enemy-portrait count: 40 → 34. Full writeup in
    "Why Anubis's art specifically was missing" above.
34. User reported Coffin/ExplosiveMummy/FrostBud/IceFlower/Mummy (and
    others) still missing and asked to re-check the Monsters tab and
    apply the same technique to everyone else. Did a much more thorough
    3-pass search than before: broad re-grep of all 15 bundles' full
    sprite lists, a real historical-pruning lead (`herotomb_assets` was
    5MB bigger in the earliest available build) chased down and
    confirmed to be unrelated 3D-model bloat rather than removed icons
    (the `Sprite` list is byte-identical old vs. new), and direct
    inspection of real monster prefabs' component trees (confirmed none
    of them hold an icon reference anywhere, old build or new). Net
    result: no new art recovered this pass, but the remaining 34 are now
    backed by real multi-angle negative evidence rather than "not found
    in a grep" — including a plausible, evidence-based explanation for
    why Hero's Tomb specifically may have no per-monster art to find at
    all (the real UI likely shows a generic Boss/Elite/Normal tier badge
    instead, unlike Boss Raid's curated named-boss roster). Full writeup
    in "Exhausted the remaining 34" above.
35. User asked for a real behavior change plus reported a real bug in
    the same message: signing in should auto-load the newest cloud save,
    local changes should keep it auto-updated, and signing out should
    clear the on-screen build — separately noting that signing out was
    actually leaving the previous account's heroes/weapons visible. The
    sign-out bug was real and simple (`onAuthChange()` never touched
    `State.data` on that transition) — fixed by calling the same
    `State.resetAll()` the Reset button uses. The auto-sync behavior is
    a deliberate reversal of the accounts feature's original manual-only
    design, built and verified end-to-end against the real production
    backend (register with no cloud save → auto-created one → a real
    local change auto-saved within the debounce window, confirmed
    directly against the live API → sign out → local state confirmed
    reset to zero → sign back in → confirmed the build and `activeSaveId`
    both correctly restored). Full writeup in "Auto-sync cloud saves"
    above.
36. User asked for a mobile layout (fixed bottom tab bar, compact header,
    overflow menu for Import/Export/Reset) so phones/tablets get a
    purpose-built nav instead of the desktop header reflowing awkwardly
    — full writeup in "Mobile layout" above, including a real pre-existing
    bug it surfaced (the Monsters tab's 245-card grid was inflating the
    mobile layout viewport past the device width) fixed with a global
    `overflow-x: hidden`. Same-day follow-up: user asked for −/+ step
    buttons next to every slider so a value can be nudged by exactly 1
    via a click instead of a precise drag — shipped as shared
    `levelControlHTML()`/`wireLevelControl()` helpers in `ui-common.js`,
    replacing every bare slider in the hero and weapon detail modals
    (full writeup in "Slider step buttons" above). Same-day follow-up
    again: asked what other features made sense given everything learned
    about the game; offered 3 concrete options via `AskUserQuestion`
    (Rune system / Gift Chest spawn map / slider gauge-texture reskin)
    and picked the Rune system, the largest real gap this project had
    tracked. Picked up the 8 Rune data tables extracted-but-never-
    committed back on 2026-10-01, found the real hero-rune-vs-generic-
    rune-family structure by actually reading rows rather than trusting
    the prior session's one-line summary, extracted 9 new real icon
    sprites for the 3 generic rune families, and shipped a full equip/
    level/remove UI in the hero enhance modal — deliberately NOT wired
    into the Total DPS estimate (no decompiled evidence ties Runes to
    the confirmed Dps formula). Caught and fixed two real bugs before
    shipping: a generic rune's stat line rendering the literal word
    "Normal" instead of its real stat name (caught by reviewing a
    screenshot, not just the code), and a mobile-viewport overflow in
    the new Rune panel (same root-cause class as the Monsters-tab bug
    from earlier the same day — a non-wrapping component used for
    content it wasn't designed to hold). Full writeup in "Rune system"
    above. Immediate same-day follow-up: asked again what else was
    worth building, and picked a new third option (a "Next Best
    Upgrade" advisor) over the same two still-open Gift Chest map /
    gauge-reskin choices. Shipped by literally re-running the already-
    confirmed Total DPS formula once per candidate upgrade (one step on
    weapon level, hero level/star/evolution, or any of the 4 upgrade
    trees' Power track) rather than deriving a new, separate formula —
    ranks real simulated Dps deltas in a new Guide tab panel, with
    state mutated and synchronously reverted per candidate (verified
    zero leakage via a full state snapshot diff). Full writeup in "Next
    Best Upgrade advisor" above. User then asked directly for the one
    remaining option from the two feature-recommendation rounds this
    same day: the Gift Chest spawn map, a real in-world spawning-chest
    mechanic found back on 2026-10-01 but never wired in. Picked up the
    raw `GiftChestSpawnData`/`GiftChestData` tables (still in the same
    scratchpad), found they actually cover all 3 chapters (not just
    Chapter 1 as previously summarized) though only Chapter 1 has real
    plotted spawn-point coordinates, extracted a real `AcquireGiftChest`
    icon rather than reusing an existing generic chest sprite, and
    shipped a new standalone map entry point on the Farmable Items tab
    reusing the Monsters tab's spawn-overlay-on-real-tile-board pattern.
    Full writeup in "Gift Chest spawn map" above.
37. New session, next day. User asked again what else was worth adding
    and picked the hardest of 3 offered options: finishing the IL2CPP
    decompilation of `CostumeOwnGradeOption`/`CostumeOwnLevelOption`,
    the Total DPS formula's last two unmodeled sources (parked since
    2026-09-04 as "routes through interface/vtable dispatch, too slow
    to trace by hand"). Finished the trace — real finding, not just
    filling in zeros: these (and the already-shipped
    `CostumeOwnEvolutionOption`) are genuine roster-wide "collection"
    sums (every owned hero contributes, not just the active one),
    confirmed via `CalculateOwnStatModifications()` taking no costumeId
    argument and looping the player's whole costume list. Also found
    and fixed a real pre-existing bug this surfaced: the shipped
    `CostumeEquippingGradeOption`/`CostumeEquippingLevelOption` summed
    every row regardless of `OptionStyle`, which would have
    double-counted against the new Own sources reading the complementary
    style once wired in. Full writeup in "Own vs. Equipping Dps sources,
    confirmed" above.
38. User asked whether a user ID could be used to pull a player's real
    account data (heroes/weapons/levels/traits) into the app directly.
    Researched via decompilation (read-only, no live calls made) rather
    than guessing: the game syncs through Firebase Auth + Cloud Firestore
    under Supercent's own `weapon-rpg` Firebase project. Concluded this
    isn't safely buildable without Supercent's cooperation — Google
    OAuth's redirect-URI pre-registration and Android-client cert-hash
    binding are structural blockers to originating valid sign-in for
    someone else's Firebase project, not a technical gap to engineer
    around — and said so plainly rather than attempting to defeat them.
    Re-offered the previously-discussed screenshot-based import as the
    practical alternative; not yet picked up.
39. User reported Google/Discord/Facebook sign-in "fails or never signs
    in" specifically on their mobile phone — all three sign-in methods
    had been Playwright-verified end-to-end when built, but only ever
    with desktop emulation. Found and fixed a real bug: the OAuth
    callback's completion of sign-in secretly depended on a cross-site
    `fetch('/auth/refresh', {credentials:'include'})` reading back the
    httpOnly cookie it had just set — a read mobile browsers (Safari's
    ITP especially) can silently refuse even moments after a legitimate
    same-chain top-level redirect set it. Fixed by handing the access
    token back directly via the URL fragment instead, verified by
    forcing `/auth/refresh` to fail via Playwright route interception and
    confirming sign-in still completed. Full writeup, including the
    Docker-image-rebuild deployment note, in "OAuth mobile sign-in bug,
    found and fixed" above.
40. User asked what else was worth doing and picked "chase the last
    missing artwork properly" — decoding the Addressables catalog's
    binary fields for a real key→bundle lookup, open since 2026-09-30.
    Built and validated a real decoder for Unity's `ContentCatalogData`
    binary format (bucket/key/entry structures), then used it to recover
    all 13 still-missing Hero's Tomb costume icons at once — found they
    follow a real `Costume/Costume_Face/Face_Skin_<Name>` convention
    nobody had searched for (every prior session searched
    `Face_HeroTomb_<Name>`/`HeroTomb_Costume_<Name>`, matching the data
    field's own naming, not the asset's real name) and are
    `LegacyResourcesProvider` entries — meaning they ship inside the base
    APK itself, never remote, which is exactly why 15 bundles of brute-
    force searching never found them. Also used the same tool to confirm,
    via the catalog's actual key list rather than bundle-content
    enumeration, that the remaining 21 missing enemy portraits and 7
    missing Weapon Scroll icons genuinely have no addressable art asset
    anywhere in the game — a stronger negative result than any prior
    session reached. Full writeup in "Decoding the real Addressables
    catalog, and 13 more missing portraits recovered" above.
41. User asked what else was worth doing and picked extending the
    Monsters tab's spawn/patrol map from chapters 1-3 to 4-6, an Open
    Item since 2026-09-30 noting the raw coordinate dump already
    physically contained them. Re-derived 45 new rows from the same raw
    scratchpad data chapters 1-3 originally used (zero orphans joining
    against either `EnemySpawnGroupData_158` or this app's own
    `EnemyData.json`), merged them in with the original 79 rows
    confirmed byte-identical. Needed zero application code changes for
    the core feature — the chapter indices and `SpawnMapUI`'s "no real
    tile board for this chapter" fallback were already chapter-agnostic
    — only a hardcoded caveat string needed updating. Verified a real,
    pre-existing (not new) "no spawn section for this specific monster"
    behavior was correct, not a bug, during testing. Full writeup in
    "Enemy spawn maps extended to chapters 4-6" above.

## Open items / plausible next steps (not started)

- Accounts backend is fully live publicly, all four sign-in methods
  working (email/password, Google, Discord, Facebook) — see "Accounts
  backend" above for the full build writeup and the NPM/Cloudflare
  troubleshooting story from getting `xpherobuilder-api.arc-it.uk` live
  (a Cloudflare Tunnel Public Hostname gap, a force-SSL redirect loop
  against the tunnel's plaintext-to-origin hop, and an NPM bug where
  "renew" never rewrites DNS-challenge credentials from the database —
  all in "Accounts backend" → "NPM/Cloudflare setup"). Nothing left open
  here unless the user wants to expand it further (auto-sync, structured
  per-entity save data, etc. — see the other bullets below on those).
- No migration framework is wired up for the `xpherobuilder` Postgres
  database yet (`server/db/schema.sql` is a point-in-time record of what
  was run by hand, not a re-runnable migration) — fine at this scale, but
  worth revisiting if the schema needs to evolve more than once or twice
  more.
- **Updated 2026-10-01 (see "Auto-sync cloud saves" below)**: the
  accounts system now auto-syncs — this bullet's original concern
  (silent clobbering) is a real, accepted tradeoff of the feature as
  explicitly requested, not an oversight. Still genuinely open: there's
  no conflict resolution at all (last write wins, no merge, no
  "cloud and local both changed since last sync" detection) — fine for
  the realistic single-user-multi-device case this was built for, but
  worth real design if this app ever needs to handle two tabs/devices
  editing concurrently.
- **Updated 2026-10-02 (see "Rune system" above) — this item is now
  shipped, not open.** The Rune equip/level/remove system is live in the
  hero enhance modal: all 9 data tables committed and wired in, 9 new
  icon sprites extracted for the 3 generic Melee/Ranged/Universal rune
  families (hero-specific runes reuse the hero's own existing portrait
  art), real formulas for the unique-option stat line and level-milestone
  bonuses. **What's still genuinely open, stated honestly rather than
  guessed at**: `GrantType 2` level-bonus rows ("grants 1 random
  attribute") have no decoded roll mechanic — shown locked/unresolved,
  not guessed; no decompiled evidence ties Runes into the real Dps
  formula at all, so they're deliberately not folded into the Guide
  tab's Total DPS estimate; `HeroTombRuneDropData`'s own
  `gacha_reward_id`/`gacha_reward_count`/`gacha_reward_drop_rate` fields
  (flagged back on 2026-10-01) remain a separate, still-unexplored
  bonus-roll layer.
- **Updated 2026-09-30 (see "Monster portrait recovery" chronological log
  entry)**: the "likely a remote-only AssetBundle this extraction can't
  reach" theory above was tested directly, not just assumed — the live
  `weaponrpg-game-data` CDN turned out to be a real, browsable, unauthenticated
  GCS bucket, and its two most relevant content bundles (`herotomb_assets_*`,
  `bossraid_assets_*`) were downloaded and fully enumerated via UnityPy.
  10 of the 52 then-missing portraits were real and recoverable (4 were a
  casing-mismatch bug in the *existing* base-APK extraction, not a remote
  gap at all; 6 more — Hero's Tomb "shadow hero" costume faces — were found
  in those bundles under a `Face_Skin_<Name>` naming convention, not
  `Face_HeroTomb_<Name>` as `EnemyData.IconSprite` implies). The remaining
  42 (11 Chapter-1 raid-boss faces, 11 Hero's Tomb enemy faces, 15 more
  Hero's Tomb costume faces) were confirmed **absent from those same two
  downloaded bundles** (fully enumerated, not sampled) and from the
  Addressables catalog's own key list (`m_InternalIds` plain-string
  search only, at the time) — so for these specific 42, "check a
  different bundle" is a real lead only if a third, not-yet-identified
  bundle holds them; it is no longer an unverified guess but it's also not
  confirmed solved. **Fully resolved 2026-10-03 (see "Decoding the real
  Addressables catalog" above)**: a proper binary decode of the catalog
  (not just `m_InternalIds`) found all remaining Hero's Tomb costume
  faces under `Costume/Costume_Face/Face_Skin_<Name>` and confirmed
  they're `LegacyResourcesProvider` (base-APK-local, never remote) — all
  13 recovered. The remaining 21 (5 raid-boss + 16 Hero's Tomb enemy
  faces) were re-confirmed via the same proper decode to have no
  addressable art key at all, the strongest negative evidence reached
  yet. Nothing left open in this specific thread.
- **Updated 2026-10-03 (see "Enemy spawn maps extended to chapters 4-6"
  above) — the chapters-4-6 half of this item is now shipped, not
  open.** `data/EnemySpawnPoints.json` covers chapters 1-6. Still
  genuinely open: `EnemySpawnGroupData_158` has rows up through Chapter
  19, but chapters 7-19 would need locating whichever further remote
  AssetBundles hold their own copies of this same shared spawn-layout
  template — not attempted this session.
- The exact real-world meaning of the `EnemySpawnGroups` scene's
  `Chapter1_N` container numbering vs. the separate
  `LocationEnterTrigger_Stage1..6` trigger volumes (both found in the same
  Chapter-1 world file) was never fully resolved — see "Enemy spawn
  points" above. They don't correspond to each other by nearest-position
  bucketing, so this app deliberately does NOT claim per-stage (only
  per-chapter) precision for spawn points. If a future session figures out
  what these two systems actually are relative to each other (most likely:
  the free-roam/boss-raid open-world mode vs. the story-stage mode being
  genuinely different systems with different level geometry), the spawn
  scatter view could potentially gain real per-stage subdivision.
- Farmable Items coverage: **36/103 real gameplay sources + 24 more
  confirmed Shop Exclusive** as of 2026-10-01 (was a true 11, then 25,
  then 34, then 36, then +24 Shop Exclusive across that day's four
  sessions — see "Boss Raid / Challenge Tower / Hero's Tomb rewards",
  "More item/monster location data", "Chasing 100% item coverage", and
  "Shop Exclusive marking" above, including two real bugs fixed in the
  pre-existing Guaranteed/Chest source types, and one wrong same-day
  conclusion about the Shop ("real money or Gems, never free") caught
  and corrected before it went stale). **Every `*Reward*`-named table in
  the game has now been checked** — wired in, or excluded with a real,
  verified reason (not an assumption). `LevelUpRewardData` has no
  `.Type`-matching field at all — genuinely unresolvable without
  guessing, not unchecked. **What's actually still open**: 43 items
  remain genuinely zero-source (farm *and* shop) — ~6 are crafting-only
  tiered Weapon Scrolls (searched for everywhere, not found as a reward
  or shop listing — likely only obtainable by converting lower tiers, a
  mechanic this app doesn't model), the rest (several Selection Chest
  variants whose `reward_type` category didn't resolve cleanly via
  `.Type`, Rv Skip Ticket, Home Return Portal Ticket ×2) are a short,
  specific list rather than a vague "keep looking" — see "Shop Exclusive
  marking" for exactly which `reward_type` values were trusted and why.
  `DropItemType`/`DropItemType2` cover 100 enemies but plenty more
  `EnemyData` rows have neither set — worth a fresh look if a later APK
  pull reveals more drop fields per enemy, or if the "pieces" field's
  real meaning gets decompiled.
  `HeroTombRuneDropData`'s own `gacha_reward_id`/`gacha_reward_count`/
  `gacha_reward_drop_rate` fields (a second, unexplored bonus-roll layer)
  are also still open.
- **Updated 2026-10-02 (see "Gift Chest spawn map" above) — this item is
  now shipped, not open.** A "🎁 View In-World Gift Chest Spawns" button
  on the Farmable Items tab opens a real map of the 16 Chapter 1
  `GiftChestSpawner` positions, reusing the Monsters tab's spawn-overlay
  pattern (real story-stage tile board as contextual backdrop, same
  honest "which chapter, not which tile" caveat). **What's still
  genuinely open**: Chapters 2-3 have this mechanic configured in
  `GiftChestSpawnData` (level brackets, spawn rate, etc. — all
  extracted and committed) but their real spawner coordinates still only
  exist in the remote-CDN `chapter2`/`chapter3` scene bundles, not
  fetched; and there's no confirmed join from a specific `SpawnerIds`
  number to a specific extracted spawn point, so the map shows one
  chapter-wide active-level range rather than claiming which dot
  activates when. `GiftChestData` (the reward-amount side — Gold/Gem/
  Elixir per player level) remains extracted but not separately
  surfaced anywhere, since all three items already have other confirmed
  sources and showing per-level reward amounts didn't seem worth a
  dedicated UI on its own.
- `BlessingBuffData` was extracted (`data/BlessingBuffData.json`) but never
  wired into anything — 3 buff types, unclear which (if any) maps to a stat
  the app tracks.
- `VipSubscription` source in the Total DPS formula has no matching data
  table at all — stays a manual input unless one is found.
- **Updated 2026-10-03 (see "Own vs. Equipping Dps sources, confirmed"
  below) — this item is now shipped, not open.** `CostumeOwnGradeOption`/
  `CostumeOwnLevelOption` are fully traced and wired into the Total DPS
  formula as real, roster-wide sums.
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
