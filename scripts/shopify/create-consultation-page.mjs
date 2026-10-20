/*
 * Creates /pages/book-a-consultation on the "book-a-consultation" template.
 *
 * The page is the one every "Meet a Consultant" and "Talk to a designer" call to action now
 * points at: the header chip (snippets/header-consultant.liquid), the drawer's studio promos,
 * the homepage consultation banner and the design studio hub. templates/page.book-a-consultation.json
 * is already written - this creates the page record that asks for it, without which every one of
 * those buttons is a 404.
 *
 *   node scripts/shopify/create-consultation-page.mjs            # preview, writes nothing
 *   node scripts/shopify/create-consultation-page.mjs --apply    # create it
 *
 * Push the theme first (shopify theme push), or the page asks for a template the live theme has
 * not got yet and falls back to the default one - a bare title.
 *
 * Re-running is safe: a page already on that handle is reported and left alone, except that
 * --fix-template puts an existing one back on the right template and --publish makes a hidden one
 * visible. The created page is written to backups/ so it can be found and deleted again.
 *
 * A page can exist and still 404: one added in the admin and saved as hidden ("Visibility:
 * hidden") has no storefront URL at all, which looks exactly like a missing page. That is what
 * --publish is for, and it is why this reports the visibility of a page it finds.
 *
 * The booking links themselves are not set here. They are settings on the section, because they
 * belong to whoever owns the Cal.com account: Theme editor > Book a consultation > each "Way to
 * meet" > Booking link. Until they are pasted in, the page shows its enquiry panel instead of a
 * diary, which is a working page rather than a broken one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const fixTemplate = process.argv.includes('--fix-template');
const publish = process.argv.includes('--publish');
const log = (...m) => console.log(...m);

const HANDLE = process.env.CONSULTATION_HANDLE || 'book-a-consultation';
const TEMPLATE = process.env.CONSULTATION_TEMPLATE ?? 'book-a-consultation';
const TITLE = process.env.CONSULTATION_TITLE || 'Book a Consultation';

// The body stays empty on purpose: the template carries the whole page. A body would print above it.
const BODY = '';

const PAGES = `query($cursor:String){ pages(first:100, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle templateSuffix isPublished } } }`;
const PAGE_CREATE = `mutation($page: PageCreateInput!) {
  pageCreate(page: $page) { page { id title handle templateSuffix } userErrors { field message } }
}`;
const PAGE_UPDATE = `mutation($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) { page { id handle templateSuffix isPublished } userErrors { field message } }
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
    const wrongTemplate = current !== TEMPLATE;
    const hidden = existing.isPublished === false;

    log(`/pages/${HANDLE} already exists: template "${current || '(default)'}", ${hidden ? 'HIDDEN' : 'visible'}.`);

    const changes = [];
    if (wrongTemplate && fixTemplate) changes.push(['templateSuffix', `template ${current || '(default)'} -> ${TEMPLATE}`]);
    if (hidden && publish) changes.push(['isPublished', 'visibility hidden -> visible']);

    if (!changes.length) {
      if (wrongTemplate) log('Add --fix-template --apply to move it onto the right template.');
      if (hidden) log('It is hidden, so it 404s on the storefront. Add --publish --apply to make it visible.');
      if (!wrongTemplate && !hidden) log('Nothing to do.');
      process.exit(0);
    }

    log(`${apply ? 'Applying' : 'Would apply'} ${changes.length} change${changes.length === 1 ? '' : 's'}:`);
    changes.forEach(([, why]) => log(`  - page: /pages/${HANDLE}  ${why}`));
    if (!apply) { log('\nNothing written. Add --apply to write.'); process.exit(0); }

    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const before = resolve(backupDir, `page-${HANDLE}-before-${stamp}.json`);
    writeFileSync(before, JSON.stringify(existing, null, 2));
    log(`\nSaved the page as it stands to ${before}`);

    const page = {};
    if (changes.some(([field]) => field === 'templateSuffix')) page.templateSuffix = TEMPLATE;
    if (changes.some(([field]) => field === 'isPublished')) page.isPublished = true;

    const d = await gql(cfg, PAGE_UPDATE, { id: existing.id, page }, 'pageUpdate');
    log(`/pages/${HANDLE} -> template "${d.pageUpdate.page.templateSuffix}", ${d.pageUpdate.page.isPublished ? 'visible' : 'hidden'}`);
    log('\nDone.');
    process.exit(0);
  }

  log(`${apply ? 'Creating' : 'Would create'} 1 page:`);
  log(`  - /pages/${HANDLE}  title "${TITLE}"  template "${TEMPLATE}"`);
  if (!apply) { log('\nNothing written. Add --apply to write.'); process.exit(0); }

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
  log('\nNext: Theme editor > Book a consultation > each "Way to meet" > Booking link.');
  log('\nDone.');
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
