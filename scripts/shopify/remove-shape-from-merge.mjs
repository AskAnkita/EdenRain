#!/usr/bin/env node
// Takes one shape back out of a merged shape product: deletes that shape's variants and the photos
// whose media-grouping alt belongs to it, leaving the rest of the product untouched.
//
//   node scripts/shopify/remove-shape-from-merge.mjs --product=<handle> --shape=Emerald
//   node scripts/shopify/remove-shape-from-merge.mjs --product=<handle> --shape=Emerald --apply
//
// Nothing is preview-only by accident: without --apply it only prints. The donor product the shape
// came from is left alone — merge-shape-products.mjs archives donors rather than deleting them, so
// re-running the merge puts the shape back.
//
// Before any change the product's full before-state is written to scripts/shopify/backups/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const arg = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
const handle = arg('product');
const shape = arg('shape');
const optionName = arg('option') || 'Shape';

if (!handle || !shape) {
  console.error('Need --product=<handle> and --shape=<value>.');
  process.exit(1);
}

const cfg = config();

const data = await gql(
  cfg,
  `query($handle: String!) {
    productByHandle(handle: $handle) {
      id title handle status
      options { name optionValues { name } }
      variants(first: 250) { nodes { id title sku price selectedOptions { name value } } }
      media(first: 250) { nodes { id alt mediaContentType ... on MediaImage { image { url } } } }
    }
  }`,
  { handle }
);

const product = data.productByHandle;
if (!product) {
  console.error(`No product with the handle "${handle}".`);
  process.exit(1);
}

const shapeOf = (variant) => variant.selectedOptions.find((o) => o.name === optionName)?.value || '';
const target = shape.trim().toLowerCase();

const doomedVariants = product.variants.nodes.filter((v) => shapeOf(v).trim().toLowerCase() === target);
const keptVariants = product.variants.nodes.filter((v) => shapeOf(v).trim().toLowerCase() !== target);

// Photos carry "#Jewelry material_<Shape> <Metal>"; the shape is the first word(s) after the
// underscore. Match on that prefix so only this shape's gallery goes.
const altPrefix = `#${optionName === 'Shape' ? 'Jewelry material' : optionName}_${shape.trim()} `.toLowerCase();
const doomedMedia = product.media.nodes.filter((m) => (m.alt || '').trim().toLowerCase().startsWith(altPrefix));

console.log(`${product.title} (${product.status})`);
console.log(`  ${product.variants.nodes.length} variants, ${product.media.nodes.length} photos`);
console.log(`\nRemoving ${optionName} = "${shape}":`);
console.log(`  variants to delete: ${doomedVariants.length}`);
for (const v of doomedVariants) console.log(`    - ${v.title}  sku=${v.sku}`);
console.log(`  photos to delete:   ${doomedMedia.length}`);
for (const m of doomedMedia) console.log(`    - ${m.alt}`);
console.log(`\n  variants left afterwards: ${keptVariants.length}`);
const leftShapes = [...new Set(keptVariants.map(shapeOf))];
console.log(`  shapes left afterwards:   ${leftShapes.join(' | ') || '(none)'}`);

if (!doomedVariants.length && !doomedMedia.length) {
  console.log('\nNothing matches — already removed.');
  process.exit(0);
}
if (!keptVariants.length) {
  console.error('\nThat would delete every variant on the product. Refusing.');
  process.exit(1);
}
if (!apply) {
  console.log('\nPreview only. Re-run with --apply to make these changes.');
  process.exit(0);
}

const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = resolve(dir, `remove-shape-${handle}-${shape.trim().toLowerCase().replace(/\s+/g, '-')}-${stamp}.json`);
writeFileSync(backup, JSON.stringify(product, null, 2));
console.log(`\nBefore-state written to ${backup}`);

if (doomedVariants.length) {
  await gql(
    cfg,
    `mutation($productId: ID!, $variantsIds: [ID!]!) {
      productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
        userErrors { field message }
      }
    }`,
    { productId: product.id, variantsIds: doomedVariants.map((v) => v.id) },
    'productVariantsBulkDelete'
  );
  console.log(`Deleted ${doomedVariants.length} variants.`);
}

if (doomedMedia.length) {
  await gql(
    cfg,
    `mutation($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        mediaUserErrors { field message }
      }
    }`,
    { productId: product.id, mediaIds: doomedMedia.map((m) => m.id) },
    'productDeleteMedia'
  );
  console.log(`Deleted ${doomedMedia.length} photos.`);
}

const after = await gql(
  cfg,
  `query($handle: String!) {
    productByHandle(handle: $handle) {
      options { name optionValues { name } }
      variants(first: 250) { nodes { id } }
      media(first: 250) { nodes { id } }
    }
  }`,
  { handle }
);
const opt = after.productByHandle.options.find((o) => o.name === optionName);
console.log(`\nNow: ${after.productByHandle.variants.nodes.length} variants, ${after.productByHandle.media.nodes.length} photos.`);
console.log(`${optionName} values: ${opt ? opt.optionValues.map((v) => v.name).join(' | ') : '(option gone)'}`);
