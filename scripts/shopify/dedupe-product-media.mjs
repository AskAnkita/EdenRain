#!/usr/bin/env node
// Removes photos a product holds more than one copy of. Shopify keeps the original filename and
// appends a uuid when the name collides, so the same render uploaded twice becomes
// "AJLR136-2cts-Y1_<uuid-a>.png" and "AJLR136-2cts-Y1_<uuid-b>.png". Merges can introduce these:
// a donor that already carried a duplicate copies both across.
//
//   node scripts/shopify/dedupe-product-media.mjs --product=<handle>
//   node scripts/shopify/dedupe-product-media.mjs --product=<handle> --apply
//   node scripts/shopify/dedupe-product-media.mjs --all            every product with a Shape option
//
// A candidate is only deleted when its bytes hash identical to the copy being kept, so two
// different renders that happen to share a filename are reported and left alone. The first copy
// in the product's own media order is the one kept.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const everyMerged = args.includes('--all');
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const handleArg = arg('product');

if (!handleArg && !everyMerged) {
  console.error('Need --product=<handle> or --all.');
  process.exit(1);
}

const cfg = config();

// "AJLR136-2cts-Y1_95a61ba5-....png" -> "ajlr136-2cts-y1.png": the name before Shopify's suffix.
function baseName(url) {
  const file = (url || '').split('/').pop().split('?')[0];
  const dot = file.lastIndexOf('.');
  const stem = dot === -1 ? file : file.slice(0, dot);
  const ext = dot === -1 ? '' : file.slice(dot);
  return (stem.replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '') + ext).toLowerCase();
}

const hashes = new Map();
async function hashOf(url) {
  if (hashes.has(url)) return hashes.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`);
  const digest = createHash('md5').update(Buffer.from(await res.arrayBuffer())).digest('hex');
  hashes.set(url, digest);
  return digest;
}

async function productsToCheck() {
  if (handleArg) return [handleArg];
  const out = [];
  let cursor = null;
  do {
    const d = await gql(
      cfg,
      `query($c: String) { products(first: 100, after: $c, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes { handle options { name } } } }`,
      { c: cursor }
    );
    for (const p of d.products.nodes) {
      if (p.options.some((o) => o.name.toLowerCase().includes('shape'))) out.push(p.handle);
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

let totalDoomed = 0;
const backupRows = [];

for (const handle of await productsToCheck()) {
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
    continue;
  }

  const groups = new Map();
  for (const m of product.media.nodes) {
    const url = m.image?.url;
    if (!url) continue;
    const key = baseName(url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...m, url });
  }

  const doomed = [];
  const differing = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const keeper = items[0];
    const keeperHash = await hashOf(keeper.url);
    for (const other of items.slice(1)) {
      if ((await hashOf(other.url)) === keeperHash) doomed.push({ key, keeper, other });
      else differing.push({ key, keeper, other });
    }
  }

  if (!doomed.length && !differing.length) continue;

  console.log(`\n${product.title}  (${product.media.nodes.length} photos)`);
  for (const { key, other } of doomed) console.log(`  duplicate  ${key}  -> delete ${other.id.split('/').pop()} [${other.alt}]`);
  for (const { key } of differing) console.log(`  !! same name, DIFFERENT bytes: ${key} — left alone, check by hand`);
  console.log(`  deleting ${doomed.length}, leaving ${product.media.nodes.length - doomed.length}`);

  totalDoomed += doomed.length;
  backupRows.push({ handle, title: product.title, media: product.media.nodes });

  if (apply && doomed.length) {
    await gql(
      cfg,
      `mutation($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds mediaUserErrors { field message } } }`,
      { productId: product.id, mediaIds: doomed.map((x) => x.other.id) },
      'productDeleteMedia'
    );
    console.log(`  deleted ${doomed.length} photo(s).`);
  }
}

if (!totalDoomed) {
  console.log('\nNo duplicate photos found.');
  process.exit(0);
}

if (apply) {
  const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `dedupe-media-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(backupRows, null, 2));
  console.log(`\nBefore-state written to ${file}`);
} else {
  console.log(`\nPreview only — ${totalDoomed} photo(s) would be deleted. Re-run with --apply.`);
}
