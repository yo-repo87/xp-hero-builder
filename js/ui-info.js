// ---------------------------------------------------------------------------
// ui-info.js — Game Info tab: gacha odds, Lucky Spin, codex, shop value and
// the data changelog. All numbers come straight from the game's own tables
// (see data/GachaOdds.json, Codex.json, ShopValue.json, Changelog.json and
// LuckySpinRewardData.json); labels the data doesn't name are shown as such.
// ---------------------------------------------------------------------------

const InfoUI = {
  _mounted: false,
  section: 'gacha',
  SECTIONS: [['rank', '🏆 Rankings'], ['gacha', '🎲 Chest odds'], ['spin', '🎡 Lucky Spin'], ['codex', '📚 Codex'], ['shop', '💵 Shop value'], ['changes', '🆕 What changed']],

  render() {
    const root = document.getElementById('info-root');
    if (!root || !Game.db.GachaOdds) return;
    // Codex depends on owned heroes; everything else is static.
    if (this._mounted && this.section !== 'codex') { this._maybeBadge(); return; }
    this._mounted = true;
    this.draw();
  },

  draw() {
    const root = document.getElementById('info-root');
    const nav = this.SECTIONS.map(([k, l]) => `<button type="button" class="btn ${k === this.section ? 'btn-gold' : ''}" data-info="${k}">${l}</button>`).join(' ');
    root.innerHTML = `<div class="info-nav">${nav}</div><div id="info-body"></div>`;
    root.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => { this.section = b.dataset.info; this.draw(); }));
    const body = root.querySelector('#info-body');
    body.innerHTML = this[`_${this.section}`]();
    if (this.section === 'shop') this._wireShop(body);
    if (this.section === 'rank') this._wireRank(body);
    this._maybeBadge();
  },


  _seenKey: 'xph_seen_changelog',
  _maybeBadge() {
    const v = Game.db.Changelog && Game.db.Changelog.version;
    let seen = null; try { seen = localStorage.getItem(this._seenKey); } catch {}
    if (this.section === 'changes' && document.getElementById('panel-info')?.classList.contains('active')) { try { localStorage.setItem(this._seenKey, v); } catch {} seen = v; }
    document.querySelectorAll('.tab-btn[data-tab="info"]').forEach(b => b.classList.toggle('has-new', !!v && seen !== v));
  },
  rankLevel: 70,
  _rank() {
    return `<p class="section-sub">How weapons and heroes compare on paper, from the game's own data. Weapons: base DPS at the chosen level (from rarity and grade) plus the Attack bonuses their level-up rewards unlock by then. Heroes: their best skill's damage multiplier (SkillData.TotalDPSMult) per second of cooldown, which drives how much skill damage they add.</p>
      <div class="info-card"><h4>Weapons <span class="info-sub">at level <input type="number" class="input" id="rank-lv" value="${this.rankLevel}" min="1" max="200" style="width:70px"></span></h4><div id="rank-weapons"></div></div>
      <div class="info-card"><h4>Heroes <span class="info-sub">best skill, by damage multiplier per second of cooldown</span></h4><div id="rank-heroes"></div></div>`;
  },
  _wireRank(body) {
    const draw = () => {
      const lv = this.rankLevel;
      const rows = Game.db.WeaponData.map(w => {
        const d = Formulas.weaponDPS(w, lv);
        const atk = Formulas.weaponLevelBonusRows(w, 0, lv).filter(x => x.unlocked && x.row.PropertyName === 'WEAPON_BONUS_OP_ATTACK').reduce((s, x) => s + Number(x.row.Amount), 0);
        const owned = Object.values(State.data.weaponRoster).some(c => c.weaponId === w.id);
        return { w, dps: d.total, atk, score: d.total * (1 + atk), owned };
      }).sort((a, b) => b.score - a.score).slice(0, 40);
      body.querySelector('#rank-weapons').innerHTML = `<table class="info-table"><thead><tr><th>#</th><th>Weapon</th><th class="num">Base DPS</th><th class="num">Attack bonus</th><th class="num">Score</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><img class="info-hero own" src="${Game.weaponIcon ? Game.weaponIcon(r.w) : `assets/img/weapons/${r.w.id}.png`}" onerror="onImgError(this)" alt=""> ${this._rar(r.w.Rarity)} ${escapeHtml(r.w.Name_en)}${r.w.Grade > 1 ? ` <span class="info-sub">Gr ${r.w.Grade}</span>` : ''}${r.owned ? ' <span class="info-tag">owned</span>' : ''}</td><td class="num">${fmtNum(Math.round(r.dps))}</td><td class="num">${r.atk ? `+${fmtNum(+(r.atk * 100).toFixed(1))}%` : '—'}</td><td class="num">${fmtNum(Math.round(r.score))}</td></tr>`).join('')}</tbody></table><div class="info-sub">Top 40. Score = base DPS × (1 + unlocked Attack bonus). Bonus rolls and slot-specific bonuses vary per copy and aren't included.</div>`;
    };
    const heroes = Game.db.CostumeData.map(c => {
      const skills = toArray(c.Costume_Skill_List).filter(x => +x).map(id => Game.index.skillById.get(+id)).filter(Boolean);
      const best = skills.filter(k => k.CoolTime > 0 && k.TotalDPSMult > 0).map(k => ({ k, mult: k.TotalDPSMult })).sort((a, b) => b.mult / b.k.CoolTime - a.mult / a.k.CoolTime)[0];
      const owned = State.data.heroes.some(h => h.costumeId === c.id);
      return { c, best, rate: best ? best.mult / best.k.CoolTime : 0, owned };
    }).sort((a, b) => b.rate - a.rate);
    body.querySelector('#rank-heroes').innerHTML = `<table class="info-table"><thead><tr><th>#</th><th>Hero</th><th>Best skill</th><th class="num">Multiplier</th><th class="num">Cooldown</th><th class="num">Per second</th></tr></thead><tbody>${heroes.map((h, i) => `<tr><td>${i + 1}</td><td><img class="info-hero own" src="${Game.heroIcon(h.c)}" onerror="onImgError(this)" alt=""> ${escapeHtml(h.c.Name_en)}${h.owned ? ' <span class="info-tag">owned</span>' : ''}</td><td>${h.best ? escapeHtml(h.best.k.Name_en) : '—'}</td><td class="num">${h.best ? `${fmtNum(+(h.best.mult * 100).toFixed(0))}%` : '—'}</td><td class="num">${h.best ? `${fmtNum(h.best.k.CoolTime)}s` : '—'}</td><td class="num">${h.best ? `${fmtNum(+(h.rate * 100).toFixed(1))}%/s` : '—'}</td></tr>`).join('')}</tbody></table><div class="info-sub">Multiplier is SkillData.TotalDPSMult, the skill's damage multiple (matches the skill text, e.g. Purifying Strike "Deals 120% damage"). Buffs and other utility effects aren't counted.</div>`;
    const lvIn = body.querySelector('#rank-lv');
    lvIn.addEventListener('change', () => { this.rankLevel = Math.max(1, Math.min(200, +lvIn.value || 70)); draw(); });
    draw();
  },

  _pct(p) { return p >= 1 ? `${p.toFixed(1)}%` : p >= 0.01 ? `${p.toFixed(2)}%` : `${p.toFixed(3)}%`; },
  _rar(r) { const c = Game.rarityColor(r); return `<span style="color:${c.c};font-weight:700">${escapeHtml(c.name)}</span>`; },

  _gacha() {
    const kindOrder = { Weapon: 0, 'Hero shards': 1, Rune: 2, Item: 3 };
    const cards = Game.db.GachaOdds.map(b => {
      const agg = new Map();
      for (const o of b.outcomes) {
        let key, label;
        if (o.kind === 'Item') { key = `i${o.item_id}:${o.amin}:${o.amax}`; label = `${escapeHtml(o.name)} ×${o.amin === o.amax ? o.amin : `${o.amin}–${o.amax}`}`; }
        else if (o.kind === 'Rune') { key = `r${o.rune_filter}`; label = `Rune (pool ${o.rune_filter})`; }
        else { key = `${o.kind}:${o.rarity}:${o.grade}:${o.amount}`; label = `${this._rar(o.rarity)}${o.grade > 1 ? ` · Grade ${o.grade}` : ''} ${o.kind === 'Weapon' ? 'weapon' : 'hero shards'}${o.amount > 1 ? ` ×${o.amount}` : ''}`; }
        const cur = agg.get(key) || { label, pct: 0, kind: o.kind, rarity: o.rarity || 0 };
        cur.pct += o.pct; agg.set(key, cur);
      }
      const rows = [...agg.values()].sort((a, b) => (kindOrder[a.kind] - kindOrder[b.kind]) || (b.rarity - a.rarity))
        .map(r => `<tr><td>${r.label}</td><td class="num">${this._pct(r.pct)}</td></tr>`).join('');
      const pity = b.pity.length ? `<div class="info-note">Pity: ${b.pity.map(p => `${this._rar(p.rarity)}${p.grade > 1 ? ` Grade ${p.grade}` : ''} guaranteed within ${p.pulls} pulls`).join('; ')}.</div>` : '';
      const ms = b.milestones.length ? `<div class="info-note">Pull milestones: bonus rewards at ${b.milestones.map(m => m.pulls).join(', ')} pulls.</div>` : '';
      return `<div class="info-card"><h4>${escapeHtml(b.box_type)} box <span class="info-sub">#${b.id}${b.range ? ` · ${escapeHtml(b.range)}` : ''} · ${escapeHtml(b.contents.join(', '))}</span></h4>
        <table class="info-table"><tbody>${rows}</tbody></table>${pity}${ms}</div>`;
    }).join('');
    return `<p class="section-sub">Exact odds for every gacha box in the game, computed from its reward group and rate tables (GachaBoxData → RewardGroupData → GachaRateData). Box type and the melee/ranged filter come from the game's own enums. The game data doesn't say which shop button or key opens each box, so they're listed by type and id. Pity rows are as configured in GachaBoxPityData; the exact pity rules weren't verified in-game.</p><div class="info-grid">${cards}</div>`;
  },

  _spin() {
    const wheels = new Map();
    for (const r of Game.db.LuckySpinRewardData) {
      const k = `${r.preset_id}:${r.segment_id ?? 0}`;
      if (!wheels.has(k)) wheels.set(k, []);
      wheels.get(k).push(r);
    }
    const label = r => {
      if (r.reward_type === 1) { const it = Game.index.itemByType.get(r.reward_param); return it ? `${escapeHtml(it.Name_en)} ×${fmtNum(r.reward_amount)}` : `Item type ${r.reward_param} ×${fmtNum(r.reward_amount)}`; }
      return `Reward type ${r.reward_type} (${r.reward_param}) ×${fmtNum(r.reward_amount)}`;
    };
    const cards = [...wheels.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, rows]) => {
      const [preset, seg] = k.split(':');
      const tot = rows.reduce((s, r) => s + r.weight, 0) || 1;
      const trs = rows.slice().sort((a, b) => b.weight - a.weight).map(r => `<tr><td>${this._rar(r.slot_rarity || 1)} ${label(r)}${r.is_free ? ' <span class="info-tag">free spin</span>' : ''}</td><td class="num">${this._pct(100 * r.weight / tot)}</td></tr>`).join('');
      return `<div class="info-card"><h4>Wheel ${escapeHtml(preset)} <span class="info-sub">player segment ${escapeHtml(seg)}</span></h4><table class="info-table"><tbody>${trs}</tbody></table></div>`;
    }).join('');
    return `<p class="section-sub">Each Lucky Spin wheel has 12 slots. Chances are each slot's weight over the wheel's total. Since v27.2.0 the game shows different players different "segments" of the same wheel; which segment you're in isn't visible in the game data. Reward types other than items aren't decoded yet and are shown by their raw code.</p><div class="info-grid">${cards}</div>`;
  },

  _codex() {
    const cx = Game.db.Codex;
    const owned = new Set(State.data.heroes.map(h => h.costumeId));
    const statName = id => { const s = Game.index.statById.get(id); return s ? (s.Title_en || `Stat ${id}`) : `Stat #${id} (unnamed in game data)`; };
    const bon = list => list.map(b => `${escapeHtml(statName(b.stat))} +${fmtNum(b.value)}`).join(', ');
    const coll = Object.entries(cx.collection).map(([k, v]) => `<tr><td>${escapeHtml(k)} entries</td><td class="num">${fmtNum(v.entries)} steps across ${fmtNum(v.targets)} ${k === 'Enemy' ? 'monsters' : k === 'Weapon' ? 'weapons' : 'NPCs'}</td><td class="num">${fmtNum(v.gems)} Gems total</td></tr>`).join('');
    let done = 0;
    const sets = cx.heroSets.map(s => {
      const have = s.members.filter(m => owned.has(m.costume_id)).length, full = have === s.members.length;
      if (full) done++;
      const icons = s.members.map(m => { const c = Game.index.costumeById.get(m.costume_id); return c ? `<img class="info-hero ${owned.has(m.costume_id) ? 'own' : ''}" src="${Game.heroIcon(c)}" onerror="onImgError(this)" title="${escapeHtml(c.Name_en)} (needs ${escapeHtml(Game.rarityColor(m.rarity).name)})" alt="">` : ''; }).join('');
      return `<div class="info-set ${full ? 'done' : ''}"><div class="info-set-head"><strong>${escapeHtml(s.name)}</strong><span class="info-sub">${have}/${s.members.length} heroes owned</span></div><div>${icons}</div><div class="info-note">${bon(s.bonuses)}</div></div>`;
    }).join('');
    const stars = cx.starGrade.map(s => `<tr><td>Total star grade ${s.goal}</td><td>${bon(s.bonuses)}</td></tr>`).join('');
    return `<p class="section-sub">The game's collection book. Every weapon, monster and NPC codex step pays out Gems; hero collection sets and star-grade goals grant permanent stat bonuses.</p>
      <div class="info-card"><h4>Collection rewards</h4><table class="info-table"><tbody>${coll}</tbody></table></div>
      <div class="info-card"><h4>Hero collection sets <span class="info-sub">${done} of ${cx.heroSets.length} complete with the heroes on your Heroes tab</span></h4>
        <div class="caveat">"Owned" only checks that the hero is on your Heroes tab; each set also needs a minimum rarity (shown on hover), which this check doesn't model. Bonus values are the game's raw option values (units not confirmed), and these bonuses aren't included in the DPS math yet.</div>
        <div class="info-sets">${sets}</div></div>
      <div class="info-card"><h4>Star-grade codex</h4><table class="info-table"><tbody>${stars}</tbody></table></div>`;
  },

  _shop() {
    const gem = Game.db.StackableItemData.find(i => i.Type === 3);
    const rows = Game.db.ShopValue.map(p => {
      const contents = p.rewards.map(r => { const it = Game.index.itemById.get(r.item_id); return `${it ? escapeHtml(it.Name_en) : `#${r.item_id}`} ×${fmtNum(r.amount)}`; }).join(', ');
      const onlyGems = gem && p.rewards.length && p.rewards.every(r => r.item_id === gem.id);
      const gems = onlyGems ? p.rewards.reduce((s, r) => s + r.amount, 0) : 0;
      return { p, contents, gpd: gems ? gems / p.price : 0 };
    });
    this._shopRows = rows;
    return `<p class="section-sub">Every real-money product currently enabled in the game data, with its USD list price (IAPProduct) and contents. "Gems per $" is only shown for packs that contain nothing but Gems. Hero, weapon and pass rewards that aren't stackable items aren't listed in the contents.</p>
      <div class="info-card"><input type="search" class="input" id="shop-filter" placeholder="Filter by name or contents…" style="width:100%;margin-bottom:8px">
      <table class="info-table" id="shop-table"><thead><tr><th>Product</th><th class="num">Price</th><th>Contents</th><th class="num">Gems per $</th></tr></thead><tbody></tbody></table></div>`;
  },
  _wireShop(body) {
    const tb = body.querySelector('#shop-table tbody'), f = body.querySelector('#shop-filter');
    const fill = () => {
      const q = (f.value || '').toLowerCase();
      tb.innerHTML = this._shopRows.filter(r => !q || (r.p.title + ' ' + r.contents).toLowerCase().includes(q)).map(r =>
        `<tr><td>${escapeHtml(r.p.title)}</td><td class="num">$${r.p.price.toFixed(2)}</td><td>${r.contents}</td><td class="num">${r.gpd ? fmtNum(Math.round(r.gpd)) : '—'}</td></tr>`).join('');
    };
    f.addEventListener('input', fill);
    fill();
  },

  _changes() {
    const c = Game.db.Changelog;
    const secs = c.sections.map(s => `<div class="info-card"><h4>${escapeHtml(s.title)}</h4><ul>${s.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`).join('');
    const tables = c.tables.map(t => `<tr><td>${escapeHtml(t.table)}</td><td class="num">+${t.added}</td><td class="num">${t.changed} changed</td></tr>`).join('');
    return `<p class="section-sub">What changed in the game data between v${escapeHtml(c.previous)} and v${escapeHtml(c.version)} (refreshed ${escapeHtml(c.date)}), generated by comparing the game's own tables.</p>
      <div class="info-card"><h4>Highlights</h4><ul>${c.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>${secs}
      <div class="info-card"><h4>Tables with changes</h4><table class="info-table"><tbody>${tables}</tbody></table></div>`;
  },
};
