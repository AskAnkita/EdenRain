// Gives every variant with no photo of its own the photo of a sibling in the same metal.
//
// The PDP filters its gallery by the selected variant's own photo (its "#Jewelry material_…"
// alt names the metal group - see assets/product-metal-media.js). A variant with no photo has no
// group, so the gallery stops filtering and shows every metal at once: pick 925 Sterling Silver
// in 7 in on a tennis bracelet and the rose-gold renders come up first. The importer only gave a
// photo to the first length or size of each metal, so this hits most chains and bracelets.
//
// A sibling is a variant of the same product with the same SKU (same style code + metal +
// colour); failing that, the same values on every option except Length / Size.
//
//   node scripts/shopify/fill-variant-images.mjs            # preview
//   node scripts/shopify/fill-variant-images.mjs --apply

import { config, gql, paginate } from './lib.mjs';

const apply = process.argv.includes('--apply');
const cfg = config();

const products = await paginate(
  cfg,
  `query($cursor: String) { products(first: 3, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes { id handle variants(first: 100) { nodes {
      id sku selectedOptions { name value } media(first: 1) { nodes { id } }
    } } }
  } }`,
  'products'
);

const SIZE_OPTION = /^(length|size|ring size)$/i;
let total = 0;
for (const p of products) {
  const vs = p.variants.nodes;
  const mediaOf = (v) => v.media.nodes[0]?.id;
  const looseKey = (v) =>
    v.selectedOptions.filter((o) => !SIZE_OPTION.test(o.name)).map((o) => o.value).join('|');
  const bySku = new Map();
  const byLoose = new Map();
  for (const v of vs) {
    if (!mediaOf(v)) continue;
    if (v.sku && !bySku.has(v.sku)) bySku.set(v.sku, mediaOf(v));
    if (!byLoose.has(looseKey(v))) byLoose.set(looseKey(v), mediaOf(v));
  }
  const fixes = [];
  for (const v of vs) {
    if (mediaOf(v)) continue;
    const media = (v.sku && bySku.get(v.sku)) || byLoose.get(looseKey(v));
    if (media) fixes.push({ variantId: v.id, mediaIds: [media] });
  }
  if (!fixes.length) continue;
  total += fixes.length;
  console.log(`${p.handle}: ${fixes.length} variant(s) without a photo`);
  if (!apply) continue;
  const res = await gql(
    cfg,
    `mutation($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        userErrors { field message }
      }
    }`,
    { productId: p.id, variantMedia: fixes }
  );
  const errors = res.productVariantAppendMedia.userErrors;
  if (errors.length) console.log('  !', JSON.stringify(errors));
}
console.log(`${total} variant(s) ${apply ? 'given a photo' : 'would be given a photo (preview; --apply to write)'}.`);
