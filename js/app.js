// ---------------------------------------------------------------------------
// app.js — bootstrap: load game data, init state, wire tabs, first render.
// ---------------------------------------------------------------------------

(async function main() {
  UI.init();

  try {
    await Game.load();
  } catch (err) {
    document.querySelector('main').innerHTML = `
      <div class="empty-state">
        <div class="es-icon">⚠️</div>
        Couldn't load game data files.<br>
        <span class="mono" style="font-size:.8rem">${escapeHtml(err.message)}</span><br><br>
        If you're opening index.html directly from disk, most browsers block fetch() for local files —
        serve this folder with a local web server (e.g. <code>python3 -m http.server</code>) or via GitHub Pages instead.
      </div>`;
    return;
  }

  State.init();
  ImportExportUI.init();
  AccountUI.init();
  await Auth.init(); // silent session resume (or OAuth-redirect completion) — no-op if not signed in or backend unreachable; Auth.subscribe already re-renders the header/profile tab if it succeeds

  if (Auth.oauthRedirectResult === 'success') UI.toast(`Signed in as ${Auth.user.displayName}`);
  else if (Auth.oauthRedirectResult === 'error') UI.toast("Sign-in didn't go through — try again");

  function renderAll() {
    WeaponsUI.render();
    HeroesUI.render();
    EquipmentUI.render();
    FarmableUI.render();
    MonstersUI.render();
    GuideUI.render();
    setActiveTab(State.data.ui.activeTab);
  }

  function setActiveTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  }

  function wireTabClicks(containerId) {
    document.getElementById(containerId).addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      State.setTab(btn.dataset.tab);
    });
  }
  wireTabClicks('tabs');
  wireTabClicks('mobile-tabs');

  // Mobile header's "⋯" button — a compact stand-in for the Import/Export/
  // Reset buttons that don't fit a phone-width header, reusing the exact
  // same underlying actions rather than duplicating their logic.
  document.getElementById('btn-mobile-menu').addEventListener('click', () => {
    UI.openModal(`
      <div class="modal-header"><h3>More</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body action-row" style="flex-direction:column;align-items:stretch">
        <button class="btn" id="mm-import">Import Build</button>
        <button class="btn" id="mm-export">Export Build</button>
        <button class="btn btn-danger" id="mm-reset">Reset Build</button>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('mm-import').addEventListener('click', () => { UI.closeModal(); document.getElementById('file-import').click(); });
    document.getElementById('mm-export').addEventListener('click', () => { UI.closeModal(); ImportExportUI.exportFile(); });
    document.getElementById('mm-reset').addEventListener('click', () => { UI.closeModal(); ImportExportUI.reset(); });
  });

  State.subscribe(() => renderAll());
  renderAll();
})();
