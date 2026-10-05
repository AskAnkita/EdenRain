#!/usr/bin/env node
// Removes collections the store has but store-config.mjs doesn't describe.
//
//   node scripts/shopify/prune-collections.mjs                     preview only, deletes nothing
//   node scripts/shopify/prune-collections.mjs --apply             delete them
//   node scripts/shopify/prune-collections.mjs --include-theme-links --apply
//       also delete the ones the theme still links to (see below)
//   node scripts/shopify/prune-collections.mjs --keep=sale,archive  spare these as well
//
// Three things are never deleted:
//   - anything listed in store-config.mjs (the MiaDonna-modelled set)
//   - anything the theme links to, because deleting it turns a live link into a 404.
//     `--include-theme-links` overrides this; the preview always names them.
//   - "frontpage", which themes use for the homepage product list
//
// Deleting a collection is permanent. Before anything is removed, the full details of every
// collection it is about to delete — title, handle, rules, product count — are written to
// scripts/shopify/backups/ (git-ignored), so the set can be rebuilt by hand if need be.
// The products themselves are never touched; only the grouping goes.

import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, gql } from './lib.mjs';
import { collections as wantedCollections } from './store-config.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeThemeLinks = args.includes('--include-theme-links');
const extraKeep = (args.find((a) => a.startsWith('--keep=')) || '').split('=')[1] || '';

const cfg = config();
const log = (...m) => console.log(...m);

const ALWAYS_KEEP = ['frontpage'];

// ---------- what the theme links to ----------

// A handle written into the theme is a live link somewhere — a nav item, a section setting, a
// hard-coded href. Scanning the theme folders is cruder than reading the menu, but it also catches
// links the menu doesn't know about, which is exactly what a delete would break.
const THEME_DIRS = ['sections', 'blocks', 'snippets', 'templates', 'config', 'layout', 'locales'];

function themeLinkedHandles() {
  const found = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // folder not in this theme
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (statSync(full).size > 2_000_000) continue;
      const text = readFileSync(full, 'utf8');
      for (const m of text.matchAll(/collections\/([a-z0-9][a-z0-9-]*)/gi)) found.add(m[1].toLowerCase());
    }
  };
  for (const d of THEME_DIRS) walk(resolve(cfg.repoRoot, d));
  found.delete('all'); // /collections/all is built in, not a collection you can delete
  return found;
}

// ---------- the store ----------

async function allCollections() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(
      cfg,
      `query($cursor: String) {
        collections(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title updatedAt
            productsCount { count }
            ruleSet { appliedDisjunctively rules { column relation condition } }
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

async function deleteCollection(id) {
  await gql(
    cfg,
    `mutation($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }`,
    { input: { id } },
    'collectionDelete'
  );
}

// ---------- run ----------

const wanted = new Set(wantedCollections.map((c) => c.handle.toLowerCase()));
const themed = themeLinkedHandles();
const spared = new Set([...ALWAYS_KEEP, ...extraKeep.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)]);

log(`\nStore          ${cfg.domain}`);
log(`store-config   ${wanted.size} collections`);
log(`Theme links    ${themed.size} handles`);
log(`Mode           ${apply ? 'APPLY — collections will be deleted' : 'PREVIEW — nothing will be deleted'}`);

const inStore = await allCollections();
log(`In the store   ${inStore.length} collections\n`);

const keep = [];
const keptForTheme = [];
const remove = [];

for (const c of inStore) {
  const handle = (c.handle || '').toLowerCase();
  if (wanted.has(handle) || spared.has(handle)) keep.push(c);
  else if (themed.has(handle) && !includeThemeLinks) keptForTheme.push(c);
  else remove.push(c);
}

const line = (c) => `  ${c.handle.padEnd(38)} ${String(c.productsCount?.count ?? 0).padStart(4)} products  ${c.ruleSet ? 'automated' : 'manual'}  "${c.title}"`;

if (keptForTheme.length) {
  log(`Kept — not in store-config, but the theme links to them (${keptForTheme.length}):`);
  for (const c of keptForTheme.sort((a, z) => a.handle.localeCompare(z.handle))) log(line(c));
  log('  Deleting these would turn a live link into a 404. Pass --include-theme-links to remove them anyway.\n');
}

if (!remove.length) {
  log(`Nothing to remove. ${keep.length} collection(s) match store-config.\n`);
  process.exit(0);
}

log(`${apply ? 'Deleting' : 'Would delete'} (${remove.length}):`);
for (const c of remove.sort((a, z) => a.handle.localeCompare(z.handle))) log(line(c));

const withProducts = remove.filter((c) => (c.productsCount?.count ?? 0) > 0);
if (withProducts.length) {
  log(`\n  ${withProducts.length} of these still hold products. The products stay in the store; only the grouping goes.`);
}

if (!apply) {
  log(`\nNothing was changed. Re-run with --apply to delete them.\n`);
  process.exit(0);
}

const dir = resolve(cfg.repoRoot, 'scripts', 'shopify', 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(dir, `collections-before-prune-${stamp}.json`);
writeFileSync(backup, JSON.stringify({ store: cfg.domain, deleted: remove }, null, 2));
log(`\nBacked up to ${backup}`);

let done = 0;
for (const c of remove) {
  await deleteCollection(c.id);
  done++;
  log(`  - ${c.handle}`);
}
log(`\nDeleted ${done} collection(s). ${keep.length} kept from store-config, ${keptForTheme.length} kept for theme links.\n`);
