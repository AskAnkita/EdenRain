#!/usr/bin/env node
// Gives every product the tags the theme browses by, worked out from its title, its existing
// tags and its option values. The rules live in tag-rules.mjs.
//
//   node scripts/shopify/tag-products.mjs                       preview only, changes nothing
//   node scripts/shopify/tag-products.mjs --apply               add the tags
//   node scripts/shopify/tag-products.mjs --only=shape,metal    just those namespaces
//   node scripts/shopify/tag-products.mjs --handle=round-stud-earrings-3mm   one product
//   node scripts/shopify/tag-products.mjs --verbose             list every product, not a summary
//   node scripts/shopify/tag-products.mjs --undo --apply        remove the tags it added
//
// Why: 294 of the store's 304 products carried no shape, category or metal tag. Every automated
// collection built on those tags was therefore empty, the Shape and Metal groups in the collection
// filter drawer had nothing to filter, and the mega menu's "Studs", "Hoops" and "Round" tiles
// pointed at collections that did not exist. Tagging is what makes all three work at once.
//
// Only ever ADDS tags (`tagsAdd`), so nothing a human set by hand is lost. Before the first write
// the current tags of every product are saved to scripts/shopify/backups/, and `--undo` removes
// only the five namespaces below — a tag outside them is never touched.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';
import { namespaces } from './tag-rules.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const undo = args.includes('--undo');
const verbose = args.includes('--verbose');
const only = ((args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const oneHandle = (args.find((a) => a.startsWith('--handle=')) || '').split('=')[1] || '';

const cfg = config();
const log = (...m) => console.log(...m);

const chosen = Object.entries(namespaces).filter(([ns]) => only.length === 0 || only.includes(ns));
if (!chosen.length) {
  console.error(`--only must name some of: ${Object.keys(namespaces).join(', ')}`);
  process.exit(1);
}

// ---------- read the catalogue ----------

async function allProducts() {
  const out = [];
  let after = null;
  do {
    const data = await gql(
      cfg,
      `query($after: String, $q: String) {
        products(first: 250, after: $after, query: $q) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title productType tags options { name optionValues { name } } }
        }
      }`,
      { after, q: oneHandle ? `handle:${oneHandle}` : null }
    );
    out.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

// ---------- decide ----------

// Two haystacks per product: the title alone, and the title plus everything else the product
// says about itself. A rule picks which one it reads, because the difference matters — "Colour:
// 18k White Gold" is the only place most of these products mention a metal, while a category
// must not be read off an option value that happens to contain "ring".
function haystacks(product) {
  const title = product.title.toLowerCase();
  const rest = [product.productType || '', ...product.tags, ...product.options.flatMap((o) => o.optionValues.map((v) => v.name))]
    .join(' ')
    .toLowerCase();
  return { title, all: `${title} ${rest}` };
}

function wanted(product) {
  const hay = haystacks(product);
  const tags = [];
  for (const [ns, rules] of chosen) {
    for (const r of rules) {
      const subject = hay[r.from];
      if (r.any.some((p) => p.test(subject)) && !r.not.some((p) => p.test(subject))) tags.push(`${ns}:${r.value}`);
    }
  }
  return tags;
}

const isDerived = (tag) => Object.keys(namespaces).some((ns) => tag.toLowerCase().startsWith(`${ns}:`));

// ---------- write ----------

async function mutate(product, tags, field) {
  await gql(
    cfg,
    `mutation($id: ID!, $tags: [String!]!) { ${field}(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: product.id, tags },
    field
  );
}

// ---------- run ----------

try {
  log(`${apply ? 'Applying to' : 'Preview for'} ${cfg.domain} (API ${cfg.version})${apply ? '' : '. Nothing will change; add --apply to write.'}`);
  const products = await allProducts();
  if (!products.length) throw new Error(oneHandle ? `No product with handle "${oneHandle}"` : 'The store returned no products');
  log(`${products.length} product${products.length === 1 ? '' : 's'}; namespaces: ${chosen.map(([ns]) => ns).join(', ')}`);

  const plan = [];
  for (const p of products) {
    const have = new Set(p.tags.map((t) => t.toLowerCase()));
    if (undo) {
      // Only tags this script's namespaces own, and only the ones the product actually has.
      const remove = p.tags.filter((t) => isDerived(t) && (only.length === 0 || only.includes(t.split(':')[0].toLowerCase())));
      if (remove.length) plan.push({ product: p, tags: remove });
    } else {
      const add = wanted(p).filter((t) => !have.has(t));
      if (add.length) plan.push({ product: p, tags: add });
    }
  }

  const verb = undo ? 'remove' : 'add';
  if (!plan.length) {
    log(`\nNothing to ${verb}; every product already carries the tags these rules give it.`);
    process.exit(0);
  }

  // Summary first: a per-tag count is what tells you whether a collection built on that tag is
  // going to have anything in it.
  const perTag = new Map();
  for (const { tags } of plan) for (const t of tags) perTag.set(t, (perTag.get(t) || 0) + 1);
  log(`\nTags to ${verb} (${plan.length} products, ${[...perTag.values()].reduce((a, b) => a + b, 0)} tags)`);
  for (const [tag, n] of [...perTag].sort((a, b) => a[0].localeCompare(b[0]))) log(`  ${String(n).padStart(4)}  ${tag}`);

  if (verbose) {
    log('');
    for (const { product, tags } of plan) log(`  ${product.title}\n      ${verb === 'add' ? '+' : '-'} ${tags.join(', ')}`);
  } else {
    log(`\n  (${plan.length} products; --verbose lists them)`);
  }

  if (!apply) {
    log(`\nPreview only. Re-run with --apply to ${verb} these tags.`);
    process.exit(0);
  }

  const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `product-tags-before-${undo ? 'undo' : 'tagging'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(products.map(({ id, handle, title, tags }) => ({ id, handle, title, tags })), null, 2));
  log(`\nSaved the current tags of all ${products.length} products to ${file}`);

  let done = 0;
  for (const { product, tags } of plan) {
    await mutate(product, tags, undo ? 'tagsRemove' : 'tagsAdd');
    done++;
    if (done % 25 === 0 || done === plan.length) log(`  ${done}/${plan.length}`);
  }
  log(`\n${done} products updated.`);
  if (!undo) log('Next: node scripts/shopify/setup-store.mjs --apply   (creates the collections these tags fill)');
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
