#!/usr/bin/env node
// Publishes products to the Online Store sales channel. A product can be Active and still be
// invisible on the storefront if it isn't published to the Online Store channel — the collection
// page then shows "0 products" even though the collection has items in the admin.
//
//   node scripts/shopify/publish-products.mjs                          preview: every Active product that isn't published
//   node scripts/shopify/publish-products.mjs --apply                  publish them
//   node scripts/shopify/publish-products.mjs --collection=engagement-rings --apply
//   node scripts/shopify/publish-products.mjs --include-drafts --apply  also publish Draft products (sets them Active)
//
// Draft products stay drafts unless --include-drafts is given; publishing alone would not make
// them visible, so they are set to Active at the same time.

import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeDrafts = args.includes('--include-drafts');
const collectionHandle = (args.find((a) => a.startsWith('--collection=')) || '').split('=')[1] || null;
const cfg = config();
const log = (...m) => console.log(...m);

async function onlineStorePublicationId() {
  const data = await gql(cfg, `{ publications(first: 50) { nodes { id name } } }`);
  const node = data.publications.nodes.find((p) => p.name === 'Online Store');
  if (!node) throw new Error('This store has no Online Store sales channel.');
  return node.id;
}

const PRODUCT_FIELDS = `
  id title status
  resourcePublicationsV2(first: 20) { nodes { isPublished publication { name } } }
`;

async function productsInCollection(handle) {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      cfg,
      `query($handle: String!, $cursor: String) {
        collectionByHandle(handle: $handle) {
          id
          products(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { ${PRODUCT_FIELDS} }
          }
        }
      }`,
      { handle, cursor }
    );
    const collection = data.collectionByHandle;
    if (!collection) throw new Error(`No collection with the handle "${handle}".`);
    out.push(...collection.products.nodes);
    cursor = collection.products.pageInfo.hasNextPage ? collection.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

async function allProducts() {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      cfg,
      `query($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${PRODUCT_FIELDS} }
        }
      }`,
      { cursor }
    );
    out.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

const isLive = (product) =>
  product.resourcePublicationsV2.nodes.some((n) => n.isPublished && n.publication.name === 'Online Store');

try {
  const publicationId = await onlineStorePublicationId();
  const products = collectionHandle ? await productsInCollection(collectionHandle) : await allProducts();
  const where = collectionHandle ? `collection "${collectionHandle}"` : 'the store';

  const unpublished = products.filter((p) => !isLive(p));
  const drafts = unpublished.filter((p) => p.status === 'DRAFT');
  const todo = includeDrafts ? unpublished : unpublished.filter((p) => p.status === 'ACTIVE');

  log(`${products.length} products in ${where}; ${unpublished.length} not on the Online Store (${drafts.length} of them drafts).`);
  if (!includeDrafts && drafts.length) log(`Leaving ${drafts.length} draft products alone — pass --include-drafts to publish those too.`);
  if (!todo.length) {
    log('Nothing to publish.');
    process.exit(0);
  }

  for (const p of todo) log(`  ${apply ? 'publishing' : 'would publish'} [${p.status}] ${p.title}`);
  if (!apply) {
    log(`\nPreview only. Re-run with --apply to publish these ${todo.length} products.`);
    process.exit(0);
  }

  let published = 0;
  for (const p of todo) {
    if (p.status === 'DRAFT') {
      await gql(
        cfg,
        `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`,
        { input: { id: p.id, status: 'ACTIVE' } },
        'productUpdate'
      );
    }
    await gql(
      cfg,
      `mutation($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: p.id, input: [{ publicationId }] },
      'publishablePublish'
    );
    published++;
  }
  log(`\nPublished ${published} products to the Online Store.`);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
