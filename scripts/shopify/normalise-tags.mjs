#!/usr/bin/env node
// Folds the capitalised namespace tags the C&B import brought in down to the store's own
// lowercase, hyphenated spelling: `Shape:Oval` becomes `shape:oval`, `Type:Engagement Ring`
// becomes `type:engagement-ring`, `Style:Pavé` becomes `style:pave`.
//
//   node scripts/shopify/normalise-tags.mjs                  preview only, changes nothing
//   node scripts/shopify/normalise-tags.mjs --apply          rewrite the tags
//   node scripts/shopify/normalise-tags.mjs --verbose        list every product, not a summary
//   node scripts/shopify/normalise-tags.mjs --handle=<x>     one product
//   node scripts/shopify/normalise-tags.mjs --apply --from=<backup.json>
//       works out what the tags in that file should be and makes the products match, rather
//       than reading the tags off the shop. Use it to finish a run that went wrong.
//   node scripts/shopify/normalise-tags.mjs --undo --apply --from=<backup.json>
//
// REMOVE BEFORE ADD, always. `tagsAdd` de-duplicates case-insensitively, so adding `shape:round`
// to a product that still carries `Shape:Round` does nothing at all - and the `tagsRemove` that
// follows then takes the only copy away, leaving the product with neither. The first run of this
// script on 2026-11-13 added before removing and dropped 383 tags that way; they were put back
// from its own backup with --from.
//
// Why: a storefront tag filter is case-sensitive. The shop carries both spellings - C&B ships
// its products with `Shape:Oval` and `Style:Solitaire` facet tags, and 'import-cb-export.mjs'
// kept them - so the moment the product-tag filter is switched on in Search & Discovery the
// drawer lists `Shape:Oval` and `shape:oval` as two separate options, each holding half the
// pieces. Worse, 383 of the capitalised tags had no lowercase twin at all, so every
// `filter.p.tag=shape:oval` link in the theme and every lowercase value in
// 'snippets/static-filters.liquid' missed those products outright.
//
// Smart collections were never affected: Shopify normalises case in a collection's tag rules,
// which is why shape-oval looked right while the filter links did not.
//
// Only the six namespaces in tag-rules.mjs are touched. A tag with no colon, or one whose
// namespace is not ours - `needs-price`, a merchandising tag someone set by hand - is left
// exactly as it is. Before the first write the current tags of every product are saved to
// scripts/shopify/backups/, and `--undo --from=<that file>` puts them all back.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';
import { namespaces } from './tag-rules.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const undo = args.includes('--undo');
const verbose = args.includes('--verbose');
const oneHandle = (args.find((a) => a.startsWith('--handle=')) || '').split('=')[1] || '';
const fromFile = (args.find((a) => a.startsWith('--from=')) || '').split('=')[1] || '';

const cfg = config();
const log = (...m) => console.log(...m);
const ours = new Set(Object.keys(namespaces));

// The store's spelling: lowercase, accents folded, anything that is not a letter or a digit
// collapsed to a single hyphen. `Style:Pavé` lands on `style:pave`, which is the value
// tag-rules.mjs already derives, and `Type:Engagement Ring` on `type:engagement-ring`.
function handleize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// nil when the tag is not ours to touch, or is already spelled the way we spell it.
function normalised(tag) {
  const i = tag.indexOf(':');
  if (i < 1) return null;
  const ns = tag.slice(0, i).toLowerCase();
  if (!ours.has(ns)) return null;
  const want = `${ns}:${handleize(tag.slice(i + 1))}`;
  return want === tag ? null : want;
}

async function allProducts() {
  const out = [];
  let after = null;
  do {
    const data = await gql(
      cfg,
      `query($after: String, $q: String) {
        products(first: 250, after: $after, query: $q) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title tags }
        }
      }`,
      { after, q: oneHandle ? `handle:${oneHandle}` : null }
    );
    out.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

async function mutate(id, tags, field) {
  if (!tags.length) return;
  await gql(
    cfg,
    `mutation($id: ID!, $tags: [String!]!) { ${field}(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id, tags },
    field
  );
}

// ---------- undo ----------

async function runUndo() {
  if (!fromFile) throw new Error('--undo needs --from=scripts/shopify/backups/<the file this script wrote>');
  const saved = JSON.parse(readFileSync(resolve(cfg.repoRoot, fromFile), 'utf8'));
  const live = await allProducts();
  const byId = new Map(live.map((p) => [p.id, p]));

  const plan = [];
  for (const was of saved) {
    const now = byId.get(was.id);
    if (!now) continue;
    const add = was.tags.filter((t) => !now.tags.includes(t));
    const remove = now.tags.filter((t) => !was.tags.includes(t));
    if (add.length || remove.length) plan.push({ id: was.id, handle: was.handle, add, remove });
  }

  log(`\n${plan.length} products differ from ${fromFile}`);
  if (verbose) for (const p of plan) log(`  ${p.handle}\n    + ${p.add.join(', ') || '-'}\n    - ${p.remove.join(', ') || '-'}`);
  if (!apply) { log('\nPreview only. Re-run with --apply to put them back.'); return; }

  let done = 0;
  for (const p of plan) {
    await mutate(p.id, p.remove, 'tagsRemove');
    await mutate(p.id, p.add, 'tagsAdd');
    if (++done % 25 === 0 || done === plan.length) log(`  ${done}/${plan.length}`);
  }
  log(`\n${done} products put back.`);
}

// ---------- run ----------

try {
  log(`${apply ? 'Applying to' : 'Preview for'} ${cfg.domain} (API ${cfg.version})${apply ? '' : '. Nothing will change; add --apply to write.'}`);

  if (undo) { await runUndo(); process.exit(0); }

  const products = await allProducts();
  log(`${products.length} products; namespaces: ${[...ours].sort().join(', ')}`);

  // Which tag list to work out the answer from. Normally the shop's own, but --from reads it out
  // of a backup, so a run that half-finished can be put right from what was true before it.
  let source = products;
  if (fromFile) {
    const saved = JSON.parse(readFileSync(resolve(cfg.repoRoot, fromFile), 'utf8'));
    const live = new Set(products.map((p) => p.id));
    source = saved.filter((p) => live.has(p.id));
    log(`Reading the tags to fold from ${fromFile} (${source.length} of its ${saved.length} products are still in the shop)`);
  }
  const liveById = new Map(products.map((p) => [p.id, p.tags]));

  const plan = [];
  const folded = new Map();
  for (const entry of source) {
    const here = liveById.get(entry.id) || [];

    // What the product's tags should read once folded: ours respelled, everything else as it is.
    const want = [];
    for (const tag of entry.tags) {
      const fixed = normalised(tag);
      if (fixed) folded.set(`${tag}  ->  ${fixed}`, (folded.get(`${tag}  ->  ${fixed}`) || 0) + 1);
      const keep = fixed || tag;
      if (!want.includes(keep)) want.push(keep);
    }

    // Only ever drop a tag of ours that is spelled wrong - never one of the shop's own that
    // happens to be missing from the file.
    const remove = here.filter((t) => !want.includes(t) && normalised(t));
    const left = new Set(here.filter((t) => !remove.includes(t)).map((t) => t.toLowerCase()));
    const add = want.filter((t) => !left.has(t.toLowerCase()));

    if (remove.length || add.length) plan.push({ product: { id: entry.id, handle: entry.handle }, remove, add });
  }

  if (!plan.length) { log('\nEvery namespace tag is already in the store\'s spelling. Nothing to do.'); process.exit(0); }

  const tagCount = plan.reduce((n, p) => n + p.remove.length, 0);
  const newCount = plan.reduce((n, p) => n + p.add.length, 0);
  log(`\n${plan.length} products: ${tagCount} tags to drop, ${newCount} to add`);
  for (const [line, n] of [...folded.entries()].sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(4)}  ${line}`);
  if (verbose) { log(''); for (const p of plan) log(`  ${p.product.handle}\n    - ${p.remove.join(', ')}\n    + ${p.add.join(', ') || '(all twins already present)'}`); }

  if (!apply) { log('\nPreview only. Re-run with --apply to fold these tags.'); process.exit(0); }

  const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `product-tags-before-normalise-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(products.map(({ id, handle, title, tags }) => ({ id, handle, title, tags })), null, 2));
  log(`\nSaved the current tags of all ${products.length} products to ${file}`);

  let done = 0;
  for (const { product, remove, add } of plan) {
    // Remove before add, never the other way round - see the note at the top of the file.
    await mutate(product.id, remove, 'tagsRemove');
    await mutate(product.id, add, 'tagsAdd');
    if (++done % 25 === 0 || done === plan.length) log(`  ${done}/${plan.length}`);
  }
  log(`\n${done} products updated.`);
  log(`Undo with: node scripts/shopify/normalise-tags.mjs --undo --apply --from=scripts/shopify/backups/${file.split('/').pop()}`);
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
