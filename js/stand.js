/* Mango Market lemonade stand (Phase 4). Owns the sell flow: a queue of
   regulars sized by engine.standVisits(), one order per customer from
   engine.standOrder(traits), then the change: keypad or column under $50
   through the tier path, the bill drawer at $50+ (state.drawer only), or an
   exact payer with no change at all. Every completed sale earns the total.

   ONE QUESTION PER SALE, AND IT IS ALWAYS THE SUBTRACTION. The order card
   used to hand into a cups-times-price step she had to solve before she ever
   reached the change. It was untracked (multiplication is her strength) but
   it made every sale two questions deep. The total is now STATED on the order
   card and the Make button goes straight to the change. Do not reintroduce a
   solve step in front of the subtraction.

   Pedagogy contract mirrors store.js exactly: the engine decides entry and
   money visuals; wrong answer means warm nudge, retry, then solve together;
   after ANY miss the x hides and the sale must complete; submitResult fires
   exactly once per problem, then earn, matching the sim's order. The drawer
   counts UP from the total to the bill, the real cashier way; an overshoot
   is refused with a shake, and two refusals bring the guided walk. */

import { columns, diagnose } from './engine.js';
import { CUSTOMERS, BY_CUSTOMER_ID, CUP_SIZES } from './data/customers.js';
import { store as kvStore, load as kvLoad } from './save.js';
import {
  makeKeypad, makeColumn, makeDrawer, DRAWER_DENOMS, receipt, bridge, bridgeTeachable,
  toast, confetti
} from './ui.js';
import { play } from './sfx.js';

const NUDGES = ['Hmm, try again!', 'So close! One more try!', 'Almost! Look again.'];

/* Lemonade cups for the order visual, one voxel spec per size so the shelf
   thumbnail renderer draws them (ids are cache keys, not catalog items). */
const CUP_ITEMS = {
  2: { id: 'cup_small', vox: [
    [0.5, 0.55, 0.5, 0, 0.28, 0, 0xFFF6EA],
    [0.42, 0.1, 0.42, 0, 0.58, 0, 0xFFD34D],
    [0.07, 0.4, 0.07, 0.12, 0.8, 0, 0xF04E3E, [0, 0, -0.2]]
  ] },
  3: { id: 'cup_medium', vox: [
    [0.55, 0.72, 0.55, 0, 0.36, 0, 0xFFF6EA],
    [0.47, 0.1, 0.47, 0, 0.75, 0, 0xFFD34D],
    [0.07, 0.46, 0.07, 0.13, 1.0, 0, 0xF04E3E, [0, 0, -0.2]]
  ] },
  4: { id: 'cup_large', vox: [
    [0.6, 0.9, 0.6, 0, 0.45, 0, 0xFFF6EA],
    [0.52, 0.1, 0.52, 0, 0.93, 0, 0xFFD34D],
    [0.07, 0.52, 0.07, 0.14, 1.2, 0, 0xF04E3E, [0, 0, -0.2]]
  ] }
};

/* Hint slots, rendered as part of the body so a new phase clears them and
   the nodes exist before makeColumn runs (its first borrow mark fires inside
   its own constructor). They sit BELOW the entry row at full card width: the
   key-naming hint used to be appended into the keypad host, which makeKeypad
   turns into a grid of three 76px columns, so it became a thirteenth key
   76px wide and 129px tall. Two slots, because a first-ever column card owes
   her both the borrow narration and the names of ✓ and ⌫; an empty one
   collapses to nothing. */
const HINTS = '<div class="assist-hint" id="standColHint"></div>'
  + '<div class="assist-hint" id="standKeyHint"></div>';

const $ = id => document.getElementById(id);
const setHint = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
/* The two-column short-screen layout (the max-height 460px tier). ONE toggle,
   because the class lives on #standCard and outlives every innerHTML written
   into it: any surface that replaces the card wholesale owes a setSplit(false)
   or it inherits the previous phase's grid. The summary card learned that the
   hard way, arriving as a two-column grid with an empty second column. */
const setSplit = on => {
  const el = $('standCard');
  if (el) el.classList.toggle('split', on);
};

export function createStand({ engine, state, world, hud, onEvents, onExit, onSession }) {
  let gen = 0;
  let session = null;
  let sale = null;
  let keypad = null;
  let drawer = null;
  let forcedId = null;

  function digitsOf(n) {
    const out = [];
    do { out.push(n % 10); n = Math.floor(n / 10); } while (n > 0);
    return out;
  }

  /* ---- session ---- */
  function makeQueue(visits) {
    /* Gentle opening act (clarity review): until she has completed one
       drawer sale ever (state.drawer.n === 0, persisted by the engine),
       the forced-big-bill regulars sit sessions out and Miso (exact money,
       no change problem at all) leads, so her first sale is the cups-times-
       price moment she is strong at, never the cold count-up drawer. The
       drawer can still arrive later in a session off the natural roll,
       after at least one won sale. Roster shaping only: engine.standOrder,
       its rng streams and the trait data are untouched, and debugForce
       still wins below. */
    const gentle = state.drawer.n === 0;
    const roster = gentle
      ? CUSTOMERS.filter(c => !(c.trait && c.trait.tender))
      : CUSTOMERS;
    const q = [];
    while (q.length < visits) {
      const batch = roster.slice();
      for (let i = batch.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [batch[i], batch[j]] = [batch[j], batch[i]];
      }
      /* No back-to-back repeat across batch seams. */
      if (q.length && batch[0].id === q[q.length - 1].id) batch.push(batch.shift());
      q.push(...batch);
    }
    const queue = q.slice(0, visits);
    if (gentle) {
      const mi = queue.findIndex(c => c.id === 'miso');
      if (mi > 0) [queue[0], queue[mi]] = [queue[mi], queue[0]];
      else if (mi < 0) queue[0] = BY_CUSTOMER_ID.miso;
    }
    if (forcedId && BY_CUSTOMER_ID[forcedId]) {
      const i = queue.findIndex(c => c.id === forcedId);
      if (i > 0) [queue[0], queue[i]] = [queue[i], queue[0]];
      else if (i < 0) queue[0] = BY_CUSTOMER_ID[forcedId];
      forcedId = null;
    }
    return queue;
  }

  function open() {
    const g = ++gen;
    const visits = engine.standVisits();
    session = { gen: g, queue: makeQueue(visits), i: 0, earned: 0, cupsSold: 0 };
    /* One-time role framing (clarity review): tapping the stall silently
       flipped her from buyer to seller. Three short sentences, once ever;
       the flag is set on the button, so a reload cannot burn the showing. */
    if (!kvLoad('standIntro', 0)) {
      $('standCard').innerHTML = `
        <div class="success">
          <div class="success-big">You are the shopkeeper!</div>
          <div class="success-sub">Make the cups your friends ask for,
            then work out their money.</div>
          <div class="success-sub">Everything you earn goes in your wallet.</div>
          <button id="standOpenBtn" class="big-btn ok">Open the stand!</button>
        </div>`;
      $('stand').classList.remove('hidden');
      $('standOpenBtn').addEventListener('click', () => {
        kvStore('standIntro', 1);
        $('stand').classList.add('hidden');
        if (session && session.gen === gen) nextCustomer();
      });
      return;
    }
    nextCustomer();
  }

  function isOpen() { return session !== null; }

  function nextCustomer() {
    const s = session;
    if (!s || s.gen !== gen) return;
    if (s.i >= s.queue.length) { showSummary(); return; }
    const customer = s.queue[s.i];
    const order = engine.standOrder(customer.trait || {});
    /* The three lines are picked ONCE per sale, not per render. renderCard
       runs again on every phase change and after every miss, so picking
       inside the template re-rolled the customer's voice mid-sentence. */
    sale = {
      customer, order, phase: 'order',
      hello: pickOne(customer.hello),
      /* paying is optional in the roster (an exact payer has no paying phase
         to say it in), and a missing one must not throw: this runs on the tap
         path, outside the frame loop's try/catch, so a TypeError here leaves
         her stuck behind a modal with no card in it. Falling back to the
         hello keeps the bubble talking. */
      paying: pickOne(customer.paying || customer.hello),
      happy: pickOne(customer.happy),
      misses: { change: 0 }, anyMiss: false,
      submitted: false, assist: null, colW: null, entry: [], count: 0
    };
    /* Name the walker while the card is down: the 2-3s walk-in used to be
       a dead window that could read as frozen (clarity review). */
    toast(`Here comes ${customer.name}!`, 1800);
    sale.handle = world.customerEnter(customer.species, () => {
      if (session === s && s.gen === gen) renderCard();
    });
  }

  /* ---- card shell ---- */
  /* The same glyph the go key and the quest ticks use. */
  const TICK = '✓';

  /* The words over the token row. This answers the question she is actually
     asking, which is how many are still to come, so it counts the friends
     AFTER the one at the counter. It is deliberately not "4 of 12": a total
     is a fact about the session, a remainder is a fact about her.
     Safe to call during a celebration: session.i only advances in the Next!
     handler, so the count does not jump while the card is still up.
     The last branch says LINE, not "today": the road costs three sessions
     back to back, so the summary card right behind this one asks her to sell
     again today, and the stand is never closed (SPEC: going broke is never a
     dead end). A day claim here is the one thing this sentence cannot make. */
  function queueLine() {
    const left = session.queue.length - session.i - 1;
    if (left <= 0) return 'Last friend in line!';
    return left === 1 ? '1 more friend waiting' : left + ' more friends waiting';
  }

  /* ONE speech bubble, and it says what the customer is saying RIGHT NOW.
     The bubble used to hold the hello for the whole sale, so the celebration
     card showed the opening line and the closing line at once, in two
     identical bubbles, with the top one still asking for lemonade that had
     already been poured. It also meant the order ("3 Small cups, please!")
     was rendered as a game prompt in red, which put the customer's own words
     in the game's voice and gave the card two speakers dressed the same.
     Now the order rides inside the bubble where it belongs, and every later
     phase replaces the line rather than stacking a second one. */
  function barkFor() {
    const o = sale.order;
    const order = `<b>${o.cups} ${CUP_SIZES[o.per]} cup${o.cups > 1 ? 's' : ''},
      please!</b>`;
    if (sale.phase === 'order') return `${sale.hello}<br>${order}`;
    /* The paying line carries the big-bill apology for the forced-tender
       regulars, which is why it lands here and not in the hello: the tender
       only becomes her problem once it is on the counter. */
    return sale.paying;
  }

  /* The change receipt, shared by the keypad phase and the drawer: the two
     phases pose the SAME sum by different means, so they must not drift into
     two wordings of it. Order is minuend, subtrahend, then the row she is
     solving for, which is the column scaffold's layout in words. */
  function changeReceipt(c, p) {
    return receipt([
      { label: `${c.name} paid`, value: p.m },
      { label: 'The lemonade costs', value: p.s },
      { label: 'You give back', value: '?' }
    ]);
  }

  function renderCard() {
    const c = sale.customer;
    $('standCard').innerHTML = `
      <div class="stand-head">
        <img class="stand-face" alt="" src="${world.speciesThumbnail(c.species)}">
        <div class="stand-name">${c.name}</div>
        <button id="standClose" class="chip">All done</button>
      </div>
      <div class="stand-queue">
        <span class="block-cap">${queueLine()}</span>
        <span class="queue-dots">${session.queue.map((q, i) =>
          `<i class="qd${i < session.i ? ' qd-done' : i === session.i ? ' qd-now' : ''}"
            id="pip${i}">${i < session.i ? TICK : ''}</i>`).join('')}</span>
      </div>
      <div class="bark" id="standBark">${barkFor()}</div>
      <div class="buy-prompt" id="standPrompt"></div>
      <div id="standBills"></div>
      <div class="buy-nudge" id="standNudge"></div>
      <div id="standBody"></div>`;
    $('stand').classList.remove('hidden');
    $('standClose').addEventListener('click', cancel);
    if (sale.anyMiss) $('standClose').style.visibility = 'hidden';
    renderPhase();
  }

  /* The addition bridge slot. Cold (stage 0) shows it with the card; warm
     (stage 1) waits for a miss and is why this is painted into its own node
     rather than baked into the receipt: filling it on a miss must not rebuild
     the receipt, which would wipe whatever she has typed. Hot (stage 2) never
     shows it, and neither does a column card (the column is its own method
     and two scaffolds at once is one too many). */
  function paintBridge(afterMiss) {
    const p = sale.order.problem;
    const host = $('standBridge');
    if (!host) return;
    if (!p || p.bridge === null || p.bridge >= 2 || sale.colW) {
      host.innerHTML = '';
      return;
    }
    /* Never on the same card as the change lesson itself. That card is already
       introducing what change IS, which is a bigger idea than any one fact,
       and a second new notation underneath it is one thing too many at once.
       It measured as a layout problem too: both lines are one-time, so they
       land together on exactly one card, and that card went 22px past the fold
       on a 393x852 phone. The bridge starts from her second change sale. */
    if (!kvLoad('taughtChangeStand', 0)) { host.innerHTML = ''; return; }
    if (p.bridge > 0 && !afterMiss) { host.innerHTML = ''; return; }
    const teach = bridgeTeachable() && !kvLoad('bridgeTaught', 0);
    host.innerHTML = bridge(p.m, p.s, teach);
    if (teach) kvStore('bridgeTaught', 1);
  }

  function noteMiss(which) {
    sale.misses[which]++;
    sale.anyMiss = true;
    const x = $('standClose');
    if (x) x.style.visibility = 'hidden';
    /* A miss is exactly when the warm bridge earns its place. */
    if (which === 'change') paintBridge(true);
  }

  function cancel() {
    /* Before any miss, leaving is fine: nothing was recorded, the customer
       just hops off and the stand closes. After a miss the sale must finish
       here, so route into the current phase's solve-together instead. */
    if (!sale || sale.submitted) return;
    if (sale.anyMiss) {
      if (!sale.assist) startAssist();
      return;
    }
    const handle = sale.handle;
    sale = null;
    handle.leave(() => {});
    /* ONE ending, and it is always a card. The zero-earnings branch used to
       hide the modal and fire a 2200ms toast under a moving scene; with the
       plaza fenced that drops her into a town with nothing else to do. The
       button is labelled now too, so this is a door she chose, not the
       seventh identical × in a game where the other six close one card. */
    showSummary();
  }

  function nudge(msg) {
    const el = $('standNudge');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }

  /* ---- phases ---- */
  /* The cup menu strip: all three sizes with prices, the ordered one
     highlighted, so a changing per-cup price reads as HER price list and
     not an arbitrary number (clarity review). */
  function menuStrip(per) {
    /* The size WORD has to be here: the order says "3 Medium cups, please!"
       and Medium appeared nowhere on the menu, and the thumbnails cannot
       carry the cue because renderThumb normalises every model to its own
       bounding box (the small cup rendered widest of the three). */
    return `<div class="cups-menu">${[2, 3, 4].map(p => `
      <span class="menu-cup cup-${p}${p === per ? ' menu-hi' : ''}">
        <img alt="" src="${world.thumbnail(CUP_ITEMS[p])}">
        <span>${CUP_SIZES[p]}</span>
        <span>$${p}</span>
      </span>`).join('')}</div>`;
  }

  function renderPhase() {
    const o = sale.order;
    const c = sale.customer;
    /* renderPhase is called directly on a phase change as well as from
       renderCard, so the bubble has to be refreshed here or the customer
       keeps saying the previous phase's line. */
    const bark = $('standBark');
    if (bark) bark.innerHTML = barkFor();
    /* 'split' opts this card into the two-column short-screen layout (see the
       max-height 460px tier): the receipt sits BESIDE the keypad instead of
       above it. Only the phases that actually render a receipt want it; on the
       order card it would leave an empty left column, so it is cleared here
       and set again below by the phases that earn it. */
    setSplit(false);
    if (sale.phase === 'order') {
      /* The order is in the bubble now; this row would only repeat it. The
         button underneath already says what to do. */
      $('standPrompt').innerHTML = '';
      /* Both cup groups are captioned. Unlabelled, the price list and the
         order were the same picture twice on one card, and a menu that
         highlights Medium sat directly above one Medium cup with nothing
         saying that the top row is what things cost and the bottom row is
         what she has to make. */
      $('standBody').innerHTML = `
        <div class="stand-order">
          <div class="cup-block">
            <div class="block-cap">Your prices</div>
            ${menuStrip(o.per)}
          </div>
          <div class="cup-block">
            <div class="block-cap">${c.name} wants</div>
            <div class="cups-row">${cupImgs(o)}</div>
            <div class="cups-math">${o.cups === 1
              ? `1 cup, costs <b>$${o.total}</b>`
              : `${o.cups} cups, $${o.per} each, costs <b>$${o.total}</b>`}</div>
          </div>
          <button id="standMake" class="big-btn ok">Make lemonade!</button>
        </div>`;
      $('standMake').addEventListener('click', () => {
        /* No chime: this tap cannot be wrong, and the correct-answer sound
           must keep meaning "you got it right". */
        startSolve();
      });
    } else if (sale.phase === 'change') {
      const p = o.problem;
      /* THE RECEIPT replaces the paragraph. Direction words are still
         load-bearing (the store's change comes TO her, the stand's goes FROM
         her) but they now live in the row labels, where each one sits beside
         the number it names instead of three clauses deep in a sentence.
         Order is minuend then subtrahend then the answer row, which is the
         column scaffold's layout in words, so the two entry paths teach the
         same shape. */
      /* The WHY still has to be said once, because the bill-and-change model
         is a cultural convention rather than something discoverable, and the
         split rule deliberately hides the money visual that could show it at
         this tier. One sentence in the hint voice, under the receipt, instead
         of three clauses inside the question. The flag is stand-only: the
         store owns the opposite direction and needs its own first time. */
      const teach = !kvLoad('taughtChangeStand', 0)
        ? `<div class="assist-hint">${c.name} paid more than the lemonade costs.
             The extra goes back. That is called change.</div>`
        : '';
      $('standPrompt').innerHTML = '<b>How much do you give back?</b>';
      /* The receipt goes in the BILLS slot, not the body, so the card reads
         ask, then facts, then the empty nudge band, then the entry. The nudge
         has to sit next to the keypad: it is feedback on the tap she just
         made, and it was landing above the facts instead. */
      /* No receipt beside a column: the column already shows both amounts in
         exactly this order, and printing them twice on one card is the
         same-picture-twice defect the caption rule exists to stop. The
         teaching line still shows on both paths. */
      $('standBills').innerHTML =
        (p.entry === 'column' ? '' : changeReceipt(c, p))
        + '<div id="standBridge"></div>' + teach;
      if (p.entry !== 'column') setSplit(true);
      $('standBody').innerHTML = `
        <div class="entry-wrap">
          <div id="standEntryArea"></div>
          <div id="standKeypadHost"></div>
        </div>
        ${HINTS}`;
      mountKeypad();
      if (p.entry === 'column') {
        mountColumn($('standEntryArea'), p, d => { sale.colW = d; });
        keypad.setGo(false);
      } else {
        sale.colW = null;
        /* The old "$5 − $2" strip is gone: the receipt above carries both
           amounts, and the strip was the biggest type on the card while
           being a restatement of it. */
        $('standEntryArea').innerHTML =
          `<div class="pad-display" id="standPad"></div>`;
        paintPad();
        keypad.setGo(false);
      }
      paintBridge(false);
    } else if (sale.phase === 'drawer') {
      const p = o.problem;
      /* One line, and it names the actor and the GESTURE: "count up" alone
         can read as counting one to fifty. The two amounts moved into the
         receipt, and the inert bill fan moved out: the fan and the row
         "NAME paid $50" were the same fact twice, and the drawer's own bills
         are the money she actually handles. */
      $('standPrompt').innerHTML =
        `<b>Hand ${c.name} bills until the big number gets to $${p.m}!</b>`;
      $('standBills').innerHTML = changeReceipt(c, p);
      setSplit(true);
      $('standBody').innerHTML = `<div id="standDrawerHost"></div>`;
      sale.count = o.total;
      drawer = makeDrawer($('standDrawerHost'), {
        start: o.total, target: p.m, onBill: onDrawerBill
      });
      /* Her first drawer ever gets the greedy first bill pulsing until she
         taps once: a visual procedure hint with no assist, no miss change
         (state.drawer.n is 0 exactly when the drawer is brand new). */
      if (state.drawer.n === 0) {
        sale.drawerHint = true;
        drawer.highlight(greedyNext());
      }
    }
  }

  /* The column and its borrow narration. The hint node lives in the card
     body (HINTS above), not in this host: makeColumn wipes whatever it is
     given, and the first mark fires inside its own constructor, so the slot
     has to be somewhere this function does not touch. Borrowing had no
     explanation anywhere in the project, and a struck-through digit with a
     new red number above it is the single least self-evident thing a young
     player meets. Direction matters: a borrowOut column RECEIVES the ten, a
     borrowIn column PAID for it, and one sentence cannot serve both. */
  function mountColumn(host, p, assign) {
    host.innerHTML = '<div id="standColHost"></div>';
    if (!kvLoad('colTaught', 0)) {
      setHint('standColHint', 'Start in the orange box.');
    }
    assign(makeColumn($('standColHost'), columns(p.m, p.s), {
      marks: p.stage === 0,
      onMark: (i, shown, c) => {
        if (sale.assist || kvLoad('borrowTaught', 0)) return;
        setHint('standColHint', c.borrowOut
          ? `${c.top} is too small, so it takes a ten from next door. Now it is ${shown}. Use ${shown}!`
          : `This one gave a ten away. ${c.top} is now ${shown}.`);
      }
    }));
  }

  function cupImgs(o) {
    const item = CUP_ITEMS[o.per];
    return Array.from({ length: o.cups },
      () => `<img alt="" src="${world.thumbnail(item)}">`).join('');
  }

  function mountKeypad() {
    keypad = makeKeypad($('standKeypadHost'), {
      onDigit: d => onDigit(d),
      onBack: () => onBack(),
      onSubmit: () => onSubmit(),
      /* A tap on the dimmed checkmark answers instead of playing dead
         (clarity review): say what it is waiting for. */
      onEmptySubmit: () => {
        if (!sale || sale.assist) return;
        nudge(sale.colW ? 'Fill all the boxes first!' : 'Put your answer in first!');
      },
      hintGo: !kvLoad('goTaught', 0)
    });
    /* ✓ gets a pulse, a flag and an empty-submit nudge; ⌫ got nothing, so a
       mistyped digit had no visible way out and she submitted a typo as a
       maths error. Name both once, in the same window, then it retires. */
    if (!kvLoad('goTaught', 0)) {
      setHint('standKeyHint', 'Tap ✓ when you are done. Tap ⌫ to erase.');
    }
    sale.entry = [];
  }

  /* Empty means a blinking caret drawn by CSS off :empty, never a character:
     the old middle dot read as a decimal point to a young player.
     Mirrors store.js paintPad exactly. */
  function paintPad() {
    const el = $('standPad');
    if (el) el.textContent = sale.entry.join('');
  }

  /* ---- keypad entry (total and change share the ladder) ---- */
  function onDigit(d) {
    if (sale.assist) return assistDigit(d);
    if (sale.colW) {
      sale.colW.enter(d);
      keypad.setGo(sale.colW.filled());
    } else {
      if (sale.entry.length >= 3) return;
      sale.entry.push(d);
      paintPad();
      keypad.setGo(true);
    }
  }

  function onBack() {
    if (sale.assist) return;
    if (sale.colW) {
      sale.colW.back();
      keypad.setGo(sale.colW.filled());
    } else {
      sale.entry.pop();
      paintPad();
      keypad.setGo(sale.entry.length > 0);
    }
  }

  function onSubmit() {
    if (sale.assist) return;
    const o = sale.order;
    /* change */
    const p = o.problem;
    let ok, diag = null;
    if (sale.colW) {
      diag = diagnose(p.m, p.s, sale.colW.digits());
      ok = diag.wrong.length === 0;
    } else {
      if (!sale.entry.length) return;
      const v = Number(sale.entry.join(''));
      ok = v === p.answer;
      if (!ok) diag = diagnose(p.m, p.s, digitsOf(v));
    }
    if (ok) {
      completeSale({ firstTry: sale.misses.change === 0, assisted: false });
      return;
    }
    if (sale.misses.change === 0 && diag) sale.borrowErr = diag.borrowErr;
    noteMiss('change');
    if (sale.misses.change >= 2) {
      startAssist();
    } else {
      nudge(NUDGES[Math.floor(Math.random() * NUDGES.length)]);
      if (sale.colW) sale.colW.reset();
      else { sale.entry = []; paintPad(); }
      keypad.setGo(false);
    }
  }

  /* The order card hands straight to the subtraction. There used to be a
     cups-times-price step here: she typed the total before ever meeting the
     change. It was untracked on purpose (multiplication is her strength) but
     it made every sale two questions deep, and a stand sale is supposed to
     pose ONE. The total is stated on the order card as a fact now, so the
     only thing she is ever asked at this stand is the subtraction. Do not
     put a solve step back in front of it. */
  function startSolve() {
    const o = sale.order;
    kvStore('goTaught', 1);
    if (!o.problem) {
      /* Exact payer: no change to make. */
      completeSale(null);
      return;
    }
    /* No chime here: the tap that reaches this point cannot be wrong, and the
       correct-answer sound has to keep meaning "you got it right". */
    sale.entry = [];
    sale.phase = o.problem.entry === 'drawer' ? 'drawer' : 'change';
    $('standNudge').textContent = '';
    renderPhase();
  }

  /* ---- solve together ---- */
  function startAssist() {
    const o = sale.order;
    nudge(`Let's solve it together!`);
    if (sale.phase === 'drawer') {
      sale.assist = { drawer: true };
      drawer.highlight(greedyNext());
      return;
    }
    if (sale.phase === 'change' && sale.colW) {
      const p = o.problem;
      /* The column walk needs its own instruction: the keypad walk below has
         always had one, and without it her second miss produces a rebuilt
         column, one faint ghost digit and a keypad where nine keys in ten
         shake and refuse her. Naming the keypad is load bearing, since the
         glowing box itself has no listener and a tap on it is silent. */
      mountColumn($('standEntryArea'), { m: p.m, s: p.s, stage: 0 },
        d => { sale.colW = d; });
      const expect = sale.colW.guide(0);
      setHint('standColHint',
        'The glowing box shows the number. Tap that number on the keypad!');
      setHint('standKeyHint', '');
      sale.assist = { i: 0, expect, col: true, n: columns(p.m, p.s).length };
    } else {
      const answer = o.problem.answer;
      sale.assist = { digits: digitsOf(answer).reverse(), at: 0, col: false, answer };
      $('standEntryArea').innerHTML = `<div class="pad-display" id="standPad"></div>`;
      setHint('standColHint', 'Tap these numbers on the keypad!');
      setHint('standKeyHint', '');
      paintAssist();
    }
    keypad && keypad.setGo(false);
  }

  function paintAssist() {
    const a = sale.assist;
    const s = String(a.answer);
    $('standPad').innerHTML =
      `<span>${s.slice(0, a.at)}</span><span class="rest">${s.slice(a.at)}</span>`;
  }

  function assistDigit(d) {
    const a = sale.assist;
    if (a.col) {
      /* Say it, do not just shake. During the guided walk she can read. */
      if (d !== a.expect) { keypad.shake(d); nudge('Tap the glowing number!'); return; }
      sale.colW.confirm(a.i);
      a.i++;
      if (a.i >= a.n) {
        return completeSale({ firstTry: false, assisted: true });
      }
      a.expect = sale.colW.guide(a.i);
    } else {
      if (d !== a.digits[a.at]) { keypad.shake(d); return; }
      a.at++;
      paintAssist();
      if (a.at >= a.digits.length) {
        completeSale({ firstTry: false, assisted: true });
      }
    }
  }

  /* ---- drawer ---- */
  function greedyNext() {
    const target = sale.order.problem.m;
    return DRAWER_DENOMS.find(d => sale.count + d <= target);
  }

  function onDrawerBill(d) {
    /* submitted is part of the guard: two fingers landing on the drawer in
       the same input frame queue two pointerdowns, and the first one can
       complete the sale before the second is dispatched. Without this the
       second tap overshoots a finished target and paints "Oops, too much!"
       onto the celebration card, plus a miss on a sale she just won. */
    if (!sale || sale.submitted || sale.phase !== 'drawer') return;
    if (sale.drawerHint && !sale.assist) {
      sale.drawerHint = false;
      drawer.highlight(null);
    }
    const target = sale.order.problem.m;
    if (sale.assist && d !== greedyNext()) {
      drawer.shake(d);
      nudge('Tap the glowing bill!');
      return;
    }
    if (sale.count + d > target) {
      drawer.shake(d);
      noteMiss('change');
      if (sale.misses.change >= 2 && !sale.assist) startAssist();
      else nudge('Oops, too much! Try a smaller bill.');
      return;
    }
    sale.count += d;
    play('thunk');
    drawer.addBill(d);
    drawer.setCount(sale.count);
    if (sale.assist && sale.count < target) drawer.highlight(greedyNext());
    if (sale.count === target) {
      completeSale({ firstTry: sale.misses.change === 0 });
    }
  }

  /* ---- completion: submit once, earn, celebrate ---- */
  function completeSale(res) {
    if (sale.submitted) return;
    sale.submitted = true;
    const o = sale.order;
    let events = [];
    if (o.problem && res) {
      events = engine.submitResult(o.problem, {
        firstTry: res.firstTry,
        assisted: res.assisted || false,
        borrowErr: sale.borrowErr || false
      });
    }
    engine.earn(o.total);
    session.earned += o.total;
    session.cupsSold += o.cups;
    hud();
    /* Fill her pip now: session.i only advances in the Next! handler, so the
       strip would otherwise sit stale through the whole celebration. */
    const pip = $('pip' + session.i);
    if (pip) {
      pip.classList.remove('qd-now');
      pip.classList.add('qd-done');
      pip.textContent = TICK;
    }
    /* The sentence needs no update here: it counts the friends after this one,
       and serving the one at the counter does not change that set. */
    /* Money-teaching flags (clarity review): the first successful submit
       ends the checkmark hint, the first change sale ends the what-is-
       change framing, the first column ends the glowing-box hint. */
    kvStore('goTaught', 1);
    if (sale.phase === 'change') kvStore('taughtChangeStand', 1);
    if (sale.colW) {
      kvStore('colTaught', 1);
      /* Separate from colTaught: a three-digit problem can have zero borrows,
         so colTaught can be spent on a column that never drew a mark. */
      kvStore('borrowTaught', 1);
    }

    /* The celebration has exactly one way forward (Next!), so "All done" has
       to go with the question it belonged to. It used to survive into this
       card still bright and pressable, and cancel() refuses a submitted sale,
       so it pressed down under her finger and did nothing on EVERY sale. Same
       reason the go key dims by class rather than the disabled attribute: a
       control that answers with silence reads as a frozen game. */
    const x = $('standClose');
    if (x) x.style.visibility = 'hidden';

    const c = sale.customer;
    const exact = !o.problem;
    /* The drawer sale used to name the destination ("you counted up to $50")
       and never the thing she actually built. answer IS the change handed
       over, on both entry paths. */
    const change = o.problem ? o.problem.answer : null;
    $('standNudge').textContent = '';
    $('standBills').innerHTML = '';
    /* The celebration is one centred column again. */
    setSplit(false);
    /* ONE event, told once. This card used to carry five statements about the
       same $6: a prompt ("Miso is happy!"), the headline, the wallet line, the
       exact-payer line and the goodbye, plus a SECOND speech bubble under a
       first one that was still showing the hello. The headline and the wallet
       line are now one sentence, the maths echo is kept because it confirms
       the answer she just typed in words, and the goodbye goes in the bubble
       that is already on the card. */
    const echo = exact
      ? `${c.name} paid exactly $${o.total}.`
      : sale.phase === 'drawer'
        ? `$${o.total} and $${change} makes $${o.problem.m}.`
        : change > 0 ? `You gave ${c.name} $${change} back.` : '';
    $('standBody').innerHTML = `
      <div class="success">
        <div class="success-big">You earned $${o.total}!</div>
        <div class="success-sub">It went into your wallet.</div>
        ${echo ? `<div class="success-sub">${echo}</div>` : ''}
        <button id="standNext" class="big-btn ok">Next!</button>
      </div>`;
    /* The bubble switches to the goodbye instead of a second bubble being
       stacked under the first. Set directly rather than through a 'done'
       phase: nothing else re-renders after this, and a new phase value would
       be a new state for every guard in the file to think about. */
    const bark = $('standBark');
    if (bark) bark.innerHTML = sale.happy;
    $('standPrompt').innerHTML = '';
    play('ching');
    confetti(res && res.firstTry === false ? 10 : 16);
    $('standNext').addEventListener('click', () => {
      /* An excited double-tap must be one advance, not a crash. */
      if (!sale) return;
      const handle = sale.handle;
      sale = null;
      $('stand').classList.add('hidden');
      /* The wallet chip pulse waits for the card to drop, so the number
         going UP happens where she is actually looking (clarity review). */
      const chip = $('walletChip');
      chip.classList.add('pulse');
      setTimeout(() => chip.classList.remove('pulse'), 1200);
      onEvents(events);
      session.i++;
      handle.leave(() => nextCustomer());
    });
  }

  /* ---- summary and exit ---- */
  function showSummary() {
    const s = session;
    /* Count the session BEFORE rendering. The summary is where she learns
       how close the next chunk of town is, so the star row has to include
       the session she has just this second finished. A session that sold
       nothing does not count: opening the stand and walking away is not
       work, and counting it would let her tap the road open. */
    let progress = null;
    if (s.earned > 0 && !s.counted) {
      s.counted = true;
      if (onSession) progress = onSession(s);
    }
    /* "Closed" is a scary word for a stand that is always open; the
       summary now advertises the comeback (clarity review). */
    /* The summary can arrive straight off a receipt phase: "All done" is live
       until her first miss, so tapping it on the change or drawer card routes
       here without passing through completeSale, and the split grid would
       otherwise still be on the card. */
    setSplit(false);
    $('standCard').innerHTML = `
      <div class="success">
        <div class="success-big">All done for now!</div>
        ${s.cupsSold > 0
          ? `<div class="success-sub">You sold ${s.cupsSold} cup${s.cupsSold === 1 ? '' : 's'}
             and earned $${s.earned}!</div>` : ''}
        ${progress
          ? `<div class="stars-big">${progress.stars}</div>
             <div class="success-sub">${progress.line}</div>`
          : '<div class="success-sub">Tap your stand any time to sell more!</div>'}
        <button id="standDone" class="big-btn ok">${s.cupsSold > 0 ? 'Yay!' : 'Okay!'}</button>
      </div>`;
    $('stand').classList.remove('hidden');
    if (s.earned > 0) { play('fanfare'); confetti(30); }
    $('standDone').addEventListener('click', exit);
  }

  function exit() {
    if (!session) return;
    $('stand').classList.add('hidden');
    session = null;
    sale = null;
    onExit();
  }

  return {
    open, isOpen,
    debugForce(id) { forcedId = id; }
  };
}
