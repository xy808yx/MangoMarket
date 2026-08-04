/* Generates icons/icon-192.png and icons/icon-512.png with no dependencies.
 * Flat marks only: cream rounded square, mango ellipse, leaf. Same pure-node
 * Pure-node PNG approach, no image libraries.
 * Run: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

const BG    = [0xFF, 0xF6, 0xE8];   // cream
const MANGO = [0xFF, 0xB7, 0x28];   // mango orange
const BLUSH = [0xF5, 0x8A, 0x2E];   // deeper mango
const LEAF  = [0x3E, 0x8E, 0x4E];   // leaf green

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf){
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data){
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // truecolour + alpha
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++){
    raw[p++] = 0;  // filter: none
    rgba.copy(raw, p, y * width * 4, (y + 1) * width * 4);
    p += width * 4;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const inRoundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
};

// Rotated ellipse: centre (cx,cy), radii (rx,ry), rotation in radians.
const inEllipse = (cx, cy, rx, ry, rot = 0) => (px, py) => {
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const dx = px - cx, dy = py - cy;
  const ex = (dx * c - dy * s) / rx;
  const ey = (dx * s + dy * c) / ry;
  return ex * ex + ey * ey <= 1;
};

function render(size){
  const S = 4;                       // supersample factor
  const buf = Buffer.alloc(size * size * 4);
  const u = size / 100;              // design units on a 100x100 grid

  const bg    = inRoundRect(0, 0, 100 * u, 100 * u, 22 * u);
  // Mango body: fat tilted ellipse, slightly low-left of centre.
  const body  = inEllipse(48 * u, 56 * u, 30 * u, 24 * u, -0.35);
  // Blush: overlapping ellipse offset to the lower right, clipped to body.
  const blush = inEllipse(58 * u, 63 * u, 22 * u, 16 * u, -0.35);
  // Leaf: slim rotated ellipse at the stem end (upper right of the body).
  const leaf  = inEllipse(74 * u, 27 * u, 13 * u, 5.5 * u, -0.7);

  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0; sy < S; sy++){
        for (let sx = 0; sx < S; sx++){
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          let col = null;
          if (bg(px, py)){
            col = BG;
            if (body(px, py)) col = blush(px, py) ? BLUSH : MANGO;
            if (leaf(px, py)) col = LEAF;
          }
          if (col){ rSum += col[0]; gSum += col[1]; bSum += col[2]; aSum += 255; }
        }
      }
      const n = S * S, i = (y * size + x) * 4;
      buf[i]     = Math.round(rSum / n);
      buf[i + 1] = Math.round(gSum / n);
      buf[i + 2] = Math.round(bSum / n);
      buf[i + 3] = Math.round(aSum / n);
    }
  }
  return png(size, size, buf);
}

for (const size of [192, 512]){
  writeFileSync(join(outDir, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}
