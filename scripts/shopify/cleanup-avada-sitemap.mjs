#!/usr/bin/env node
// Deletes the Avada SEO app's HTML sitemap pages.
//
//   node scripts/shopify/cleanup-avada-sitemap.mjs            preview only, deletes nothing
//   node scripts/shopify/cleanup-avada-sitemap.mjs --apply    delete them
//
// Avada generates /pages/avada-sitemap* as ordinary Shopify pages: a frozen snapshot of the
// catalogue at the moment it ran. They are redundant with Shopify's own /sitemap.xml, which is
// generated per request and is always current, and because they are a snapshot they rot - after
// the collection prune they were still linking to 13 collections that no longer exist.
//
// Deleting a page is permanent, so the full record of every page it touches - title, handle,
// template, SEO fields and the whole body HTML - goes to scripts/shopify/backups/ first
// (git-ignored), from which a page can be recreated by hand.
//
// The app itself is not touched. Turn the HTML sitemap feature off in the Avada dashboard or it
// will generate these pages again on its next run; the script prints that reminder.

import { config, gql, paginate, writeBackup } from './lib.mjs';

const apply = process.argv.includes('--apply');
const cfg = config();

// Only the app's own pages. A page someone wrote by hand never matches this.
const isAvadaSitemap = (handle) => /^avada-sitemap(-|$)/.test(handle);

const allPages = () =>
  paginate(
    cfg,
    `query($after: String) {
      pages(first: 250, after: $after) {
        nodes { id handle title isPublished createdAt updatedAt templateSuffix body }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    'pages'
  );

async function liveCollectionHandles() {
  const nodes = await paginate(
    cfg,
    `query($after: String) { collections(first: 250, after: $after) { nodes { handle } pageInfo { hasNextPage endCursor } } }`,
    'collections'
  );
  return new Set(nodes.map((c) => c.handle));
}

// A page linked from the nav would turn into a 404 the moment it is deleted, so the menus are
// checked before anything is removed rather than after.
async function menuLinks() {
  const d = await gql(
    cfg,
    `{ menus(first: 50) { nodes { handle items { title url items { title url items { title url } } } } } }`
  );
  const flat = [];
  const walk = (items, trail) => {
    for (const i of items || []) {
      flat.push({ trail: [...trail, i.title].join(' > '), url: i.url || '' });
      walk(i.items, [...trail, i.title]);
    }
  };
  for (const m of d.menus.nodes) walk(m.items, [m.handle]);
  return flat;
}

const [pages, collections, menu] = await Promise.all([allPages(), liveCollectionHandles(), menuLinks()]);
const targets = pages.filter((p) => isAvadaSitemap(p.handle));

if (!targets.length) {
  console.log('\nNo avada-sitemap pages in the store. Nothing to do.');
  process.exit(0);
}

console.log(`\n${targets.length} Avada sitemap page${targets.length === 1 ? '' : 's'} of ${pages.length} pages in the store\n`);

let deadTotal = 0;
for (const p of targets) {
  const handles = new Set();
  for (const m of (p.body || '').matchAll(/\/collections\/([a-z0-9][a-z0-9-]*)/gi)) handles.add(m[1].toLowerCase());
  handles.delete('all');
  const dead = [...handles].filter((h) => !collections.has(h)).sort();
  deadTotal += dead.length;
  console.log(`  /pages/${p.handle}`);
  console.log(`      "${p.title}"   ${p.isPublished ? 'published' : 'unpublished'}, ${(p.body || '').length} characters, updated ${p.updatedAt.slice(0, 10)}`);
  if (dead.length) console.log(`      ${dead.length} dead collection link${dead.length === 1 ? '' : 's'}: ${dead.join(', ')}`);
}

const linked = menu.filter((i) => targets.some((p) => i.url.includes(`/pages/${p.handle}`)));
console.log(`\n${linked.length ? `${linked.length} menu item(s) link to these pages:` : 'No menu item links to any of them.'}`);
for (const i of linked) console.log(`  ${i.trail}  ->  ${i.url}`);
if (linked.length) {
  console.log('\n  Deleting a page the nav links to turns that nav item into a 404.');
  console.log('  Fix the menu first (restore-menu.mjs / the Navigation admin), then re-run.');
  process.exit(1);
}

console.log(`\n${deadTotal} dead collection link${deadTotal === 1 ? '' : 's'} go away with these pages.`);
console.log('Shopify\'s own /sitemap.xml is unaffected - it is generated per request and stays current.');

if (!apply) {
  console.log('\nNothing deleted. Re-run with --apply to delete.');
  process.exit(0);
}

const backupFile = writeBackup(cfg, 'avada-sitemap-pages', targets);
console.log(`\nFull copy of all ${targets.length} pages, body HTML included, saved to ${backupFile}`);

for (const p of targets) {
  await gql(
    cfg,
    `mutation($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { field message } } }`,
    { id: p.id },
    'pageDelete'
  );
  console.log(`  - /pages/${p.handle}`);
}

console.log(`\nDone. ${targets.length} pages deleted.`);
console.log('\nThese URLs now return 404, which is the right answer for a page removed on purpose:');
console.log('search engines drop them from the index without a redirect, and nothing on the store');
console.log('linked to them. No redirects were created for them.');
console.log('\nOne thing left, and it is not scriptable: open the Avada SEO app and turn the HTML');
console.log('sitemap feature off. While it is on, the app will recreate these pages - stale again.');
