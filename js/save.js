/* Mango Market storage. store/load with mangomarket_ keys (Math Blaster
   pattern), plus the save schema. Headless-safe: falls back to an in-memory
   map when localStorage is unavailable so tools/sim.mjs can run under node. */

import { STAND_SESSIONS_TO_OPEN } from './zones.js';

const PREFIX = 'mangomarket_';

function memoryBackend() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

function pickBackend() {
  try {
    const ls = globalThis.localStorage;
    ls.setItem(PREFIX + 'probe', '1');
    ls.removeItem(PREFIX + 'probe');
    return ls;
  } catch {
    return memoryBackend();
  }
}

let backend = pickBackend();

/* Sims call setBackend() with no argument to get a fresh in-memory store. */
export function setBackend(b) { backend = b || memoryBackend(); }

export function store(k, v) { backend.setItem(PREFIX + k, JSON.stringify(v)); }

/* Remove ONLY this game's keys. Several apps share this GitHub Pages
   origin, so a blanket localStorage.clear() would wipe their saves too. */
export function wipe() {
  try {
    const doomed = Object.keys(globalThis.localStorage)
      .filter(k => k.startsWith(PREFIX));
    for (const k of doomed) globalThis.localStorage.removeItem(k);
  } catch { /* no localStorage: nothing to wipe */ }
}

export function load(k, d) {
  const raw = backend.getItem(PREFIX + k);
  if (raw === null || raw === undefined) return d;
  try { return JSON.parse(raw); } catch { return d; }
}

export const SAVE_VERSION = 1;

/* One record per fact class. stage is the scaffold stage (0 full column,
   1 column without guided borrowing, 2 gone) and stays null on tiers that
   never get the column. mark is the seq at the last stage change; fade and
   regress windows only look at entries after it. hist entries are
   {q seq, ok firstTry, a assisted, be borrowError, st stageAtSubmit, d day}. */
function tierRecord(scaffolded) {
  return { hist: [], seq: 0, mark: 0, stage: scaffolded ? 0 : null, mastered: false };
}

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    wallet: 20,
    day: 0,
    tiers: {
      single: tierRecord(false),
      teens: tierRecord(false),
      two_easy: tierRecord(false),
      two_borrow: tierRecord(true),
      three: tierRecord(true)
    },
    aisles: ['produce'],
    wishlist: [],
    drawer: { n: 0, ok: 0 },
    days: {},
    /* Completed lemonade stand sessions. The only stored input to the town
       zone ladder (js/zones.js); every other chunk is derived from aisles.
       The engine never reads it: stand.js counts, store.js persists. */
    standSessions: 0,
    /* Phase 5. found: itemId -> times bought (catalog reveal). room: placed
       furniture [{id, x, z, ry}]. deco: {wallpaper: itemId|null}. */
    found: {},
    room: [],
    deco: { wallpaper: null },
    /* The 72 fluency facts, keyed "15-8". One record per fact she has
       actually met, created lazily, so a fresh save carries an empty object
       rather than 72 empty rows. Shape is engine.js factRecord():
       {n, ok, run, bridge, miss, lastOk}. The tier records above gate the
       aisles; these carry the shopping steer and the parent grid. */
    facts: {}
  };
}

export function loadSave() {
  const s = load('save', null);
  if (!s || typeof s !== 'object') return defaultSave();
  return migrate(s);
}

export function saveSave(s) { store('save', s); }

/* Migrations must never wipe progress. Missing fields are filled from the
   defaults; version steps get added here as the schema grows. */
function migrate(s) {
  const def = defaultSave();
  /* Town zones arrived after people were already playing. A save with any
     progress at all must never wake up fenced back into the market square,
     so credit it the sessions the road costs. New saves are untouched. */
  const preZones = !('standSessions' in s);
  for (const k of Object.keys(def)) {
    if (!(k in s)) s[k] = def[k];
  }
  if (preZones) {
    const played = (s.aisles && s.aisles.length > 1)
      || (s.drawer && s.drawer.n > 0)
      || Object.values(s.tiers || {}).some(t => t && t.seq > 0);
    if (played) s.standSessions = STAND_SESSIONS_TO_OPEN;
  }
  for (const t of Object.keys(def.tiers)) {
    if (!(t in s.tiers)) s.tiers[t] = def.tiers[t];
  }
  /* An imported or hand-edited save can carry anything here. The engine
     indexes facts by key and would happily write onto an array or a string,
     so a bad shape is replaced rather than trusted. Losing fact history costs
     the steer and the parent grid, never the wallet or the aisles. */
  if (!s.facts || typeof s.facts !== 'object' || Array.isArray(s.facts)) s.facts = {};
  s.v = SAVE_VERSION;
  return s;
}
