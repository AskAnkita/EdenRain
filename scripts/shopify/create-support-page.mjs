/*
 * Creates /pages/design-support on the "design-support" template.
 *
 * The studio no longer adds a configured ring to the cart - there is no variant
 * and no price Shopify would accept. Its "Contact support" button, the saved
 * design panel and the mobile bar all send a saved design to this page, where
 * sections/design-support.liquid shows it, rebuilds it in 3D from the saved key
 * and sends it to the shop on Shopify's own contact form.
 *
 * templates/page.design-support.json is already written - this creates the page
 * record that points at it. Without it every one of those links is a 404.
 *
 *   node scripts/shopify/create-support-page.mjs            # preview, writes nothing
 *   node scripts/shopify/create-support-page.mjs --apply    # create it
 *
 * Push the theme first (shopify theme push), or the page asks for a template the
 * live theme has not got yet and falls back to the default one - a bare title.
 *
 * Re-running is safe: a page already on that handle is reported and left alone,
 * except that --fix-template puts an existing one back on the right template.
 * That flag is also how /pages/bespoke-jewellery-request - which exists on no
 * template at all, so it renders as a bare title today - can be moved onto this
 * one instead of creating a second page:
 *
 *   SUPPORT_HANDLE=bespoke-jewellery-request \
 *     node scripts/shopify/create-support-page.mjs --fix-template --apply
 *
 * The created page, or the moved page's previous template, is written to
 * backups/ so the change can be found and undone.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const fixTemplate = process.argv.includes('--fix-template');
const log = (...m) => console.log(...m);

const HANDLE = process.env.SUPPORT_HANDLE || 'design-support';
const TEMPLATE = process.env.SUPPORT_TEMPLATE ?? 'design-support';
const TITLE = process.env.SUPPORT_TITLE || 'Design Support';

// Empty on purpose: the template carries the whole page. A body would print
// above the section.
const BODY = '';

const PAGES = `query($cursor:String){ pages(first:100, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle templateSuffix } } }`;
const PAGE_CREATE = `mutation($page: PageCreateInput!) {
  pageCreate(page: $page) { page { id title handle templateSuffix } userErrors { field message } }
}`;
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

  const existing = pages.find((p) => p.handle === HANDLE);

  if (existing) {
    const current = existing.templateSuffix || '';
    if (current === TEMPLATE) {
      log(`/pages/${HANDLE} already exists on template "${TEMPLATE}"; nothing to do.`);
      process.exit(0);
    }
    log(`/pages/${HANDLE} already exists, on template "${current || '(default)'}" rather than "${TEMPLATE}".`);
    if (!fixTemplate) {
      log('Add --fix-template --apply to move it, or delete the page in the admin and re-run.');
      process.exit(0);
    }
    log(`${apply ? 'Applying' : 'Would apply'} 1 change:`);
    log(`  - page: /pages/${HANDLE}  template ${current || '(default)'}  ->  ${TEMPLATE}`);
    if (!apply) {
      log('\nNothing written. Add --apply to write.');
      process.exit(0);
    }

    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const before = resolve(backupDir, `page-${HANDLE}-template-before-${stamp}.json`);
    writeFileSync(before, JSON.stringify(existing, null, 2));
    log(`\nSaved the page's current template to ${before}`);

    await gql(cfg, PAGE_UPDATE, { id: existing.id, page: { templateSuffix: TEMPLATE } }, 'pageUpdate');
    log(`/pages/${HANDLE} -> template "${TEMPLATE}"`);
    log('\nDone.');
    process.exit(0);
  }

  log(`${apply ? 'Creating' : 'Would create'} 1 page:`);
  log(`  - /pages/${HANDLE}  title "${TITLE}"  template "${TEMPLATE}"`);
  if (!apply) {
    log('\nNothing written. Add --apply to write.');
    process.exit(0);
  }

  const d = await gql(
    cfg,
    PAGE_CREATE,
    { page: { title: TITLE, handle: HANDLE, templateSuffix: TEMPLATE, body: BODY, isPublished: true } },
    'pageCreate'
  );

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const record = resolve(backupDir, `page-${HANDLE}-created-${stamp}.json`);
  writeFileSync(record, JSON.stringify(d.pageCreate.page, null, 2));

  log(`Created /pages/${HANDLE} on template "${d.pageCreate.page.templateSuffix}"`);
  log(`Its id is in ${record}, in case you want to delete it again.`);
  log('\nDone.');
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
