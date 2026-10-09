// Keeps the store's URL redirects correct and complete. Two jobs:
//
//   - repair: a redirect whose target is a 404 is worse than no redirect at all - the visitor
//     still loses, and search engines see a 301 into a 404. FIXES below retargets those.
//   - create: a handle the store used to serve and no longer does should 301 to its nearest live
//     page rather than 404. RETIRED below lists those, and a missing one is created.
//
//   node scripts/shopify/fix-redirects.mjs            # preview: every redirect, and what's wrong
//   node scripts/shopify/fix-redirects.mjs --apply    # repair the broken ones, create the missing ones
//
// The target of each redirect is resolved the way the storefront would resolve it - the product,
// collection, page, blog or article behind the handle has to exist - so this keeps catching
// breakage after a product is renamed or a collection is pruned. A redirect that already exists
// is never overwritten by RETIRED: whatever is in the store was put there deliberately.

import { config, gql, paginate, writeBackup } from './lib.mjs';

const apply = process.argv.includes('--apply');

// The repairs. Keyed by the redirect's path, so a redirect is only ever corrected in place -
// nothing is created or deleted. `why` is printed, and is the reason the target was chosen.
// `force: true` is for a target that resolves but points at the wrong thing - a live page that
// isn't the one the visitor wanted - which a 404 check alone can't catch.
const FIXES = {
  '/blogs/news/wrist-s': {
    target: '/pages/wrist-sizer-guide',
    force: true,
    why: 'a sizing guide is reference material, not a dated post: the live guide is the page on the guide template, and the 2021 article of the same handle is the legacy import',
  },
  '/collections/all-necklaces-1': {
    target: '/collections/necklaces',
    why: 'there is no all-necklaces collection; necklaces is the one the menu and homepage link to',
  },
  '/products/gold-solitaire-ring': {
    target: '/collections/solitaire',
    why: 'the product it pointed at no longer exists and no single product replaces it; the solitaire collection is the nearest live page',
  },
};

// Handles the store used to serve and no longer does, each with the live page that now owns the
// intent. These came off the collection prune: the Avada SEO app's HTML sitemap pages were still
// linking to all of them, and so, most likely, is Google's index and anyone's old bookmarks.
// Only created when the path has no redirect at all - an existing one is left alone.
const RETIRED = {
  '/collections/18k-gold': {
    target: '/collections/yellow-gold-jewelry',
    why: '"18k gold" unqualified means yellow gold; the store sells it as Yellow Gold Jewelry (129 products)',
  },
  '/collections/18k-white-gold': {
    target: '/collections/white-gold-jewelry',
    why: 'the same assortment under the name the store uses now',
  },
  '/collections/925-sterling-silver': {
    target: '/collections/sterling-silver-jewelry',
    why: '925 is sterling silver; this is that collection under its current handle',
  },
  '/collections/adjustable': {
    target: '/collections/bracelets',
    why: 'nothing in the catalogue is grouped by adjustability any more, and the adjustable pieces were stacking bracelets; the category page is the nearest intent',
  },
  '/collections/all-bracelets': {
    target: '/collections/bracelets',
    why: 'the "all-" prefix was dropped when the collections were consolidated',
  },
  '/collections/all-earrings': {
    target: '/collections/earrings',
    why: 'the "all-" prefix was dropped when the collections were consolidated',
  },
  '/collections/all-necklaces': {
    target: '/collections/necklaces',
    why: 'the "all-" prefix was dropped when the collections were consolidated; matches the existing all-necklaces-1 redirect',
  },
  '/collections/dangle': {
    target: '/collections/dangles-drops',
    why: 'renamed to Dangles & Drops, same assortment',
  },
  '/collections/ear-cuffs': {
    target: '/collections/climbers-jackets-cuffs',
    why: 'every ear cuff in the catalogue sits in Climbers, Jackets & Cuffs',
  },
  '/collections/new-arrivals': {
    target: '/collections/new-in',
    why: 'New In is the same idea under the handle the store uses now',
  },
  '/collections/tennis': {
    target: '/collections/bracelets',
    why: 'no product is a tennis piece any more; a tennis search is a bracelet search, so the category page is the nearest intent',
  },
  '/collections/trending-now': {
    target: '/collections/best-sellers',
    why: 'Best Sellers is the curated-popularity collection the store kept',
  },
};

const cfg = config();

const allRedirects = () =>
  paginate(
    cfg,
    `query($after: String) {
      urlRedirects(first: 250, after: $after) {
        nodes { id path target }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    'urlRedirects'
  );

// Handles of everything a redirect can point at, fetched once.
async function storefront() {
  const pageNodes = await paginate(
    cfg,
    `query($after: String) { pages(first: 250, after: $after) { nodes { handle } pageInfo { hasNextPage endCursor } } }`,
    'pages'
  );

  // Each blog's articles come from the parent connection, so this is one request for all of them
  // rather than a keyword search per blog. 250 articles per blog is the cap; this shop's content
  // lives in pages, not posts, so no blog is near it.
  const blogsRes = await gql(
    cfg,
    `{ blogs(first: 50) { nodes { handle articles(first: 250) { nodes { handle isPublished } } } } }`
  );
  const blogs = new Map(
    blogsRes.blogs.nodes.map((b) => [b.handle, new Set(b.articles.nodes.filter((a) => a.isPublished).map((a) => a.handle))])
  );

  return { pages: new Set(pageNodes.map((p) => p.handle)), blogs };
}

// Static storefront routes that always resolve, so they are never reported as missing.
const STATIC = new Set(['/', '/collections/all', '/cart', '/search', '/account', '/challenge', '/pages', '/sitemap.xml']);

// A target is resolved once per run: RETIRED checks both the dead path and its destination, and
// several redirects share a destination, so without this the same handle is fetched repeatedly.
const checked = new Map();

async function check(target, store) {
  if (!checked.has(target)) checked.set(target, resolveTarget(target, store));
  return checked.get(target);
}

async function resolveTarget(target, store) {
  if (/^https?:\/\//i.test(target)) return { ok: true, note: 'external' };
  const path = target.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (STATIC.has(path)) return { ok: true };

  let m;
  if ((m = path.match(/^\/products\/([^/]+)$/))) {
    const d = await gql(cfg, `query($h: String!) { productByIdentifier(identifier: {handle: $h}) { status } }`, { h: m[1] });
    const status = d.productByIdentifier?.status;
    if (!status) return { ok: false, note: `no product with the handle "${m[1]}"` };
    if (status !== 'ACTIVE') return { ok: false, note: `the product "${m[1]}" is ${status.toLowerCase()}` };
    return { ok: true };
  }
  if ((m = path.match(/^\/collections\/([^/]+)$/))) {
    const d = await gql(cfg, `query($h: String!) { collectionByIdentifier(identifier: {handle: $h}) { id } }`, { h: m[1] });
    return d.collectionByIdentifier ? { ok: true } : { ok: false, note: `no collection with the handle "${m[1]}"` };
  }
  if ((m = path.match(/^\/pages\/([^/]+)$/))) {
    return store.pages.has(m[1]) ? { ok: true } : { ok: false, note: `no page with the handle "${m[1]}"` };
  }
  if ((m = path.match(/^\/blogs\/([^/]+)(?:\/([^/]+))?$/))) {
    const [, blog, article] = m;
    if (!store.blogs.has(blog)) return { ok: false, note: `no blog with the handle "${blog}"` };
    if (!article) {
      return store.blogs.get(blog).size ? { ok: true } : { ok: false, note: `the blog "${blog}" has no published articles` };
    }
    if (store.blogs.get(blog).has(article)) return { ok: true };
    const elsewhere = [...store.blogs].filter(([, set]) => set.has(article)).map(([h]) => h);
    return {
      ok: false,
      note: elsewhere.length
        ? `"${article}" is not in the "${blog}" blog - it is in "${elsewhere.join('", "')}"`
        : `no published article "${article}" in the "${blog}" blog`,
    };
  }
  return { ok: true, note: 'not a path this script knows how to check' };
}

const [redirects, store] = await Promise.all([allRedirects(), storefront()]);
console.log(`\n${redirects.length} redirect${redirects.length === 1 ? '' : 's'} in the store\n`);

const broken = [];
for (const r of redirects) {
  const result = await check(r.target, store);
  const fix = FIXES[r.path];
  const retarget = fix?.force && fix.target !== r.target;
  const mark = (!result.ok ? '404' : retarget ? 'wrong' : 'ok').padEnd(6);
  console.log(`${mark}${r.path}  ->  ${r.target}${result.note ? `   (${result.note})` : ''}`);

  if (result.ok && !retarget) {
    if (fix && fix.target !== r.target) console.log(`      a fix is listed for this path but the target already resolves; left alone`);
    continue;
  }
  if (!fix) {
    console.log('      no fix listed - add one to FIXES in scripts/shopify/fix-redirects.mjs');
    continue;
  }
  const fixed = await check(fix.target, store);
  if (!fixed.ok) {
    console.log(`      the listed fix ${fix.target} does not resolve either (${fixed.note}); skipping`);
    continue;
  }
  console.log(`      -> ${fix.target}   ${result.ok ? 'retargeted' : 'because'} ${fix.why}`);
  broken.push({ ...r, to: fix.target });
}

// ---------- missing redirects for retired handles ----------

const have = new Set(redirects.map((r) => r.path));
const missing = [];
const retiredCount = Object.keys(RETIRED).length;
console.log(`\n${retiredCount} retired path${retiredCount === 1 ? '' : 's'} listed\n`);
for (const [path, { target, why }] of Object.entries(RETIRED)) {
  if (have.has(path)) {
    console.log(`have  ${path}  ->  already redirected, left alone`);
    continue;
  }
  const live = await check(path, store);
  if (live.ok) {
    console.log(`live  ${path}  ->  still resolves, so it needs no redirect; drop it from RETIRED`);
    continue;
  }
  const dest = await check(target, store);
  if (!dest.ok) {
    console.log(`bad   ${path}  ->  ${target} does not resolve (${dest.note}); skipping`);
    continue;
  }
  console.log(`new   ${path}  ->  ${target}`);
  console.log(`      because ${why}`);
  missing.push({ path, target });
}

// ---------- write ----------

if (!broken.length && !missing.length) {
  console.log(`\nNothing to repair, nothing to create.`);
  process.exit(0);
}

const summary = [
  broken.length ? `${broken.length} redirect${broken.length === 1 ? '' : 's'} to repair` : null,
  missing.length ? `${missing.length} to create` : null,
].filter(Boolean).join(', ');
console.log(`\n${summary}.`);

if (!apply) {
  console.log('Nothing written. Re-run with --apply to write.');
  process.exit(0);
}

const backupFile = writeBackup(cfg, 'redirects', redirects);
console.log(`\nAll redirects as they were saved to ${backupFile}`);

for (const r of broken) {
  await gql(
    cfg,
    `mutation($id: ID!, $redirect: UrlRedirectInput!) {
      urlRedirectUpdate(id: $id, urlRedirect: $redirect) {
        urlRedirect { path target }
        userErrors { field message }
      }
    }`,
    { id: r.id, redirect: { path: r.path, target: r.to } },
    'urlRedirectUpdate'
  );
  console.log(`  ~ ${r.path}  ->  ${r.to}`);
}

for (const r of missing) {
  await gql(
    cfg,
    `mutation($redirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $redirect) {
        urlRedirect { path target }
        userErrors { field message }
      }
    }`,
    { redirect: { path: r.path, target: r.target } },
    'urlRedirectCreate'
  );
  console.log(`  + ${r.path}  ->  ${r.target}`);
}

console.log(`\nDone. ${broken.length} repaired, ${missing.length} created.`);
