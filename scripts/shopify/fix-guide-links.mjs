/*
 * Points the shop's navigation at pages that exist, and puts the guide pages on
 * the "guide" theme template.
 *
 * Three links in the main menu were dead: Learn -> /pages/learn, About ->
 * /pages/about, Design Studio -> /pages/custom-design. None of those pages
 * exist; the real ones are /pages/education-guides, /pages/about-er and
 * /pages/design-your-own. The footer's "Education & Guides" pointed at the blog
 * rather than at the guides hub.
 *
 *   node scripts/shopify/fix-guide-links.mjs            # preview, writes nothing
 *   node scripts/shopify/fix-guide-links.mjs --apply    # write
 *
 * Every menu it touches is saved to backups/ first, and restore-menu.mjs puts
 * one back.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

// The link each dead main-menu entry should have had.
const MENU_URL_FIXES = {
  'Learn': '/pages/education-guides',
  'About': '/pages/about-er',
  'Design Studio': '/pages/design-your-own',
};

// Guide pages that should render through templates/page.guide.json.
const GUIDE_TEMPLATE = 'guide';
const GUIDE_PAGES = ['er-sizing', 'wrist-sizer-guide', 'gemstones', 'jewellery-care'];

const MENU_FIELDS = `id title type url resourceId`;
const MENUS = `{ menus(first:50){ nodes{ id handle title items{ ${MENU_FIELDS} items{ ${MENU_FIELDS} items{ ${MENU_FIELDS} } } } } } }`;
const PAGES = `query($cursor:String){ pages(first:100, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle templateSuffix } } }`;

function toInput(item) {
  const out = { title: item.title, type: item.type };
  if (item.resourceId) out.resourceId = item.resourceId;
  else if (item.url) out.url = item.url;
  out.items = (item.items || []).map(toInput);
  return out;
}

const changes = [];

try {
  const cfg = await config();

  let cursor = null;
  const pages = [];
  do {
    const d = await gql(cfg, PAGES, { cursor });
    pages.push(...d.pages.nodes);
    cursor = d.pages.pageInfo.hasNextPage ? d.pages.pageInfo.endCursor : null;
  } while (cursor);
  const byHandle = new Map(pages.map((p) => [p.handle, p]));

  const hub = byHandle.get('education-guides');
  if (!hub) throw new Error('No /pages/education-guides in this store; create it before running this.');

  const menus = (await gql(cfg, MENUS)).menus.nodes;

  // ---- main menu: three dead HTTP links
  const main = menus.find((m) => m.handle === 'main-menu');
  const mainInput = main.items.map(toInput);
  for (const item of mainInput) {
    const want = MENU_URL_FIXES[item.title];
    if (want && item.url !== want) {
      changes.push(`main-menu: "${item.title}"  ${item.url}  ->  ${want}`);
      item.url = want;
    }
  }

  // ---- footer Help column: send Education & Guides at the hub page, not the blog
  const help = menus.find((m) => m.handle === 'help');
  const helpInput = help.items.map(toInput);
  for (const item of helpInput) {
    if (item.title !== 'Education & Guides') continue;
    if (item.resourceId === hub.id) continue;
    changes.push(`help: "${item.title}"  /blogs/education-guides  ->  /pages/education-guides`);
    delete item.url;
    item.type = 'PAGE';
    item.resourceId = hub.id;
  }

  // ---- guide pages onto the guide template
  const pageFixes = [];
  for (const handle of GUIDE_PAGES) {
    const p = byHandle.get(handle);
    if (!p) { log(`  ! no page /pages/${handle}, skipped`); continue; }
    if (p.templateSuffix === GUIDE_TEMPLATE) continue;
    pageFixes.push(p);
    changes.push(`page: /pages/${handle}  template ${p.templateSuffix || '(default)'}  ->  ${GUIDE_TEMPLATE}`);
  }

  if (!changes.length) { log('Nothing to change; the store already matches.'); process.exit(0); }
  log(`${apply ? 'Applying' : 'Would apply'} ${changes.length} change(s):`);
  for (const c of changes) log('  - ' + c);
  if (!apply) { log('\nNothing written. Add --apply to write.'); process.exit(0); }

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const before = resolve(backupDir, `nav-before-guide-links-${stamp}.json`);
  writeFileSync(before, JSON.stringify({ menus, pages }, null, 2));
  log(`\nSaved the current menus and page templates to ${before}`);

  const UPDATE = `mutation($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { menu { id } userErrors { field message } }
  }`;
  await gql(cfg, UPDATE, { id: main.id, title: main.title, handle: main.handle, items: mainInput }, 'menuUpdate');
  log('main-menu updated.');
  await gql(cfg, UPDATE, { id: help.id, title: help.title, handle: help.handle, items: helpInput }, 'menuUpdate');
  log('help menu updated.');

  const PAGE_UPDATE = `mutation($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) { page { id handle templateSuffix } userErrors { field message } }
  }`;
  for (const p of pageFixes) {
    await gql(cfg, PAGE_UPDATE, { id: p.id, page: { templateSuffix: GUIDE_TEMPLATE } }, 'pageUpdate');
    log(`/pages/${p.handle} -> template "${GUIDE_TEMPLATE}"`);
  }
  log('\nDone.');
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
