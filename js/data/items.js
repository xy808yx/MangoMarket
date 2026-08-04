/* Mango Market catalog. Headless data: no DOM, no three.js imports.
   Each item carries a voxel spec the world renderer turns into a 3D model
   and a shelf thumbnail. Spec entries: [w, h, d, x, y, z, color] with an
   optional trailing [rx, ry, rz] rotation array.

   Content rules: mango is the hero. Featured foods (hot pot, dim sum,
   ice cream, pizza) plus toy anchors (ballet, bicycle) sort first.
   Secondary items (dumplings, mango sticky rice, grapes, oranges,
   cookies) are background shelf stock only. Motifs: fireflies, salmon
   fry. Coastal-city food vibe. Nothing religious or occult. */

import { AISLES } from '../engine.js';

const INK = 0x2B2118, CREAM = 0xFFF6EA, WOODY = 0xB0713B, TAN = 0xD9A066;
const MANGO = 0xFFAD1F, LEAF = 0x3E8E4E, RED = 0xF04E3E, PINK = 0xF6B8C4;

export const ITEMS = [
  /* ---- produce ($2-9, single digit) ---- */
  { id: 'mango', aisle: 'produce', name: 'Mango', featured: true, hero: true, vox: [
    [1.0, 0.8, 0.8, 0, 0.4, 0, MANGO],
    [0.6, 0.55, 0.82, 0.22, 0.5, 0, 0xF58A2E],
    [0.1, 0.16, 0.1, -0.3, 0.82, 0, 0x8E5A2E],
    [0.34, 0.1, 0.2, -0.42, 0.9, 0, LEAF, [0, 0, -0.4]]
  ] },
  { id: 'strawberry', aisle: 'produce', name: 'Strawberry', vox: [
    [0.85, 0.7, 0.85, 0, 0.35, 0, 0xE8384F],
    [0.6, 0.25, 0.6, 0, 0.72, 0, LEAF],
    [0.1, 0.2, 0.1, 0, 0.88, 0, 0x2E7A40]
  ] },
  { id: 'banana', aisle: 'produce', name: 'Bananas', vox: [
    [0.4, 0.5, 0.35, -0.4, 0.35, 0, 0xFFD34D, [0, 0, 0.35]],
    [0.55, 0.4, 0.35, 0, 0.22, 0, 0xFFD34D],
    [0.4, 0.5, 0.35, 0.4, 0.35, 0, 0xFFD34D, [0, 0, -0.35]],
    [0.12, 0.14, 0.12, -0.58, 0.62, 0, 0x8E5A2E]
  ] },
  { id: 'watermelon', aisle: 'produce', name: 'Watermelon', vox: [
    [1.2, 0.5, 0.7, 0, 0.25, 0, 0x3E8E4E],
    [1.08, 0.16, 0.6, 0, 0.55, 0, 0xEFE6D2],
    [1.0, 0.3, 0.52, 0, 0.75, 0, 0xE8384F]
  ] },
  { id: 'corn', aisle: 'produce', name: 'Corn', vox: [
    [0.42, 1.0, 0.42, 0, 0.55, 0, 0xFFD34D],
    [0.2, 0.5, 0.34, -0.3, 0.28, 0, LEAF, [0, 0, 0.3]],
    [0.2, 0.5, 0.34, 0.3, 0.28, 0, LEAF, [0, 0, -0.3]]
  ] },
  { id: 'broccoli', aisle: 'produce', name: 'Broccoli', vox: [
    [0.3, 0.5, 0.3, 0, 0.25, 0, 0xC9E4A6],
    [0.85, 0.5, 0.85, 0, 0.65, 0, 0x2E7A40],
    [0.5, 0.3, 0.5, 0, 0.92, 0, 0x2E7A40]
  ] },
  { id: 'blueberries', aisle: 'produce', name: 'Blueberries', vox: [
    [0.95, 0.35, 0.7, 0, 0.18, 0, TAN],
    [0.28, 0.26, 0.28, -0.22, 0.45, -0.1, 0x4A6FD4],
    [0.28, 0.26, 0.28, 0.14, 0.45, 0.12, 0x4A6FD4],
    [0.28, 0.26, 0.28, 0.28, 0.45, -0.14, 0x5A82E8],
    [0.28, 0.26, 0.28, -0.05, 0.5, 0.05, 0x3E5FC0]
  ] },
  { id: 'salmon', aisle: 'produce', name: 'Salmon', vox: [
    [1.2, 0.42, 0.3, 0, 0.3, 0, 0xF08A6E],
    [0.32, 0.55, 0.16, 0.72, 0.3, 0, 0xE8705A],
    [0.3, 0.3, 0.32, -0.5, 0.32, 0, 0xD9604E],
    [0.08, 0.1, 0.08, -0.62, 0.42, 0.14, INK]
  ] },
  { id: 'grapes', aisle: 'produce', name: 'Grapes', bg: true, vox: [
    [0.7, 0.5, 0.6, 0, 0.3, 0, 0x8E5FBF],
    [0.5, 0.4, 0.5, 0, 0.62, 0, 0x7A4FAF],
    [0.28, 0.28, 0.28, 0, 0.15, 0.3, 0x8E5FBF],
    [0.1, 0.25, 0.1, 0, 0.88, 0, 0x6E4E32]
  ] },
  { id: 'orange', aisle: 'produce', name: 'Orange', bg: true, vox: [
    [0.8, 0.72, 0.8, 0, 0.36, 0, 0xF08A1E],
    [0.26, 0.1, 0.16, 0.05, 0.78, 0, LEAF]
  ] },

  /* ---- bakery and dim sum ($10-18, teens) ---- */
  { id: 'dimsum', aisle: 'bakery', name: 'Dim Sum', featured: true, vox: [
    [1.15, 0.32, 1.15, 0, 0.16, 0, TAN],
    [1.0, 0.1, 1.0, 0, 0.36, 0, 0xC98E58],
    [0.36, 0.3, 0.36, -0.26, 0.55, -0.2, CREAM],
    [0.36, 0.3, 0.36, 0.28, 0.55, -0.14, CREAM],
    [0.36, 0.3, 0.36, 0, 0.55, 0.26, CREAM],
    [0.1, 0.08, 0.1, 0, 0.72, 0.26, PINK]
  ] },
  { id: 'pizza', aisle: 'bakery', name: 'Pizza', featured: true, vox: [
    [1.25, 0.12, 1.25, 0, 0.1, 0, 0xE8C97A],
    [1.05, 0.08, 1.05, 0, 0.2, 0, 0xE05038],
    [0.9, 0.06, 0.9, 0, 0.26, 0, 0xFFD98A],
    [0.24, 0.06, 0.24, -0.24, 0.31, -0.2, RED],
    [0.24, 0.06, 0.24, 0.26, 0.31, 0.1, RED],
    [0.24, 0.06, 0.24, -0.05, 0.31, 0.28, RED]
  ] },
  { id: 'icecream', aisle: 'bakery', name: 'Ice Cream', featured: true, vox: [
    [0.4, 0.65, 0.4, 0, 0.33, 0, TAN, [0, 0.6, 0]],
    [0.62, 0.5, 0.62, 0, 0.85, 0, CREAM],
    [0.5, 0.42, 0.5, 0, 1.25, 0, PINK],
    [0.16, 0.14, 0.16, 0, 1.52, 0, RED]
  ] },
  { id: 'hotpot', aisle: 'bakery', name: 'Hot Pot', featured: true, vox: [
    [1.05, 0.55, 1.05, 0, 0.3, 0, RED],
    [1.15, 0.12, 1.15, 0, 0.62, 0, 0x8C3A2E],
    [0.2, 0.14, 0.4, -0.66, 0.5, 0, 0x8C3A2E],
    [0.2, 0.14, 0.4, 0.66, 0.5, 0, 0x8C3A2E],
    [0.2, 0.2, 0.2, -0.2, 0.82, 0.1, 0xF2EFE6],
    [0.16, 0.16, 0.16, 0.22, 0.9, -0.1, 0xF2EFE6]
  ] },
  { id: 'cake', aisle: 'bakery', name: 'Cake', vox: [
    [1.05, 0.4, 1.05, 0, 0.2, 0, PINK],
    [0.72, 0.34, 0.72, 0, 0.57, 0, CREAM],
    [0.16, 0.14, 0.16, 0, 0.8, 0, RED]
  ] },
  { id: 'croissant', aisle: 'bakery', name: 'Croissant', vox: [
    [0.4, 0.35, 0.42, -0.42, 0.2, 0, 0xE0A050, [0, 0.5, 0]],
    [0.55, 0.42, 0.5, 0, 0.24, 0, 0xE8B060],
    [0.4, 0.35, 0.42, 0.42, 0.2, 0, 0xE0A050, [0, -0.5, 0]]
  ] },
  { id: 'eggtart', aisle: 'bakery', name: 'Egg Tarts', vox: [
    [0.5, 0.22, 0.5, -0.3, 0.11, 0.1, 0xE8C97A],
    [0.36, 0.1, 0.36, -0.3, 0.28, 0.1, 0xFFD34D],
    [0.5, 0.22, 0.5, 0.32, 0.11, -0.15, 0xE8C97A],
    [0.36, 0.1, 0.36, 0.32, 0.28, -0.15, 0xFFD34D]
  ] },
  { id: 'stickyrice', aisle: 'bakery', name: 'Mango Sticky Rice', bg: true, vox: [
    [1.05, 0.1, 0.8, 0, 0.05, 0, 0x6EA8C9],
    [0.5, 0.3, 0.5, -0.24, 0.25, 0, 0xFFFDF4],
    [0.4, 0.22, 0.55, 0.3, 0.21, 0, MANGO]
  ] },
  { id: 'dumplings', aisle: 'bakery', name: 'Dumplings', bg: true, vox: [
    [1.0, 0.1, 0.75, 0, 0.05, 0, 0x6EA8C9],
    [0.4, 0.3, 0.32, -0.26, 0.25, 0, 0xFFF9EC],
    [0.4, 0.3, 0.32, 0.14, 0.25, 0.14, 0xFFF9EC],
    [0.4, 0.3, 0.32, 0.3, 0.25, -0.2, 0xFFF9EC]
  ] },
  { id: 'cookies', aisle: 'bakery', name: 'Cookies', bg: true, vox: [
    [0.7, 0.14, 0.7, 0, 0.07, 0, 0xC98E58],
    [0.7, 0.14, 0.7, 0.08, 0.21, 0.05, 0xB87B48],
    [0.7, 0.14, 0.7, -0.04, 0.35, -0.04, 0xC98E58]
  ] },

  /* ---- toys ($20-98, two digit) ---- */
  { id: 'ballet', aisle: 'toys', name: 'Ballet Shoes', featured: true, vox: [
    [0.5, 0.26, 0.95, -0.32, 0.13, 0, PINK],
    [0.5, 0.26, 0.95, 0.32, 0.13, 0, PINK],
    [0.42, 0.1, 0.3, -0.32, 0.31, 0.18, 0xE89AAC],
    [0.42, 0.1, 0.3, 0.32, 0.31, 0.18, 0xE89AAC],
    [0.08, 0.3, 0.08, -0.32, 0.4, -0.28, 0xE89AAC, [0.4, 0, 0]],
    [0.08, 0.3, 0.08, 0.32, 0.4, -0.28, 0xE89AAC, [0.4, 0, 0]]
  ] },
  { id: 'bicycle', aisle: 'toys', name: 'Bicycle', featured: true, vox: [
    [0.16, 0.75, 0.75, -0.5, 0.38, 0, INK],
    [0.16, 0.75, 0.75, 0.5, 0.38, 0, INK],
    [0.9, 0.14, 0.14, 0, 0.62, 0, RED],
    [0.14, 0.5, 0.14, 0.5, 0.85, 0, RED, [0, 0, -0.2]],
    [0.14, 0.4, 0.14, -0.5, 0.85, 0, RED],
    [0.5, 0.1, 0.14, -0.5, 1.08, 0, INK, [0, 1.57, 0]],
    [0.3, 0.1, 0.16, 0.5, 1.08, 0, 0x8C3A2E]
  ] },
  { id: 'kite', aisle: 'toys', name: 'Kite', vox: [
    [0.9, 0.9, 0.1, 0, 0.75, 0, 0x6EC9E8, [0, 0, 0.785]],
    [0.2, 0.2, 0.12, 0, 0.75, 0, 0xFFD34D, [0, 0, 0.785]],
    [0.06, 0.5, 0.06, 0, 0.12, 0, RED, [0, 0, 0.5]]
  ] },
  { id: 'plushduck', aisle: 'toys', name: 'Plush Duck', vox: [
    [0.75, 0.6, 0.85, 0, 0.35, 0, 0xFFFDF4],
    [0.55, 0.5, 0.5, 0, 0.95, 0.15, 0xFFFDF4],
    [0.3, 0.12, 0.26, 0, 0.88, 0.45, 0xF08A1E],
    [0.08, 0.1, 0.08, -0.15, 1.05, 0.38, INK],
    [0.08, 0.1, 0.08, 0.15, 1.05, 0.38, INK]
  ] },
  { id: 'blocks', aisle: 'toys', name: 'Building Blocks', vox: [
    [0.45, 0.45, 0.45, -0.3, 0.22, 0, RED],
    [0.45, 0.45, 0.45, 0.3, 0.22, 0.05, 0x4A6FD4],
    [0.45, 0.45, 0.45, 0, 0.67, 0, 0xFFD34D],
    [0.45, 0.45, 0.45, 0.05, 1.12, 0, LEAF]
  ] },
  { id: 'jumprope', aisle: 'toys', name: 'Jump Rope', vox: [
    [0.8, 0.3, 0.8, 0, 0.15, 0, 0xE8B060],
    [0.6, 0.3, 0.6, 0, 0.42, 0, 0xE8B060],
    [0.14, 0.4, 0.14, -0.4, 0.6, 0.1, RED, [0, 0, 0.5]],
    [0.14, 0.4, 0.14, 0.42, 0.55, -0.08, RED, [0, 0, -0.4]]
  ] },
  { id: 'scooter', aisle: 'toys', name: 'Scooter', vox: [
    [1.05, 0.1, 0.32, 0, 0.25, 0, 0x6EC9E8],
    [0.22, 0.2, 0.22, -0.45, 0.1, 0, INK],
    [0.22, 0.2, 0.22, 0.45, 0.1, 0, INK],
    [0.1, 1.0, 0.1, 0.5, 0.75, 0, 0x4A9FD4, [0, 0, -0.15]],
    [0.55, 0.1, 0.12, 0.58, 1.25, 0, INK, [0, 1.57, 0]]
  ] },
  { id: 'artset', aisle: 'toys', name: 'Art Set', vox: [
    [1.1, 0.12, 0.8, 0, 0.06, 0, TAN],
    [0.2, 0.1, 0.2, -0.3, 0.16, -0.15, RED],
    [0.2, 0.1, 0.2, 0, 0.16, -0.15, 0xFFD34D],
    [0.2, 0.1, 0.2, 0.3, 0.16, -0.15, 0x4A6FD4],
    [0.2, 0.1, 0.2, -0.15, 0.16, 0.18, LEAF],
    [0.08, 0.45, 0.08, 0.3, 0.28, 0.18, 0x8E5A2E, [0.3, 0, 0.4]]
  ] },

  /* ---- electronics ($100-940, three digit) ---- */
  { id: 'camera', aisle: 'electronics', name: 'Camera', vox: [
    [1.05, 0.62, 0.5, 0, 0.31, 0, 0x3E4650],
    [0.42, 0.42, 0.2, 0.05, 0.31, 0.34, 0x6E7885],
    [0.3, 0.3, 0.1, 0.05, 0.31, 0.48, 0x2B3138],
    [0.2, 0.1, 0.2, -0.35, 0.66, 0, RED]
  ] },
  { id: 'headphones', aisle: 'electronics', name: 'Headphones', vox: [
    [0.14, 0.5, 0.3, -0.5, 0.45, 0, RED],
    [0.9, 0.14, 0.3, 0, 0.85, 0, RED],
    [0.14, 0.5, 0.3, 0.5, 0.45, 0, RED],
    [0.34, 0.4, 0.36, -0.5, 0.3, 0, 0x8C3A2E],
    [0.34, 0.4, 0.36, 0.5, 0.3, 0, 0x8C3A2E]
  ] },
  { id: 'robot', aisle: 'electronics', name: 'Robot Pet', vox: [
    [0.75, 0.6, 0.6, 0, 0.45, 0, 0x9FB6C9],
    [0.55, 0.45, 0.5, 0, 1.05, 0.05, 0xB8CBD9],
    [0.12, 0.12, 0.1, -0.14, 1.1, 0.3, 0x2EC9A0],
    [0.12, 0.12, 0.1, 0.14, 1.1, 0.3, 0x2EC9A0],
    [0.06, 0.3, 0.06, 0, 1.4, 0, 0x6E7885],
    [0.1, 0.1, 0.1, 0, 1.55, 0, RED],
    [0.2, 0.16, 0.5, -0.24, 0.08, 0, 0x6E7885],
    [0.2, 0.16, 0.5, 0.24, 0.08, 0, 0x6E7885]
  ] },
  { id: 'keyboard', aisle: 'electronics', name: 'Piano', vox: [
    [1.45, 0.22, 0.55, 0, 0.11, 0, 0x3E4650],
    [1.3, 0.1, 0.34, 0, 0.24, 0.06, 0xFFFDF4],
    [0.1, 0.12, 0.2, -0.45, 0.28, -0.02, INK],
    [0.1, 0.12, 0.2, -0.2, 0.28, -0.02, INK],
    [0.1, 0.12, 0.2, 0.12, 0.28, -0.02, INK],
    [0.1, 0.12, 0.2, 0.38, 0.28, -0.02, INK]
  ] },
  { id: 'telescope', aisle: 'electronics', name: 'Telescope', vox: [
    [0.32, 1.15, 0.32, 0, 0.85, 0, 0x4A6FD4, [0.6, 0, 0]],
    [0.4, 0.3, 0.4, 0, 1.25, -0.28, 0x3E5FC0, [0.6, 0, 0]],
    [0.08, 0.75, 0.08, -0.25, 0.35, 0.1, INK, [0.2, 0, 0.35]],
    [0.08, 0.75, 0.08, 0.25, 0.35, 0.1, INK, [0.2, 0, -0.35]],
    [0.08, 0.75, 0.08, 0, 0.35, -0.22, INK, [-0.35, 0, 0]]
  ] },
  { id: 'walkie', aisle: 'electronics', name: 'Walkie Talkies', vox: [
    [0.4, 0.75, 0.24, -0.32, 0.38, 0, 0xF2C230],
    [0.4, 0.75, 0.24, 0.32, 0.38, 0, 0x2EC9A0],
    [0.07, 0.4, 0.07, -0.44, 0.95, 0, INK],
    [0.07, 0.4, 0.07, 0.2, 0.95, 0, INK],
    [0.26, 0.2, 0.26, -0.32, 0.5, 0.13, 0x3E4650, [0, 0, 0]],
    [0.26, 0.2, 0.26, 0.32, 0.5, 0.13, 0x3E4650]
  ] },

  /* ---- home goods ($15-350, decor for the room) ---- */
  { id: 'lamp', aisle: 'home', name: 'Mango Lamp', vox: [
    [0.55, 0.14, 0.55, 0, 0.07, 0, WOODY],
    [0.1, 0.85, 0.1, 0, 0.55, 0, WOODY],
    [0.7, 0.5, 0.7, 0, 1.2, 0, MANGO],
    [0.5, 0.12, 0.5, 0, 1.5, 0, 0xF58A2E]
  ] },
  { id: 'rug', aisle: 'home', name: 'Cozy Rug', vox: [
    [1.45, 0.08, 0.95, 0, 0.04, 0, RED],
    [1.15, 0.06, 0.68, 0, 0.1, 0, 0xF6B8C4],
    [0.5, 0.05, 0.3, 0, 0.15, 0, CREAM]
  ] },
  { id: 'plant', aisle: 'home', name: 'Leafy Plant', vox: [
    [0.55, 0.45, 0.55, 0, 0.22, 0, 0xC96F3E],
    [0.7, 0.55, 0.7, 0, 0.75, 0, 0x2E7A40],
    [0.45, 0.4, 0.45, -0.3, 1.05, 0.1, LEAF],
    [0.4, 0.45, 0.4, 0.25, 1.1, -0.1, LEAF]
  ] },
  { id: 'chair', aisle: 'home', name: 'Little Chair', vox: [
    [0.8, 0.14, 0.8, 0, 0.5, 0, 0x6EC9E8],
    [0.8, 0.75, 0.14, 0, 0.95, -0.33, 0x6EC9E8],
    [0.12, 0.5, 0.12, -0.3, 0.25, -0.3, WOODY],
    [0.12, 0.5, 0.12, 0.3, 0.25, -0.3, WOODY],
    [0.12, 0.5, 0.12, -0.3, 0.25, 0.3, WOODY],
    [0.12, 0.5, 0.12, 0.3, 0.25, 0.3, WOODY]
  ] },
  { id: 'bookshelf', aisle: 'home', name: 'Bookshelf', vox: [
    [1.1, 1.4, 0.4, 0, 0.7, 0, WOODY],
    [0.95, 0.5, 0.3, 0, 0.42, 0.08, 0x8E5A2E],
    [0.95, 0.5, 0.3, 0, 1.02, 0.08, 0x8E5A2E],
    [0.2, 0.42, 0.24, -0.3, 1.05, 0.12, RED],
    [0.2, 0.42, 0.24, -0.05, 1.05, 0.12, 0x4A6FD4],
    [0.2, 0.42, 0.24, 0.2, 1.05, 0.12, 0xFFD34D],
    [0.2, 0.42, 0.24, -0.18, 0.45, 0.12, LEAF],
    [0.2, 0.42, 0.24, 0.1, 0.45, 0.12, 0xF2A03D]
  ] },
  { id: 'aquarium', aisle: 'home', name: 'Salmon Fry Tank', vox: [
    [1.15, 0.75, 0.6, 0, 0.4, 0, 0x9FD4E8],
    [1.2, 0.1, 0.65, 0, 0.05, 0, INK],
    [1.2, 0.08, 0.65, 0, 0.8, 0, INK],
    [0.24, 0.12, 0.1, -0.25, 0.5, 0.1, 0xF08A6E],
    [0.24, 0.12, 0.1, 0.2, 0.35, -0.05, 0xF08A6E],
    [0.24, 0.12, 0.1, 0.32, 0.58, 0.05, 0xE8705A],
    [0.3, 0.2, 0.2, -0.35, 0.14, 0, LEAF]
  ] },
  { id: 'fireflyjar', aisle: 'home', name: 'Firefly Jar', vox: [
    [0.62, 0.8, 0.62, 0, 0.42, 0, 0xD8EAF0],
    [0.5, 0.14, 0.5, 0, 0.88, 0, TAN],
    [0.12, 0.12, 0.12, -0.14, 0.55, 0.1, 0xFFE96E],
    [0.12, 0.12, 0.12, 0.15, 0.3, -0.08, 0xFFE96E],
    [0.12, 0.12, 0.12, 0.05, 0.68, -0.12, 0xFFF3A0]
  ] },
  { id: 'poster', aisle: 'home', name: 'Mango Poster', wall: true, vox: [
    [1.0, 1.3, 0.08, 0, 0.7, 0, CREAM],
    [0.5, 0.42, 0.1, 0, 0.75, 0.02, MANGO],
    [0.2, 0.08, 0.11, -0.18, 1.0, 0.02, LEAF]
  ] },

  /* ---- wallpapers (home aisle; buying one dresses the room walls) ---- */
  { id: 'wp_sunny', aisle: 'home', name: 'Sunny Stripes', wallpaper: [0xFFF6EA, 0xFFD34D], vox: [
    [0.5, 1.1, 0.5, -0.3, 0.55, 0, 0xFFD34D],
    [0.56, 0.08, 0.56, -0.3, 1.14, 0, CREAM],
    [0.75, 0.9, 0.08, 0.32, 0.45, 0, CREAM],
    [0.18, 0.9, 0.1, 0.18, 0.45, 0.02, 0xFFD34D],
    [0.18, 0.9, 0.1, 0.46, 0.45, 0.02, 0xFFD34D]
  ] },
  { id: 'wp_petal', aisle: 'home', name: 'Petal Pink', wallpaper: [0xFDEDF0, 0xF6B8C4], vox: [
    [0.5, 1.1, 0.5, -0.3, 0.55, 0, PINK],
    [0.56, 0.08, 0.56, -0.3, 1.14, 0, CREAM],
    [0.75, 0.9, 0.08, 0.32, 0.45, 0, 0xFDEDF0],
    [0.2, 0.2, 0.1, 0.32, 0.7, 0.02, PINK],
    [0.16, 0.16, 0.1, 0.14, 0.3, 0.02, PINK],
    [0.16, 0.16, 0.1, 0.5, 0.25, 0.02, PINK]
  ] },

  /* ---- rares (SPEC Freshness): golden variants of approved anchors.
     Date-seeded stock via rareStock(); never on trips, shelves show them
     only on their stock day, the catalog keeps them as ??? until found. ---- */
  { id: 'goldmango', aisle: 'produce', name: 'Golden Mango', rare: true, vox: [
    [1.0, 0.8, 0.8, 0, 0.4, 0, 0xF2C230],
    [0.6, 0.55, 0.82, 0.22, 0.5, 0, 0xFFE07A],
    [0.1, 0.16, 0.1, -0.3, 0.82, 0, 0x8E5A2E],
    [0.34, 0.1, 0.2, -0.42, 0.9, 0, LEAF, [0, 0, -0.4]],
    [0.1, 0.1, 0.1, 0.42, 0.85, 0.2, 0xFFF3A0],
    [0.08, 0.08, 0.08, -0.15, 0.15, 0.42, 0xFFF3A0]
  ] },
  { id: 'goldballet', aisle: 'toys', name: 'Golden Ballet Shoes', rare: true, vox: [
    [0.5, 0.26, 0.95, -0.32, 0.13, 0, 0xF2C230],
    [0.5, 0.26, 0.95, 0.32, 0.13, 0, 0xF2C230],
    [0.42, 0.1, 0.3, -0.32, 0.31, 0.18, 0xFFE07A],
    [0.42, 0.1, 0.3, 0.32, 0.31, 0.18, 0xFFE07A],
    [0.08, 0.3, 0.08, -0.32, 0.4, -0.28, 0xFFE07A, [0.4, 0, 0]],
    [0.08, 0.3, 0.08, 0.32, 0.4, -0.28, 0xFFE07A, [0.4, 0, 0]]
  ] },
  { id: 'goldjar', aisle: 'home', name: 'Golden Firefly Jar', rare: true, vox: [
    [0.62, 0.8, 0.62, 0, 0.42, 0, 0xF7E9C4],
    [0.5, 0.14, 0.5, 0, 0.88, 0, 0xF2C230],
    [0.12, 0.12, 0.12, -0.14, 0.55, 0.1, 0xFFE07A],
    [0.12, 0.12, 0.12, 0.15, 0.3, -0.08, 0xFFE07A],
    [0.12, 0.12, 0.12, 0.05, 0.68, -0.12, 0xFFF3A0],
    [0.1, 0.1, 0.1, 0.2, 0.62, 0.14, 0xFFF3A0]
  ] }
];

export const BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export const RARES = ITEMS.filter(i => i.rare);

/* Everyday shelf stock. Rares never appear here: the shelf slots one in by
   hand on its stock day, and trips/deals must never bind one. */
export function itemsForAisle(aisle) {
  const list = ITEMS.filter(i => i.aisle === aisle && !i.rare);
  /* Hero first, then featured, then regular, background stock last. */
  const rank = i => (i.hero ? 0 : i.featured ? 1 : i.bg ? 3 : 2);
  return list.sort((a, b) => rank(a) - rank(b));
}

const GEN = Object.fromEntries(AISLES.map(a => [a.id, a.gen]));

/* Small string hash + mulberry32 step, for stable daily shelf prices. */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed) {
  let t = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* Date-seeded price inside the aisle's generator range, so the whole shelf
   is buyable and every purchase stays inside the tier the engine expects.
   Stable for a given item and day; changes overnight (market freshness). */
export function shelfPrice(itemId, day) {
  const item = BY_ID[itemId];
  const [lo, hi] = GEN[item.aisle];
  return lo + Math.floor(rand01(hashSeed(`${itemId}:${day}`)) * (hi - lo + 1));
}

/* ---- Phase 5 freshness. Both are pure functions of (day, unlocked
   aisles): the same day always answers the same, on any device, with no
   deploy-dependent content (SPEC non-goals). ---- */

/* Rares surface roughly one day in three, picked among the rares whose
   aisle is already open (a rare she cannot buy is a wasted stock day).
   Priced at the TOP of the aisle's generator range: special, still
   affordable, and the change math stays in the tier the aisle teaches. */
export function rareStock(day, unlockedAisles) {
  const pool = RARES.filter(r => unlockedAisles.includes(r.aisle));
  if (!pool.length) return null;
  if (rand01(hashSeed(`rare:${day}`)) >= 0.34) return null;
  const item = pool[Math.floor(rand01(hashSeed(`rarepick:${day}`)) * pool.length)];
  const [, hi] = GEN[item.aisle];
  const price = hi - Math.floor(rand01(hashSeed(`rareprice:${day}`)) * 3);
  return { itemId: item.id, price };
}

/* One deal a day: "$3 off mangoes today", she computes the sale price.
   The discount is capped so the sale price never drops below the aisle's
   generator floor: an impulse buy at the sale price still lands in the
   tier the engine expects. Hero and featured items win the pick more
   often (mango is the face of the deal, like the spec example). */
export function dailyDeal(day, unlockedAisles) {
  const tickets = [];
  for (const it of ITEMS) {
    if (it.rare || !unlockedAisles.includes(it.aisle)) continue;
    const w = it.hero ? 4 : it.featured ? 3 : it.bg ? 1 : 2;
    for (let k = 0; k < w; k++) tickets.push(it);
  }
  if (!tickets.length) return null;
  /* A few deterministic attempts, in case a pick's price sits on the
     aisle floor and leaves no room for a discount. */
  for (let k = 0; k < 6; k++) {
    const it = tickets[Math.floor(rand01(hashSeed(`deal:${day}:${k}`)) * tickets.length)];
    const base = shelfPrice(it.id, day);
    const maxOff = base - GEN[it.aisle][0];
    if (maxOff < 1) continue;
    const off = 1 + Math.floor(rand01(hashSeed(`dealoff:${day}`)) * Math.min(5, maxOff));
    return { itemId: it.id, base, off, sale: base - off };
  }
  return null;
}
