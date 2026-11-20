#!/usr/bin/env node
// Every product title starts with its design. Two rules, applied in this order:
//
//   1. A piece of 2 CTW or less, in any category, drops its leading carat:
//      "1.94 CTW Pear Cut Lab-Grown Diamond Cluster Engagement Ring"
//        -> "Pear Cut Lab-Grown Diamond Cluster Engagement Ring"
//      Anything over 2 CTW keeps it ("3.27 CTW Emerald Cut ...").
//   2. A title that would then open with "Lab-Grown Diamond" moves the design words in front:
//      "Lab-Grown Diamond Cathedral Solitaire Engagement Ring"
//        -> "Cathedral Solitaire Lab-Grown Diamond Engagement Ring"
//      A kept carat stays first: "2.2 CTW Twist Lab-Grown Diamond Engagement Ring".
//
// The weight still shows in the product page's "Total Carat Weight" row, and the theme only
// re-adds it to a title above 2 CTW (snippets/card-carat-prefix.liquid). Handles are left alone
// so links keep working, and archived merge donors are skipped. An SEO title that matched the
// old title moves with it. After any import or merge, run this again.
//
//   node scripts/shopify/retitle-design-first.mjs           preview only
//   node scripts/shopify/retitle-design-first.mjs --apply   rename

import { config, gql, paginate } from './lib.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = 2;
const LAB = /^Lab-Grown Diamond\s+/i;
// Longest first, so "Engagement Ring" wins over "Ring".
const PIECE = /\s+((?:Engagement|Wedding|Eternity) Ring|(?:Wedding|Eternity) Band|Bridal Set|(?:Stud |Huggie Hoop |Hoop |Drop )?Earrings|(?:Tennis |Pendant |Station )?Necklace|(?:Tennis )?Bracelet|Pendant|Ring|Band)$/i;

export function designFirst(title) {
  let t = title.trim();
  let carat = '';
  const m = t.match(/^([\d.]+)\s*CTW\s+(.+)$/i);
  if (m) {
    t = m[2];
    if (Number(m[1]) > LIMIT) carat = `${m[1]} CTW `;
  }
  if (LAB.test(t)) {
    const rest = t.replace(LAB, '');
    const piece = rest.match(PIECE);
    const design = piece ? rest.slice(0, piece.index).trim() : '';
    if (design) t = `${design} Lab-Grown Diamond ${piece[1]}`;
  }
  return carat + t;
}

const cfg = config();
const products = await paginate(cfg, `query($after: String) { products(first: 100, after: $after) {
  pageInfo { hasNextPage endCursor } nodes { id title status seo { title } } } }`, 'products');

const todo = [];
for (const p of products) {
  if (p.status === 'ARCHIVED') continue;
  const title = designFirst(p.title);
  if (title !== p.title.trim()) todo.push({ p, title });
}

console.log(`${todo.length} titles to change\n`);
for (const { p, title } of todo) console.log(`  ${p.status.padEnd(8)} ${p.title}\n           -> ${title}`);
if (!APPLY) { console.log('\nPreview only. Re-run with --apply to rename.'); process.exit(0); }

for (const { p, title } of todo) {
  const input = { id: p.id, title };
  if (p.seo?.title && p.seo.title.trim() === p.title.trim()) input.seo = { title };
  const r = await gql(cfg, `mutation($input: ProductInput!) { productUpdate(input: $input) { product { title } userErrors { field message } } }`, { input }, 'productUpdate');
  const errs = r.productUpdate.userErrors;
  console.log(errs.length ? `  FAILED ${p.title}: ${errs.map((e) => e.message).join('; ')}` : `  renamed ${title}`);
}
