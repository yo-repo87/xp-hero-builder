// ---------------------------------------------------------------------------
// ui-guide.js — per-hero build advice, computed from the current loadout
// (weapons, traits, upgrade trees) rather than a hardcoded tip list, so
// advice actually tracks what the user has mirrored from their account.
// ---------------------------------------------------------------------------

const GuideUI = {

  render() {
    const root = document.getElementById('guide-root');
    if (State.data.heroes.length === 0) {
      root.innerHTML = `<div class="empty-state"><div class="es-icon">📜</div>Add a hero on the Heroes tab first — the guide gives advice per hero, based on your current loadout.</div>`;
      return;
    }
    if (!State.data.ui.guideHeroId || !State.getHero(State.data.ui.guideHeroId)) {
      State.data.ui.guideHeroId = State.data.activeHeroId || State.data.heroes[0].id;
    }
    const heroId = State.data.ui.guideHeroId;

    root.innerHTML = `
      <div class="guide-layout">
        <div class="guide-hero-list">
          ${State.data.heroes.map(h => {
            const c = Game.index.costumeById.get(h.costumeId);
            return `
              <div class="guide-hero-item ${h.id === heroId ? 'active' : ''}" data-hero="${h.id}">
                <img src="${Game.heroIcon(c)}" onerror="onImgError(this)" alt="">
                <div><div class="gh-name">${escapeHtml(c.Name_en)}</div><div class="gh-meta">Lv ${h.level} · ★${h.starGrade}</div></div>
              </div>`;
          }).join('')}
        </div>
        <div class="guide-panel" id="guide-panel"></div>
      </div>`;

    root.querySelectorAll('[data-hero]').forEach(el => {
      el.addEventListener('click', () => { State.setGuideHero(el.dataset.hero); });
    });

    this._renderAdvice(document.getElementById('guide-panel'), heroId);
  },

  _renderAdvice(panel, heroId) {
    const hero = State.getHero(heroId);
    const c = Game.index.costumeById.get(hero.costumeId);
    const advice = buildAdvice(hero, c);

    panel.innerHTML = `
      <div class="detail-name" style="margin-bottom:2px">${escapeHtml(c.Name_en)}</div>
      <div class="detail-desc">Lv ${hero.level}/${c.Max_Lv} · ★${hero.starGrade}/${c.Max_Grade}${hero.evoRarity ? ` · Evolution Tier ${hero.evoRarity}` : ''}</div>
      ${this._dpsEstimateHTML(heroId)}
      ${advice.map(block => `
        <div class="advice-block">
          <h4><span class="severity-dot ${block.sev}"></span>${escapeHtml(block.title)}</h4>
          <ul>${block.items.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>
      `).join('')}
    `;

    panel.querySelector('#player-level-input').addEventListener('change', (e) => {
      State.setPlayerLevel(Math.max(1, Number(e.target.value) || 1));
    });
    panel.querySelector('#player-vip-input').addEventListener('change', (e) => {
      State.setPlayerVip(Math.max(0, Number(e.target.value) || 0));
    });
  },

  _dpsEstimateHTML(heroId) {
    const b = Formulas.totalDpsBreakdown(heroId);
    const tagLabel = { mapped: 'data-mapped', manual: 'manual input', unmodeled: 'not modeled' };
    const rows = Object.entries(b.sources).map(([key, s]) => `
      <div class="de-row">
        <span class="de-key">${escapeHtml(key)}</span>
        <span class="de-tag de-tag--${s.tag}">${tagLabel[s.tag]}</span>
        <span class="de-note">${escapeHtml(s.note)}</span>
        <span class="de-val mono">${s.value >= 0 ? '+' : ''}${fmtNum(s.value)}</span>
      </div>`).join('');

    return `
      <div class="dps-estimate">
        <div class="de-head">
          <div>
            <div class="de-label">Estimated Total DPS ${b.hero ? '' : '<span style="color:var(--danger)">(no active hero)</span>'}</div>
            <div class="de-value mono">${fmtNum(b.dps)}</div>
          </div>
          <div class="de-inputs">
            <label>Player Level<input type="number" id="player-level-input" min="1" max="1500" value="${State.data.player.level}"></label>
            <label>VIP bonus (‰)<input type="number" id="player-vip-input" min="0" value="${State.data.player.vipPerMille}"></label>
          </div>
        </div>
        <details class="de-breakdown">
          <summary>Show full formula breakdown (17 sources)</summary>
          <div class="de-formula mono">
            rawBase = (PlayerLevel + Ability + Weapon) + heroAttack × (1000 + starBonus + levelBonus) / 1000<br>
            mult1 = (1000 + WeaponOption + WeaponLevelBonus + SpecialUpgrade + ExtraUpgrade + VipSubscription) / 1000<br>
            mult2 = (1000 + CostumeOwnGradeOption + CostumeOwnLevelOption + CostumeOwnEvolutionOption + CostumeEquipMainWeaponBonusOption) / 1000<br>
            mult3 = (1000 + TraitRoll + SoulUpgrade) / 1000<br>
            <b>Dps = round(rawBase × mult1 × mult2 × mult3) = ${fmtNum(b.dps)}</b>
          </div>
          ${rows}
          <div class="caveat">The three-bracket per-mille formula shape above is confirmed by decompiling <code>DpsStatCalculator</code> in the game's compiled code. Individual source values are this app's best-effort mapping onto data it already tracks — tags on each row show which sources come directly from a matched data table ("data-mapped") vs. need a value only you know ("manual input") vs. are deliberately left at zero because no confirmed source was found ("not modeled"). Treat the final number as a well-reasoned estimate, not a guaranteed match to your in-game screen. Full derivation: <code>docs/game_logic_deep_dive.md</code>.</div>
        </details>
      </div>`;
  },
};

function buildAdvice(hero, costume) {
  const blocks = [];
  const equippedWeapons = State.data.weapons
    .map(s => s && Game.index.weaponById.get(s.weaponId))
    .filter(Boolean);

  // --- Weapon category synergy -------------------------------------------
  {
    const bonusCat = costume.BonusWeaponCategory;
    const matches = equippedWeapons.filter(w => w.Category === bonusCat).length;
    const items = [];
    let sev = 'sev-good';
    if (equippedWeapons.length === 0) {
      sev = 'sev-bad';
      items.push(`No weapons equipped yet — head to the Weapons tab and fill all 6 slots to see real synergy numbers.`);
    } else {
      const catName = weaponCategoryName(bonusCat);
      items.push(`${escapeHtml(costume.Name_en)}'s bonus category is <b>${escapeHtml(catName)}</b>. ${matches}/${equippedWeapons.length} equipped weapons match it.`);
      if (matches === 0) { sev = 'sev-bad'; items.push(`None of your equipped weapons match this hero's bonus category — you're leaving that bonus on the table. Consider swapping at least one slot to a ${escapeHtml(catName)}.`); }
      else if (matches < equippedWeapons.length) { sev = 'sev-warn'; items.push(`Swapping more slots toward ${escapeHtml(catName)} would increase how much you benefit from this hero's bonus.`); }
      else { items.push(`Every equipped weapon matches — this hero is getting full value from its category bonus.`); }
    }
    blocks.push({ title: 'Weapon Category Synergy', sev, items });
  }

  // --- Loadout completeness / leveling -------------------------------------
  {
    const items = [];
    let sev = 'sev-good';
    const emptySlots = State.data.weapons.filter(s => !s).length;
    if (emptySlots > 0) { sev = 'sev-bad'; items.push(`${emptySlots} weapon slot${emptySlots > 1 ? 's are' : ' is'} empty — every filled slot adds DPS, so equip a weapon in each of the 6 slots first.`); }
    const underleveled = equippedWeapons.filter(w => {
      const s = State.data.weapons.find(sl => sl && sl.weaponId === w.id);
      const max = Formulas.weaponMaxLevel(w);
      return s && s.level < max * 0.5;
    });
    if (underleveled.length > 0) {
      sev = sev === 'sev-good' ? 'sev-warn' : sev;
      items.push(`${underleveled.length} equipped weapon${underleveled.length > 1 ? 's are' : ' is'} under half of their max level — scroll cost per level is flat, so cheap early levels on these are efficient upgrades right now.`);
    }
    const lowestRarity = equippedWeapons.length ? Math.min(...equippedWeapons.map(w => w.Rarity)) : null;
    const highestRarity = equippedWeapons.length ? Math.max(...equippedWeapons.map(w => w.Rarity)) : null;
    if (lowestRarity !== null && highestRarity - lowestRarity >= 3) {
      sev = sev === 'sev-good' ? 'sev-warn' : sev;
      items.push(`Your equipped weapons span a wide rarity gap (rarity ${lowestRarity} to ${highestRarity}). The lowest-rarity slot is likely your weakest link — prioritize tiering it up or replacing it.`);
    }
    if (items.length === 0) items.push(`Loadout looks solid — all slots filled and reasonably leveled.`);
    blocks.push({ title: 'Weapon Loadout Health', sev, items });
  }

  // --- Growth pacing (level / star / evolution) -----------------------------
  {
    const items = [];
    let sev = 'sev-good';
    const levelFrac = hero.level / costume.Max_Lv;
    const starFrac = hero.starGrade / costume.Max_Grade;
    if (levelFrac - starFrac > 0.25) {
      sev = 'sev-warn';
      items.push(`Level (${Math.round(levelFrac * 100)}% of max) is well ahead of Star Grade (${Math.round(starFrac * 100)}% of max) — star-grade bonuses are usually cheaper power-per-resource than raw leveling at this point; consider catching star grade up.`);
    } else if (starFrac - levelFrac > 0.25) {
      sev = 'sev-warn';
      items.push(`Star Grade is well ahead of Level — you likely have leveling resources sitting unused relative to your star investment.`);
    } else {
      items.push(`Level and Star Grade are reasonably in step with each other.`);
    }
    const evoRows = Formulas.heroEvolutionRows(costume);
    if (evoRows.length > 0) {
      const nextEvo = evoRows.find(r => r.Rarity > hero.evoRarity);
      if (nextEvo && hero.level >= costume.Max_Lv * 0.7) {
        items.push(`Next evolution tier (rarity ${nextEvo.Rarity}) is still unclaimed and this hero is well leveled — it's likely worth prioritizing since evolution bonuses are permanent, one-time unlocks.`);
      }
    }
    blocks.push({ title: 'Growth Pacing', sev, items });
  }

  // --- Trait synergy coverage ---------------------------------------------
  {
    const filled = State.data.traits.slots.filter(Boolean);
    const items = [];
    let sev = 'sev-good';
    if (filled.length === 0) {
      sev = 'sev-bad';
      items.push(`No traits set yet on the Equipment tab — traits are account-wide, but they still meaningfully boost every hero you play.`);
    } else {
      const optionRows = filled.map(id => Game.index.traitOptionById.get(id)).filter(Boolean);
      const synergies = Formulas.computeTraitSynergies(optionRows);
      items.push(`${filled.length}/10 trait slots filled, producing ${synergies.length} active synergy bonus${synergies.length === 1 ? '' : 'es'}.`);
      if (filled.length < 10) { sev = 'sev-warn'; items.push(`Filling the remaining slots — ideally with stat types you've already stacked — pushes existing synergies to their next threshold instead of starting new ones from scratch.`); }
    }
    blocks.push({ title: 'Trait Synergy Coverage', sev, items });
  }

  // --- Recommended stat focus, from weapon-class affinity -------------------
  {
    const items = [];
    const catCounts = new Map();
    for (const w of equippedWeapons) catCounts.set(w.Category, (catCounts.get(w.Category) || 0) + 1);
    const dominant = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant) {
      const cat = Game.index.weaponCategoryById.get(dominant[0]);
      const types = toArray(cat.Class_OptionType);
      const statNames = types.map(t => Game.index.statById.get(t)?.Title_en).filter(Boolean);
      if (statNames.length) {
        items.push(`Your loadout leans <b>${escapeHtml(cat.Class_Name_en)}</b> (${escapeHtml(cat.Name_en)}) — that archetype's natural strengths are <b>${statNames.map(escapeHtml).join(', ')}</b>. Favor Ability/Extra/Special/Soul upgrades in those stats for this hero.`);
      }
    } else {
      items.push(`Equip weapons to get a class-specific stat recommendation here.`);
    }
    blocks.push({ title: 'Recommended Stat Focus', sev: 'sev-good', items });
  }

  return blocks;
}
