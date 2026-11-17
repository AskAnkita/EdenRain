#!/usr/bin/env node
// Writes each variant's total diamond carat weight into the variant metafield
// custom.total_carat_weight, which the product page shows as "Total Carat Weight: 4.98 CTW"
// (blocks/product-info.liquid). Per VARIANT, not per product: a merged shape product holds one
// style code per centre-stone shape, and the codes do not all weigh the same.
//
//   node scripts/shopify/sync-carat-weights.mjs              preview only, changes nothing
//   node scripts/shopify/sync-carat-weights.mjs --apply      write the metafields
//   node scripts/shopify/sync-carat-weights.mjs --only=AJLR199,AJLB20
//
// Where a code's weight comes from, first hit wins
//   1. scripts/shopify/client-prices.csv   "Carat"          the client's own sheet (rings)
//   2. price-list.csv                      "TotalDiamondWt" the packing price list
//   3. price-list.eden-tennis.csv          "TotalDiamondWt"
//   4. the product description's "Carat: X CTW" line, or "X CTW" in the title - only on a
//      product holding a single style code, where a product-level figure is that code's figure
//
// A weight of 0 is never written (plain bands, and the sheet's #N/A rings), and neither is a
// code listed in SUSPECT below. A variant with no weight keeps no metafield, and the page hides
// the line for it.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql, paginate } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [];

const NAMESPACE = 'custom';
const KEY = 'total_carat_weight';

// AJLR302 reads 0.09 in the client sheet where every other crossover shape is 2.09 - a typo in
// a row that is still #N/A on price. Left blank until the client confirms it.
const SUSPECT = new Set(['AJLR302']);

const codeOf = (s) => (String(s || '').toUpperCase().replace(/\s+/g, '').match(/^[A-Z]+\d+/) || [''])[0];

function sheet(file, column) {
  const map = new Map();
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return map; }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  const ci = head.indexOf(column);
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const code = codeOf(cells[0]);
    const n = Number(cells[ci]);
    if (code && !map.has(code) && cells[ci] !== '' && Number.isFinite(n)) map.set(code, n);
  }
  return map;
}

const sources = [
  ['client sheet', sheet(resolve(here, 'client-prices.csv'), 'Carat')],
  ['price list', sheet(resolve(root, 'price-list.csv'), 'TotalDiamondWt')],
  ['tennis list', sheet(resolve(root, 'price-list.eden-tennis.csv'), 'TotalDiamondWt')],
];

function fromSheets(code) {
  for (const [name, map] of sources) if (map.has(code)) return { n: map.get(code), from: name };
  return null;
}

function fromProduct(p) {
  const text = p.descriptionHtml.replace(/<[^>]+>/g, ' ');
  const row = text.match(/Carat\s*:\s*([\d.]+)\s*CTW/i);
  if (row) return { n: Number(row[1]), from: 'description' };
  const title = p.title.match(/([\d.]+)\s*CTW/i);
  if (title) return { n: Number(title[1]), from: 'title' };
  return null;
}

const fmt = (n) => String(Math.round(n * 100) / 100);

const cfg = config();

if (APPLY) {
  const existing = await gql(cfg, `{ metafieldDefinitions(first: 5, ownerType: PRODUCTVARIANT, namespace: "${NAMESPACE}", key: "${KEY}") { nodes { id } } }`);
  if (!existing.metafieldDefinitions.nodes.length) {
    await gql(cfg, `mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message } } }`, {
      d: {
        name: 'Total carat weight', namespace: NAMESPACE, key: KEY, ownerType: 'PRODUCTVARIANT',
        type: 'number_decimal', description: 'Total diamond weight of this variant in carats (CTW). Shown on the product page.',
        access: { storefront: 'PUBLIC_READ' },
      },
    }, 'metafieldDefinitionCreate');
    console.log(`Created the variant metafield definition ${NAMESPACE}.${KEY}`);
  }
}

const products = await paginate(cfg, `query($after: String) { products(first: 50, after: $after, query: "status:active") {
  pageInfo { hasNextPage endCursor }
  nodes { id title descriptionHtml variants(first: 100) { nodes { id sku metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } } } } }`, 'products');

const writes = [];
const missing = new Map();
const noCode = [];
let same = 0;
for (const p of products) {
  const codes = [...new Set(p.variants.nodes.map((v) => codeOf(v.sku)).filter(Boolean))];
  if (!codes.length) { noCode.push(p.title); continue; }
  if (ONLY.length && !codes.some((c) => ONLY.includes(c))) continue;
  const own = codes.length === 1 ? fromProduct(p) : null;
  const titleN = codes.length === 1 ? Number((p.title.match(/([\d.]+)\s*CTW/i) || [])[1]) || null : null;
  for (const v of p.variants.nodes) {
    const code = codeOf(v.sku);
    if (!code || (ONLY.length && !ONLY.includes(code))) continue;
    let hit = SUSPECT.has(code) ? null : (fromSheets(code) || own);
    // A single-code product whose title states a weight far from the sheet's is a different
    // build of the same code: AJLB20's sheet row is the 3 CTW bracelet, the product (and its
    // renders) the 12 CTW one. The title is what the customer is buying, so it wins.
    if (hit && titleN && Math.abs(titleN - hit.n) / titleN > 0.25) hit = { n: titleN, from: 'title' };
    if (!hit || !(hit.n > 0)) { missing.set(code, p.title); continue; }
    const value = fmt(hit.n);
    if (v.metafield && Number(v.metafield.value) === Number(value)) { same++; continue; }
    writes.push({ ownerId: v.id, namespace: NAMESPACE, key: KEY, type: 'number_decimal', value, _code: code, _from: hit.from, _title: p.title });
  }
}

const byCode = new Map();
for (const w of writes) if (!byCode.has(w._code)) byCode.set(w._code, w);
console.log(`\n${writes.length} variants to write across ${byCode.size} codes (${same} already correct)\n`);
for (const [code, w] of [...byCode].sort()) console.log(`  ${code.padEnd(9)} ${(w.value + ' CTW').padEnd(10)} ${w._from.padEnd(12)} ${w._title.slice(0, 60)}`);
if (missing.size) {
  console.log(`\nNo weight for ${missing.size} codes - their variants show no carat line:`);
  for (const [code, title] of [...missing].sort()) console.log(`  ${code.padEnd(9)} ${title.slice(0, 60)}`);
}

if (noCode.length) {
  console.log(`\n${noCode.length} products have no style code in their SKUs and were skipped:`);
  for (const t of noCode) console.log(`  ${t.slice(0, 70)}`);
}

if (!APPLY) {
  console.log('\nPreview only. Re-run with --apply to write.');
  process.exit(0);
}

for (let i = 0; i < writes.length; i += 25) {
  const batch = writes.slice(i, i + 25).map(({ ownerId, namespace, key, type, value }) => ({ ownerId, namespace, key, type, value }));
  await gql(cfg, `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { id } userErrors { field message } } }`, { m: batch }, 'metafieldsSet');
  process.stdout.write(`\r  wrote ${Math.min(i + 25, writes.length)}/${writes.length}`);
}
console.log('\nDone.');
