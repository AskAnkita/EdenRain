#!/usr/bin/env node
// Adds a "Metal Weight" line to the spec list in product descriptions (the Style Details row).
// Weights come from product-specs.json "metalWeights", written lightest metal first in the same
// format import.js uses: "Metal Weight: Silver 4 g, 14K 4.75 g, 18K 5.7 g".
//
//   node scripts/shopify/add-metal-weight.mjs            preview
//   node scripts/shopify/add-metal-weight.mjs --apply    write the descriptions (backup saved first)
//
// Only touches a product whose variants all share one code (merged shape products carry one
// weight per shape, and most shapes have none yet), whose sheet covers two or more metals (one
// metal's weight would read as if it were all of them), and whose description has no Metal
// Weight line already. The line goes after "Metal:" when there is one, else at the end of the
// first list. Nothing else in the description changes.

import fs from 'node:fs';
import { resolve } from 'node:path';
import { config, paginate, gql, writeBackup } from './lib.mjs';

const apply = process.argv.includes('--apply');
const cfg = config();
const SPECS = JSON.parse(fs.readFileSync(resolve(import.meta.dirname, '../../../product-specs.json'), 'utf8'));

const ORDER = ['silver', '925', '9k', '10k', '14k', '18k', '22k', 'platinum'];
const rank = (k) => { const i = ORDER.findIndex((m) => k.toLowerCase().includes(m)); return i === -1 ? ORDER.length : i; };
const num = (n) => String(Math.round(Number(n) * 100) / 100);

function weightLine(spec) {
  const w = spec?.metalWeights;
  if (!w || Object.keys(w).length < 2) return null;
  const text = Object.keys(w).sort((a, b) => rank(a) - rank(b)).map((k) => `${k} ${num(w[k])} g`).join(', ');
  return `Metal Weight: ${text}${spec.metalWeightNote ? ` (${spec.metalWeightNote})` : ''}`;
}

const products = await paginate(cfg, `query($after: String) {
  products(first: 100, after: $after) {
    nodes { id handle descriptionHtml variants(first: 250) { nodes { sku } } }
    pageInfo { hasNextPage endCursor }
  }
}`, 'products');

const changes = [];
for (const p of products) {
  const codes = new Set(p.variants.nodes.map((v) => /^AJ[A-Z]{2}\d+/.exec(String(v.sku || '').toUpperCase())?.[0]).filter(Boolean));
  if (codes.size !== 1) continue;
  const [code] = codes;
  const line = weightLine(SPECS[code]);
  const html = p.descriptionHtml || '';
  if (!line || /Metal Weight/i.test(html) || !/<ul[\s>]/i.test(html)) continue;

  const li = `<li>${line}</li>`;
  const metal = /(<li>\s*Metal:[\s\S]*?<\/li>)(\s*)/i;
  const next = metal.test(html)
    ? html.replace(metal, (m, item, gap) => `${item}${gap || ''}${li}${gap || ''}`)
    : html.replace(/(\s*)<\/ul>/i, (m, gap) => `${gap || '\n'}${li}${gap || '\n'}</ul>`);
  if (next !== html) changes.push({ id: p.id, handle: p.handle, code, line, before: html, after: next });
}

for (const c of changes) console.log(`${c.code.padEnd(9)} ${c.handle.slice(0, 50).padEnd(50)} ${c.line}`);
console.log(`\n${changes.length} product(s) ${apply ? 'to update' : 'would get the line'}.`);
if (!apply || !changes.length) process.exit(0);

console.log(`Backup: ${writeBackup(cfg, 'descriptions-before-metal-weight', changes.map(({ id, handle, before }) => ({ id, handle, descriptionHtml: before })))}`);
for (const c of changes) {
  await gql(cfg, `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id } userErrors { field message } } }`,
    { p: { id: c.id, descriptionHtml: c.after } }, 'productUpdate');
  console.log(`✓ ${c.code}`);
}
