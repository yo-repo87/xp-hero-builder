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
