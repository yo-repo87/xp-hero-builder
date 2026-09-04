// ---------------------------------------------------------------------------
// ui-importexport.js — save-file download/upload for the whole build
// (heroes, weapons, traits, upgrades) as one portable JSON file.
// ---------------------------------------------------------------------------

const ImportExportUI = {
  init() {
    document.getElementById('btn-export').addEventListener('click', () => this.exportFile());
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
    document.getElementById('file-import').addEventListener('change', (e) => this.importFile(e));
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());
  },

  exportFile() {
    const json = State.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `xphero-build-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UI.toast('Build exported');
  },

  importFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        State.importJSON(reader.result);
        UI.toast('Build imported');
      } catch (err) {
        alert('That file could not be read as a valid build export.\n\n' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  },

  reset() {
    if (confirm('Reset your entire build? This clears all heroes, weapons, traits, and upgrades from this browser. Export first if you want a backup.')) {
      State.resetAll();
      UI.toast('Build reset');
    }
  },
};
