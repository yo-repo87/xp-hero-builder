# XP Hero Builder

A fan-made, unofficial companion tool for **XP Hero: Weapon RPG** (`io.supercent.weaponrpg`, published by Supercent). Mirror your in-game heroes and weapon loadout, manage traits and upgrade trees, and get build advice tailored to your current setup — all client-side, no login, no server.

**Not affiliated with or endorsed by Supercent.** All weapon/hero names, artwork, and game-balance numbers are Supercent's property, extracted from the game's own asset/data files for this non-commercial community tool. If you're Supercent and would like this taken down, open an issue.

## What it does

- **Weapons tab** — 6 equip slots, just like in-game. Pick from every weapon in the game (real icons, real per-rarity stats), set its upgrade level, and roll bonus affixes to match what you actually have equipped.
- **Heroes tab** — add every hero you own, each with independent level / star grade / evolution tier, and mark which one is currently active.
- **Equipment tab** — the trait loadout (2 groups × 5 synergy slots) and the four account-wide upgrade trees: Ability, Extra, Special, Soul.
- **Guide tab** — pick one of your heroes and get build advice computed live from your actual loadout (weapon category synergy, loadout health, growth pacing, trait coverage, recommended stat focus) — not a static tip list. It also shows an **Estimated Total DPS** using the game's real, decompilation-confirmed `Dps` formula, wired up to every system this app already tracks (player level, ability tree, all 6 weapons, hero grade/level/evolution, Special/Extra/Soul upgrades, trait synergy) — expand "Show full formula breakdown" for a per-source table with each value tagged as data-mapped, manual input, or not modeled, so you can see exactly which parts are solid and which are estimates.
- **Import / Export** — your whole build (heroes + weapons + traits + upgrades) is one portable JSON file. Export it, hand it to someone else, they import it and see exactly your setup.

## Running it locally

Because the app loads its data files via `fetch()`, opening `index.html` directly from disk won't work in most browsers (blocked by CORS-on-`file://` restrictions). Serve the folder instead:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static file server works equally well (`npx serve`, `php -S`, etc.).

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → Deploy from branch → pick `main` (or whichever branch) and `/ (root)`.
3. Your build will be live at `https://<you>.github.io/<repo>/`.

No build step, no dependencies, no bundler — it's plain HTML/CSS/JS.

## How the data was sourced (and its limits)

Every weapon, hero, trait, and upgrade table in `data/*.json`, plus every image in `assets/img/`, was extracted directly from the live APK: game-balance tables came from the game's own serialized Unity data files, and artwork was exported pixel-for-pixel from the game's actual sprite atlases (not redrawn or approximated).

A few things worth knowing before you treat every number here as gospel:

- **Weapon DPS** (per-slot number shown on each weapon): a follow-up pass decompiled the actual compiled `DpsStatCalculator` from the game binary (not just its data tables) to check this. The real in-game `Dps` stat turns out to be a **whole-build aggregate** — it multiplies your weapon's own contribution by three separate percentage brackets pulled from your player level, ability upgrades, hero grade/level/evolution, VIP status, trait roll, and soul upgrades, all at once. What each weapon slot shows as "Weapon DPS" — `base + perLevel × (level − 1)` from `BalancingData_Rarity` — is confirmed to be an accurate model of just that weapon's own slice of the formula, not the combined number your in-game screen shows.
- **Estimated Total DPS** (Guide tab): this *does* implement the full whole-build formula above, confirmed by decompilation for its overall shape (three per-mille multiplier brackets over a flat base — see `Formulas.totalDpsBreakdown` in `js/formulas.js`). Getting the shape right was the easy part; wiring in real numbers for all 17 of the game's `EStatContentType` sources meant making a best-effort call on several ambiguous table→source mappings that decompilation didn't fully resolve (documented per-source, inline, in the code and in the breakdown table's row notes). Two sources (`CostumeOwnGradeOption`, `CostumeOwnLevelOption`) are deliberately left at zero rather than guessed, since reusing already-mapped numbers there would double-count. `VipSubscription` has no matching data table at all, so it's a manual input. `BlessingBuff` has a real data table (`BlessingBuffData.json`, extracted but unused) whose 3 buff types couldn't be confidently tied to the `Dps` stat specifically, so it's also left at zero. Treat the final number as a well-reasoned estimate, not a guaranteed match to your in-game screen — every row's confidence level is visible right in the UI.
- **Hero base stats** are sampled at checkpoint levels (1, 10, 20, …, 130) and linearly interpolated in between — the UI flags interpolated values.
- **Trait slots**: the mapping from "which of the 10 trait slots" to "which stat types can go there" was reconstructed from the game's synergy data tables and has since been **confirmed correct by decompiling `TraitSynergyController.CalculateSynergyTokens`** — the client really does tally how many filled slots share the same rolled stat type, exactly as this app models it.
- **Currency/cost item names** (gold vs. gems vs. various tickets) weren't fully resolved to display names in this pass — costs show as raw item-type codes where a friendly name wasn't available.

If you find a spot where the math clearly doesn't match what you see in-game, it's most likely one of the above — PRs welcome. See [`docs/game_logic_deep_dive.md`](docs/game_logic_deep_dive.md) for the full decompilation writeup (combat damage formula, gacha weight resolution, and every `EStatContentType` source) if you want the derivation, not just the conclusion — raw disassembly is in `docs/decompiled/`.

## Project structure

```
index.html
css/style.css
js/
  data.js            game database loader + lookup indices
  formulas.js         stat-calculation logic (documented, with caveats)
  state.js            build state, localStorage persistence, import/export
  ui-common.js         modal/toast helpers
  ui-weapons.js         weapon slot grid + picker/upgrade modal
  ui-heroes.js          hero roster + picker + enhance modal
  ui-equipment.js       traits + Ability/Extra/Special/Soul upgrade trees
  ui-guide.js           per-hero advice engine
  ui-importexport.js     save-file download/upload
  app.js               bootstrap
data/*.json         extracted, typed, English-labeled game-balance tables (34 tables)
assets/img/weapons/  84 weapon icons, named by weapon id
assets/img/heroes/   24 hero icons, named by costume id
```

Your build is saved to `localStorage` automatically (nothing leaves your browser); Export/Import let you move it between browsers or share it.
