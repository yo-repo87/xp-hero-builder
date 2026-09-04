// ---------------------------------------------------------------------------
// ui-equipment.js — Traits (2 groups x 5 synergy slots) + the four account
// upgrade trees (Ability / Extra / Special / Soul).
// ---------------------------------------------------------------------------

const EquipmentUI = {
  activeTree: 'ability',

  render() {
    this._renderTraits();
    this._renderUpgradeTabs();
    this._renderUpgradeGrid();
  },

  // ---------------- Traits ----------------

  _renderTraits() {
    const root = document.getElementById('trait-groups');
    const groups = Game.index.traitSynergyGroups; // Map<groupNum, rows[]>
    const groupNums = [...groups.keys()].sort((a, b) => a - b);

    const html = groupNums.map((gNum, gi) => {
      const rows = groups.get(gNum).slice().sort((a, b) => a.synergy_type - b.synergy_type);
      const slotsHTML = rows.map((row, si) => {
        const globalIndex = gi * 5 + si;
        const synType = Game.index.traitSynergyTypeById.get(row.synergy_type);
        const chosenId = State.data.traits.slots[globalIndex];
        const chosen = chosenId ? Game.index.traitOptionById.get(chosenId) : null;
        const optType = chosen ? Game.index.traitOptionTypeById.get(chosen.option_type) : null;
        return `
          <div class="trait-slot-row" data-slot="${globalIndex}" style="cursor:pointer">
            <div class="trait-slot-icon">${synType ? synType.name_en.split(' ').map(w => w[0]).join('').slice(0,2) : '?'}</div>
            <div class="trait-slot-info">
              <div class="ts-title">${chosen ? escapeHtml((optType?.name_en) || 'Trait') : `<span style="color:var(--ink-faint)">Empty — ${synType ? escapeHtml(synType.name_en) : ''}</span>`}</div>
              <div class="ts-sub">${chosen ? `+${fmtNum(chosen.rate_amount / (chosen.rate_amount > 100 ? 100 : 1))}${chosen.rate_amount > 100 ? '' : '%'} · rarity ${chosen.option_rarity}` : 'Tap to set'}</div>
            </div>
          </div>`;
      }).join('');
      return `<div class="trait-group"><h4>Trait Group ${gi + 1}</h4>${slotsHTML}</div>`;
    }).join('');

    const filled = State.data.traits.slots.map(id => id ? Game.index.traitOptionById.get(id) : null);
    const synergies = Formulas.computeTraitSynergies(filled);
    const synergyHTML = `
      <div class="synergy-summary">
        <h4 style="font-size:.9rem;margin:6px 0">Active Synergy Bonuses</h4>
        ${synergies.length === 0
          ? `<span style="color:var(--ink-faint);font-size:.82rem">Fill matching stat types across slots to unlock synergy bonuses.</span>`
          : synergies.map(s => {
              const t = Game.index.traitOptionTypeById.get(s.optionType);
              const desc = (t?.synergy_info_desc_en || '{0}%').replace('{0}', fmtNum(s.bonus.rate_amount));
              return `<div class="synergy-row"><span>${escapeHtml(t?.name_en || 'Stat')} ×${s.count}</span><span class="mono" style="color:var(--gold)">${escapeHtml(desc)}</span></div>`;
            }).join('')}
      </div>
      <div class="caveat">Confirmed by decompiling the game's TraitSynergyController: it tallies how many filled slots share the same rolled stat type and looks up the synergy bonus for that count, exactly as modeled here. Set each slot to whatever specific trait you already rolled in-game.</div>`;

    root.innerHTML = `<div>${html}</div>` + synergyHTML;

    root.querySelectorAll('[data-slot]').forEach(el => {
      el.addEventListener('click', () => this._openTraitPicker(Number(el.dataset.slot)));
    });
  },

  _openTraitPicker(slotIndex) {
    const options = Game.db.TraitOptionData.slice().sort((a, b) => a.option_rarity - b.option_rarity || a.option_type - b.option_type);
    const current = State.data.traits.slots[slotIndex];

    UI.openModal(`
      <div class="modal-header"><h3>Set Trait — Slot ${slotIndex + 1}</h3>
        ${current ? `<button class="btn btn-sm btn-danger" id="clear-trait">Clear</button>` : ''}
        <button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="picker-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
          ${options.map(o => {
            const t = Game.index.traitOptionTypeById.get(o.option_type);
            const r = Game.rarityColor(Math.min(o.option_rarity, 9));
            const selected = current === o.id;
            const desc = (t?.option_info_desc_en || '{0}').replace('{0}', fmtNum(o.rate_amount / (o.rate_amount > 100 ? 100 : 1)));
            return `
              <div class="picker-card ${selected ? 'selected' : ''}" data-trait="${o.id}" style="border-color:${r.c}55;text-align:left">
                <div class="pc-name">${escapeHtml(t?.name_en || 'Trait')}</div>
                <div class="pc-tag mono" style="color:${r.c}">${escapeHtml(desc)}</div>
                <div class="pc-tag">${r.name} · roll ${fmtPct(o.rate)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    document.getElementById('clear-trait')?.addEventListener('click', () => {
      State.setTraitSlot(slotIndex, null); UI.closeModal();
    });
    document.querySelectorAll('[data-trait]').forEach(el => {
      el.addEventListener('click', () => {
        State.setTraitSlot(slotIndex, Number(el.dataset.trait));
        UI.closeModal();
      });
    });
  },

  // ---------------- Upgrade trees ----------------

  _renderUpgradeTabs() {
    document.querySelectorAll('#upgrade-tree-tabs .chip').forEach(el => {
      el.classList.toggle('active', el.dataset.tree === this.activeTree);
      el.onclick = () => { this.activeTree = el.dataset.tree; this.render(); };
    });
  },

  _renderUpgradeGrid() {
    const grid = document.getElementById('upgrade-grid');
    if (this.activeTree === 'ability') return this._renderAbility(grid);
    if (this.activeTree === 'extra') return this._renderExtra(grid);
    if (this.activeTree === 'special') return this._renderSpecial(grid);
    if (this.activeTree === 'soul') return this._renderSoul(grid);
  },

  // Row layout matches the real Upgrades screen: colored icon slot on the
  // left (color = which of the 4 trees, per the real screenshots — warm
  // brown for Ability, indigo for Special, magenta for Extra), title + desc
  // + a "current > next" value line in the middle, stepper on the right.
  _card({ icon, accent, title, sub, curLabel, nextLabel, level, maxLevel }) {
    const atCap = level >= maxLevel;
    return `
      <div class="upgrade-row">
        <div class="ur-icon" style="background:${accent}">${icon}</div>
        <div class="ur-body">
          <div class="ur-title">${escapeHtml(title)}</div>
          <div class="ur-sub">${escapeHtml(sub || '')}</div>
          <div class="ur-value">${curLabel}${!atCap && nextLabel ? ` <span class="ur-arrow">›</span> <span class="ur-next">${nextLabel}</span>` : ''}</div>
          <div class="ur-level">Level ${level} / ${maxLevel}</div>
        </div>
        <div class="stepper" data-stepper>
          <button data-step="-1">−</button>
          <input type="number" data-level-input min="0" max="${maxLevel}" value="${level}">
          <button data-step="1">+</button>
        </div>
      </div>`;
  },

  _wireCard(cardEl, level, maxLevel, setFn) {
    const input = cardEl.querySelector('[data-level-input]');
    const clamp = v => Math.max(0, Math.min(maxLevel, v));
    cardEl.querySelector('[data-step="-1"]').addEventListener('click', () => { setFn(clamp(level - 1)); this.render(); });
    cardEl.querySelector('[data-step="1"]').addEventListener('click', () => { setFn(clamp(level + 1)); this.render(); });
    input.addEventListener('change', () => { setFn(clamp(Number(input.value) || 0)); this.render(); });
  },

  _renderAbility(grid) {
    const cards = Game.db.AbilityListElementInfo.map(type => {
      const level = State.data.upgrades.ability[type.id] || 0;
      const maxLevel = Formulas.abilityMaxLevel(type.id);
      const row = Formulas.abilityRow(type.id, level);
      const nextRow = level < maxLevel ? Formulas.abilityRow(type.id, level + 1) : null;
      return { type, level, maxLevel, row, nextRow };
    });
    grid.innerHTML = cards.map(({ type, level, maxLevel, row, nextRow }) => this._card({
      icon: '⬆', accent: 'var(--tree-ability)', title: type.Title_en, sub: type.Desc_en,
      curLabel: row ? `+${fmtNum(row.EffectAmount)}` : '+0',
      nextLabel: nextRow ? `+${fmtNum(nextRow.EffectAmount)}` : null,
      level, maxLevel,
    })).join('');
    grid.querySelectorAll('.upgrade-row').forEach((el, i) => {
      this._wireCard(el, cards[i].level, cards[i].maxLevel, (v) => State.setAbilityLevel(cards[i].type.id, v));
    });
  },

  _renderExtra(grid) {
    const cards = Game.db.ExtraUpgradeTypeData.map(type => {
      const level = State.data.upgrades.extra[type.OptionType] || 0;
      const maxLevel = Formulas.extraMaxLevel(type.OptionType);
      const row = Formulas.extraRow(type.OptionType, level);
      const nextRow = level < maxLevel ? Formulas.extraRow(type.OptionType, level + 1) : null;
      return { type, level, maxLevel, row, nextRow };
    });
    grid.innerHTML = cards.map(({ type, level, maxLevel, row, nextRow }) => this._card({
      icon: '✚', accent: 'var(--tree-extra)', title: type.Title_en, sub: type.Description_en,
      curLabel: row ? `${fmtNum(row.RateAmount / 10)}%` : '0%',
      nextLabel: nextRow ? `${fmtNum(nextRow.RateAmount / 10)}%` : null,
      level, maxLevel,
    })).join('');
    grid.querySelectorAll('.upgrade-row').forEach((el, i) => {
      this._wireCard(el, cards[i].level, cards[i].maxLevel, (v) => State.setExtraLevel(cards[i].type.OptionType, v));
    });
  },

  _renderSpecial(grid) {
    const globalGrade = State.data.upgrades.special.__grade || 1;
    const cards = Game.db.SpecialUpgradeTypeData.map(type => {
      const rec = State.data.upgrades.special[type.OptionType] || { grade: globalGrade, level: 0 };
      const maxLevel = Formulas.specialMaxLevelForGrade(type.OptionType, globalGrade);
      const row = Formulas.specialRow(type.OptionType, rec.level);
      const nextRow = rec.level < maxLevel ? Formulas.specialRow(type.OptionType, rec.level + 1) : null;
      return { type, level: rec.level, maxLevel, row, nextRow };
    });
    const gradeHTML = `
      <div class="upgrade-row upgrade-row--grade">
        <div class="ur-icon" style="background:var(--tree-special)">⛩</div>
        <div class="ur-body">
          <div class="ur-title">Altar Grade</div>
          <div class="ur-sub">How far you've progressed the Special Upgrade altar overall — caps how high each stat below can go.</div>
        </div>
        <div class="stepper">
          <button data-grade-step="-1">−</button>
          <input type="number" id="grade-input" min="1" max="5" value="${globalGrade}">
          <button data-grade-step="1">+</button>
        </div>
      </div>`;
    grid.innerHTML = gradeHTML + cards.map(({ type, level, maxLevel, row, nextRow }) => this._card({
      icon: '✦', accent: 'var(--tree-special)', title: type.Title_en, sub: type.Description_en,
      curLabel: row ? `${fmtNum(row.RateAmount / 10)}%` : '0%',
      nextLabel: nextRow ? `${fmtNum(nextRow.RateAmount / 10)}%` : null,
      level, maxLevel,
    })).join('');

    const setGrade = (g) => {
      g = Math.max(1, Math.min(5, g));
      State.data.upgrades.special.__grade = g;
      State.notify();
      this.render();
    };
    grid.querySelector('[data-grade-step="-1"]').addEventListener('click', () => setGrade(globalGrade - 1));
    grid.querySelector('[data-grade-step="1"]').addEventListener('click', () => setGrade(globalGrade + 1));
    grid.querySelector('#grade-input').addEventListener('change', (e) => setGrade(Number(e.target.value) || 1));

    grid.querySelectorAll('.upgrade-row').forEach((el, i) => {
      if (i === 0) return; // grade row handled above
      const c = cards[i - 1];
      this._wireCard(el, c.level, c.maxLevel, (v) => State.setSpecialLevel(c.type.OptionType, globalGrade, v));
    });
  },

  _renderSoul(grid) {
    const cards = Game.db.SoulUpgradeTypeData.map(type => {
      const level = State.data.upgrades.soul[type.OptionType] || 0;
      const maxLevel = Formulas.soulMaxLevel(type.OptionType);
      const row = Formulas.soulRow(type.OptionType, level);
      const nextRow = level < maxLevel ? Formulas.soulRow(type.OptionType, level + 1) : null;
      return { type, level, maxLevel, row, nextRow };
    });
    grid.innerHTML = cards.map(({ type, level, maxLevel, row, nextRow }) => this._card({
      icon: '❖', accent: 'var(--tree-soul)', title: type.Title_en, sub: type.Description_en,
      curLabel: row ? `${fmtNum(row.RateAmount / 10)}%` : '0%',
      nextLabel: nextRow ? `${fmtNum(nextRow.RateAmount / 10)}%` : null,
      level, maxLevel,
    })).join('');
    grid.querySelectorAll('.upgrade-row').forEach((el, i) => {
      this._wireCard(el, cards[i].level, cards[i].maxLevel, (v) => State.setSoulLevel(cards[i].type.OptionType, v));
    });
  },
};
