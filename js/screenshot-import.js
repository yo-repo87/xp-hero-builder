// =====================================================================
// Screenshot import — reads upgrade levels (Ability / Extra / Special /
// Soul) from in-game "UPGRADES" screenshots via OCR (tesseract.js, loaded
// from CDN only when used). Only those screens are supported: they're
// text-based (title + "Level N / M"). Hero/weapon screens are mostly icons,
// which OCR can't identify reliably, so they're deliberately not attempted.
// Verified against real screenshots (2026-11-21): titles and "Level N / M"
// lines OCR cleanly. Special shows a per-grade-tier "Level N/M", converted
// to this app's cumulative level via Formulas.specialTierBounds (the tier
// size M identifies the Altar Grade).
// =====================================================================
const ScreenshotImport = {
  TESSERACT_URL: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',

  _titles() {
    const out = [];
    const add = (tree, rows, keyOf) => rows.forEach(r => r.Title_en && out.push({
      tree, key: keyOf(r), title: r.Title_en, norm: this._norm(r.Title_en),
    }));
    add('ability', Game.db.AbilityListElementInfo, r => r.id);
    add('extra', Game.db.ExtraUpgradeTypeData, r => r.OptionType);
    add('special', Game.db.SpecialUpgradeTypeData, r => r.OptionType);
    add('soul', Game.db.SoulUpgradeTypeData, r => r.OptionType);
    return out.sort((a, b) => b.norm.length - a.norm.length); // longest match wins
  },

  _norm(s) { return ` ${String(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `; },

  // Pure: OCR text -> [{tree, key, title, level, max, grade?}]. The most recent
  // title line before a "Level N / M" line owns that level.
  parse(text) {
    const titles = this._titles();
    const results = new Map();
    let pending = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const lv = raw.match(/Level\s*(\d+)\s*\/\s*(\d+)/i);
      if (lv && pending) {
        const level = +lv[1], max = +lv[2];
        const r = { ...pending, level, max };
        if (r.tree === 'special') {
          for (let g = 1; g <= 4; g++) {
            const b = Formulas.specialTierBounds(r.key, g);
            if (b && b.tierMax === max) { r.grade = g; r.level = b.priorCap + level; break; }
          }
          if (!r.grade) { pending = null; continue; } // can't place it confidently — skip
        }
        results.set(`${r.tree}:${r.key}`, r);
        pending = null;
        continue;
      }
      const line = this._norm(raw);
      // Description lines ("Increase Extra Power") contain other trees' titles — skip them.
      if (/ (INCREASE|REDUCE|DECREASE|CONVERT) /.test(line)) continue;
      const hit = titles.find(t => line.includes(t.norm));
      if (hit) pending = { tree: hit.tree, key: hit.key, title: hit.title };
    }
    return [...results.values()];
  },

  apply(rows) {
    let grade = 0;
    for (const r of rows) {
      if (r.tree === 'ability') State.data.upgrades.ability[r.key] = r.level;
      else if (r.tree === 'extra') State.data.upgrades.extra[r.key] = r.level;
      else if (r.tree === 'soul') State.data.upgrades.soul[r.key] = r.level;
      else if (r.tree === 'special') { State.data.upgrades.special[r.key] = { grade: r.grade, level: r.level }; grade = Math.max(grade, r.grade); }
    }
    if (grade) State.data.upgrades.special.__grade = Math.max(State.data.upgrades.special.__grade || 1, grade);
    State.notify();
  },

  async _loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = this.TESSERACT_URL; s.onload = res; s.onerror = () => rej(new Error('Could not load the OCR library.'));
      document.head.appendChild(s);
    });
    return window.Tesseract;
  },

  open() {
    UI.openModal(`
      <div class="modal-header"><h3>📷 Import Upgrades from Screenshots</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <p class="caveat">Pick screenshots of the in-game <b>UPGRADES</b> screen (Ability, Special, or Extra tab — scroll and take
        several to cover every row). Text is read on your device; images are never uploaded.
        Hero and weapon screens aren't supported (they're icon-based).</p>
        <label class="btn btn-gold" style="cursor:pointer">📁 Choose Screenshots<input type="file" id="ssi-files" accept="image/*" multiple hidden></label>
        <div id="ssi-status" class="caveat"></div>
        <div id="ssi-results"></div>
      </div>`);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('ssi-files').addEventListener('change', (e) => this._run([...e.target.files]));
  },

  async _run(files) {
    const status = document.getElementById('ssi-status');
    const out = document.getElementById('ssi-results');
    if (!files.length) return;
    out.innerHTML = '';
    try {
      status.textContent = 'Loading OCR engine (first time can take a few seconds)…';
      const T = await this._loadTesseract();
      const worker = await T.createWorker('eng');
      const all = new Map();
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Reading screenshot ${i + 1} of ${files.length}…`;
        const { data } = await worker.recognize(files[i]);
        for (const r of this.parse(data.text)) all.set(`${r.tree}:${r.key}`, r);
      }
      await worker.terminate();
      const rows = [...all.values()];
      if (!rows.length) { status.textContent = 'No upgrade rows recognized. Make sure the screenshot shows the UPGRADES screen.'; return; }
      status.textContent = `Found ${rows.length} upgrade levels. Review, then apply:`;
      const label = { ability: 'Ability', extra: 'Extra', special: 'Special', soul: 'Soul' };
      out.innerHTML = `
        ${rows.map((r, i) => `<label class="milestone-row"><input type="checkbox" checked data-i="${i}">
          ${label[r.tree]} · ${escapeHtml(r.title)} → Lv ${r.level}${r.tree === 'special' ? ` (Altar Grade ${r.grade})` : ''}</label>`).join('')}
        <div class="action-row"><button class="btn btn-gold" id="ssi-apply">Apply Selected</button></div>`;
      document.getElementById('ssi-apply').addEventListener('click', () => {
        const chosen = [...out.querySelectorAll('input[data-i]')].filter(c => c.checked).map(c => rows[+c.dataset.i]);
        this.apply(chosen);
        UI.closeModal();
        UI.toast(`Imported ${chosen.length} upgrade levels.`);
      });
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
    }
  },
};
