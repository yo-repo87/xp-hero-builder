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

  function renderAll() {
    WeaponsUI.render();
    HeroesUI.render();
    EquipmentUI.render();
    FarmableUI.render();
    GuideUI.render();
    setActiveTab(State.data.ui.activeTab);
  }

  function setActiveTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  }

  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    State.setTab(btn.dataset.tab);
  });

  State.subscribe(() => renderAll());
  renderAll();
})();
