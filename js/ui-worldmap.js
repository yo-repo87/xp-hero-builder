// ---------------------------------------------------------------------------
// ui-worldmap.js — World Map tab.
//
// The game's own minimap art per world chapter, with everything plotted at
// true world coordinates (data/WorldMap.json, decoded from the game's
// MinimapChapterTable; the art covers exactly center ± worldSize/2, north up).
// Enemy spawns and gift chests come from EnemySpawnPoints / GiftChestSpawnPoints
// (same world frame). For chapters with the game's NavMeshData, "route from
// home" runs A* over the navmesh polygons plus a funnel (string-pulling) pass,
// so routes follow walkways, ladders and bridges instead of straight lines.
// ---------------------------------------------------------------------------

const WorldNav = {
  _cache: {},
  get(ch) {
    if (this._cache[ch] !== undefined) return this._cache[ch];
    const src = Game.db.WorldMap.nav && Game.db.WorldMap.nav[ch];
    if (!src) return (this._cache[ch] = null);
    const polys = src.polys.map(f => { const v = []; for (let i = 0; i < f.length; i += 2) v.push([f[i], f[i + 1]]); return v; });
    const cent = polys.map(v => [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length]);
    return (this._cache[ch] = { polys, cent, links: src.links });
  },
  contains(poly, x, z) {
    let sign = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (Math.abs(c) < 1e-9) continue;
      const s = c > 0 ? 1 : -1;
      if (!sign) sign = s; else if (sign !== s) return false;
    }
    return true;
  },
  locate(nav, p) {
    for (let i = 0; i < nav.polys.length; i++) if (this.contains(nav.polys[i], p[0], p[1])) return i;
    let best = -1, bd = Infinity; // off-mesh click: snap to nearest polygon
    nav.cent.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; best = i; } });
    return bd < 12 ? best : -1;
  },
  route(ch, from, to) {
    const nav = this.get(ch);
    if (!nav) return null;
    const s = this.locate(nav, from), t = this.locate(nav, to);
    if (s < 0 || t < 0) return null;
    const g = new Map([[s, 0]]), prev = new Map(), open = [[0, s]];
    const h = i => Math.hypot(nav.cent[i][0] - nav.cent[t][0], nav.cent[i][1] - nav.cent[t][1]);
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, u] = open.shift();
      if (u === t) break;
      for (const [v, k] of nav.links[u]) {
        const P = nav.polys[u], a = P[k], b = P[(k + 1) % P.length];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const nd = g.get(u) + Math.hypot(m[0] - nav.cent[u][0], m[1] - nav.cent[u][1]) + Math.hypot(nav.cent[v][0] - m[0], nav.cent[v][1] - m[1]);
        if (nd < (g.has(v) ? g.get(v) : Infinity)) { g.set(v, nd); prev.set(v, [u, a, b]); open.push([nd + h(v), v]); }
      }
    }
    if (s !== t && !prev.has(t)) return null;
    const portals = [];
    for (let c = t; c !== s; c = prev.get(c)[0]) { const [, a, b] = prev.get(c); portals.unshift([a, b]); }
    return this.funnel(from, to, portals);
  },
  // Simple stupid funnel algorithm (string pulling) over the portal edges.
  funnel(start, end, portals) {
    const tri = (a, b, c) => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
    const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
    const pts = [];
    let prev = start;
    for (const [A, B] of portals) {
      const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      pts.push(tri(prev, m, A) < 0 ? [A, B] : [B, A]);
      prev = m;
    }
    pts.push([end, end]);
    const path = [start];
    let apex = start, [left, right] = pts[0], li = 0, ri = 0;
    for (let i = 1; i < pts.length; i++) {
      const [L, R] = pts[i];
      if (tri(apex, right, R) <= 0) {
        if (eq(apex, right) || tri(apex, left, R) > 0) { right = R; ri = i; }
        else { path.push(left); apex = left; i = li; left = right = apex; li = ri = i; continue; }
      }
      if (tri(apex, left, L) >= 0) {
        if (eq(apex, left) || tri(apex, right, L) < 0) { left = L; li = i; }
        else { path.push(right); apex = right; i = ri; left = right = apex; li = ri = i; continue; }
      }
    }
    if (!eq(path[path.length - 1], end)) path.push(end);
    return path;
  },
};

const WorldMapUI = {
  _mounted: false,
  chapter: 2,
  layers: { bosses: true, monsters: true, chests: true, portals: true },
  routeTo: null,

  render() {
    if (this._mounted) return; // static content: independent of build state
    const root = document.getElementById('worldmap-root');
    if (!root || !Game.db.WorldMap) return;
    this._mounted = true;
    this.draw();
  },

  worldChapterOf(ch) { return ch <= 6 ? 1 : ch <= 13 ? 2 : 3; },

  draw() {
    const root = document.getElementById('worldmap-root');
    const wm = Game.db.WorldMap;
    const C = wm.chapters.find(c => c.chapter === this.chapter) || wm.chapters[0];
    const hasNav = !!WorldNav.get(C.chapter);
    const pct = (x, z) => [((x - (C.center[0] - C.size[0] / 2)) / C.size[0]) * 100, (((C.center[1] + C.size[1] / 2) - z) / C.size[1]) * 100];
    const mk = (x, z, cls, inner, title, data) => {
      const [l, t] = pct(x, z);
      return `<button type="button" class="wm-mk ${cls}" style="left:${l.toFixed(2)}%;top:${t.toFixed(2)}%" title="${escapeHtml(title)}" ${data}>${inner}</button>`;
    };
    const enemyName = id => { const e = Game.index.enemyById.get(id); return e ? e.Name_en : `Enemy #${id}`; };
    let marks = '';
    if (this.layers.monsters) {
      for (const p of Game.db.EnemySpawnPoints) {
        if (this.worldChapterOf(p.chapter) !== C.chapter || /_(Elite|Boss)$/.test(p.key)) continue;
        marks += mk(p.x, p.z, 'wm-mob', '', `${enemyName(p.enemy_data_id)} (CH${p.chapter})`, `data-enemy="${p.enemy_data_id}" data-x="${p.x}" data-z="${p.z}"`);
      }
    }
    if (this.layers.chests) {
      for (const p of Game.db.GiftChestSpawnPoints) {
        if (p.chapter !== C.chapter) continue;
        marks += mk(p.x, p.z, 'wm-chest', '🎁', `Gift chest spawn (stage ${p.stage ?? '?'})`, `data-chest="1" data-x="${p.x}" data-z="${p.z}"`);
      }
    }
    if (this.layers.portals) {
      for (const p of C.portals) marks += mk(p.x, p.z, 'wm-portal', `${p.stage}`, `Stage ${p.stage} portal`, `data-portal="${p.stage}" data-x="${p.x}" data-z="${p.z}"`);
    }
    if (this.layers.bosses) {
      for (const b of C.bosses) {
        const e = Game.index.enemyById.get(b.enemy_id);
        const img = e ? `<img src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt="">` : '';
        marks += mk(b.x, b.z, `wm-boss ${/_Boss$/.test(b.key) ? 'is-boss' : ''}`, img, `${enemyName(b.enemy_id)} (CH${b.stage})`, `data-enemy="${b.enemy_id}" data-x="${b.x}" data-z="${b.z}"`);
      }
    }
    marks += mk(C.home[0], C.home[1], 'wm-home', '🏠', 'Home (town)', `data-home="1" data-x="${C.home[0]}" data-z="${C.home[1]}"`);

    let routeSvg = '', routeInfo = '';
    if (this.routeTo && hasNav) {
      const path = WorldNav.route(C.chapter, C.home, this.routeTo.p);
      if (path) {
        const len = path.reduce((s, p, i) => i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0, 0);
        routeSvg = `<svg class="wm-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${path.map(p => pct(p[0], p[1]).map(v => v.toFixed(2)).join(',')).join(' ')}"/></svg>`;
        routeInfo = `<div class="wm-route-info">🧭 Walking route from home to <strong>${escapeHtml(this.routeTo.label)}</strong>: about <strong>${Math.round(len)}</strong> world units (roughly ${Math.max(1, Math.round(len / (wm.hero_speed || 12)))}s of walking at a measured ~${wm.hero_speed || 12} units/s; your hero's move speed changes this). <button type="button" class="btn" id="wm-clear-route">Clear</button></div>`;
      } else routeInfo = `<div class="wm-route-info">No walkable route found to that spot. <button type="button" class="btn" id="wm-clear-route">Clear</button></div>`;
    }

    const chBtns = wm.chapters.map(c => `<button type="button" class="btn ${c.chapter === C.chapter ? 'btn-gold' : ''}" data-wm-ch="${c.chapter}">World ${c.chapter} — ${escapeHtml(Game.chapterName(c.chapter))}</button>`).join(' ');
    const layerBox = (k, label) => `<label class="wm-layer"><input type="checkbox" data-wm-layer="${k}" ${this.layers[k] ? 'checked' : ''}> ${label}</label>`;
    root.innerHTML = `
      <div class="wm-controls">
        <div class="wm-chapters">${chBtns}</div>
        <div class="wm-layers">${layerBox('bosses', 'Bosses &amp; elites')}${layerBox('monsters', 'Monster spawns')}${layerBox('chests', 'Gift chests')}${layerBox('portals', 'Stage portals')}</div>
      </div>
      ${routeInfo}
      ${MapZoom.wrapHTML(`wm-canvas wm-ch${C.chapter}`, `<div class="wm-stage"><img class="wm-art" src="${C.image}" alt="World ${C.chapter} map">${routeSvg}${marks}</div>`)}
      <div id="wm-detail" class="wm-detail">${hasNav ? 'Tap any marker, or any walkable spot on the map, to see the walking route from home.' : 'Tap a marker for details. Walking routes need the game\'s navmesh, which is only extracted for World 2 so far.'}</div>
      <div class="caveat">Map art, home, portals and every elite/boss position come straight from the game's own minimap data (MinimapChapterTable); monster and gift-chest spawns from the game's scene data, all in the same true world coordinates (north up). World 1 comes from the APK and World 2 from the game's downloaded Chapter 2 bundle; World 3 isn't available yet. Routes are planned on the game's own NavMeshData for World 2, the same walkable surface its enemies path-find on.</div>`;

    MapZoom.wire(root);
    root.querySelectorAll('[data-wm-ch]').forEach(b => b.addEventListener('click', () => { this.chapter = +b.dataset.wmCh; this.routeTo = null; this.draw(); }));
    root.querySelectorAll('[data-wm-layer]').forEach(b => b.addEventListener('change', () => { this.layers[b.dataset.wmLayer] = b.checked; this.draw(); }));
    const clear = root.querySelector('#wm-clear-route');
    if (clear) clear.addEventListener('click', () => { this.routeTo = null; this.draw(); });
    root.querySelectorAll('.wm-mk').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); this.select(el, C, hasNav); }));
    const art = root.querySelector('.wm-art');
    if (hasNav && art) {
      art.addEventListener('click', ev => {
        const r = art.getBoundingClientRect();
        const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
        const x = C.center[0] - C.size[0] / 2 + fx * C.size[0], z = C.center[1] + C.size[1] / 2 - fy * C.size[1];
        this.routeTo = { p: [x, z], label: `the spot you tapped (${Math.round(x)}, ${Math.round(z)})` };
        this.draw();
      });
    }
  },

  select(el, C, hasNav) {
    const x = +el.dataset.x, z = +el.dataset.z;
    const detail = document.getElementById('wm-detail');
    let label = 'this spot', html = '';
    if (el.dataset.enemy) {
      const e = Game.index.enemyById.get(+el.dataset.enemy);
      label = e ? e.Name_en : 'this enemy';
      html = e ? `<img class="wm-detail-icon" src="${Game.enemyIcon(e)}" onerror="onImgError(this)" alt=""><strong>${escapeHtml(e.Name_en)}</strong>${e.NickName_en ? ` — “${escapeHtml(e.NickName_en)}”` : ''} <button type="button" class="btn" data-wm-open="${e.id}">Monster details</button><div class="wm-coords">HP ${fmtNum(e.MaxHp)} · Attack ${fmtNum(e.AttackPower)} · Kill time with your build: ${escapeHtml(Farming.ttkText(e))}</div>` : escapeHtml(label);
    } else if (el.dataset.chest) { label = 'a gift chest spawn'; html = '🎁 <strong>Gift chest spawn point</strong>: chests appear here periodically (see the Farmable tab for timings and rewards).'; }
    else if (el.dataset.portal) { label = `the Stage ${el.dataset.portal} portal`; html = `🌀 <strong>Stage ${escapeHtml(el.dataset.portal)} portal</strong>`; }
    else if (el.dataset.home) { detail.innerHTML = '🏠 <strong>Home</strong>: return here to cash in your cargo.'; return; }
    detail.innerHTML = `${html}<div class="wm-coords">World position (${Math.round(x)}, ${Math.round(z)})</div>${hasNav ? `<button type="button" class="btn btn-gold" id="wm-route-btn">Route from home</button>` : ''}`;
    const rb = detail.querySelector('#wm-route-btn');
    if (rb) rb.addEventListener('click', () => { this.routeTo = { p: [x, z], label }; this.draw(); });
    const ob = detail.querySelector('[data-wm-open]');
    if (ob) ob.addEventListener('click', () => MonstersUI.openDetail(+ob.dataset.wmOpen));
  },
};

const FarmingUI = {
  _key: null,
  cargo() { try { return +localStorage.getItem('xph_cargo') || 3.7e6; } catch { return 3.7e6; } },
  render() {
    const root = document.getElementById('farming-root');
    if (!root || !Game.db.WorldMap) return;
    const cargo = this.cargo();
    const key = JSON.stringify([State.data.upgrades, State.data.weapons, State.data.weaponRoster, State.data.heroes, State.data.activeHeroId, State.data.player, cargo, Farming.calibration()]);
    if (key === this._key) return;
    this._key = key;
    const { dps, eff, rows } = Farming.areas({ cargo });
    const cal = Farming.calibration();
    const chOpts = rows.map(r => r.ch).sort((a, b) => a - b).map(c => `<option value="${c}" ${cal && cal.ch === c ? 'selected' : ''}>CH${c}</option>`).join('');
    const best = rows[0] && rows[0].goldHr;
    const body = rows.map(r => `<tr>
        <td><strong>CH${r.ch}</strong> <span class="info-sub">World ${r.world}</span><div class="info-sub">${escapeHtml(r.names.slice(0, 3).join(', '))}${r.names.length > 3 ? '…' : ''}</div></td>
        <td class="num" title="${fmtNum(Math.round(r.goldHr))}">${fmtCompact(r.goldHr)}${best && r.goldHr === best ? ' 🏆' : ''}</td>
        <td class="num" title="${fmtNum(Math.round(r.xpHr))}">${fmtCompact(r.xpHr)}</td>
        <td class="num">${r.keepUp < 0.999 ? `<span class="ms-behind">${Math.round(r.keepUp * 100)}%</span>` : '<span class="ms-ok">100%</span>'}</td>
        <td class="num">${isFinite(r.fill) ? Farming.fmtTime(r.fill) : '—'}</td>
        <td class="num">${r.trip != null ? Farming.fmtTime(r.trip) : '—'}${r.routeExact ? '' : ' <span class="info-sub">est.</span>'}</td>
        <td><button type="button" class="btn" data-farm-ch="${r.ch}">Show</button></td></tr>`).join('');
    root.innerHTML = `
      <div class="section-title" style="margin-top:24px"><h2>Best Farming Spots</h2></div>
      <p class="section-sub">Every area ranked by gold per hour for your current build (${eff.mode === 'site' ? 'site DPS estimate' : 'calibrated DPS'} ${dps ? fmtNum(Math.round(dps)) : 'unknown: add a hero and weapons first'}), counting cargo trips home.</p>
      <label class="info-note farm-cargo-label">Cargo capacity: <input type="number" class="input" id="farm-cargo" value="${cargo}" min="1000" step="100000" style="width:140px"></label>
      <div class="info-card"><strong>Calibrate with what you see in-game</strong> ${eff.mode === 'site' ? '<span class="ms-behind">(not calibrated: using the site\'s DPS estimate, which runs low)</span>' : `<span class="ms-ok">calibrated: effective DPS ${fmtNum(Math.round(eff.dps))}${eff.goldMult > 1.001 ? `, gold bonus ×${eff.goldMult.toFixed(2)}` : ''}</span>`}
        <div class="info-note">I fill my cargo in <input type="number" class="input" id="cal-min" value="${cal ? cal.minutes : ''}" min="0.1" step="0.5" style="width:80px"> minutes while farming <select class="input" id="cal-ch">${chOpts}</select>
        <button type="button" class="btn btn-gold" id="cal-save">Calibrate</button>${cal ? ' <button type="button" class="btn" id="cal-clear">Clear</button>' : ''}</div>
        <div class="info-sub">The site solves for the damage that would give that fill time. If your rate is higher than the spawns could ever give, the extra is treated as gold bonuses instead.</div></div>
      <div class="info-card"><table class="info-table"><thead><tr><th>Area</th><th class="num">Gold / hr</th><th class="num">XP / hr</th><th class="num" title="How much of the respawn rate your build can keep up with">Keep-up</th><th class="num">Fill cargo</th><th class="num">Trip home &amp; back</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="caveat">Each spawn point gives one kill per respawn time (EnemySpawnGroupData). If your kill time (enemy HP ÷ your DPS, +1s to reach the next target) can't keep up, output is scaled down ("Keep-up"). Gold per kill is the enemy's base DropGoldAmount; coin-rate bonuses and subscriptions aren't applied, so real numbers are higher, but the ranking holds. Trip times use the navmesh walking route in World 2 and straight-line ×1.3 elsewhere ("est."), at a measured ~${Game.db.WorldMap.hero_speed} units/s, plus 10s in town. Areas with enemies whose HP scales with your damage use the game's multiplier as their kill time.</div>`;
    root.querySelector('#farm-cargo').addEventListener('change', e => {
      try { localStorage.setItem('xph_cargo', String(Math.max(1000, +e.target.value || 3.7e6))); } catch {}
      this._key = null; this.render();
    });
    root.querySelector('#cal-save').addEventListener('click', () => {
      const minutes = +root.querySelector('#cal-min').value;
      if (!(minutes > 0)) { UI.toast('Enter how many minutes a full cargo takes'); return; }
      Farming.setCalibration({ ch: +root.querySelector('#cal-ch').value, minutes, cargo });
      this._key = null; this.render();
    });
    const clr = root.querySelector('#cal-clear');
    if (clr) clr.addEventListener('click', () => { Farming.setCalibration(null); this._key = null; this.render(); });
    root.querySelectorAll('[data-farm-ch]').forEach(b => b.addEventListener('click', () => {
      const r = rows.find(x => x.ch === +b.dataset.farmCh);
      WorldMapUI.chapter = r.world;
      WorldMapUI.routeTo = { p: r.center, label: `the CH${r.ch} farming area` };
      WorldMapUI.draw();
      document.getElementById('worldmap-root').scrollIntoView({ behavior: 'smooth' });
    }));
  },
};
