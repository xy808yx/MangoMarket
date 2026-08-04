/* Mango Market room (Phase 5). Her own corner of the world: home-goods
   purchases land here, drag arranges them, a quick tap spins them, and
   wallpaper purchases dress the walls. Pure sandbox: no math, no fail
   states, nothing to get wrong (SPEC: "money stays meaningful forever").

   Shares the world's renderer and the Juicy Pop palette; owns its own
   scene, camera, tweens and pointer handlers. All handlers are gated by
   the active flag so plaza and room never both react to a touch. */

import * as THREE from '../vendor/three.module.js';
import { buildVoxGroup, buildBunny } from './world.js';
import { play } from './sfx.js';

const FLOOR_SPOTS = [
  [-2.4, -2.4], [0, -2.7], [2.4, -2.4], [-2.7, 0], [2.7, 0.2],
  [-1.9, 1.9], [1.9, 1.9], [0, 1.1], [-1.1, -1.1], [1.2, -1.0],
  [2.8, 2.8], [-2.8, 2.8]
];
/* Wall anchors sit clear of the door (x -2.78..-1.62) and the window
   (x 0.75..2.45). */
const WALL_SPOTS = [0.2, -1.0, 3.0];
const WALL_Z = -3.55;
const DEFAULT_WALLPAPER = [0xFFF6EA, 0xF2E3C8];

/* Auto-placement on purchase: the first free anchor spot. Overlap when the
   room is stuffed is allowed on purpose; she can drag things apart. */
export function placeInRoom(state, item) {
  if (item.wall) {
    const used = state.room.filter(r => r.wall).map(r => r.x);
    const x = WALL_SPOTS.find(s => !used.some(u => Math.abs(u - s) < 0.6)) ?? 0.2;
    state.room.push({ id: item.id, x, z: WALL_Z, ry: 0, wall: true });
    return;
  }
  const spot = FLOOR_SPOTS.find(s =>
    !state.room.some(r => !r.wall && Math.hypot(r.x - s[0], r.z - s[1]) < 0.9)) || [0, 0];
  state.room.push({ id: item.id, x: spot[0], z: spot[1], ry: 0 });
}

export function createRoom({ canvas, renderer, palette, state, itemsById, persist, onWallpaper }) {
  const P = palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);

  function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
  function box(parent, w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.noCast !== true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC9B99A, 1.15));
  const sun = new THREE.DirectionalLight(0xFFF6E8, 1.9);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  /* Floor: warm plank checker, same tile grammar as the plaza. */
  const woodA = mat(0xE0B27A), woodB = mat(0xD6A466);
  for (let x = -4; x <= 3; x++) {
    for (let z = -4; z <= 3; z++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), (x + z) & 1 ? woodB : woodA);
      t.position.set(x + 0.5, -0.15, z + 0.5);
      t.receiveShadow = true;
      scene.add(t);
    }
  }

  /* Walls in strips so wallpaper is a recolor, not a rebuild. */
  const wallGroup = new THREE.Group();
  const stripMats = [mat(DEFAULT_WALLPAPER[0]), mat(DEFAULT_WALLPAPER[1])];
  for (let i = 0; i < 16; i++) {
    box(wallGroup, 0.5, 3.4, 0.3, -3.75 + i * 0.5, 1.7, -4.15, stripMats[i & 1], { noCast: true });
    box(wallGroup, 0.3, 3.4, 0.5, -4.15, 1.7, -3.75 + i * 0.5, stripMats[i & 1], { noCast: true });
  }
  const trim = mat(0xB0713B);
  box(wallGroup, 8.3, 0.24, 0.34, 0, 0.12, -4.14, trim, { noCast: true });
  box(wallGroup, 0.34, 0.24, 8.3, -4.14, 0.12, 0, trim, { noCast: true });
  box(wallGroup, 8.3, 0.2, 0.36, 0, 3.32, -4.13, trim, { noCast: true });
  box(wallGroup, 0.36, 0.2, 8.3, -4.13, 3.32, 0, trim, { noCast: true });
  scene.add(wallGroup);

  /* Window with sky, and the front door she came in through. */
  const winFrame = mat(0xFFFDF4);
  box(scene, 1.7, 1.5, 0.12, 1.6, 2.0, -4.02, winFrame, { noCast: true });
  box(scene, 1.34, 1.14, 0.12, 1.6, 2.0, -3.98, mat(P.sky), { noCast: true });
  box(scene, 0.1, 1.14, 0.13, 1.6, 2.0, -3.96, winFrame, { noCast: true });
  box(scene, 1.34, 0.1, 0.13, 1.6, 2.0, -3.96, winFrame, { noCast: true });
  box(scene, 1.15, 2.3, 0.14, -2.2, 1.15, -4.0, mat(0x8E5A2E), { noCast: true });
  box(scene, 0.16, 0.16, 0.16, -1.85, 1.1, -3.9, mat(0xFFD34D), { noCast: true });

  const bunny = buildBunny(scene);
  bunny.position.set(1.6, 0, 1.8);
  bunny.rotation.y = -0.6;

  /* ---- camera ---- */
  let camera = null;
  function resize() {
    /* 0x0 pre-layout pane viewport: fall back, see world.resize. */
    const w = canvas.clientWidth || innerWidth || 1024;
    const h = canvas.clientHeight || innerHeight || 768;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = Math.max(9.6, 11.6 / aspect);
    camera = new THREE.OrthographicCamera(
      -viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 0.1, 100);
    camera.position.set(8, 8.5, 8);
    camera.lookAt(-0.4, 0.9, -0.4);
  }
  resize();
  addEventListener('resize', () => { if (active) resize(); });

  /* ---- tweens (same shape as the world's) ---- */
  let now = 0;
  const tweens = [];
  function addTween(dur, fn, done) { tweens.push({ t0: now, dur, fn, done }); }

  function step(dt) {
    now += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(t);
      if (t >= 1) {
        tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
    }
  }

  function frame() { renderer.render(scene, camera); }

  /* Bunny hops in her room exactly like outside. */
  let hopGen = 0;
  function hopTo(tx, tz) {
    const gen = ++hopGen;
    const from = { x: bunny.position.x, z: bunny.position.z };
    const dx = tx - from.x, dz = tz - from.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.95));
    bunny.rotation.y = Math.atan2(dx, dz);
    let i = 0;
    function nextHop() {
      if (gen !== hopGen) return;
      if (i >= n) { bunny.scale.set(1, 1, 1); return; }
      i++;
      const sx = bunny.position.x, sz = bunny.position.z;
      const hx = from.x + dx * i / n, hz = from.z + dz * i / n;
      play('hop');
      addTween(175, t => {
        /* A superseded (or exited-and-frozen) chain's in-flight tween must
           never write position again, or it replays over the fresh entry
           hop on the next enter(). */
        if (gen !== hopGen) return;
        bunny.position.x = sx + (hx - sx) * t;
        bunny.position.z = sz + (hz - sz) * t;
        bunny.position.y = 0.5 * 4 * t * (1 - t) * 0.9;
        const sq = 0.86 + Math.sin(Math.PI * t) * 0.26;
        const hs = 1 + (1 - sq) * 0.5;
        bunny.scale.set(hs, sq, hs);
      }, nextHop);
    }
    nextHop();
  }

  /* ---- furniture ---- */
  const furniture = new THREE.Group();
  scene.add(furniture);

  function disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  function rebuild() {
    for (const child of furniture.children.slice()) {
      furniture.remove(child);
      disposeGroup(child);
    }
    for (const entry of state.room) {
      const item = itemsById[entry.id];
      if (!item) continue;
      const g = buildVoxGroup(item.vox);
      g.scale.setScalar(1.15);
      if (entry.wall) g.position.set(entry.x, 1.15, WALL_Z);
      else g.position.set(entry.x, 0, entry.z);
      g.rotation.y = entry.ry || 0;
      g.userData.entry = entry;
      furniture.add(g);
    }
    applyWallpaper();
  }

  function applyWallpaper() {
    const wp = state.deco.wallpaper && itemsById[state.deco.wallpaper];
    const colors = (wp && wp.wallpaper) || DEFAULT_WALLPAPER;
    stripMats[0].color.set(colors[0]);
    stripMats[1].color.set(colors[1]);
  }

  /* ---- touch: drag moves, a quick tap spins, floor taps hop, wall taps
     cycle owned wallpapers ---- */
  let active = false;
  let drag = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z);
  const hit3 = new THREE.Vector3();

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
  }

  canvas.addEventListener('pointerdown', e => {
    if (!active) return;
    setRay(e);
    const hits = ray.intersectObjects(furniture.children, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.entry) o = o.parent;
      if (o) {
        drag = { g: o, entry: o.userData.entry, moved: false };
        return;
      }
    }
    if (ray.intersectObjects(wallGroup.children, false).length) {
      cycleWallpaper();
      return;
    }
    if (ray.ray.intersectPlane(floorPlane, hit3)) {
      const x = Math.max(-3.4, Math.min(3.4, hit3.x));
      const z = Math.max(-3.4, Math.min(3.4, hit3.z));
      hopTo(x, z);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!active || !drag) return;
    setRay(e);
    const plane = drag.entry.wall ? wallPlane : floorPlane;
    if (!ray.ray.intersectPlane(plane, hit3)) return;
    drag.moved = true;
    if (drag.entry.wall) {
      const x = Math.max(-3.1, Math.min(3.1, Math.round(hit3.x * 4) / 4));
      drag.entry.x = x;
      drag.g.position.x = x;
    } else {
      const x = Math.max(-3.3, Math.min(3.3, Math.round(hit3.x * 4) / 4));
      const z = Math.max(-3.3, Math.min(3.3, Math.round(hit3.z * 4) / 4));
      drag.entry.x = x;
      drag.entry.z = z;
      drag.g.position.set(x, 0, z);
    }
  });

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved && !d.entry.wall) {
      /* A tap, not a drag: spin it a quarter turn with a little pop. */
      d.entry.ry = ((d.entry.ry || 0) + Math.PI / 2) % (Math.PI * 2);
      const from = d.g.rotation.y;
      const to = d.entry.ry;
      addTween(220, t => {
        d.g.rotation.y = from + (to - from < -Math.PI ? to + Math.PI * 2 - from : to - from) * t;
        const s = 1.15 * (1 + Math.sin(Math.PI * t) * 0.12);
        d.g.scale.setScalar(s);
      }, () => d.g.scale.setScalar(1.15));
    }
    persist(state);
  }
  canvas.addEventListener('pointerup', () => { if (active) endDrag(); });
  canvas.addEventListener('pointercancel', () => { if (active) endDrag(); });

  function cycleWallpaper() {
    const owned = Object.keys(itemsById)
      .map(id => itemsById[id])
      .filter(it => it.wallpaper && (state.found[it.id] || 0) > 0);
    if (!owned.length) return;
    const ids = [null, ...owned.map(it => it.id)];
    const at = ids.indexOf(state.deco.wallpaper);
    state.deco.wallpaper = ids[(at + 1) % ids.length];
    persist(state);
    applyWallpaper();
    if (onWallpaper) onWallpaper(state.deco.wallpaper);
  }

  function enter() {
    rebuild();
    resize();
    active = true;
    bunny.position.set(2.6, 0, 2.8);
    bunny.rotation.y = -0.7;
    hopTo(1.2, 1.4);
  }

  function exit() {
    active = false;
    drag = null;
  }

  /* World point -> client coords under the current camera. Test hook: the
     pane drives drags with dispatched PointerEvents and needs real
     targets. */
  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + (v.x + 1) / 2 * r.width,
      y: r.top + (1 - (v.y + 1) / 2) * r.height
    };
  }

  return { scene, step, frame, resize, enter, exit, rebuild, project, isActive: () => active };
}
