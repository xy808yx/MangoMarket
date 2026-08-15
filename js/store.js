/* Mango Market store mode. Owns the session flow: trips (shopping-list
   quests), aisle browsing, the four buy mechanics rotating, entry (keypad
   or column per the engine's split rule), the no-fail retry ladder, and
   the wallet/wishlist HUD.

   Pedagogy contract (SPEC.md, CLAUDE.md rules): the engine decides entry
   mode, money visuals and mechanics; this file must never override
   problem.entry or problem.money. Wrong answer: warm nudge and retry, then
   the scaffold solves it WITH her and the sale always completes. The UI
   owns submit-once semantics (problems carry no id). */

import { createEngine, AISLES, columns, diagnose } from './engine.js';
import { loadSave, saveSave, wipe, store as kvStore, load as kvLoad } from './save.js';
import {
  BY_ID, RARES, itemsForAisle, shelfPrice, rareStock, dailyDeal
} from './data/items.js';
import { createWorld } from './world.js';
import { createStand } from './stand.js';
import { createRoom, placeInRoom } from './room.js';
import { createGrocery } from './grocery.js';
import { BOARDS } from './boards.js';
import {
  openZones, nextZone, ZONE_INFO, STAND_SESSIONS_TO_OPEN
} from './zones.js';
import {
  makeKeypad, makeColumn, receipt, bridge, bridgeTeachable, toast, confetti
} from './ui.js';
import { initSfx, play } from './sfx.js';

/* Shelf headers are the only text naming a shelf, she reads them on every
   trip and again in her book, and two of them were teaching wrong category
   words: "Fruits" stocks Salmon, Broccoli and Corn and is the FIRST category
   word the game ever teaches, and "Bakery" stocks Dim Sum, Pizza, Hot Pot and
   Ice Cream. "Home" also collided with her own house. The engine keys
   (produce / bakery / electronics / home) are untouched. */
const AISLE_NAMES = {
  produce: 'Fresh Food', bakery: 'Snacks and Treats', toys: 'Toys',
  electronics: 'Gadgets', home: 'Room Things'
};

/* Food aisles live INSIDE the grocery store since the town-loop world
   (Aug 3 2026); the other three are outdoor stands in the shops zone. */
const INDOOR = ['produce', 'bakery'];

const NUDGES = ['Hmm, try again!', 'So close! One more try!', 'Almost! Look again.'];

const $ = id => document.getElementById(id);

/* Hint slots, rendered as part of the body so a new phase clears them and the
   nodes exist before makeColumn runs (its first borrow mark fires inside its
   own constructor). Full card width, BELOW the entry row. The key-naming hint
   used to be appended into the keypad host, which makeKeypad turns into a grid
   of three 76px columns, so the hint became a thirteenth key: 76px wide, 129px
   tall, one word per line. Mirrors stand.js exactly. */
const HINTS = '<div class="assist-hint" id="colHint"></div>'
  + '<div class="assist-hint" id="keyHint"></div>';

const setHint = (id, text) => { const el = $(id); if (el) el.textContent = text; };

export function initGame() {
  const state = loadSave();
  const engine = createEngine({ state, persist: saveSave });
  /* ?day=N overrides the calendar for testing the date-seeded freshness
     (rare stock, daily deal). Installed PWAs never carry a query string. */
  const dayParam = new URLSearchParams(location.search).get('day');
  /* Local-midnight to local-midnight, rounded: an elapsed-ms floor from the
     Jan 1 epoch drifts one hour across the DST shift, so the day number
     lagged the calendar between 00:00 and 01:00 all summer (mislabeling the
     parent panel's week and rolling trips an hour late). */
  const now0 = new Date();
  const day = dayParam !== null && Number.isInteger(Number(dayParam)) && Number(dayParam) >= 0
    ? Number(dayParam)
    : Math.round((new Date(now0.getFullYear(), now0.getMonth(), now0.getDate()).getTime()
        - new Date(2026, 0, 1).getTime()) / 86400000);
  engine.beginSession(day);

  /* Freshness (Phase 5): both are pure functions of the day and the aisles
     open at boot. An aisle unlocked mid-session joins the rotation at the
     next boot; the shelf never reshuffles under her. */
  const rare = rareStock(day, state.aisles);
  const deal = dailyDeal(day, state.aisles);

  /* Evening mode (Phase 6): the same world under the Lantern Dusk lights
     locked at the style gate. Picked once at boot by the clock (evenings
     and early mornings), ?mode=day|evening overrides for testing. Installed
     PWAs carry no query string, so the override is dev-only like ?season. */
  const modeParam = new URLSearchParams(location.search).get('mode');
  const hour = new Date().getHours();
  const evening = modeParam ? modeParam === 'evening' : (hour >= 18 || hour < 7);
  const PAL = evening ? BOARDS.c : BOARDS.b;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = '#' + PAL.sky.toString(16).padStart(6, '0').toUpperCase();
  initSfx({ mode: evening ? 'evening' : 'day' });

  const world = createWorld({
    canvas: $('world'),
    palette: PAL,
    itemsById: BY_ID,
    onTapAisle: tapAisle,
    onTapStall: tapStall,
    onTapHouse: tapHouse,
    onTapGrocery: tapGrocery,
    onTapGround: tapGround
  });
  for (const a of AISLES) {
    world.setAisleOpen(a.id, state.aisles.includes(a.id), false);
  }

  /* Town zones (Aug 4 2026). The map is fenced into chunks she earns; a
     fresh save can reach nothing but her lemonade stand. Applied AFTER
     setAisleOpen on purpose: barriers are derived from the finished
     collision grid, and an already-open shop clears its tarp row. */
  let zonesOpen = openZones(state);
  world.setZones(zonesOpen);

  /* Seasonal skin by calendar month; ?season=winter overrides for testing.
     August is summer, which is exactly the locked Juicy Pop look. */
  const month = new Date().getMonth();
  const season = new URLSearchParams(location.search).get('season')
    || (month === 11 || month <= 1 ? 'winter'
      : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'fall');
  world.setSeason(season);

  /* ---- her room (Phase 5) ---- */
  const room = createRoom({
    canvas: $('world'),
    renderer: world.renderer,
    palette: PAL,
    state,
    itemsById: BY_ID,
    persist: saveSave,
    onWallpaper: id => {
      play('chime');
      toast(id ? `${BY_ID[id].name} looks great!` : 'Back to plain walls!');
    }
  });

  function tapHouse() {
    if (mode !== 'plaza') return;
    /* A tap is never met with silence. Her house is a landmark she can see
       and walk right up to from the ring road for many sessions before the
       home zone is hers, and the raycast consumes the tap, so without these
       words the building was deader than the empty grass beside it (which
       already answers, via tapGround). Same sentence as tapGround's generic
       branch so the two cannot tell her different unlock stories. Gating the
       sparkle removed the false promise; this removes the silence. */
    if (!zonesOpen.has('home')) {
      toast('Not open yet! Keep playing and it will open.', 3000);
      return;
    }
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    mode = 'walking';
    const hs = world.houseSpot();
    world.hopTo(hs.x, hs.z, () => {
      mode = 'room';
      world.setTapsEnabled(false);
      room.enter();
      $('roomExit').classList.remove('hidden');
    });
  }

  function exitRoom() {
    if (mode !== 'room') return;
    room.exit();
    world.setTapsEnabled(true);
    world.resize();
    $('roomExit').classList.add('hidden');
    mode = 'plaza';
    /* Back on the doorstep, camera snapped to the house zone: no cross-map
       glide after an interior. */
    const hs = world.houseSpot();
    world.placeAvatar(hs.x, hs.z);
    world.hopTo(hs.x + 0.9, hs.z + 0.9, () => {});
  }
  $('roomExit').addEventListener('click', exitRoom);

  /* ---- the grocery store (world expansion): produce and bakery live in a
     walk-in interior scene; the exterior is the north-zone landmark. ---- */
  const grocery = createGrocery({
    canvas: $('world'),
    renderer: world.renderer,
    palette: PAL,
    state,
    itemsById: BY_ID,
    onTapAisle: tapIndoorAisle,
    canMove: () => mode === 'grocery'
  });
  let inGrocery = false;

  function enterGrocery(then) {
    mode = 'grocery';
    inGrocery = true;
    world.setTapsEnabled(false);
    grocery.enter({ goldToday: !!(rare && rare.itemId === 'goldmango') });
    $('groceryExit').classList.remove('hidden');
    if (then) then();
  }

  function leaveGrocery() {
    inGrocery = false;
    grocery.exit();
    world.setTapsEnabled(true);
    world.resize();
    $('groceryExit').classList.add('hidden');
    mode = 'plaza';
    const gs = world.grocerySpot();
    world.placeAvatar(gs.x, gs.z);
  }

  function tapGrocery() {
    if (mode !== 'plaza' || !zonesOpen.has('road')) return;
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    mode = 'walking';
    const gs = world.grocerySpot();
    world.hopTo(gs.x, gs.z, () => enterGrocery());
  }
  $('groceryExit').addEventListener('click', () => {
    if (mode !== 'grocery') return;
    leaveGrocery();
    /* Only ever reached by her tapping Exit, never by an auto-flow, so the
       walk lesson lands with the world under her finger. Do not hang it off
       leaveGrocery() or closeShelf(): both are called from goRow, celebrate,
       the unlock card and the wishlist, where it would fire mid-auto-walk
       and under confetti. */
    firstHint('hintWalk', 'Tap the ground to walk anywhere you like!');
  });

  /* Gondola, cooler and display taps inside the store. The locked-aisle
     wobble matches the outdoor stands. */
  function tapIndoorAisle(id) {
    if (mode !== 'grocery') return;
    /* Same contract as every outdoor tap path: tapping the world dismisses
       list panels, so nothing stale stacks under the shelf. */
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    if (!state.aisles.includes(id)) {
      grocery.wobble(id);
      toast('Not open yet! Keep playing and it will open!');
      return;
    }
    openShelf(id);
  }

  /* Free walking: any ground tap while browsing strolls the bunny there;
     the zone camera follows on its own. */
  function tapGround(x, z) {
    if (mode !== 'plaza') return;
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    /* She found the walk verb herself: no need to ever toast it. */
    if (!kvLoad('hintWalk', 0)) kvStore('hintWalk', 1);
    /* A tap past a fence still walks her to it: arriving at the hedge is
       the clearest possible answer to "can I go there". The words say why,
       and name the one thing that opens the next chunk. */
    const zone = world.zoneAt(x, z);
    if (!world.isZoneOpen(zone)) {
      toast(zone === 'road'
        ? 'Not open yet! Sell lemonade at your stand to open the road.'
        : 'Not open yet! Keep playing and it will open.', 3000);
    }
    world.walkTo(x, z);
  }

  /* ---- lemonade stand (Phase 4) ---- */
  const stand = createStand({
    engine, state, world, hud,
    onEvents: handleEvents,
    /* A completed session is the currency that buys the first chunk of
       town. Counted here, never in the engine: standSessions is a save
       field the engine does not read, so no rng path and no sim hash
       moves. Returns the progress note the summary card shows. */
    onSession: () => {
      state.standSessions = (state.standSessions || 0) + 1;
      saveSave(state);
      return standProgress();
    },
    onExit: () => {
      mode = 'walking';
      world.hopTo(0, 2.4, () => {
        mode = 'plaza';
        /* Celebrate out here, not behind the stand modal: the fence sinking
           into the ground IS the reward, and she has to be looking at the
           town to see it happen. */
        refreshZones();
      });
    }
  });

  /* Tapping the main stall (or Benny) opens the stand: the bunny hops
     behind the counter and the regulars start arriving. */
  function tapStall() {
    if (mode !== 'plaza') return;
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    mode = 'stand';
    const spot = world.standSpot();
    world.hopTo(spot.x, spot.z, () => {
      world.avatar.rotation.y = 0;
      stand.open();
    });
  }

  /* ---- trip (shopping-list quest) ---- */
  /* A future catalog rename must never brick boot: a trip holding an
     unknown itemId regenerates, and unknown wishlist ids are dropped. */
  const validWish = state.wishlist.filter(w => w && BY_ID[w.id]);
  if (validWish.length !== state.wishlist.length) {
    state.wishlist = validWish;
    saveSave(state);
  }
  let trip = kvLoad('trip', null);
  if (!trip || trip.day !== day || !Array.isArray(trip.slots)
      || !trip.slots.every(s => s && BY_ID[s.itemId] && typeof s.price === 'number')) {
    trip = null;
  }
  if (!trip) trip = newTrip();

  function bindItem(aisle, used, stretch) {
    /* Never bind today's deal item to a trip: list prices are fixed for
       the trip and would fight the deal's crossed-out shelf tag. */
    const pool = itemsForAisle(aisle)
      .filter(it => !used.has(it.id) && !(deal && deal.itemId === it.id));
    const tickets = [];
    for (const it of pool) {
      const w = it.hero ? 4 : it.featured ? 3 : it.bg ? 1 : 2;
      for (let k = 0; k < w * (stretch && (it.hero || it.featured) ? 2 : 1); k++) {
        tickets.push(it.id);
      }
    }
    return tickets[Math.floor(Math.random() * tickets.length)];
  }

  function newTrip() {
    const slots = engine.shoppingList();
    const used = new Set();
    const bound = slots.map((s, i) => {
      const itemId = bindItem(s.aisle, used, i === slots.length - 1);
      used.add(itemId);
      return { aisle: s.aisle, price: s.price, itemId, bought: false };
    });
    trip = { day, slots: bound };
    kvStore('trip', trip);
    return trip;
  }

  /* Price shown on the shelf: the trip's price for list items (bought or
     not, so prices never jump mid-trip), the daily price otherwise. */
  function priceFor(itemId) {
    const slot = trip.slots.find(s => s.itemId === itemId);
    return slot ? slot.price : shelfPrice(itemId, day);
  }

  function listSlotFor(itemId) {
    return trip.slots.find(s => s.itemId === itemId && !s.bought) || null;
  }

  /* ---- HUD ---- */
  function hud() {
    const hideWallet = cur && cur.problem
      && cur.problem.mechanic === 'wallet' && !cur.done;
    /* Chips say what they are in words (clarity review): the bare "$20"
       was never introduced as HER money, the slash fraction reads as
       division to a multiplication-strong kid, and the bare star scored
       points instead of naming wishes. */
    $('walletChip').textContent = hideWallet ? 'Wallet $ ?' : 'Wallet $' + state.wallet;
    paintChips();
    const done = trip.slots.filter(s => s.bought).length;
    /* "List 2 of 5" reads as an index. "Got" makes it a score. */
    $('listBtn').textContent = `Got ${done} of ${trip.slots.length}`;
    $('wishBtn').textContent = `★ Wishes ${state.wishlist.length}`;
  }

  /* One owner for chip appearance. Before the road opens there is nothing to
     shop for, so the three shopping chips are off screen entirely: three
     buttons that lead nowhere is exactly the noise that made the opening
     unreadable. In the modes where panels are refused they go ASLEEP rather
     than staying bright and dead, because a chip that presses down under her
     finger and then does nothing is a lie. Never the disabled attribute: it
     swallows taps and reads as a frozen game. Repainted from the frame loop
     like the goal pill, since this mode machine has too many edges to trust
     a dozen hand-placed calls. */
  function paintChips() {
    const gone = !zonesOpen.has('road') || mode === 'room' || mode === 'stand';
    const live = panelsAllowed() && !cur;
    for (const id of ['listBtn', 'wishBtn', 'bookBtn']) {
      $(id).classList.toggle('hidden', gone);
      $(id).classList.toggle('asleep', !gone && !live);
    }
  }

  /* ---- town zones: what is open, and what opens it next ---- */

  /* Where "Go and see!" takes her for each chunk she earns. */
  const ZONE_GO = {
    road: () => tapGrocery(),
    /* The park and the grove have no tappable props at all, so a ground tap
       is the only verb that exists there. Teach it on arrival if she has not
       found it yet. */
    park: () => {
      /* Leave the food store first, exactly as goToAisle does. The park is
         won by mastering single-digit facts, which live in produce, which is
         INDOOR: so the card that hands her a whole new chunk of town almost
         always fires from the grocery, where closeShelf hands mode back to
         'grocery' and not 'plaza'. Without this the reward button pressed
         down and did nothing, and cardDone had already retired the card. */
      if (inGrocery) leaveGrocery();
      if (mode !== 'plaza') return;
      world.walkTo(-17, -43);
      firstHint('hintWalk', 'Tap the ground to walk anywhere you like!');
    },
    shops: () => {
      if (state.aisles.includes('toys')) goToAisle('toys');
      else if (mode === 'plaza') world.walkTo(41, -33);
    },
    /* Same guard again. Her house is won by mastering the two-digit tiers,
       which normally happens at the toy shop, but a review slot or an
       escalated tender can put a two-digit problem on a produce item, so
       this card can fire from inside the grocery too. */
    home: () => {
      if (inGrocery) leaveGrocery();
      tapHouse();
    },
    grove: () => {
      /* Same guard as the park. The grove is won on an electronics purchase,
         which is an outdoor shop, so this is defensive rather than the daily
         path, but the two ground-tap zones must not differ here. */
      if (inGrocery) leaveGrocery();
      if (mode !== 'plaza') return;
      world.walkTo(26, 1);
      firstHint('hintWalk', 'Tap the ground to walk anywhere you like!');
    }
  };

  /* Recompute the open set from her progress and celebrate anything new.
     The set is derived rather than stored, so it can never drift from what
     she has actually earned. Called after a stand session and after every
     engine unlock. */
  let pendingZone = null;

  function refreshZones() {
    const next = openZones(state);
    const gained = [...next].filter(z => !zonesOpen.has(z));
    zonesOpen = next;
    if (gained.length) world.setZones(next, { pop: true });
    hud();
    /* One card at a time. If two chunks land together the fences for both
       have already sunk, so the rest need no announcement. */
    const first = gained.find(z => ZONE_INFO[z] && ZONE_INFO[z].go);
    if (first) pendingZone = first;
    flushZoneCard();
  }

  /* A chunk can open mid stand session, where a celebration card would land
     on top of a customer. Hold it until she is back outside and browsing;
     the card is the only place the reward is ever named, so it must never
     be dropped. */
  function flushZoneCard() {
    if (!pendingZone || !panelsAllowed() || cur) return;
    const info = ZONE_INFO[pendingZone];
    const go = ZONE_GO[pendingZone];
    pendingZone = null;
    queueCard(() => showUnlock(info.title, info.msg, go, info.go));
  }

  /* Stars on the stand summary and the goal pill: how close the next chunk
     of town is. Nothing else in the game counts sessions. */
  function standStars() {
    const done = Math.min(STAND_SESSIONS_TO_OPEN, state.standSessions || 0);
    return '★'.repeat(done) + '☆'.repeat(STAND_SESSIONS_TO_OPEN - done);
  }

  function standProgress() {
    if (zonesOpen.has('road')) return null;
    const left = STAND_SESSIONS_TO_OPEN - Math.min(
      STAND_SESSIONS_TO_OPEN, state.standSessions || 0);
    return {
      stars: standStars(),
      line: left <= 0 ? 'You did it! Something new is open outside!'
        : left === 1 ? 'Sell lemonade one more time to open the road!'
          : `Sell lemonade ${left} more times to open the road!`
    };
  }

  /* ---- the goal pill ----
     One line that always says what to do next, and does it when tapped.
     The old opening did not make it clear what she was supposed to do,
     and a young player cannot carry an objective between sittings.
     Repainted from the frame loop against a cheap signature rather than
     from every mode change: this mode machine has too many edges to trust
     a dozen hand-placed calls to keep it honest. */
  let goalAct = null;
  let goalSig = null;
  let goalClock = 0;

  /* The pill is live wherever panels are (plaza, shelf, grocery), but
     tapStall only answers from the plaza, so "Sell lemonade at your stand"
     was a bright dead tap for anyone standing in the food store with the
     shopping list finished. Get her out of the shop first, the way goToAisle
     and the zone cards do, then hop. Same rule as the chips right above:
     a control that presses down and does nothing is a lie. */
  /* Byte for byte the sequence the wishlist's sell row already uses, and the
     order is load bearing: panels down, THEN closeShelf (which hands mode
     back to 'grocery' when she is indoors), THEN leaveGrocery, THEN hop. A
     sheet left standing during the walk is the Phase 4 mode-corruption
     class. */
  function goStand() {
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    closeShelf();
    if (inGrocery) leaveGrocery();
    tapStall();
  }

  function goalNow() {
    if (!zonesOpen.has('road')) {
      return { text: 'Sell lemonade at your stand', stars: standStars(), act: goStand };
    }
    const slot = trip.slots.find(s => !s.bought);
    if (slot && BY_ID[slot.itemId]) {
      return { text: `Go and buy: ${BY_ID[slot.itemId].name}`, act: () => goRow(slot) };
    }
    return { text: 'Sell lemonade at your stand', act: goStand };
  }

  function tickGoal(dt) {
    goalClock += dt;
    if (goalClock < 200) return;
    goalClock = 0;
    paintChips();
    const g = (panelsAllowed() && !cur) ? goalNow() : null;
    const sig = g ? g.text + '|' + (g.stars || '') : '';
    if (sig === goalSig) return;
    goalSig = sig;
    const el = $('goal');
    if (!g) { el.classList.add('hidden'); goalAct = null; return; }
    $('goalText').textContent = g.text;
    $('goalStars').textContent = g.stars || '';
    goalAct = g.act;
    el.classList.remove('hidden');
  }

  $('goal').addEventListener('click', () => {
    if (goalAct && panelsAllowed() && !cur) goalAct();
  });

  /* ---- plaza / shelf navigation ---- */
  let mode = 'plaza';
  let openAisle = null;

  /* HUD panels may only open while she is browsing. During a stand session
     the modal drops between customers, and in the room the plaza is not
     even on screen: a panel tap there must be a no-op or the two flows run
     at once (mode machine corruption, found by the Phase 4 review).
     Browsing includes the grocery interior: panels there are safe and the
     wishlist needs to work where the food is. */
  function panelsAllowed() {
    return mode === 'plaza' || mode === 'shelf' || mode === 'grocery';
  }

  /* Walk (and scene-switch) to wherever an aisle is browsed, then continue.
     Indoor aisles live in the grocery interior; outdoor ones at the shops
     zone stands. Handles every start point including already inside. */
  function goToAisle(aisleId, then) {
    const indoor = INDOOR.includes(aisleId);
    if (indoor && inGrocery) {
      openShelf(aisleId);
      if (then) then();
      return;
    }
    if (indoor) {
      mode = 'walking';
      const gs = world.grocerySpot();
      world.hopTo(gs.x, gs.z, () => enterGrocery(() => {
        openShelf(aisleId);
        if (then) then();
      }));
      return;
    }
    if (inGrocery) leaveGrocery();
    mode = 'walking';
    const spot = world.shopSpot(aisleId);
    world.hopTo(spot.x, spot.z, () => {
      openShelf(aisleId);
      if (then) then();
    });
  }

  function tapAisle(id) {
    if (mode !== 'plaza' || !zonesOpen.has('shops')) return;
    /* Tapping the world dismisses list panels, so nothing stale lingers. */
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    if (!state.aisles.includes(id)) {
      world.wobble(id);
      toast('Not open yet! Keep playing and it will open!');
      return;
    }
    mode = 'walking';
    const spot = world.shopSpot(id);
    world.hopTo(spot.x, spot.z, () => openShelf(id));
  }

  function openShelf(id) {
    mode = 'shelf';
    openAisle = id;
    $('shelfTitle').textContent = AISLE_NAMES[id];
    const grid = $('shelfGrid');
    grid.innerHTML = '';
    /* Today's rare leads the shelf on its stock day. */
    if (rare && BY_ID[rare.itemId].aisle === id) {
      const item = BY_ID[rare.itemId];
      const b = document.createElement('button');
      b.className = 'shelf-item rare';
      b.innerHTML = `
        <span class="badge badge-rare">Today only!</span>
        <img alt="" src="${world.thumbnail(item)}">
        <span class="shelf-name">${item.name}</span>
        <span class="shelf-price">$${rare.price}</span>`;
      b.addEventListener('click', () => tapItem(item, rare.price));
      grid.appendChild(b);
    }
    for (const item of itemsForAisle(id)) {
      const price = priceFor(item.id);
      const b = document.createElement('button');
      b.className = 'shelf-item';
      const onList = !!listSlotFor(item.id);
      const onDeal = deal && deal.itemId === item.id && !onList;
      /* The deal price stays a mystery on the shelf: computing it is the
         math moment, so the tag shows the old price and the discount. */
      b.innerHTML = `
        ${onList ? '<span class="badge">List!</span>' : ''}
        ${onDeal ? `<span class="badge badge-deal">$${deal.off} off!</span>` : ''}
        <img alt="" src="${world.thumbnail(item)}">
        <span class="shelf-name">${item.name}</span>
        ${onDeal
          ? `<span class="shelf-price"><s>$${deal.base}</s> $?</span>`
          : `<span class="shelf-price">$${price}</span>`}`;
      b.addEventListener('click', () => tapItem(item, price));
      grid.appendChild(b);
    }
    $('shelf').classList.remove('hidden');
  }

  function closeShelf() {
    $('shelf').classList.add('hidden');
    /* Only the shelf's own mode is ours to reset: stomping 'stand' or
       'room' here was the punch-through the review caught. A shelf opened
       inside the grocery hands back to the grocery, not the plaza. */
    if (mode === 'shelf') mode = inGrocery ? 'grocery' : 'plaza';
    openAisle = null;
  }
  $('shelfClose').addEventListener('click', closeShelf);

  /* ---- afford check: the fourth mechanic, implicit while browsing ---- */
  function tapItem(item, price) {
    if (mode === 'buy') return;
    /* Rares are today-only and never wishlist: coming back with more money
       another stock day IS the freshness loop. */
    if (item.rare && !engine.canAfford(price)) {
      toast('Not enough money yet! Maybe it will be back another day.');
      return;
    }
    const onDeal = deal && deal.itemId === item.id && !listSlotFor(item.id);
    const cost = onDeal ? deal.sale : price;
    if (!engine.canAfford(cost)) {
      if (!state.wishlist.some(w => w.id === item.id)) {
        state.wishlist.push({ id: item.id, price });
        saveSave(state);
      }
      /* The broke moment must point at the way to money (clarity review):
         a fresh $20 cannot cover the first list, and the stand is the
         designed answer, not a secret. */
      toast('Not enough money yet! It is on your ★ list. Sell lemonade to earn more!', 3600);
      $('wishBtn').classList.add('pulse');
      setTimeout(() => $('wishBtn').classList.remove('pulse'), 1200);
      hud();
      return;
    }
    openBuy(item, cost, onDeal ? deal : null);
  }

  /* ---- purchase flow ---- */
  let cur = null;
  let forcedMech = null;
  let keypad = null;

  /* dealInfo (Phase 5) prepends the sale-price moment: she computes
     base minus discount before the purchase runs at the sale price. Like
     the stand's total step it is UNTRACKED: same miss ladder, records
     nothing, and its misses never touch the problem's firstTry. */
  function openBuy(item, price, dealInfo) {
    mode = 'buy';
    let p = engine.purchaseProblem({ aisle: item.aisle, price });
    if (forcedMech) {
      for (let i = 0; i < 120 && p.mechanic !== forcedMech; i++) {
        p = engine.purchaseProblem({ aisle: item.aisle, price });
      }
    }
    cur = {
      item, price, problem: p, misses: 0, dealMisses: 0, anyMiss: false,
      borrowErr: false, submitted: false, done: false,
      deal: dealInfo || null,
      phase: dealInfo ? 'deal' : p.mechanic === 'cashier' ? 'judge' : 'entry',
      entry: [], colW: null, assist: null
    };
    renderBuy();
    hud();
  }

  /* The on-screen cashier: Sunny runs the grocery till, Benny everywhere
     else. Copy naming the wrong bear undercuts the scene she is looking at. */
  function cashierName() { return inGrocery ? 'Sunny' : 'Benny'; }

  /* THE ASK: one line, and it is only ever the question. Everything these
     prompts used to state before asking (both amounts, who is holding them,
     why money comes back) is a fact with a number attached, so it belongs in
     the receipt underneath, where the label sits beside the figure it names.
     Vocabulary is unchanged and still fixed game-wide: COSTS is the price,
     PAYS WITH is the bill, GIVES BACK is the change. */
  function askFor(p) {
    if (p.mechanic === 'wallet') return '<b>How much is left?</b>';
    if (p.mechanic === 'cashier') {
      return `<b>Is $${p.offered} the right change?</b>`;
    }
    return `<b>How much change do you get?</b>`;
  }

  /* THE RECEIPT: minuend, subtrahend, then the row she is solving for, which
     is the column scaffold's layout in words so both entry paths teach one
     shape. Never rendered beside a column (see ui.js receipt). */
  function receiptFor(p, bills) {
    if (p.mechanic === 'wallet') {
      return receipt([
        { label: 'Your wallet has', value: p.m },
        { label: 'This costs', value: p.s },
        { label: 'You will have', value: '?' }
      ]);
    }
    if (p.mechanic === 'cashier') {
      /* The offer is a ROW, highlighted, not a number buried in a sentence:
         the whole task is judging that one figure against the two above it,
         and putting all three in a column is what makes the comparison
         something she can see rather than hold in her head. */
      return receipt([
        { label: 'You pay with', value: p.m, bills },
        { label: 'It costs', value: p.s },
        { label: `${cashierName()} gives back`, value: p.offered, hi: true }
      ]);
    }
    return receipt([
      { label: 'You pay with', value: p.m, bills },
      { label: 'It costs', value: p.s },
      { label: 'You get back', value: '?' }
    ]);
  }

  /* The judge's correction card, on both routes into it (she said no and was
     right, or she thanked a wrong offer twice). Only the bottom row changes
     from the receipt she has been reading: the offer becomes the row she is
     solving for, so both operands stay exactly where they were.
     THE COLUMN GUARD IS THE POINT of this being one function. A cashier
     problem carries its own entry (finish() sets entry from the tier and the
     stage, not from the mechanic), so a two_borrow tier regressed to stage 1
     hands the correction a column, and both call sites used to print the
     receipt anyway: the same two amounts twice on one card, and on a phone
     the extra rows push the checkmark past the card's own cap. */
  function correctionReceipt(p, note) {
    const rows = p.entry === 'column' ? '' : receipt([
      { label: 'You pay with', value: p.m, bills: p.money ? p.m : null },
      { label: 'It costs', value: p.s },
      { label: `${cashierName()} should give back`, value: '?' }
    ]);
    return rows + `<div class="assist-hint">${note}</div>`;
  }

  /* The one-time teaching lines, in the hint voice, under the receipt. Each
     is one sentence now instead of a three-clause preamble welded onto the
     front of the question.
     taughtChangeStore has its OWN flag, separate from the stand's: zone
     gating guarantees the stand teaches change first, so a single shared flag
     made this branch dead code for every new player and her only definition
     of change became "money I hand away". The two directions are the point.
     Pronoun-free: nothing in the game says whether Benny or Sunny is a he
     or a she. */
  function teachFor(p) {
    if (p.mechanic === 'cashier' && !kvLoad('taughtCashier', 0)) {
      return `Sometimes ${cashierName()} gets the change wrong. Have a look!`;
    }
    if (p.mechanic === 'change' && !kvLoad('taughtChangeStore', 0)) {
      return `You are paying more than it costs. The extra comes back to you.
        That is called change.`;
    }
    return '';
  }

  function renderBuy() {
    const { item, price, problem: p } = cur;
    const inDeal = cur.phase === 'deal';
    const card = $('buyCard');
    card.innerHTML = `
      <div class="buy-head">
        <img alt="" src="${world.thumbnail(item)}">
        <div><div class="buy-name">${item.name}</div>
          <div class="buy-price">${inDeal ? `<s>$${cur.deal.base}</s> $?` : '$' + price}</div></div>
        <button id="buyClose" class="icon-btn" aria-label="close">×</button>
      </div>
      <div class="buy-prompt" id="buyPrompt">${inDeal
        ? '<b>What does it cost now?</b>'
        : askFor(p)}</div>
      <div id="buyBills"></div>
      <div class="buy-nudge" id="buyNudge"></div>
      <div id="buyBody"></div>`;
    $('buy').classList.remove('hidden');
    $('buyClose').addEventListener('click', cancelBuy);
    /* A rebuilt card must not resurrect the x after a miss. */
    if (cur.anyMiss) $('buyClose').style.visibility = 'hidden';
    if (inDeal) {
      /* The deal is a money story too, so it gets the same receipt: what it
         was, what comes off, and the row she is filling. The old prose said
         the subtraction twice, once in words and once as "$12 take away $3",
         and then asked. */
      $('buyBills').innerHTML = receipt([
        { label: 'It was', value: cur.deal.base },
        /* "Today you save", not "Today it is off by": a label that ends on a
           preposition leaves her holding half a phrase across the gap to the
           figure on the right, and every other row in the game resolves where
           the label ends. */
        { label: 'Today you save', value: cur.deal.off },
        { label: 'It costs now', value: '?' }
      ]);
      $('buyBody').innerHTML = `
        <div class="entry-wrap">
          <div id="entryArea"><div class="pad-display" id="padDisplay"></div></div>
          <div id="keypadHost"></div>
        </div>
        ${HINTS}`;
      keypad = makeKeypad($('keypadHost'), {
        onDigit: d => onDigit(d),
        onBack: () => onBack(),
        onSubmit: () => onSubmit(),
        onEmptySubmit: () => {
          if (!cur || cur.assist) return;
          nudge('Put your answer in first!');
        },
        hintGo: !kvLoad('goTaught', 0)
      });
      cur.colW = null;
      cur.entry = [];
      paintPad();
      keypad.setGo(false);
      return;
    }
    /* The receipt, plus the one-time teaching sentence under it. Split rule
       is unchanged and still the engine's call: bills ride along as a row's
       illustration only when p.money is set, which is the >= 50 tier. */
    const bills = p.money && (p.mechanic === 'change' || p.mechanic === 'cashier')
      ? p.m : null;
    /* The deal price announcement moved out of the question. It used to be
       welded onto the front of the prompt ("Only $9 today! It costs $9. You
       pay Sunny with..."), which put a celebration in the middle of the ask. */
    const notes = [cur.deal ? `Only $${price} today!` : '', teachFor(p)]
      .filter(Boolean);
    /* No receipt beside a column: the column shows both amounts already. The
       cashier's judge card has no column, so its receipt always renders. */
    const showReceipt = cur.phase === 'judge' || p.entry !== 'column';
    $('buyBills').innerHTML = (showReceipt ? receiptFor(p, bills) : '')
      + '<div id="buyBridge"></div>'
      + notes.map(n => `<div class="assist-hint">${n}</div>`).join('');
    /* The wallet mechanic's on-card "Wallet $ ?" chip is GONE. It existed
       because the real HUD chip hides behind the modal scrim, but the
       receipt's own answer row is already that unknown, and two question
       marks for one number on one card is the thing this pass is removing.
       Gone end to end: the node, its .card-chip CSS and complete()'s reveal
       of it. The success card says where the wallet landed instead. */
    if (cur.phase === 'judge') renderJudge();
    else renderEntry();
    paintBridge(false);
  }

  /* A miss means the sale must now finish here: hide the x so the attempt
     cannot be abandoned (the no-fail contract is that the scaffold finishes
     WITH her and the record is kept). Deal misses count separately: the
     deal step is untracked, so they must never touch the problem's
     firstTry, but they still hide the x. */
  function noteMiss(kind) {
    if (kind === 'deal') cur.dealMisses++;
    else cur.misses++;
    cur.anyMiss = true;
    const bc = $('buyClose');
    if (bc) bc.style.visibility = 'hidden';
    /* The warm bridge earns its place on a miss. Never on a deal miss: the
       deal step is its own untracked subtraction (base minus the discount)
       and has nothing to do with the purchase's fact. */
    if (kind !== 'deal') paintBridge(true);
  }

  /* The addition bridge slot, mirroring stand.js exactly. Its own node so a
     miss can fill it without rebuilding the receipt and wiping her entry.
     Cold shows with the card, warm waits for a miss, hot never shows, and a
     column card never shows it (one method at a time). The judge card is out
     too: she is being asked to check someone else's answer there, not to
     produce one, so a bridge would be answering the question for her. */
  function paintBridge(afterMiss) {
    const p = cur && cur.problem;
    const host = $('buyBridge');
    if (!host) return;
    if (!p || p.bridge === null || p.bridge >= 2
        || p.entry === 'column' || cur.phase === 'judge' || cur.phase === 'deal') {
      host.innerHTML = '';
      return;
    }
    /* One new idea per card: same rule as the stand. The store's first change
       sale is teaching the opposite direction (money coming TO her) and owns
       that card by itself. */
    if (p.mechanic === 'change' && !kvLoad('taughtChangeStore', 0)) {
      host.innerHTML = '';
      return;
    }
    if (p.bridge > 0 && !afterMiss) { host.innerHTML = ''; return; }
    const teach = bridgeTeachable() && !kvLoad('bridgeTaught', 0);
    host.innerHTML = bridge(p.m, p.s, teach);
    if (teach) kvStore('bridgeTaught', 1);
  }

  function cancelBuy() {
    /* Backing out before answering is browsing, not failing. No record.
       After a miss the sale completes here: route into solve-together
       instead of discarding recorded evidence. */
    if (!cur || cur.submitted) return;
    if (cur.anyMiss) {
      if (!cur.assist) {
        if (cur.phase === 'deal') startDealAssist();
        else startAssist();
      }
      return;
    }
    $('buy').classList.add('hidden');
    cur = null;
    mode = 'shelf';
    hud();
  }

  function renderJudge() {
    const p = cur.problem;
    const body = $('buyBody');
    body.innerHTML = `
      <div class="judge">
        <button id="jThanks" class="big-btn judge-btn">Yes! $${p.offered} is right</button>
        <button id="jWait" class="big-btn judge-btn">No, that is not right</button>
      </div>`;
    $('jThanks').addEventListener('click', () => judge(true));
    $('jWait').addEventListener('click', () => judge(false));
    /* A young player does not know that contradicting a shopkeeper is allowed. */
    if (!kvLoad('taughtCashier', 0)) {
      body.insertAdjacentHTML('beforeend',
        `<div class="assist-hint">You can say no. ${cashierName()} will not mind!</div>`);
    }
  }

  function judge(saidOk) {
    /* Disable both buttons synchronously: an excited double-tap must count
       as ONE judgment, not two misses. Re-enabled only when the retry is
       actually offered. */
    const bT = $('jThanks'), bW = $('jWait');
    if (!bT || bT.disabled) return;
    bT.disabled = bW.disabled = true;
    const p = cur.problem;
    const offerOk = !p.offeredWrong;
    if (saidOk === offerOk) {
      if (offerOk) {
        complete({ firstTry: cur.misses === 0, assisted: false });
      } else {
        cur.phase = 'entry';
        /* Both operands stay on screen, and now they stay in the receipt she
           has been reading all along: only the bottom row changes, from the
           rejected offer to the row she is solving for. The old handling
           replaced the whole prompt, which wiped the only place the tender
           appeared and left 10 minus 7 posed with only the 7 visible.
           The wrong offer is NEVER reprinted here: as the last numeral before
           the keypad it is the one a literal reader would type. */
        $('buyPrompt').innerHTML =
          `<b>How much should ${cashierName()} give back?</b>`;
        $('buyBills').innerHTML = correctionReceipt(p,
          'You were right, that was not the right change!');
        renderEntry();
      }
    } else {
      noteMiss();
      if (cur.misses >= 2) {
        startAssist();
      } else {
        /* No counting language: these run on fluency-territory facts. */
        nudge(offerOk ? 'Look again. Is that the right change?' : 'Hmm, check the change again!');
        setTimeout(() => { bT.disabled = bW.disabled = false; }, 600);
      }
    }
  }

  function renderEntry() {
    const p = cur.problem;
    const body = $('buyBody');
    body.innerHTML = `
      <div class="entry-wrap">
        <div id="entryArea"></div>
        <div id="keypadHost"></div>
      </div>
      ${HINTS}`;
    keypad = makeKeypad($('keypadHost'), {
      onDigit: d => onDigit(d),
      onBack: () => onBack(),
      onSubmit: () => onSubmit(),
      onEmptySubmit: () => {
        if (!cur || cur.assist) return;
        nudge(cur.colW ? 'Fill all the boxes first!' : 'Put your answer in first!');
      },
      hintGo: !kvLoad('goTaught', 0)
    });
    /* ✓ had a pulse, a flag and an empty-submit nudge; ⌫ had nothing, so a
       mistyped digit had no visible way out and she submitted a typo as a
       maths error. Name both once; goTaught retires the hint. */
    if (!kvLoad('goTaught', 0)) {
      setHint('keyHint', 'Tap ✓ when you are done. Tap ⌫ to erase.');
    }
    if (p.entry === 'column') {
      mountColumn($('entryArea'), p, w => { cur.colW = w; });
      keypad.setGo(false);
    } else {
      cur.colW = null;
      /* The written sum used to live here, because the two amounts were
         otherwise buried in a three-clause sentence. The receipt above the
         entry row now holds both, so a strip here would be the third place
         this card states the same subtraction. */
      $('entryArea').innerHTML = `<div class="pad-display" id="padDisplay"></div>`;
      paintPad();
      keypad.setGo(false);
    }
  }

  /* The column, its start hint and its borrow narration. makeColumn wipes its
     host, so the hint node must exist BEFORE it runs: the first mark fires
     inside makeColumn's own constructor. Borrowing had no explanation
     anywhere in the project, and a struck-through digit with a new red number
     above it is the least self-evident thing a young player meets. Direction matters:
     a borrowOut column RECEIVES the ten, a borrowIn column PAID for it, and
     one sentence cannot serve both. Mirrors stand.js mountColumn. */
  function mountColumn(host, p, assign) {
    host.innerHTML = '<div id="colHost"></div>';
    if (!kvLoad('colTaught', 0)) {
      setHint('colHint', 'Start in the orange box.');
    }
    assign(makeColumn($('colHost'), columns(p.m, p.s), {
      marks: p.stage === 0,
      onMark: (i, shown, c) => {
        if ((cur && cur.assist) || kvLoad('borrowTaught', 0)) return;
        setHint('colHint', c.borrowOut
          ? `${c.top} is too small, so it takes a ten from next door. Now it is ${shown}. Use ${shown}!`
          : `This one gave a ten away. ${c.top} is now ${shown}.`);
      }
    }));
  }

  /* An empty answer box shows a blinking caret drawn by CSS off :empty, not
     a character. The old placeholder was a literal middle dot, and in a game
     whose prices are all whole dollars a young player reads that as a decimal point
    . Writing '' keeps the element :empty; the assisted walk
     writes real spans and the caret goes away on its own. */
  function paintPad() {
    const el = $('padDisplay');
    if (el) el.textContent = cur.entry.join('');
  }

  function onDigit(d) {
    if (cur.assist) return assistDigit(d);
    if (cur.colW) {
      cur.colW.enter(d);
      keypad.setGo(cur.colW.filled());
    } else {
      if (cur.entry.length >= 3) return;
      cur.entry.push(d);
      paintPad();
      keypad.setGo(true);
    }
  }

  function onBack() {
    if (cur.assist) return;
    if (cur.colW) {
      cur.colW.back();
      keypad.setGo(cur.colW.filled());
    } else {
      cur.entry.pop();
      paintPad();
      keypad.setGo(cur.entry.length > 0);
    }
  }

  function digitsOf(n) {
    const out = [];
    do { out.push(n % 10); n = Math.floor(n / 10); } while (n > 0);
    return out;
  }

  function onSubmit() {
    if (cur.assist) return;
    if (cur.phase === 'deal') {
      if (!cur.entry.length) return;
      const v = Number(cur.entry.join(''));
      if (v === cur.deal.sale) { dealDone(); return; }
      noteMiss('deal');
      if (cur.dealMisses >= 2) {
        startDealAssist();
      } else {
        nudge(NUDGES[Math.floor(Math.random() * NUDGES.length)]);
        cur.entry = [];
        paintPad();
        keypad.setGo(false);
      }
      return;
    }
    const p = cur.problem;
    let ok, diag = null;
    if (cur.colW) {
      diag = diagnose(p.m, p.s, cur.colW.digits());
      ok = diag.wrong.length === 0;
    } else {
      if (!cur.entry.length) return;
      const v = Number(cur.entry.join(''));
      ok = v === p.answer;
      if (!ok) diag = diagnose(p.m, p.s, digitsOf(v));
    }
    if (ok) {
      complete({ firstTry: cur.misses === 0, assisted: false });
      return;
    }
    if (cur.misses === 0 && diag) cur.borrowErr = diag.borrowErr;
    noteMiss();
    if (cur.misses >= 2) {
      startAssist();
    } else {
      nudge(NUDGES[Math.floor(Math.random() * NUDGES.length)]);
      if (cur.colW) cur.colW.reset();
      else { cur.entry = []; paintPad(); }
      keypad && keypad.setGo(false);
    }
  }

  function nudge(msg) {
    const el = $('buyNudge');
    el.textContent = msg;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }

  /* Deal solved: the card becomes the ordinary purchase at the sale
     price. renderBuy re-hides the x if the deal step took any misses. */
  function dealDone() {
    play('chime');
    /* The deal digits must not leak into the purchase entry (the stand's
       startSolve clears the same way). */
    cur.entry = [];
    cur.phase = cur.problem.mechanic === 'cashier' ? 'judge' : 'entry';
    renderBuy();
  }

  /* Solve the deal price together: ghost digits she taps, like the stand's
     total step. Completes into the purchase, never into submitResult. */
  function startDealAssist() {
    nudge(`Let's solve it together!`);
    cur.assist = {
      digits: digitsOf(cur.deal.sale).reverse(), at: 0, col: false,
      answer: cur.deal.sale, deal: true
    };
    $('entryArea').innerHTML = `<div class="pad-display" id="padDisplay"></div>`;
    setHint('colHint', 'Tap these numbers on the keypad!');
    setHint('keyHint', '');
    paintAssist();
    keypad && keypad.setGo(false);
  }

  /* Second miss: solve it together. The scaffold walks the answer with
     her; she confirms each step on the keypad and the sale completes. */
  function startAssist() {
    const p = cur.problem;
    $('buyNudge').textContent = `Let's solve it together!`;
    if (p.mechanic === 'cashier' && cur.phase === 'judge' && !p.offeredWrong) {
      /* The offer was right all along: show it, one tap to finish. */
      $('buyBody').innerHTML = `
        <div class="assist-reveal">$${p.offered} is right!
          <button id="assistOk" class="big-btn ok">OK!</button></div>`;
      $('assistOk').addEventListener('click', () =>
        complete({ firstTry: false, assisted: true }));
      return;
    }
    if (cur.phase === 'judge') {
      /* She thanked a wrong offer twice; move to a guided correction. The
         amounts stay in the receipt rather than being restated in prose. */
      cur.phase = 'entry';
      $('buyPrompt').innerHTML = `<b>Let's find the right change.</b>`;
      $('buyBills').innerHTML =
        correctionReceipt(p, `${cashierName()} made a mistake!`);
      renderEntry();
    }
    if (cur.colW) {
      /* The column walk needs its own instruction: the keypad walk below has
         always had one, and without it her second miss produced a rebuilt
         column, one faint ghost digit and a keypad where nine keys in ten
         shake and refuse her, which is the closest thing in the game to
         negative feedback at the exact moment she should feel helped.
         Naming the KEYPAD is load bearing: the glowing box has no listener,
         so "tap the glowing box" would be met with silence. */
      mountColumn($('entryArea'), { m: p.m, s: p.s, stage: 0 }, w => { cur.colW = w; });
      const expect = cur.colW.guide(0);
      setHint('colHint',
        'The glowing box shows the number. Tap that number on the keypad!');
      setHint('keyHint', '');
      cur.assist = { i: 0, expect, col: true, n: columns(p.m, p.s).length };
    } else {
      cur.assist = { digits: digitsOf(p.answer).reverse(), at: 0, col: false, answer: p.answer };
      $('entryArea').innerHTML = `<div class="pad-display" id="padDisplay"></div>`;
      setHint('colHint', 'Tap these numbers on the keypad!');
      setHint('keyHint', '');
      paintAssist();
    }
    keypad && keypad.setGo(false);
  }

  function paintAssist() {
    const a = cur.assist;
    const s = String(a.answer);
    $('padDisplay').innerHTML =
      `<span>${s.slice(0, a.at)}</span><span class="rest">${s.slice(a.at)}</span>`;
  }

  function assistDigit(d) {
    const a = cur.assist;
    if (a.col) {
      if (d !== a.expect) { keypad.shake(d); return; }
      cur.colW.confirm(a.i);
      a.i++;
      if (a.i >= a.n) return complete({ firstTry: false, assisted: true });
      a.expect = cur.colW.guide(a.i);
    } else {
      if (d !== a.digits[a.at]) { keypad.shake(d); return; }
      a.at++;
      paintAssist();
      if (a.at >= a.digits.length) {
        if (a.deal) {
          /* The deal step is done; the real purchase begins untouched. */
          cur.assist = null;
          dealDone();
          return;
        }
        return complete({ firstTry: false, assisted: true });
      }
    }
  }

  /* ---- completion: submit once, pay, celebrate ---- */
  function complete(res) {
    if (cur.submitted) return;
    cur.submitted = true;
    cur.done = true;
    const { problem: p, item, price } = cur;
    const events = engine.submitResult(p, {
      firstTry: res.firstTry,
      assisted: res.assisted,
      borrowErr: cur.borrowErr
    });
    engine.pay(price);
    const slot = listSlotFor(item.id);
    if (slot) { slot.bought = true; kvStore('trip', trip); }
    const wi = state.wishlist.findIndex(w => w.id === item.id);
    if (wi >= 0) state.wishlist.splice(wi, 1);
    /* Phase 5: everything bought is found (catalog reveal); home goods
       land in the room, wallpaper goes straight onto the walls. */
    const firstFind = !(state.found[item.id] > 0);
    state.found[item.id] = (state.found[item.id] || 0) + 1;
    let roomFirst = false;
    if (item.wallpaper) {
      state.deco.wallpaper = item.id;
      roomFirst = !kvLoad('roomTaught', 0);
      if (!roomFirst) toast('New wallpaper is up in your room!', 2800);
    } else if (item.aisle === 'home') {
      placeInRoom(state, item);
      roomFirst = !kvLoad('roomTaught', 0);
      if (!roomFirst) toast(`The ${item.name} is in your room now!`, 2800);
    } else if (item.rare && firstFind) {
      toast(`You found the ${item.name}! It is in your book!`, 3200);
    }
    saveSave(state);
    /* Teaching flags close on real completions (clarity review). */
    const firstChange = p.mechanic === 'change' && !kvLoad('taughtChangeStore', 0);
    kvStore('goTaught', 1);
    if (p.mechanic === 'change') kvStore('taughtChangeStore', 1);
    if (p.mechanic === 'cashier') kvStore('taughtCashier', 1);
    if (cur.colW) {
      kvStore('colTaught', 1);
      /* Separate from colTaught: a three-digit problem can carry zero
         borrows, so colTaught can be spent on a column that never drew a
         mark and the borrow narration would never fire. */
      kvStore('borrowTaught', 1);
    }
    hud();
    /* Panels left open under the card go stale the moment money moves
       (the book's found-state too: a first find must not stay a
       silhouette behind its own celebration toast). */
    if (!$('wish').classList.contains('hidden')) openWish();
    if (!$('quest').classList.contains('hidden')) openQuest();
    if (!$('book').classList.contains('hidden')) openBook();

    /* Success now tells the whole money story (clarity review): what she
       paid, what came back (naming "change" on the first one), and where
       her wallet landed. Numerals only; split rule untouched. */
    const change = p.mechanic === 'wallet' ? null : p.answer;
    /* The × goes with the question it belonged to. It used to survive into
       this card still bright and pressable, and cancelBuy refuses a submitted
       purchase, so it pressed down under her finger and did nothing on EVERY
       successful buy. Mirrors the stand's celebration card, and the same rule
       the chips and the go key follow: a control must never answer with
       silence. The prompt goes with it: leaving "How much change do you get?"
       standing over "You got it!" re-poses a question she has just answered,
       and on the first-change card that is three lines of it. */
    const bx = $('buyClose');
    if (bx) bx.style.visibility = 'hidden';
    $('buyPrompt').innerHTML = '';
    /* The receipt goes with the question, for the same reason: its answer row
       is a live "?" and leaving it up re-poses a sum she has just solved. */
    $('buyBills').innerHTML = '';
    const taughtNow = firstChange && change > 0
      ? `<div class="success-sub">$${change} back! That is your change.</div>`
      : change !== null && change > 0
        ? `<div class="success-sub">You got $${change} change back.</div>`
        : change === 0
          ? `<div class="success-sub">You paid it just right! No change.</div>` : '';
    $('buyBody').innerHTML = `
      <div class="success">
        <div class="success-big">You got it!</div>
        <div class="success-sub">You paid $${price}.
          Your wallet has $${state.wallet} now.</div>
        ${taughtNow}
        <button id="successOk" class="big-btn ok">Yay!</button>
      </div>`;
    $('buyNudge').textContent = '';
    play('ching');
    confetti(res.firstTry ? 18 : 10);
    $('successOk').addEventListener('click', () => {
      $('buy').classList.add('hidden');
      cur = null;
      mode = 'shelf';
      /* Pulse the wallet chip once the dim lifts and she can see it. */
      const chip = $('walletChip');
      chip.classList.add('pulse');
      setTimeout(() => chip.classList.remove('pulse'), 1200);
      /* Order matters: the trip celebration goes FIRST so a navigating card
         is always last in the queue and never walks her out from under one. */
      const listDone = trip.slots.every(s => s.bought);
      if (listDone) queueCard(celebrate);
      handleEvents(events);
      if (roomFirst) {
        kvStore('roomTaught', 1);
        queueCard(() => showUnlock('It is in your room!',
          'Your things live at your house.', () => {
            if (inGrocery) leaveGrocery();
            tapHouse();
          }, 'Go and see!'));
      }
      flushZoneCard();
      if (!listDone && openAisle) openShelf(openAisle);
      hud();
    });
  }

  /* Small celebration card with a way to ACT on the reward: unlock toasts
     used to name a place she had never seen and fade (clarity review).
     The Go button reuses the goRow wiring; outside browsing modes the old
     toast still covers it (mode machine untouched). */
  /* Celebration cards take turns. Buying the last item on a list can, in one
     tick, complete the trip AND master a tier AND open an aisle AND open a
     whole chunk of town; every one of those wants a card, they are all
     .modal at the same z-index, and the last one painted wins. Worse, its Go
     button passed the guard and started a cross-town walk with "List done!"
     still filling the screen and the arriving shelf hidden behind it. The
     stretch-item-last list design makes that likely, not rare. */
  let cardQ = [];
  function queueCard(show) {
    cardQ.push(show);
    if (cardQ.length === 1) show();
  }
  function cardDone() {
    cardQ.shift();
    if (cardQ.length) cardQ[0]();
  }

  function showUnlock(title, msg, onGo, goLabel) {
    $('unlockTitle').textContent = title;
    $('unlockMsg').textContent = msg;
    $('unlockGo').textContent = goLabel || 'Go and see!';
    play('fanfare');
    confetti(30);
    $('unlock').classList.remove('hidden');
    $('unlockGo').onclick = () => {
      $('unlock').classList.add('hidden');
      cardDone();
      /* A navigating card must never fire while another card is still up. */
      if (cardQ.length) return;
      if (!panelsAllowed() || cur) return;
      $('quest').classList.add('hidden');
      $('wish').classList.add('hidden');
      $('book').classList.add('hidden');
      closeShelf();
      onGo();
    };
    $('unlockLater').onclick = () => {
      $('unlock').classList.add('hidden');
      cardDone();
    };
  }

  function handleEvents(events) {
    const unlocked = [];
    for (const e of events) {
      if (e.type === 'unlock') {
        /* Indoor aisles pop their gondola tarp in the grocery; outdoor
           ones pop the stand tarp in the shops zone. */
        const indoor = INDOOR.includes(e.aisle);
        if (indoor) grocery.setAisleOpen(e.aisle, true, true);
        else world.setAisleOpen(e.aisle, true, true);
        unlocked.push(e.aisle);
      } else if (e.type === 'fade' && e.stage === 2) {
        play('chime');
        toast('No more boxes! You can do it all by yourself now!', 2800);
      } else if (e.type === 'fade') {
        play('chime');
        toast('You are so good at this, the boxes are getting simpler!', 2400);
      }
      /* regress: the column quietly returns next time. No comment: no fail
         states, no negative feedback. */
    }
    if (!unlocked.length) return;
    /* An aisle unlock can also open a whole chunk of town (toys opens the
       shop street, gadgets opens her house). When it does, the chunk is the
       bigger news and its card walks her to the new aisle anyway: two
       celebration cards back to back is one too many for a young player. */
    const before = new Set(zonesOpen);
    refreshZones();
    if ([...zonesOpen].some(z => !before.has(z))) return;
    const aisle = unlocked[0];
    const indoor = INDOOR.includes(aisle);
    if (panelsAllowed() && !cur) {
      queueCard(() => showUnlock(`${AISLE_NAMES[aisle]} is open!`,
        indoor ? 'A new shelf in the food store!' : 'A new shop on the shop street!',
        () => goToAisle(aisle), 'Go and see!'));
    } else {
      toast(indoor
        ? `New shelf in the food store: ${AISLE_NAMES[aisle]}!`
        : `New shop on the shop street: ${AISLE_NAMES[aisle]}!`, 3200);
    }
  }

  function celebrate() {
    closeShelf();
    $('celebrate').classList.remove('hidden');
    play('fanfare');
    confetti(40);
    $('celebMsg').textContent = `You have $${state.wallet} left. Nice shopping!`;
  }
  $('celebNew').addEventListener('click', () => {
    $('celebrate').classList.add('hidden');
    cardDone();
    if (cardQ.length) return;
    newTrip();
    hud();
    openQuest();
  });
  $('celebStay').addEventListener('click', () => {
    $('celebrate').classList.add('hidden');
    cardDone();
  });

  /* ---- quest + wishlist panels ---- */
  /* One tap on a list row walks her to the item (clarity review: the boot
     sheet's rows looked tappable and did nothing, and the grocery was an
     unmarked 64-tile walk north). Wired exactly like the wishlist Get it!:
     guard, hide every panel, closeShelf (load-bearing: quest can open from
     shelf mode, and a live shelf left up during the cross-map walk is the
     Phase 4 mode-corruption class), THEN goToAisle. */
  function goRow(slot) {
    if (!panelsAllowed() || cur) return;
    /* Deliberately does NOT set hintWalk: pressing a menu button is not
       evidence she found walking, and burning the flag here left the park
       and grove unlocks promising "Go play!" into zones whose only verb is a
       ground tap she was never taught. */
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    closeShelf();
    goToAisle(slot.aisle);
  }

  function openQuest() {
    const list = $('questList');
    list.innerHTML = '';
    /* Until her first ever purchase, the sheet greets and explains itself
       in one line (no save change: found is empty exactly then). */
    if (!Object.keys(state.found).length) {
      const hi = document.createElement('div');
      hi.className = 'q-greet';
      hi.textContent = 'Hi! Here is your shopping list.';
      list.appendChild(hi);
    }
    trip.slots.forEach((s, i) => {
      const item = BY_ID[s.itemId];
      const row = document.createElement('div');
      row.className = 'q-row' + (s.bought ? ' done' : ' go');
      row.innerHTML = `
        <img alt="" src="${world.thumbnail(item)}">
        <span class="q-name">${item.name}
          ${i === trip.slots.length - 1 ? `<span class="q-star">★ ${
            s.price > state.wallet ? 'Save up for this one!' : 'Get this one last!'
          }</span>` : ''}
          <span class="q-place">${INDOOR.includes(s.aisle)
            ? 'at the grocery store' : 'at the shops'}</span></span>
        <span class="q-price">$${s.price}</span>
        ${s.bought ? '<span class="q-check">✓</span>'
          : '<span class="mini-btn q-go">Go!</span>'}`;
      if (!s.bought) row.addEventListener('click', () => goRow(s));
      list.appendChild(row);
    });
    /* A finished list used to hide the footer outright, leaving four struck
       rows, no button and no explanation until midnight: newTrip's only UI
       caller was the celebration card's New list, and Keep shopping was a
       one-way door out of the whole shopping loop. Appended AFTER the rows;
       the prepend slot above is the first-run greeting. */
    const first = trip.slots.find(s => !s.bought);
    if (!first) {
      const done = document.createElement('div');
      done.className = 'q-greet';
      done.textContent = 'You bought everything! Want a new list?';
      list.appendChild(done);
    }
    $('questGo').parentElement.classList.remove('hidden');
    $('questGo').textContent = first ? 'Go!' : 'New list!';
    $('questGo').onclick = () => {
      if (first) { goRow(first); return; }
      /* Load bearing: complete() calls openQuest() from buy mode. */
      if (!panelsAllowed() || cur) return;
      newTrip();
      hud();
      openQuest();
    };
    $('quest').classList.remove('hidden');
  }
  /* Chip guards: panels only open while browsing (see panelsAllowed).
     openQuest/openWish stay unguarded because complete() refreshes an
     already-open sheet from buy mode. */
  /* ONE door for all three HUD panels. They are body siblings sharing
     .sheet's z-index with #shelf, and #shelf is last in index.html, so an
     open shelf painted over any panel opened behind it: the chip tap was met
     with total silence and the panels piled up unseen, then appeared when she
     closed the shelf. Park the aisle so her x puts her back on the shelf she
     was reading. Do not "fix" this with a z-index bump: that leaves two
     sheets open with two close buttons and no way to tell which is which. */
  let panelReturn = null;
  function showPanel(open) {
    if (!panelsAllowed() || cur) return;
    panelReturn = openAisle;
    $('quest').classList.add('hidden');
    $('wish').classList.add('hidden');
    $('book').classList.add('hidden');
    closeShelf();
    open();
  }
  function closePanel(id) {
    $(id).classList.add('hidden');
    if (!panelReturn) return;
    const back = panelReturn;
    panelReturn = null;
    openShelf(back);
  }
  $('listBtn').addEventListener('click', () => showPanel(openQuest));
  $('questClose').addEventListener('click', () => {
    closePanel('quest');
    /* She dismissed the list without the Go button: teach the walk verb
       once, right when the world is back under her finger. "Grass" is false
       at the places this now fires (she is on the grocery forecourt or the
       ring road), and a literal reader who hunts for grass and taps a fenced
       tile gets "Not open yet!" instead of a walk. */
    if (mode === 'plaza') firstHint('hintWalk', 'Tap the ground to walk anywhere you like!');
  });

  function openWish() {
    const list = $('wishList');
    list.innerHTML = '';
    /* The earn loop, advertised where the wanting happens (clarity
       review). The Go! span rides the row's single handler pattern. */
    const sell = document.createElement('div');
    sell.className = 'q-greet wish-sell';
    sell.innerHTML = `Sell lemonade at your stand to earn money!
      <span class="mini-btn q-go">Go!</span>`;
    sell.addEventListener('click', () => {
      if (!panelsAllowed() || cur) return;
      $('quest').classList.add('hidden');
      $('wish').classList.add('hidden');
      $('book').classList.add('hidden');
      closeShelf();
      if (inGrocery) leaveGrocery();
      tapStall();
    });
    list.appendChild(sell);
    if (!state.wishlist.length) {
      const empty = document.createElement('div');
      empty.className = 'wish-empty';
      empty.textContent = `Nothing here yet. If something costs too much,
        it waits for you here!`;
      list.appendChild(empty);
    }
    for (const w of state.wishlist) {
      const item = BY_ID[w.id];
      const row = document.createElement('div');
      row.className = 'q-row';
      /* The daily deal follows its item onto the wishlist: Get it! charges
         the sale price and runs the compute-it moment, exactly like the
         shelf tap (trips dodge this conflict by exclusion; the wishlist
         meets it head on). The sale price stays a mystery here too. */
      const onDeal = deal && deal.itemId === w.id;
      /* TODAY's price, not the one she wished at. Shelf prices are date
         seeded (shelfPrice(itemId, day) in data/items.js), so a wish made
         yesterday used to show and CHARGE yesterday's number while the shelf
         two taps away showed a different one for the same thing. In a game
         whose whole subject is what things cost, the shelf has to be the
         truth. w.price stays in the save (the schema is frozen and sim
         verified) and is simply no longer read. */
      const base = priceFor(w.id);
      const cost = onDeal ? deal.sale : base;
      const can = engine.canAfford(cost) && state.aisles.includes(item.aisle);
      row.innerHTML = `
        <img alt="" src="${world.thumbnail(item)}">
        <span class="q-name">${item.name}</span>
        <span class="q-price">${onDeal ? `<s>$${deal.base}</s> $?` : '$' + base}</span>
        ${can ? '<button class="mini-btn">Get it!</button>' : ''}`;
      if (can) {
        row.querySelector('button').addEventListener('click', () => {
          /* Re-check at tap time AND at arrival: the sheet can sit open
             while purchases behind it drain the wallet, and a stale
             Get it! must degrade to a toast, never a throw. The mode
             guard keeps a stray tap from hijacking a live stand session
             or the room (Phase 4 review finding). */
          if (!panelsAllowed()) return;
          if (!state.wishlist.some(x => x.id === w.id) || !engine.canAfford(cost)) {
            openWish();
            return;
          }
          $('wish').classList.add('hidden');
          closeShelf();
          goToAisle(item.aisle, () => {
            if (engine.canAfford(cost)) openBuy(item, cost, onDeal ? deal : null);
            else toast('Not enough money yet! It is still on your wishlist. ★');
          });
        });
      }
      list.appendChild(row);
    }
    $('wish').classList.remove('hidden');
  }
  $('wishBtn').addEventListener('click', () => showPanel(openWish));
  $('wishClose').addEventListener('click', () => closePanel('wish'));

  /* ---- catalog book (Phase 5) ---- */
  function openBook() {
    const host = $('bookList');
    host.innerHTML = '';
    for (const a of AISLES) {
      const open = state.aisles.includes(a.id);
      const head = document.createElement('div');
      head.className = 'book-sec';
      head.textContent = AISLE_NAMES[a.id] + (open ? '' : ' (opens later!)');
      host.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'book-grid';
      const all = [...itemsForAisle(a.id), ...RARES.filter(r => r.aisle === a.id)];
      for (const item of all) {
        const found = (state.found[item.id] || 0) > 0;
        const cell = document.createElement('div');
        cell.className = 'book-cell' + (item.rare ? ' rare' : '') + (found ? ' found' : '');
        const today = rare && rare.itemId === item.id;
        const onDeal = deal && deal.itemId === item.id;
        cell.innerHTML = `
          ${today ? '<span class="badge badge-rare">Today!</span>'
            : onDeal ? `<span class="badge badge-deal">$${deal.off} off!</span>` : ''}
          <img alt="" src="${world.thumbnail(item, { silhouette: !found })}">
          <span class="book-name">${!found && item.rare ? '???' : item.name}</span>`;
        grid.appendChild(cell);
      }
      host.appendChild(grid);
    }
    $('book').classList.remove('hidden');
  }
  $('bookBtn').addEventListener('click', () => showPanel(openBook));
  $('bookClose').addEventListener('click', () => closePanel('book'));

  /* ---- boot ---- */
  /* First-run beat (clarity review): before anything else, one small card
     names her bunny and the one verb everything depends on. The modal
     layer blocks canvas taps while it is up; the bunny joy-jumps behind
     it. kv flag, not a save field: the engine save schema stays frozen
     and wipe() clears it, so a reset reteaches. */
  function firstHint(key, msg) {
    if (kvLoad(key, 0)) return;
    kvStore(key, 1);
    toast(msg, 2800);
  }
  hud();
  /* First run. Two short cards in the order a child actually needs them:
     which animal am I, then what is the one thing I can do. The shopping
     list is not mentioned and its chips are off screen: until the road
     opens there is nothing to shop for, and the old boot sheet sent a brand
     new player on a 64 tile walk to a store before she had earned a cent. */
  const INTRO_STEPS = [
    {
      title: 'This is you!',
      msg: 'You are the bunny with the orange arrow over her head.',
      btn: 'Hi!'
    },
    {
      title: 'This is your lemonade stand!',
      msg: 'Friends will come and buy cups from you. Tap the red and white stand to open it.',
      btn: 'OK!'
    }
  ];
  if (!kvLoad('intro', 0)) {
    let step = 0;
    const showStep = () => {
      const s = INTRO_STEPS[step];
      $('introTitle').textContent = s.title;
      $('introMsg').textContent = s.msg;
      $('introGo').textContent = s.btn;
      $('intro').classList.remove('hidden');
      if (step === 0) world.avatarJump();
    };
    $('introGo').addEventListener('click', () => {
      step++;
      if (step < INTRO_STEPS.length) { showStep(); return; }
      kvStore('intro', 1);
      $('intro').classList.add('hidden');
      toast('Tap your lemonade stand!', 3600);
    });
    showStep();
  } else if (zonesOpen.has('road')) {
    openQuest();
  }

  /* The room owns the canvas while mode is 'room', the grocery interior
     while she is inside it (including its shelf and buy overlays); the
     town otherwise. */
  function scene3d() { return mode === 'room' ? room : inGrocery ? grocery : world; }

  let last = performance.now();
  function loop(t) {
    /* A thrown frame must never kill the loop: a frozen game is the one
       failure a young player cannot recover from. */
    try {
      const s = scene3d();
      s.step(t - last);
      s.frame();
      tickGoal(t - last);
    } catch (e) {
      console.error(e);
    }
    last = t;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* Test and dev hooks. The browser pane freezes rAF, so __mm.step/frame
     drive the world by hand there. */
  return {
    engine, state, world, room, grocery,
    /* The browser pane freezes rAF, so the goal pill has to advance from
       the test hook too or it reads as permanently stale in every check. */
    step: ms => { const s = scene3d(); s.step(ms); s.frame(); tickGoal(ms); },
    frame: () => scene3d().frame(),
    debug: {
      day, rare, deal, season,
      newTrip: () => { newTrip(); hud(); openQuest(); },
      seedWallet(n) { state.wallet = n; saveSave(state); hud(); },
      forceMech(m) { forcedMech = m || null; },
      openStand: tapStall,
      standNext: id => stand.debugForce(id),
      openRoom: tapHouse,
      exitRoom,
      openGrocery: tapGrocery,
      exitGrocery: () => { if (mode === 'grocery') leaveGrocery(); },
      zone: () => world.zone(),
      walkTo: (x, z) => { if (mode === 'plaza') world.walkTo(x, z); },
      setSeason: s => world.setSeason(s),
      /* Grant an item as if bought (found + room placement), for catalog
         and room testing without grinding the wallet. */
      give(id) {
        const item = BY_ID[id];
        if (!item) return;
        state.found[id] = (state.found[id] || 0) + 1;
        if (item.wallpaper) state.deco.wallpaper = id;
        else if (item.aisle === 'home') placeInRoom(state, item);
        saveSave(state);
        if (room.isActive()) room.rebuild();
      },
      openShelf, openBuy: (id, price) => openBuy(BY_ID[id], price),
      unlockAll() {
        state.aisles = AISLES.map(a => a.id);
        state.standSessions = STAND_SESSIONS_TO_OPEN;
        for (const t of Object.keys(state.tiers)) {
          const rec = state.tiers[t];
          rec.mastered = true;
          if (rec.stage !== null) rec.stage = 2;
        }
        saveSave(state);
        for (const a of AISLES) world.setAisleOpen(a.id, true, false);
        zonesOpen = openZones(state);
        world.setZones(zonesOpen);
        hud();
      },
      /* Town zones. sessions(n) sets the stand counter and re-derives the
         open set, so sessions(3) is "open the road" without playing it. */
      zones: () => [...zonesOpen],
      nextZone: () => nextZone(zonesOpen),
      sessions(n) {
        state.standSessions = n;
        saveSave(state);
        refreshZones();
      },
      setStage(tier, n) {
        const rec = state.tiers[tier];
        rec.stage = n;
        rec.mark = rec.seq;
        saveSave(state);
      },
      reset() {
        wipe();
        location.reload();
      }
    }
  };
}
