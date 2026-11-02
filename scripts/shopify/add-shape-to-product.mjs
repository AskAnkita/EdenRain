#!/usr/bin/env node
// Adds one centre-stone shape to an already-merged shape product: the option value, its ten
// metal variants and its photos, in the same conventions merge-shape-products.mjs uses.
//
//   node scripts/shopify/add-shape-to-product.mjs --product=<handle> --shape=Emerald --sku=AJLR302 --dir=<folder>
//   ... --apply
//   ... --prices="925:720,10K:1080,14K:1320,18K:1630"      per-karat price; default 0
//
// For a shape that never had a product of its own, so there is nothing to archive and no URL to
// redirect — merge-shape-products.mjs stays the tool when a real listing is being folded in.
//
// The folder holds <sku>-*-{Y,W,R}{1..4}.png. Y is the yellow-gold group, W the white-gold one
// (sterling silver rides along with it, as the existing variants do) and R rose gold; "1" is the
// front view and becomes each variant's own photo. Alt text is written as
// "#Jewelry material_<Shape> <group>", which is what assets/product-metal-media.js filters on.
//
// Re-running is safe: a shape already on the product is left alone.

import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, gql, uploadImage } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const arg = (n, d = '') => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const handle = arg('product');
const shape = arg('shape');
const skuPrefix = arg('sku');
const dir = arg('dir');
const priceArg = arg('prices');

if (!handle || !shape || !skuPrefix || !dir) {
  console.error('Need --product=<handle> --shape=<Shape> --sku=<prefix> --dir=<folder>');
  process.exit(1);
}

// Metal value -> [sku code, photo group, karat key for --prices]
const METALS = new Map([
  ['925 Sterling Silver', ['S925-W', 'white_gold', '925']],
  ['10k Yellow Gold', ['G10K-Y', 'Gold', '10K']],
  ['10k White Gold', ['G10K-W', 'white_gold', '10K']],
  ['10k Rose Gold', ['G10K-R', 'Rose gold', '10K']],
  ['14k Yellow Gold', ['G14K-Y', 'Gold', '14K']],
  ['14k White Gold', ['G14K-W', 'white_gold', '14K']],
  ['14k Rose Gold', ['G14K-R', 'Rose gold', '14K']],
  ['18k Yellow Gold', ['G18K-Y', 'Gold', '18K']],
  ['18k White Gold', ['G18K-W', 'white_gold', '18K']],
  ['18k Rose Gold', ['G18K-R', 'Rose gold', '18K']],
]);
const LETTER_GROUP = { Y: 'Gold', W: 'white_gold', R: 'Rose gold' };

const prices = new Map();
for (const part of priceArg.split(',').map((s) => s.trim()).filter(Boolean)) {
  const [k, v] = part.split(':');
  prices.set(k.trim().toUpperCase(), v.trim());
}
const priceFor = (karat) => prices.get(karat.toUpperCase()) ?? '0.00';

const cfg = config();
const log = (...m) => console.log(...m);

const data = await gql(
  cfg,
  `query($h: String!) {
    productByHandle(handle: $h) {
      id title tags
      options { id name position optionValues { id name } }
      variants(first: 250) { nodes {
        id sku taxable inventoryPolicy
        selectedOptions { name value }
        media(first: 1) { nodes { id } }
        inventoryItem { tracked requiresShipping measurement { weight { value unit } } }
      } }
      media(first: 250) { nodes { id alt ... on MediaImage { image { url } } } }
    }
  }`,
  { h: handle }
);
const product = data.productByHandle;
if (!product) { console.error(`No product with the handle "${handle}".`); process.exit(1); }

const shapeOption = product.options.find((o) => o.name.toLowerCase() === 'shape');
const materialOption = product.options.find((o) => o.name.toLowerCase().includes('material'));
if (!shapeOption || !materialOption) { console.error('That product has no Shape + material options; use merge-shape-products.mjs first.'); process.exit(1); }

const existingShapes = shapeOption.optionValues.map((v) => v.name);
const optionValueExists = existingShapes.some((s) => s.toLowerCase() === shape.toLowerCase());
const materials = materialOption.optionValues.map((v) => v.name).filter((m) => METALS.has(m));
const unknown = materialOption.optionValues.map((v) => v.name).filter((m) => !METALS.has(m));

// A run that died partway can leave the option value, or some photos, without the variants. Work
// out what is actually missing rather than trusting the option value alone.
const shapeOf = (v) => v.selectedOptions.find((o) => o.name === shapeOption.name)?.value || '';
const materialOf = (v) => v.selectedOptions.find((o) => o.name === materialOption.name)?.value || '';
const shapeVariants = product.variants.nodes.filter((v) => shapeOf(v).toLowerCase() === shape.toLowerCase());
const haveMaterials = new Set(shapeVariants.map(materialOf));
const missingMaterials = materials.filter((m) => !haveMaterials.has(m));
// A run that created the variants before the photos landed leaves them with no photo of their
// own. assets/product-metal-media.js filters the gallery on the variant's photo, so such a
// variant shows every shape's photos; these get their front view back further down.
const needMedia = shapeVariants.filter((v) => !v.media.nodes.length);
// Shopify appends a uuid when the filename is already taken ("…-Y1_<uuid>.png"), so compare on
// the name before that suffix or an interrupted run looks like it uploaded nothing.
const baseName = (url) => {
  const file = (url || '').split('/').pop().split('?')[0];
  const dot = file.lastIndexOf('.');
  const stem = dot === -1 ? file : file.slice(0, dot);
  const ext = dot === -1 ? '' : file.slice(dot);
  return (stem.replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '') + ext).toLowerCase();
};
const onProduct = new Set(product.media.nodes.map((m) => baseName(m.image?.url)).filter(Boolean));

// Copy the stock behaviour of a variant that is already on the product.
const template = product.variants.nodes[0];

const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];
const photos = [];
for (const f of files) {
  const m = f.match(/-([YWR])(\d)\./i);
  if (!m) { log(`  ? skipping ${f}: no -Y1/-W2/... in the name`); continue; }
  photos.push({ file: f, group: LETTER_GROUP[m[1].toUpperCase()], view: Number(m[2]) });
}

const newPhotos = photos.filter((p) => !onProduct.has(p.file.toLowerCase()));
const nothingToDo = !missingMaterials.length && !newPhotos.length && !needMedia.length;

log(`${product.title}`);
log(`  shapes now:     ${existingShapes.join(' | ')}`);
log(`  adding:         ${shape}${optionValueExists ? '  (option value already present)' : ''}${nothingToDo ? ' — nothing left to do' : ''}`);
log(`  variants:       ${missingMaterials.length} to create (${product.variants.nodes.length} -> ${product.variants.nodes.length + missingMaterials.length})`);
if (haveMaterials.size) log(`                  ${haveMaterials.size} already there from an earlier run`);
if (needMedia.length) log(`                  ${needMedia.length} of those have no photo of their own — giving them the front view`);
if (unknown.length) log(`  ! material values this script has no SKU code for: ${unknown.join(', ')}`);
log(`  photos:         ${newPhotos.length} to upload from ${dir} (${photos.length - newPhotos.length} already on the product)`);
for (const g of ['Gold', 'white_gold', 'Rose gold']) {
  const inGroup = photos.filter((p) => p.group === g);
  const front = inGroup.find((p) => p.view === 1);
  log(`     ${g.padEnd(11)} ${inGroup.length} photo(s)${front ? '' : '   ! no "1" front view — variants in this group get no photo'}`);
}
log('  prices:');
for (const [metal, [code, , karat]] of METALS) {
  if (!missingMaterials.includes(metal)) continue;
  log(`     ${metal.padEnd(20)} ${skuPrefix}-${code.padEnd(8)} £${priceFor(karat)}`);
}

if (nothingToDo) process.exit(0);
if (!photos.length && !needMedia.length) { console.error('\nNo photos found in that folder.'); process.exit(1); }
if (!apply) { log('\nPreview only. Re-run with --apply.'); process.exit(0); }

// 1. the option value
if (!optionValueExists) {
  await gql(
    cfg,
    `mutation($productId: ID!, $option: OptionUpdateInput!, $add: [OptionValueCreateInput!]) {
      productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $add, variantStrategy: LEAVE_AS_IS) {
        product { options { name optionValues { name } } }
        userErrors { field message }
      }
    }`,
    { productId: product.id, option: { id: shapeOption.id }, add: [{ name: shape }] },
    'productOptionUpdate'
  );
  log(`\n  added the shape value "${shape}"`);
}

// 2. the photos
const uploaded = [];
for (const p of newPhotos) {
  const url = await uploadImage(cfg, join(dir, p.file), p.file, 'image/png');
  if (!url) { console.error(`  ! could not upload ${p.file}`); continue; }
  const alt = `#Jewelry material_${shape} ${p.group}`;
  const res = await gql(
    cfg,
    `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id status } }
        mediaUserErrors { field message }
      }
    }`,
    { productId: product.id, media: [{ originalSource: url, alt, mediaContentType: 'IMAGE' }] },
    'productCreateMedia'
  );
  const node = res.productCreateMedia.media[0];
  uploaded.push({ ...p, id: node.id, alt });
}
log(`  uploaded ${uploaded.length} photo(s)`);

// Shopify processes images asynchronously; a variant cannot point at one until it is READY.
const pending = new Set(uploaded.map((u) => u.id));
for (let i = 0; i < 40 && pending.size; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await gql(cfg, `query($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { id status } } }`, { ids: [...pending] });
  for (const n of res.nodes) {
    if (n.status === 'READY') pending.delete(n.id);
    if (n.status === 'FAILED') { console.error(`  ! Shopify could not process ${n.id}`); pending.delete(n.id); }
  }
}
log('  photos ready');

// 3. the variants
const frontOf = new Map();
// Front views this run uploaded, plus any an earlier run already put on the product.
for (const m of product.media.nodes) {
  const file = (m.image?.url || '').split('/').pop().split('?')[0];
  const hit = baseName(m.image?.url).match(/-([ywr])1\./i);
  if (hit && (m.alt || '').toLowerCase().startsWith(`#jewelry material_${shape.toLowerCase()} `)) {
    frontOf.set(LETTER_GROUP[hit[1].toUpperCase()], m.id);
  }
}
for (const u of uploaded) if (u.view === 1) frontOf.set(u.group, u.id);

// Variants an earlier run left without a photo: point each at its group's front view.
const appends = [];
for (const v of needMedia) {
  const group = METALS.get(materialOf(v))?.[1];
  const mediaId = group && frontOf.get(group);
  if (mediaId) appends.push({ variantId: v.id, mediaIds: [mediaId] });
}
if (appends.length) {
  await gql(
    cfg,
    `mutation($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    { productId: product.id, variantMedia: appends },
    'productVariantAppendMedia'
  );
  log(`  gave ${appends.length} existing variant(s) their front view`);
}

const variants = missingMaterials.map((metal) => {
  const [code, group, karat] = METALS.get(metal);
  const input = {
    optionValues: [
      { optionName: shapeOption.name, name: shape },
      { optionName: materialOption.name, name: metal },
    ],
    price: priceFor(karat),
    taxable: template?.taxable ?? true,
    inventoryPolicy: template?.inventoryPolicy ?? 'CONTINUE',
    inventoryItem: {
      sku: `${skuPrefix}-${code}`,
      tracked: template?.inventoryItem?.tracked ?? false,
      requiresShipping: template?.inventoryItem?.requiresShipping ?? true,
    },
  };
  const w = template?.inventoryItem?.measurement?.weight;
  if (w) input.inventoryItem.measurement = { weight: { value: w.value, unit: w.unit } };
  const mediaId = frontOf.get(group);
  if (mediaId) input.mediaId = mediaId;
  return input;
});

if (variants.length) {
  const made = await gql(
    cfg,
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
        productVariants { id sku title }
        userErrors { field message }
      }
    }`,
    { productId: product.id, variants },
    'productVariantsBulkCreate'
  );
  log(`  created ${made.productVariantsBulkCreate.productVariants.length} variant(s)`);
}

// 4. the tag the shape collections are built from
const tag = `Shape:${shape}`;
if (!product.tags.includes(tag)) {
  await gql(
    cfg,
    `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: product.id, tags: [tag] },
    'tagsAdd'
  );
  log(`  tagged ${tag}`);
}

log('\nDone.');
