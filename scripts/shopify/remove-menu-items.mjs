#!/usr/bin/env node
// Removes top-level items from a menu by title, leaving everything else untouched.
//
//   node scripts/shopify/remove-menu-items.mjs "Contact Us" Diamonds           preview
//   node scripts/shopify/remove-menu-items.mjs "Contact Us" Diamonds --apply   write it
//   node scripts/shopify/remove-menu-items.mjs Diamonds --menu=footer --apply
//
// Titles are matched case-insensitively. The whole menu is saved to
// scripts/shopify/backups/ first, so restore-menu.mjs can put it back.

import { config, gql, writeBackup } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const handle = (args.find((a) => a.startsWith('--menu=')) || '').split('=')[1] || 'main-menu';
const titles = args.filter((a) => !a.startsWith('--'));

if (titles.length === 0) {
  console.error('Name at least one item to remove, e.g. node scripts/shopify/remove-menu-items.mjs "Contact Us"');
  process.exit(1);
}

const wanted = titles.map((t) => t.toLowerCase());

// Menu items come back with ids; menuUpdate recreates them from the input, so the ids are dropped.
function toInput(item) {
  const out = { title: item.title, type: item.type };
  if (item.resourceId) out.resourceId = item.resourceId;
  else if (item.url) out.url = item.url;
  out.items = (item.items || []).map(toInput);
  return out;
}

try {
  const cfg = config();
  const data = await gql(
    cfg,
    `{ menus(first: 50) { nodes { id handle title items { id title type url resourceId
         items { id title type url resourceId items { id title type url resourceId } } } } } }`
  );
  const menu = data.menus.nodes.find((m) => m.handle === handle);
  if (!menu) throw new Error(`The store has no menu with handle "${handle}".`);

  const keep = menu.items.filter((i) => !wanted.includes(i.title.toLowerCase()));
  const dropped = menu.items.filter((i) => wanted.includes(i.title.toLowerCase()));
  const notFound = wanted.filter((w) => !menu.items.some((i) => i.title.toLowerCase() === w));

  console.log(`Menu "${handle}" (${menu.items.length} top-level items)`);
  for (const i of menu.items) {
    const mark = dropped.includes(i) ? 'remove' : '      ';
    console.log(`  ${mark}  ${i.title}${i.items?.length ? `  (${i.items.length} sub-items)` : ''}`);
  }
  for (const n of notFound) console.log(`\nNo top-level item called "${n}" - nothing to remove for it.`);

  if (dropped.length === 0) {
    console.log('\nNothing to do.');
    process.exit(0);
  }

  if (!apply) {
    console.log(`\nWould leave ${keep.length} items. Add --apply to write.`);
    process.exit(0);
  }

  const backup = writeBackup(cfg, handle, menu);
  console.log(`\nSaved the current menu to ${backup}`);

  await gql(
    cfg,
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
    }`,
    { id: menu.id, title: menu.title, handle, items: keep.map(toInput) },
    'menuUpdate'
  );
  console.log(`Removed ${dropped.map((i) => `"${i.title}"`).join(' and ')}. Menu "${handle}" now has ${keep.length} items.`);
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
