#!/usr/bin/env node
// Puts a menu back from a backup saved by setup-store.mjs (scripts/shopify/backups/).
//
//   node scripts/shopify/restore-menu.mjs                 preview the newest main-menu backup
//   node scripts/shopify/restore-menu.mjs --apply         restore it
//   node scripts/shopify/restore-menu.mjs path/to/backup.json --apply
//   node scripts/shopify/restore-menu.mjs --to=category --apply
//       copies the backed-up menu into another menu (here "category", used by the footer's
//       Category column) and leaves main-menu as it is; the target menu is created if missing
//
// The menu as it is now is saved as a new backup first, so a restore can itself be undone.

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const target = (args.find((a) => a.startsWith('--to=')) || '').split('=')[1] || '';
const cfg = config();
const backupDir = resolve(cfg.repoRoot, 'scripts/shopify/backups');

function pickBackup() {
  const explicit = args.find((a) => !a.startsWith('--'));
  if (explicit) return resolve(explicit);
  if (!existsSync(backupDir)) return null;
  const files = readdirSync(backupDir)
    .filter((f) => /^main-menu-\d.*\.json$/.test(f)) // skip the "before-restore" copies
    .sort();
  return files.length ? resolve(backupDir, files[0]) : null; // oldest = the menu before any script run
}

// Backup items (as read from the API) -> MenuItemUpdateInput; ids are dropped so items are recreated.
function toInput(item) {
  const out = { title: item.title, type: item.type };
  if (item.resourceId) out.resourceId = item.resourceId;
  else if (item.url) out.url = item.url;
  out.items = (item.items || []).map(toInput);
  return out;
}

function printTree(items, depth = 1) {
  for (const i of items) {
    log(`${'  '.repeat(depth)}- ${i.title}  (${i.type.toLowerCase()}${i.url && !i.resourceId ? ` ${i.url}` : ''})`);
    printTree(i.items || [], depth + 1);
  }
}

const log = (...m) => console.log(...m);

try {
  const file = pickBackup();
  if (!file || !existsSync(file)) {
    console.error(`No backup found in ${backupDir}. Pass the backup file's path.`);
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  const handle = target || backup.handle;
  const title = target ? target.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : backup.title;
  log(`${apply ? 'Writing' : 'Preview of'} the "${backup.handle}" backup into menu "${handle}" (from ${file})`);
  printTree(backup.items);

  const data = await gql(cfg, `{ menus(first: 50) { nodes { id handle title items { id title type url resourceId items { id title type url resourceId items { id title type url resourceId } } } } } }`);
  const current = data.menus.nodes.find((m) => m.handle === handle);
  if (!current && !target) throw new Error(`The store has no menu with handle "${handle}".`);

  if (!apply) {
    log(current
      ? `\nWould replace the current ${current.items.length}-item "${handle}" menu with these ${backup.items.length} items. Add --apply to write.`
      : `\nWould create a "${handle}" menu with these ${backup.items.length} items. Add --apply to write.`);
    process.exit(0);
  }

  const items = backup.items.map(toInput);
  if (current) {
    mkdirSync(backupDir, { recursive: true });
    const before = resolve(backupDir, `${handle}-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(before, JSON.stringify(current, null, 2));
    log(`\nSaved the current "${handle}" menu to ${before}`);
    await gql(
      cfg,
      `mutation($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
      }`,
      { id: current.id, title: current.title, handle, items },
      'menuUpdate'
    );
    log(`Menu "${handle}" updated.`);
  } else {
    await gql(
      cfg,
      `mutation($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
      }`,
      { title, handle, items },
      'menuCreate'
    );
    log(`Menu "${handle}" created.`);
  }
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
