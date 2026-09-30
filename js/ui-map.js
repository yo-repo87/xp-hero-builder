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

const MapUI = {
  // pins: [{ chapter, stage, iconUrl, label }]
  // beforeHTML: optional extra markup inserted above the map cards (e.g. a
  // boss-portrait row).
  open(title, pins, beforeHTML = '') {
    const chapters = [...new Set(pins.map(p => p.chapter))].sort((a, b) => a - b);

    const cardsHTML = chapters.map(ch => {
      const layoutRows = (Game.index.stageMapLayoutByChapter.get(ch) || []).slice().sort((a, b) => a.stage - b.stage);
      const pinByStage = new Map(pins.filter(p => p.chapter === ch).map(p => [p.stage, p]));

      if (!layoutRows.length) {
        return `
          <div class="chapter-map-card">
            <div class="chapter-map-title">Chapter ${ch} — ${escapeHtml(Game.chapterName(ch))}</div>
            <div class="caveat">No real minimap layout was found in the extracted game files for this chapter.</div>
          </div>`;
      }

      const tilesHTML = layoutRows.map(row => {
        const pin = pinByStage.get(row.stage);
        const style = `left:${(row.x * 100).toFixed(2)}%;top:${(row.y * 100).toFixed(2)}%;width:${(row.w * 100).toFixed(2)}%;height:${(row.h * 100).toFixed(2)}%;`;
        return `
          <div class="map-tile${pin ? ' hit' : ''}" style="${style}">
            <img class="map-tile-art" src="${Game.stageMapTile(row)}" onerror="onImgError(this)" alt="">
            <div class="map-tile-num">${row.stage}</div>
            ${pin ? `<img class="map-tile-pin" src="${pin.iconUrl}" onerror="onImgError(this)" alt="" title="${escapeHtml(pin.label || '')}">` : ''}
          </div>`;
      }).join('');

      return `
        <div class="chapter-map-card">
          <div class="chapter-map-title">Chapter ${ch} — ${escapeHtml(Game.chapterName(ch))}</div>
          <div class="chapter-map-canvas">${tilesHTML}</div>
        </div>`;
    }).join('');

    UI.openModal(`
      <div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        ${beforeHTML}
        ${cardsHTML}
        <div class="caveat">This is the game's own real minimap layout — exact stage tile positions and art extracted directly from the game's own UI files, not a fabricated map. Only Chapters 1-3 have this data (same coverage as everywhere else this app tracks stages). Chapter 3 shows the game's full unique tile art; Chapters 1-2 only ship a dimmed "cleared" silhouette per tile in the current game files, so that's shown as-is rather than inventing missing color art.</div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
  },
};

// ---------------------------------------------------------------------------
// SpawnMapUI — "View Spawn Positions" popup for the Monsters tab.
//
// This is a SEPARATE feature from MapUI above, plotting a completely
// different coordinate system: real (x,z) world-placement Transform
// positions of every individual enemy spawn instance, extracted straight
// from the game's own EnemySpawnGroups scene data (see
// data/EnemySpawnPoints.json and CLAUDE.md's "Enemy spawn points" entry).
// These positions live in the game's free-roam exploration world space
// (each chapter occupies its own distinct region of one shared coordinate
// space — not the discrete story-stage board MapUI renders above), so
// this is deliberately a different-looking scatter view rather than being
// forced onto the stage-tile board, where it wouldn't mean anything.
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

    return `
      <div class="spawn-map-canvas">${pathsSvg}${dotsHTML}</div>
      <div class="spawn-map-legend"><span class="spawn-dot own" style="position:static;display:inline-block;"><img src="${Game.enemyIcon(enemy)}" onerror="onImgError(this)" alt=""></span> ${escapeHtml(enemy.Name_en)} (${ownPoints.length} spawn point${ownPoints.length === 1 ? '' : 's'}) &nbsp;&nbsp; <span class="spawn-dot" style="position:static;display:inline-block;"></span> other enemies in Chapter ${chapter}'s free-roam world (${allInChapter.length} total spawn points)${ownPoints.some(p => p.is_patrol) ? ' &nbsp;&nbsp; <span class="spawn-path-swatch own"></span> this monster\'s patrol route' : ''}</div>
      <div class="caveat">These are real placed-in-world (x,z) Transform positions from the game's own enemy spawn scene data (EnemySpawnGroups + EnemySpawnGroupData_158), confirmed by decompiling the actual scene hierarchy — not estimated. They plot each monster's position <em>relative to every other spawn point in this chapter's own free-roam world region</em>, which is a genuinely different coordinate system from the story-stage board map shown elsewhere in this app (that one tracks discrete Stage 1-N progress tiles; this one tracks continuous in-world placement) — the two aren't on the same scale and shouldn't be compared directly. Only Chapters 1-3 have this data extracted.${patrolling.length ? ' Patrol routes (real waypoint loops, from the game\'s own PatrolPathGroup scene data) are only shown for the 16 spawn instances flagged as patrolling in EnemySpawnGroupData_158 — most enemies just stand still at their spawn point.' : ''}</div>`;
  },
};
