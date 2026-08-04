/* Mango Market grocery interior (world expansion, Aug 3 2026). The walk-in
   store behind the big mango sign: produce and bakery live here as real
   shelf gondolas, a cooler hums on the back wall, the mango display greets
   her by the door (golden on rare stock days), and Sunny, Benny's little
   cousin, runs the till.

   Same pattern as the room: shares the world's renderer and the Juicy Pop
   palette, owns its own scene, camera, tweens and pointer handlers, all
   gated by the active flag. Browsing math is store.js's job: tapping a
   gondola hands the aisle id back through onTapAisle and the ordinary
   shelf sheet takes over. A locked aisle wears a grey tarp like the
   outdoor stands; setAisleOpen pops it with the same flourish. */

import * as THREE from '../vendor/three.module.js';
import {
  buildVoxGroup, buildBunny, buildBear, buildTwinkle, stepTwinkles, AISLE_STYLE
} from './world.js';
import { itemsForAisle } from './data/items.js';
import { toast } from './ui.js';
import { play } from './sfx.js';

const GONDOLA_X = { produce: -1.7, bakery: 1.7 };

export function createGrocery({ canvas, renderer, palette, state, itemsById, onTapAisle, canMove }) {
  const P = palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);

  function mat(color) { return new THREE.MeshLambertMaterial({ color }); }
  function box(parent, w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = opts.noCast !== true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight(0xFFFCF2, 0xC9B99A, 1.2));
  const sun = new THREE.DirectionalLight(0xFFF3DC, 1.8);
  sun.position.set(6, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  /* Floor: cream and tan checker, a store-tile cousin of the room's planks. */
  const tileA = mat(0xF2E7CE), tileB = mat(0xEADCBB);
  for (let x = -6; x <= 5; x++) {
    for (let z = -4; z <= 3; z++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), (x + z) & 1 ? tileB : tileA);
      t.position.set(x + 0.5, -0.15, z + 0.5);
      t.receiveShadow = true;
      scene.add(t);
    }
  }

  /* Back and left walls, cream over a wood base, mango trim up top. */
  const wallM = mat(0xFFF6EA), base = mat(P.wood), trim = mat(P.mango);
  box(scene, 12.4, 3.2, 0.3, 0, 1.6, -4.15, wallM, { noCast: true });
  box(scene, 0.3, 3.2, 8.4, -6.15, 1.6, 0, wallM, { noCast: true });
  box(scene, 12.4, 0.34, 0.36, 0, 0.17, -4.14, base, { noCast: true });
  box(scene, 0.36, 0.34, 8.4, -6.14, 0.17, 0, base, { noCast: true });
  box(scene, 12.4, 0.24, 0.38, 0, 3.1, -4.13, trim, { noCast: true });
  box(scene, 0.38, 0.24, 8.4, -6.13, 3.1, 0, trim, { noCast: true });
  /* A window on the left wall so the sky peeks in. */
  box(scene, 0.14, 1.2, 1.9, -6.0, 1.9, -1.2, mat(P.sky), { noCast: true });
  box(scene, 0.16, 0.1, 1.9, -6.0, 1.28, -1.2, mat(0xFFFDF4), { noCast: true });

  /* Checkout, front left: counter, register, and Sunny on the till. */
  const counter = new THREE.Group();
  box(counter, 2.5, 1.0, 1.1, 0, 0.5, 0, base);
  box(counter, 2.7, 0.14, 1.3, 0, 1.05, 0, mat(0xC9995C), { noCast: true });
  box(counter, 0.5, 0.42, 0.4, 0.7, 1.33, -0.1, mat(0x2B2118));
  box(counter, 0.34, 0.1, 0.3, 0.7, 1.56, -0.1, mat(0xF04E3E), { noCast: true });
  counter.position.set(-4.2, 0, 1.7);
  counter.rotation.y = 1.57;
  counter.userData.helloTap = true;
  scene.add(counter);
  const sunny = buildBear(scene, -5.35, 1.7, { fur: 0xB98756, muzzle: 0xE8D2AC, scale: 0.8 });
  sunny.rotation.y = 1.57;
  sunny.userData.helloTap = true;

  /* The shared sparkle marks (see world.js buildTwinkle): gondolas sparkle
     only while open, the cooler and display follow produce. */
  const gTwinkles = [];

  /* A shelf gondola per food aisle: wood frame, accent trim, both faces
     stocked from the real catalog so the store IS the shelf sheet made
     flesh. Locked aisles wear the tarp. */
  function buildGondola(aisleId) {
    const g = new THREE.Group();
    const accent = mat(AISLE_STYLE[aisleId]);
    box(g, 1.2, 0.34, 4.8, 0, 0.17, 0, base);
    box(g, 0.9, 1.5, 4.5, 0, 0.9, 0, mat(0xE6D2AC));
    box(g, 1.14, 0.12, 4.62, 0, 0.85, 0, base, { noCast: true });
    box(g, 1.14, 0.12, 4.62, 0, 1.62, 0, base, { noCast: true });
    box(g, 1.0, 0.3, 4.7, 0, 1.85, 0, accent);
    const items = itemsForAisle(aisleId).filter(it => !it.bg).slice(0, 6);
    const goods = new THREE.Group();
    items.forEach((item, i) => {
      const row = Math.floor(i / 3);
      const zi = (i % 3) - 1;
      [-1, 1].forEach(side => {
        const model = buildVoxGroup(item.vox);
        model.scale.setScalar(0.42);
        model.position.set(side * 0.62, row ? 0.91 : 1.68, zi * 1.42 + side * 0.2);
        model.rotation.y = side * 1.57;
        goods.add(model);
      });
    });
    g.add(goods);
    const tarp = new THREE.Group();
    box(tarp, 1.5, 2.3, 5.0, 0, 1.15, 0, mat(0xCFC5B4));
    box(tarp, 1.56, 0.16, 5.06, 0, 0.5, 0, mat(0xB8AD9A));
    box(tarp, 0.12, 0.5, 0.9, 0.78, 1.5, 0, mat(P.wood));
    /* Wrapped-present dressing in the aisle's accent (clarity review): a
       locked gondola must read as "opens later", not "broken grey box".
       Two crossing ribbon bands and a simple bow knot. */
    box(tarp, 1.6, 0.34, 5.1, 0, 1.3, 0, accent, { noCast: true });
    box(tarp, 1.62, 2.34, 0.5, 0, 1.15, 0, accent, { noCast: true });
    box(tarp, 0.5, 0.34, 0.7, 0, 2.42, 0, accent);
    box(tarp, 0.3, 0.44, 0.36, 0, 2.44, 0, mat(0xFFF6EA));
    g.add(tarp);
    const tw = buildTwinkle(g, 0.7, 2.6, -1.2);
    g.position.set(GONDOLA_X[aisleId], 0, -0.6);
    g.userData.aisle = aisleId;
    scene.add(g);
    gTwinkles.push(tw);
    return { group: g, goods, tarp, twinkle: tw };
  }
  const gondolas = {
    produce: buildGondola('produce'),
    bakery: buildGondola('bakery')
  };

  /* Cooler on the back wall: blue glass, salmon and blueberries inside.
     Tapping it browses produce (that is where its stock lives). */
  const cooler = new THREE.Group();
  box(cooler, 2.6, 2.2, 0.9, 0, 1.1, 0, mat(0xD8E8EE));
  box(cooler, 2.2, 1.5, 0.2, 0, 1.25, 0.4, mat(0x9FD4E8), { noCast: true });
  box(cooler, 2.4, 0.16, 0.7, 0, 0.6, 0.05, mat(0xB8CBD9), { noCast: true });
  box(cooler, 2.4, 0.16, 0.7, 0, 1.35, 0.05, mat(0xB8CBD9), { noCast: true });
  box(cooler, 2.6, 0.26, 0.96, 0, 2.3, 0, mat(0x4A6FD4));
  const salmonItem = itemsById.salmon, blueItem = itemsById.blueberries;
  [[salmonItem, -0.6, 0.78], [blueItem, 0.55, 0.78], [salmonItem, 0.05, 1.52]].forEach(([item, ix, iy]) => {
    if (!item) return;
    const m = buildVoxGroup(item.vox);
    m.scale.setScalar(0.4);
    m.position.set(ix, iy, 0.1);
    cooler.add(m);
  });
  cooler.position.set(3.9, 0, -3.55);
  cooler.userData.aisle = 'produce';
  scene.add(cooler);
  const coolerTw = buildTwinkle(cooler, 1.0, 2.75, 0.3);
  gTwinkles.push(coolerTw);

  /* The mango display by the door. Golden mango on top on rare stock days:
     the comeback IS the loop. */
  const display = new THREE.Group();
  box(display, 1.6, 0.5, 1.1, 0, 0.25, 0, base);
  box(display, 1.4, 0.34, 0.95, 0, 0.55, 0, mat(0xC9995C));
  const mangoItem = itemsById.mango;
  if (mangoItem) {
    [[-0.42, 0.78, -0.1], [0.05, 0.78, 0.18], [0.5, 0.78, -0.14]].forEach(p => {
      const m = buildVoxGroup(mangoItem.vox);
      m.scale.setScalar(0.5);
      m.position.set(p[0], p[1], p[2]);
      m.rotation.y = p[0] * 2;
      display.add(m);
    });
  }
  let gold = null;
  if (itemsById.goldmango) {
    gold = buildVoxGroup(itemsById.goldmango.vox);
    gold.scale.setScalar(0.55);
    gold.position.set(0, 1.12, 0);
    gold.visible = false;
    display.add(gold);
  }
  display.position.set(4.3, 0, 2.3);
  display.rotation.y = -0.5;
  display.userData.aisle = 'produce';
  scene.add(display);
  const displayTw = buildTwinkle(display, -0.5, 1.55, 0.3);
  gTwinkles.push(displayTw);

  /* Warm ceiling pendants over the gondola alley (Phase 6 interior
     lighting). Hanging props: nothing touches the floor, so the collision
     AABBs below stay exactly as derived. */
  for (const pz of [-2.2, 0.9]) {
    box(scene, 0.06, 0.7, 0.06, 0, 2.95, pz, mat(0x8E5A2E), { noCast: true });
    box(scene, 0.55, 0.3, 0.55, 0, 2.5, pz, mat(P.mango), { noCast: true });
    const bulb = new THREE.MeshLambertMaterial({ color: 0xFFE9C0 });
    bulb.emissive = new THREE.Color(0xFFE9C0);
    bulb.emissiveIntensity = 2.2;
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), bulb);
    bm.position.set(0, 2.32, pz);
    scene.add(bm);
    const pt = new THREE.PointLight(0xFFD9A0, 12, 8);
    pt.position.set(0, 2.35, pz);
    scene.add(pt);
  }

  /* Door mat where she comes in. */
  box(scene, 1.6, 0.06, 0.9, -0.5, 0.03, 3.5, mat(P.awningA), { noCast: true });

  const bunny = buildBunny(scene);
  bunny.position.set(-0.5, 0, 3.2);
  bunny.rotation.y = Math.PI;

  /* ---- camera ---- */
  let camera = null;
  function resize() {
    /* 0x0 pre-layout pane viewport: fall back, see world.resize. */
    const w = canvas.clientWidth || innerWidth || 1024;
    const h = canvas.clientHeight || innerHeight || 768;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = Math.max(10.4, 12.8 / aspect);
    camera = new THREE.OrthographicCamera(
      -viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 0.1, 100);
    camera.position.set(7.6, 8.5, 7.6);
    camera.lookAt(-0.9, 0.8, -0.7);
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
    stepTwinkles(gTwinkles, now / 1000);
  }

  function frame() { renderer.render(scene, camera); }

  /* ---- interior collision (world-expansion review fix). The town grid's
     idea at half-tile scale: furniture AABBs block, floor taps land outside
     them, and hops route around, so she never walks through a gondola, the
     counter, Sunny or the cooler. The AABBs include the tarps and Sunny;
     re-derive them if any furniture moves. ---- */
  const BLOCKS = [
    [-2.45, -0.95, -3.1, 1.9],   /* produce gondola + tarp */
    [0.95, 2.45, -3.1, 1.9],     /* bakery gondola + tarp */
    [-5.9, -3.45, 0.25, 3.15],   /* checkout counter + Sunny */
    [2.5, 5.3, -4.0, -3.0],      /* cooler */
    [3.4, 5.2, 1.5, 3.1]         /* mango display */
  ];
  const FLOOR = { x0: -5.5, x1: 5.2, z0: -3.4, z1: 3.4 };
  const CELL = 0.5;
  const CW = Math.round((FLOOR.x1 - FLOOR.x0) / CELL) + 1;
  const CH = Math.round((FLOOR.z1 - FLOOR.z0) / CELL) + 1;
  const inBlock = (x, z) =>
    BLOCKS.some(b => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]);
  const cix = x => Math.max(0, Math.min(CW - 1, Math.round((x - FLOOR.x0) / CELL)));
  const ciz = z => Math.max(0, Math.min(CH - 1, Math.round((z - FLOOR.z0) / CELL)));
  const cwx = ix => FLOOR.x0 + ix * CELL;
  const cwz = iz => FLOOR.z0 + iz * CELL;
  const cellFree = new Uint8Array(CW * CH);
  for (let ix = 0; ix < CW; ix++) {
    for (let iz = 0; iz < CH; iz++) {
      cellFree[ix + iz * CW] = inBlock(cwx(ix), cwz(iz)) ? 0 : 1;
    }
  }
  const cOpen = (ix, iz) =>
    ix >= 0 && ix < CW && iz >= 0 && iz < CH && !!cellFree[ix + iz * CW];

  /* Nearest free cell, ties broken toward the bunny (same reasoning as the
     town's nearestOpen: a tap on the counter lands on her side of it). */
  function nearestFree(ix, iz, pix, piz) {
    if (cOpen(ix, iz)) return { ix, iz };
    for (let r = 1; r <= 12; r++) {
      let best = null, bestD = Infinity;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!cOpen(ix + dx, iz + dz)) continue;
          const d = (ix + dx - pix) ** 2 + (iz + dz - piz) ** 2;
          if (d < bestD) { bestD = d; best = { ix: ix + dx, iz: iz + dz }; }
        }
      }
      if (best) return best;
    }
    return { ix, iz };
  }

  /* Segment clear of every AABB? Sampled at 0.12 against the true boxes
     (max undetected graze 0.06, invisible), so the simplifier cannot cut a
     corner the grid refused. */
  function losClear(ax, az, bx, bz) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.12));
    for (let i = 1; i < n; i++) {
      if (inBlock(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return false;
    }
    return true;
  }

  /* BFS on the cell grid (8-dir, no corner cutting), then greedy
     line-of-sight simplification: the world's route() in miniature. */
  function cellPath(s, g) {
    if (s.ix === g.ix && s.iz === g.iz) return [s];
    const prev = new Int16Array(CW * CH).fill(-1);
    const q = [s.ix + s.iz * CW];
    prev[q[0]] = q[0];
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const kx = k % CW, kz = (k / CW) | 0;
      if (kx === g.ix && kz === g.iz) break;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const nx = kx + dx, nz = kz + dz;
          if (!cOpen(nx, nz)) continue;
          if (dx && dz && (!cOpen(kx + dx, kz) || !cOpen(kx, kz + dz))) continue;
          const nk = nx + nz * CW;
          if (prev[nk] >= 0) continue;
          prev[nk] = k;
          q.push(nk);
        }
      }
    }
    const gk = g.ix + g.iz * CW;
    if (prev[gk] < 0) return null;
    const out = [];
    for (let k = gk; ; k = prev[k]) {
      out.push({ ix: k % CW, iz: (k / CW) | 0 });
      if (prev[k] === k) break;
    }
    return out.reverse();
  }

  function routeIn(fx, fz, txw, tzw) {
    const s = nearestFree(cix(fx), ciz(fz), cix(fx), ciz(fz));
    let ex = txw, ez = tzw;
    if (inBlock(ex, ez)) {
      const g0 = nearestFree(cix(ex), ciz(ez), s.ix, s.iz);
      ex = cwx(g0.ix); ez = cwz(g0.iz);
    }
    if (losClear(fx, fz, ex, ez)) return [{ x: ex, z: ez }];
    const g = nearestFree(cix(ex), ciz(ez), s.ix, s.iz);
    const tiles = cellPath(s, g);
    if (!tiles) return [{ x: ex, z: ez }];
    const pts = tiles.map(t => ({ x: cwx(t.ix), z: cwz(t.iz) }));
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !losClear(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    const last = out.length ? out[out.length - 1] : pts[pts.length - 1];
    if (Math.hypot(ex - last.x, ez - last.z) > 1e-6 && losClear(last.x, last.z, ex, ez)) {
      out.push({ x: ex, z: ez });
    }
    if (!out.length) out.push({ x: ex, z: ez });
    return out;
  }

  /* Bunny hops in the store exactly like outside, now routed around the
     furniture. */
  let hopGen = 0;
  function hopTo(tx, tz) {
    const gen = ++hopGen;
    const pts = routeIn(bunny.position.x, bunny.position.z, tx, tz);
    const hops = [];
    let cx = bunny.position.x, cz = bunny.position.z;
    for (const p of pts) {
      const dx = p.x - cx, dz = p.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-9) { cx = p.x; cz = p.z; continue; }
      const n = Math.max(1, Math.ceil(dist / 0.95));
      for (let i = 1; i <= n; i++) {
        hops.push({ x: cx + dx * i / n, z: cz + dz * i / n });
      }
      cx = p.x; cz = p.z;
    }
    function nextHop() {
      if (gen !== hopGen) return;
      const h = hops.shift();
      if (!h) { bunny.scale.set(1, 1, 1); return; }
      const sx = bunny.position.x, sz = bunny.position.z;
      bunny.rotation.y = Math.atan2(h.x - sx, h.z - sz);
      play('hop');
      addTween(175, t => {
        /* Guarded like the world's: a superseded (or exited-and-frozen)
           chain's in-flight tween must never write position again, or it
           replays over the fresh entry hop on the next enter(). */
        if (gen !== hopGen) return;
        bunny.position.x = sx + (h.x - sx) * t;
        bunny.position.z = sz + (h.z - sz) * t;
        bunny.position.y = 0.5 * 4 * t * (1 - t) * 0.9;
        const sq = 0.86 + Math.sin(Math.PI * t) * 0.26;
        const hs = 1 + (1 - sq) * 0.5;
        bunny.scale.set(hs, sq, hs);
      }, nextHop);
    }
    nextHop();
  }

  function wobble(aisleId) {
    const gd = gondolas[aisleId];
    if (!gd) return;
    addTween(420, t => {
      gd.group.rotation.z = Math.sin(t * Math.PI * 3) * 0.04 * (1 - t);
    });
  }

  /* Locked aisle tarps mirror the outdoor stands: visibility flip on sync,
     the flying pop on a live unlock. */
  function setAisleOpen(aisleId, open, pop) {
    const gd = gondolas[aisleId];
    if (!gd) return;
    gd.twinkle.visible = open;
    if (aisleId === 'produce') coolerTw.visible = displayTw.visible = open;
    if (open && pop && gd.tarp.visible) {
      addTween(650, t => {
        gd.tarp.position.y = t * 6;
        gd.tarp.rotation.z = t * 1.2;
        gd.tarp.scale.setScalar(1 - t * 0.6);
      }, () => {
        gd.tarp.visible = false;
        gd.tarp.position.y = 0;
        gd.tarp.rotation.z = 0;
        gd.tarp.scale.setScalar(1);
      });
      gd.goods.visible = true;
    } else {
      gd.tarp.visible = !open;
      gd.goods.visible = open;
    }
  }

  /* ---- touch: gondola/cooler/display taps browse, floor taps hop ---- */
  let active = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit3 = new THREE.Vector3();

  canvas.addEventListener('pointerdown', e => {
    if (!active) return;
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const targets = [gondolas.produce.group, gondolas.bakery.group, cooler, display,
      counter, sunny];
    const hits = ray.intersectObjects(targets, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.aisle && !o.userData.helloTap) o = o.parent;
      if (o) {
        if (o.userData.helloTap) {
          /* Sunny answers like Benny does outside: the cashier-bears-
             respond rule must hold in scene two (clarity review). Her
             greeting doubles as the in-store hint. */
          sunnyHello();
          return;
        }
        if (onTapAisle) onTapAisle(o.userData.aisle);
        return;
      }
    }
    if (ray.ray.intersectPlane(floorPlane, hit3)) {
      /* Floor walks are flow-gated like the outdoor tapGround: while the
         shelf or a list panel is up, visible canvas must be inert. */
      if (canMove && !canMove()) return;
      const x = Math.max(FLOOR.x0, Math.min(FLOOR.x1, hit3.x));
      const z = Math.max(FLOOR.z0, Math.min(FLOOR.z1, hit3.z));
      hopTo(x, z);
      tapRing(x, z);
    }
  });

  /* Sunny's greeting: a little bounce and a pointer at the shelves. */
  let sunnyBusy = false;
  function sunnyHello() {
    if (canMove && !canMove()) return;
    /* "a shelf" could send her at a tarped gondola. A tarped one shows no
       food, so this stays true at every stage without reading the aisle list. */
    toast('Hi! Tap a shelf with food on it and pick something yummy!');
    if (sunnyBusy) return;
    sunnyBusy = true;
    play('hop');
    addTween(360, t => {
      sunny.position.y = 4 * t * (1 - t) * 0.4;
    }, () => {
      sunny.position.y = 0;
      sunnyBusy = false;
    });
  }

  /* Walk-destination ring, the world.js tapRing in miniature: same cream
     mark, same after-hopTo generation capture, so the tap-to-walk language
     is identical indoors. */
  function tapRing(x, z) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({
      color: 0xB0713B, transparent: true, opacity: 0.9
    });
    const geo = new THREE.BoxGeometry(0.8, 0.05, 0.1);
    for (const [rx, rz, ry] of [[0, 0.36, 0], [0, -0.36, 0],
      [0.36, 0, Math.PI / 2], [-0.36, 0, Math.PI / 2]]) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(rx, 0, rz);
      mesh.rotation.y = ry;
      g.add(mesh);
    }
    g.position.set(x, 0.05, z);
    scene.add(g);
    const gen = hopGen;
    addTween(420, t => {
      if (gen !== hopGen) { g.visible = false; return; }
      g.scale.setScalar(0.55 + t * 0.8);
      m.opacity = 0.9 * (1 - t);
    }, () => {
      scene.remove(g);
      geo.dispose();
      m.dispose();
    });
  }

  /* enter() resyncs everything that can change while she is outside:
     which aisles are open, and whether today's rare is the golden mango. */
  function enter(opts = {}) {
    for (const id of Object.keys(gondolas)) {
      setAisleOpen(id, state.aisles.includes(id), false);
    }
    if (gold) gold.visible = !!opts.goldToday;
    resize();
    active = true;
    bunny.position.set(-0.5, 0, 3.4);
    bunny.rotation.y = Math.PI;
    hopTo(-0.4, 1.6);
  }

  function exit() {
    active = false;
  }

  /* World point -> client coords under the current camera (pane testing). */
  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + (v.x + 1) / 2 * r.width,
      y: r.top + (1 - (v.y + 1) / 2) * r.height
    };
  }

  return {
    scene, step, frame, resize, enter, exit, wobble, setAisleOpen, project,
    isActive: () => active
  };
}
