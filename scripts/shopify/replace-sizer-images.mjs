#!/usr/bin/env node
/*
 * Puts the redrawn printable sizers on the Ring Size Guide and the Wrist Size Guide.
 *
 * The sizers customers print were the 2021 artwork: er-ring-sizer-download.jpg and
 * er-wrist-sizer-download.jpg. Both carried a "Download Finger/Wrist Sizer" button
 * drawn into the picture, which stopped being true the day assets/editorial-downloads.js
 * started adding a real download button under the sizer - so the page showed two,
 * one of them a photograph of a button that does nothing.
 *
 * The replacements in sizer-art/ are the band alone: the ring one is the same
 * cut-out with the A-Z scale and no painted button, the wrist one adds a 12-23cm
 * ruler and the ER monogram.
 *
 * Each guide exists twice in this store - the /pages/* one the menu links to and a
 * 2021 blog article left over from the import - so all four bodies are rewritten
 * together rather than left to drift. Only the <img src> changes; the copy, the
 * link around it and the conversion chart are untouched.
 *
 *   node scripts/shopify/replace-sizer-images.mjs            # preview, writes nothing
 *   node scripts/shopify/replace-sizer-images.mjs --apply    # upload and write
 *
 * Every body it touches is saved to backups/ first. Re-running is a no-op: a file
 * already in Files is reused, and a body already pointing at it is left alone.
 *
 * NOTE: the "click here"/"download the guide" links in the copy still point at the
 * 2021 PDFs (er_Ring_sizer.pdf, ER_watch_sizer-2.pdf), which hold the OLD artwork.
 * Those PDFs have to be redrawn and re-uploaded separately; this script does not
 * touch them.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql, uploadImage, writeBackup } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const artDir = resolve(here, 'sizer-art');
const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

// Each sizer: the new artwork, and the filename of the old one to swap out. The old
// name is matched on the filename alone, so the ?v= cache-buster on the live <img>
// does not have to be known.
const SIZERS = [
  {
    name: 'ring',
    file: 'er-ring-sizer-v3.png',
    replaces: 'er-ring-sizer-download.jpg',
    alt: 'Printable Eden Raine ring sizer, marked A to Z',
    targets: [
      { kind: 'page', handle: 'er-sizing' },
      { kind: 'article', handle: 'ring-sizer-guide', blog: 'education-guides' },
    ],
  },
  {
    name: 'wrist',
    file: 'er-wrist-sizer-v3.png',
    replaces: 'er-wrist-sizer-download.jpg',
    alt: 'Printable Eden Raine wrist sizer, marked 12 to 23 centimetres',
    targets: [
      { kind: 'page', handle: 'wrist-sizer-guide' },
      { kind: 'article', handle: 'wrist-sizer-guide', blog: 'education-guides' },
    ],
  },
];

const cfg = config();

async function fetchTarget(target) {
  if (target.kind === 'page') {
    const data = await gql(cfg, `query($q: String!) { pages(first: 5, query: $q) { nodes { id handle body } } }`, {
      q: `handle:${target.handle}`,
    });
    return data.pages.nodes.find((n) => n.handle === target.handle) || null;
  }
  const data = await gql(
    cfg,
    `query($q: String!) { articles(first: 25, query: $q) { nodes { id handle body blog { handle } } } }`,
    { q: `handle:${target.handle}` }
  );
  return data.articles.nodes.find((n) => n.handle === target.handle && n.blog.handle === target.blog) || null;
}

// Rewrites the <img> whose src names the old file: the URL is swapped and the empty
// alt="" replaced with one that describes the sizer. Other images in the body (the
// featured photograph at the top) are left exactly as they are.
function swapImage(body, oldName, newUrl, alt) {
  let changed = 0;
  const next = body.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!tag.includes(oldName)) return tag;
    changed += 1;
    let out = tag.replace(/(\bsrc=")[^"]*(")/i, `$1${newUrl}$2`);
    out = /\balt="/i.test(out)
      ? out.replace(/(\balt=")[^"]*(")/i, `$1${alt}$2`)
      : out.replace(/<img\b/i, `<img alt="${alt}"`);
    return out;
  });
  return { body: next, changed };
}

async function writeBody(target, record, body) {
  if (target.kind === 'page') {
    const res = await gql(
      cfg,
      `mutation($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { field message } } }`,
      { id: record.id, page: { body } },
      'pageUpdate'
    );
    return res.pageUpdate;
  }
  const res = await gql(
    cfg,
    `mutation($id: ID!, $article: ArticleUpdateInput!) { articleUpdate(id: $id, article: $article) { article { id } userErrors { field message } } }`,
    { id: record.id, article: { body } },
    'articleUpdate'
  );
  return res.articleUpdate;
}

let wrote = 0;
let wouldWrite = 0;

for (const sizer of SIZERS) {
  log(`\n--- ${sizer.name} sizer`);
  const localPath = resolve(artDir, sizer.file);

  let url;
  if (apply) {
    url = await uploadImage(cfg, localPath, sizer.file, 'image/png');
    if (!url) {
      console.error(`  ! Could not upload ${sizer.file} and it is not in Files - skipping ${sizer.name}.`);
      continue;
    }
  } else {
    log(`  would upload ${sizer.file} to Content > Files (reused if already there)`);
    url = `https://cdn.shopify.com/.../files/${sizer.file}`;
  }

  for (const target of sizer.targets) {
    const label = target.kind === 'page' ? `/pages/${target.handle}` : `/blogs/${target.blog}/${target.handle}`;
    const record = await fetchTarget(target);
    if (!record) {
      console.error(`  ! ${label} not found - skipped`);
      continue;
    }

    if (record.body.includes(sizer.file)) {
      log(`  = ${label} already shows the new sizer`);
      continue;
    }

    const { body, changed } = swapImage(record.body, sizer.replaces, url, sizer.alt);
    if (!changed) {
      console.error(`  ! ${label} does not use ${sizer.replaces} - left alone`);
      continue;
    }

    if (!apply) {
      log(`  would swap ${changed} <img> on ${label} (${sizer.replaces} -> ${sizer.file})`);
      wouldWrite += 1;
      continue;
    }

    writeBackup(cfg, `${target.kind}-${target.handle}-before-sizer-swap`, record);
    const result = await writeBody(target, record, body);
    if (result.userErrors?.length) {
      console.error(`  ! ${label}: ${result.userErrors.map((e) => e.message).join('; ')}`);
      continue;
    }
    log(`  + ${label} now shows ${sizer.file}`);
    wrote += 1;
  }
}

log('');
if (apply) log(`Done. ${wrote} bod${wrote === 1 ? 'y' : 'ies'} updated.`);
else log(`Preview only - ${wouldWrite} bod${wouldWrite === 1 ? 'y' : 'ies'} would change. Re-run with --apply to write.`);
