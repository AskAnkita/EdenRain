#!/usr/bin/env node
// Removes blogs the store carries but nothing writes to, and tidies the links left pointing at
// them. An empty blog is a live page that says "no posts yet" - a dead end for a visitor and a
// thin page for search engines - and this shop's content lives in pages, not posts.
//
//   node scripts/shopify/remove-empty-blogs.mjs                 preview only, deletes nothing
//   node scripts/shopify/remove-empty-blogs.mjs --apply         delete them and fix the links
//   node scripts/shopify/remove-empty-blogs.mjs --keep=news --apply      spare these as well
//   node scripts/shopify/remove-empty-blogs.mjs --drafts --apply         also delete unpublished articles
//
// Only a blog holding zero articles is ever a candidate: one with posts in it is listed and left
// alone, however old they are. A blog the theme links to is also kept, because deleting it would
// turn a live link into a 404 - the preview names any it finds.
//
// Links are followed through after a delete, not left behind: any page whose body links to a blog
// that just went (the Avada SEO app's sitemap pages do) has that list entry removed, so the
// cleanup doesn't trade an empty page for a broken link. URL redirects are untouched - a redirect
// fires on a path that 404s, so /blogs/news/wrist-s keeps working without the blog behind it.
//
// Deleting a blog is permanent. Every blog it is about to delete, every article inside, and the
// original body of every page it is about to edit go to scripts/shopify/backups/ (git-ignored)
// before the first write.

import { config, gql, paginate, themeLinkedHandles, writeBackup } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const drafts = args.includes('--drafts');
const extraKeep = (args.find((a) => a.startsWith('--keep=')) || '').split('=')[1] || '';

const cfg = config();
const log = (...m) => console.log(...m);

const keep = new Set(
  extraKeep
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

// ---------- the store ----------

const allBlogs = () =>
  paginate(
    cfg,
    `query($after: String) {
      blogs(first: 50, after: $after) {
        nodes {
          id
          handle
          title
          templateSuffix
          articles(first: 250) {
            nodes { id handle title isPublished publishedAt body }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    'blogs'
  );

// Pages are fetched whole (body included) so a link to a doomed blog can be found and cut.
const allPages = () =>
  paginate(
    cfg,
    `query($after: String) {
      pages(first: 250, after: $after) {
        nodes { id handle title body }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    'pages'
  );

// Cuts every list entry whose link points into one of the deleted blogs. The sitemap pages these
// come from are one `<li><a href="...">Title</a></li>` per line, so the whole <li> goes rather
// than leaving a bullet with no link in it. Anything that isn't in a list item is reported
// instead of edited - a link inside a sentence needs a human to rewrite the sentence.
function blogLinkStripper(handles) {
  const pattern = handles.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const inListItem = new RegExp(`[ \\t]*<li\\b[^>]*>(?:(?!</li>).)*?/blogs/(?:${pattern})(?:[/?#][^"']*)?["'](?:(?!</li>).)*?</li>\\s*`, 'gis');
  const anyLink = new RegExp(`/blogs/(?:${pattern})(?:[/?#]|["'<\\s]|$)`, 'i');
  return (body) => {
    const cleaned = body.replace(inListItem, '');
    return { cleaned, changed: cleaned !== body, leftover: anyLink.test(cleaned) };
  };
}

// ---------- run ----------

async function main() {
  log(apply ? 'Removing empty blogs...\n' : 'Preview only - nothing will be changed. Add --apply to write.\n');

  const blogs = await allBlogs();
  const themeLinked = themeLinkedHandles(cfg, 'blogs');

  const doomed = [];
  const kept = [];
  for (const b of blogs) {
    const count = b.articles.nodes.length;
    const reason = count > 0 ? `${count} article${count === 1 ? '' : 's'}` : keep.has(b.handle.toLowerCase()) ? '--keep' : themeLinked.has(b.handle.toLowerCase()) ? 'the theme links to it' : null;
    if (reason) kept.push({ ...b, reason, count });
    else doomed.push(b);
  }

  log(`${blogs.length} blog${blogs.length === 1 ? '' : 's'} in the store.\n`);

  if (kept.length) {
    log('Keeping:');
    for (const b of kept) log(`  = /blogs/${b.handle}  (${b.reason})`);
    log('');
  }

  if (!doomed.length) {
    log('No empty blogs to remove.');
  } else {
    log(`Deleting ${doomed.length} empty blog${doomed.length === 1 ? '' : 's'}:`);
    for (const b of doomed) log(`  - /blogs/${b.handle}  "${b.title}"`);
    log('');
  }

  // Unpublished articles, in the blogs that are staying. They 404 for a visitor who has the URL,
  // so they are worth naming even when nothing is deleted.
  const draftArticles = kept.flatMap((b) => b.articles.nodes.filter((a) => !a.isPublished).map((a) => ({ blog: b, article: a })));
  if (draftArticles.length) {
    log(`${draftArticles.length} unpublished article${draftArticles.length === 1 ? '' : 's'} (a visitor with the URL gets a 404):`);
    for (const { blog, article } of draftArticles) {
      log(`  ${drafts ? '-' : '!'} /blogs/${blog.handle}/${article.handle}  "${article.title}"`);
    }
    log(drafts ? '  (--drafts: these will be deleted)' : '  Pass --drafts to delete them, or publish them in the admin.\n');
  }

  // Pages linking at a blog that is about to go.
  const doomedHandles = doomed.map((b) => b.handle);
  const pageEdits = [];
  if (doomedHandles.length) {
    const stripBlogLinks = blogLinkStripper(doomedHandles);
    for (const p of await allPages()) {
      if (!p.body) continue;
      const { cleaned, changed, leftover } = stripBlogLinks(p.body);
      if (changed || leftover) pageEdits.push({ page: p, cleaned, changed, leftover });
    }
    if (pageEdits.length) {
      log(`\n${pageEdits.length} page${pageEdits.length === 1 ? '' : 's'} link to a blog being deleted:`);
      for (const e of pageEdits) {
        log(`  ${e.changed ? '-' : '!'} /pages/${e.page.handle}  ${e.changed ? 'removing the list entries' : ''}${e.leftover ? '(a link remains outside a list item - fix this one by hand)' : ''}`);
      }
      log('');
    }
  }

  if (!apply) {
    log('\nNothing was changed. Re-run with --apply to do it.');
    return;
  }
  if (!doomed.length && !(drafts && draftArticles.length)) return;

  // ---------- back up, then write ----------

  const file = writeBackup(cfg, 'blogs-before-remove', {
    deletedBlogs: doomed,
    deletedArticles: drafts ? draftArticles.map(({ blog, article }) => ({ blogHandle: blog.handle, ...article })) : [],
    editedPages: pageEdits.filter((e) => e.changed).map((e) => ({ id: e.page.id, handle: e.page.handle, bodyBefore: e.page.body })),
    keptBlogs: kept.map((b) => ({ handle: b.handle, title: b.title, reason: b.reason, articles: b.count })),
  });
  log(`Backed up to ${file}\n`);

  for (const b of doomed) {
    await gql(
      cfg,
      `mutation($id: ID!) { blogDelete(id: $id) { deletedBlogId userErrors { field message } } }`,
      { id: b.id },
      'blogDelete'
    );
    log(`  - deleted /blogs/${b.handle}`);
  }

  if (drafts) {
    for (const { blog, article } of draftArticles) {
      await gql(
        cfg,
        `mutation($id: ID!) { articleDelete(id: $id) { deletedArticleId userErrors { field message } } }`,
        { id: article.id },
        'articleDelete'
      );
      log(`  - deleted /blogs/${blog.handle}/${article.handle}`);
    }
  }

  for (const e of pageEdits.filter((x) => x.changed)) {
    await gql(
      cfg,
      `mutation($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) { page { handle } userErrors { field message } }
      }`,
      { id: e.page.id, page: { body: e.cleaned } },
      'pageUpdate'
    );
    log(`  ~ tidied the links on /pages/${e.page.handle}`);
  }

  log('\nDone.');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
