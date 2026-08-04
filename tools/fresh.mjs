/* Freshness probe (Phase 5). Asserts the date-seeded catalog logic over two
   years of days and every unlock state: deals never leave the aisle's tier,
   rares only surface in open aisles at top-of-range prices, and both are
   deterministic. Run alongside tools/sim.mjs after touching data/items.js.

     node tools/fresh.mjs
*/

import { AISLES } from '../js/engine.js';
import {
  ITEMS, BY_ID, RARES, itemsForAisle, shelfPrice, rareStock, dailyDeal
} from '../js/data/items.js';

const GEN = Object.fromEntries(AISLES.map(a => [a.id, a.gen]));
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
}

/* Catalog shape: rares exist, never in everyday shelf stock, wallpapers are
   home goods, every vox entry is well-formed. */
assert(RARES.length >= 1, 'at least one rare (the golden mango)');
assert(RARES.some(r => r.id === 'goldmango' && r.aisle === 'produce'),
  'golden mango is the produce rare');
for (const a of AISLES) {
  for (const it of itemsForAisle(a.id)) {
    assert(!it.rare, `rare ${it.id} leaked into everyday stock`);
  }
}
for (const it of ITEMS) {
  if (it.wallpaper) {
    assert(it.aisle === 'home', `wallpaper ${it.id} outside home aisle`);
    assert(it.wallpaper.length === 2, `wallpaper ${it.id} needs two colors`);
  }
  for (const e of it.vox) {
    assert(e.length >= 7 && e.slice(0, 6).every(v => typeof v === 'number'),
      `bad vox entry on ${it.id}`);
  }
}

const UNLOCK_STATES = [
  ['produce'],
  ['produce', 'bakery'],
  ['produce', 'bakery', 'toys'],
  ['produce', 'bakery', 'toys', 'electronics'],
  ['produce', 'bakery', 'toys', 'electronics', 'home']
];

for (const unlocked of UNLOCK_STATES) {
  let stockDays = 0, dealDays = 0;
  const DAYS = 730;
  for (let day = 0; day < DAYS; day++) {
    /* Shelf prices stay in the aisle's generator range. */
    for (const it of ITEMS) {
      const p = shelfPrice(it.id, day);
      const [lo, hi] = GEN[it.aisle];
      assert(p >= lo && p <= hi, `shelfPrice ${it.id} day ${day} = ${p} outside ${lo}..${hi}`);
    }

    const rare = rareStock(day, unlocked);
    const rare2 = rareStock(day, unlocked);
    assert(JSON.stringify(rare) === JSON.stringify(rare2), 'rareStock not deterministic');
    if (rare) {
      stockDays++;
      const item = BY_ID[rare.itemId];
      assert(item && item.rare, `stocked non-rare ${rare.itemId}`);
      assert(unlocked.includes(item.aisle), `rare ${rare.itemId} in locked aisle`);
      const [, hi] = GEN[item.aisle];
      assert(rare.price >= hi - 2 && rare.price <= hi,
        `rare price ${rare.price} not top-of-range for ${item.aisle}`);
    }

    const deal = dailyDeal(day, unlocked);
    const deal2 = dailyDeal(day, unlocked);
    assert(JSON.stringify(deal) === JSON.stringify(deal2), 'dailyDeal not deterministic');
    if (deal) {
      dealDays++;
      const item = BY_ID[deal.itemId];
      assert(item && !item.rare, `deal picked rare ${deal.itemId}`);
      assert(unlocked.includes(item.aisle), `deal ${deal.itemId} in locked aisle`);
      assert(deal.off >= 1 && deal.sale === deal.base - deal.off,
        `deal arithmetic broken on day ${day}`);
      assert(deal.base === shelfPrice(deal.itemId, day), 'deal base is not the shelf price');
      assert(deal.sale >= GEN[item.aisle][0],
        `deal sale $${deal.sale} below ${item.aisle} floor on day ${day}`);
    }
  }
  const stockRate = stockDays / DAYS, dealRate = dealDays / DAYS;
  assert(stockRate > 0.2 && stockRate < 0.5,
    `rare stock rate ${stockRate.toFixed(2)} outside 0.2..0.5 for ${unlocked.length} aisles`);
  assert(dealRate > 0.95, `deal missing too often (${dealRate.toFixed(2)})`);
  console.log(`  unlocked ${unlocked.length}/5 aisles: rare in stock ` +
    `${(stockRate * 100).toFixed(0)}% of days, deal ${(dealRate * 100).toFixed(0)}%`);
}

/* Produce-only week one: the flagship golden mango must be the rare. */
for (let day = 0; day < 730; day++) {
  const rare = rareStock(day, ['produce']);
  if (rare) assert(rare.itemId === 'goldmango', 'produce-only rare must be the golden mango');
}

console.log(`ALL FRESHNESS CHECKS PASS (${checks} assertions)`);
