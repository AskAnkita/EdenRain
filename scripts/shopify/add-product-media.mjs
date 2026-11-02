#!/usr/bin/env node
// Adds a local image to a product's gallery, finding the product by SKU.
//
//   node scripts/shopify/add-product-media.mjs                                     preview
//   node scripts/shopify/add-product-media.mjs --apply                             add it
//   node scripts/shopify/add-product-media.mjs --sku=AJLR257 --image=assets/x.png --alt="#Jewelry material_Cushion Gold" --apply
//   node scripts/shopify/add-product-media.mjs --sku=AJLR137 --image=... --alt=... --include-archived --apply
//
// The defaults add the pear hand shot to the ring it was photographed on. That ring is a donor
// SKU inside a merged product (merge-shape-products.mjs folded the pear AJLR262 into the cushion
// AJLR257 as a second Shape option), so the SKU is what names it, not the handle or the title.
//
// The alt text is Shopify's media grouping, which is how the gallery already decides which photos
// belong to which metal (assets/product-metal-media.js). Giving the hand shot the pear yellow-gold
// group means it appears alongside that variant's packshots and stays out of the way of the others
// -- the ring in the photograph is yellow gold, so it would be wrong anywhere else.
//
// Re-running is safe: a product that already carries an image of the same name is left alone.

import { basename, resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { config, gql, uploadImage } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeArchived = args.includes('--include-archived');
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SKU = flag('sku', 'AJLR262');
// The pose is only ever a source for this upload, so it sits beside the script rather than in
// assets/, which would push it to the theme for nothing.
const IMAGE = flag('image', 'scripts/images/page-sources/pear-ring-hand-skin-tone-pose.png');
const ALT = flag('alt', '#Jewelry material_Pear Gold');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const cfg = config();
const log = (...m) => console.log(...m);

const PRODUCTS = `
  query($q: String!) {
    products(first: 20, query: $q) {
      nodes {
        id
        title
        handle
        status
        variants(first: 100) { nodes { sku } }
        media(first: 100) { nodes { ... on MediaImage { id alt image { url } } } }
      }
    }
  }
`;

try {
  const localPath = resolve(cfg.repoRoot, IMAGE);
  if (!existsSync(localPath)) throw new Error(`No such image: ${IMAGE}`);
  const filename = basename(localPath);
  const mimeType = MIME[extname(filename).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image type: ${filename}`);

  log(`${apply ? 'Adding' : 'Preview of'} ${filename} on ${cfg.domain}${apply ? '' : '. Nothing will change; add --apply to write.'}\n`);

  // Shopify's product search matches a SKU anywhere in the product, so a merged product turns up
  // under every SKU it carries. Archived products turn up too; they have no storefront page, so
  // adding media to them would be work nobody ever sees.
  const data = await gql(cfg, PRODUCTS, { q: `sku:${SKU}*` });
  const candidates = data.products.nodes.filter((p) => p.variants.nodes.some((v) => (v.sku || '').toUpperCase().startsWith(SKU.toUpperCase())));
  // --include-archived is for staging a donor before a merge: the photos go on the archived donor
  // so merge-shape-products.mjs can copy them onto the keeper, where they do get seen.
  const live = includeArchived ? candidates : candidates.filter((p) => p.status === 'ACTIVE');

  if (!candidates.length) throw new Error(`No product has a variant whose SKU starts with ${SKU}`);
  if (!live.length) {
    log(`  ! Every product carrying ${SKU} is ${candidates.map((p) => p.status.toLowerCase()).join('/')}:`);
    for (const p of candidates) log(`      ${p.title} (${p.handle})`);
    throw new Error('Nothing active to add the image to.');
  }
  if (live.length > 1) {
    log('  ! More than one active product carries that SKU; pass a longer --sku=');
    for (const p of live) log(`      ${p.title} (${p.handle})`);
    process.exit(1);
  }

  const product = live[0];
  const skus = product.variants.nodes.filter((v) => (v.sku || '').toUpperCase().startsWith(SKU.toUpperCase()));
  log(`  ${product.title}`);
  log(`    ${product.handle} · ${product.media.nodes.length} images · ${skus.length} variants matching ${SKU}`);
  log(`    adding as "${ALT}"`);

  const already = product.media.nodes.find((m) => (m.image?.url || '').split('/').pop().split('?')[0].startsWith(filename.replace(/\.[^.]+$/, '')));
  if (already) {
    log(`  = Already on this product as ${already.id}; nothing to do.`);
    process.exit(0);
  }

  if (!apply) {
    log('\n  Would upload the file and append it to the gallery. Add --apply to do it.');
    process.exit(0);
  }

  const url = await uploadImage(cfg, localPath, filename, mimeType);
  if (!url) throw new Error(`Could not upload ${filename}`);

  const created = await gql(
    cfg,
    `mutation($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        media { ... on MediaImage { id alt image { url } } }
        mediaUserErrors { field message }
        userErrors { field message }
      }
    }`,
    { id: product.id, media: [{ originalSource: url, alt: ALT, mediaContentType: 'IMAGE' }] },
    'productCreateMedia'
  );

  const errors = created.productCreateMedia?.mediaUserErrors || [];
  if (errors.length) throw new Error(errors.map((e) => `${(e.field || []).join('.')} ${e.message}`.trim()).join('; '));

  const media = created.productCreateMedia?.media?.[0];
  log(`  + Added ${media?.id || 'the image'} to ${product.handle}`);
  log('    It lands at the end of the gallery; drag it where you want it in Admin > Products > Media.');
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
