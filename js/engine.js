/* Mango Market math engine. Headless on purpose: no DOM, no three.js, so
   tools/sim.mjs can drive it under node exactly as the game will in the
   browser. The pedagogy rules encoded here (split rule, scaffold stages,
   mastery gates) are the contract and change only as a deliberate design
   decision.

   Fact classes (tier = what the problem is, not where it appears):
     single      minuend 2..10, includes make-ten change from a $5 or $10
     teens       minuend 11..19, crossing facts included, never scaffolded
     two_easy    minuend 20..99, no borrow
     two_borrow  minuend 20..99, at least one borrow, scaffolded
     three       minuend 100..999, scaffolded */

export const TIERS = ['single', 'teens', 'two_easy', 'two_borrow', 'three'];

const SCAFFOLDED = new Set(['two_borrow', 'three']);

export const TUNING = {
  gateWindow: 20,      // rolling attempts per mastery check
  gateNeed: 17,        // first-try correct within the window (85%)
  fadeWindow: 6,
  fadeNeed: 5,         // 5 of the last 6 first-try at this stage fades one step
  regressWindow: 6,
  regressMisses: 3,    // 3 misses in the last 6 at this stage brings it back
  moneyMin: 50,        // split rule: bills on screen only when minuend >= 50
  rateCashier: 0.22,   // ~1 in 4-5 purchases, only on aisles below the frontier
  rateWallet: 0.25,    // ~1 in 4 purchases, only when the numbers stay in reach
  tenderEscalate: 0.9, // chance a cheap item is paid with a frontier-sized bill
  standDrawer: 0.15,   // big-bill stand orders, answered from the bill drawer
  standEscalate: 0.5,  // chance a stand customer pays with a frontier-sized bill
  borrowShare: { fresh: 0.45, easyMastered: 0.75 },
  factSteer: 0.75,     // chance a small change problem aims at the neediest fact
  teensReview: 0.45,   // chance an escalation aims BACK at a crossing-ten fact
  bridgeRun: 3,        // consecutive first-try corrects before a fact counts as holding
  listMin: 3,
  listMax: 5,
  reviewShare: 0.25    // shopping list slots pulled from earlier aisles
};

/* Aisle order is the unlock ladder. needs lists the tiers that must be
   mastered (gateNeed of gateWindow, scaffold fully faded) before the aisle
   opens. gen is the price range the generator samples; it is trimmed where
   an edge price would push its change problem out of tier (a $19 scone paid
   with $20 lands in two_borrow, so bakery samples 10..18; same trim at the
   top of toys and electronics). */
export const AISLES = [
  { id: 'produce',     tiers: ['single'],                 gen: [2, 9],     needs: [] },
  { id: 'bakery',      tiers: ['teens'],                  gen: [10, 18],   needs: ['single'] },
  { id: 'toys',        tiers: ['two_easy', 'two_borrow'], gen: [20, 98],   needs: ['teens'] },
  { id: 'electronics', tiers: ['three'],                  gen: [100, 940], needs: ['two_easy', 'two_borrow'] },
  { id: 'home',        tiers: [],                         gen: [15, 350],  needs: ['three'] }
];

/* ---------------------------------------------------------------------------
   The 72 fluency facts.

   Group A, 36 single-digit facts: a 2..9, b 2..a.
   Group B, 36 teen facts that cross ten: a 11..18, b 2..9, kept when
   a % 10 < b, so the ones digit cannot cover the subtrahend and ten has to
   be broken.

   Excluded by construction, everywhere: negatives, minus 0, minus 1. Every
   answer is a single digit 0..9.

   Group B is the load-bearing half. Every borrow in the higher tiers reduces
   to a teen fact plus bookkeeping: 84 - 57 is 14 - 7 with a ten dropped,
   43 - 7 is 13 - 7 the same way. When the teens are not automatic every later
   tier is slow, and the slowness reads as the borrowing algorithm failing
   when it is really fact recall failing.

   The tier records answer "how is she doing at teens". These answer "how is
   she doing at 15 - 8", which is what the shopping steer aims at and what the
   parent grid draws. */
export const FACTS = (() => {
  const out = [];
  for (let a = 2; a <= 9; a++) for (let b = 2; b <= a; b++) out.push(a + '-' + b);
  for (let a = 11; a <= 18; a++) {
    for (let b = 2; b <= 9; b++) if (a % 10 < b) out.push(a + '-' + b);
  }
  return out;
})();

export const FACT_SET = new Set(FACTS);

/* The key for a problem, or null when it is not one of the 72. Null means
   "not tracked", never an error: most of the game's problems are 2- and
   3-digit, and the tier records already cover those. */
export function factKey(m, s) {
  const k = m + '-' + s;
  return FACT_SET.has(k) ? k : null;
}

/* bridge is how well this one fact is HOLDING, 0 to 2. It is named for the
   on-card addition hint whose three stages it used to drive; that hint was cut
   (see ui.js for why and for what any replacement must not do) and the counter
   stayed, because what it measures was never really about the hint. Two live
   readers depend on it: factNeed ranks a fact that is not yet holding as
   needier, and stats() will not call a fact known cold until it reaches 2.
   THE FIELD KEEPS ITS NAME. It is a persisted save key, the schema is frozen
   and sim-verified, and a rename buys a migration for nothing.
   run is consecutive first-try corrects, which is what advances it.
   lastOk is whether the most recent attempt was first-try correct: one
   wrong answer is what drops it and what turns the parent grid red. */
export function factRecord() {
  return { n: 0, ok: 0, run: 0, bridge: 0, miss: 0, lastOk: false };
}

export function borrowCount(m, s) {
  let n = 0, carry = 0;
  while (m > 0 || s > 0) {
    if (m % 10 < s % 10 + carry) { n++; carry = 1; } else { carry = 0; }
    m = Math.floor(m / 10);
    s = Math.floor(s / 10);
  }
  return n;
}

export function classify(m, s) {
  if (m <= 10) return 'single';
  if (m <= 19) return 'teens';
  if (m <= 99) return borrowCount(m, s) ? 'two_borrow' : 'two_easy';
  return 'three';
}

/* Column model for the scaffold UI and digit-level diagnosis. Right to
   left; digit is the correct answer digit for that column. */
export function columns(m, s) {
  const cols = [];
  let borrow = 0;
  while (m > 0 || s > 0) {
    const top = m % 10, bottom = s % 10;
    const eff = top - borrow;
    const lend = eff < bottom ? 1 : 0;
    cols.push({ top, bottom, borrowIn: borrow, borrowOut: lend, digit: eff + lend * 10 - bottom });
    borrow = lend;
    m = Math.floor(m / 10);
    s = Math.floor(s / 10);
  }
  return cols;
}

/* Which columns she got wrong, and whether any of them involved a borrow.
   This is how a borrowing error is told apart from a fact error. digits is
   her entry, right to left; missing digits count as 0. */
export function diagnose(m, s, digits) {
  const cols = columns(m, s);
  const wrong = [];
  for (let i = 0; i < cols.length; i++) {
    if ((digits[i] || 0) !== cols[i].digit) wrong.push(i);
  }
  const borrowErr = wrong.some(i => cols[i].borrowIn || cols[i].borrowOut);
  return { wrong, borrowErr };
}

/* mulberry32. Sims pass a seeded rng; the game passes nothing and gets
   Math.random. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEngine({ state, rng, persist }) {
  rng = rng || Math.random;
  persist = persist || (() => {});
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const tierIdx = t => TIERS.indexOf(t);

  function unlockedAisles() {
    return AISLES.filter(a => state.aisles.includes(a.id));
  }

  /* Frontier = the furthest unlocked aisle that carries new math. After
     home unlocks the frontier stays at electronics; everything is review
     plus continued three practice. */
  function frontier() {
    const u = unlockedAisles().filter(a => a.tiers.length);
    const aisle = u[u.length - 1];
    return {
      aisle,
      idx: AISLES.indexOf(aisle),
      minTier: Math.min(...aisle.tiers.map(tierIdx)),
      maxTier: Math.max(...aisle.tiers.map(tierIdx))
    };
  }

  /* Tender for a plain change problem, picked so classify(tender, price)
     stays at the tier the item naturally lives in. */
  function tenderFor(price) {
    if (price <= 9) return price < 5 && rng() < 0.5 ? 5 : 10;
    if (price <= 18) return ri(price + 1, 19);
    if (price <= 98) {
      const ones = price % 10, tens = Math.floor(price / 10);
      const share = state.tiers.two_easy.mastered
        ? TUNING.borrowShare.easyMastered : TUNING.borrowShare.fresh;
      if (rng() < share && ones > 0 && tens < 9) {
        return (tens + ri(1, Math.min(3, 9 - tens))) * 10;
      }
      const pads = [];
      if (ones < 9) pads.push(price + ri(1, 9 - ones));
      if (tens < 9) pads.push(price + 10 * ri(1, 9 - tens));
      return pick(pads);
    }
    const t50 = Math.floor(price / 50) * 50 + 50;
    const t100 = Math.floor(price / 100) * 100 + 100;
    const opts = [t50, t100, t100 + 100].filter(t => t > price && t <= 999);
    return pick(opts);
  }

  /* A cheap item paid with a big bill, so shopping the early aisles still
     practices the frontier tier. Target is one of the frontier's tiers.
     She can only break a bill she actually holds, so the three target is
     capped by the wallet and returns null when she is not carrying $100+;
     the caller keeps the plain tender in that case. */
  function escTender(price, target) {
    const ones = price % 10, tens = Math.floor(price / 10);
    if (target === 'teens') return ri(Math.max(11, price + 1), 19);
    if (target === 'two_borrow' && ones > 0 && tens < 9) {
      return ri(Math.max(2, tens + 1), 9) * 10;
    }
    if (target === 'two_easy' || target === 'two_borrow') {
      return ri(Math.max(2, tens + 1), 9) * 10 + ri(ones, 9);
    }
    const cap = Math.min(950, Math.floor(state.wallet / 50) * 50);
    if (cap < 100) return null;
    return 50 * ri(2, cap / 50);
  }

  /* ---- the 72 facts: need ranking and the shopping steer ---- */

  function factRec(k) {
    if (!state.facts[k]) state.facts[k] = factRecord();
    return state.facts[k];
  }

  /* Higher is needier. The brief's order, with its timing terms translated
     into the evidence this game actually collects (there are no clocks here:
     speed belongs to the drill app, and adding one to a shop would be a
     timer on a young player buying a mango).
       recently wrong        -> highest
       never seen            -> next, so coverage happens at all
       never right first try -> next
       not holding yet       -> mid, needier the further off holding it is
       solid and unaided     -> lowest, and it keeps sinking with the run
     Facts she owns still come up constantly, because they are what most
     prices naturally produce. That is the brief's 1-target-to-3-known mix
     arriving for free out of the economy rather than from a deal-out. */
  function factNeed(k) {
    const r = state.facts[k];
    if (!r || r.n === 0) return 3500;
    if (!r.lastOk) return 4000 + r.miss;
    if (r.ok === 0) return 3000;
    if (r.bridge < 2) return 2000 - r.bridge * 100;
    return 1000 - Math.min(r.run, 10) * 50;
  }

  /* Among the tenders that produce one of the 72 facts for THIS price and
     THIS tier, take the neediest. Constraining to the tier the natural
     tender already landed in is what makes this safe: the mix of tiers she
     practices, the split rule, the aisle gates and the pacing are all
     untouched, and only WHICH fact inside the tier moves. She also cannot
     be handed a bill she is not carrying. */
  function steerTender(price, tier, cap) {
    let best = -Infinity, bestList = [];
    for (const k of FACTS) {
      const dash = k.indexOf('-');
      const m = +k.slice(0, dash), s = +k.slice(dash + 1);
      if (s !== price || m > cap || classify(m, s) !== tier) continue;
      const need = factNeed(k);
      if (need > best) { best = need; bestList = [m]; }
      else if (need === best) bestList.push(m);
    }
    return bestList.length ? pick(bestList) : null;
  }

  /* Apply the steer to an already-decided tender. Returns the tender to use.
     Only small change problems qualify: everything above teens is out of the
     72-fact set by definition.

     cap is the largest tender allowed. In the STORE that is her wallet: she
     cannot break a bill she is not carrying. At the STAND there is no cap,
     because the money is the customer's, not hers. Passing the wallet at the
     stand silently starved Group B exactly when it mattered most, since a
     wallet under $11 rules out every crossing-ten fact and the wallet is at
     its thinnest early on, which is when she is selling hardest. */
  function steer(t, price, cap) {
    const tier = classify(t, price);
    if (tier !== 'single' && tier !== 'teens') return t;
    if (rng() >= TUNING.factSteer) return t;
    const st = steerTender(price, tier, cap);
    return st === null ? t : st;
  }

  function pickTwoTarget() {
    const share = state.tiers.two_easy.mastered
      ? TUNING.borrowShare.easyMastered : TUNING.borrowShare.fresh;
    return rng() < share ? 'two_borrow' : 'two_easy';
  }

  function finish(p, f) {
    p.tier = classify(p.m, p.s);
    p.answer = p.m - p.s;
    p.review = tierIdx(p.tier) < f.minTier;
    p.stage = state.tiers[p.tier].stage;
    p.money = p.m >= TUNING.moneyMin;
    p.entry = (SCAFFOLDED.has(p.tier) && p.stage < 2) ? 'column' : 'keypad';
    /* The holding counter, read but never written here: generation must stay
       side-effect free (forceMech rerolls purchaseProblem). A fact with no
       record yet reads 0, which is the right default for one never met. The
       UI no longer draws anything from p.bridge; the sim still asserts it, and
       it stays on the problem because that is where the sim can see it. */
    p.fact = factKey(p.m, p.s);
    p.bridge = p.fact ? (state.facts[p.fact] ? state.facts[p.fact].bridge : 0) : null;
    if (p.mechanic === 'cashier') {
      p.offeredWrong = rng() < 0.4;
      if (p.offeredWrong) {
        const opts = [1, 2, 10, -1, -2, -10]
          .map(d => p.answer + d)
          .filter(v => v >= 0 && v !== p.answer);
        p.offered = pick(opts);
      } else {
        p.offered = p.answer;
      }
    }
    return p;
  }

  /* item is {aisle, price}. The caller must have passed the afford check;
     an unaffordable pick belongs on the wishlist, never here. */
  function purchaseProblem(item) {
    if (state.wallet < item.price) throw new Error('purchase past wallet');
    const f = frontier();
    const itemIdx = AISLES.findIndex(a => a.id === item.aisle);
    const cashierOk = itemIdx < f.idx;
    /* The wallet mechanic reads the wallet as the minuend, so it stays off
       past $999: the engine's contract tops out at 3-digit minus 3-digit. */
    const walletOk = state.wallet <= 999
      && tierIdx(classify(state.wallet, item.price)) <= f.maxTier;
    const r = rng();
    let mech = 'change';
    if (r < TUNING.rateCashier) {
      if (cashierOk) mech = 'cashier';
    } else if (r < TUNING.rateCashier + TUNING.rateWallet) {
      if (walletOk) mech = 'wallet';
    }
    let m, s;
    if (mech === 'wallet') {
      m = state.wallet;
      s = item.price;
    } else {
      let t = tenderFor(item.price);
      if (mech === 'change' && tierIdx(classify(t, item.price)) < f.minTier
          && rng() < TUNING.tenderEscalate) {
        /* Escalation normally aims FORWARD, at the frontier, so cheap items
           still practice the newest tier. Some of them aim BACK instead, at a
           crossing-ten fact.

           This is not politeness toward old material. Group B is what every
           later tier is made of: 84 - 57 is 14 - 7 with a ten dropped, 43 - 7
           is 13 - 7 the same way. Left alone the economy stops producing
           crossing facts almost completely once bakery is behind her
           (measured over 60 sessions before this existed: 6 to 12 of the 36
           ever met), and the facts she never meets are precisely the ones she
           is still counting to. A cheap item paid with a teen bill is the
           only shape in this economy that poses one. */
        const teensBack = tierIdx('teens') < f.minTier
          && item.price >= 2 && item.price <= 9
          && rng() < TUNING.teensReview;
        const target = teensBack ? 'teens'
          : f.aisle.tiers.includes('two_borrow') ? pickTwoTarget() : f.aisle.tiers[0];
        const esc = escTender(item.price, target);
        if (esc !== null) t = esc;
      }
      if (mech === 'change') t = steer(t, item.price, state.wallet);
      if (t > state.wallet) t = state.wallet;
      m = t;
      s = item.price;
    }
    return finish({
      mechanic: mech, m, s, price: item.price, aisle: item.aisle,
      elig: { cashier: cashierOk, wallet: walletOk }
    }, f);
  }

  /* Lemonade order. cups x per only sets the total, which the card STATES:
     the change is the one thing she is asked, so a sale is never two
     questions deep. Big bills answer from the bill drawer (split rule allows
     bills at minuend >= 50) and never touch tier history. Keypad totals stay
     inside tiers the frontier has opened. */
  /* The stand gets busier as aisles open: more customers per session is the
     earn curve that keeps higher-priced aisles affordable. */
  function standVisits() {
    const progress = unlockedAisles().filter(a => a.tiers.length).length - 1;
    return 2 + 3 * progress + ri(0, 1);
  }

  /* opts carries customer traits (Phase 4). opts.tender forces a big bill
     (the duck's $100, the fox's $50): cups and per stay in the drawer-branch
     ranges, so the total tops out at 16 and can never reach a forced bill.
     opts.exact makes the customer pay the total on the nose: no change
     problem, just the cups-times-price moment. With no opts the rng path is
     byte-identical to Phase 2: the sim's determinism hashes must not move. */
  function standOrder(opts = {}) {
    const f = frontier();
    let cups, per, tender;
    if (opts.tender) {
      cups = ri(1, 4); per = ri(2, 4);
      /* A forced tender must be a real big bill or the order would dodge
         the drawer and leak into tier history (split rule). Bad trait
         data is caught headlessly by probeStandTraits; at runtime we
         clamp instead of throwing so her game never freezes. */
      if (opts.tender !== 50 && opts.tender !== 100) {
        console.error('standOrder: forced tender must be 50 or 100, got', opts.tender);
        tender = 100;
      } else {
        tender = opts.tender;
      }
    } else if (opts.exact) {
      if (f.maxTier >= tierIdx('two_easy')) { cups = ri(1, 4); per = ri(2, 4); }
      else { cups = ri(1, 3); per = ri(2, 3); }
      tender = cups * per;
    } else if (rng() < TUNING.standDrawer) {
      cups = ri(1, 4); per = ri(2, 4);
      tender = rng() < 0.5 ? 50 : 100;
    } else if (f.maxTier >= tierIdx('two_easy')) {
      cups = ri(1, 4); per = ri(2, 4);
      const total = cups * per;
      tender = total < 5 ? 5 : total < 10 ? 10 : 20;
      /* Stand escalation stays under $50: at $50+ the drawer takes over and
         the attempt would stop counting toward the tier. */
      if (rng() < TUNING.standEscalate) {
        const ones = total % 10;
        /* The same crossing-ten review the store's escalation runs, and this
           is the copy that does the work: the stand is where the volume is
           (2 to 14 sales a session against a handful of purchases), so it is
           where Group B actually gets met. */
        if (total >= 2 && total <= 9 && rng() < TUNING.teensReview) {
          tender = ri(Math.max(11, total + 1), 19);
        } else if (pickTwoTarget() === 'two_borrow' && ones > 0) {
          tender = ri(2, 4) * 10;
        } else {
          tender = ri(2, 4) * 10 + ri(ones, 9);
        }
      }
    } else if (f.maxTier === tierIdx('teens')) {
      cups = ri(1, 3); per = ri(2, 3);
      const total = cups * per;
      tender = rng() < TUNING.standEscalate ? ri(Math.max(11, total + 1), 19)
        : total < 5 ? 5 : 10;
    } else {
      cups = ri(1, 3); per = ri(2, 3);
      tender = cups * per < 5 ? 5 : 10;
    }
    const total = cups * per;
    /* Steer the plain branches at the fact she needs most. Forced tenders (a
       regular's trait) and exact payers are left alone: probeStandTraits
       asserts those land exactly where the roster data says they do. */
    if (!opts.tender && !opts.exact) tender = steer(tender, total, Infinity);
    let problem = null;
    if (total !== tender) {
      problem = finish({ mechanic: 'stand', m: tender, s: total, cups, per }, f);
      if (problem.money) problem.entry = 'drawer';
    }
    return { cups, per, total, tender, problem };
  }

  /* Quest lists carry one stretch item (the wishlist grind: saving toward
     it keeps the wallet fat, and a fat wallet is what lets cheap items get
     paid with frontier-sized bills). The other slots stay cheap so every
     trip has purchases she can actually make. */
  function shoppingList() {
    const u = unlockedAisles();
    const f = frontier();
    const n = ri(TUNING.listMin, TUNING.listMax);
    const list = [];
    for (let i = 0; i < n; i++) {
      let a, price;
      if (i === n - 1) {
        /* The stretch item closes the trip, so the cheap slots before it get
           paid while she is still holding the big bills she is saving. */
        a = f.aisle;
        price = a.id === 'electronics' && rng() < 0.6
          ? ri(150, 400) : ri(a.gen[0], a.gen[1]);
      } else if (state.aisles.includes('home')) {
        a = pick(u);
        price = a.id === 'electronics' ? ri(100, 180) : ri(a.gen[0], a.gen[1]);
      } else if (f.aisle.id === 'electronics'
          || (u.length > 1 && rng() < TUNING.reviewShare)) {
        a = pick(u.filter(x => x !== f.aisle && x.tiers.length));
        price = ri(a.gen[0], a.gen[1]);
      } else {
        a = f.aisle;
        price = a.id === 'toys' && rng() < 0.5 ? ri(20, 45) : ri(a.gen[0], a.gen[1]);
      }
      list.push({ aisle: a.id, price });
    }
    return list;
  }

  function canAfford(price) { return state.wallet >= price; }

  function pay(price) {
    if (price > state.wallet) throw new Error('pay past wallet');
    state.wallet -= price;
    persist(state);
  }

  function earn(n) {
    state.wallet += n;
    persist(state);
  }

  function beginSession(day) {
    state.day = day;
    persist(state);
  }

  function bumpDay() {
    const k = String(state.day);
    state.days[k] = (state.days[k] || 0) + 1;
    const keys = Object.keys(state.days);
    if (keys.length > 90) delete state.days[keys[0]];
  }

  /* res comes from the UI (or a sim child): {firstTry, assisted, borrowErr}.
     firstTry false means the warm nudge fired; assisted means the second
     miss brought the scaffold in to solve it together. Only first-try
     correct counts toward windows: retries and assisted solves are misses
     for gating, though the sale always completes for her. */
  function submitResult(p, res) {
    if (p.entry === 'drawer') {
      state.drawer.n++;
      if (res.firstTry) state.drawer.ok++;
      bumpDay();
      persist(state);
      return [];
    }
    const t = state.tiers[p.tier];
    t.seq++;
    t.hist.push({
      q: t.seq,
      ok: res.firstTry ? 1 : 0,
      a: res.assisted ? 1 : 0,
      be: res.borrowErr ? 1 : 0,
      st: t.stage,
      d: state.day
    });
    if (t.hist.length > 60) t.hist.shift();
    /* The per-fact record runs ALONGSIDE the tier history, never instead of
       it. The tier owns the aisle gates and the column scaffold; the fact
       owns the shopping steer and the parent grid. Both fade and regress
       SILENTLY here: a fade toast per fact would fire constantly across 72 of
       them, and a regress must never be announced (no-fail rule). */
    if (p.fact) {
      const r = factRec(p.fact);
      r.n++;
      if (res.firstTry) {
        r.ok++; r.run++; r.lastOk = true;
        if (r.run >= TUNING.bridgeRun && r.bridge < 2) { r.bridge++; r.run = 0; }
      } else {
        r.miss++; r.run = 0; r.lastOk = false;
        if (r.bridge > 0) r.bridge--;
      }
    }
    bumpDay();
    const events = [];
    if (SCAFFOLDED.has(p.tier)) {
      const since = t.hist.filter(e => e.q > t.mark);
      const r6 = since.slice(-TUNING.regressWindow);
      if (t.stage > 0 && r6.filter(e => !e.ok).length >= TUNING.regressMisses) {
        t.stage--;
        t.mark = t.seq;
        events.push({ type: 'regress', tier: p.tier, stage: t.stage });
      } else if (t.stage < 2) {
        const r8 = since.slice(-TUNING.fadeWindow);
        if (r8.length >= TUNING.fadeWindow
            && r8.filter(e => e.ok).length >= TUNING.fadeNeed) {
          t.stage++;
          t.mark = t.seq;
          events.push({ type: 'fade', tier: p.tier, stage: t.stage });
        }
      }
    }
    if (!t.mastered) {
      /* Mastery evidence must be unscaffolded: for column tiers only
         stage-2 entries count toward the gate, so an aisle can never open
         on solves the column helped with (Goal 2 is borrowing WITHOUT the
         scaffold). */
      const pool = t.stage === null ? t.hist : t.hist.filter(e => e.st === 2);
      const faded = t.stage === null || t.stage === 2;
      const w = pool.slice(-TUNING.gateWindow);
      if (faded && pool.length >= TUNING.gateWindow
          && w.filter(e => e.ok).length >= TUNING.gateNeed) {
        t.mastered = true;
        events.push({ type: 'master', tier: p.tier });
        for (let i = 1; i < AISLES.length; i++) {
          const a = AISLES[i];
          if (!state.aisles.includes(a.id)
              && state.aisles.includes(AISLES[i - 1].id)
              && a.needs.every(x => state.tiers[x].mastered)) {
            state.aisles.push(a.id);
            events.push({ type: 'unlock', aisle: a.id });
          }
        }
      }
    }
    persist(state);
    return events;
  }

  function stats() {
    const byTier = {};
    for (const tier of TIERS) {
      const t = state.tiers[tier];
      const w = t.hist.slice(-TUNING.gateWindow);
      byTier[tier] = {
        attempts: t.seq,
        acc: w.length ? w.filter(e => e.ok).length / w.length : null,
        stage: t.stage,
        mastered: t.mastered
      };
    }
    return {
      wallet: state.wallet,
      aisles: state.aisles.slice(),
      byTier,
      perDay: { ...state.days },
      drawer: { ...state.drawer }
    };
  }

  /* The 72-fact picture, for the parent panel.

     The bands are named for what THIS game can observe. There are no clocks
     here, so "automatic" means unaided and holding: the fact has stopped
     slipping and a run of first-try corrects stands behind it. It does not
     mean "under two seconds". Timed retrieval is the drill app's measurement,
     and putting a stopwatch on a young player buying a mango is exactly the
     pressure this game exists without. */
  function factStats() {
    const rows = FACTS.map(k => {
      const dash = k.indexOf('-');
      const r = state.facts[k] || null;
      let band = 'unseen';
      if (r && r.n > 0) {
        if (!r.lastOk || r.ok === 0) band = 'counting';
        else if (r.bridge >= 2 && r.run >= TUNING.bridgeRun) band = 'automatic';
        else band = 'consolidating';
      }
      return {
        key: k, m: +k.slice(0, dash), s: +k.slice(dash + 1),
        crossing: +k.slice(0, dash) > 10, band,
        n: r ? r.n : 0, ok: r ? r.ok : 0, miss: r ? r.miss : 0,
        run: r ? r.run : 0, bridge: r ? r.bridge : 0
      };
    });
    return {
      rows,
      green: rows.filter(x => x.band === 'automatic').length,
      seen: rows.filter(x => x.band !== 'unseen').length,
      total: FACTS.length
    };
  }

  return {
    state, frontier, unlockedAisles, canAfford, pay, earn, beginSession,
    shoppingList, purchaseProblem, standVisits, standOrder, submitResult,
    stats, factStats
  };
}
