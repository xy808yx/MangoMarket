/* Mango Market parent panel (Phase 6). A quiet page for a grown-up, not a
   control surface. Long-hold gate: hold the wallet chip for 2.5 seconds (the
   chip ignores normal taps, so she can never trip it), then PIN 8888 on the
   phone-grid keypad. A wrong PIN closes silently: no message, no hint,
   nothing on screen ever names the PIN.

   Everything shown comes from engine.stats(), engine.factStats() and the save
   at open time. Nothing here mutates her progress, with ONE exception, added
   deliberately: restoring a backup. Her fact history is what the game steers
   by, so losing it does not just lose a number, it drops the game back to
   guessing which facts she still counts on. That is worth one write button
   behind a PIN. It shape-checks before it writes and then reloads, because
   the engine, world, stand and room all hold references into the state object
   they were built with.

   Deep measurement still lives in the separate drill app. This is a glance. */

import { makeKeypad } from './ui.js';
import { saveSave } from './save.js';

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

/* The bands, in plain words. "Automatic" is the honest name for what this
   game can see: she answered it unaided and it has held, three times running.
   It is NOT a claim about speed. This game has no clocks in it by design, so
   a green here means solid, not fast. */
const BAND_LABELS = {
  unseen: 'Not met yet',
  counting: 'Still working it out',
  consolidating: 'Getting there',
  automatic: 'Knows it'
};
/* The per-fact `bridge` counter, in plain words. It used to say which form of
   the on-card addition hint that fact was getting; the hint is gone and the
   counter now says only how well the fact is holding, which is what it always
   actually measured (three clean first-try answers advance it, one wrong
   answer drops it). Labels must never imply help that is no longer on screen. */
const HOLD_LABELS = ['not holding yet', 'starting to hold', 'holding steady'];

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
        <b>${s.drawer.ok}</b> first-try</div>
      ${factSection()}
      <div class="p-sec">Backup</div>
      <div class="p-line p-quiet">Her fact history is what the game steers by.
        Copy this somewhere safe now and then.</div>
      <div class="p-io-btns">
        <button id="pExport" class="p-btn">Show backup</button>
        <button id="pDownload" class="p-btn">Save to a file</button>
        <button id="pImport" class="p-btn">Restore</button>
      </div>
      <textarea id="pIo" class="p-io" spellcheck="false"
        placeholder="Backup text appears here. To restore, paste it in and tap Restore."></textarea>
      <div class="p-line p-quiet" id="pIoMsg"></div>`;
    wireFacts();
    wireIo();
  }

  /* ---- the 72 fluency facts ---- */
  /* One cell per fact, in the order the engine generates them, so the two
     groups stay visually separate: the 36 single-digit facts, then the 36
     that cross ten. The crossing block is the one to watch. Every borrow in
     the higher tiers is one of those facts plus bookkeeping, so a red patch
     there predicts trouble with two- and three-digit work long before the
     two-digit numbers themselves look wrong. */
  function factSection() {
    const fs = engine.factStats();
    const cell = r => `<button class="p-fact b-${r.band}" data-k="${r.key}"
      aria-label="${r.m} minus ${r.s}">${r.m}<span>−</span>${r.s}</button>`;
    const groupA = fs.rows.filter(r => !r.crossing).map(cell).join('');
    const groupB = fs.rows.filter(r => r.crossing).map(cell).join('');
    return `
      <div class="p-sec">The 72 number facts</div>
      <div class="p-line"><b>${fs.green}</b> of ${fs.total} known cold ·
        <b>${fs.seen}</b> met so far</div>
      <div class="p-legend">
        <span class="p-key b-automatic"></span>Knows it
        <span class="p-key b-consolidating"></span>Getting there
        <span class="p-key b-counting"></span>Still working
        <span class="p-key b-unseen"></span>Not met
      </div>
      <div class="p-fact-cap">Single digit</div>
      <div class="p-grid">${groupA}</div>
      <div class="p-fact-cap">Crossing ten (these carry the harder levels)</div>
      <div class="p-grid">${groupB}</div>
      <div class="p-line p-quiet" id="pFactDetail">Tap a fact for its detail.</div>`;
  }

  function wireFacts() {
    const rows = {};
    for (const r of engine.factStats().rows) rows[r.key] = r;
    for (const el of $('parentBody').querySelectorAll('.p-fact')) {
      el.addEventListener('click', () => {
        const r = rows[el.dataset.k];
        const d = $('pFactDetail');
        if (!r || !d) return;
        d.innerHTML = r.n === 0
          ? `<b>${r.m} − ${r.s}</b> · ${BAND_LABELS.unseen}`
          : `<b>${r.m} − ${r.s} = ${r.m - r.s}</b> · ${BAND_LABELS[r.band]} ·
             ${r.n} ${r.n === 1 ? 'try' : 'tries'}, ${r.ok} first-try,
             ${r.miss} ${r.miss === 1 ? 'slip' : 'slips'} ·
             ${HOLD_LABELS[r.bridge]}`;
      });
    }
  }

  /* ---- backup ---- */
  /* The whole save, not just the facts: her wallet, her aisles, her room and
     her fact history are one progress state and restoring half of it would
     leave the game describing a child who does not exist. Import goes through
     a reload rather than patching the live engine, because the engine, the
     world, the stand and the room all hold references into the state object
     they were built with. */
  function wireIo() {
    const io = $('pIo'), msg = $('pIoMsg');
    const json = () => JSON.stringify(engine.state, null, 2);

    $('pExport').addEventListener('click', () => {
      io.value = json();
      io.focus();
      io.select();
      msg.textContent = 'Copy this text and keep it somewhere safe.';
    });

    $('pDownload').addEventListener('click', () => {
      const blob = new Blob([json()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mango-market-backup.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg.textContent = 'Saved to your downloads.';
    });

    $('pImport').addEventListener('click', () => {
      const text = io.value.trim();
      if (!text) { msg.textContent = 'Paste a backup in the box first.'; return; }
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        msg.textContent = 'That does not look like a backup. Nothing changed.';
        return;
      }
      /* Shape check before anything is written. A truncated paste that still
         parses would otherwise overwrite a real save with a fragment, and
         there is no undo behind this button. */
      if (!parsed || typeof parsed !== 'object' || !parsed.tiers || !parsed.aisles) {
        msg.textContent = 'That backup is missing pieces. Nothing changed.';
        return;
      }
      saveSave(parsed);
      msg.textContent = 'Restored. Reloading...';
      setTimeout(() => location.reload(), 600);
    });
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
