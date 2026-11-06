#!/usr/bin/env node
// Writes the retail prices the client supplied (scripts/shopify/client-prices.csv) onto every
// matching variant in the store. The sheet covers rings (the "Eden Raine Ring Price" PDF) and the
// tennis necklaces and bracelets, one row per style code in four metal tiers.
//
//   node scripts/shopify/sync-client-prices.mjs                  preview only, changes nothing
//   node scripts/shopify/sync-client-prices.mjs --apply          write the prices
//   node scripts/shopify/sync-client-prices.mjs --only=AJLR134,AJNT26
//   node scripts/shopify/sync-client-prices.mjs --verbose        every variant, not just a sample
//   node scripts/shopify/sync-client-prices.mjs --skip-archived  leave the folded-in donors alone
//
// How a variant finds its price
//   Variant SKUs are <CODE>-<METAL>-<COLOUR>[-<SIZE>], e.g. AJLR300-G18K-Y-7.5. The CODE is the
//   style code the price sheet is keyed on, so a merged shape product — one product holding eight
//   centre-stone shapes, each shape a different style code — gets a different price per shape from
//   the one SKU column. Nothing here depends on the product, only on the variant's own SKU.
//
//   METAL picks the column: S925 -> 925 Silver, G10K -> 9K Gold, G14K -> 14K, G18K -> 18K.
//   The sheet's fourth tier is 9K because that is what is sold in the UK; the store's option is
//   still worded "10k", which is a labelling question separate from the price. Colour (Y/W/R)
//   never changes the price.
//
//   The remaining option then adds the store's standing surcharge for that kind of piece:
//
//     Size   (rings)     size 5 is the sheet price, each half size adds 1.25%, size 9 is +10%
//     Length (chains)    $25 an inch either side of the base length — 18 in for a necklace,
//                        7 in for a bracelet, so a 16 in necklace is $50 UNDER the sheet price
//
//   Both ladders are the ones config.eden.json and config.eden-tennis.json have always used, so a
//   re-run of the old import.js length/size syncs agrees with this script. A product with neither
//   option — the merged shape ones, which traded their sizes for the shape slot — takes the sheet
//   price flat.
//
// Prices round DOWN to a whole $10, the rule the rest of the store is priced by, so the sheet's
// $3,100.75 is listed as $3,100.00.
//
// A code the sheet shows as #N/A has no price at all and its variants are LEFT UNTOUCHED at
// whatever they are now (AJLR135, AJLR137, AJLR302, AJLR349 sit at $0 on purpose, waiting for the
// client to supply the missing rows). A code with no row at all is likewise never touched.
//
// Every variant's current price is written to scripts/shopify/backups/ before the first change.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql, writeBackup } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const val = (n) => { const hit = args.find((a) => a.startsWith(`--${n}=`)); return hit ? hit.slice(n.length + 3) : null; };

const APPLY = has('apply');
const VERBOSE = has('verbose');
const SKIP_ARCHIVED = has('skip-archived');
const ONLY = (val('only') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const ROUND_DOWN_TO = 10;       // the store's standing rule, same as config.eden.json priceList
const PCT_PER_HALF_SIZE = 1.25; // size 5 is the base, size 9 is +10%
const BASE_SIZE = 5;
const PER_INCH = 25;            // chains: config.eden-tennis.json lengthPricePerInch
const BASE_LENGTH = { NECKLACE: 18, BRACELET: 7 }; // ...and its lengthBase

// SKU metal segment -> column in ring-prices.csv
const METAL_COLUMN = {
  S925: 'USD_Silver',
  G10K: 'USD_9K',
  G14K: 'USD_14K',
  G18K: 'USD_18K',
};

// ---------- the price sheet ----------

/** "AJLR188-1.00 CTS" and "AJLR134 (2CTS)" and "AJLR300-G18K-Y-7.5" all reduce to the style code. */
const styleCode = (s) => {
  const m = String(s || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]+\d+)/);
  return m ? m[1] : null;
};

function readPriceSheet(file) {
  const rows = readFileSync(file, 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
  const header = rows.shift().map((h) => h.trim());
  const out = new Map();
  const conflicts = [];
  for (const r of rows) {
    const code = styleCode(r[0]);
    if (!code) continue;
    const prices = {};
    for (const col of Object.values(METAL_COLUMN)) {
      const raw = (r[header.indexOf(col)] || '').replace(/[$,]/g, '').trim();
      const n = Number(raw);
      if (raw !== '' && Number.isFinite(n) && n > 0) prices[col] = n;
    }
    const entry = { code, sheetSku: r[0].trim(), prices };
    const prev = out.get(code);
    // The sheet lists a few codes twice. Identical rows are just a repeat; a row that disagrees
    // with the earlier one is reported and the LAST one wins, since the sheet reads top to bottom.
    if (prev && JSON.stringify(prev.prices) !== JSON.stringify(prices)) conflicts.push({ code, prev, next: entry });
    out.set(code, entry);
  }
  return { sheet: out, conflicts };
}

// ---------- pricing ----------

const roundDown = (n) => (n < ROUND_DOWN_TO ? n : Math.floor(n / ROUND_DOWN_TO + 1e-9) * ROUND_DOWN_TO);

function sizeSurcharge(sizeLabel) {
  const n = Number(sizeLabel);
  if (!Number.isFinite(n)) return 0;
  const halfSteps = (n - BASE_SIZE) / 0.5;
  if (halfSteps < 0) return 0; // no size is ever cheaper than the sheet
  return halfSteps * PCT_PER_HALF_SIZE;
}

const optionValue = (variant, name) =>
  (variant.selectedOptions || []).find((o) => o.name.trim().toLowerCase() === name)?.value || null;

/** Which length ladder a chain is on, read off the title the way import.js does. */
function chainCategory(title) {
  const t = String(title || '').toLowerCase();
  if (/bracelet|bangle|anklet/.test(t)) return 'BRACELET';
  if (/necklace|pendant|choker/.test(t)) return 'NECKLACE';
  return null;
}

/** Dollars to add (or take off) for a length: a flat rate per inch either side of the base. */
function lengthDelta(lengthLabel, title) {
  const inches = Number(/([\d.]+)/.exec(String(lengthLabel || ''))?.[1]);
  const base = BASE_LENGTH[chainCategory(title)];
  if (!Number.isFinite(inches) || !base) return 0;
  return (inches - base) * PER_INCH;
}

/** The price this variant should carry, or a reason the sheet cannot price it. */
function priceFor(variant, sheet, product) {
  const sku = variant.sku || '';
  const code = styleCode(sku);
  if (!code) return { skip: 'no SKU' };
  const row = sheet.get(code);
  if (!row) return { skip: 'not in the sheet', code };
  const metalSeg = sku.toUpperCase().split('-')[1];
  const column = METAL_COLUMN[metalSeg];
  if (!column) return { skip: `metal "${metalSeg || '?'}" not in the sheet`, code };
  const base = row.prices[column];
  if (base == null) return { skip: 'sheet has no price for this code (#N/A)', code, missing: true };

  // A ring is sized, a chain is cut to length, a merged shape product is neither.
  const size = optionValue(variant, 'size');
  const length = optionValue(variant, 'length');
  let price = base;
  if (size) price = base * (1 + sizeSurcharge(size) / 100);
  else if (length) price = Math.max(0, base + lengthDelta(length, product.title));
  return { code, column, base, size: size || length, price: roundDown(price).toFixed(2) };
}

// ---------- the store ----------

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 40, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle status
        variants(first: 100) {
          nodes { id sku price selectedOptions { name value } }
        }
      }
    }
  }
`;

const BULK_UPDATE = `
  mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

const cfg = config();
const { sheet, conflicts } = readPriceSheet(resolve(here, 'client-prices.csv'));

console.log(`\nclient-prices.csv — ${sheet.size} style codes\n`);
for (const c of conflicts) {
  const show = (e) => Object.values(METAL_COLUMN).map((k) => e.prices[k] ?? '—').join(' / ');
  console.log(`! ${c.code} appears twice with different prices: ${show(c.prev)}  then  ${show(c.next)}`);
  console.log(`  using the later row.\n`);
}

const products = [];
let cursor = null;
for (;;) {
  const data = await gql(cfg, PRODUCTS, { cursor });
  products.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}
console.log(`${products.length} products in the store\n`);

const plan = [];           // { product, updates:[{id, sku, from, to}] }
const untouched = new Map(); // reason -> [sku]
const note = (reason, sku) => { if (!untouched.has(reason)) untouched.set(reason, []); untouched.get(reason).push(sku); };

for (const product of products) {
  if (SKIP_ARCHIVED && product.status === 'ARCHIVED') {
    for (const v of product.variants.nodes) note('product is archived (--skip-archived)', v.sku);
    continue;
  }
  const updates = [];
  for (const v of product.variants.nodes) {
    const got = priceFor(v, sheet, product);
    if (got.skip) {
      if (ONLY.length && !ONLY.includes(got.code)) continue;
      note(got.skip, v.sku || `(no sku) ${product.handle}`);
      continue;
    }
    if (ONLY.length && !ONLY.includes(got.code)) continue;
    if (Number(v.price) === Number(got.price)) { note('already at the sheet price', v.sku); continue; }
    updates.push({ id: v.id, sku: v.sku, from: v.price, to: got.price });
  }
  if (updates.length) plan.push({ product, updates });
}

// ---------- report ----------

const total = plan.reduce((n, p) => n + p.updates.length, 0);
for (const { product, updates } of plan) {
  const flag = product.status === 'ARCHIVED' ? ' (archived)' : product.status === 'DRAFT' ? ' (draft)' : '';
  console.log(`${product.title}${flag}`);
  console.log(`  ${product.handle} — ${updates.length} variant${updates.length === 1 ? '' : 's'}`);
  for (const u of (VERBOSE ? updates : updates.slice(0, 3))) {
    console.log(`    ${(u.sku || '').padEnd(22)} $${String(u.from).padStart(9)}  ->  $${u.to}`);
  }
  if (!VERBOSE && updates.length > 3) console.log(`    … and ${updates.length - 3} more (--verbose to list them)`);
  console.log('');
}

console.log('Left alone:');
for (const [reason, skus] of [...untouched].sort((a, b) => b[1].length - a[1].length)) {
  const codes = [...new Set(skus.map((s) => styleCode(s)).filter(Boolean))];
  console.log(`  ${String(skus.length).padStart(4)} variant(s) — ${reason}${codes.length && codes.length <= 12 ? `  [${codes.join(', ')}]` : ''}`);
}
console.log(`\n${total} variant price(s) across ${plan.length} product(s) ${APPLY ? 'to write' : 'would change'}.\n`);

if (!APPLY) {
  console.log('Preview only. Add --apply to write these prices.\n');
  process.exit(0);
}
if (!total) { console.log('Nothing to do.\n'); process.exit(0); }

// ---------- write ----------

writeBackup(cfg, 'client-prices-before', products.map((p) => ({
  handle: p.handle, status: p.status,
  variants: p.variants.nodes.map((v) => ({ id: v.id, sku: v.sku, price: v.price })),
})));

let done = 0, failed = 0;
for (const { product, updates } of plan) {
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    try {
      await gql(cfg, BULK_UPDATE, {
        productId: product.id,
        variants: chunk.map((u) => ({ id: u.id, price: u.to })),
      }, 'productVariantsBulkUpdate');
      done += chunk.length;
    } catch (e) {
      failed += chunk.length;
      console.log(`✖ ${product.handle}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`✓ ${product.handle} — ${updates.length} price(s)`);
}
console.log(`\n${done} variant price(s) written${failed ? `, ${failed} failed` : ''}.\n`);
