#!/usr/bin/env node
// Retires a product that has been folded into another one: sets it ARCHIVED and points its URL at
// the product that replaced it, so the old link never 404s. What merge-shape-products.mjs does to
// a donor, for a product that was folded in some other way (add-shape-to-product.mjs).
//
//   node scripts/shopify/archive-and-redirect.mjs --product=<handle> --to=<handle>
//   node scripts/shopify/archive-and-redirect.mjs --product=<handle> --to=<handle> --apply
//
// Nothing is deleted: the product keeps its variants, photos and order history, so re-listing it
// is a status change away (delete the redirect first, or its own URL will bounce).

import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const handle = arg('product');
const toHandle = arg('to');

if (!handle || !toHandle) { console.error('Need --product=<handle> --to=<handle>'); process.exit(1); }

const cfg = config();
const q = `query($h: String!) { productByHandle(handle: $h) { id title handle status variants(first: 1) { nodes { sku } } } }`;
const from = (await gql(cfg, q, { h: handle })).productByHandle;
const to = (await gql(cfg, q, { h: toHandle })).productByHandle;
if (!from) { console.error(`No product with the handle "${handle}".`); process.exit(1); }
if (!to) { console.error(`No product with the handle "${toHandle}".`); process.exit(1); }

const path = `/products/${from.handle}`;
const target = `/products/${to.handle}`;
console.log(`archive  ${from.title} (${from.status})`);
console.log(`redirect ${path} -> ${target}`);
if (!apply) { console.log('\nPreview only. Re-run with --apply.'); process.exit(0); }

if (from.status !== 'ARCHIVED') {
  await gql(
    cfg,
    `mutation($input: ProductUpdateInput!) { productUpdate(product: $input) { product { id status } userErrors { field message } } }`,
    { input: { id: from.id, status: 'ARCHIVED' } },
    'productUpdate'
  );
  console.log('  archived');
} else {
  console.log('  already archived');
}

try {
  await gql(
    cfg,
    `mutation($redirect: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $redirect) { urlRedirect { id path target } userErrors { field message } } }`,
    { redirect: { path, target } },
    'urlRedirectCreate'
  );
  console.log('  redirect created');
} catch (error) {
  if (/already|taken|exists/i.test(error.message)) console.log('  redirect already there');
  else throw error;
}
