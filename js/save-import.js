// ---------------------------------------------------------------------------
// save-import.js — import a build straight from the game's own save files.
//
// The game keeps its saves in Android/data/io.supercent.weaponrpg/files/.
// Each file name is Base64 of a UTF-16LE name ("save_ability_1.1", ...), and
// each file is a short header followed by Base64 of UTF-16LE JSON. They are
// double-buffered (_1.0 / _1.1); the copy with the higher "version" wins.
// Decoding happens entirely in the browser. Account identifiers in the saves
// (userId, gameUserId, nickname) are never read into the build.
// ---------------------------------------------------------------------------

const SaveImport = {
  _utf16(bytes) { return new TextDecoder('utf-16le').decode(bytes); },
  _b64bytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

  decodeName(fileName) {
    if (/^save_/.test(fileName)) return fileName;
    try { const n = this._utf16(this._b64bytes(fileName)); if (/^[\w.]+$/.test(n)) return n; } catch {}
    return null;
  },

  decodeContent(buf) {
    const bytes = new Uint8Array(buf);
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    const i = text.indexOf('ewAi'); // Base64 of '{"' in UTF-16LE
    if (i < 0) return null;
    const m = /^[A-Za-z0-9+/=]+/.exec(text.slice(i));
    let b64 = m[0]; b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(this._utf16(this._b64bytes(b64)).replace(/\u0000+$/, ''));
  },

  async readFiles(files) {
    const saves = {};
    for (const f of files) {
      const name = this.decodeName(f.name);
      if (!name || !/^save_\w+_1\.[01]$/.test(name)) continue;
      let json;
      try { json = this.decodeContent(await f.arrayBuffer()); } catch { continue; }
      if (!json) continue;
      const key = name.replace(/_1\.[01]$/, '');
      const ver = +json.version || 0;
      if (!saves[key] || ver > saves[key].ver) saves[key] = { ver, json };
    }
    const out = {};
    for (const [k, v] of Object.entries(saves)) out[k] = v.json;
    return out;
  },

  _obj(v) { return typeof v === 'string' ? JSON.parse(v) : (v || {}); },
  _ints(o) { const r = {}; for (const [k, v] of Object.entries(o)) r[+k] = +v; return r; },

  // Returns { build, summary } in the site's own export format.
  toBuild(s) {
    const b = freshState();
    const summary = [];
    if (s.save_ability) { b.upgrades.ability = this._ints(this._obj(s.save_ability.lvs)); summary.push(`${Object.keys(b.upgrades.ability).length} ability levels`); }
    if (s.save_extra_upgrade) { b.upgrades.extra = this._ints(this._obj(s.save_extra_upgrade.up_d)); summary.push(`${Object.keys(b.upgrades.extra).length} extra upgrades`); }
    if (s.save_special_upgrade) {
      const g = +s.save_special_upgrade.g_lv || 1;
      for (const [k, lv] of Object.entries(this._obj(s.save_special_upgrade.ulv_dict))) b.upgrades.special[+k] = { grade: g, level: +lv };
      summary.push(`${Object.keys(b.upgrades.special).length} special upgrades (grade ${g})`);
    }
    if (s.save_soul_upgrade) { b.upgrades.soul = this._ints(this._obj(s.save_soul_upgrade.up_d)); summary.push(`${Object.keys(b.upgrades.soul).length} soul upgrades`); }
    if (s.save_currency && s.save_currency.lv) { b.player.level = +s.save_currency.lv; summary.push(`player level ${b.player.level}`); }

    if (s.save_costume) {
      const list = this._obj(s.save_costume.o_list_sp17);
      for (const c of Object.values(list)) {
        if (!c.IsPurchased) continue;
        const def = Game.index.costumeById.get(c.CostumeID);
        if (!def) continue;
        b.heroes.push({ id: cryptoId(), costumeId: c.CostumeID, level: c.Level || 1, starGrade: c.Grade || 1,
          evoRarity: c.Rarity > (def.rarity || 0) ? c.Rarity : 0, runes: Array(7).fill(null) });
      }
      const eq = b.heroes.find(h => h.costumeId === +s.save_costume.e_id) || b.heroes[0];
      b.activeHeroId = eq ? eq.id : null;
      summary.push(`${b.heroes.length} heroes`);
      if (eq && s.save_rune) {
        const inst = new Map(this._obj(s.save_rune.ins).map(r => [r.iid, r]));
        let n = 0;
        for (const sl of this._obj(s.save_rune.slt)) {
          const r = inst.get(sl.iid);
          if (r && Game.db.RuneData.some(d => d.id === r.rid) && sl.si < 7) { eq.runes[sl.si] = { runeDataId: r.rid, level: r.lv || 1 }; n++; }
        }
        if (n) summary.push(`${n} equipped runes`);
      }
    }

    if (s.save_weap) {
      const optByType = new Map(Game.db.WeaponBonusOptionData.map(o => [o.OptionType, o]));
      for (const w of Object.values(this._obj(s.save_weap.o_list))) {
        if (!Game.index.weaponById.get(w.WeaponId)) continue;
        const rolls = (w.BonusOptions || []).map(o => {
          const opt = optByType.get(o.BonusOptionType);
          if (!opt) return null;
          const pct = ((o.Value * 100 - opt.MinValue) / (opt.MaxValue - opt.MinValue)) * 100;
          return { optionId: opt.id, pct: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) };
        }).filter(Boolean);
        b.weaponRoster[`g${w.UniqueId}`] = { weaponId: w.WeaponId, level: w.Level || 1, bonusRolls: rolls };
      }
      for (const [slot, uid] of Object.entries(this._obj(s.save_weap.e_list))) {
        if (+slot < 6 && b.weaponRoster[`g${uid}`]) b.weapons[+slot] = `g${uid}`;
      }
      summary.push(`${Object.keys(b.weaponRoster).length} weapons (${b.weapons.filter(Boolean).length} equipped)`);
    }

    if (s.save_trait_roll) {
      let n = 0;
      for (const t of this._obj(s.save_trait_roll.sil)) {
        if (t.i < 10 && Game.index.traitOptionById.get(t.o)) { b.traits.slots[t.i] = t.o; n++; }
      }
      if (n) summary.push(`${n} traits`);
    }
    return { build: b, summary };
  },

  async importFiles(files) {
    const saves = await this.readFiles(files);
    if (!Object.keys(saves).length) throw new Error('No XP Hero save files found. Select the files from Android/data/io.supercent.weaponrpg/files/.');
    const { build, summary } = this.toBuild(saves);
    if (!summary.length) throw new Error('The save files had none of the data this site uses.');
    build.ui = State.data.ui;
    if (!confirm(`Import from your game saves?\n\n${summary.join('\n')}\n\nThis replaces your current build in this browser. Export first if you want a backup.`)) return false;
    State.importJSON(JSON.stringify(build));
    UI.toast(`Imported from game saves: ${summary.slice(0, 3).join(', ')}…`);
    return true;
  },
};
