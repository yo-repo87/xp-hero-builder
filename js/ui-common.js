// ---------------------------------------------------------------------------
// ui-common.js — modal system, toast, and small render helpers shared across
// every tab.
// ---------------------------------------------------------------------------

const UI = {
  modalBackdrop: null,
  modalEl: null,
  toastEl: null,
  toastTimer: null,

  init() {
    this.modalBackdrop = document.getElementById('modal-backdrop');
    this.modalEl = document.getElementById('modal');
    this.toastEl = document.getElementById('toast');
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  },

  openModal(html, { onMount } = {}) {
    this.modalEl.innerHTML = html;
    this.modalBackdrop.hidden = false;
    if (onMount) onMount(this.modalEl);
  },

  closeModal() {
    this.modalBackdrop.hidden = true;
    this.modalEl.innerHTML = '';
  },

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  },
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toLocaleString();
}

function fmtPct(n) { return `${fmtNum(n)}%`; }

function rarityPip(tier) {
  const r = Game.rarityColor(tier);
  return `<span class="rarity-pip" style="background:${r.c}" title="${r.name}"></span>`;
}

// Full inline-style string wiring up a tier's real in-game rarity art
// (icon-background ring + ribbon + grade plate) as CSS custom properties,
// for use anywhere a card/detail-art element needs the authentic chrome.
function rarityStyle(tier) {
  return `--rc:${Game.rarityColor(tier).c};--ring-img:url('${Game.rarityCircle(tier)}');--ribbon-img:url('${Game.rarityRibbon(tier)}');--grade-img:url('${Game.rarityGrade(tier)}')`;
}

function rarityTag(tier) {
  const r = Game.rarityColor(tier);
  return `<span class="rarity-ribbon-badge" style="--ribbon-img:url('${Game.rarityRibbon(tier)}')">${r.name}</span>`;
}

function rarityStar(filled, maxed) {
  return `<span class="rt-star${filled ? ' filled' : ''}${maxed ? ' maxed' : ''}"></span>`;
}

function weaponCategoryName(catId) {
  const c = Game.index.weaponCategoryById.get(catId);
  return c ? c.Name_en : `Category ${catId}`;
}
function weaponClassName(catId) {
  const c = Game.index.weaponCategoryById.get(catId);
  return c ? c.Class_Name_en : '';
}

function onImgError(img) {
  img.onerror = null;
  img.style.opacity = '0.25';
}

// A slider flanked by −/+ step buttons, for every level/grade/roll-%
// control in the app (hero level/star/evolution, weapon level, bonus
// affix roll%). Clicking a button nudges the value by exactly one step
// instead of needing to drag the slider precisely — more accurate, and
// doesn't require re-grabbing the handle for every single adjustment.
function levelControlHTML(id, min, max, value, labelHTML, step = 1) {
  return `
    <div class="level-control">
      <button type="button" class="lc-step" data-lc="${id}" data-dir="-1" ${value <= min ? 'disabled' : ''} aria-label="Decrease">−</button>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <button type="button" class="lc-step" data-lc="${id}" data-dir="1" ${value >= max ? 'disabled' : ''} aria-label="Increase">+</button>
      <span class="level-num mono">${labelHTML}</span>
    </div>`;
}

// Wires both the slider's own drag and its two step buttons to the same
// onChange(value) callback — callers already have a full re-render that
// recomputes everything else (DPS, milestones, etc.), so this only needs
// to hand back the new clamped value.
function wireLevelControl(id, onChange) {
  const slider = document.getElementById(id);
  if (!slider) return;
  const min = Number(slider.min), max = Number(slider.max), step = Number(slider.step) || 1;
  slider.addEventListener('input', (e) => onChange(Number(e.target.value)));
  document.querySelectorAll(`[data-lc="${id}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(slider.value) + Number(btn.dataset.dir) * step;
      onChange(Math.max(min, Math.min(max, next)));
    });
  });
}
