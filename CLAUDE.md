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
  `sw.js` (offline service worker)
- `tests/` has Node regression tests: run `node tests/run.js`
- Optional backend in `server/` (Node/Express + Postgres on `shared_postgres`, db/role
  `xpherobuilder`, container `xpherobuilder_backend`, host port 3142 → container 4000, public URL
  `xpherobuilder-api.arc-it.uk` via NPM + Cloudflare Tunnel). It provides accounts
  (email + Google/Discord/Facebook OAuth, passkeys, TOTP), cloud saves with auto-sync,
  the Forum, and Admin. The container has **no bind-mount**: to deploy, rebuild the
  image and recreate the container (keep the env vars). Migrations live in
  `server/db/migrations/`.
- `server/savepull/`: container `xpherobuilder_savepull` (host network, own adb server on port 5038)
  pulls the game's save files from the VM and serves a zip on 172.20.0.1:8099 (Docker bridge only),
  guarded by `SAVEPULL_TOKEN` (in gitignored `server/savepull/.env`). The backend's admin-only
  `GET /admin/game-saves` proxies it (backend env `SAVEPULL_URL`, `SAVEPULL_TOKEN`). Rollback image:
  `xpherobuilder-backend:prev`.
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
- Weapon merge: the result starts at Lv 1. Level carry-over isn't decoded.
