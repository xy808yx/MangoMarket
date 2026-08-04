/* Mango Market entry point. Boots the game, then the parent panel gate
   (Phase 6) on top of it. */

import { initGame } from './store.js';
import { initParent } from './parent.js';

/* No SW on localhost: its cache-first fetch handler serves stale code during
   dev and has burned every test round that forgot to unregister it. */
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

/* Test and dev hooks (used by the browser-pane verification loop, which
   freezes rAF: __mm.step(ms) pumps the world by hand). */
window.__mm = initGame();
window.__mm.debug.openParent = initParent(window.__mm.engine).debugOpen;
