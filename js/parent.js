/* Mango Market parent panel (Phase 6). Read-only: a quiet page for a
   grown-up, not a control surface. Long-hold gate: hold the wallet chip for
   2.5 seconds (the chip ignores normal taps, so she can never trip it),
   then PIN 8888 on the phone-grid keypad. A wrong PIN closes silently:
   no message, no hint, nothing on screen ever names the PIN.

   Everything shown comes from engine.stats() and the save at open time.
   Real measurement lives in a separate drill app; this is a glance,
   not analytics. */

import { makeKeypad } from './ui.js';

const PIN = '8888';
const HOLD_MS = 2500;

const TIER_LABELS = {
  single: 'Small facts (up to 10)',
  teens: 'Teens (11 to 19)',
  two_easy: 'Two-digit, no borrow',
  two_borrow: 'Two-digit borrowing',
  three: 'Three-digit'
};
/* Must track AISLE_NAMES in store.js: the grown-ups panel naming a shelf she
   cannot find on screen helps nobody. */
const AISLE_LABELS = {
  produce: 'Fresh Food', bakery: 'Snacks and Treats', toys: 'Toys',
  electronics: 'Gadgets', home: 'Room Things'
};
const STAGE_LABELS = ['Full help', 'Less help', 'No help'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const $ = id => document.getElementById(id);

export function initParent(engine) {
  const chip = $('walletChip');
  let holdTimer = 0;
  let pinBuf = '';

  chip.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(openPin, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    chip.addEventListener(ev, () => clearTimeout(holdTimer));
  }

  /* ---- PIN gate ---- */
  function paintDots() {
    $('pinDots').querySelectorAll('i').forEach((dot, i) => {
      dot.classList.toggle('full', i < pinBuf.length);
    });
  }

  function openPin() {
    pinBuf = '';
    paintDots();
    $('pin').classList.remove('hidden');
  }

  function closePin() {
    pinBuf = '';
    $('pin').classList.add('hidden');
  }

  makeKeypad($('pinPad'), {
    onDigit(d) {
      if (pinBuf.length >= 4) return;
      pinBuf += String(d);
      paintDots();
      if (pinBuf.length === 4) {
        const ok = pinBuf === PIN;
        /* Right or wrong, the pad closes; wrong is SILENT (no shake, no
           toast, no hint that a code exists to guess). */
        setTimeout(() => {
          closePin();
          if (ok) openPanel();
        }, 160);
      }
    },
    onBack() {
      pinBuf = pinBuf.slice(0, -1);
      paintDots();
    },
    onSubmit() { /* entry is length-gated; the go key stays disabled */ }
  }).setGo(false);
  $('pinClose').addEventListener('click', closePin);

  /* ---- the panel ---- */
  function dateOfDay(d) {
    /* day = days since Jan 1 2026 (the engine's calendar). */
    return new Date(2026, 0, 1 + d);
  }

  function render() {
    const s = engine.stats();
    const state = engine.state;
    const today = state.day;
    const f = engine.frontier();

    const tierRows = Object.keys(TIER_LABELS).map(tier => {
      const t = s.byTier[tier];
      const acc = t.acc === null ? '·' : Math.round(t.acc * 100) + '%';
      const helper = t.stage === null
        ? '' : `<span class="p-helper">${STAGE_LABELS[t.stage]}</span>`;
      const done = t.mastered ? '<span class="p-check">✓</span>' : '';
      return `
        <div class="p-row">
          <span class="p-tier">${TIER_LABELS[tier]} ${done}</span>
          ${helper}
          <span class="p-att">${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}</span>
          <span class="p-acc">${acc}</span>
        </div>`;
    }).join('');

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = today - i;
      const n = s.perDay[String(d)] || 0;
      week.push(`
        <div class="p-day${i === 0 ? ' today' : ''}">
          <span class="p-day-n">${n}</span>
          <span class="p-day-w">${WEEKDAYS[dateOfDay(d).getDay()]}</span>
        </div>`);
    }

    const aisleChips = ['produce', 'bakery', 'toys', 'electronics', 'home']
      .map(a => `<span class="p-aisle${s.aisles.includes(a) ? ' open' : ''}">
        ${AISLE_LABELS[a]}</span>`).join('');

    $('parentBody').innerHTML = `
      <div class="p-line">Wallet <b>$${s.wallet}</b> · Working on
        <b>${AISLE_LABELS[f.aisle.id]}</b></div>
      <div class="p-aisles">${aisleChips}</div>
      <div class="p-sec">Accuracy, last 20 tries</div>
      ${tierRows}
      <div class="p-sec">Problems per day</div>
      <div class="p-week">${week.join('')}</div>
      <div class="p-line">Big-bill counting at the stand:
        <b>${s.drawer.n}</b> ${s.drawer.n === 1 ? 'try' : 'tries'},
        <b>${s.drawer.ok}</b> first-try</div>`;
  }

  function openPanel() {
    render();
    $('parent').classList.remove('hidden');
  }

  $('parentClose').addEventListener('click', () =>
    $('parent').classList.add('hidden'));

  /* Pane test hook: open the panel without a 2.5s hold. */
  return { debugOpen: openPanel };
}
