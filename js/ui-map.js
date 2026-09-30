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
