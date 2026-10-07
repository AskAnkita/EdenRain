#!/usr/bin/env node
// Creates the collections and main menu described in store-config.mjs.
//
//   node scripts/shopify/setup-store.mjs                     preview only, changes nothing
//   node scripts/shopify/setup-store.mjs --apply             create missing collections and write the menu
//   node scripts/shopify/setup-store.mjs --apply --only=collections
//   node scripts/shopify/setup-store.mjs --apply --only=menu
//   node scripts/shopify/setup-store.mjs --apply --menu-handle=miadonna-menu
//       writes the menu under another handle instead of replacing main-menu, so the live menu
//       stays as it is until you pick the new one in the theme editor (Header > Menu)
//   node scripts/shopify/setup-store.mjs --apply --update-rules
//       also adds to an existing automated collection any rule store-config.mjs gives it
//   node scripts/shopify/setup-store.mjs --apply --update-rules --convert-manual
//       ...and turns a manual collection with rules in store-config.mjs into an automated one
//
// Existing collections are left untouched unless --update-rules is passed, and even then only
// automated ones: turning a manual collection into an automated one throws away the products
// somebody added to it by hand, because Shopify lets a collection be one or the other, never both.
// Those are reported and skipped unless --convert-manual says otherwise — and the preview names
// each one with how many products it would hand over to the rules first. Before the menu is
// replaced, the current one is saved to scripts/shopify/backups/ (git-ignored).

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';
import { collections, menu } from './store-config.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const updateRules = args.includes('--update-rules');
const convertManual = args.includes('--convert-manual');
const doCollections = !only || only === 'collections';
const doMenu = !only || only === 'menu';
const menuHandle = (args.find((a) => a.startsWith('--menu-handle=')) || '').split('=')[1] || menu.handle;
const menuTitle = menuHandle === menu.handle ? menu.title : `${menu.title} (${menuHandle})`;

const cfg = config();
const log = (...m) => console.log(...m);

// ---------- lookups ----------

async function findCollection(handle) {
  const data = await gql(
    cfg,
    `query($h: String!) {
      collectionByIdentifier(identifier: { handle: $h }) {
        id handle title
        productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
      }
    }`,
    { h: handle }
  );
  return data.collectionByIdentifier;
}

// A config entry's rules, whether it used `rule` (one) or `rules` (several, all of which must
// match). An entry with neither is a manual collection.
const rulesOf = (c) => c.rules || (c.rule ? [c.rule] : []);

const describeRules = (rules) =>
  rules.length ? `automated: products tagged ${rules.map((r) => `"${r.condition}"`).join(' and ')}` : 'manual';

const ruleKey = (r) => `${r.column}|${r.relation}|${r.condition}`.toLowerCase();

// Which of the rules this file asks for the live collection does not already have. Order and
// letter case are not differences worth a write.
//
// Only ever additive: a live collection can carry rules nothing here knows about — the gift-box
// app, for one, adds `TYPE NOT_EQUALS giftbox_ghost_product` to every collection it sees — and
// rewriting the rule set wholesale would quietly drop them and let that ghost product back into
// the shop. So an update keeps what is there and appends what is missing.
const missingRules = (have, want) => {
  const known = new Set(have.map(ruleKey));
  return want.filter((r) => !known.has(ruleKey(r)));
};

async function findPage(handle) {
  const data = await gql(cfg, `query($q: String!) { pages(first: 1, query: $q) { nodes { id handle } } }`, { q: `handle:${handle}` });
  return data.pages.nodes.find((p) => p.handle === handle) || null;
}

async function findBlog(handle) {
  const data = await gql(cfg, `query($q: String!) { blogs(first: 1, query: $q) { nodes { id handle } } }`, { q: `handle:${handle}` });
  return data.blogs.nodes.find((b) => b.handle === handle) || null;
}

async function onlineStorePublicationId() {
  const data = await gql(cfg, `{ publications(first: 50) { nodes { id name } } }`);
  return data.publications.nodes.find((p) => p.name === 'Online Store')?.id || null;
}

// ---------- collections ----------

const collectionIds = new Map();

async function syncCollections() {
  log('\nCollections');
  const publicationId = apply ? await onlineStorePublicationId() : null;
  if (apply && !publicationId) log('  ! No "Online Store" sales channel found; new collections will not be published.');

  let created = 0;
  let updated = 0;
  for (const c of collections) {
    const wantRules = rulesOf(c);
    const kind = describeRules(wantRules);
    const existing = await findCollection(c.handle);
    if (existing) {
      collectionIds.set(c.handle, existing.id);
      const haveRules = existing.ruleSet?.rules || [];
      const missing = wantRules.length ? missingRules(haveRules, wantRules) : [];
      const describeMissing = missing.map((r) => `"${r.condition}"`).join(' and ');

      if (!missing.length) {
        log(`  = ${c.handle} (exists)`);
      } else if (!haveRules.length && !(updateRules && convertManual)) {
        const held = existing.productsCount?.count ?? 0;
        log(`  = ${c.handle} (exists, and is manual with ${held} product${held === 1 ? '' : 's'}; --update-rules --convert-manual would hand it to ${kind})`);
      } else if (!updateRules) {
        log(`  = ${c.handle} (exists; it is missing the rule ${describeMissing}. Pass --update-rules to add it)`);
      } else if (!apply) {
        log(`  ~ ${c.handle}  + rule ${describeMissing}`);
      } else {
        await gql(
          cfg,
          `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
          { input: { id: existing.id, ruleSet: { appliedDisjunctively: false, rules: [...haveRules, ...missing] } } },
          'collectionUpdate'
        );
        updated++;
        log(`  ~ ${c.handle}  + rule ${describeMissing}`);
      }
      continue;
    }

    if (!apply) {
      log(`  + ${c.handle}  "${c.title}"  (${kind})`);
      continue;
    }

    const input = { title: c.title, handle: c.handle };
    if (wantRules.length) input.ruleSet = { appliedDisjunctively: false, rules: wantRules };
    const data = await gql(
      cfg,
      `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
      { input },
      'collectionCreate'
    );
    const id = data.collectionCreate.collection.id;
    collectionIds.set(c.handle, id);

    if (publicationId) {
      await gql(
        cfg,
        `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
        { id, input: [{ publicationId }] },
        'publishablePublish'
      );
    }
    created++;
    log(`  + ${c.handle}  created${publicationId ? ' and published' : ''} (${kind})`);
  }
  if (apply) log(`  ${created} created${updated ? `, ${updated} re-ruled` : ''}`);
}

// ---------- menu ----------

const MENU_ITEM_FIELDS = 'id title type url resourceId';
const MENU_QUERY = `{ menus(first: 50) { nodes { id handle title items { ${MENU_ITEM_FIELDS} items { ${MENU_ITEM_FIELDS} items { ${MENU_ITEM_FIELDS} } } } } } }`;

// Turns a config item into a MenuItemCreateInput (also valid for menuUpdate, where items without an id are new).
async function toMenuInput(item, warnings) {
  const out = { title: item.title };

  if (item.collection) {
    let id = collectionIds.get(item.collection);
    if (!id) {
      const found = await findCollection(item.collection);
      id = found?.id;
      if (id) collectionIds.set(item.collection, id);
    }
    if (id) Object.assign(out, { type: 'COLLECTION', resourceId: id });
    else {
      Object.assign(out, { type: 'HTTP', url: `/collections/${item.collection}` });
      warnings.push(`"${item.title}" links to collection "${item.collection}", which does not exist yet`);
    }
  } else if (item.url === '/collections/all') {
    out.type = 'CATALOG';
  } else if (item.url?.startsWith('/pages/')) {
    const page = await findPage(item.url.slice('/pages/'.length));
    if (page) Object.assign(out, { type: 'PAGE', resourceId: page.id });
    else {
      Object.assign(out, { type: 'HTTP', url: item.url });
      warnings.push(`"${item.title}" links to ${item.url}, which does not exist yet (create the page)`);
    }
  } else if (item.url?.startsWith('/blogs/')) {
    const blog = await findBlog(item.url.slice('/blogs/'.length).split('/')[0]);
    if (blog) Object.assign(out, { type: 'BLOG', resourceId: blog.id });
    else {
      Object.assign(out, { type: 'HTTP', url: item.url });
      warnings.push(`"${item.title}" links to ${item.url}, which does not exist yet (create the blog)`);
    }
  } else {
    Object.assign(out, { type: 'HTTP', url: item.url || '#' });
  }

  out.items = [];
  for (const child of item.items || []) out.items.push(await toMenuInput(child, warnings));
  return out;
}

function printTree(items, depth = 1) {
  for (const i of items) {
    const target = i.resourceId ? i.type.toLowerCase() : i.url || i.type.toLowerCase();
    log(`${'  '.repeat(depth)}- ${i.title}  →  ${target}`);
    printTree(i.items || [], depth + 1);
  }
}

async function syncMenu() {
  log(`\nMenu "${menuHandle}"`);
  const data = await gql(cfg, MENU_QUERY);
  const current = data.menus.nodes.find((m) => m.handle === menuHandle);

  const warnings = [];
  const items = [];
  for (const item of menu.items) items.push(await toMenuInput(item, warnings));

  printTree(items);
  for (const w of warnings) log(`  ! ${w}`);

  if (!apply) {
    log(current ? `  (would replace the current ${current.items.length}-item menu)` : '  (would create this menu)');
    return;
  }

  if (current) {
    const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `${menuHandle}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify(current, null, 2));
    log(`  Saved the current menu to ${file}`);

    await gql(
      cfg,
      `mutation($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
      }`,
      { id: current.id, title: menuTitle, handle: menuHandle, items },
      'menuUpdate'
    );
    log('  Menu updated');
  } else {
    await gql(
      cfg,
      `mutation($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
      }`,
      { title: menuTitle, handle: menuHandle, items },
      'menuCreate'
    );
    log(`  Menu created. Pick "${menuTitle}" in the theme editor under Header > Menu to use it.`);
  }
}

// ---------- run ----------

try {
  log(`${apply ? 'Applying to' : 'Preview for'} ${cfg.domain} (API ${cfg.version})${apply ? '' : '. Nothing will change; add --apply to write.'}`);
  if (doCollections) await syncCollections();
  if (doMenu) await syncMenu();
  log('\nDone.');
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
