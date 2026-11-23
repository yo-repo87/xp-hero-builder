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
    const sh = document.getElementById('btn-share');
    if (sh) sh.addEventListener('click', () => this.share());
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

  async importFile(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    // A single .json is a build export; anything else is treated as the
    // game's own save files (see js/save-import.js).
    if (files.length === 1 && /\.json$/i.test(files[0].name)) {
      try {
        State.importJSON(await files[0].text());
        UI.toast('Build imported');
      } catch (err) {
        alert('That file could not be read as a valid build export.\n\n' + err.message);
      }
      return;
    }
    try {
      const expanded = [];
      for (const f of files) expanded.push(...(/\.zip$/i.test(f.name) ? await SaveImport.filesFromZip(f) : [f]));
      await SaveImport.importFiles(expanded);
    }
    catch (err) { alert('Could not import game saves.\n\n' + err.message); }
  },

  // Share links: the build (minus UI state) compressed into the URL fragment.
  // Fragments are never sent to the server.
  async _pack(text) {
    const bytes = new TextEncoder().encode(text);
    let out = bytes, tag = 'r';
    if (typeof CompressionStream !== 'undefined') {
      out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      tag = 'z';
    }
    let bin = ''; for (const b of out) bin += String.fromCharCode(b);
    return tag + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  async _unpack(s) {
    const tag = s[0], b64 = s.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (tag === 'z') return new TextDecoder().decode(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    return new TextDecoder().decode(bytes);
  },
  async share() {
    const data = JSON.parse(State.exportJSON());
    delete data.ui;
    const url = `${location.origin}${location.pathname}#build=${await this._pack(JSON.stringify(data))}`;
    try { await navigator.clipboard.writeText(url); UI.toast('Share link copied to clipboard'); }
    catch { prompt('Copy this link to share your build:', url); }
  },
  async checkSharedLink() {
    const m = /#build=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const obj = JSON.parse(await this._unpack(m[1]));
      if (!confirm('Open the shared build from this link? It replaces your current build in this browser (export first if you want a backup).')) return;
      obj.ui = State.data.ui;
      State.importJSON(JSON.stringify(obj));
      UI.toast('Shared build loaded');
    } catch (err) { alert('That share link could not be read.\n\n' + err.message); }
  },

  reset() {
    const cloudNote = Auth.user && AccountUI.activeSaveId ? ' This will also overwrite your active cloud save.' : '';
    if (confirm(`Reset your entire build? This clears all heroes, weapons, traits, and upgrades from this browser.${cloudNote} Export first if you want a backup.`)) {
      State.resetAll();
      UI.toast('Build reset');
    }
  },
};
