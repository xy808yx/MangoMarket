/* Mango Market world. The Juicy Pop market from the Phase 1 style gate,
   grown into World v2 "Big Loop XL" (board A, picked Aug 3 2026): the board
   D ring doubled to a 112x84 tile town. Plaza south (locked Phase 1 framing
   at the origin), a big park with a lake, dock and playground inside the
   ring, grocery store north, three real storefront buildings east, house
   and fenced yard west, a mango grove in the south-east corner, and a
   stream that crosses the ring under wooden decks. Produce and bakery live
   INSIDE the grocery store (js/grocery.js).

   World v2 movement: a collision grid covers the whole map (every tree,
   building, stand, fence and prop registers a footprint) and hopTo routes
   through A* on that grid, so she can never walk through things and any
   ground tap anywhere is walkable. Long walks break into a faster stride
   so cross-town stays under about ten seconds.

   The camera FOLLOWS her, clamped to the map, with one anchor: inside the
   plaza core the target locks to (0,0), which reproduces the locked Phase 1
   framing exactly: position (9,10,9) and lookAt (0,0.7,0.9). Scene switches
   snap, never glide.

   The palette is a PARAMETER (BOARDS.b day, BOARDS.c evening) so both modes
   are the same world under different lights. Stall, tree, crate, duck and
   cat builders are ported from the Phase 1 boards and must keep that look:
   compare against the locked reference renders before changing proportions. */

import * as THREE from '../vendor/three.module.js';
import { AISLES } from './engine.js';
import { ZONE_ORDER } from './zones.js';
import { play } from './sfx.js';

/* Awning accents per aisle. Fixed across palettes; the lights do the
   day/evening work. Exported since the world split: the grocery interior
   trims its produce and bakery gondolas with the same accents. */
export const AISLE_STYLE = {
  produce: 0x3E8E4E,
  bakery: 0xFFAD1F,
  toys: 0xF6699A,
  electronics: 0x4A6FD4,
  home: 0x2EA98C
};

/* Which catalog items sit in each storefront's window display. Produce and
   bakery have no storefront; their goods live on the grocery shelves. */
const STAND_GOODS = {
  toys: ['blocks', 'plushduck'],
  electronics: ['robot'],
  home: ['plant', 'lamp']
};

/* Storefront buildings line the east side of the ring, doors on the SOUTH
   face (the locked camera looks from the south-east, so south faces read;
   a west-facing front would show the camera its back, the old stand
   lesson). cz is the building center; the door spur wraps below it. */
const SHOPFRONTS = {
  toys: { cz: -49 },
  electronics: { cz: -36.5 },
  home: { cz: -24 }
};
const SHOP_X = 45.5;

/* ---- the tile map (World v2) ----
   Integer tile centers, x -56..55 and z -76..7. The ring path is the
   signed-distance band of a rounded rectangle; spurs connect the plaza,
   grocery forecourt, shop doors and the yard gate. */
const GX0 = -56, GZ0 = -76, GW = 112, GH = 85;
const RING = { cx: 0, cz: -33.4, hw: 39, hh: 28, r: 12 };

function ringSD(x, z) {
  const dx = Math.abs(x - RING.cx) - (RING.hw - RING.r);
  const dz = Math.abs(z - RING.cz) - (RING.hh - RING.r);
  const ax = Math.max(dx, 0), az = Math.max(dz, 0);
  return Math.hypot(ax, az) + Math.min(Math.max(dx, dz), 0) - RING.r;
}

/* The stream: NE corner down into the lake, rasterized around a polyline.
   It crosses the ring twice (top edge and the top-right corner arc); the
   overlap tiles become wooden deck bridges instead of water. */
const STREAM = [
  [52, -73], [44, -68], [36, -64], [30, -60], [27, -55],
  [24, -49], [21, -44], [17, -38.5], [15.5, -37]
];

function streamDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i], [bx, bz] = STREAM[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1,
      ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

const LAKE = { cx: 8, cz: -33.4, rx: 14, rz: 9.5 };
const inLake = (x, z) =>
  ((x - LAKE.cx) / LAKE.rx) ** 2 + ((z - LAKE.cz) / LAKE.rz) ** 2 <= 1;
/* One tile-ish band of sandy shore around the lake (Phase 6 pond edge). */
const nearLake = (x, z) =>
  ((x - LAKE.cx) / (LAKE.rx + 1.3)) ** 2 + ((z - LAKE.cz) / (LAKE.rz + 1.3)) ** 2 <= 1;

/* Camera zones are gone (World v2 follows her); zoneOf survives as a
   coarse label for debug hooks and tests. */
function zoneOf(x, z) {
  if (z <= -59) return 'grocery';
  if (x >= 38 && z <= -16) return 'shops';
  if (x <= -38 && z <= -16) return 'house';
  if (z >= -8) return x >= 15 ? 'grove' : 'plaza';
  return 'park';
}

/* ---- town zones (Aug 4 2026): which unlockable chunk owns a tile.
   Returns an index into ZONE_ORDER. The partition covers the whole map and
   the tests below run in priority order, so read them top to bottom.

   The one rule that must survive any edit: NO ZONE MAY CUT THE RING ROAD.
   The ring band is the town's only connective tissue, so the outer zones
   start beyond its outer edge (x <= -41 and x >= 41, since the band's own
   tiles reach x -40 and 40) and the park starts inside its inner edge.
   Anything that fails every test is road. ---- */
function zoneIndexAt(x, z) {
  /* Her market square: open to the south map edge, which is why there is no
     fence along z = 8. That row is load-bearing, it shows the sky band the
     locked plaza framing depends on. */
  if (z >= -3 && x >= -12 && x <= 12) return 0;
  /* Mango grove, south-east, south of the ring's south band (z -6..-4). */
  if (z >= -2 && x > 12) return 5;
  if (x <= -41) return 4;
  if (x >= 41) return 3;
  if (ringSD(x, z) < -1.6) return 2;
  return 1;
}

function mat(color, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ color });
  if (opts.glow) {
    m.emissive = new THREE.Color(opts.glowColor ?? color);
    m.emissiveIntensity = opts.glow;
  }
  return m;
}

function vox(parent, w, h, d, x, y, z, material, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.noCast !== true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* Build a group from a catalog vox spec: entries
   [w, h, d, x, y, z, color, [rx, ry, rz]?]. Shared by shop goods and the
   thumbnail renderer, so shelf pictures match the 3D world exactly. */
export function buildVoxGroup(spec) {
  const g = new THREE.Group();
  for (const e of spec) {
    const m = vox(g, e[0], e[1], e[2], e[3], e[4], e[5], mat(e[6]));
    if (e[7]) m.rotation.set(e[7][0], e[7][1], e[7][2]);
  }
  return g;
}

/* Trees carry their foliage material and hidden snow caps so the seasonal
   skin (Phase 5) is a recolor and a visibility flip, never a rebuild.
   Summer leaves everything exactly as the locked Phase 1 look. */
function buildTree(parent, P, x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = mat(P.trunk), fol = mat(P.foliage);
  vox(g, 0.6 * s, 1.0 * s, 0.6 * s, 0, 0.5 * s, 0, trunk);
  vox(g, 1.8 * s, 1.5 * s, 1.8 * s, 0, 1.75 * s, 0, fol);
  vox(g, 1.25 * s, 1.1 * s, 1.25 * s, 0, 3.0 * s, 0, fol);
  const snowM = mat(0xF4F8F8);
  const caps = [
    vox(g, 1.86 * s, 0.16 * s, 1.86 * s, 0, 2.56 * s, 0, snowM, { noCast: true }),
    vox(g, 1.3 * s, 0.18 * s, 1.3 * s, 0, 3.62 * s, 0, snowM, { noCast: true })
  ];
  caps.forEach(c => { c.visible = false; });
  g.userData.folMat = fol;
  g.userData.snowCaps = caps;
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* A grove mango tree: the regular tree plus hanging fruit. The fruit stays
   mango-orange through every season; only the foliage recolors. */
function buildMangoTree(parent, P, x, z, s = 1) {
  const g = buildTree(parent, P, x, z, s);
  /* Fruit hangs UNDER the canopy rim; anything higher is swallowed by the
     foliage box and invisible. */
  const fruit = mat(P.mango);
  for (const [fx, fy, fz] of [[-0.62, 0.92, 0.45], [0.58, 0.98, -0.4], [0.15, 0.9, 0.62]]) {
    vox(g, 0.26 * s, 0.3 * s, 0.26 * s, fx * s, fy * s, fz * s, fruit, { noCast: true });
  }
  return g;
}

function buildCrate(parent, P, x, y, z, ry = 0) {
  const g = new THREE.Group();
  const wood = mat(P.wood), mango = mat(P.mango), leaf = mat(P.leaf);
  vox(g, 1.15, 0.5, 0.85, 0, 0.25, 0, wood);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      vox(g, 0.27, 0.24, 0.27, -0.34 + i * 0.34, 0.51, -0.17 + j * 0.34, mango);
    }
  }
  vox(g, 0.1, 0.06, 0.1, -0.34, 0.66, -0.17, leaf);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* The main cashier stall, straight from the Phase 1 board. */
function buildStall(parent, P) {
  const g = new THREE.Group();
  const wood = mat(P.wood);
  vox(g, 4.2, 1.0, 1.3, 0, 0.5, -1.0, wood);
  const px = 2.2;
  vox(g, 0.22, 2.52, 0.22, -px, 1.26, -0.25, wood);
  vox(g, 0.22, 2.52, 0.22, px, 1.26, -0.25, wood);
  vox(g, 0.22, 2.86, 0.22, -px, 1.43, -1.85, wood);
  vox(g, 0.22, 2.86, 0.22, px, 1.43, -1.85, wood);
  const a = mat(P.awningA), b = mat(P.awningB);
  for (let i = 0; i < 6; i++) {
    vox(g, 0.78, 0.1, 2.15, -1.95 + i * 0.78, 2.78, -1.02,
      i % 2 ? b : a, { rx: -0.16 });
  }
  buildCrate(g, P, -1.2, 1.0, -0.95, 0.05);
  buildCrate(g, P, 0.15, 1.0, -1.05, -0.04);
  buildCrate(g, P, 1.45, 1.0, -0.9, 0.12);
  buildCrate(g, P, -2.9, 0, -0.4, 0.35);
  buildCrate(g, P, -2.85, 0.5, -0.45, 0.28);
  const lm = mat(P.lantern, P.lanternGlow ? { glow: P.lanternGlow } : {});
  vox(g, 0.3, 0.38, 0.3, -1.8, 2.35, -0.15, lm, { noCast: true });
  vox(g, 0.3, 0.38, 0.3, 1.8, 2.35, -0.15, lm, { noCast: true });
  vox(g, 1.05, 0.55, 0.09, 0, 2.3, -0.12, mat(P.awningB));
  vox(g, 0.3, 0.28, 0.12, -0.05, 2.27, -0.11, mat(P.mango));
  vox(g, 0.1, 0.08, 0.13, 0.14, 2.45, -0.11, mat(P.leaf));
  parent.add(g);
  return g;
}

function buildDuck(parent, P, x, z, ry) {
  const g = new THREE.Group();
  const body = mat(P.duck), bill = mat(P.bill);
  const dark = mat(0x2B2118);
  vox(g, 1.1, 0.9, 1.3, 0, 0.65, 0, body);
  vox(g, 0.85, 0.8, 0.8, 0, 1.55, 0.28, body);
  vox(g, 0.5, 0.18, 0.4, 0, 1.42, 0.8, bill);
  vox(g, 0.1, 0.16, 0.1, -0.26, 1.68, 0.68, dark, { noCast: true });
  vox(g, 0.1, 0.16, 0.1, 0.26, 1.68, 0.68, dark, { noCast: true });
  vox(g, 0.16, 0.5, 0.8, -0.63, 0.72, -0.05, body);
  vox(g, 0.16, 0.5, 0.8, 0.63, 0.72, -0.05, body);
  vox(g, 0.34, 0.34, 0.5, 0, 0.62, -0.75, body, { rx: 0.5 });
  vox(g, 0.3, 0.16, 0.42, -0.26, 0.08, 0.1, bill, { noCast: true });
  vox(g, 0.3, 0.16, 0.42, 0.26, 0.08, 0.1, bill, { noCast: true });
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

function buildCat(parent, P, x, z, ry) {
  const g = new THREE.Group();
  const body = mat(P.cat);
  const dark = mat(0x2B2118);
  vox(g, 0.95, 0.85, 1.15, 0, 0.6, 0, body);
  vox(g, 0.8, 0.75, 0.7, 0, 1.45, 0.25, body);
  vox(g, 0.22, 0.3, 0.14, -0.24, 1.95, 0.25, body);
  vox(g, 0.22, 0.3, 0.14, 0.24, 1.95, 0.25, body);
  vox(g, 0.09, 0.13, 0.09, -0.2, 1.5, 0.61, dark, { noCast: true });
  vox(g, 0.09, 0.13, 0.09, 0.2, 1.5, 0.61, dark, { noCast: true });
  vox(g, 0.2, 0.55, 0.2, 0.5, 0.45, -0.65, body, { rx: -0.5 });
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* Benny, the cashier bear behind the main stall. opts recolors and rescales
   for his little cousin Sunny; the no-opts call renders Benny exactly as the
   locked Phase 3 look. Exported since the world split: Sunny runs the
   grocery checkout in js/grocery.js. */
export function buildBear(parent, x, z, opts = {}) {
  const g = new THREE.Group();
  const fur = mat(opts.fur ?? 0x9A6B42), muzzle = mat(opts.muzzle ?? 0xD9B98A), dark = mat(0x2B2118);
  vox(g, 1.15, 1.05, 0.9, 0, 0.85, 0, fur);
  vox(g, 0.9, 0.85, 0.85, 0, 1.9, 0.05, fur);
  vox(g, 0.28, 0.28, 0.18, -0.32, 2.38, 0.05, fur);
  vox(g, 0.28, 0.28, 0.18, 0.32, 2.38, 0.05, fur);
  vox(g, 0.42, 0.32, 0.2, 0, 1.72, 0.46, muzzle);
  vox(g, 0.14, 0.12, 0.1, 0, 1.84, 0.56, dark, { noCast: true });
  vox(g, 0.1, 0.14, 0.1, -0.22, 2.02, 0.45, dark, { noCast: true });
  vox(g, 0.1, 0.14, 0.1, 0.22, 2.02, 0.45, dark, { noCast: true });
  g.userData.armL = vox(g, 0.3, 0.6, 0.3, -0.68, 1.0, 0.15, fur, { rz: 0.25 });
  g.userData.armR = vox(g, 0.3, 0.6, 0.3, 0.68, 1.0, 0.15, fur, { rz: -0.25 });
  if (opts.scale) g.scale.setScalar(opts.scale);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* ---- stand regulars (Phase 4). All face +z, ground at y=0, built to the
   duck/cat proportions so the queue reads as one family of creatures. ---- */
function buildFox() {
  const g = new THREE.Group();
  const coat = mat(0xE07A3F), cream = mat(0xFFF6EA), dark = mat(0x2B2118);
  vox(g, 0.95, 0.8, 1.2, 0, 0.6, 0, coat);
  vox(g, 0.8, 0.72, 0.7, 0, 1.42, 0.25, coat);
  vox(g, 0.34, 0.26, 0.3, 0, 1.28, 0.62, cream);
  vox(g, 0.12, 0.1, 0.1, 0, 1.36, 0.78, dark, { noCast: true });
  vox(g, 0.2, 0.4, 0.12, -0.26, 1.92, 0.2, coat, { rz: 0.1 });
  vox(g, 0.2, 0.4, 0.12, 0.26, 1.92, 0.2, coat, { rz: -0.1 });
  vox(g, 0.09, 0.13, 0.09, -0.2, 1.5, 0.61, dark, { noCast: true });
  vox(g, 0.09, 0.13, 0.09, 0.2, 1.5, 0.61, dark, { noCast: true });
  vox(g, 0.34, 0.34, 0.75, 0.3, 0.5, -0.85, coat, { rx: -0.25 });
  vox(g, 0.28, 0.28, 0.3, 0.36, 0.62, -1.18, cream);
  return g;
}

/* ---- The four stuffies. These are four real toys, rebuilt here as voxel
   animals to the same proportions as everyone else rather than ported as the
   flat pixel sprites they are in the other app: a customer that walks up to
   the counter in a different art style would read as a bug. Colours come from
   the toys. They carry NO trait, deliberately: the difficulty curve and the
   gentle-first-session shaping were tuned and sim-verified against exactly
   three traited regulars (waddles, fern, miso), and a fourth forced tender or
   a second exact payer would move numbers nobody asked to move. ---- */

function buildPanda() {
  const g = new THREE.Group();
  const white = mat(0xF5F5F5), grey = mat(0x8E8E8E), patch = mat(0x9E9E9E);
  const dark = mat(0x2B2118), pink = mat(0xFFB6C1);
  vox(g, 1.0, 0.9, 1.15, 0, 0.6, 0, white);
  vox(g, 0.24, 0.56, 0.34, -0.53, 0.58, 0.08, grey);
  vox(g, 0.24, 0.56, 0.34, 0.53, 0.58, 0.08, grey);
  vox(g, 0.88, 0.8, 0.74, 0, 1.48, 0.22, white);
  vox(g, 0.26, 0.26, 0.16, -0.36, 1.92, 0.16, grey);
  vox(g, 0.26, 0.26, 0.16, 0.36, 1.92, 0.16, grey);
  vox(g, 0.28, 0.26, 0.08, -0.21, 1.56, 0.57, patch, { noCast: true });
  vox(g, 0.28, 0.26, 0.08, 0.21, 1.56, 0.57, patch, { noCast: true });
  vox(g, 0.1, 0.13, 0.09, -0.21, 1.54, 0.61, dark, { noCast: true });
  vox(g, 0.1, 0.13, 0.09, 0.21, 1.54, 0.61, dark, { noCast: true });
  vox(g, 0.18, 0.12, 0.1, 0, 1.3, 0.58, pink, { noCast: true });
  return g;
}

function buildHippo() {
  const g = new THREE.Group();
  const body = mat(0x9B59B6), deep = mat(0x8E44AD), light = mat(0xAF7AC5);
  const dark = mat(0x2B2118), inner = mat(0xD8A9E8);
  vox(g, 1.0, 0.85, 1.15, 0, 0.6, 0, body);
  vox(g, 0.86, 0.72, 0.66, 0, 1.45, 0.22, body);
  /* The snout is the whole point of a hippo, so it has to break the head's
     silhouette: lighter, blunter, set LOW and pushed 0.2 further forward than
     the face. Sized level with the head it just read as a purple box. */
  vox(g, 0.8, 0.44, 0.42, 0, 1.28, 0.55, light);
  vox(g, 0.12, 0.1, 0.08, -0.19, 1.38, 0.76, deep, { noCast: true });
  vox(g, 0.12, 0.1, 0.08, 0.19, 1.38, 0.76, deep, { noCast: true });
  vox(g, 0.2, 0.18, 0.14, -0.32, 1.82, 0.16, body);
  vox(g, 0.2, 0.18, 0.14, 0.32, 1.82, 0.16, body);
  vox(g, 0.1, 0.09, 0.07, -0.32, 1.82, 0.24, inner, { noCast: true });
  vox(g, 0.1, 0.09, 0.07, 0.32, 1.82, 0.24, inner, { noCast: true });
  vox(g, 0.1, 0.13, 0.09, -0.23, 1.63, 0.55, dark, { noCast: true });
  vox(g, 0.1, 0.13, 0.09, 0.23, 1.63, 0.55, dark, { noCast: true });
  vox(g, 0.16, 0.16, 0.34, 0, 0.52, -0.68, deep, { rx: -0.3 });
  return g;
}

function buildLion() {
  const g = new THREE.Group();
  const coat = mat(0xF4A460), mane = mat(0xCD853F), maneDeep = mat(0xD2691E);
  const dark = mat(0x2B2118), nose = mat(0x8B4513);
  vox(g, 0.95, 0.85, 1.1, 0, 0.6, 0, coat);
  /* The mane is a slab BEHIND the face, wider and taller than it, with the
     face pushed forward so a rim of fluff shows all the way round. A mane
     built level with the face is invisible: the first attempt just read as a
     bigger square head. Corner tufts break the straight edge. */
  vox(g, 1.14, 1.08, 0.44, 0, 1.5, -0.02, maneDeep);
  for (const [dx, dy] of [[-0.5, 0.42], [0.5, 0.42], [-0.56, -0.14], [0.56, -0.14], [0, 0.56]]) {
    vox(g, 0.26, 0.26, 0.34, dx, 1.5 + dy, 0.04, mane);
  }
  vox(g, 0.76, 0.68, 0.6, 0, 1.46, 0.36, coat);
  vox(g, 0.18, 0.18, 0.12, -0.3, 1.86, 0.34, coat);
  vox(g, 0.18, 0.18, 0.12, 0.3, 1.86, 0.34, coat);
  vox(g, 0.09, 0.13, 0.09, -0.18, 1.52, 0.67, dark, { noCast: true });
  vox(g, 0.09, 0.13, 0.09, 0.18, 1.52, 0.67, dark, { noCast: true });
  vox(g, 0.18, 0.13, 0.1, 0, 1.32, 0.65, nose, { noCast: true });
  vox(g, 0.16, 0.16, 0.5, 0.2, 0.52, -0.78, coat, { rx: -0.3 });
  vox(g, 0.22, 0.22, 0.2, 0.24, 0.66, -1.02, maneDeep);
  return g;
}

function buildUnicorn() {
  const g = new THREE.Group();
  const white = mat(0xFFFDF8), pink = mat(0xFFB6C1), eye = mat(0x6B3FA0);
  const gold = mat(0xFFD34D), rose = mat(0xFF9ED2);
  vox(g, 0.92, 0.85, 1.1, 0, 0.6, 0, white);
  vox(g, 0.84, 0.78, 0.72, 0, 1.46, 0.24, white);
  vox(g, 0.16, 0.3, 0.13, -0.33, 1.92, 0.3, white, { rz: 0.2 });
  vox(g, 0.16, 0.3, 0.13, 0.33, 1.92, 0.3, white, { rz: -0.2 });
  vox(g, 0.07, 0.16, 0.07, -0.33, 1.9, 0.37, pink, { noCast: true });
  vox(g, 0.07, 0.16, 0.07, 0.33, 1.9, 0.37, pink, { noCast: true });
  /* The horn owns the peak, alone. Sharing the crown with the mane (two
     earlier attempts) turned the horn into a birthday candle on a rainbow
     loaf. */
  vox(g, 0.2, 0.22, 0.2, 0, 1.96, 0.36, gold);
  vox(g, 0.15, 0.18, 0.15, 0, 2.14, 0.36, rose);
  vox(g, 0.09, 0.16, 0.09, 0, 2.29, 0.36, gold);
  /* The mane is Shasha's trick: a slab BEHIND the head and WIDER than it, so
     a rim shows on both sides instead of disappearing. A mane tucked at the
     nape is invisible here no matter how it is coloured, because the head
     itself is what covers it: from this camera, anything within about 0.4 of
     the skull's own footprint is inside the skull's silhouette. */
  const bands = [
    [0xFF6B6B, 1.96], [0xFFB347, 1.76], [0xFFD34D, 1.56],
    [0x77DD77, 1.36], [0x89CFF0, 1.16]
  ];
  for (const [c, y] of bands) vox(g, 1.12, 0.2, 0.3, 0, y, -0.18, mat(c));
  vox(g, 0.11, 0.14, 0.09, -0.19, 1.52, 0.6, eye, { noCast: true });
  vox(g, 0.11, 0.14, 0.09, 0.19, 1.52, 0.6, eye, { noCast: true });
  vox(g, 0.16, 0.11, 0.09, 0, 1.31, 0.6, rose, { noCast: true });
  vox(g, 0.18, 0.44, 0.18, 0, 0.6, -0.64, mat(0x89CFF0), { rx: -0.25 });
  return g;
}

/* Builders take (group, palette). Duck and cat are here as well as being the
   plaza ambients: once the town opens in chunks they are not in town yet on a
   fresh save, so those two customers have to be spawnable from the walkway
   edge like everyone else. Without an entry, customerEnter threw on Miso, who
   is a cat AND is pinned first on every fresh save. */
const CUSTOMER_BUILDERS = {
  duck: (g, P) => buildDuck(g, P, 0, 0, 0),
  cat: (g, P) => buildCat(g, P, 0, 0, 0),
  fox: buildFox,
  panda: buildPanda, hippo: buildHippo, lion: buildLion, unicorn: buildUnicorn,
  cub: () => {
    const g = new THREE.Group();
    buildBear(g, 0, 0, { fur: 0xB98756, muzzle: 0xE8D2AC, scale: 0.72 });
    return g;
  }
};

/* Lemonade corner on the main stall: pitcher, cups and a lemon sign. Added
   in Phase 4; the Phase 1 stall port above stays untouched. */
function buildLemonadeProps(stall, P) {
  const g = new THREE.Group();
  const lemon = mat(0xFFD34D), creamM = mat(P.awningB), red = mat(P.awningA);
  vox(g, 0.5, 0.6, 0.5, 0, 0.3, 0, lemon);
  vox(g, 0.4, 0.1, 0.4, 0, 0.62, 0, creamM);
  vox(g, 0.1, 0.3, 0.24, 0.33, 0.36, 0, lemon);
  vox(g, 0.16, 0.12, 0.16, -0.3, 0.52, 0, lemon);
  vox(g, 0.2, 0.26, 0.2, -0.5, 0.13, 0.12, creamM);
  vox(g, 0.2, 0.26, 0.2, -0.76, 0.13, -0.06, creamM);
  vox(g, 0.18, 0.05, 0.18, -0.5, 0.28, 0.12, lemon, { noCast: true });
  vox(g, 0.18, 0.05, 0.18, -0.76, 0.28, -0.06, lemon, { noCast: true });
  g.position.set(1.75, 1.0, -0.62);
  stall.add(g);
  const sign = new THREE.Group();
  vox(sign, 0.95, 0.55, 0.1, 0, 0, 0, creamM);
  vox(sign, 0.3, 0.3, 0.12, -0.18, 0.02, 0.01, lemon, { noCast: true });
  vox(sign, 0.3, 0.08, 0.12, 0.22, 0.1, 0.01, red, { noCast: true });
  vox(sign, 0.3, 0.08, 0.12, 0.22, -0.08, 0.01, red, { noCast: true });
  sign.position.set(1.45, 0.62, -0.28);
  stall.add(sign);
  /* A second, bigger lemonade board hanging from the awning's front edge,
     facing the locked boot camera: from the south-east the stall used to
     read as an unstaffed market table (clarity review). Big cup, lemon,
     red straw; picture-only like every world sign. */
  const front = new THREE.Group();
  vox(front, 1.35, 0.8, 0.1, 0, 0, 0, creamM);
  vox(front, 0.4, 0.5, 0.12, -0.22, -0.02, 0.02, lemon, { noCast: true });
  vox(front, 0.34, 0.09, 0.12, -0.22, 0.26, 0.03, creamM, { noCast: true });
  vox(front, 0.07, 0.34, 0.08, -0.06, 0.3, 0.03, red, { noCast: true });
  vox(front, 0.26, 0.26, 0.12, 0.3, 0.08, 0.02, lemon, { noCast: true });
  vox(front, 0.12, 0.1, 0.13, 0.34, -0.18, 0.02, mat(P.leaf), { noCast: true });
  front.position.set(-0.6, 2.15, 0.1);
  stall.add(front);
}

/* The bunny she plays. Big head, tall ears, cream fur, pink details.
   Exported since Phase 5: the room builds its own copy. */
export function buildBunny(parent) {
  const g = new THREE.Group();
  const fur = mat(0xFFFDF4), inner = mat(0xF6B8C4), dark = mat(0x2B2118);
  vox(g, 0.8, 0.7, 0.9, 0, 0.5, 0, fur);
  vox(g, 0.78, 0.7, 0.72, 0, 1.35, 0.1, fur);
  vox(g, 0.2, 0.72, 0.16, -0.2, 2.0, 0.05, fur, { rz: 0.12 });
  vox(g, 0.2, 0.72, 0.16, 0.2, 2.0, 0.05, fur, { rz: -0.12 });
  vox(g, 0.1, 0.4, 0.1, -0.2, 1.98, 0.09, inner, { rz: 0.12, noCast: true });
  vox(g, 0.1, 0.4, 0.1, 0.2, 1.98, 0.09, inner, { rz: -0.12, noCast: true });
  vox(g, 0.1, 0.14, 0.1, -0.19, 1.45, 0.47, dark, { noCast: true });
  vox(g, 0.1, 0.14, 0.1, 0.19, 1.45, 0.47, dark, { noCast: true });
  vox(g, 0.14, 0.1, 0.1, 0, 1.3, 0.48, inner, { noCast: true });
  vox(g, 0.3, 0.16, 0.5, -0.24, 0.08, 0.15, fur, { noCast: true });
  vox(g, 0.3, 0.16, 0.5, 0.24, 0.08, 0.15, fur, { noCast: true });
  vox(g, 0.26, 0.26, 0.26, 0, 0.45, -0.5, fur);
  parent.add(g);
  return g;
}

/* Her house, anchoring the fenced yard west of the ring.
   Cream walls, mango roof, same voxel grammar as the stalls. */
function buildHouse(P) {
  const g = new THREE.Group();
  const wall = mat(0xFFF6EA), roof = mat(P.mango), wood = mat(P.wood);
  const dark = mat(0x8E5A2E);
  vox(g, 2.4, 1.7, 2.0, 0, 0.85, 0, wall);
  vox(g, 2.7, 0.42, 2.3, 0, 1.85, 0, roof);
  vox(g, 2.15, 0.42, 1.85, 0, 2.25, 0, roof);
  vox(g, 1.5, 0.42, 1.3, 0, 2.65, 0, roof);
  vox(g, 0.75, 1.15, 0.14, -0.5, 0.57, 1.0, dark);
  vox(g, 0.12, 0.12, 0.16, -0.24, 0.62, 1.02, mat(0xFFD34D), { noCast: true });
  vox(g, 0.7, 0.6, 0.14, 0.62, 1.05, 1.0, mat(P.sky), { noCast: true });
  vox(g, 0.8, 0.1, 0.16, 0.62, 0.72, 1.01, wood, { noCast: true });
  vox(g, 1.0, 0.08, 0.7, -0.5, 0.04, 1.35, wood, { noCast: true });
  return g;
}

/* The grocery store exterior: the landmark of the north zone. Cream body,
   stacked mango roof, striped awning over big windows, mango sign, produce
   bins flanking the door. The whole group is one tap target. */
function buildGroceryExt(P) {
  const g = new THREE.Group();
  const wall = mat(0xFFF6EA), roof = mat(P.mango), wood = mat(P.wood);
  const dark = mat(0x8E5A2E), skyM = mat(P.sky);
  const a = mat(P.awningA), b = mat(P.awningB);
  vox(g, 7.6, 2.5, 4.2, 0, 1.25, -0.4, wall);
  vox(g, 8.2, 0.45, 4.6, 0, 2.72, -0.55, roof);
  vox(g, 6.6, 0.45, 3.7, 0, 3.14, -0.6, roof);
  vox(g, 4.6, 0.45, 2.8, 0, 3.56, -0.65, roof);
  for (let i = 0; i < 10; i++) {
    vox(g, 0.74, 0.09, 1.25, -3.36 + i * 0.746, 2.4, 1.95,
      i % 2 ? b : a, { rx: 0.22 });
  }
  vox(g, 1.9, 1.1, 0.14, -2.35, 1.4, 1.72, skyM, { noCast: true });
  vox(g, 1.9, 1.1, 0.14, 2.35, 1.4, 1.72, skyM, { noCast: true });
  vox(g, 2.1, 0.12, 0.2, -2.35, 0.8, 1.74, wood, { noCast: true });
  vox(g, 2.1, 0.12, 0.2, 2.35, 0.8, 1.74, wood, { noCast: true });
  vox(g, 1.5, 1.95, 0.16, 0, 0.98, 1.74, dark);
  vox(g, 1.06, 1.1, 0.14, 0, 1.25, 1.84, skyM, { noCast: true });
  vox(g, 0.14, 0.14, 0.18, 0.55, 0.95, 1.84, mat(0xFFD34D), { noCast: true });
  vox(g, 2.2, 0.12, 0.9, 0, 0.06, 2.15, wood, { noCast: true });
  vox(g, 0.12, 0.5, 0.12, -1.2, 3.1, 1.55, wood, { noCast: true });
  vox(g, 0.12, 0.5, 0.12, 1.2, 3.1, 1.55, wood, { noCast: true });
  vox(g, 2.9, 0.72, 0.18, 0, 3.6, 1.55, mat(P.awningB));
  vox(g, 0.6, 0.52, 0.22, -0.85, 3.58, 1.57, mat(P.mango));
  vox(g, 0.2, 0.14, 0.24, -1.1, 3.86, 1.57, mat(P.leaf));
  vox(g, 1.3, 0.16, 0.22, 0.35, 3.74, 1.57, wood, { noCast: true });
  vox(g, 1.0, 0.16, 0.22, 0.25, 3.46, 1.57, wood, { noCast: true });
  const bin = (bx, topColor) => {
    vox(g, 1.4, 0.5, 0.95, bx, 0.42, 2.5, wood);
    vox(g, 0.14, 0.6, 0.14, bx - 0.6, 0.3, 2.5, wood);
    vox(g, 0.14, 0.6, 0.14, bx + 0.6, 0.3, 2.5, wood);
    for (let i = 0; i < 3; i++) {
      vox(g, 0.3, 0.26, 0.3, bx - 0.4 + i * 0.4, 0.78, 2.5, mat(topColor));
    }
  };
  bin(-2.7, P.mango);
  bin(2.7, 0x2E7A40);
  return g;
}

/* A storefront building for the shops street (World v2): cream body, roof
   stacked in the aisle's accent color, striped awning over two display
   windows and a door on the SOUTH face. Window goods show when the aisle
   is open; a locked shop wears a big tarp over its front. */
function buildShopfront(P, aisle, itemsById) {
  const g = new THREE.Group();
  const wall = mat(0xFFF6EA), wood = mat(P.wood), dark = mat(0x8E5A2E);
  const accent = mat(AISLE_STYLE[aisle.id]), creamy = mat(P.awningB);
  const skyM = mat(P.sky);
  vox(g, 7.2, 2.6, 5.6, 0, 1.3, 0, wall);
  vox(g, 7.8, 0.42, 6.0, 0, 2.8, 0, accent);
  vox(g, 6.2, 0.42, 4.8, 0, 3.2, 0, accent);
  vox(g, 4.4, 0.42, 3.4, 0, 3.6, 0, accent);
  for (let i = 0; i < 8; i++) {
    vox(g, 0.84, 0.09, 1.2, -2.95 + i * 0.845, 2.35, 3.25,
      i % 2 ? creamy : accent, { rx: 0.22 });
  }
  vox(g, 1.8, 1.0, 0.14, -1.9, 1.45, 2.82, skyM, { noCast: true });
  vox(g, 1.8, 1.0, 0.14, 1.9, 1.45, 2.82, skyM, { noCast: true });
  vox(g, 2.0, 0.12, 0.2, -1.9, 0.88, 2.84, wood, { noCast: true });
  vox(g, 2.0, 0.12, 0.2, 1.9, 0.88, 2.84, wood, { noCast: true });
  vox(g, 1.3, 1.9, 0.16, 0, 0.95, 2.84, dark);
  vox(g, 0.14, 0.14, 0.18, 0.42, 0.92, 2.94, mat(0xFFD34D), { noCast: true });
  vox(g, 1.9, 0.12, 0.8, 0, 0.06, 3.3, wood, { noCast: true });
  vox(g, 2.4, 0.62, 0.18, 0, 3.05, 2.88, creamy);
  vox(g, 0.5, 0.44, 0.22, -0.75, 3.03, 2.9, accent);
  vox(g, 1.1, 0.14, 0.22, 0.3, 3.15, 2.9, wood, { noCast: true });
  vox(g, 0.85, 0.14, 0.22, 0.22, 2.92, 2.9, wood, { noCast: true });
  /* Display tables OUTSIDE the windows (the fake-glass panels are opaque,
     so goods behind them would vanish). They live in the goods group and
     appear with the unlock pop, like the old stand counters. */
  const goods = new THREE.Group();
  const tableM = mat(P.wood);
  for (const tx of [-1.9, 1.9]) {
    vox(goods, 1.7, 0.14, 0.95, tx, 0.72, 3.3, tableM);
    vox(goods, 0.14, 0.72, 0.14, tx - 0.7, 0.36, 3.3, tableM);
    vox(goods, 0.14, 0.72, 0.14, tx + 0.7, 0.36, 3.3, tableM);
  }
  const ids = STAND_GOODS[aisle.id] || [];
  ids.forEach((id, i) => {
    const item = itemsById[id];
    if (!item) return;
    const model = buildVoxGroup(item.vox);
    model.scale.setScalar(0.55);
    model.position.set(i % 2 ? 1.9 : -1.9, 0.79, 3.3);
    model.rotation.y = 0.15 - i * 0.3;
    goods.add(model);
  });
  g.add(goods);
  /* Locked look: one solid canvas wrap over the whole front porch, the
     stand-tarp idea at building scale. It ENCLOSES the awning, windows,
     door and sign, so nothing clips through and the shop reads shut. */
  const tarp = new THREE.Group();
  vox(tarp, 7.6, 3.4, 1.7, 0, 1.75, 3.45, mat(0xCFC5B4));
  vox(tarp, 7.7, 0.18, 1.8, 0, 0.4, 3.45, mat(0xB8AD9A));
  vox(tarp, 0.9, 0.55, 0.12, 0, 1.7, 4.32, mat(P.wood));
  g.add(tarp);
  g.userData.aisleId = aisle.id;
  return { group: g, goods, tarp };
}

/* A little non-shop market stall: pure ambient life for the bigger world.
   Same stripes as the main stall, nothing tappable, nothing for sale. */
function buildDecoStall(parent, P, x, z, ry) {
  const g = new THREE.Group();
  /* Deco stalls wear solid leaf-and-cream awnings: the red-white stripes
     belong to the LEMONADE stall alone, so "striped means tap me" stays a
     true rule (clarity review; deco stalls postdate the locked framing). */
  const wood = mat(P.wood), a = mat(P.leaf), b = mat(P.awningB);
  vox(g, 1.9, 0.8, 1.0, 0, 0.4, 0, wood);
  vox(g, 0.16, 1.9, 0.16, -0.8, 0.95, -0.38, wood);
  vox(g, 0.16, 1.9, 0.16, 0.8, 0.95, -0.38, wood);
  for (let i = 0; i < 3; i++) {
    vox(g, 0.64, 0.09, 1.5, -0.64 + i * 0.64, 1.82, 0.1,
      i % 2 ? b : a, { rx: 0.2 });
  }
  buildCrate(g, P, -0.3, 0.8, 0.05, 0.2);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* Icon signpost: wood post plus one cream arrow plank per destination, each
   carrying abstract wood "text" bars and a small voxel model of what lies
   that way. No real text: all reading lives in the DOM; the world speaks in
   pictures (clarity review). arms: [{ item, ry }], ry 0 points +x. */
function buildSignpost(parent, P, x, z, arms) {
  const g = new THREE.Group();
  const wood = mat(P.wood), bar = mat(P.trunk);
  vox(g, 0.18, 2.1, 0.18, 0, 1.05, 0, wood);
  arms.forEach((a, i) => {
    const arm = new THREE.Group();
    const cream = mat(P.awningB);
    vox(arm, 1.05, 0.42, 0.12, 0.34, 0, 0, cream);
    vox(arm, 0.34, 0.09, 0.14, 0.2, 0.07, 0.02, bar, { noCast: true });
    vox(arm, 0.5, 0.09, 0.14, 0.28, -0.09, 0.02, bar, { noCast: true });
    vox(arm, 0.2, 0.26, 0.12, 0.92, 0, 0, cream);
    if (a.item) {
      const m = buildVoxGroup(a.item.vox);
      m.scale.setScalar(0.55);
      m.position.set(0.34, 0.32, 0);
      arm.add(m);
    }
    arm.position.y = 1.72 - i * 0.62;
    arm.rotation.y = a.ry || 0;
    g.add(arm);
  });
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* The shared "tap me" mark (clarity review): two small four-point twinkles
   that breathe and spin above every currently-productive tap target, and
   only those, so one consistent sparkle becomes the game's wordless sign
   for "this responds". Plus-shaped crossed boxes (nothing star-of-anything
   about it; house content rules). The caller animates via its step clock,
   never setTimeout (the pane clamps timers). Exported for grocery.js. */
export function buildTwinkle(parent, x, y, z) {
  const g = new THREE.Group();
  const gold = mat(0xFFE9A0, { glow: 0.85 });
  const white = mat(0xFFFDF4, { glow: 0.7 });
  const a = new THREE.Group();
  vox(a, 0.34, 0.09, 0.09, 0, 0, 0, gold, { noCast: true });
  vox(a, 0.09, 0.34, 0.09, 0, 0, 0, gold, { noCast: true });
  g.add(a);
  const b = new THREE.Group();
  vox(b, 0.2, 0.06, 0.06, 0, 0, 0, white, { noCast: true });
  vox(b, 0.06, 0.2, 0.06, 0, 0, 0, white, { noCast: true });
  b.position.set(0.32, 0.3, 0.1);
  g.add(b);
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/* Drive a list of twinkle groups from an ambient clock (seconds). Gentle
   pop-and-fade cycles, phase-offset so the town never blinks in unison. */
export function stepTwinkles(list, s) {
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (!g.visible) continue;
    const p = (Math.sin(s * 2.1 + i * 1.9) + 1) / 2;
    g.scale.setScalar(0.35 + p * 0.75);
    g.rotation.y = s * 0.8 + i;
  }
}

function buildLantern(parent, P, x, z) {
  const g = new THREE.Group();
  vox(g, 0.14, 1.6, 0.14, 0, 0.8, 0, mat(P.wood));
  vox(g, 0.3, 0.36, 0.3, 0, 1.75, 0,
    mat(P.lantern, P.lanternGlow ? { glow: P.lanternGlow } : {}), { noCast: true });
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* ---- park playground pieces ---- */
function buildSlide(parent, P, x, z, ry) {
  const g = new THREE.Group();
  const wood = mat(P.wood), slide = mat(0xFFD34D), red = mat(P.awningA);
  vox(g, 0.14, 1.5, 0.14, -0.4, 0.75, -0.4, wood);
  vox(g, 0.14, 1.5, 0.14, 0.4, 0.75, -0.4, wood);
  vox(g, 0.14, 1.5, 0.14, -0.4, 0.75, 0.4, wood);
  vox(g, 0.14, 1.5, 0.14, 0.4, 0.75, 0.4, wood);
  vox(g, 1.0, 0.14, 1.0, 0, 1.55, 0, wood);
  vox(g, 1.0, 0.4, 0.12, 0, 1.82, -0.45, red, { noCast: true });
  for (let i = 0; i < 3; i++) {
    vox(g, 0.7, 0.09, 0.2, 0, 0.35 + i * 0.45, -0.62 - i * 0.06, wood, { noCast: true });
  }
  vox(g, 0.8, 0.1, 2.4, 0, 0.85, 1.45, slide, { rx: 0.55 });
  vox(g, 0.1, 0.16, 2.4, -0.42, 0.95, 1.45, red, { rx: 0.55, noCast: true });
  vox(g, 0.1, 0.16, 2.4, 0.42, 0.95, 1.45, red, { rx: 0.55, noCast: true });
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* Swings return their seat pivots so step() can sway them: gentle diegetic
   life, zero consequence, same idea as the duck bob. */
function buildSwing(parent, P, x, z, ry) {
  const g = new THREE.Group();
  const wood = mat(P.wood), dark = mat(0x8E5A2E);
  vox(g, 0.16, 2.0, 0.16, -1.2, 1.0, 0, wood, { rz: 0.12 });
  vox(g, 0.16, 2.0, 0.16, 1.2, 1.0, 0, wood, { rz: -0.12 });
  vox(g, 2.7, 0.16, 0.16, 0, 1.95, 0, dark);
  const seats = [];
  const seatCols = [mat(0xF04E3E), mat(0x4A6FD4)];
  [-0.55, 0.55].forEach((sx, i) => {
    const seat = new THREE.Group();
    vox(seat, 0.05, 0.9, 0.05, -0.22, -0.45, 0, dark, { noCast: true });
    vox(seat, 0.05, 0.9, 0.05, 0.22, -0.45, 0, dark, { noCast: true });
    vox(seat, 0.55, 0.08, 0.3, 0, -0.92, 0, seatCols[i]);
    seat.position.set(sx, 1.92, 0);
    g.add(seat);
    seats.push(seat);
  });
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return seats;
}

function buildBench(parent, P, x, z, ry) {
  const g = new THREE.Group();
  const wood = mat(P.wood);
  vox(g, 1.5, 0.12, 0.5, 0, 0.5, 0, wood);
  vox(g, 1.5, 0.5, 0.1, 0, 0.85, -0.24, wood);
  vox(g, 0.12, 0.5, 0.12, -0.6, 0.25, 0.12, wood);
  vox(g, 0.12, 0.5, 0.12, 0.6, 0.25, 0.12, wood);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

function buildSandbox(parent, P, x, z) {
  const g = new THREE.Group();
  const wood = mat(P.wood);
  vox(g, 2.0, 0.24, 0.18, 0, 0.12, -0.95, wood);
  vox(g, 2.0, 0.24, 0.18, 0, 0.12, 0.95, wood);
  vox(g, 0.18, 0.24, 1.75, -0.95, 0.12, 0, wood);
  vox(g, 0.18, 0.24, 1.75, 0.95, 0.12, 0, wood);
  vox(g, 1.75, 0.14, 1.75, 0, 0.09, 0, mat(P.path), { noCast: true });
  vox(g, 0.3, 0.26, 0.3, 0.4, 0.28, 0.3, mat(0xF04E3E), { noCast: true });
  vox(g, 0.34, 0.1, 0.34, -0.45, 0.2, -0.3, mat(0xFFD34D), { noCast: true });
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* A bordered flower bed for the park (Phase 6 dressing): wood frame, soil,
   a handful of blooms in the Juicy Pop candy colors. Blocks its 3x3 like
   the yard's vegetable plot; the caller registers the footprint. */
function buildFlowerBed(parent, P, x, z, ry = 0) {
  const g = new THREE.Group();
  const wood = mat(P.wood), soil = mat(0x8A5A33), stem = mat(0x2E7A40);
  vox(g, 2.5, 0.28, 0.18, 0, 0.14, -0.85, wood);
  vox(g, 2.5, 0.28, 0.18, 0, 0.14, 0.85, wood);
  vox(g, 0.18, 0.28, 1.55, -1.16, 0.14, 0, wood);
  vox(g, 0.18, 0.28, 1.55, 1.16, 0.14, 0, wood);
  vox(g, 2.2, 0.18, 1.5, 0, 0.1, 0, soil, { noCast: true });
  const blooms = [0xF6699A, 0xFFD34D, 0xF04E3E, 0xF6B8C4];
  [[-0.75, -0.35], [-0.25, 0.3], [0.3, -0.3], [0.8, 0.35], [0, -0.05], [-0.8, 0.4]]
    .forEach(([fx, fz], i) => {
      vox(g, 0.08, 0.3, 0.08, fx, 0.28, fz, stem, { noCast: true });
      vox(g, 0.2, 0.2, 0.2, fx, 0.5, fz, mat(blooms[i % 4]), { noCast: true });
    });
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  return g;
}

/* One salmon fry, facing +z; step() swims them in a slow loop around the
   lake (spec motif, board C's best idea grafted into the loop's water). */
function buildFry(parent) {
  const g = new THREE.Group();
  const body = mat(0xF08A6E), dark = mat(0xD9604E);
  vox(g, 0.16, 0.14, 0.42, 0, 0, 0, body);
  vox(g, 0.12, 0.12, 0.16, 0, 0.02, -0.3, dark);
  vox(g, 0.05, 0.1, 0.05, 0, 0.1, 0.1, dark, { noCast: true });
  parent.add(g);
  return g;
}

export function createWorld({ canvas, palette, onTapAisle, onTapStall, onTapHouse, onTapGrocery, onTapGround, itemsById }) {
  const P = palette;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);

  const hemi = new THREE.HemisphereLight(P.hemi.sky, P.hemi.ground, P.hemi.i);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(P.sun.color, P.sun.i);
  sun.position.set(...P.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  if (P.stallGlow) {
    const pt = new THREE.PointLight(P.stallGlow.color, P.stallGlow.i, 9);
    pt.position.set(0, 2.1, -0.6);
    scene.add(pt);
  }

  /* ---- collision grid (World v2). One byte per tile; props register
     their footprints as they are built. Routing avoids blocked tiles, but
     a scripted destination inside a footprint (standSpot behind the stall
     counter) still lands: the final waypoint is exempt. ---- */
  const blocked = new Uint8Array(GW * GH);
  const tix = x => Math.round(x) - GX0;
  const tiz = z => Math.round(z) - GZ0;
  const inGrid = (ix, iz) => ix >= 0 && ix < GW && iz >= 0 && iz < GH;
  /* Town zones: a second, independent block layer. Props write `blocked`
     once at build time and never clear it; zones write `zoneShut` and clear
     it as chunks are earned. Keeping them apart is what lets a zone open
     without forgetting that a tree stands on one of its tiles. Routing,
     line of sight, nearestOpen and the isOpenAt test oracle all read
     isOpen, so gating the map is this one line. */
  const zoneShut = new Uint8Array(GW * GH);
  const zoneIdx = new Uint8Array(GW * GH);
  for (let ix = 0; ix < GW; ix++) {
    for (let iz = 0; iz < GH; iz++) {
      zoneIdx[ix + iz * GW] = zoneIndexAt(ix + GX0, iz + GZ0);
    }
  }
  const isOpen = (ix, iz) =>
    inGrid(ix, iz) && !blocked[ix + iz * GW] && !zoneShut[ix + iz * GW];
  function blockAt(x, z) {
    const ix = tix(x), iz = tiz(z);
    if (inGrid(ix, iz)) blocked[ix + iz * GW] = 1;
  }
  function blockRect(x0, x1, z0, z1) {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      for (let z = Math.round(z0); z <= Math.round(z1); z++) blockAt(x, z);
    }
  }

  /* ---- ground: one continuous tile map for the whole town, instanced so
     9408 tiles cost six draw calls. The plaza keeps its exact Phase 1 look:
     same colors, walkway rows at z = 1 and 2. The ring path is the rounded
     rect band; the lake and stream sit lower; deck tiles carry the path
     over the stream. ---- */
  const pathSet = new Set();
  const addPath = (x0, x1, z0, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) pathSet.add(x + ':' + z);
  };
  addPath(-7, 7, 1, 2);
  addPath(-1, 0, -4, 0);
  addPath(-4, 4, -63, -60);
  addPath(39, 46, -46, -44);
  addPath(39, 46, -34, -32);
  addPath(39, 46, -21, -19);
  addPath(-41, -39, -32, -30);

  const lists = { grassA: [], grassB: [], path: [], deck: [], sand: [], waterA: [], waterB: [] };
  const deckSet = new Set();
  for (let x = GX0; x < GX0 + GW; x++) {
    for (let z = GZ0; z < GZ0 + GH; z++) {
      const onRing = Math.abs(ringSD(x, z)) <= 1.5;
      const onPath = onRing || pathSet.has(x + ':' + z);
      const onWater = inLake(x, z) || streamDist(x, z) <= 1.05;
      if (onPath) pathSet.add(x + ':' + z);
      if (onWater && onPath) {
        lists.deck.push({ x, y: -0.13, z });
        deckSet.add(x + ':' + z);
      } else if (onWater) {
        lists[(x + z) & 1 ? 'waterB' : 'waterA'].push({ x, y: -0.28, z });
        blockAt(x, z);
      } else if (onPath) {
        lists.path.push({ x, y: -0.15, z });
      } else if (nearLake(x, z)) {
        /* Sandy shore: walkable dressing, never a collision change. */
        lists.sand.push({ x, y: -0.15, z });
      } else {
        lists[(x + z) & 1 ? 'grassB' : 'grassA'].push({ x, y: -0.15, z });
      }
    }
  }
  /* The fishing dock: wooden planks from the west bank out over the lake.
     Walkable; the water beneath was already blocked, so unblock the planks. */
  for (let x = -8; x <= -3; x++) {
    for (let z = -34; z <= -33; z++) {
      for (const key of ['waterA', 'waterB', 'grassA', 'grassB', 'sand']) {
        const i = lists[key].findIndex(t => t.x === x && t.z === z);
        if (i >= 0) lists[key].splice(i, 1);
      }
      lists.deck.push({ x, y: -0.13, z });
      deckSet.add(x + ':' + z);
      blocked[(x - GX0) + (z - GZ0) * GW] = 0;
    }
  }
  const tileGeo = new THREE.BoxGeometry(1, 0.3, 1);
  const TILE_MATS = {
    grassA: mat(P.grassA), grassB: mat(P.grassB), path: mat(P.path),
    deck: mat(P.wood), sand: mat(0xF2E4B8),
    waterA: mat(0x4FB7E6), waterB: mat(0x45ACDB)
  };
  const M4 = new THREE.Matrix4();
  for (const key of Object.keys(lists)) {
    const list = lists[key];
    const im = new THREE.InstancedMesh(tileGeo, TILE_MATS[key], list.length);
    list.forEach((p, i) => {
      M4.makeTranslation(p.x, p.y, p.z);
      im.setMatrixAt(i, M4);
    });
    im.receiveShadow = true;
    im.castShadow = false;
    scene.add(im);
  }

  /* Rails along every deck edge that faces water (Phase 6 dressing): the
     stream bridges and the fishing dock read as built things, not
     sandbars. Purely visual, zero collision: rails sit on the walkable
     tile's water edge, and the water tile beside them is already blocked. */
  {
    const railM = mat(P.wood);
    const isWater = (x, z) => (inLake(x, z) || streamDist(x, z) <= 1.05)
      && !deckSet.has(x + ':' + z);
    for (const key of deckSet) {
      const [x, z] = key.split(':').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isWater(x + dx, z + dz)) continue;
        if (dx) {
          vox(scene, 0.1, 0.28, 1.02, x + dx * 0.45, 0.3, z, railM, { noCast: true });
          vox(scene, 0.14, 0.55, 0.14, x + dx * 0.45, 0.28, z - 0.44, railM, { noCast: true });
          vox(scene, 0.14, 0.55, 0.14, x + dx * 0.45, 0.28, z + 0.44, railM, { noCast: true });
        } else {
          vox(scene, 1.02, 0.28, 0.1, x, 0.3, z + dz * 0.45, railM, { noCast: true });
          vox(scene, 0.14, 0.55, 0.14, x - 0.44, 0.28, z + dz * 0.45, railM, { noCast: true });
          vox(scene, 0.14, 0.55, 0.14, x + 0.44, 0.28, z + dz * 0.45, railM, { noCast: true });
        }
      }
    }
  }

  /* ---- plaza zone (the locked heart). Positions unchanged from v1. ---- */
  const stall = buildStall(scene, P);
  buildLemonadeProps(stall, P);
  stall.userData.stallTap = true;
  /* Benny keeps the shop street now, not the lemonade stall (Aug 4 2026).
     The stand is HERS: a bear behind her counter read as the bear running
     it, and he was one of three animals crowding the opening shot. He is
     the outdoor shops cashier, so he waits by the middle storefront and
     appears with that chunk of town. Characters never block a tile. Note
     the camera maps screen-x to x minus z: a spot must clear its building
     in that axis, not just in x. */
  const benny = buildBear(scene, 40.8, -33.2);
  benny.rotation.y = -0.9;
  blockRect(-3, 2, -3, 0);
  const trees = [
    buildTree(scene, P, -3.9, -2.6, 0.95),
    buildTree(scene, P, 4.4, -2.8, 0.85),
    buildTree(scene, P, -6.6, 6.2, 0.8),
    buildTree(scene, P, 6.6, 6.4, 0.9)
  ];
  const duck = buildDuck(scene, P, -2.2, 1.6, 1.0);
  const cat = buildCat(scene, P, 2.6, 2.2, 0.35);
  /* Deco props answer taps with a wobble instead of silence (clarity
     review): a tapped thing always responds, only sparkled things DO
     something. Crate stacks share one wobble group per stack. */
  const decoTaps = [];
  const crateA = new THREE.Group();
  buildCrate(crateA, P, 0, 0, 0, 0.5);
  buildCrate(crateA, P, 0.1, 0.5, -0.05, 0.42);
  crateA.position.set(-3.6, 0, 4.6);
  scene.add(crateA);
  const crateB = new THREE.Group();
  buildCrate(crateB, P, 0, 0, 0, 0.25);
  crateB.position.set(3.4, 0, 4.9);
  scene.add(crateB);
  blockAt(-3.6, 4.6);
  blockAt(3.4, 4.9);
  const deco1 = buildDecoStall(scene, P, -5.6, -0.4, 0.85);
  const deco2 = buildDecoStall(scene, P, 5.5, 2.9, -0.6);
  blockRect(-7, -5, -1, 0);
  blockRect(5, 6, 2, 3);
  for (const d of [crateA, crateB, deco1, deco2, benny]) {
    d.userData.decoTap = true;
    decoTaps.push(d);
  }

  /* Wayfinding signposts (clarity review): mango arrow at the plaza mouth
     pointing up the connector, and a two-armed post where the connector
     meets the ring (mango west toward the grocery run, toy blocks east
     toward the shops street). Each blocks exactly its tile. */
  /* On open grass west of the walkway, not on the connector spur: a post
     at the spur mouth is directly behind the stall under the locked
     camera and never shows at boot. */
  buildSignpost(scene, P, -4, 3, [
    { item: itemsById && itemsById.mango, ry: Math.PI / 2 }
  ]);
  blockAt(-4, 3);
  buildSignpost(scene, P, 2, -8, [
    { item: itemsById && itemsById.mango, ry: Math.PI },
    { item: itemsById && itemsById.blocks, ry: 0 }
  ]);
  blockAt(2, -8);

  /* The sparkle marks. Stall and grocery and house are always live;
     shopfront twinkles light with their unlock in setAisleOpen. */
  const twinkles = [];
  twinkles.push(buildTwinkle(stall, -1.2, 3.35, -0.6));
  twinkles.push(buildTwinkle(stall, 1.5, 3.15, -1.6));

  /* ---- house and yard (west, fully fenced with a gate onto the ring) ---- */
  const house = buildHouse(P);
  house.position.set(-47, 0, -34);
  house.rotation.y = 1.05;
  house.userData.houseTap = true;
  scene.add(house);
  twinkles.push(buildTwinkle(house, 0, 3.15, 0.5));
  blockRect(-49, -45, -36, -32);
  const YARD = { x0: -54, x1: -40, z0: -41, z1: -21, gz0: -32, gz1: -30 };
  const yard = new THREE.Group();
  scene.add(yard);
  {
    const soil = mat(0x8A5A33), sprout = mat(0x4FA85E), wood = mat(P.wood);
    const plot = new THREE.Group();
    vox(plot, 2.4, 0.18, 1.6, 0, 0.09, 0, soil);
    for (let r = 0; r < 3; r++) {
      vox(plot, 2.0, 0.08, 0.2, 0, 0.2, -0.5 + r * 0.5, sprout, { noCast: true });
    }
    vox(plot, 0.22, 0.3, 0.22, -0.6, 0.32, -0.5, sprout, { noCast: true });
    vox(plot, 0.22, 0.34, 0.22, 0.55, 0.34, 0.5, sprout, { noCast: true });
    plot.position.set(-51, 0, -25);
    plot.rotation.y = 0.25;
    yard.add(plot);
    blockRect(-52, -50, -26, -24);
    const mailbox = new THREE.Group();
    vox(mailbox, 0.12, 0.95, 0.12, 0, 0.48, 0, wood);
    vox(mailbox, 0.5, 0.34, 0.32, 0, 1.08, 0, mat(P.awningA));
    vox(mailbox, 0.08, 0.2, 0.06, 0.2, 1.32, 0, mat(0xFFD34D), { noCast: true });
    mailbox.position.set(-41.2, 0, -34.6);
    mailbox.rotation.y = 1.0;
    yard.add(mailbox);
    blockAt(-41.2, -34.6);
    /* Perimeter fence: posts every couple of tiles, low rails between,
       a gate gap on the east side lined up with the ring spur. */
    const post = (px, pz) => vox(yard, 0.14, 0.7, 0.14, px, 0.35, pz, wood);
    const railX = (x0, x1, pz) => {
      vox(yard, x1 - x0, 0.12, 0.08, (x0 + x1) / 2, 0.55, pz, wood, { noCast: true });
      vox(yard, x1 - x0, 0.12, 0.08, (x0 + x1) / 2, 0.28, pz, wood, { noCast: true });
    };
    const railZ = (px, z0, z1) => {
      vox(yard, 0.08, 0.12, z1 - z0, px, 0.55, (z0 + z1) / 2, wood, { noCast: true });
      vox(yard, 0.08, 0.12, z1 - z0, px, 0.28, (z0 + z1) / 2, wood, { noCast: true });
    };
    for (let x = YARD.x0; x <= YARD.x1; x += 2) { post(x, YARD.z0); post(x, YARD.z1); }
    for (let z = YARD.z0; z <= YARD.z1; z += 2) {
      post(YARD.x0, z);
      if (z < YARD.gz0 - 1 || z > YARD.gz1 + 1) post(YARD.x1, z);
    }
    railX(YARD.x0, YARD.x1, YARD.z0);
    railX(YARD.x0, YARD.x1, YARD.z1);
    railZ(YARD.x0, YARD.z0, YARD.z1);
    railZ(YARD.x1, YARD.z0, YARD.gz0 - 1);
    railZ(YARD.x1, YARD.gz1 + 1, YARD.z1);
    blockRect(YARD.x0, YARD.x1, YARD.z0, YARD.z0);
    blockRect(YARD.x0, YARD.x1, YARD.z1, YARD.z1);
    blockRect(YARD.x0, YARD.x0, YARD.z0, YARD.z1);
    blockRect(YARD.x1, YARD.x1, YARD.z0, YARD.gz0 - 1);
    blockRect(YARD.x1, YARD.x1, YARD.gz1 + 1, YARD.z1);
    const blooms = [0xF6699A, 0xFFD34D, 0xF04E3E];
    [[-44.6, -24.2], [-48.6, -27.8], [-45.6, -38.2]].forEach((p, i) => {
      vox(yard, 0.08, 0.3, 0.08, p[0], 0.15, p[1], mat(0x2E7A40), { noCast: true });
      vox(yard, 0.2, 0.2, 0.2, p[0], 0.4, p[1], mat(blooms[i]), { noCast: true });
      vox(yard, 0.08, 0.26, 0.08, p[0] + 0.35, 0.13, p[1] + 0.3, mat(0x2E7A40), { noCast: true });
      vox(yard, 0.17, 0.17, 0.17, p[0] + 0.35, 0.34, p[1] + 0.3, mat(blooms[(i + 1) % 3]), { noCast: true });
    });
  }
  trees.push(
    buildTree(scene, P, -51, -18.5, 0.85),
    buildTree(scene, P, -43, -14, 0.8),
    buildTree(scene, P, -51.5, -44, 0.9)
  );

  /* ---- grocery zone (north) ---- */
  const grocery = buildGroceryExt(P);
  grocery.position.set(0, 0, -64.5);
  grocery.userData.groceryTap = true;
  scene.add(grocery);
  twinkles.push(buildTwinkle(grocery, 1.8, 4.15, 1.6));
  blockRect(-4, 4, -67, -62);
  trees.push(
    buildTree(scene, P, -8, -66, 0.8),
    buildTree(scene, P, 8, -66.5, 0.85)
  );
  buildCrate(scene, P, -6.2, 0, -63.5, 0.4);
  buildCrate(scene, P, -6.1, 0.5, -63.55, 0.32);
  blockAt(-6.2, -63.5);
  buildDecoStall(scene, P, 7, -63.8, -0.5);
  blockRect(6, 8, -65, -63);

  /* ---- park (inside the ring): playground west, lake east ---- */
  const swingSeats = buildSwing(scene, P, -17, -46.5, -0.3);
  blockRect(-19, -15, -47, -46);
  buildSlide(scene, P, -21, -44, 0.5);
  blockRect(-22, -20, -45, -43);
  /* The rotated chute's low end overhangs two tiles past the rect. */
  blockAt(-20, -42);
  blockAt(-19, -42);
  buildSandbox(scene, P, -22, -48);
  blockRect(-23, -21, -49, -47);
  buildBench(scene, P, -14.5, -42, 2.6);
  blockRect(-15, -14, -43, -42);
  buildBench(scene, P, 25, -30, -2.2);
  blockRect(24, 26, -31, -30);
  /* Dock posts, so the planks read as a dock and not a sandbar. */
  {
    const wood = mat(P.wood);
    vox(scene, 0.16, 0.9, 0.16, -3.4, 0.2, -34.5, wood);
    vox(scene, 0.16, 0.9, 0.16, -3.4, 0.2, -32.5, wood);
    vox(scene, 0.16, 0.9, 0.16, -5.6, 0.2, -34.5, wood);
    vox(scene, 0.16, 0.9, 0.16, -5.6, 0.2, -32.5, wood);
  }
  const lily = mat(0x4FA85E);
  vox(scene, 0.5, 0.05, 0.5, 3, -0.1, -30, lily, { noCast: true });
  vox(scene, 0.4, 0.05, 0.4, 14, -0.1, -36, lily, { noCast: true });
  vox(scene, 0.45, 0.05, 0.45, 7, -0.1, -38.5, lily, { noCast: true });
  vox(scene, 0.14, 0.1, 0.14, 3.12, -0.04, -29.95, mat(0xF6B8C4), { noCast: true });
  const fry = [buildFry(scene), buildFry(scene), buildFry(scene)];

  /* ---- Phase 6 park dressing. The rule from the tarp lesson holds: every
     prop registers its footprint AS it is built, never later. ---- */
  buildFlowerBed(scene, P, -30, -32, 0.2);
  blockRect(-31, -29, -33, -31);
  buildFlowerBed(scene, P, 18, -52, -0.3);
  blockRect(17, 19, -53, -51);
  for (const [x, z] of [[-12, -28], [0, -52], [-28, -48]]) {
    buildLantern(scene, P, x, z);
    blockAt(x, z);
  }
  /* Low picket run along the playground's back (north) edge, right behind
     the sandbox: posts every other tile, two rails, both ends open so the
     park flows around it. */
  {
    const wood = mat(P.wood);
    for (let x = -25; x <= -15; x += 2) vox(scene, 0.14, 0.7, 0.14, x, 0.35, -50, wood);
    vox(scene, 10, 0.12, 0.08, -20, 0.55, -50, wood, { noCast: true });
    vox(scene, 10, 0.12, 0.08, -20, 0.28, -50, wood, { noCast: true });
    blockRect(-25, -15, -50, -50);
  }
  const parkTrees = [
    [-28, -25, 0.9], [-31, -41, 0.85], [-24, -54, 0.9], [-8, -56, 0.85],
    [12, -51, 0.9], [28, -29, 0.85], [-15, -19, 0.9], [15, -16, 0.85],
    [26, -44, 0.8], [-20, -33, 0.8]
  ];
  for (const [x, z, s] of parkTrees) trees.push(buildTree(scene, P, x, z, s));

  /* ---- shops street (east): three storefront buildings ---- */
  const stands = {};
  for (const aisle of AISLES) {
    if (!SHOPFRONTS[aisle.id]) continue;
    const sf = buildShopfront(P, aisle, itemsById);
    const cz = SHOPFRONTS[aisle.id].cz;
    sf.group.position.set(SHOP_X, 0, cz);
    scene.add(sf.group);
    blockRect(42, 49, cz - 3, cz + 3);
    /* The locked tarp is 1.7 deep (world z cz+2.6..cz+4.3) and swallows the
       approach row where that row's tile centers fall inside it (toys and
       home; electronics' row center just misses). Block that row while the
       tarp is up so she cannot walk buried inside solid canvas; setAisleOpen
       clears it on unlock (unlocks never revert). */
    const tarpRow = Math.round(cz + 4);
    sf.tarpRow = (tarpRow >= cz + 2.6 && tarpRow <= cz + 4.3) ? tarpRow : null;
    if (sf.tarpRow !== null) blockRect(42, 49, sf.tarpRow, sf.tarpRow);
    /* Sparkle only while OPEN: on tarped fronts the mark would say "tap
       me" about a thing that only wobbles, and sparkle must come to mean
       "this works now" (clarity review). */
    sf.twinkle = buildTwinkle(sf.group, 0, 4.6, 1.0);
    sf.twinkle.visible = false;
    twinkles.push(sf.twinkle);
    stands[aisle.id] = sf;
  }
  buildCrate(scene, P, 43.5, 0, -51.5, 0.3);
  blockAt(43.5, -51.5);
  buildDecoStall(scene, P, 45, -12.5, -0.7);
  blockRect(44, 46, -13, -12);
  trees.push(
    buildTree(scene, P, 52, -52, 0.85),
    buildTree(scene, P, 52.5, -30, 0.8),
    buildTree(scene, P, 51.5, -16, 0.85)
  );

  /* ---- mango grove (south-east corner) ---- */
  const groveTrees = [
    [24, -1.5, 0.9], [31, -3, 0.85], [38, -5, 0.9], [45, -6, 0.85],
    [23, 3, 0.85], [30, 1.5, 0.9], [37, 0.5, 0.85], [44, -0.5, 0.9],
    [26, 6.5, 0.8], [34, 5, 0.9], [42, 4.5, 0.85], [48, 2.5, 0.8]
  ];
  for (const [x, z, s] of groveTrees) trees.push(buildMangoTree(scene, P, x, z, s));
  buildCrate(scene, P, 28, 0, 4, 0.4);
  blockAt(28, 4);

  /* Lanterns at the ring corners and the plaza and grocery mouths. */
  for (const [x, z] of [
    [-25, -8.2], [25, -8.2], [-25, -58.6], [25, -58.6],
    [1.6, -3.2], [1.6, -58.9]
  ]) {
    buildLantern(scene, P, x, z);
    blockAt(x, z);
  }

  /* Border woods: the world reads as a clearing, and the camera clamp
     never shows bare map edge. The six trees flanking the plaza's south
     edge are the v1 placements, part of the locked look. */
  for (const [x, z, s] of [
    [-13, 4.5, 0.9], [-19, 6.5, 0.8], [-24, 2.8, 0.85],
    [13, 5, 0.85], [20, 3.5, 0.9], [24, 6.8, 0.8],
    [-28, 3.5, 0.85], [-36, 6, 0.9], [-44, 4, 0.8], [-50, 3, 0.9],
    [-40, -72, 0.9], [-28, -74, 0.85], [-16, -71, 0.9], [-4, -74, 0.8],
    [8, -72, 0.9], [20, -74, 0.85], [32, -71, 0.9], [44, -73, 0.85],
    [-48, -70, 0.9], [-52, -64, 0.8],
    [52, -64, 0.85], [54, -46, 0.9], [53, -22, 0.8],
    [-54, -50, 0.85], [-52, -15, 0.9], [-54, -4, 0.8], [-50, -8, 0.85]
  ]) {
    trees.push(buildTree(scene, P, x, z, s));
  }
  /* Every tree blocks its trunk tile. */
  for (const t of trees) blockAt(t.position.x, t.position.z);

  /* ---- town zone barriers (Aug 4 2026) ----
     A locked chunk is shut in the collision grid AND wears something she
     can see: a hedge on grass, a shut gate where a path crosses the line.
     Both are DERIVED from the zone map every time the open set changes, so
     what stops her and what she looks at can never disagree. That is the
     tarp lesson generalised: render and collision move together or not at
     all. Nothing here owns geometry (every part is shared), so a rebuild
     costs one InstancedMesh pair and disposes cleanly. ---- */
  const BAR_GEO = {
    hedge: new THREE.BoxGeometry(0.98, 0.85, 0.98),
    hedgeTop: new THREE.BoxGeometry(0.84, 0.3, 0.84),
    post: new THREE.BoxGeometry(0.16, 1.15, 0.16),
    rail: new THREE.BoxGeometry(1.0, 0.14, 0.1),
    stile: new THREE.BoxGeometry(0.12, 0.8, 0.09),
    sign: new THREE.BoxGeometry(0.62, 0.34, 0.08),
    signFace: new THREE.BoxGeometry(0.48, 0.2, 0.05)
  };
  const BAR_MAT = {
    hedge: mat(0x2E7A40),
    hedgeTop: mat(0x4FA85E),
    wood: mat(P.wood),
    sign: mat(P.awningA),
    signFace: mat(0xFFF6EA)
  };
  const barriers = new THREE.Group();
  scene.add(barriers);
  /* Bit per zone, indexed like ZONE_ORDER. The market square is bit 0 and
     is never shut. */
  let openMask = 1;
  let barrierTiles = new Map();
  const zoneIsOpen = zi => (openMask & (1 << zi)) !== 0;

  /* Every locked tile that touches somewhere she can currently stand. Tiles
     a prop already stands on are skipped: a tree is barrier enough, and a
     hedge grown inside the yard fence would show over the pickets for no
     reason. */
  function frontierTiles() {
    const out = new Map();
    for (let ix = 0; ix < GW; ix++) {
      for (let iz = 0; iz < GH; iz++) {
        const i = ix + iz * GW;
        if (zoneIsOpen(zoneIdx[i]) || blocked[i]) continue;
        const x = ix + GX0, z = iz + GZ0;
        const key = x + ':' + z;
        const onPath = pathSet.has(key);
        let ry = null, gate = false;
        for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const jx = ix + dx, jz = iz + dz;
          if (!inGrid(jx, jz)) continue;
          const j = jx + jz * GW;
          if (!zoneIsOpen(zoneIdx[j]) || blocked[j]) continue;
          /* A barrier faces the side she arrives from, so it spans the line
             rather than standing edge-on to her. */
          if (ry === null) ry = dz !== 0 ? 0 : Math.PI / 2;
          /* A GATE only where a walkway genuinely crosses the line: path on
             both sides. The ring band runs the length of whole boundaries,
             so gating on "this tile is path" put a row of identical gates
             across open country. Hedge the run, gate the spur. */
          if (onPath && pathSet.has((jx + GX0) + ':' + (jz + GZ0))) {
            ry = dz !== 0 ? 0 : Math.PI / 2;
            gate = true;
            break;
          }
        }
        if (ry === null) continue;
        out.set(key, { kind: gate ? 'gate' : 'hedge', ry, x, z });
      }
    }
    return out;
  }

  function part(g, geo, material, x, y, z, ry = 0, cast = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  function buildGate(info) {
    const g = new THREE.Group();
    part(g, BAR_GEO.post, BAR_MAT.wood, -0.46, 0.57, 0);
    part(g, BAR_GEO.post, BAR_MAT.wood, 0.46, 0.57, 0);
    part(g, BAR_GEO.rail, BAR_MAT.wood, 0, 0.85, 0, 0, false);
    part(g, BAR_GEO.rail, BAR_MAT.wood, 0, 0.5, 0, 0, false);
    part(g, BAR_GEO.stile, BAR_MAT.wood, 0, 0.67, 0, 0, false);
    part(g, BAR_GEO.sign, BAR_MAT.sign, 0, 1.35, 0, 0, false);
    part(g, BAR_GEO.signFace, BAR_MAT.signFace, 0, 1.35, 0.03, 0, false);
    g.position.set(info.x, 0, info.z);
    g.rotation.y = info.ry;
    return g;
  }

  function buildBarrierSet(tiles) {
    const g = new THREE.Group();
    const hedges = [];
    for (const info of tiles.values()) {
      if (info.kind === 'gate') g.add(buildGate(info));
      else hedges.push(info);
    }
    if (hedges.length) {
      const body = new THREE.InstancedMesh(BAR_GEO.hedge, BAR_MAT.hedge, hedges.length);
      const top = new THREE.InstancedMesh(BAR_GEO.hedgeTop, BAR_MAT.hedgeTop, hedges.length);
      hedges.forEach((h, i) => {
        M4.makeTranslation(h.x, 0.42, h.z);
        body.setMatrixAt(i, M4);
        M4.makeTranslation(h.x, 0.97, h.z);
        top.setMatrixAt(i, M4);
      });
      body.castShadow = top.castShadow = true;
      body.receiveShadow = top.receiveShadow = true;
      g.add(body, top);
    }
    return g;
  }

  function dropBarrierSet(g) {
    barriers.remove(g);
    g.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  }

  /* The hedges and gates that just stopped existing sink into the ground
     while the new frontier is already standing: the road opening reads as
     the fence going away, not as the whole town flickering. */
  function sinkBarriers(gone) {
    if (!gone.size) return;
    const g = buildBarrierSet(gone);
    scene.add(g);
    play('chime');
    addTween(700, t => {
      g.position.y = -t * 1.4;
      g.scale.set(1, Math.max(0.001, 1 - t), 1);
    }, () => {
      scene.remove(g);
      g.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    });
  }

  /* The town gets busier as it grows. Her market square boots with only her
     and her stand on screen, which is the whole point: a first-timer
     could not tell which animal she was. Benny keeps the shop
     street; the duck and the cat move in with the park. */
  function setZoneLife() {
    benny.visible = zoneIsOpen(3);
    duck.visible = zoneIsOpen(2);
    cat.visible = zoneIsOpen(2);
  }

  function setZones(open, opts = {}) {
    let mask = 1;
    for (let i = 0; i < ZONE_ORDER.length; i++) {
      if (open.has(ZONE_ORDER[i])) mask |= 1 << i;
    }
    if (mask === openMask && barrierTiles.size) return;
    openMask = mask;
    for (let i = 0; i < zoneShut.length; i++) {
      zoneShut[i] = zoneIsOpen(zoneIdx[i]) ? 0 : 1;
    }
    const next = frontierTiles();
    const gone = new Map();
    for (const [key, info] of barrierTiles) {
      if (!next.has(key)) gone.set(key, info);
    }
    barrierTiles = next;
    for (const c of barriers.children.slice()) dropBarrierSet(c);
    barriers.add(buildBarrierSet(next));
    setZoneLife();
    if (opts.pop) sinkBarriers(gone);
  }

  /* Fenced by default. store.js applies the real open set at boot, after it
     has told setAisleOpen which tarps are down: barriers are computed from
     the final collision grid, so that order matters. */
  setZones(new Set(['plaza']));

  const avatar = buildBunny(scene);
  avatar.position.set(0, 0, 2.4);
  avatar.rotation.y = 0.6;
  avatar.userData.avatarTap = true;

  /* "This one is you." A marker floats over her head permanently, because
     the opening shot has to answer that question before anything else can
     be taught. It lives in the scene rather than inside the avatar group so
     the hop squash never distorts it, and it is a tap target for her, so a
     child who aims at the arrow still gets the joy jump. */
  const marker = new THREE.Group();
  {
    /* One big down-pointing pyramid with a thin cream collar, floating in
       clear air above her ears. Deliberately NOT capped with a plate: from
       this camera angle a plate on top hides the pyramid under it and reads
       as scenery. Emissive, so the marker keeps its colour inside the
       stall's shadow and means the same thing in evening mode. */
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 1.15, 4), mat(0xFF7A18, { glow: 0.95 }));
    pin.rotation.x = Math.PI;
    pin.castShadow = false;
    marker.add(pin);
    marker.userData.avatarTap = true;
    scene.add(marker);
  }

  /* ---- follow camera. Same offset and view formula as the locked Phase 1
     framing; the target tracks her, clamped to the map, EXCEPT in the
     plaza core where it locks to (0,0), reproducing the locked framing
     exactly. The sun (and its shadow box) rides along. ---- */
  const CAM = { x0: -48, x1: 45, z0: -62, z1: 0.5 };
  const camCenter = { x: 0, z: 0 };
  let camera = null;

  function followTarget(x, z) {
    if (Math.abs(x) <= 6.5 && z >= -4.5 && z <= 7.5) return { x: 0, z: 0 };
    return {
      x: Math.min(CAM.x1, Math.max(CAM.x0, x)),
      z: Math.min(CAM.z1, Math.max(CAM.z0, z))
    };
  }

  function updateCam() {
    camera.position.set(camCenter.x + 9, 10, camCenter.z + 9);
    camera.lookAt(camCenter.x, 0.7, camCenter.z + 0.9);
    sun.position.set(camCenter.x + P.sun.pos[0], P.sun.pos[1], camCenter.z + P.sun.pos[2]);
    sun.target.position.set(camCenter.x, 0, camCenter.z);
  }

  function resize() {
    /* A zero-size viewport (the browser pane before layout, never a real
       device) would derive NaN camera clamps that poison camCenter until
       the next placeAvatar. Fall back to iPad-ish dims; the real resize
       recomputes everything the moment layout exists. */
    const w = canvas.clientWidth || innerWidth || 1024;
    const h = canvas.clientHeight || innerHeight || 768;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewH = Math.max(11.8, 14.2 / aspect);
    camera = new THREE.OrthographicCamera(
      -viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 0.1, 100);
    /* Derive the clamp from this viewport's actual ground footprint: the
       view must never reach past the tile map's west, east or north edge
       (bare void), while the south overshoot past z=8.5 stays: that sky
       band IS the locked plaza framing. Fixed numbers here fail whichever
       orientation they were not tuned in; portrait reaches ~8 tiles wider. */
    const probe = camera.clone();
    probe.position.set(9, 10, 9);
    probe.lookAt(0, 0.7, 0.9);
    probe.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity;
    const a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      a3.set(nx, ny, -1).unproject(probe);
      b3.set(nx, ny, 1).unproject(probe).sub(a3);
      const t = -a3.y / b3.y;
      minX = Math.min(minX, a3.x + b3.x * t);
      maxX = Math.max(maxX, a3.x + b3.x * t);
      minZ = Math.min(minZ, a3.z + b3.z * t);
    }
    CAM.x0 = -56.5 - minX;
    CAM.x1 = 55.5 - maxX;
    CAM.z0 = -76.5 - minZ;
    camCenter.x = Math.min(CAM.x1, Math.max(CAM.x0, camCenter.x));
    camCenter.z = Math.min(CAM.z1, Math.max(CAM.z0, camCenter.z));
    updateCam();
  }
  resize();

  /* ---- animation ---- */
  let now = 0;
  const tweens = [];

  function addTween(dur, fn, done) {
    tweens.push({ t0: now, dur, fn, done });
  }

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
    /* Camera follow: exponential ease toward the target, frame-rate safe. */
    const ct = followTarget(avatar.position.x, avatar.position.z);
    const k = 1 - Math.exp(-dt / 260);
    camCenter.x += (ct.x - camCenter.x) * k;
    camCenter.z += (ct.z - camCenter.z) * k;
    updateCam();
    /* Gentle diegetic life: sway and bob, zero consequence. The y bob must
       yield while the duck is walking as a stand customer, or it stomps the
       hop tween and he slides over flat. */
    const s = now / 1000;
    duck.rotation.z = Math.sin(s * 1.6) * 0.05;
    if (!duck.userData.busy) duck.position.y = Math.max(0, Math.sin(s * 3.2) * 0.03);
    cat.rotation.z = Math.sin(s * 1.3 + 2) * 0.04;
    /* Her bunny breathes while idle so the PLAYER character is the liveliest
       thing on screen (clarity review). The busy guard is the duck-bob
       lesson: ambient writes after the tween loop would stomp the hop
       squash every frame. */
    if (!avatar.userData.busy) {
      const br = Math.sin(s * 2.4) * 0.015;
      avatar.scale.set(1 - br * 0.4, 1 + br, 1 - br * 0.4);
    }
    /* Her marker rides above her head, bobbing and turning. Written after
       the tween loop on purpose: it must follow the hop, and it owns no
       part of the avatar's own transform so it cannot stomp the squash. */
    marker.position.set(
      avatar.position.x,
      avatar.position.y + 3.08 + Math.sin(s * 2.8) * 0.12,
      avatar.position.z
    );
    marker.rotation.y = s * 0.8;
    /* Benny waves outside his shop every few seconds: a staffed storefront
       invites the tap that opens the aisle. */
    const wavePhase = Math.max(0, Math.sin(s * 0.5));
    benny.userData.armR.rotation.z = -0.25 - wavePhase * (0.7 + Math.sin(s * 7) * 0.25);
    stepTwinkles(twinkles, s);
    swingSeats.forEach((seat, i) => {
      seat.rotation.x = Math.sin(s * 1.1 + i * 1.7) * 0.16;
    });
    fry.forEach((f, i) => {
      const a = s * 0.5 + i * 2.1;
      f.position.set(LAKE.cx + Math.cos(a) * 5, -0.1, LAKE.cz + Math.sin(a) * 3);
      f.rotation.y = Math.atan2(-Math.sin(a) * 5, Math.cos(a) * 3);
    });
  }

  function frame() {
    renderer.render(scene, camera);
  }

  /* ---- routing (World v2): A* over the collision grid, then greedy
     line-of-sight simplification so the hop chain cuts clean diagonals on
     open ground instead of stair-stepping tile by tile. ---- */
  /* With a preference point (the walker's tile), ties at the same ring
     radius resolve to the tapper's side of the prop: a fence tap from
     inside the yard must land just inside the fence, not on the far side
     and around the whole perimeter. */
  function nearestOpen(ix, iz, pix, piz) {
    if (isOpen(ix, iz)) return { ix, iz };
    const hasPref = pix !== undefined;
    for (let r = 1; r <= 8; r++) {
      let best = null, bestD = Infinity;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!isOpen(ix + dx, iz + dz)) continue;
          if (!hasPref) return { ix: ix + dx, iz: iz + dz };
          const d = (ix + dx - pix) ** 2 + (iz + dz - piz) ** 2;
          if (d < bestD) { bestD = d; best = { ix: ix + dx, iz: iz + dz }; }
        }
      }
      if (best) return best;
    }
    return { ix, iz };
  }

  /* Exact supercover walk of the grid under the segment (Amanatides-Woo):
     every tile the line touches is checked, and a pass exactly through a
     tile corner needs both orthogonal neighbors open, mirroring the A*
     diagonal rule. A point sampler here misses sub-spacing corner chords
     and lets the simplifier accept cuts A* refused. Endpoints are tile
     centers (route() only feeds it A* output). */
  function losOpen(ax, az, bx, bz) {
    let ix = tix(ax), iz = tiz(az);
    const jx = tix(bx), jz = tiz(bz);
    if (!isOpen(ix, iz)) return false;
    const dx = bx - ax, dz = bz - az;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    let tMaxX = dx ? (ix + GX0 + sx * 0.5 - ax) / dx : Infinity;
    let tMaxZ = dz ? (iz + GZ0 + sz * 0.5 - az) / dz : Infinity;
    const tDx = dx ? Math.abs(1 / dx) : Infinity;
    const tDz = dz ? Math.abs(1 / dz) : Infinity;
    let guard = 0;
    while ((ix !== jx || iz !== jz) && guard++ < 400) {
      if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
        if (!isOpen(ix + sx, iz) || !isOpen(ix, iz + sz)) return false;
        ix += sx; iz += sz;
        tMaxX += tDx; tMaxZ += tDz;
      } else if (tMaxX < tMaxZ) {
        ix += sx; tMaxX += tDx;
      } else {
        iz += sz; tMaxZ += tDz;
      }
      if (!isOpen(ix, iz)) return false;
    }
    return true;
  }

  function astar(s, g) {
    if (s.ix === g.ix && s.iz === g.iz) return [s];
    const came = new Map();
    const gs = new Map();
    const heap = [];
    const key = n => n.ix + n.iz * GW;
    const h = n => {
      const dx = Math.abs(n.ix - g.ix), dz = Math.abs(n.iz - g.iz);
      return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
    };
    const push = it => {
      heap.push(it);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    gs.set(key(s), 0);
    push({ ...s, f: h(s) });
    let steps = 0;
    while (heap.length && steps++ < 20000) {
      const cur = pop();
      if (cur.ix === g.ix && cur.iz === g.iz) {
        const out = [];
        let k = key(cur), n = { ix: cur.ix, iz: cur.iz };
        for (;;) {
          out.push(n);
          if (!came.has(k)) break;
          n = came.get(k);
          k = key(n);
        }
        return out.reverse();
      }
      /* Lazy deletion: a heap entry beaten by a later, cheaper path to the
         same tile is stale; skip it instead of re-expanding. */
      if (cur.f - h(cur) > (gs.get(key(cur)) ?? Infinity) + 1e-6) continue;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const nx = cur.ix + dx, nz = cur.iz + dz;
          if (!isOpen(nx, nz)) continue;
          if (dx && dz && (!isOpen(cur.ix + dx, cur.iz) || !isOpen(cur.ix, cur.iz + dz))) continue;
          const cost = (dx && dz) ? 1.41 : 1;
          const ng = gs.get(key(cur)) + cost;
          const nk = nx + nz * GW;
          if (ng < (gs.get(nk) ?? Infinity)) {
            gs.set(nk, ng);
            came.set(nk, { ix: cur.ix, iz: cur.iz });
            push({ ix: nx, iz: nz, f: ng + h({ ix: nx, iz: nz }) });
          }
        }
      }
    }
    return null;
  }

  /* World-coordinate waypoints from here to (tx, tz). The final point is
     always the exact target, even inside a footprint (scripted spots). */
  function route(fx, fz, txw, tzw) {
    const s = nearestOpen(tix(fx), tiz(fz));
    const g = s && nearestOpen(tix(txw), tiz(tzw), s.ix, s.iz);
    /* Nothing open within the search radius. Town zones made this reachable
       in a way props never did, and a thrown frame in the tap handler is
       outside the loop's try/catch: walk the straight line instead of
       freezing her game. */
    if (!s || !g) return [{ x: txw, z: tzw }];
    const tiles = astar(s, g);
    if (!tiles) return [{ x: txw, z: tzw }];
    const pts = tiles.map(t => ({ x: t.ix + GX0, z: t.iz + GZ0 }));
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !losOpen(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    out.push({ x: txw, z: tzw });
    return out;
  }

  /* Hop chain with squash and stretch (Crossy Road feel). World v2 routes
     every walk through the collision grid, and long walks break into a
     faster, longer stride so cross-town trips stay quick. A tap mid-hop
     RETARGETS rather than drops: the generation counter stops the stale
     chain after its current tween, so its onDone never fires and the new
     destination always wins. */
  let hopGen = 0;

  /* Joy jump in place: her response to being tapped directly (clarity
     review: the avatar answering taps is how a first-timer learns which
     animal is hers). Guarded so a walk started mid-jump wins cleanly. */
  function joyJump() {
    const gen = hopGen;
    avatar.userData.busy = true;
    play('hop');
    addTween(360, t => {
      if (gen !== hopGen) return;
      avatar.position.y = 4 * t * (1 - t) * 0.8;
      const sq = 0.86 + Math.sin(Math.PI * t) * 0.3;
      avatar.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
    }, () => {
      if (gen !== hopGen) return;
      avatar.position.y = 0;
      avatar.scale.set(1, 1, 1);
      avatar.userData.busy = false;
    });
  }

  function hopTo(tx, tz, onDone) {
    const gen = ++hopGen;
    const pts = route(avatar.position.x, avatar.position.z, tx, tz);
    let total = 0;
    {
      let cx = avatar.position.x, cz = avatar.position.z;
      for (const p of pts) {
        total += Math.hypot(p.x - cx, p.z - cz);
        cx = p.x; cz = p.z;
      }
    }
    const stride = total > 12 ? 1.35 : 0.95;
    const hopMs = total > 12 ? 122 : 175;
    const hops = [];
    let cx = avatar.position.x, cz = avatar.position.z;
    for (const p of pts) {
      const dx = p.x - cx, dz = p.z - cz;
      const dist = Math.hypot(dx, dz);
      /* A duplicate waypoint (walkTo resolving a blocked tap to the tile
         center route() already ends on) must not become a zero-length hop:
         atan2(0,0) would snap her to face south for a bonus hop in place. */
      if (dist < 1e-9) { cx = p.x; cz = p.z; continue; }
      const n = Math.max(1, Math.ceil(dist / stride));
      for (let i = 1; i <= n; i++) {
        hops.push({ x: cx + dx * i / n, z: cz + dz * i / n });
      }
      cx = p.x; cz = p.z;
    }
    avatar.userData.busy = hops.length > 0;
    function nextHop() {
      if (gen !== hopGen) return;
      const h = hops.shift();
      if (!h) {
        avatar.scale.set(1, 1, 1);
        avatar.userData.busy = false;
        if (onDone) onDone();
        return;
      }
      const sx = avatar.position.x, sz = avatar.position.z;
      avatar.rotation.y = Math.atan2(h.x - sx, h.z - sz);
      play('hop');
      addTween(hopMs, t => {
        /* A superseded chain's in-flight tween must stop writing at once:
           step() runs older tweens last, so an unguarded stale tween wins
           every frame and the retargeted walk appears as a teleport when
           it expires. */
        if (gen !== hopGen) return;
        avatar.position.x = sx + (h.x - sx) * t;
        avatar.position.z = sz + (h.z - sz) * t;
        avatar.position.y = 0.5 * 4 * t * (1 - t) * 0.9;
        const sq = 0.86 + Math.sin(Math.PI * t) * 0.26;
        const hs = 1 + (1 - sq) * 0.5;
        avatar.scale.set(hs, sq, hs);
      }, nextHop);
    }
    nextHop();
  }

  /* Free walking: clamp the tap into the map, land on the nearest open
     tile (never inside a prop), and route there. Every walk tap leaves a
     brief cream ring at the RESOLVED destination (clarity review: the
     tap-means-walk rule needs a visible cause-effect mark, especially when
     rerouting moves the landing spot). */
  function walkTo(x, z) {
    let tx = Math.min(GX0 + GW - 2, Math.max(GX0 + 1, x));
    let tz = Math.min(GZ0 + GH - 2, Math.max(GZ0 + 1, z));
    if (!isOpen(tix(tx), tiz(tz))) {
      const t = nearestOpen(tix(tx), tiz(tz),
        tix(avatar.position.x), tiz(avatar.position.z));
      /* A tap deep inside a fenced chunk has nothing open near it. Standing
         still is the honest answer; store.js says why in words. */
      if (!t) return;
      tx = t.ix + GX0;
      tz = t.iz + GZ0;
    }
    hopTo(tx, tz);
    tapRing(tx, tz);
  }

  /* Square cream ring that scales up and fades at a walk destination.
     Reads hopGen at call time, so call it AFTER hopTo: a retap hides the
     stale ring instantly. Never a raycast target (not in pickables). */
  function tapRing(x, z) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({
      color: 0xFFF6EA, transparent: true, opacity: 0.95
    });
    const geo = new THREE.BoxGeometry(1, 0.06, 0.12);
    for (const [rx, rz, ry] of [[0, 0.44, 0], [0, -0.44, 0],
      [0.44, 0, Math.PI / 2], [-0.44, 0, Math.PI / 2]]) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(rx, 0, rz);
      mesh.rotation.y = ry;
      g.add(mesh);
    }
    g.position.set(x, 0.06, z);
    scene.add(g);
    const gen = hopGen;
    addTween(420, t => {
      if (gen !== hopGen) { g.visible = false; return; }
      g.scale.setScalar(0.55 + t * 0.8);
      m.opacity = 0.95 * (1 - t);
    }, () => {
      scene.remove(g);
      geo.dispose();
      m.dispose();
    });
  }

  /* Scene switches (room, grocery) put her back instantly: position set,
     hop chains cancelled, camera SNAPPED to her spot (no cross-map pan
     after an interior). */
  function placeAvatar(x, z) {
    hopGen++;
    avatar.userData.busy = false;
    avatar.position.set(x, 0, z);
    avatar.scale.set(1, 1, 1);
    const ct = followTarget(x, z);
    camCenter.x = ct.x;
    camCenter.z = ct.z;
    updateCam();
  }

  /* Where the avatar stands to shop an aisle: on the spur path in front of
     the storefront's door. */
  function shopSpot(aisleId) {
    const p = SHOPFRONTS[aisleId];
    if (!p) return grocerySpot();
    return { x: SHOP_X, z: p.cz + 4.4 };
  }

  function grocerySpot() { return { x: 0, z: -61.2 }; }
  function houseSpot() { return { x: -45, z: -31.5 }; }

  /* Behind the counter, next to Benny: where the bunny runs the stand. */
  function standSpot() { return { x: -1.5, z: -2.05 }; }

  /* ---- stand customers (Phase 4) ---- */
  /* Same hop chain the avatar uses, for any group. No retarget generation:
     customer moves are strictly sequenced by the stand flow, all within
     the open plaza, so they stay off the routing grid. Scaled groups
     (the cub) keep their base scale through the squash and stretch. */
  function hopGroup(g, tx, tz, done) {
    const base = g.scale.x;
    const from = { x: g.position.x, z: g.position.z };
    const dx = tx - from.x, dz = tz - from.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.95));
    g.rotation.y = Math.atan2(dx, dz);
    let i = 0;
    function nextHop() {
      if (i >= n) {
        g.scale.setScalar(base);
        if (done) done();
        return;
      }
      i++;
      const sx = g.position.x, sz = g.position.z;
      const hx = from.x + dx * i / n, hz = from.z + dz * i / n;
      addTween(175, t => {
        g.position.x = sx + (hx - sx) * t;
        g.position.z = sz + (hz - sz) * t;
        g.position.y = 0.5 * 4 * t * (1 - t) * 0.9;
        const sq = 0.86 + Math.sin(Math.PI * t) * 0.26;
        const hs = 1 + (1 - sq) * 0.5;
        g.scale.set(base * hs, base * sq, base * hs);
      }, nextHop);
    }
    nextHop();
  }

  const AMBIENT = {
    duck: { group: duck, home: { x: -2.2, z: 1.6, ry: 1.0 } },
    cat: { group: cat, home: { x: 2.6, z: 2.2, ry: 0.35 } }
  };
  const CUSTOMER_SPOT = { x: 0.55, z: 0.35 };

  /* Bring a customer to the stall. Duck and cat are the plaza regulars and
     walk over from their ambient spots (and back after); everyone else hops
     in from the walkway edge and leaves the way they came. The caller
     sequences enter/leave strictly, so no two chains share a group. */
  function customerEnter(species, done) {
    /* A duck who has not moved into town yet cannot stroll over from her
       spot: before the park opens the ambient pair is hidden, so those
       customers arrive from the walkway edge like every other species. */
    const ambient = AMBIENT[species];
    const amb = ambient && ambient.group.visible ? ambient : null;
    let g, side = Math.random() < 0.5 ? -1 : 1;
    if (amb) {
      g = amb.group;
      g.userData.busy = true;
    } else {
      g = new THREE.Group();
      const model = CUSTOMER_BUILDERS[species](g, P);
      /* buildDuck and buildCat parent themselves; the rest return a loose
         group that still needs adding. */
      if (model !== g && !model.parent) g.add(model);
      g.position.set(side * 7.5, 0, 1.5);
      scene.add(g);
    }
    hopGroup(g, CUSTOMER_SPOT.x, CUSTOMER_SPOT.z, () => {
      g.rotation.y = Math.PI;
      if (done) done();
    });
    return {
      group: g,
      leave(doneLeave) {
        /* A little joy jump, then off. */
        const base = g.scale.x;
        const y0 = g.position.y;
        addTween(260, t => {
          g.position.y = y0 + Math.sin(Math.PI * t) * 0.55;
        }, () => {
          g.position.y = y0;
          if (amb) {
            hopGroup(g, amb.home.x, amb.home.z, () => {
              g.rotation.y = amb.home.ry;
              g.userData.busy = false;
              if (doneLeave) doneLeave();
            });
          } else {
            hopGroup(g, side * 8.5, 1.5, () => {
              scene.remove(g);
              g.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
              });
              if (doneLeave) doneLeave();
            });
          }
        });
      }
    };
  }

  /* ---- seasonal skin (Phase 5, re-homed for World v2). A recolor of
     tree foliage plus a small prop group; 'summer' restores the locked
     Phase 1 look exactly. The park is the seasonal heart: snowman and
     pumpkins live there, flowers and leaves reach the yard, the grove
     and the ring. Neutral imagery only: flowers, leaves, plain pumpkins,
     a snowman. ---- */
  const SEASON_FOLIAGE = { spring: 0xF2A9C4, fall: 0xE8923E };
  let seasonProps = null;

  function buildSeasonProps(season) {
    const g = new THREE.Group();
    if (season === 'spring') {
      const stemM = mat(0x2E7A40);
      const blooms = [0xF6699A, 0xFFD34D, 0xF6B8C4, 0xF04E3E, 0xF6699A];
      [[-3.2, -1.6], [2.9, -1.8], [-1.2, 6.6], [3, -45], [-12, -38],
       [-49, -25.5], [3, -59.5], [24, 2]].forEach((p, i) => {
        vox(g, 0.08, 0.34, 0.08, p[0], 0.17, p[1], stemM, { noCast: true });
        vox(g, 0.2, 0.2, 0.2, p[0], 0.42, p[1], mat(blooms[i % 5]), { noCast: true });
        vox(g, 0.08, 0.3, 0.08, p[0] + 0.35, 0.15, p[1] + 0.25, stemM, { noCast: true });
        vox(g, 0.17, 0.17, 0.17, p[0] + 0.35, 0.37, p[1] + 0.25, mat(blooms[(i + 2) % 5]), { noCast: true });
      });
    } else if (season === 'fall') {
      /* The lakeside pumpkin sits on the north shore: (10,-27) is inside
         the v2 lake ellipse and would float on open water. */
      for (const [x, z, s] of [[-14, -44.5, 1], [10, -22, 0.8], [-46, -26, 0.75]]) {
        vox(g, 0.62 * s, 0.44 * s, 0.62 * s, x, 0.22 * s, z, mat(0xE07A2E));
        vox(g, 0.5 * s, 0.36 * s, 0.5 * s, x, 0.26 * s, z, mat(0xEF8A3A));
        vox(g, 0.1 * s, 0.14 * s, 0.1 * s, x, 0.5 * s, z, mat(0x6E5A2E), { noCast: true });
      }
      const leafCols = [0xE8923E, 0xD96C35, 0xE8B060];
      [[-4.6, -1.4], [3.3, -1.9], [-6.0, 3.1], [6.1, 5.4], [0.5, -4.2],
       [-39.5, -22], [39.5, -40], [-16, -61.2], [18, -61.4], [45, -41.5]].forEach((p, i) => {
        vox(g, 0.5, 0.04, 0.5, p[0], 0.03, p[1], mat(leafCols[i % 3]), { noCast: true });
        vox(g, 0.34, 0.04, 0.34, p[0] + 0.3, 0.03, p[1] + 0.25, mat(leafCols[(i + 1) % 3]), { noCast: true });
      });
    } else if (season === 'winter') {
      const snowM = mat(0xF4F8F8);
      [[-4.7, -1.5], [3.5, -2.0], [-6.1, 3.2], [0.6, -4.6], [-39.6, -28],
       [39.4, -34], [-12, -61.5], [14, -61.2], [-46, -30],
       [-15, -44.5], [-11, -41.5], [-18.5, -48], [-20.5, -41]].forEach(p => {
        vox(g, 0.9, 0.05, 0.9, p[0], 0.03, p[1], snowM, { noCast: true });
        vox(g, 0.6, 0.05, 0.6, p[0] + 0.4, 0.03, p[1] + 0.35, snowM, { noCast: true });
      });
      const dark = mat(0x2B2118);
      const sm = new THREE.Group();
      vox(sm, 0.85, 0.8, 0.85, 0, 0.4, 0, snowM);
      vox(sm, 0.6, 0.55, 0.6, 0, 1.05, 0, snowM);
      vox(sm, 0.08, 0.1, 0.08, -0.13, 1.18, 0.3, dark, { noCast: true });
      vox(sm, 0.08, 0.1, 0.08, 0.13, 1.18, 0.3, dark, { noCast: true });
      vox(sm, 0.1, 0.1, 0.26, 0, 1.05, 0.4, mat(0xF08A1E), { noCast: true });
      vox(sm, 0.5, 0.1, 0.5, 0, 1.36, 0, dark, { noCast: true });
      vox(sm, 0.3, 0.24, 0.3, 0, 1.5, 0, dark, { noCast: true });
      /* Open park grass by the playground: the park is the seasonal heart
         of World v2, and nothing occludes this spot under the follow cam. */
      sm.position.set(-13, 0, -43);
      sm.rotation.y = -0.6;
      g.add(sm);
    }
    return g;
  }

  function setSeason(season) {
    for (const t of trees) {
      t.userData.folMat.color.set(SEASON_FOLIAGE[season] ?? P.foliage);
      for (const c of t.userData.snowCaps) c.visible = season === 'winter';
    }
    if (seasonProps) {
      scene.remove(seasonProps);
      seasonProps.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      seasonProps = null;
    }
    if (season !== 'summer') {
      seasonProps = buildSeasonProps(season);
      scene.add(seasonProps);
    }
    /* The snowman is a solid stack on open park grass: its tile blocks in
       winter and opens again with the melt (nothing else claims it). */
    blocked[tix(-13) + tiz(-43) * GW] = season === 'winter' ? 1 : 0;
  }

  function wobble(aisleId) {
    const st = stands[aisleId];
    if (!st) return;
    wobbleGroup(st.group, 0.03);
  }

  /* Shared wobble for any group: locked stands, deco stalls, crates. A tap
     is never met with silence (clarity review). */
  function wobbleGroup(g, amp = 0.04) {
    addTween(420, t => {
      g.rotation.z = Math.sin(t * Math.PI * 3) * amp * (1 - t);
    });
  }

  function setAisleOpen(aisleId, open, pop) {
    const st = stands[aisleId];
    if (!st) return;
    st.twinkle.visible = open;
    /* The tarp's collision row opens with the shop. */
    if (open && st.tarpRow !== null) {
      for (let x = 42; x <= 49; x++) blocked[(x - GX0) + (st.tarpRow - GZ0) * GW] = 0;
      st.tarpRow = null;
    }
    if (open && pop && st.tarp.visible) {
      addTween(650, t => {
        st.tarp.position.y = t * 6;
        st.tarp.rotation.z = t * 1.2;
        st.tarp.scale.setScalar(1 - t * 0.6);
      }, () => {
        /* Park the invisible tarp back in the building so it never lingers
           as a floating raycast target in the sky. */
        st.tarp.visible = false;
        st.tarp.position.y = 0;
        st.tarp.rotation.z = 0;
        st.tarp.scale.setScalar(1);
      });
      st.goods.visible = true;
    } else {
      st.tarp.visible = !open;
      st.goods.visible = open;
    }
  }

  /* Tap picking. Walk up from the hit mesh to the tagged group; a miss on
     every landmark falls through to the ground plane and becomes a walk.
     Taps are gated off while an interior scene (room, grocery) owns the
     canvas: this camera and these targets would otherwise still catch
     touches. */
  let tapsEnabled = true;
  function setTapsEnabled(v) { tapsEnabled = v; }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundPt = new THREE.Vector3();
  canvas.addEventListener('pointerdown', e => {
    if (!tapsEnabled) return;
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    /* Hidden landmarks must not answer taps: three.js raycasting does not
       skip invisible objects on its own, so Benny before the shops open
       would still swallow a tap meant for the grass behind him. */
    const pickables = [avatar, marker].concat(Object.values(stands).map(s => s.group))
      .concat([stall, house, grocery], decoTaps).filter(o => o.visible);
    const hits = ray.intersectObjects(pickables, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.aisleId && !o.userData.stallTap
        && !o.userData.houseTap && !o.userData.groceryTap
        && !o.userData.avatarTap && !o.userData.decoTap) o = o.parent;
      if (o) {
        if (o.userData.avatarTap) {
          /* Mid-walk, a tap on the bunny keeps falling through so ground
             retargeting still works; idle, she answers with a joy jump. */
          if (avatar.userData.busy) continue;
          joyJump();
          return;
        }
        if (o.userData.decoTap) { wobbleGroup(o); return; }
        if (o.userData.aisleId) { if (onTapAisle) onTapAisle(o.userData.aisleId); }
        else if (o.userData.houseTap) { if (onTapHouse) onTapHouse(); }
        else if (o.userData.groceryTap) { if (onTapGrocery) onTapGrocery(); }
        else if (onTapStall) onTapStall();
        return;
      }
    }
    if (ray.ray.intersectPlane(groundPlane, groundPt) && onTapGround) {
      onTapGround(groundPt.x, groundPt.z);
    }
  });

  addEventListener('resize', resize);

  /* ---- thumbnails ---- */
  let thumbR = null, thumbScene = null, thumbCam = null;
  const thumbCache = new Map();
  /* One shared ink material for silhouettes (Phase 5 catalog): unfound
     items render as dark shapes, still lit so the form reads. */
  const silMat = new THREE.MeshLambertMaterial({ color: 0x4A3C30 });

  function thumbnail(item, opts = {}) {
    const key = item.id + (opts.silhouette ? ':s' : '');
    if (thumbCache.has(key)) return thumbCache.get(key);
    return renderThumb(buildVoxGroup(item.vox), key, opts);
  }

  /* Portrait of a stand regular for the customer card (clarity review: the
     modal covers the animal it names, so the card carries the face). Same
     offscreen pipeline, same cache. */
  function speciesThumbnail(species) {
    const key = 'sp:' + species;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const holder = new THREE.Group();
    if (species === 'duck') buildDuck(holder, P, 0, 0, 0);
    else if (species === 'cat') buildCat(holder, P, 0, 0, 0);
    else if (CUSTOMER_BUILDERS[species]) holder.add(CUSTOMER_BUILDERS[species]());
    else return '';
    return renderThumb(holder, key, {});
  }

  function renderThumb(model, key, opts) {
    const size = opts.size || 150;
    if (!thumbR) {
      thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC9B99A, 1.5));
      const d = new THREE.DirectionalLight(0xFFFFFF, 2.2);
      d.position.set(4, 6, 5);
      thumbScene.add(d);
      thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
      thumbCam.position.set(5, 4.2, 6);
    }
    thumbR.setPixelRatio(1);
    thumbR.setSize(size, size, false);
    model.traverse(o => {
      o.castShadow = false;
      o.receiveShadow = false;
      if (opts.silhouette && o.material) {
        o.material.dispose();
        o.material = silMat;
      }
    });
    thumbScene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    const span = box.getSize(new THREE.Vector3()).length() * 0.62;
    thumbCam.left = -span; thumbCam.right = span;
    thumbCam.top = span; thumbCam.bottom = -span;
    thumbCam.updateProjectionMatrix();
    thumbCam.lookAt(c);
    thumbCam.position.set(c.x + 5, c.y + 4.2, c.z + 6);
    thumbCam.lookAt(c);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL('image/png');
    thumbScene.remove(model);
    /* Color thumbnails own their materials; silhouettes borrowed silMat,
       which is shared and must survive. */
    model.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== silMat) o.material.dispose();
    });
    thumbCache.set(key, url);
    return url;
  }

  return {
    scene, renderer, resize, step, frame,
    hopTo, walkTo, placeAvatar, shopSpot, grocerySpot, houseSpot, standSpot,
    customerEnter, wobble, setAisleOpen,
    thumbnail, speciesThumbnail, avatarJump: joyJump,
    avatar, setSeason, setTapsEnabled,
    /* Town zones. setZones takes the derived open set from js/zones.js;
       pass {pop: true} to sink the fences that just went away. */
    setZones,
    zoneAt: (x, z) => ZONE_ORDER[zoneIndexAt(Math.round(x), Math.round(z))],
    isZoneOpen: id => zoneIsOpen(ZONE_ORDER.indexOf(id)),
    zone: () => zoneOf(avatar.position.x, avatar.position.z),
    /* World v2 debug: is a world tile open to walk on? */
    isOpenAt: (x, z) => isOpen(tix(x), tiz(z))
  };
}
