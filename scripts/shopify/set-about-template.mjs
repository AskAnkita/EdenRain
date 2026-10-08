/*
 * Puts /pages/about-er on the "about-er" theme template.
 *
 * The About page was rendering through the default page template: a title and one
 * block of rich text at the full width of the browser. templates/page.about-er.json
 * lays the same story out with a hero, a portrait beside the founder's letter, the
 * figures, what we make, how a piece is made and a closing panel - but a template
 * only takes effect once the page itself is pointed at it, which is this.
 *
 *   node scripts/shopify/set-about-template.mjs            # preview, writes nothing
 *   node scripts/shopify/set-about-template.mjs --apply    # write
 *
 * Push the theme first (shopify theme push), or the page will ask for a template
 * the live theme has not got yet.
 *
 * The page's current template is saved to backups/ before anything is written, and
 * putting it back is one --apply away with ABOUT_TEMPLATE set to the old value.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

const PAGE_HANDLE = process.env.ABOUT_HANDLE || 'about-er';
// '' is the default template, which is what the page had before this.
const TEMPLATE = process.env.ABOUT_TEMPLATE ?? 'about-er';

const PAGES = `query($cursor:String){ pages(first:100, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle templateSuffix } } }`;
const PAGE_UPDATE = `mutation($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) { page { id handle templateSuffix } userErrors { field message } }
}`;

try {
  const cfg = await config();

  let cursor = null;
  const pages = [];
  do {
    const d = await gql(cfg, PAGES, { cursor });
    pages.push(...d.pages.nodes);
    cursor = d.pages.pageInfo.hasNextPage ? d.pages.pageInfo.endCursor : null;
  } while (cursor);

  const page = pages.find((p) => p.handle === PAGE_HANDLE);
  if (!page) throw new Error(`No /pages/${PAGE_HANDLE} in this store.`);

  const current = page.templateSuffix || '';
  if (current === TEMPLATE) {
    log(`/pages/${PAGE_HANDLE} is already on template "${TEMPLATE || '(default)'}"; nothing to do.`);
    process.exit(0);
  }

  log(`${apply ? 'Applying' : 'Would apply'} 1 change:`);
  log(`  - page: /pages/${PAGE_HANDLE}  template ${current || '(default)'}  ->  ${TEMPLATE || '(default)'}`);
  if (!apply) { log('\nNothing written. Add --apply to write.'); process.exit(0); }

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const before = resolve(backupDir, `page-${PAGE_HANDLE}-template-before-${stamp}.json`);
  writeFileSync(before, JSON.stringify(page, null, 2));
  log(`\nSaved the page's current template to ${before}`);

  await gql(cfg, PAGE_UPDATE, { id: page.id, page: { templateSuffix: TEMPLATE } }, 'pageUpdate');
  log(`/pages/${PAGE_HANDLE} -> template "${TEMPLATE || '(default)'}"`);
  log('\nDone.');
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
