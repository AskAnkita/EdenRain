#!/usr/bin/env node
// Exports every variant in the store - SKU, options and current price - to a CSV, for repricing.
//
//   node scripts/shopify/export-skus.mjs                    Active + Draft products
//   node scripts/shopify/export-skus.mjs --include-archived also the archived (merged-away) donors
//   node scripts/shopify/export-skus.mjs --out=path.csv

import { writeFileSync } from 'node:fs';
import { config, paginate } from './lib.mjs';

const args = process.argv.slice(2);
const includeArchived = args.includes('--include-archived');
const stamp = new Date().toISOString().slice(0, 10);
const out = (args.find((a) => a.startsWith('--out=')) || '').slice(6) || `sku-export-${stamp}.csv`;
const cfg = config();

const products = await paginate(
  cfg,
  `query($after: String, $q: String) {
    products(first: 50, after: $after, query: $q, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        title handle status productType
        variants(first: 100) { nodes { sku title price compareAtPrice } }
      }
    }
  }`,
  'products',
  { q: includeArchived ? null : '-status:archived' }
);

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = [['Product', 'Handle', 'Status', 'Type', 'SKU', 'Variant', 'Price (GBP)', 'Compare-at price', 'New price']];
for (const p of products) {
  for (const v of p.variants.nodes) {
    rows.push([p.title, p.handle, p.status, p.productType, v.sku, v.title === 'Default Title' ? '' : v.title, v.price, v.compareAtPrice, '']);
  }
}
writeFileSync(out, rows.map((r) => r.map(esc).join(',')).join('\n') + '\n');
console.log(`${products.length} products, ${rows.length - 1} variants -> ${out}`);
