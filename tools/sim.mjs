/* Mango Market Phase 2 simulation harness.
   Scripted child models play 60 sessions through the real engine; the run
   fails unless every assertion holds: no starvation, gates open in order,
   scaffold fades and regresses, split rule never violated, saves round-trip.

   node tools/sim.mjs [--seed N] [--sessions N] [--seeds N] [--verbose] */

import {
  createEngine, TIERS, AISLES, TUNING, classify, borrowCount, seededRng
} from '../js/engine.js';
import { defaultSave, setBackend, saveSave, loadSave } from '../js/save.js';
import { CUSTOMERS } from '../js/data/customers.js';

const args = process.argv.slice(2);
function argNum(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
}
const BASE_SEED = argNum('--seed', 20260802);
const SESSIONS = argNum('--sessions', 60);
const SEED_COUNT = argNum('--seeds', 5);
const VERBOSE = args.includes('--verbose');

const tierIdx = t => TIERS.indexOf(t);

/* Child models. Skill is per tier: p(first try) climbs with attempts at
   that tier. Borrow problems carry an extra penalty that decays with
   practice; the column scaffold boosts stage 0 strongly, stage 1 half. */
const PROFILES = {
  accurate:   { start: 0.80, learn: 0.010, cap: 0.97, borrowPenalty: 0.15, scaffoldBoost: 0.13 },
  errorProne: { start: 0.60, learn: 0.008, cap: 0.93, borrowPenalty: 0.25, scaffoldBoost: 0.16 }
};

function makeChild(profile, rng) {
  const attempts = Object.fromEntries(TIERS.map(t => [t, 0]));
  let mult = 1;
  function answer(p) {
    if (p.entry === 'drawer') return { firstTry: rng() < 0.95 };
    attempts[p.tier]++;
    let prob = Math.min(profile.cap, profile.start + profile.learn * attempts[p.tier]);
    const borrows = borrowCount(p.m, p.s);
    if (borrows) prob -= profile.borrowPenalty / (1 + attempts[p.tier] / 25);
    if (p.entry === 'column') {
      prob += p.stage === 0 ? profile.scaffoldBoost : profile.scaffoldBoost / 2;
    }
    prob = Math.max(0.03, Math.min(0.99, prob * mult));
    if (rng() < prob) return { firstTry: true };
    const retry = rng() < Math.min(0.95, prob + 0.15);
    return { firstTry: false, assisted: !retry, borrowErr: borrows > 0 && rng() < 0.7 };
  }
  return { answer, setMult: v => { mult = v; } };
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/* One full run. opts: {seed, sessions, profile, badDays, swapAt}.
   badDays waits for two_borrow to reach stage >= 1, then injects 4 rough
   sessions to force a regress, then lets recovery happen.
   swapAt >= 0 round-trips the state through save.js at that session and
   continues on a rebuilt engine; the log must match a plain run exactly. */
function run(opts) {
  const rng = seededRng(opts.seed);
  let engine = createEngine({ state: defaultSave(), rng, persist: () => {} });
  const child = makeChild(PROFILES[opts.profile], rng);
  const log = [];
  const audit = {
    errors: [], perSession: [], walletMin: Infinity, unlocks: [],
    stageEvents: { two_borrow: [], three: [] },
    mirror: Object.fromEntries(TIERS.map(t => [t, []])),
    shadow: {
      two_borrow: { stage: 0, mark: 0, list: [] },
      three: { stage: 0, mark: 0, list: [] }
    },
    totalSubmits: 0, drawerSubmits: 0,
    mech: { walletElig: 0, walletUsed: 0, cashierElig: 0, cashierUsed: 0 },
    review: { afterUnlock: 0, reviewAfterUnlock: 0 },
    badWindow: null
  };
  let badStart = -1;

  const err = (sess, msg) => {
    if (audit.errors.length < 12) audit.errors.push(`s${sess}: ${msg}`);
    else audit.errors.length === 12 && audit.errors.push('...more');
  };

  function checkProblem(p, f, sess) {
    const fields = [p.m, p.s, p.answer];
    if (!fields.every(Number.isInteger)) err(sess, `non-integer problem ${JSON.stringify(p)}`);
    if (p.answer !== p.m - p.s) err(sess, `bad answer ${p.m}-${p.s}=${p.answer}`);
    if (p.answer < 0 || p.s < 1) err(sess, `bad range ${p.m}-${p.s}`);
    if (classify(p.m, p.s) !== p.tier) err(sess, `tier mismatch ${p.m}-${p.s} tagged ${p.tier}`);
    if (p.money !== (p.m >= TUNING.moneyMin)) err(sess, `split rule money flag ${p.m}`);
    if (p.entry === 'drawer' && p.m < TUNING.moneyMin) err(sess, `drawer below $${TUNING.moneyMin}`);
    if (p.entry === 'column') {
      if (!['two_borrow', 'three'].includes(p.tier)) err(sess, `column on ${p.tier}`);
      if (p.stage >= 2) err(sess, `column at stage ${p.stage}`);
    }
    if (['single', 'teens', 'two_easy'].includes(p.tier) && p.entry === 'column') {
      err(sess, `small tier ${p.tier} saw the column`);
    }
    if (p.entry !== 'drawer' && tierIdx(p.tier) > f.maxTier) {
      err(sess, `tier ${p.tier} above frontier`);
    }
    if (p.m > 999) err(sess, `minuend ${p.m} above the $999 contract`);
    if (p.mechanic === 'cashier') {
      if (!p.elig.cashier) err(sess, 'cashier without eligibility');
      if (!p.review) err(sess, 'cashier not marked review');
      if (p.offered < 0) err(sess, 'negative cashier offer');
      if (p.offeredWrong === (p.offered === p.answer)) err(sess, 'cashier offer flag wrong');
    }
    if (p.mechanic === 'wallet' && !p.elig.wallet) err(sess, 'wallet without eligibility');
  }

  function record(kind, sess, p, res, events) {
    audit.totalSubmits++;
    if (p.entry === 'drawer') {
      audit.drawerSubmits++;
    } else {
      audit.mirror[p.tier].push({ ok: res.firstTry ? 1 : 0, st: p.stage });
    }
    /* Independent shadow of the fade/regress rules: recompute what the
       engine SHOULD emit for this submit from the sim's own bookkeeping,
       then demand the engine emitted exactly that. */
    if (p.entry !== 'drawer' && audit.shadow[p.tier]) {
      const sh = audit.shadow[p.tier];
      if (sh.stage !== p.stage) err(sess, `${p.tier} shadow stage ${sh.stage} vs engine ${p.stage}`);
      sh.list.push(res.firstTry ? 1 : 0);
      const since = sh.list.slice(sh.mark);
      const r6 = since.slice(-TUNING.regressWindow);
      const rf = since.slice(-TUNING.fadeWindow);
      let expect = null;
      if (sh.stage > 0 && r6.filter(x => !x).length >= TUNING.regressMisses) expect = 'regress';
      else if (sh.stage < 2 && since.length >= TUNING.fadeWindow
          && rf.filter(x => x).length >= TUNING.fadeNeed) expect = 'fade';
      const got = events.find(e => e.tier === p.tier
        && (e.type === 'fade' || e.type === 'regress')) || null;
      if ((expect || 'none') !== (got ? got.type : 'none')) {
        err(sess, `${p.tier} shadow expected ${expect || 'nothing'}, engine emitted ${got ? got.type : 'nothing'}`);
      }
      if (got) { sh.stage = got.stage; sh.mark = sh.list.length; }
      else if (expect) { sh.stage += expect === 'fade' ? 1 : -1; sh.mark = sh.list.length; }
    }
    for (const e of events) {
      if (e.type === 'unlock') audit.unlocks.push({ sess, aisle: e.aisle });
      if (e.type === 'fade' || e.type === 'regress') {
        audit.stageEvents[e.tier].push({ sess, type: e.type, stage: e.stage });
      }
      if (e.type === 'master') {
        const scaffolded = e.tier === 'two_borrow' || e.tier === 'three';
        const mir = audit.mirror[e.tier];
        const pool = scaffolded ? mir.filter(x => x.st === 2) : mir;
        if (pool.length < TUNING.gateWindow) {
          err(sess, `${e.tier} mastered on ${pool.length} unscaffolded attempts`);
        }
        const okN = pool.slice(-TUNING.gateWindow).filter(x => x.ok).length;
        if (okN < TUNING.gateNeed) err(sess, `${e.tier} mastered at ${okN}/${TUNING.gateWindow}`);
        const st = engine.state.tiers[e.tier].stage;
        if (st !== null && st !== 2) err(sess, `${e.tier} mastered at stage ${st}`);
      }
    }
    log.push([kind, sess, p.tier, p.m, p.s, p.mechanic, p.entry, p.money ? 1 : 0,
      res.firstTry ? 1 : 0, res.assisted ? 1 : 0,
      events.map(e => `${e.type}:${e.tier || e.aisle}:${e.stage ?? ''}`).join('|')].join(','));
  }

  for (let sess = 0; sess < opts.sessions; sess++) {
    if (opts.badDays && badStart < 0 && engine.state.tiers.two_borrow.stage >= 1) {
      badStart = sess + 1;
      audit.badWindow = [badStart, badStart + 3];
    }
    child.setMult(badStart >= 0 && sess >= badStart && sess <= badStart + 3 ? 0.4 : 1);

    engine.beginSession(sess);
    let problems = 0, purchases = 0;

    for (const item of engine.shoppingList()) {
      if (!engine.canAfford(item.price)) continue;
      const f = engine.frontier();
      const p = engine.purchaseProblem(item);
      checkProblem(p, f, sess);
      if (p.elig.wallet) audit.mech.walletElig++;
      if (p.mechanic === 'wallet') audit.mech.walletUsed++;
      if (p.elig.cashier) audit.mech.cashierElig++;
      if (p.mechanic === 'cashier') audit.mech.cashierUsed++;
      if (audit.unlocks.length) {
        audit.review.afterUnlock++;
        if (p.review) audit.review.reviewAfterUnlock++;
      }
      const res = child.answer(p);
      const events = engine.submitResult(p, res);
      engine.pay(item.price);
      record('buy', sess, p, res, events);
      problems++;
      purchases++;
    }

    const stands = engine.standVisits();
    for (let i = 0; i < stands; i++) {
      const f = engine.frontier();
      const o = engine.standOrder();
      if (o.problem) {
        checkProblem(o.problem, f, sess);
        if (audit.unlocks.length && o.problem.entry !== 'drawer') {
          audit.review.afterUnlock++;
          if (o.problem.review) audit.review.reviewAfterUnlock++;
        }
        const res = child.answer(o.problem);
        const events = engine.submitResult(o.problem, res);
        record('stand', sess, o.problem, res, events);
        problems++;
      }
      engine.earn(o.total);
    }

    audit.perSession.push({ sess, problems, purchases, wallet: engine.state.wallet });
    if (engine.state.wallet < audit.walletMin) audit.walletMin = engine.state.wallet;

    /* Swap legs rebuild the engine from a save.js round trip after EVERY
       session, so any state that fails to serialize, or lives in the engine
       closure instead of the save, diverges the behavior hash. */
    if (opts.swap) {
      setBackend();
      saveSave(engine.state);
      const revived = loadSave();
      if (JSON.stringify(revived) !== JSON.stringify(engine.state)) {
        err(sess, 'save round trip diverged');
      }
      engine = createEngine({ state: revived, rng, persist: () => {} });
    }
  }

  audit.hash = hash(log.join('\n'));
  audit.finalStats = engine.stats();
  audit.state = engine.state;
  return audit;
}

/* Assertions. Each returns null on pass or a failure message. */
function checks(profile, a, sessions) {
  const order = ['bakery', 'toys', 'electronics', 'home'];
  const seq = a.unlocks.map(u => u.aisle);
  const scaffoldTiers = ['two_borrow', 'three'];
  const smallTiers = ['single', 'teens', 'two_easy'];
  const list = [];
  const add = (name, fail) => list.push({ name, fail: fail || null });

  add('problem invariants', a.errors.length ? a.errors.join(' | ') : null);
  add('gate order', seq.every((x, i) => x === order[i]) ? null : `unlocked ${seq.join(',')}`);
  add('wallet never negative', a.walletMin >= 0 ? null : `wallet hit ${a.walletMin}`);

  const starved = a.perSession.filter(s => s.problems < 2);
  add('no starvation (>=2 problems every session)',
    starved.length ? `${starved.length} sessions starved, first s${starved[0].sess}` : null);
  const avg = a.perSession.reduce((x, s) => x + s.problems, 0) / a.perSession.length;
  add('healthy volume (avg >= 5 problems)', avg >= 5 ? null : `avg ${avg.toFixed(1)}`);
  const buyShare = a.perSession.filter(s => s.purchases > 0).length / a.perSession.length;
  add('store stays usable (purchases in >=60% of sessions)',
    buyShare >= 0.6 ? null : `${(buyShare * 100).toFixed(0)}%`);

  for (const t of scaffoldTiers) {
    const ev = a.stageEvents[t];
    let stage = 0, bad = null;
    for (const e of ev) {
      const want = e.type === 'fade' ? stage + 1 : stage - 1;
      if (e.stage !== want || e.stage < 0 || e.stage > 2) bad = `${t} ${e.type} to ${e.stage} from ${stage}`;
      stage = e.stage;
    }
    add(`${t} stage moves are single steps`, bad);
  }
  for (const t of smallTiers) {
    add(`${t} never scaffolded`,
      a.state.tiers[t].stage === null ? null : `stage ${a.state.tiers[t].stage}`);
  }

  if (a.review.afterUnlock > 30) {
    const share = a.review.reviewAfterUnlock / a.review.afterUnlock;
    add('review keeps flowing (>=10% below frontier)',
      share >= 0.10 ? null : `${(share * 100).toFixed(0)}%`);
  }
  /* Calibration guards, not precision tests: at these sample sizes the
     bands sit past 3 sigma, so they trip on selector bugs (band overlap,
     eligibility leaks), never on seed luck. */
  if (a.mech.walletElig > 120) {
    const share = a.mech.walletUsed / a.mech.walletElig;
    add('wallet mechanic ~1 in 4 when eligible',
      share >= 0.12 && share <= 0.40 ? null : `${(share * 100).toFixed(0)}%`);
  }
  if (a.mech.cashierElig > 120) {
    const share = a.mech.cashierUsed / a.mech.cashierElig;
    add('cashier mechanic ~1 in 4-5 when eligible',
      share >= 0.10 && share <= 0.36 ? null : `${(share * 100).toFixed(0)}%`);
  }

  const sums = Object.values(a.finalStats.perDay).reduce((x, y) => x + y, 0);
  add('parent panel day counts match submits',
    sums === a.totalSubmits ? null : `${sums} vs ${a.totalSubmits}`);
  const drawerHist = Object.values(a.state.tiers).reduce((x, t) => x + t.seq, 0);
  add('drawer stays out of tier history',
    drawerHist === a.totalSubmits - a.drawerSubmits
      ? null : `${drawerHist} tier entries vs ${a.totalSubmits - a.drawerSubmits} keypad submits`);

  if (profile === 'accurate') {
    add('accurate child unlocks every aisle in 60 sessions',
      seq.length === 4 ? null : `only ${seq.join(',') || 'none'}`);
    for (const t of scaffoldTiers) {
      /* A post-mastery wobble can bring the column back near the end of the
         run; what must hold is that the scaffold fully faded at some point. */
      const reached = a.state.tiers[t].stage === 2
        || a.stageEvents[t].some(e => e.type === 'fade' && e.stage === 2);
      add(`accurate child fully fades ${t}`,
        reached ? null : `stage ${a.state.tiers[t].stage}`);
    }
  }
  if (profile === 'errorProne') {
    add('error-prone child still reaches toys',
      seq.includes('toys') ? null : `unlocked ${seq.join(',') || 'none'}`);
    const reg = a.stageEvents.two_borrow.filter(e => e.type === 'regress');
    add('bad week forces a scaffold regress', reg.length >= 1
      ? null : `no regress (bad window ${JSON.stringify(a.badWindow)})`);
    if (reg.length) {
      /* A regress right at the end of the run legitimately has no time left
         to recover; what must hold is that recovery happens at all. */
      const recovered = reg.some(r =>
        a.stageEvents.two_borrow.some(e => e.type === 'fade' && e.sess > r.sess));
      add('scaffold fades again after a regress', recovered ? null : 'no fade after any regress');
    }
  }
  return list;
}

/* Report helpers */
function summarize(profile, seed, a) {
  const st = a.finalStats;
  const un = Object.fromEntries(a.unlocks.map(u => [u.aisle, u.sess]));
  const tierLine = TIERS.map(t => {
    const b = st.byTier[t];
    const acc = b.acc === null ? ' -' : String(Math.round(b.acc * 100)).padStart(2);
    const stg = b.stage === null ? '-' : b.stage;
    return `${t}:${b.attempts}a/${acc}%/s${stg}${b.mastered ? '*' : ''}`;
  }).join('  ');
  console.log(`  [${profile} seed ${seed}] wallet $${st.wallet}  drawer ${st.drawer.ok}/${st.drawer.n}`);
  console.log(`    unlocks: ${['bakery', 'toys', 'electronics', 'home']
    .map(x => `${x}@${un[x] ?? '-'}`).join('  ')}`);
  console.log(`    tiers:   ${tierLine}`);
  if (a.badWindow) console.log(`    bad week: sessions ${a.badWindow[0]}-${a.badWindow[1]}`);
}

let failures = 0;
const seeds = Array.from({ length: SEED_COUNT }, (_, i) => BASE_SEED + i);

/* Rich-wallet probe: a hoarded wallet at the electronics frontier must
   never produce a minuend past $999 or hand the wallet mechanic a
   four-digit balance. */
function probeRichWallet(seed) {
  const rng = seededRng(seed ^ 0x5EED);
  const st = defaultSave();
  st.aisles = ['produce', 'bakery', 'toys', 'electronics'];
  for (const t of ['single', 'teens', 'two_easy', 'two_borrow']) st.tiers[t].mastered = true;
  st.tiers.two_borrow.stage = 2;
  const engine = createEngine({ state: st, rng, persist: () => {} });
  const bad = [];
  for (const wallet of [1000, 1049, 1500, 2500, 9999]) {
    for (let i = 0; i < 200; i++) {
      st.wallet = wallet;
      const aisle = ['produce', 'bakery', 'toys', 'electronics'][i % 4];
      const gen = { produce: [2, 9], bakery: [10, 18], toys: [20, 98], electronics: [100, 940] }[aisle];
      const price = gen[0] + Math.floor(rng() * (gen[1] - gen[0] + 1));
      const p = engine.purchaseProblem({ aisle, price });
      if (p.m > 999) bad.push(`wallet ${wallet}: ${p.mechanic} minuend ${p.m}`);
      if (p.mechanic === 'wallet' && wallet > 999) bad.push(`wallet mechanic fired at $${wallet}`);
      if (classify(p.m, p.s) !== p.tier) bad.push(`tier mismatch at wallet ${wallet}`);
    }
  }
  return bad;
}

/* Trait probe (Phase 4, hardened after the Phase 4 review): the contract
   is enforced against the REAL roster in js/data/customers.js, not
   literals, so editing a trait cannot ship green. A forced tender must be
   an actual big bill ($50/$100) and always lands in the drawer (never tier
   history); exact never produces a problem at all. One drawer submit per
   frontier proves drawer results stay out of the tier evidence stream. */
function probeStandTraits(seed) {
  const bad = [];
  const traited = CUSTOMERS.filter(c => c.trait);
  if (!traited.some(c => c.trait.tender)) bad.push('roster lost its big-bill regulars');
  if (!traited.some(c => c.trait.exact)) bad.push('roster lost its exact payer');
  for (const c of traited) {
    if (c.trait.tender !== undefined && c.trait.tender !== 50 && c.trait.tender !== 100) {
      bad.push(`${c.id} forces tender $${c.trait.tender}, not a real big bill`);
    }
  }
  const setups = [
    ['produce'],
    ['produce', 'bakery'],
    ['produce', 'bakery', 'toys'],
    ['produce', 'bakery', 'toys', 'electronics']
  ];
  for (const aisles of setups) {
    const rng = seededRng(seed ^ 0x7A17);
    const st = defaultSave();
    st.aisles = aisles.slice();
    const engine = createEngine({ state: st, rng, persist: () => {} });
    for (let i = 0; i < 200; i++) {
      for (const c of traited) {
        const o = engine.standOrder(c.trait);
        if (c.trait.tender) {
          const tender = c.trait.tender;
          if (!o.problem) { bad.push(`${c.id} forced $${tender} produced no problem`); continue; }
          if (o.problem.m !== tender) bad.push(`${c.id} forced $${tender} got minuend ${o.problem.m}`);
          if (o.problem.entry !== 'drawer') bad.push(`${c.id} forced $${tender} entry ${o.problem.entry}`);
          if (o.total !== o.cups * o.per) bad.push(`${c.id} total ${o.total} vs ${o.cups}x${o.per}`);
          if (o.total >= tender) bad.push(`${c.id} forced $${tender} total ${o.total} too big`);
        } else if (c.trait.exact) {
          if (o.problem !== null) bad.push(`exact payer ${c.id} produced a problem`);
          if (o.tender !== o.total) bad.push(`${c.id} exact tender ${o.tender} vs total ${o.total}`);
        }
      }
    }
    /* A completed drawer sale must move state.drawer and nothing else. */
    const drawerBefore = st.drawer.n;
    const o = engine.standOrder({ tender: 100 });
    engine.submitResult(o.problem, { firstTry: true });
    if (st.drawer.n !== drawerBefore + 1) bad.push('drawer submit did not record to state.drawer');
    const tierEntries = Object.values(st.tiers).reduce((x, t) => x + t.seq, 0);
    if (tierEntries !== 0) bad.push(`trait probe touched tier history (${tierEntries})`);
  }
  return [...new Set(bad)];
}

for (const seed of seeds) {
  console.log(`\nseed ${seed}, ${SESSIONS} sessions`);
  const hashes = {};
  for (const profile of ['accurate', 'errorProne']) {
    const a = run({ seed, sessions: SESSIONS, profile, badDays: profile === 'errorProne', swap: false });
    hashes[profile] = a.hash;
    summarize(profile, seed, a);
    for (const c of checks(profile, a, SESSIONS)) {
      if (c.fail) {
        failures++;
        console.log(`    FAIL ${c.name}: ${c.fail}`);
      } else if (VERBOSE) {
        console.log(`    pass ${c.name}`);
      }
    }
  }

  const again = run({ seed, sessions: SESSIONS, profile: 'accurate', badDays: false, swap: false });
  if (again.hash !== hashes.accurate) {
    failures++;
    console.log(`  FAIL determinism: ${again.hash} vs ${hashes.accurate}`);
  }
  for (const profile of ['accurate', 'errorProne']) {
    const swapped = run({ seed, sessions: SESSIONS, profile, badDays: profile === 'errorProne', swap: true });
    if (swapped.hash !== hashes[profile]) {
      failures++;
      console.log(`  FAIL save round trip changes ${profile} behavior: ${swapped.hash} vs ${hashes[profile]}`);
    }
    const fid = swapped.errors.find(e => e.includes('round trip'));
    if (fid) {
      failures++;
      console.log(`  FAIL save state fidelity (${profile}): ${fid}`);
    }
  }

  const rich = probeRichWallet(seed);
  if (rich.length) {
    failures++;
    console.log(`  FAIL rich wallet probe: ${rich.slice(0, 3).join(' | ')}`);
  }

  const traits = probeStandTraits(seed);
  if (traits.length) {
    failures++;
    console.log(`  FAIL stand trait probe: ${traits.slice(0, 3).join(' | ')}`);
  }
}

console.log(failures
  ? `\n${failures} FAILURES across ${seeds.length} seeds`
  : `\nALL CHECKS PASS across ${seeds.length} seeds x 2 profiles, ${SESSIONS} sessions each`);
process.exit(failures ? 1 : 0);
