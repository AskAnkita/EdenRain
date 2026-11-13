#!/usr/bin/env node
// Gives every collection a card image taken from one of its own products, so the collections
// page, the menu panels and the collection cards show a photograph that belongs to the
// collection instead of whatever product happens to sort first (or Shopify's grey placeholder).
//
//   node scripts/shopify/set-collection-card-images.mjs                 preview, writes nothing
//   node scripts/shopify/set-collection-card-images.mjs --apply         set images where there is none
//   node scripts/shopify/set-collection-card-images.mjs --apply --force also replace existing images
//   node scripts/shopify/set-collection-card-images.mjs --handles=rings,earrings --apply
//   node scripts/shopify/set-collection-card-images.mjs --clear --apply
//       the other direction: take the image off every collection, so the collection page shows
//       no banner and the cards fall back to a product photo. Nothing else is touched.
//
// Picking the photo
//   The first product in a collection is rarely the one that explains it: the Round Shape
//   collection's first product can easily be a marquise bracelet that also carries a round
//   accent. So each candidate is scored against the words that define the collection — the
//   value side of its automated rules (shape:radiant -> "radiant"), or the distinctive words
//   of its title for a manual one — and a title naming a different diamond shape is marked
//   down. Products published to the Online Store win ties, because an unpublished product's
//   photo is not one a shopper can reach.
//
// Collections with no products are skipped: there is nothing of their own to show, and the
// collections page leaves them out anyway (see sections/main-list-collections.liquid).

import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const clear = args.includes('--clear');
const only = ((args.find((a) => a.startsWith('--handles=')) || '').split('=')[1] || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const cfg = config();
const log = (...m) => console.log(...m);

const SHAPES = [
  'round', 'oval', 'pear', 'emerald', 'radiant', 'cushion',
  'princess', 'asscher', 'marquise', 'heart', 'baguette', 'trillion',
];

// Words that every second product carries, so they say nothing about which photo fits.
const STOPWORDS = new Set([
  'the', 'and', 'jewellery', 'jewelry', 'shape', 'cut', 'lab', 'grown', 'diamond', 'diamonds',
  'ring', 'rings', 'band', 'bands', 'necklace', 'necklaces', 'bracelet', 'bracelets',
  'earring', 'earrings', 'all', 'products', 'new', 'shop', 'by',
]);

async function allCollections() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(
      cfg,
      `query($cursor: String) {
        collections(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title
            image { url }
            productsCount { count }
            ruleSet { rules { column relation condition } }
          }
        }
      }`,
      { cursor }
    );
    out.push(...data.collections.nodes);
    if (!data.collections.pageInfo.hasNextPage) return out;
    cursor = data.collections.pageInfo.endCursor;
  }
}

// What this collection is about, in words that can appear in a product title.
function keywordsFor(collection) {
  const rules = collection.ruleSet?.rules || [];
  const fromRules = rules
    .filter((r) => r.column === 'TAG' && r.relation === 'EQUALS')
    .map((r) => (r.condition.includes(':') ? r.condition.split(':').pop() : r.condition))
    .map((w) => w.replace(/-/g, ' ').toLowerCase().trim())
    .filter((w) => w && w !== 'engagement ring');
  if (fromRules.length) return [...new Set(fromRules)];

  return [
    ...new Set(
      collection.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    ),
  ];
}

function score(title, keywords) {
  const t = title.toLowerCase();
  let points = 0;
  for (const keyword of keywords) if (t.includes(keyword)) points += 3;
  const target = keywords.filter((k) => SHAPES.includes(k));
  if (target.length) {
    for (const shape of SHAPES) if (!target.includes(shape) && t.includes(shape)) points -= 1;
  }
  return points;
}

// The front-on render of one shape from a product that sells several, yellow gold for
// preference so the cards stay of a piece with the ones taken from single-shape products.
async function shapeRender(productTitle, shape) {
  const data = await gql(
    cfg,
    `query($q: String!) {
      products(first: 1, query: $q) {
        nodes { media(first: 250) { nodes { ... on MediaImage { image { url altText } } } } }
      }
    }`,
    { q: `title:'${productTitle.replace(/'/g, "")}'` }
  );
  const images = (data.products.nodes[0]?.media?.nodes || [])
    .map((m) => m.image)
    .filter((i) => i?.url && (i.altText || '').toLowerCase().includes(shape));
  if (!images.length) return null;
  const yellow = images.find((i) => {
    const alt = i.altText.toLowerCase();
    return !alt.includes('white') && !alt.includes('rose');
  });
  return (yellow || images[0]).url;
}

async function donorImage(collection) {
  const data = await gql(
    cfg,
    `query($id: ID!) {
      collection(id: $id) {
        products(first: 60) {
          nodes {
            title
            status
            featuredImage { url }
            resourcePublicationsV2(first: 20) { nodes { isPublished publication { name } } }
          }
        }
      }
    }`,
    { id: collection.id }
  );

  const isLive = (p) =>
    (p.resourcePublicationsV2?.nodes || []).some((n) => n.isPublished && n.publication.name === 'Online Store');

  const keywords = keywordsFor(collection);
  const candidates = (data.collection?.products?.nodes || [])
    .filter((p) => p.featuredImage?.url && p.status === 'ACTIVE')
    .map((p, index) => ({ ...p, live: isLive(p), points: score(p.title, keywords), index }));
  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => b.points - a.points || Number(b.live) - Number(a.live) || a.index - b.index
  );
  const pick = candidates[0];
  const result = { url: pick.featuredImage.url, from: pick.title, live: pick.live, matched: pick.points > 0, note: '' };

  // A merged shape product carries one product title and a render for every shape it sells, so
  // its featured image is whichever shape came first. The shape is in each render's alt text
  // ("#Jewelry material_Radiant Gold"), so a shape collection takes the matching render instead.
  const shape = keywords.find((k) => SHAPES.includes(k));
  if (shape && !pick.title.toLowerCase().includes(shape)) {
    const render = await shapeRender(pick.title, shape);
    if (render) {
      result.url = render;
      result.matched = true;
      result.note = ` (${shape} render)`;
    }
  }
  return result;
}

try {
  const collections = (await allCollections())
    .filter((c) => (only.length ? only.includes(c.handle) : true))
    .sort((a, b) => a.title.localeCompare(b.title));

  log(
    `${apply ? (clear ? 'Clearing' : 'Setting') : 'Preview of'} collection card images on ${cfg.domain}` +
      `${apply ? '' : '. Nothing will change; add --apply to write.'}\n`
  );

  if (clear) {
    let cleared = 0;
    for (const c of collections) {
      if (!c.image) continue;
      if (!apply) {
        log(`  - ${c.handle}: would clear its image`);
        cleared++;
        continue;
      }
      await gql(
        cfg,
        `mutation($input: CollectionInput!) {
          collectionUpdate(input: $input) { collection { id } userErrors { field message } }
        }`,
        { input: { id: c.id, image: null } },
        'collectionUpdate'
      );
      log(`  - ${c.handle}: image cleared`);
      cleared++;
    }
    log(`\nDone. ${cleared} ${apply ? 'cleared' : 'to clear'}.`);
    process.exit(0);
  }

  let set = 0;
  let skipped = 0;
  for (const c of collections) {
    if (c.productsCount.count === 0) {
      log(`  . ${c.handle}: no products, nothing of its own to show`);
      skipped++;
      continue;
    }
    if (c.image && !force) {
      log(`  = ${c.handle}: already has an image (use --force to replace it)`);
      skipped++;
      continue;
    }
    const donor = await donorImage(c);
    if (!donor) {
      log(`  ! ${c.handle}: none of its products has a picture`);
      skipped++;
      continue;
    }
    const note =
      `${donor.note}` +
      `${donor.matched ? '' : ' (no title match, took the first product)'}` +
      `${donor.live ? '' : ' (unpublished product)'}`;
    if (!apply) {
      log(`  + ${c.handle}: would use the photo from "${donor.from}"${note}`);
      set++;
      continue;
    }
    await gql(
      cfg,
      `mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) { collection { id } userErrors { field message } }
      }`,
      { input: { id: c.id, image: { src: donor.url, altText: c.title } } },
      'collectionUpdate'
    );
    log(`  + ${c.handle}: image set from "${donor.from}"${note}`);
    set++;
  }

  log(`\nDone. ${set} ${apply ? 'set' : 'to set'}, ${skipped} left alone.`);
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
