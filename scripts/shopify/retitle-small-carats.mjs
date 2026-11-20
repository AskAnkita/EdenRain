#!/usr/bin/env node
// Pieces of 2 CTW or less, in every category, are titled by their design, not their weight:
// "1.94 CTW Pear Cut Lab-Grown Diamond Cluster Engagement Ring" becomes "Pear Cut Lab-Grown
// Diamond Cluster Engagement Ring". Anything over 2 CTW keeps the leading carat. The weight
// still shows in the product page's "Total Carat Weight" row. Handles are left alone so links
// and search results keep working, and archived merge donors are skipped. An SEO title that
// matched the old title moves with it.
//
//   node scripts/shopify/retitle-small-carats.mjs           preview only
//   node scripts/shopify/retitle-small-carats.mjs --apply   rename

import { config, gql, paginate } from './lib.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = 2;

const cfg = config();
const products = await paginate(cfg, `query($after: String) { products(first: 100, after: $after) {
  pageInfo { hasNextPage endCursor } nodes { id title status seo { title } } } }`, 'products');

const todo = [];
for (const p of products) {
  const m = p.title.match(/^\s*([\d.]+)\s*CTW\s+(.+)$/i);
  if (p.status === 'ARCHIVED' || !m || !(Number(m[1]) <= LIMIT)) continue;
  todo.push({ p, title: m[2].trim() });
}

console.log(`${todo.length} products at ${LIMIT} CTW or less to retitle\n`);
for (const { p, title } of todo) console.log(`  ${p.status.padEnd(8)} ${p.title}\n           -> ${title}`);
if (!APPLY) { console.log('\nPreview only. Re-run with --apply to rename.'); process.exit(0); }

for (const { p, title } of todo) {
  const input = { id: p.id, title };
  if (p.seo?.title && p.seo.title.trim() === p.title.trim()) input.seo = { title };
  const r = await gql(cfg, `mutation($input: ProductInput!) { productUpdate(input: $input) { product { title } userErrors { field message } } }`, { input }, 'productUpdate');
  const errs = r.productUpdate.userErrors;
  console.log(errs.length ? `  FAILED ${p.title}: ${errs.map((e) => e.message).join('; ')}` : `  renamed ${title}`);
}
