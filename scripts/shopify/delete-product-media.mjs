#!/usr/bin/env node
// Deletes named photos from a product. For the case dedupe-product-media.mjs refuses to touch:
// two different renders uploaded under one filename, where which to keep is a judgement call.
//
//   node scripts/shopify/delete-product-media.mjs --product=<handle> --ids=71799806361974,...
//   node scripts/shopify/delete-product-media.mjs --product=<handle> --ids=... --apply
//
// Ids are MediaImage ids, with or without the gid:// prefix. Every id has to be on the product or
// nothing is deleted. The product's full media list is written to backups/ before any change.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const handle = arg('product');
const ids = arg('ids').split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => (s.startsWith('gid://') ? s : `gid://shopify/MediaImage/${s}`));

if (!handle || !ids.length) {
  console.error('Need --product=<handle> and --ids=<id,id,...>.');
  process.exit(1);
}

const cfg = config();
const d = await gql(
  cfg,
  `query($h: String!) { productByHandle(handle: $h) {
    id title
    media(first: 250) { nodes { id alt ... on MediaImage { image { url } } } } } }`,
  { h: handle }
);
const product = d.productByHandle;
if (!product) {
  console.error(`No product with the handle "${handle}".`);
  process.exit(1);
}

const onProduct = new Map(product.media.nodes.map((m) => [m.id, m]));
const missing = ids.filter((id) => !onProduct.has(id));
if (missing.length) {
  console.error(`Not on ${product.title}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

console.log(`${product.title}  (${product.media.nodes.length} photos)`);
for (const id of ids) {
  const m = onProduct.get(id);
  console.log(`  delete ${id.split('/').pop()}  [${m.alt}]  ${(m.image?.url || '').split('/').pop().split('?')[0]}`);
}
console.log(`  leaving ${product.media.nodes.length - ids.length}`);

if (!apply) {
  console.log('\nPreview only. Re-run with --apply.');
  process.exit(0);
}

const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `delete-media-${handle}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(product, null, 2));
console.log(`\nBefore-state written to ${file}`);

await gql(
  cfg,
  `mutation($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds mediaUserErrors { field message } } }`,
  { productId: product.id, mediaIds: ids },
  'productDeleteMedia'
);
console.log(`Deleted ${ids.length} photo(s).`);
