// ---------------------------------------------------------------------------
// farming.js — combat & farming estimates from the user's build.
//
// Inputs are all game data: EnemyData (MaxHp, DropGoldAmount = gold per kill,
// confirmed against the in-game "21.1K" label over CH12 Demon Soldiers;
// DropAccountExpAmount = account XP per kill), EnemySpawnPoints
// (respawn_cool_time per spawn instance), WorldMap (home + navmesh routes)
// and the site's own Total DPS estimate. Gold/XP bonuses from stats (coin
// rate, subscriptions) aren't applied, so absolute numbers are base values;
// the ranking between areas is what matters.
// ---------------------------------------------------------------------------

const Farming = {
  siteDps() {
    const id = State.data.activeHeroId;
    if (!id || !State.getHero(id)) return null;
    try { const d = Formulas.totalDpsBreakdown(id).dps; return d > 0 ? d : null; } catch { return null; }
  },

  // Optional calibration from the player's own observation:
  // { ch, minutes, cargo } = "I fill <cargo> in <minutes> at CH<ch>".
  calibration() { try { return JSON.parse(localStorage.getItem('xph_farm_cal') || 'null'); } catch { return null; } },
  setCalibration(c) { try { c ? localStorage.setItem('xph_farm_cal', JSON.stringify(c)) : localStorage.removeItem('xph_farm_cal'); } catch {} this._cal = undefined; },

  // Solves the calibration once per (calibration, build) and caches it:
  // { dps, goldMult, mode: 'dps'|'gold'|'site' }.
  effective() {
    const cal = this.calibration();
    const site = this.siteDps();
    const key = JSON.stringify([cal, site]);
    if (this._cal && this._calKey === key) return this._cal;
    let res = { dps: site, goldMult: 1, mode: 'site' };
    if (cal && cal.minutes > 0 && cal.cargo > 0) {
      const observed = cal.cargo / (cal.minutes * 60);                 // gold per second while farming
      const rate = d => this._areaRate(cal.ch, d).gold;
      const max = rate(1e30);
      if (max > 0) {
        if (observed >= max) res = { dps: Math.max(site || 0, this._minDpsForFull(cal.ch)), goldMult: observed / max, mode: 'gold' };
        else {
          let lo = 1, hi = 1e30;
          for (let i = 0; i < 200 && hi / lo > 1.0001; i++) { const mid = Math.sqrt(lo * hi); if (rate(mid) < observed) lo = mid; else hi = mid; }
          res = { dps: hi, goldMult: 1, mode: 'dps' };
        }
      }
    }
    this._cal = res; this._calKey = key;
    return res;
  },
  _minDpsForFull(ch) {
    let lo = 1, hi = 1e30;
    for (let i = 0; i < 200 && hi / lo > 1.0001; i++) { const mid = Math.sqrt(lo * hi); if (this._areaRate(ch, mid).keepUp < 1) lo = mid; else hi = mid; }
    return hi;
  },
  // Spawn-limited gold/XP per second for one CH area at a given DPS.
  _areaRate(ch, dps) {
    let gold = 0, xp = 0, util = 0;
    for (const p of Game.db.EnemySpawnPoints) {
      if (p.chapter !== ch || !(p.respawn_cool_time > 0)) continue;
      const e = Game.index.enemyById.get(p.enemy_data_id);
      if (!e) continue;
      const t = this.ttk(e, dps);
      util += ((t ? (t.scales ? t.mult : t.seconds) : 0) + 1) / p.respawn_cool_time;
      gold += (Number(e.DropGoldAmount) || 0) / p.respawn_cool_time;
      xp += (Number(e.DropAccountExpAmount) || 0) / p.respawn_cool_time;
    }
    const keepUp = util > 1 ? 1 / util : 1;
    return { gold: gold * keepUp, xp: xp * keepUp, keepUp };
  },

  dps() { return this.effective().dps; },

  // Seconds to kill one enemy, or null when it can't be estimated.
  ttk(enemy, dps = this.dps()) {
    if (!enemy || !dps) return null;
    if (enemy.MaxHp_DPSMult > 0) return { scales: true, mult: enemy.MaxHp_DPSMult };
    const hp = Number(enemy.MaxHp) || 0;
    return hp > 0 ? { seconds: hp / dps } : null;
  },

  ttkText(enemy, dps = this.dps()) {
    if (!dps) return 'Add a hero and weapons on the Heroes/Weapons tabs (or calibrate on the World Map tab) to estimate this.';
    const t = this.ttk(enemy, dps);
    if (!t) return '—';
    if (t.scales) return `This enemy's HP scales with your damage (×${t.mult} in the game data), so kill time stays about the same as you get stronger.`;
    return this.fmtTime(t.seconds) + (this.effective().mode === 'site' ? ' (from the site\'s DPS estimate, which runs low; calibrate on the World Map tab)' : ' (calibrated)');
  },

  fmtTime(s) {
    if (s < 0.1) return 'instant (< 0.1s)';
    if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    return `${(s / 3600).toFixed(1)}h`;
  },

  worldOf(ch) { return ch <= 6 ? 1 : ch <= 13 ? 2 : 3; },

  // Route length (world units) from home to a point; navmesh when available.
  routeLength(world, p) {
    const C = Game.db.WorldMap.chapters.find(c => c.chapter === world);
    if (!C) return null;
    if (typeof WorldNav !== 'undefined' && WorldNav.get(world)) {
      const path = WorldNav.route(world, C.home, p);
      if (path) return { len: path.reduce((s, q, i) => i ? s + Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) : 0, 0), exact: true };
    }
    return { len: Math.hypot(p[0] - C.home[0], p[1] - C.home[1]) * 1.3, exact: false };
  },

  // One row per CH area: base gold/XP per hour for this build.
  areas({ cargo = 3.7e6, tripOverhead = 10 } = {}) {
    const eff = this.effective();
    const dps = eff.dps;
    const speed = (Game.db.WorldMap && Game.db.WorldMap.hero_speed) || 12;
    const byCh = groupBy(Game.db.EnemySpawnPoints, p => p.chapter);
    const rows = [];
    for (const [ch, pts] of byCh) {
      let goldRate = 0, xpRate = 0, util = 0, scaling = 0, cx = 0, cz = 0, n = 0;
      const names = new Set();
      for (const p of pts) {
        const e = Game.index.enemyById.get(p.enemy_data_id);
        if (!e || !(p.respawn_cool_time > 0)) continue;
        const t = this.ttk(e, dps);
        const kill = t ? (t.scales ? t.mult : t.seconds) : 0;
        if (t && t.scales) scaling++;
        util += (kill + 1) / p.respawn_cool_time;           // +1s to reach the next target
        goldRate += (Number(e.DropGoldAmount) || 0) / p.respawn_cool_time;
        xpRate += (Number(e.DropAccountExpAmount) || 0) / p.respawn_cool_time;
        cx += p.x; cz += p.z; n++; names.add(e.Name_en);
      }
      if (!n) continue;
      const keepUp = util > 1 ? 1 / util : 1;                // can the build kill as fast as things respawn?
      goldRate *= keepUp * eff.goldMult; xpRate *= keepUp;
      const center = [cx / n, cz / n];
      const world = this.worldOf(ch);
      const route = this.routeLength(world, center);
      const trip = route ? (2 * route.len) / speed + tripOverhead : null;
      const fill = goldRate > 0 ? cargo / goldRate : Infinity;
      const goldHr = goldRate > 0 && trip != null ? (cargo / (fill + trip)) * 3600 : 0;
      rows.push({ ch, world, center, spawns: n, names: [...names], keepUp, goldHr, xpHr: xpRate * 3600, fill, trip, routeExact: route ? route.exact : false, routeLen: route ? route.len : null, scaling });
    }
    return { dps, eff, rows: rows.sort((a, b) => b.goldHr - a.goldHr) };
  },
};

// ---------------------------------------------------------------------------
// UpgradeCost — total resources to raise upgrade levels, from the game's own
// cost tables. Ability rows are sparse checkpoints: costs between them are
// linearly interpolated for gold (verified against live costs); orb costs
// only apply on the exact checkpoint level listing them (inferred).
// ---------------------------------------------------------------------------
const UpgradeCost = {
  _add(tot, type, amt) { if (type == null || type < 0 || !(amt > 0)) return; tot[type] = (tot[type] || 0) + amt; },
  _costs(row, tot, f = 1) { for (const i of [1, 2, 3]) this._add(tot, row[`Cost${i}_Type`], Number(row[`Cost${i}_Amount`]) * f); },

  ability(type, from, to, tot) {
    const rows = (Game.index.abilityLevelsByType.get(type) || []).slice().sort((a, b) => a.CurLevel - b.CurLevel);
    if (!rows.length || to <= from) return;
    let j = 0;
    for (let lv = Math.max(1, from); lv < to; lv++) {
      while (j < rows.length - 2 && rows[j + 1].CurLevel <= lv) j++;
      const a = rows[j], b = rows[Math.min(j + 1, rows.length - 1)];
      const t = b.CurLevel === a.CurLevel ? 0 : Math.min(1, Math.max(0, (lv - a.CurLevel) / (b.CurLevel - a.CurLevel)));
      for (const i of [1, 2, 3]) {
        const ty = a[`Cost${i}_Type`];
        if (!(ty >= 0)) continue;
        if (i === 1) {
          // Gold: linear between checkpoints. Verified against 4 live in-game
          // costs (POWER 737 = 835K, CARGO 720 = 1.28M, HP 760 = 902K,
          // HP RECOVERY 517 = 3.77M).
          this._add(tot, ty, Number(a.Cost1_Amount) + t * (Number(b.Cost1_Amount) - Number(a.Cost1_Amount)));
        } else if (lv === a.CurLevel) {
          // Orbs: only on the exact checkpoint level that lists them (the game
          // shows a gold-only cost at in-between levels). Inferred, not verified.
          this._add(tot, ty, Number(a[`Cost${i}_Amount`]));
        }
      }
    }
  },
  dense(table, levelKey, opt, from, to, tot) {
    for (const r of Game.db[table]) if (r.OptionType === opt && r[levelKey] > from && r[levelKey] <= to) this._costs(r, tot);
  },
  specialGrades(from, to, tot) {
    for (const g of Game.db.SpecialUpgradeGradeData) if (g.id > from && g.id <= to) this._costs(g, tot);
  },
  label(type) { const it = Game.index.itemByType.get(type); return it ? it.Name_en : `Item type ${type}`; },
};
