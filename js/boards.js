/* Canonical palettes from the Phase 1 style gate (locked Aug 2 2026).
   B "Juicy Pop" is the world look and C "Lantern Dusk" is the
   evening mode. world.js takes one of these as its palette parameter; the
   other three are kept for the record in case more modes come later.
   Data only: no DOM, no three.js. The Phase 1 viewer (boards.html) is gone;
   reference renders are kept from the style-gate session. */

export const BOARDS = {
  a: {
    label: 'A  Morning Market',
    sky: 0xEAF6F0,
    hemi: { sky: 0xEAF6F0, ground: 0xCDE7B5, i: 1.15 },
    sun: { color: 0xFFF3D6, i: 2.6, pos: [6, 9, -4] },
    grassA: 0xBFE8A8, grassB: 0xB2E09B, path: 0xF2E3C4,
    wood: 0xD9A066, awningA: 0xFFF8EF, awningB: 0xF6B8C4,
    mango: 0xFFB728, leaf: 0x5FAE68, trunk: 0xA9764C, foliage: 0x8FD489,
    duck: 0xFFFFFF, bill: 0xF5A03A, cat: 0xC9C4E4,
    lantern: 0xFFE9C0, lanternGlow: 0
  },
  b: {
    label: 'B  Juicy Pop',
    sky: 0x8ED4F2,
    hemi: { sky: 0xBDE8FF, ground: 0x86C963, i: 0.95 },
    sun: { color: 0xFFFFFF, i: 3.0, pos: [7, 11, -3] },
    grassA: 0x7ECC49, grassB: 0x74C43F, path: 0xE8C97A,
    wood: 0xB0713B, awningA: 0xF04E3E, awningB: 0xFFF6EA,
    mango: 0xFFAD1F, leaf: 0x3E8E4E, trunk: 0x8E5A2E, foliage: 0x51B33E,
    duck: 0xFFFFFF, bill: 0xF08A1E, cat: 0xF2A03D,
    lantern: 0xFFE9C0, lanternGlow: 0
  },
  c: {
    label: 'C  Lantern Dusk',
    sky: 0x2E3C63,
    hemi: { sky: 0x44548C, ground: 0x23303F, i: 0.55 },
    sun: { color: 0x9FB6E8, i: 1.3, pos: [-6, 7, -3] },
    grassA: 0x3E6B57, grassB: 0x37604E, path: 0x7A6E63,
    wood: 0x8C6A48, awningA: 0x2F6F6B, awningB: 0xEFE6D2,
    mango: 0xFFB040, leaf: 0x4C8E5A, trunk: 0x6E5540, foliage: 0x3F7A5B,
    duck: 0xF2EFE6, bill: 0xE89A3C, cat: 0x9AA7C9,
    lantern: 0xFFC864, lanternGlow: 6, stallGlow: { color: 0xFFB050, i: 26 }
  },
  d: {
    label: 'D  Paper Cream',
    sky: 0xFBF4E6,
    hemi: { sky: 0xFBF4E6, ground: 0xEFE3C8, i: 1.45 },
    sun: { color: 0xFFFDF6, i: 2.0, pos: [5, 12, -2] },
    grassA: 0xF3E9D2, grassB: 0xEFE3C8, path: 0xEADFC4,
    wood: 0xE4C99A, awningA: 0xFFB728, awningB: 0xFFF9EC,
    mango: 0xF58A2E, leaf: 0x4C9B5F, trunk: 0xD3B588, foliage: 0x6FBE7C,
    duck: 0xFFFDF4, bill: 0xF5A03A, cat: 0xE8DFCC,
    lantern: 0xFFE9C0, lanternGlow: 0
  },
  e: {
    label: 'E  Tropical Sunset',
    sky: 0xFF9E7D,
    hemi: { sky: 0xFFB48A, ground: 0x6E5A7A, i: 0.85 },
    sun: { color: 0xFFB36B, i: 2.9, pos: [-8, 5, 3] },
    grassA: 0x6BAF6E, grassB: 0x61A565, path: 0xE8B97F,
    wood: 0xB07A46, awningA: 0xF2617A, awningB: 0xFFD9A0,
    mango: 0xFFA51F, leaf: 0x3E8E4E, trunk: 0x7E5638, foliage: 0x55974F,
    duck: 0xFFF4E4, bill: 0xF08A1E, cat: 0x8E7FA6,
    lantern: 0xFFDA8A, lanternGlow: 2
  }
};
