/* Mango Market sound (Phase 6). Two layers, both optional at runtime:

   1. SFX: tiny WebAudio synth cues, no files, fully offline. Positive and
      neutral moments only: NO sound ever plays on a wrong answer (no-fail
      rule; silence is the gentlest response the game has).
   2. Music: looped ambient MP3s generated offline and dropped into
      assets/audio/ (day.mp3, evening.mp3). Missing files are normal and
      silent: the game must play identically with an empty audio folder.

   iOS unlocks audio only inside a user gesture, so the context is created
   lazily and resumed by a document-level pointerdown listener. Every public
   call is try/catch no-throw: a sound must never be able to break the game.
   Engine and save stay headless; only UI-side modules import this file. */

const MUSIC_FILES = { day: 'assets/audio/day.mp3', evening: 'assets/audio/evening.mp3' };
const MUSIC_GAIN = 0.32;

let ctx = null;
let master = null;
let musicMode = null;      /* 'day' | 'evening', chosen at boot */
let musicSource = null;
let musicBuffer = null;
let musicLoadState = 'idle'; /* idle | loading | ready | missing */

/* Per-cue floor between plays: the hop cue at 122ms hops must patter, not
   machine-gun, a mashed keypad should tick, not buzz, and the celebration
   cues must never stack sample-aligned (the same tick can legitimately ask
   for fanfare twice: an unlock landing on the list's last item). */
const RATE_MS = { hop: 150, tick: 45, thunk: 90, chime: 250, ching: 200, fanfare: 350 };
const lastPlay = {};

function ensureCtx() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  return ctx;
}

/* One enveloped oscillator note. All cues are built from these. */
function note({ freq, at = 0, dur = 0.12, type = 'sine', gain = 0.15, to = null }) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const CUES = {
  /* Crossy-style hop patter: quiet, short, slightly rising. */
  hop() { note({ freq: 300, to: 390, dur: 0.06, type: 'sine', gain: 0.055 }); },
  /* Keypad key press: a soft neutral tick, felt more than heard. */
  tick() { note({ freq: 950, dur: 0.03, type: 'triangle', gain: 0.05 }); },
  /* Right answer lands (deal solved, stand total right): warm two-note. */
  chime() {
    note({ freq: 659, dur: 0.14, type: 'triangle', gain: 0.16 });
    note({ freq: 880, at: 0.09, dur: 0.2, type: 'triangle', gain: 0.16 });
  },
  /* Money moment: the cha-ching when a sale completes or the stand earns. */
  ching() {
    note({ freq: 150, dur: 0.06, type: 'sine', gain: 0.12 });
    note({ freq: 987, at: 0.05, dur: 0.16, type: 'triangle', gain: 0.14 });
    note({ freq: 1319, at: 0.1, dur: 0.28, type: 'triangle', gain: 0.16 });
  },
  /* Unlock pop and list-done celebration: a little ascending fanfare. */
  fanfare() {
    const steps = [523, 659, 784, 1047];
    steps.forEach((f, i) =>
      note({ freq: f, at: i * 0.075, dur: 0.16, type: 'triangle', gain: 0.15 }));
  },
  /* A bill lands in the drawer tray: soft paper thunk. */
  thunk() { note({ freq: 240, to: 160, dur: 0.07, type: 'sine', gain: 0.11 }); }
};

export function play(name) {
  try {
    if (!ctx || ctx.state !== 'running') return;
    const cue = CUES[name];
    if (!cue) return;
    const now = performance.now();
    const floor = RATE_MS[name] || 0;
    if (floor && lastPlay[name] && now - lastPlay[name] < floor) return;
    lastPlay[name] = now;
    cue();
  } catch { /* sound must never break the game */ }
}

/* ---- music (Suno wiring, silent fallback) ---- */

function startMusicLoop() {
  if (!musicBuffer || musicSource || !ctx || ctx.state !== 'running') return;
  musicSource = ctx.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.loop = true;
  const g = ctx.createGain();
  g.gain.value = MUSIC_GAIN;
  musicSource.connect(g);
  g.connect(master);
  musicSource.start();
}

function loadMusic() {
  if (musicLoadState !== 'idle' || !musicMode || !ctx) return;
  const url = MUSIC_FILES[musicMode];
  if (!url) { musicLoadState = 'missing'; return; }
  musicLoadState = 'loading';
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('no track');
      return res.arrayBuffer();
    })
    .then(buf => ctx.decodeAudioData(buf))
    .then(decoded => {
      musicBuffer = decoded;
      musicLoadState = 'ready';
      startMusicLoop();
    })
    .catch(() => {
      /* Missing or undecodable track is the expected state until the MP3s
         are added. Silent, once, no retry churn. */
      musicLoadState = 'missing';
    });
}

/* Resume the context if it is not running (iOS reports 'suspended' after
   backgrounding and the NON-STANDARD 'interrupted' after a call, Siri or
   an alarm takes the audio session), then start the music loop once it is.
   startMusicLoop is idempotent, so calling it eagerly is always safe; the
   .then covers the decode-finished-while-suspended race. */
function wake() {
  if (!ctx) return;
  if (ctx.state !== 'running') {
    const p = ctx.resume();
    if (p && p.then) p.then(startMusicLoop).catch(() => {});
  }
  startMusicLoop();
}

/* Boot-time init. mode picks which ambient track this session wants. */
export function initSfx({ mode = 'day' } = {}) {
  try {
    musicMode = mode;
    /* PERMANENT gesture listener: a one-shot would leave no recovery from
       the iOS 'interrupted' state (Siri and call banners do not toggle
       document.hidden, so visibilitychange never sees them; the player's next
       tap is the only reliable wake signal). One state check per tap is
       free; removing the listener buys nothing. */
    document.addEventListener('pointerdown', () => {
      try {
        if (!ensureCtx()) return;
        loadMusic();
        wake();
      } catch { /* no audio: fine */ }
    });
    /* iOS suspends the context when the PWA backgrounds; wake it with the
       page so the music does not stay dead after a home-screen round trip. */
    document.addEventListener('visibilitychange', () => {
      try {
        if (!document.hidden) wake();
      } catch { /* fine */ }
    });
  } catch { /* fine */ }
}
