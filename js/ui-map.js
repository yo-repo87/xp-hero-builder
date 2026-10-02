// ---------------------------------------------------------------------------
// ui-map.js — shared "View Map" popup for Farmable Items and Monsters.
//
// This renders the game's REAL minimap layout, not a fabricated terrain
// map: tile positions/sizes were extracted directly from the actual Unity
// UI prefab the game itself uses for its per-chapter Minimap popup (every
// Stage1..Stage7 node's real RectTransform anchoredPosition/sizeDelta,
// normalized to 0-1 against the prefab's real 720x600 canvas — see
// data/StageMapLayout.json and CLAUDE.md's "Real map art" entry for the
// full extraction writeup). Tile art is the game's own real per-stage
// preview image for Chapter 3 (the only chapter shipping full-color unique
// tile art in the current game files); Chapters 1-2 only ship a dimmed
// silhouette per tile in the extracted assets — apparently once a chapter
// is fully cleared the game drops its full-color art and keeps only this
// dimmed "completed" version — so that's what's shown for them, honestly,
// rather than inventing color art that doesn't exist in the game's files.
//
// Only chapters 1-3 have any of this real layout data (matches StageData's
// own coverage exactly) — there is no equivalent for chapters 4+.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MapZoom — shared pan/zoom behavior for both map canvases above (the real
// story-stage board and the spawn/patrol overlay). Wraps a canvas's inner
// content in a fixed-size "viewport" + a transformed "stage" div; wheel
// zooms centered on the cursor, dragging pans, and +/−/reset buttons cover
// touch/no-scroll-wheel cases. Pinch-to-zoom works via the Pointer Events
// API (mouse, touch, and pen all go through the same code path).
// ---------------------------------------------------------------------------
const MapZoom = {
  MIN: 1, MAX: 5, STEP: 0.5,

  // Wraps `innerHTML` (whatever a canvas's content would have been) with the
  // pan/zoom chrome. `canvasClass` is the existing canvas class(es) that
  // carry the border-image frame/aspect-ratio/background — those stay put
  // and become the fixed-size "viewport"; only their content now lives in
  // a transformable `.map-zoom-stage` child.
  wrapHTML(canvasClass, innerHTML) {
    return `
      <div class="map-zoom-wrap">
        <div class="${canvasClass} map-zoom-viewport">
          <div class="map-zoom-stage">${innerHTML}</div>
        </div>
        <div class="map-zoom-controls">
          <button type="button" class="map-zoom-btn" data-zoom-action="out" title="Zoom out">−</button>
          <button type="button" class="map-zoom-btn" data-zoom-action="reset" title="Reset view">⟲</button>
          <button type="button" class="map-zoom-btn" data-zoom-action="in" title="Zoom in">+</button>
        </div>
      </div>`;
  },

  // Call after the HTML above is actually in the DOM (e.g. from an
  // openModal onMount) to wire up every zoomable map found under `root`.
  wire(root) {
    root.querySelectorAll('.map-zoom-wrap').forEach(wrap => this.wireOne(wrap));
  },

  wireOne(wrap) {
    const viewport = wrap.querySelector('.map-zoom-viewport');
    const stage = wrap.querySelector('.map-zoom-stage');
    if (!viewport || !stage) return;

    let scale = 1, panX = 0, panY = 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const clampPan = () => {
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      panX = clamp(panX, vw * (1 - scale), 0);
      panY = clamp(panY, vh * (1 - scale), 0);
    };
    const apply = () => {
      stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      viewport.classList.toggle('zoomed', scale > 1);
    };
    // Zoom by `factor`, keeping the content point currently under
    // (anchorX, anchorY) — viewport-relative pixels — fixed on screen.
    const zoomAt = (factor, anchorX, anchorY) => {
      const newScale = clamp(scale * factor, this.MIN, this.MAX);
      if (newScale === scale) return;
      const localX = (anchorX - panX) / scale, localY = (anchorY - panY) / scale;
      scale = newScale;
      panX = anchorX - localX * scale;
      panY = anchorY - localY * scale;
      clampPan(); apply();
    };
    const reset = () => { scale = 1; panX = 0; panY = 0; apply(); };

    // Only zoom on Ctrl+wheel (also how browsers report trackpad
    // pinch-to-zoom gestures) — a plain scroll over the map falls through
    // to the page/modal's own scroll instead of being captured. Capturing
    // every wheel tick unconditionally used to trap the mouse over a tall
    // map, making the rest of the modal (legend/caveat/controls below it)
    // feel permanently unreachable — reported as "maps run off screen".
    viewport.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    stage.addEventListener('dragstart', (e) => e.preventDefault());

    // Pointer Events unify mouse/touch/pen, but touch needs different
    // handling from mouse for the same "don't trap the user's scroll"
    // reason as the wheel handler above: a single mouse-drag pans (mouse
    // has no competing native gesture to protect), but a single TOUCH
    // is left alone — CSS `touch-action: pan-y` lets it fall through to
    // the browser's own vertical scroll of the modal. Only once a second
    // finger lands do we take over (pinch-zoom-and-pan, computed fresh
    // from a snapshot taken when that second pointer lands); a two-finger
    // drag without pinching just pans via the midpoint.
    const pointers = new Map(); // pointerId -> {x, y} in viewport-relative px
    let mode = null; // 'pan' | 'pinch'
    let panStart = null; // {x, y, panX, panY}
    let pinchStart = null; // {dist, midX, midY, scale, panX, panY}

    const rectXY = (e) => {
      const rect = viewport.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const twoPointerGeometry = () => {
      const pts = [...pointers.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      return { dist: Math.hypot(dx, dy), midX: (pts[0].x + pts[1].x) / 2, midY: (pts[0].y + pts[1].y) / 2 };
    };

    viewport.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, rectXY(e));
      if (pointers.size === 1) {
        if (e.pointerType === 'touch') return; // let native scroll handle a lone finger
        viewport.setPointerCapture(e.pointerId);
        mode = 'pan';
        panStart = { ...rectXY(e), panX, panY };
      } else if (pointers.size === 2) {
        pointers.forEach((_, id) => { try { viewport.setPointerCapture(id); } catch { /* already released */ } });
        mode = 'pinch';
        const g = twoPointerGeometry();
        pinchStart = { ...g, scale, panX, panY };
      }
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, rectXY(e));

      if (mode === 'pan' && pointers.size === 1) {
        const p = rectXY(e);
        panX = panStart.panX + (p.x - panStart.x);
        panY = panStart.panY + (p.y - panStart.y);
        clampPan(); apply();
      } else if (mode === 'pinch' && pointers.size === 2) {
        const g = twoPointerGeometry();
        const newScale = clamp(pinchStart.scale * (g.dist / (pinchStart.dist || 1)), this.MIN, this.MAX);
        const localX = (pinchStart.midX - pinchStart.panX) / pinchStart.scale;
        const localY = (pinchStart.midY - pinchStart.panY) / pinchStart.scale;
        scale = newScale;
        panX = g.midX - localX * scale;
        panY = g.midY - localY * scale;
        clampPan(); apply();
      }
    });

    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 1 && e.pointerType !== 'touch') {
        // Resume single-pointer panning from here without a jump (mouse
        // only — a lone remaining finger after a pinch goes back to
        // native scroll rather than resuming a pan it never opted into).
        const [remaining] = pointers.values();
        mode = 'pan';
        panStart = { x: remaining.x, y: remaining.y, panX, panY };
      } else {
        mode = null;
      }
    };
    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);

    wrap.querySelectorAll('.map-zoom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.zoomAction;
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        if (action === 'in') zoomAt(1 + this.STEP, vw / 2, vh / 2);
        else if (action === 'out') zoomAt(1 / (1 + this.STEP), vw / 2, vh / 2);
        else reset();
      });
    });
  },
};

const MapUI = {
  // Real per-chapter tile board markup (the actual Minimap prefab layout —
  // see file header). Shared by open() below and by SpawnMapUI, which
  // overlays free-roam spawn/patrol data on top of this same real art
  // instead of a blank canvas. pinByStage: optional Map(stage -> pin).
  tilesHTML(chapter, pinByStage = new Map()) {
    const layoutRows = (Game.index.stageMapLayoutByChapter.get(chapter) || []).slice().sort((a, b) => a.stage - b.stage);
    return layoutRows.map(row => {
      const pin = pinByStage.get(row.stage);
      const style = `left:${(row.x * 100).toFixed(2)}%;top:${(row.y * 100).toFixed(2)}%;width:${(row.w * 100).toFixed(2)}%;height:${(row.h * 100).toFixed(2)}%;`;
      return `
        <div class="map-tile${pin ? ' hit' : ''}" style="${style}">
          <img class="map-tile-art" src="${Game.stageMapTile(row)}" onerror="onImgError(this)" alt="">
          <div class="map-tile-num">${row.stage}</div>
          ${pin ? `<img class="map-tile-pin" src="${pin.iconUrl}" onerror="onImgError(this)" alt="" title="${escapeHtml(pin.label || '')}">` : ''}
        </div>`;
    }).join('');
  },

  // pins: [{ chapter, stage, iconUrl, label }]
  // beforeHTML: optional extra markup inserted above the map cards (e.g. a
  // boss-portrait row).
  open(title, pins, beforeHTML = '') {
    const chapters = [...new Set(pins.map(p => p.chapter))].sort((a, b) => a - b);

    const cardsHTML = chapters.map(ch => {
      const hasLayout = (Game.index.stageMapLayoutByChapter.get(ch) || []).length > 0;
      const pinByStage = new Map(pins.filter(p => p.chapter === ch).map(p => [p.stage, p]));

      if (!hasLayout) {
        return `
          <div class="chapter-map-card">
            <div class="chapter-map-title">Chapter ${ch} — ${escapeHtml(Game.chapterName(ch))}</div>
            <div class="caveat">No real minimap layout was found in the extracted game files for this chapter.</div>
          </div>`;
      }

      return `
        <div class="chapter-map-card">
          <div class="chapter-map-title">Chapter ${ch} — ${escapeHtml(Game.chapterName(ch))}</div>
          ${MapZoom.wrapHTML('chapter-map-canvas', this.tilesHTML(ch, pinByStage))}
        </div>`;
    }).join('');

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${beforeHTML}
        ${cardsHTML}
        <div class="caveat">This is the game's own real minimap layout — exact stage tile positions and art extracted directly from the game's own UI files, not a fabricated map. Only Chapters 1-3 have this data (same coverage as everywhere else this app tracks stages). Chapter 3 shows the game's full unique tile art; Chapters 1-2 only ship a dimmed "cleared" silhouette per tile in the current game files, so that's shown as-is rather than inventing missing color art. Drag to pan; Ctrl+scroll, pinch, or the +/− buttons to zoom.</div>
      </div>
    `, { onMount: (el) => MapZoom.wire(el) });
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
  },
};

// ---------------------------------------------------------------------------
// SpawnMapUI — inline "Spawn & Patrol Map" for the Monsters tab detail modal.
//
// Plots a genuinely different coordinate system from MapUI's discrete
// story-stage board: real (x,z) world-placement Transform positions of
// every individual enemy spawn instance, extracted straight from the
// game's own EnemySpawnGroups scene data (see data/EnemySpawnPoints.json
// and CLAUDE.md's "Enemy spawn points" entry). These positions live in
// the game's free-roam exploration world space (each chapter occupies its
// own distinct region of one shared coordinate space), which does NOT map
// to specific story-stage tiles — bucketing attempts by nearest stage
// checkpoint produced nonsense (see CLAUDE.md). There's also no real
// top-down terrain/radar art for that free-roam world anywhere in the
// extracted asset tree to use as an accurate backdrop.
//
// So the overlay drawn here uses the one piece of real per-chapter map art
// this app has — MapUI's own real story-stage tile board — as a
// *contextual* backdrop (this chapter, not that one), spreading the real
// spawn/patrol data across the whole board rather than pinning dots to
// individual tiles, which the data doesn't support. The caveat text below
// says this explicitly so it never reads as tile-precise placement.
// Only chapters 1-3 are covered (same as everywhere else in this app).
// ---------------------------------------------------------------------------
const SpawnMapUI = {
  // Returns the inner HTML (canvas + legend + caveat, no modal chrome) for
  // embedding directly into another popup — e.g. the Monsters tab's own
  // detail modal, which shows this inline rather than behind an extra
  // click. Returns '' if this enemy's chapter has no spawn-position data.
  renderInline(enemy) {
    const chapter = Game.enemyChapter(enemy);
    const allInChapter = (chapter !== null && Game.index.spawnPointsByChapter.get(chapter)) || [];
    const ownPoints = Game.index.spawnPointsByEnemyId.get(enemy.id) || [];
    if (!allInChapter.length) return '';

    const xs = allInChapter.map(p => p.x), zs = allInChapter.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const pad = 0.08; // breathing room so edge dots aren't clipped
    const spanX = (maxX - minX) || 1, spanZ = (maxZ - minZ) || 1;
    const norm = (p) => ({
      left: (pad + (1 - 2 * pad) * (p.x - minX) / spanX) * 100,
      top: (pad + (1 - 2 * pad) * (p.z - minZ) / spanZ) * 100,
    });

    const ownIds = new Set(ownPoints.map(p => p.key + p.x + p.z));
    // Sort so the selected monster's own dots render last (on top of the crowd).
    const ordered = allInChapter.slice().sort((a, b) => {
      const aOwn = ownIds.has(a.key + a.x + a.z) ? 1 : 0;
      const bOwn = ownIds.has(b.key + b.x + b.z) ? 1 : 0;
      return aOwn - bOwn;
    });
    const dotsHTML = ordered.map(p => {
      const isOwn = ownIds.has(p.key + p.x + p.z);
      const otherEnemy = Game.index.enemyById.get(p.enemy_data_id);
      const label = otherEnemy ? otherEnemy.Name_en : p.key;
      const iconUrl = otherEnemy ? Game.enemyIcon(otherEnemy) : '';
      const pos = norm(p);
      return `
        <div class="spawn-dot${isOwn ? ' own' : ''}" style="left:${pos.left.toFixed(2)}%;top:${pos.top.toFixed(2)}%;" title="${escapeHtml(label)}${p.is_patrol ? ' (patrols)' : ''}">
          <img src="${iconUrl}" onerror="onImgError(this)" alt="">
        </div>`;
    }).join('');

    // Real patrol-route polylines (see CLAUDE.md "Enemy spawn points" entry)
    // — only the ~20% of spawn instances flagged `is_patrol` have one. Every
    // patrolling instance in this chapter is drawn faint for context; the
    // selected monster's own route(s) are drawn bright gold on top.
    const patrolling = allInChapter.filter(p => p.patrol_path && p.patrol_path.length);
    const polyPoints = (p) => {
      const loop = [...p.patrol_path, p.patrol_path[0]]; // close the loop
      return loop.map(([x, z]) => {
        const n = norm({ x, z });
        return `${n.left.toFixed(2)},${n.top.toFixed(2)}`;
      }).join(' ');
    };
    const pathsHTML = patrolling.map(p => {
      const isOwn = ownIds.has(p.key + p.x + p.z);
      return `<polyline class="spawn-path${isOwn ? ' own' : ''}" points="${polyPoints(p)}" />`;
    }).join('');
    const pathsSvg = pathsHTML
      ? `<svg class="spawn-path-layer" viewBox="0 0 100 100" preserveAspectRatio="none">${pathsHTML}</svg>`
      : '';

    // Real per-chapter tile board (MapUI's own art) as a contextual backdrop
    // — see the file-header note above for why this is a backdrop, not a
    // tile-precise placement.
    const boardTilesHTML = MapUI.tilesHTML(chapter);
    const hasBoard = boardTilesHTML.length > 0;

    const stageInnerHTML = `
      ${hasBoard ? `<div class="spawn-overlay-board">${boardTilesHTML}</div><div class="spawn-overlay-scrim"></div>` : ''}
      ${pathsSvg}${dotsHTML}`;

    return `
      ${MapZoom.wrapHTML('chapter-map-canvas spawn-overlay-canvas', stageInnerHTML)}
      <div class="spawn-map-legend"><span class="spawn-dot own" style="position:static;display:inline-block;"><img src="${Game.enemyIcon(enemy)}" onerror="onImgError(this)" alt=""></span> ${escapeHtml(enemy.Name_en)} (${ownPoints.length} spawn point${ownPoints.length === 1 ? '' : 's'}) &nbsp;&nbsp; <span class="spawn-dot" style="position:static;display:inline-block;"></span> other enemies in Chapter ${chapter}'s free-roam world (${allInChapter.length} total spawn points)${ownPoints.some(p => p.is_patrol) ? ' &nbsp;&nbsp; <span class="spawn-path-swatch own"></span> this monster\'s patrol route' : ''}</div>
      <div class="caveat">These are real placed-in-world (x,z) Transform positions from the game's own enemy spawn scene data (EnemySpawnGroups + EnemySpawnGroupData_158), confirmed by decompiling the actual scene hierarchy — not estimated. They're overlaid here on Chapter ${chapter}'s real story-stage tile board (the same real art the "View Story-Stage Map" button uses) so you can see which chapter you're looking at at a glance${hasBoard ? '' : ' (no real tile board exists for this chapter, so a plain backdrop is shown instead)'} — but the dots are spread across their own free-roam-world layout, which is a genuinely different coordinate system from the discrete stage tiles underneath them, so <strong>dot position relative to a specific tile is not meaningful</strong>, only "this chapter" is. Only Chapters 1-3 have this data extracted.${patrolling.length ? ' Patrol routes (real waypoint loops, from the game\'s own PatrolPathGroup scene data) are only shown for the 16 spawn instances flagged as patrolling in EnemySpawnGroupData_158 — most enemies just stand still at their spawn point.' : ''} Drag to pan; Ctrl+scroll, pinch, or the +/− buttons to zoom.</div>`;
  },
};

// ---------------------------------------------------------------------------
// GiftChestMapUI — "View In-World Gift Chest Spawns" (Farmable Items tab).
//
// A genuinely different mechanic from both MapUI's static story-stage
// ChestData (chests fixed to a stage) and MinimapRewardData (guaranteed
// boss drops): real in-world SPAWNING treasure chests, extracted from
// GiftChestSpawner GameObjects in the same Chapter 1 world-scene file
// EnemySpawnPoints came from, converted into that exact same coordinate
// frame (see data/GiftChestSpawnPoints.json and CLAUDE.md "Gift Chest
// spawn map"). Reuses SpawnMapUI's real-tile-board-as-contextual-backdrop
// technique and the same honest "this is which chapter, not which tile"
// caveat — same reasoning as there, not re-derived.
//
// Only Chapter 1 has real plotted coordinates (same reason as
// EnemySpawnPoints — Chapters 2-3's spawner GameObjects live in remote-CDN
// scene bundles never fetched). GiftChestSpawnData's own level-bracket/
// SpawnerIds config DOES cover all 3 chapters, and genuinely gates which
// of the 16 points are "live" at a given player level — but there's no
// confirmed join between a specific SpawnerIds number and a specific
// extracted GameObject name (the position dump has no numeric spawner ID
// field, just Unity's own auto-generated GameObject names), so this
// deliberately does NOT claim "dot N activates at level Y" — only the
// chapter-wide level range, which the data does support directly.
const GiftChestMapUI = {
  open() {
    const chapters = [...new Set(Game.db.GiftChestSpawnPoints.map(p => p.chapter))].sort((a, b) => a - b);

    const cardsHTML = chapters.map(ch => {
      const points = Game.index.giftChestSpawnPointsByChapter.get(ch) || [];
      const xs = points.map(p => p.x), zs = points.map(p => p.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const pad = 0.08;
      const spanX = (maxX - minX) || 1, spanZ = (maxZ - minZ) || 1;
      const norm = (p) => ({
        left: (pad + (1 - 2 * pad) * (p.x - minX) / spanX) * 100,
        top: (pad + (1 - 2 * pad) * (p.z - minZ) / spanZ) * 100,
      });
      const dotsHTML = points.map(p => {
        const pos = norm(p);
        return `
          <div class="spawn-dot" style="left:${pos.left.toFixed(2)}%;top:${pos.top.toFixed(2)}%;" title="${escapeHtml(p.name)}">
            <img src="assets/img/chests/AcquireGiftChest.png" alt="">
          </div>`;
      }).join('');

      const boardTilesHTML = MapUI.tilesHTML(ch);
      const hasBoard = boardTilesHTML.length > 0;
      const stageInnerHTML = `
        ${hasBoard ? `<div class="spawn-overlay-board">${boardTilesHTML}</div><div class="spawn-overlay-scrim"></div>` : ''}
        ${dotsHTML}`;

      const brackets = Game.index.giftChestSpawnDataByChapter.get(ch) || [];
      const levelRange = brackets.length
        ? `active between player level ${Math.min(...brackets.map(b => b.MinLevel))}-${Math.max(...brackets.map(b => b.MaxLevel))}`
        : null;

      return `
        <div class="chapter-map-card">
          <div class="chapter-map-title">Chapter ${ch} — ${escapeHtml(Game.chapterName(ch))}</div>
          ${points.length ? MapZoom.wrapHTML('chapter-map-canvas spawn-overlay-canvas', stageInnerHTML)
            : `<div class="caveat">No real spawn-point coordinates extracted for this chapter yet (see caveat below).</div>`}
          <div class="spawn-map-legend">Gift Chest spawns: ${points.length} real spawn point${points.length === 1 ? '' : 's'} in Chapter ${ch}${levelRange ? ` - ${levelRange}` : ''}</div>
        </div>`;
    }).join('');

    UI.openModal(`
      <div class="modal-header"><h3>In-World Gift Chest Spawns</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${cardsHTML}
        <div class="caveat">A genuine in-world mechanic distinct from the static chests shown elsewhere in this app: these spawn points appear and can be collected, then go on cooldown and respawn. Positions are real extracted GiftChestSpawner Transform coordinates (16 confirmed in Chapter 1, same technique as the Monsters tab's enemy spawn points), overlaid on the real story-stage tile board as contextual "which chapter" framing only — like the Monsters tab's spawn overlay, this free-roam coordinate space doesn't map to specific story-stage tiles, so dot position relative to a tile isn't meaningful. The game's own data (GiftChestSpawnData) confirms which of the 16 points are eligible to be active scales up with your player level across the whole chapter, but there's no confirmed link from a specific point to a specific level bracket, so that's shown as one chapter-wide range rather than guessed per-dot. Per the same data (uniform across every Chapter 1 bracket): a new chest becomes available roughly every 600, stays collectible for 300, and the spot respawns 300 after that (raw field units, likely seconds, not independently confirmed). Rewards are Gold, Gem, or Elixir scaled by player level (GiftChestData) — all three already have other confirmed farmable sources, so this doesn't add new item coverage, just a real place to go stand. Chapters 2-3 have this same mechanic configured in the data but their real spawner coordinates live in remote CDN scene bundles this extraction never fetched, so only Chapter 1 is plotted. Drag to pan; Ctrl+scroll, pinch, or the +/- buttons to zoom.</div>
      </div>
    `, { onMount: (el) => MapZoom.wire(el) });
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
  },
};
