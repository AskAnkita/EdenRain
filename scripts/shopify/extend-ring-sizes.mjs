// Gives the sized rings US 3 to 11 in half sizes (17 sizes) while keeping every live price.
//
// Sizes 5-9 keep the exact price each one had in the backup taken by remove-ring-size-variants.mjs
// on 2026-11-19. The new sizes are priced off the base those old prices were made from:
//   3, 3.5, 4, 4.5   the base, same as size 5 (nothing is cheaper than the base)
//   9.5 ... 11       the store's standing ladder, +1.25% per half size over the base, rounded
//                    down to a whole $10 (9.5 = +11.25%, 10 = +12.5%, 10.5 = +13.75%, 11 = +15%)
// SKUs follow the house pattern (AJLR274-G14K-Y-10.5), and every variant gets its metal's image.
//
// It does not use import.js --sync-ring-sizes on purpose: that reads price-list.csv, which is the
// cost sheet, and would have put these rings live at roughly half price.
//
// Shopify took 170 variants on one product here on 2026-11-19, so the old 100-variant cap is gone.
//
//   node scripts/shopify/extend-ring-sizes.mjs --backup=<file>            # dry run
//   node scripts/shopify/extend-ring-sizes.mjs --backup=<file> --apply [--handles=a,b]

import { readFileSync } from 'node:fs';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const BACKUP = arg('backup');
const ONLY = arg('handles') ? arg('handles').split(',') : null;
if (!BACKUP) { console.error('Pass --backup=<ring-size-variants-*.json>'); process.exit(1); }

const SIZES = ['3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'];
const METAL = 'Jewelry material';
const SIZE = 'Size';
const pct = (s) => (Number(s) <= 5 ? 0 : (Number(s) - 5) * 2 * 1.25);
const ladder = (base, s) => Math.floor((base * (1 + pct(s) / 100)) / 10) * 10;

const cfg = config();
const backup = JSON.parse(readFileSync(BACKUP, 'utf8')).filter((p) => !ONLY || ONLY.includes(p.handle));
const pick = (v, n) => (v.selectedOptions.find((o) => o.name === n) || {}).value;

const read = async (id) => (await gql(cfg, `query($id: ID!) { product(id: $id) {
  options { id name optionValues { name } }
  variants(first: 250) { nodes { id sku price selectedOptions { name value } media(first: 1) { nodes { id } } } } } }`, { id })).product;

let problems = 0;
for (const old of backup) {
  // What each metal sold at, by size, before anything changed.
  const was = new Map();
  for (const v of old.variants.nodes) {
    const m = pick(v, METAL);
    if (!was.has(m)) was.set(m, { prices: {}, sku: null });
    was.get(m).prices[pick(v, SIZE)] = Number(v.price);
    if (pick(v, SIZE) === '5') was.get(m).sku = v.sku.replace(/-5$/, '');
  }
  // The old 5-9 prices were rounded down from the client's unrounded base, so the base is worked
  // back out of all nine of them: each one says base x (1 + pct) is in [price, price + 10).
  // The new sizes are priced off that base, and every old price must come back out of it.
  for (const [m, w] of was) {
    let lo = 0, hi = Infinity;
    for (const [s, price] of Object.entries(w.prices)) {
      const k = 1 + pct(s) / 100;
      lo = Math.max(lo, price / k);
      hi = Math.min(hi, (price + 10) / k);
    }
    w.base = (lo + hi) / 2;
    const off = Object.entries(w.prices).filter(([s, price]) => ladder(w.base, s) !== price);
    if (lo >= hi || off.length) {
      problems++;
      console.log(`  ⚠ ${old.handle} ${m}: no single base fits the old prices (${off.map(([s]) => s).join(', ')}); new sizes use size 5 = $${w.prices['5']}`);
      w.base = w.prices['5'];
    }
  }

  let p = await read(old.id);
  const hasSize = p.options.some((o) => o.name === SIZE);
  console.log(`${APPLY ? '✓' : '·'} ${old.handle}  ${hasSize ? 'reprice' : 'add Size'} → ${was.size * SIZES.length} variants`);
  if (!APPLY) continue;

  if (!hasSize) {
    await gql(cfg, `mutation($p: ID!, $o: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $p, options: $o, variantStrategy: CREATE) { userErrors { field message } } }`,
      { p: old.id, o: [{ name: SIZE, values: SIZES.map((name) => ({ name })) }] }, 'productOptionsCreate');
    p = await read(old.id);
  }

  const mediaOf = new Map();
  for (const v of p.variants.nodes) {
    const id = v.media.nodes[0]?.id;
    if (id && !mediaOf.has(pick(v, METAL))) mediaOf.set(pick(v, METAL), id);
  }
  const updates = [];
  for (const v of p.variants.nodes) {
    const m = pick(v, METAL), s = pick(v, SIZE), w = was.get(m);
    if (!w || !SIZES.includes(s)) { problems++; console.log(`  ⚠ unrecognised variant ${m} / ${s}`); continue; }
    const price = (w.prices[s] ?? ladder(w.base, s)).toFixed(2);
    const u = { id: v.id, price, inventoryItem: { sku: `${w.sku}-${s}` } };
    if (!v.media.nodes.length && mediaOf.get(m)) u.mediaId = mediaOf.get(m);
    updates.push(u);
  }
  await gql(cfg, `mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { field message } } }`,
    { p: old.id, v: updates }, 'productVariantsBulkUpdate');
}

console.log(`\n${problems} warning(s). ${APPLY ? 'Done.' : 'Dry run. Add --apply to change the store.'}`);
