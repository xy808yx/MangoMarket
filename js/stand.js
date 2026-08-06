/* Mango Market lemonade stand (Phase 4). Owns the sell flow: a queue of
   regulars sized by engine.standVisits(), one order per customer from
   engine.standOrder(traits), the cups-times-price moment (her strength,
   deliberately untracked), then the change: keypad or column under $50
   through the tier path, the bill drawer at $50+ (state.drawer only), or an
   exact payer with no change at all. Every completed sale earns the total.

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
  makeKeypad, makeColumn, makeDrawer, DRAWER_DENOMS, renderBills, toast, confetti
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
    sale = {
      customer, order, phase: 'order',
      misses: { total: 0, change: 0 }, anyMiss: false,
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
      <div class="bark" id="standBark">${pickOne(c.hello)}</div>
      <div class="buy-prompt" id="standPrompt"></div>
      <div id="standBills"></div>
      <div class="buy-nudge" id="standNudge"></div>
      <div id="standBody"></div>`;
    $('stand').classList.remove('hidden');
    $('standClose').addEventListener('click', cancel);
    if (sale.anyMiss) $('standClose').style.visibility = 'hidden';
    renderPhase();
  }

  function noteMiss(which) {
    sale.misses[which]++;
    sale.anyMiss = true;
    const x = $('standClose');
    if (x) x.style.visibility = 'hidden';
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
    const size = CUP_SIZES[o.per];
    const plural = o.cups > 1 ? 's' : '';
    if (sale.phase === 'order') {
      $('standPrompt').innerHTML = `<b>${o.cups} ${size} cup${plural}, please!</b>`;
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
          </div>
          <button id="standMake" class="big-btn ok">Make lemonade!</button>
        </div>`;
      $('standMake').addEventListener('click', () => {
        /* No chime: this tap cannot be wrong, and the correct-answer sound
           must keep meaning "you got it right". */
        sale.phase = 'total';
        renderPhase();
      });
    } else if (sale.phase === 'total') {
      /* One cup must not read as a trick question: ask for the payment,
         not an echo of the price just stated (clarity review). */
      /* Vocabulary is fixed game-wide: COSTS is the price, PAYS WITH is the
         bill, GIVES BACK is the change. The old one-cup line asked "how much
         does NAME pay?" for the PRICE, and one tap later the change card said
         "NAME pays with $5", teaching then contradicting the same word. */
      $('standPrompt').innerHTML = `Lemonade is ready! ` + (o.cups === 1
        ? `One ${size} cup costs $${o.per}. <b>Type the price!</b>`
        : `Each ${size} cup costs $${o.per}. <b>How much do ${o.cups} cups cost?</b>`);
      $('standBody').innerHTML = `
        <div class="entry-wrap">
          <div id="standEntryArea">
            <div class="cup-block">
              <div class="block-cap">You made</div>
              <div class="cups-row cups-mini">${cupImgs(o)}</div>
            </div>
            <div class="cups-math">${o.cups} cup${plural}, $${o.per} each</div>
            <div class="pad-display" id="standPad"></div>
          </div>
          <div id="standKeypadHost"></div>
        </div>
        ${HINTS}`;
      mountKeypad();
      paintPad();
    } else if (sale.phase === 'change') {
      const p = o.problem;
      /* Direction words (clarity review): the store's change comes TO her,
         the stand's change goes FROM her, and the sentence must say so.
         The first change sale ever also names what "change" means; the
         taught flag is shared with the store side. */
      /* Say WHY money comes back. "You give money back" is arbitrary unless
         something states she handed over MORE than the price, and the engine
         guarantees tender > total on every change problem, so the comparison
         can never render a falsehood. The flag is stand-only: the store owns
         the opposite direction and needs its own first time. */
      const teach = !kvLoad('taughtChangeStand', 0)
        ? ` $${p.m} is more than $${o.total}! You give the extra money back. That is called change.`
        : '';
      $('standPrompt').innerHTML =
        `That is $${o.total}! ${c.name} pays with $${p.m}.${teach}
         <b>How much do you give back?</b>`;
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
        /* Show the subtraction. The EASIER total phase gets cup pictures and
           a maths strip; the harder change step used to strip all of it and
           ask her to hold two amounts out of a three-clause sentence while
           working the keypad. A keypad change problem is always under $50, so
           there are no bills either: the empty pad was the whole card. */
        $('standEntryArea').innerHTML =
          `<div class="cups-math">$${p.m} − $${p.s}</div>
           <div class="pad-display" id="standPad"></div>`;
        paintPad();
        keypad.setGo(false);
      }
    } else if (sale.phase === 'drawer') {
      const p = o.problem;
      /* Name the amounts, the actor and the GESTURE: "count up" alone can
         read as counting one to fifty (clarity review). */
      /* Name the direction. Without it the only direction word on this
         screen is "NAME gave you this!", which points money toward her, so
         the story she could assemble was the change rule inverted. */
      $('standPrompt').innerHTML =
        `That is $${o.total}! ${c.name} gave you $${p.m}, so you give bills back.
         <b>Hand ${c.name} bills until the big number gets to $${p.m}!</b>`;
      $('standBills').innerHTML =
        `<div class="bills-cap">${c.name} gave you this!</div>
         <div id="standBillsRow"></div>`;
      renderBills($('standBillsRow'), p.m);
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
    if (sale.phase === 'total') {
      if (!sale.entry.length) return;
      const v = Number(sale.entry.join(''));
      if (v === o.total) { totalDone(); return; }
      noteMiss('total');
      if (sale.misses.total >= 2) {
        startAssist();
      } else {
        nudge(NUDGES[Math.floor(Math.random() * NUDGES.length)]);
        sale.entry = [];
        paintPad();
        keypad.setGo(false);
      }
      return;
    }
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

  function totalDone() {
    const o = sale.order;
    kvStore('goTaught', 1);
    if (!o.problem) {
      /* Exact payer: no change to make. */
      completeSale(null);
      return;
    }
    play('chime');
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
      const answer = sale.phase === 'total' ? o.total : o.problem.answer;
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
        if (sale.phase === 'total') {
          sale.assist = null;
          totalDone();
        } else {
          completeSale({ firstTry: false, assisted: true });
        }
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
    $('standBody').innerHTML = `
      <div class="success">
        <div class="success-big">You earned $${o.total}!</div>
        <div class="success-sub">$${o.total} went into your wallet!</div>
        ${exact ? `<div class="success-sub">${c.name} paid exactly $${o.total}!</div>` : ''}
        ${change !== null && change > 0 ? `<div class="success-sub">You gave ${c.name} $${change} back!</div>` : ''}
        ${sale.phase === 'drawer' ? `<div class="success-sub">$${o.total} and $${change} makes $${o.problem.m}.</div>` : ''}
        <div class="bark">${pickOne(c.happy)}</div>
        <button id="standNext" class="big-btn ok">Next!</button>
      </div>`;
    $('standPrompt').innerHTML = `${c.name} is happy!`;
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
