/* Mango Market town zones (Aug 4 2026).

   The design call: make the lemonade stand the first and only thing she
   can do, then unlock chunks of the world as she passes it. She should
   not be able to wander everywhere at the very beginning.

   So the town opens in chunks. A fresh save is fenced into the market
   square with exactly one thing to do: run the lemonade stand, which is
   pure subtraction. Each chunk after that is earned.

     plaza   her market square and the stand      open from the start
     road    the ring road and the food store     multiple stand sessions
     park    the lake, the dock, the playground   bakery opens
     shops   the toy, gadget and home stores      toys opens
     home    her house and garden                 gadgets opens
     grove   the mango grove                      home goods opens

   Every aisle the engine can open lives inside a zone that is already open
   by the time the engine opens it, so she can always reach the math she
   just earned. That ordering is load-bearing: check it before reordering.

   This module is pure data plus one derivation and is safe to import
   anywhere, including save.js and the headless sims. */

/* How many completed stand sessions open the road. The brief said
   "multiple" sessions, so the first chunk costs three: enough the stand is
   genuinely the game for her first sitting, few enough that a young player sees the
   reward the same day. Each session is 2 to 3 customers at the starting
   frontier, and every customer is a subtraction problem. */
export const STAND_SESSIONS_TO_OPEN = 3;

/* Ladder order. Index doubles as the zone byte in world.js's tile map, so
   the two must stay in step. */
export const ZONE_ORDER = ['plaza', 'road', 'park', 'shops', 'home', 'grove'];

export const ZONE_INFO = {
  plaza: {
    label: 'your market square',
    title: 'Your market square',
    msg: 'This is home!'
  },
  road: {
    label: 'the food store',
    title: 'The road is open!',
    /* The walk verb is taught HERE, not at boot. Inside the fenced market
       square there is nowhere to walk to, so a boot card about tapping the
       grass teaches a move she has no use for yet. */
    msg: 'Tap the ground to walk. Follow the road to the food store and spend your money!',
    go: 'Go to the store!'
  },
  park: {
    label: 'the park',
    title: 'The park is open!',
    msg: 'There is a lake, a slide and swings past the road. Go play!',
    go: 'Go to the park!'
  },
  shops: {
    label: 'the shops',
    title: 'The shops are open!',
    msg: 'Toys, gadgets and things for your house are down the east road now.',
    go: 'Go to the shops!'
  },
  home: {
    label: 'your house',
    title: 'Your house is open!',
    msg: 'You have your own house and garden now. Go and make your room nice!',
    go: 'Go to your house!'
  },
  grove: {
    label: 'the mango grove',
    title: 'The mango grove is open!',
    msg: 'A whole forest of mango trees, just for you.',
    go: 'Go see the mangoes!'
  }
};

/* Which zones are open, derived from save state. Deliberately NOT stored:
   a derived set can never drift out of step with the progress it stands
   for, and there is nothing extra to migrate. */
export function openZones(state) {
  const aisles = state.aisles || [];
  const won = {
    plaza: true,
    road: (state.standSessions || 0) >= STAND_SESSIONS_TO_OPEN,
    park: aisles.includes('bakery'),
    shops: aisles.includes('toys'),
    home: aisles.includes('electronics'),
    grove: aisles.includes('home')
  };
  /* Prefix rule: every zone hangs off the ring road, so a later zone can
     never stand open behind a fence she has not earned yet. Earning any
     zone opens everything below it. Without this an unusually strong
     player could master a tier from stand sales alone and win a chunk she
     has no path to. */
  const open = new Set();
  let earned = false;
  for (let i = ZONE_ORDER.length - 1; i >= 0; i--) {
    if (won[ZONE_ORDER[i]]) earned = true;
    if (earned) open.add(ZONE_ORDER[i]);
  }
  return open;
}

/* The next chunk she has not earned, for the goal pill and the stand's
   progress stars. Returns null once the whole town is open. */
export function nextZone(open) {
  return ZONE_ORDER.find(z => !open.has(z)) || null;
}
