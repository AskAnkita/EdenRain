#!/usr/bin/env node
// Makes a product bookable by the Apntly appointment app, for a service that is charged for.
//
// Apntly has no theme block: a service in the app is a product in the shop. A service marked
// free in Apntly needs nothing from this script — it is taken on the app's own screens and
// posted straight to its API, with no cart and no order, so its product can stay a hidden Draft
// and should. Only a service with a price goes through the Shopify cart, and there a Draft,
// unpublished, stock-tracked or shippable product kills the booking at the checkout — which is
// all four of the defaults a product made by hand in the admin arrives with.
//
//   node scripts/shopify/make-service-bookable.mjs 15966409916790             report
//   node scripts/shopify/make-service-bookable.mjs 15966409916790 --apply     free, untracked, unshipped
//   node scripts/shopify/make-service-bookable.mjs 15966409916790 --apply --publish   also Active and listed
//
// --publish puts the product on the storefront, where shoppers and search can find it. Without
// it the variant is corrected and the product's visibility is left exactly as it was.

import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
// Visibility is the one change a free service must not have, so it is never implied by --apply.
const publishIt = args.includes('--publish');
const numericId = args.find((a) => /^\d+$/.test(a));
if (!numericId) {
  console.error('Give the numeric product id, e.g. node scripts/shopify/make-service-bookable.mjs 15966409916790');
  process.exit(1);
}

const cfg = config();
const id = `gid://shopify/Product/${numericId}`;
const log = (...m) => console.log(...m);

const data = await gql(
  cfg,
  `query($id: ID!) {
    product(id: $id) {
      id title status
      resourcePublicationsV2(first: 20) { nodes { isPublished publication { name } } }
      variants(first: 1) { nodes { id price taxable inventoryItem { tracked requiresShipping } } }
    }
  }`,
  { id }
);

const product = data.product;
if (!product) throw new Error(`No product with the id ${numericId}.`);
const variant = product.variants.nodes[0];
const published = product.resourcePublicationsV2.nodes.some(
  (n) => n.isPublished && n.publication.name === 'Online Store'
);

const wrong = [];
if (publishIt && product.status !== 'ACTIVE') {
  wrong.push(`status is ${product.status}, not ACTIVE — it cannot be bought`);
}
if (publishIt && !published) wrong.push('not published to the Online Store — it cannot be added to a cart');
if (variant.inventoryItem.tracked) wrong.push('stock is tracked — at 0 it reads as sold out');
if (variant.inventoryItem.requiresShipping) wrong.push('needs shipping — checkout asks for an address');
if (variant.taxable) wrong.push('is taxable — tax on a free appointment');
if (variant.price !== '0.00') wrong.push(`costs ${variant.price}`);

log(`${product.title} (${numericId})`);
if (!publishIt) {
  log(`  status ${product.status}, ${published ? 'published' : 'not published'} — left as it is.`);
  log('  (a free service in Apntly needs neither; pass --publish only for a service you charge for)');
}
if (!wrong.length) {
  log('  nothing to fix; it is already bookable.');
  process.exit(0);
}
for (const problem of wrong) log(`  - ${problem}`);

if (!apply) {
  log('\nReport only. Re-run with --apply to fix these.');
  process.exit(0);
}

if (publishIt && product.status !== 'ACTIVE') {
  await gql(
    cfg,
    `mutation($product: ProductUpdateInput!) {
      productUpdate(product: $product) { product { id status } userErrors { field message } }
    }`,
    { product: { id, status: 'ACTIVE' } },
    'productUpdate'
  );
  log('  set to Active');
}

if (publishIt && !published) {
  const pubs = await gql(cfg, `{ publications(first: 50) { nodes { id name } } }`);
  const online = pubs.publications.nodes.find((p) => p.name === 'Online Store');
  if (!online) throw new Error('This store has no Online Store sales channel.');
  await gql(
    cfg,
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) { userErrors { field message } }
    }`,
    { id, input: [{ publicationId: online.id }] },
    'publishablePublish'
  );
  log('  published to the Online Store');
}

await gql(
  cfg,
  `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }`,
  {
    productId: id,
    variants: [
      {
        id: variant.id,
        price: '0.00',
        taxable: false,
        inventoryItem: { tracked: false, requiresShipping: false },
      },
    ],
  },
  'productVariantsBulkUpdate'
);
log('  variant set to free, untracked, untaxed, no shipping');
log('\nNow add it as a service in Apntly, and paste the id into the matching "Way to meet" block.');
