# XP Hero Builder — Project Reference

Fan-made companion web app for the mobile game **XP Hero: Weapon RPG**
(`io.supercent.weaponrpg`, internal codename DevilHunterIdle). It mirrors the
user's real in-game account (heroes, weapons, runes, traits, upgrades) for
build planning. **Full history, methodology and every past finding are in
`docs/history.md`. Grep it for a topic instead of reading the whole file.**
Formula and decompilation details are in `docs/game_logic_deep_dive.md`.

- Live site: https://yo-repo87.github.io/xp-hero-builder/ (GitHub Pages, `main`, root)
- Repo: public. It contains real art ripped from the game. The user accepted that
  risk twice, so don't re-raise it.
- **Never commit `XP Hero Images/`.** Those are personal account screenshots
  (gitignored). Use them for verification only.
- **Never commit a downloaded game-save zip.** Those hold account identifiers and are not gitignored.

## Architecture
Static HTML/CSS/vanilla JS, no build step. `app.js` boots: `Game.load()` → `State.init()` → `renderAll()`.
Every state change re-renders everything (`State.notify()` → each `*UI.render()`), by deliberate choice.
Forum/Admin are the exception: they load from the server and mount once.
- `js/data.js` loads `data/*.json` into `Game.db` and builds `Game.index.*`
- `js/formulas.js` holds all stat math. Each formula is tagged confirmed/mapped/manual/unmodeled
- `js/state.js` holds the user build (localStorage, import/export, `migrate()` for old saves)
- `js/ui-*.js` holds one module per tab, plus `ui-map.js` (MapUI/SpawnMapUI/GiftChestMapUI) and `ui-search.js`.
  `ui-worldmap.js` (World Map + navmesh routing + FarmingUI), `ui-info.js` (Game Info), MilestoneUI in `ui-guide.js`,
  `farming.js` (kill time, farming model, DPS calibration, UpgradeCost), `save-import.js` (game save files),
  `save-edit.js` (save-zip codec) and `ui-save-editor.js` (Admin Save Editor modal),
  `sw.js` (offline service worker)
- `tests/` has Node regression tests: run `node tests/run.js`
- Optional backend in `server/` (Node/Express + Postgres on `shared_postgres`, db/role
  `xpherobuilder`, container `xpherobuilder_backend`, host port 3142 → container 4000, public URL
  `xpherobuilder-api.arc-it.uk` via NPM + Cloudflare Tunnel). It provides accounts
  (email + Google/Discord/Facebook OAuth, passkeys, TOTP), cloud saves with auto-sync,
  the Forum, and Admin. The container has **no bind-mount**: to deploy, rebuild the
  image and recreate the container (keep the env vars). Tag the running image first. Never print
  env values. Migrations live in `server/db/migrations/`.
  Access tokens are 15-minute JWTs kept only in memory (`ACCESS_TOKEN_TTL`; do not lengthen it).
  Refresh is the httpOnly cookie `xhb_refresh`: `SameSite=None`, `Secure`, `Partitioned`, `path=/auth`,
  30 days. A browser that blocked the old cookie stores the partitioned one only after the next sign-in.
  Do not clear that cookie when the presented refresh token was rotated in the last few seconds
  (two tabs otherwise rotate the same cookie and the loser wipes the winner).
- `server/savepull/`: container `xpherobuilder_savepull` (host network, own adb server on port 5038)
  pulls and applies the game's save files. It binds 172.20.0.1:8099 (Docker bridge only),
  guarded by `SAVEPULL_TOKEN` (gitignored `server/savepull/.env`). Admin `GET` and `POST /admin/game-saves`
  proxy `GET`/`POST /saves.zip` (backend env `SAVEPULL_URL`, `SAVEPULL_TOKEN`). No bind-mount: rebuild
  the image and recreate the container. Tag the running image first. Never print `SAVEPULL_TOKEN`.
  One request at a time (busy → 429). Do not POST a real account save as a test.
- Community Reports go through the n8n webhook at `n8n.arc-it.uk` (workflow `2YxPo48UppaVLnNy`).

## Hard rules
- **Honesty norm:** if a data→formula mapping isn't confirmed, show it as
  zero/unmodeled/manual with a caveat. Never present a guess as fact.
  Reward/cost codes need **zero orphans** before you trust a convention.
- Reward ids: `RewardType 1` → `StackableItemData.Type`, `RewardType 4` → `.id`.
  `RewardGroupData.Group` is the stable key (`id` is not). It isn't globally unique
  across systems.
- Committed `data/*.json` has **no schema-row prefix**. Never `.slice(1)` it.
  Sparse fields: check the key union across all rows, never just the first row.
- Escape all user/server text with `escapeHtml`.
- Verify UI changes with Playwright (desktop + mobile, every tab, zero console errors)
  when it's available. If it isn't, say so.
- Cache-busting: after changing any `js/`/`css/` file, run `scripts/bump-version.sh`
  after committing. It updates every `?v=` in `index.html`; data fetches reuse it.
- Push: `git push "https://x-access-token:$(cat gitkey)@github.com/yo-repo87/xp-hero-builder.git" main`.
  `gitkey` is gitignored. Git identity is repo-scoped. Never touch global config.
- Production tests: test accounts use `playwright-test%` emails. Delete them afterward.
- Game data source: the user's Android VM (`adb` 192.168.122.34:5555, root shell). The APK
  (v27.2.0) and the full extraction (dump.cs, TextAssets, merge/diff scripts) live in
  gitignored `apk/` (durable). Downloaded chapter bundles come from the VM's
  `/sdcard/Android/data/io.supercent.weaponrpg/files/UnityCache/Shared`. To refresh after a
  game update, `adb shell pm path` → pull → `apk/work/merge.py`. Il2CppDumper runs in a
  `mcr.microsoft.com/dotnet/runtime:6.0` container. More in `docs/history.md`.

## Farm bot (personal, not part of the site)
- `apk/bot/farm2.py` (gitignored) auto-farms on the VM: when cargo hits MAX it walks home to cash in, then
  back to `FARM` (world 15,124 = CH12 ice zone). Run it detached:
  `cd apk/bot && setsid nohup ../work/venv/bin/python farm2.py >> farm.log 2>&1 < /dev/null &`.
  Stop with `touch apk/bot/STOP`. Logs: `farm.log` (trips) and `steps.log` (every position read).
- Position = blue dot on the in-game map (≈1.15 px/world unit, north up, fit in `common.py`). Routing =
  A* + funnel over the chapter-2 NavMeshData polygons (`navpoly.py`); a flat 2D grid fails because the
  ice plateau overlaps lower ground (the hero hits the cliff instead of taking the ladder).
- Safety: never tap the Return button (it opens the membership IAP screen) or any purchase/ad button.
  "Gift Discovered" popups get the free green CLAIM only. The map's close X is tapped only after a
  template check confirms the map is open (that corner on the game screen is the gem counter).
- Cash-in counts only when within 30 units of home AND two consecutive not-MAX reads (combat text
  over the cargo bar caused false trips). It survives adb drops / VM reboots (reconnect + retry) and
  walks to the farm on startup. It does NOT auto-start after a host reboot.
- Supervisor agent (`apk/bot/agent/`): when a route fails, `farm2.py` calls `supervisor.ask()`, which runs
  headless Claude Code (`claude -p`, the user's paid plan, default model `sonnet`, max 6 calls/hour) inside
  `agent/` with only `Read`, `Edit(lessons.md)` and `Bash(./gametool.py:*)`. `gametool.py` is its only way to
  act and refuses taps in blocked zones (Return, shop/offers, currency counters, PASS, ads). `lessons.md` =
  its memory; `runs.log` = every run. Promote repeated lessons into bot code.
- Game saves (`Android/data/io.supercent.weaponrpg/files/`) are unencrypted: file name = Base64 of a
  UTF-16LE `save_<name>_1.0|1.1`, body = header + Base64 of UTF-16LE JSON. See `js/save-import.js` and `js/save-edit.js`.

## Save editor (Admin)
- The Admin page has a **Save Editor** button. It opens the site modal (`SaveEditor.open`); it is not another tab. Closing the window keeps the in-memory session. A refresh or a closed tab drops it. **Apply save to the game** sits next to **Download save files** and file-picks a zip. There is no in-editor apply button.
- `js/save-edit.js` loads a savepull zip (decoded `save_*` names) or an editor export (Base64 of UTF-16LE names). Wallet fields `gold`, `gem` (BlueStone, forge), and `crystal` (shop Gem) are decimal strings, max int64 `9223372036854775807`. Stack amounts are JSON numbers; a 16-digit or larger value locks that stack and the editor leaves it unchanged. A dirty group is rewritten into every slot it already had, at version = previous max + 1, with the same JSON. Missing slots are not created. Untouched files keep their original bytes.
- Always-visible cards, even at zero: Elixir (type 5, icon `Stackable_Elixer`) and S-Ticket (type 6002, `Stackable_TraitSuperTicket`). Evolution Potion (type 8401) stays with the heroes. Those three types are hidden from the searchable stack list so each has one input. Hero tokens are `PieceCount` inside `save_costume` `o_list_sp17`. Changing a count does not unlock, level, or evolve a hero. A hero missing from the save is added as not unlocked, level 1, star 1, at its birth rarity, only when the token count is set above zero.
- Adding a weapon is capped by `BalancingData_Rarity.MaxLevel` for that weapon's Rarity and Grade. An owned copy already above that max keeps its current level as the cap, so the editor does not force it down. If that row is missing, say so and accept only level 1. Do not invent a cap. **Upgrade to …** changes one owned copy's `WeaponId` to `NextTierID` and keeps `UniqueId` (so it stays equipped), its existing bonus options, AddRate, FixedDPSAdd, and lock flags. It does not spend the real merge cost (3 copies, or 2 copies plus 1 Transcendence Stone for Exotic→Eternal). If the next tier's `BonusOptionCount` is higher, extra options are midpoints of `WeaponBonusOptionData` and the row says they are not a game roll. Level carry-over on a real merge is still not decoded: the editor keeps the level and lowers it only when it would pass the next tier's MaxLevel.
- **Traits** window edits `save_trait_roll` `sil` (`UserTraitSlotInfo[]`: `i` slot, `o` `TraitOptionData` id, `s` synergy type, `l` `_isLocked`). Only `o` and `s` change, checked against `TraitOptionData` / `TraitSynergyTypeData`; `l` stays as saved and slots are never added. Grades use `ETraitGrade` (1 E … 8 SSS). It picks a trait directly and spends no Trait Points or S-Tickets. Choices come from `SaveEdit.traitRollRules`, which mirrors the decompiled `TraitRollController.RollSingleSlot` (rate-weighted `TraitRollData` row → `TraitOptionData` in that option group → `TraitSynergyGroupData`; zero-rate rows excluded). It reads only the rolled slot, so there is no per-slot grade limit and duplicates are legal. Group 1 (normal) rolls E–SSS, group 2 (S-Ticket) S–SSS; every current option and synergy is reachable. Weapon add-picker clicks are `.se-pick[data-pick]` only, because trait options share `.se-pick`.
- Rows use `Game.itemIcon`, `Game.weaponIcon`, and `Game.heroIcon`. Do not invent files for PackageIcons that are absent from `assets/img/`.
- Apply writes only while the game is closed. If `io.supercent.weaponrpg` is running, savepull returns 409 and writes nothing. It replaces only save files inside the zip whose names match `/^save_\w+_1\.[01]$/` (underscores are valid; `save_boss_raid_1.0` is a real file) and whose body contains the `ewAi` marker. Encoded names must round-trip through `deviceFileName`. It does not delete device files that are absent from the zip.
- When apply says the access token is invalid or expired: on the Admin page click **Sign in again**, sign in with the same account, then apply that same zip. That button and the caveat under Game Save Backup are the recovery, so it does not need an agent. `Auth.authedFetch` refreshes shortly before the 15-minute token expires and retries a 401 once. Do not open the sign-in modal over the editor; that replaces the modal DOM. The session itself survives.

## Open items
- `GrantType 2` rune random-attribute roll: not investigated.
- Codex bonuses (Game Info tab) aren't in the DPS math: option-value units unconfirmed.
- Gacha boxes are listed by type/id: the data doesn't say which shop button or key opens each.
- World chapter 3 (CH14+) spawn points and gift chests need its scene bundle, which the VM
  downloads only once that chapter is reached.
- Site Total DPS runs far low (~75x vs live on the user's account). Farming/kill-time use a calibration
  from the player's own cargo-fill time instead. Finding the missing DPS sources is the biggest open item.
- No total-HP model, so "would you survive" isn't shown, only kill time.
- Still unmodeled: BlessingBuff, VipSubscription (manual input).
- 43 Farmable items have no known source. 21 enemy portraits and 7 Weapon Scroll icons
  are confirmed absent from the game files.
- Forum: no real-time updates, uploads, mod tier, or channel management UI.
- Screenshot import covers Ability/Special/Extra/Soul levels only. Hero/weapon screens are icon-based, so OCR can't read them.
- Weapon merge: the result starts at Lv 1. Level carry-over isn't decoded. The save editor keeps the old level and says so; it does not guess a carry-over rule.
