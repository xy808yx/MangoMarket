/* Generates every icon the game ships, with no dependencies.
 *
 * Pixel art: each design is a 16x16 character grid, scaled by an INTEGER
 * factor with nearest-neighbour sampling, so 192 (x12) and 512 (x32) are
 * exact and stay crisp. No antialiasing anywhere; the blocky edge is the
 * point, and it matches a game built out of voxels.
 *
 *   icons/icon-192.png   fruit stand          (PWA + apple-touch-icon)
 *   icons/icon-512.png   fruit stand          (PWA install / splash)
 *   icons/favicon-32.png awning over a cup    (browser tab)
 *   icons/favicon-16.png awning over a cup    (browser tab)
 *
 * Two designs on purpose. The stand is the better mark and reads at any size
 * a launcher uses, but at 16px its stripes, posts and counter collapse into
 * mush. So the tab keeps only the two parts of the stand that survive being
 * that small: a band of awning stripes across the top, and one lemonade cup
 * under it. Deliberately not the fruit on its own, which is too generic a
 * shape to identify this app at a glance in a row of tabs.
 *
 * FULL BLEED is not a style choice on the app icons. iOS ignores alpha in an
 * apple-touch-icon and composites what is left onto black, so a rounded
 * design with transparent corners ships with four black wedges around it.
 * The launcher draws the rounded corner; the icon must fill its square.
 *
 * Run: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

/* ---- palette. Game colours, not new ones: cream is the card/paper cream,
   mango and deep mango are the wallet and price colours, the awning red and
   white are the locked Phase 1 stall, leaf is the leaf. ---- */
const PAL = {
  '.': null,                    // transparent (the app icon's corners, filled)
  c: [0xFF, 0xF6, 0xEA],        // cream
  m: [0xFF, 0xB7, 0x28],        // mango
  l: [0x3E, 0x8E, 0x4E],        // leaf
  r: [0xF0, 0x4E, 0x3E],        // awning red
  w: [0xFF, 0xFF, 0xFF],        // awning white
  y: [0xFF, 0xD3, 0x4D],        // lemonade
  b: [0x9B, 0x6A, 0x3C],        // wood
  k: [0x3A, 0x2A, 0x1A]         // outline
};

/* The app mark: a market stall under a red-and-white striped awning with
   mangoes on the counter. */
const STAND = [
  '..cccccccccccc..',
  '.cccccccccccccc.',
  'cccccccccccccccc',
  'ccrwwrrwwrrwwrcc',
  'crrwwrrwwrrwwrrc',
  'ckkkkkkkkkkkkkkc',
  'cckcccccccccckcc',
  'cckcmmccccmmckcc',
  'cckcmmmccmmmckcc',
  'cckcllccccllckcc',
  'cckkkkkkkkkkkkcc',
  'ccbbbbbbbbbbbbcc',
  'ccbccccccccccbcc',
  'ccbccccccccccbcc',
  '.cbccccccccccbc.',
  '..cccccccccccc..'
];

/* The tab mark, for 16 and 32 pixels: a band of awning over one cup of
   lemonade. Four rows of stripe is the most that can shrink to 16px and still
   read as stripes rather than as noise, and the dark rail under them is what
   keeps the white stripes from bleeding into the cream below. Full bleed, so
   the square edge does the work a rounded corner cannot do at this size. */
const AWNING_CUP = [
  'rrrrwwwwrrrrwwww',
  'rrrrwwwwrrrrwwww',
  'rrrrwwwwrrrrwwww',
  'rrrrwwwwrrrrwwww',
  'kkkkkkkkkkkkkkkk',
  'cccccccccccccccc',
  'ccccccccccrccccc',
  'cccccccccrcccccc',
  'cckkkkkkkkkkkkcc',
  'cckyyyyyyyyyykcc',
  'ccckyyyyyyyykccc',
  'ccckyyyyyyyykccc',
  'cccckyyyyyykcccc',
  'cccckyyyyyykcccc',
  'ccccckyyyykccccc',
  'cccccckkkkcccccc'
];

/* ---- PNG writer: pure node, no image libraries ---- */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // truecolour + alpha
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
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

/* A wrong character or a short row would render as a silent hole, so check
   the grid before drawing it rather than after looking at the result. */
function validate(name, rows) {
  if (rows.length !== 16) throw new Error(`${name}: ${rows.length} rows, need 16`);
  rows.forEach((row, i) => {
    if (row.length !== 16) throw new Error(`${name} row ${i}: ${row.length} chars, need 16`);
    for (const ch of row) {
      if (!(ch in PAL)) throw new Error(`${name} row ${i}: unknown colour '${ch}'`);
    }
  });
}

function render(rows, size, { bleed = false } = {}) {
  if (size % 16 !== 0) throw new Error(`${size} is not a multiple of 16`);
  const scale = size / 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = rows[Math.floor(y / scale)][Math.floor(x / scale)];
      const col = PAL[ch] || (bleed ? PAL.c : null);
      const i = (y * size + x) * 4;
      if (col) {
        buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
      }
    }
  }
  return png(size, size, buf);
}

validate('stand', STAND);
validate('awning-cup', AWNING_CUP);

const built = [
  ['icon-192.png', render(STAND, 192, { bleed: true })],
  ['icon-512.png', render(STAND, 512, { bleed: true })],
  ['favicon-32.png', render(AWNING_CUP, 32)],
  ['favicon-16.png', render(AWNING_CUP, 16)]
];

for (const [name, data] of built) {
  writeFileSync(join(outDir, name), data);
  console.log(`icons/${name}  ${data.length} bytes`);
}
