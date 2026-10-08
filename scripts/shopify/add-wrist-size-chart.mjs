/*
 * Gives the wrist sizer guide the size chart the ring sizer guide already has.
 *
 * The ring guide ends with an international conversion chart; the wrist guide
 * ended after the printable sizer, so a customer who could not print had
 * nothing to measure against. This appends a matching chart: wrist
 * circumference across to bracelet length, standard size and bangle diameter.
 *
 * It writes to two places, because the guide exists twice in this store. The
 * one customers see is the blog article education-guides/wrist-sizer-guide -
 * that is what the menu's "Wrist Size Guide" resolves to and what the ring
 * chart lives on. /pages/wrist-sizer-guide holds the same copy and is linked
 * from snippets/menu-static-items.liquid, so it is kept in step rather than
 * left to drift.
 *
 * The markup deliberately copies the ring chart's shape - two heading rows
 * written as <td>, zebra bgcolor, a wrapping <div> - because editorial-cards.css
 * styles .gp-content tables by position rather than by class, and both the
 * article and the guide page render through it. A table built any other way
 * would not match the ring one.
 *
 *   node scripts/shopify/add-wrist-size-chart.mjs            # preview, writes nothing
 *   node scripts/shopify/add-wrist-size-chart.mjs --apply    # write
 *
 * Every body it touches is saved to backups/ first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

const HANDLE = 'wrist-sizer-guide';
const BLOG = 'education-guides';

// A marker so a second run is a no-op rather than a second chart.
const MARKER = 'wrist-size-chart';

/*
 * Wrist circumference across to the pieces that fit it.
 *
 * Bracelet length is the measured wrist plus 2cm, which is the comfort fit the
 * copy describes - enough to sit on the wrist rather than grip it. Bangle size
 * is an inside diameter, because a bangle has no clasp and is sized by the
 * opening: (wrist + 1.5cm) / pi, rounded to the nearest millimetre.
 *
 * [ wrist cm, wrist in, bracelet cm, bracelet in, size, bangle, bangle mm ]
 */
const ROWS = [
  ['14.0', '5.51', '16.0', '6.30', 'XS', 'Extra small', '49'],
  ['14.5', '5.71', '16.5', '6.50', 'XS', 'Extra small', '51'],
  ['15.0', '5.91', '17.0', '6.69', 'S', 'Extra small', '53'],
  ['15.5', '6.10', '17.5', '6.89', 'S', 'Extra small', '54'],
  ['16.0', '6.30', '18.0', '7.09', 'S', 'Small (1)', '56'],
  ['16.5', '6.50', '18.5', '7.28', 'M', 'Small (1)', '57'],
  ['17.0', '6.69', '19.0', '7.48', 'M', 'Small (1)', '59'],
  ['17.5', '6.89', '19.5', '7.68', 'M', 'Small (1)', '60'],
  ['18.0', '7.09', '20.0', '7.87', 'L', 'Medium (2)', '62'],
  ['18.5', '7.28', '20.5', '8.07', 'L', 'Medium (2)', '64'],
  ['19.0', '7.48', '21.0', '8.27', 'L', 'Medium (2)', '65'],
  ['19.5', '7.68', '21.5', '8.46', 'XL', 'Medium (2)', '67'],
  ['20.0', '7.87', '22.0', '8.66', 'XL', 'Large (3)', '68'],
  ['20.5', '8.07', '22.5', '8.86', 'XL', 'Large (3)', '70'],
  ['21.0', '8.27', '23.0', '9.06', 'XXL', 'Large (3)', '72'],
];

const cell = (value, bg, width) =>
  `<td align="center" bgcolor="${bg}" width="${width}">${value}</td>`;

const WIDTHS = ['50', '50', '50', '50', '90', '90', '90'];

const body = ROWS.map((row, i) => {
  const bg = i % 2 === 0 ? '#FFFFFF' : '#f1f1f1';
  return '<tr>\n' + row.map((v, c) => cell(v, bg, WIDTHS[c])).join('\n') + '\n</tr>';
}).join('\n');

const CHART = `
<p> </p>
<h2 id="${MARKER}">Find your wrist size with our Bracelet &amp; Bangle Size Chart</h2>
<p><span>Measure around your wrist with a tape measure or a strip of paper, just below the wrist bone, and read across. If you are between two sizes, take the larger one.</span></p>
<div>
<table border="1" bordercolor="#e1e1e1" width="100%" cellspacing="0" cellpadding="1">
<tbody>
<tr>
<td colspan="2" align="center" width="150" height="30">
<strong>Wrist Circumference<span> </span></strong>(Measured)</td>
<td colspan="2" align="center" width="150" height="30">
<strong>Bracelet Length<span> </span></strong>(Comfort fit)</td>
<td colspan="3" align="center" width="600" height="30"><strong>&lsaquo; Standard Sizes &rsaquo;</strong></td>
</tr>
<tr>
<td align="center" bgcolor="#fcfcfc" width="50" height="30"><strong>CM</strong></td>
<td align="center" bgcolor="#fcfcfc" width="50" height="30"><strong>Inches</strong></td>
<td align="center" bgcolor="#fcfcfc" width="50" height="30"><strong>CM</strong></td>
<td align="center" bgcolor="#fcfcfc" width="50" height="30"><strong>Inches</strong></td>
<td align="center" bgcolor="#fcfcfc" width="90" height="30"><strong>Bracelet Size</strong></td>
<td align="center" bgcolor="#fcfcfc" width="90" height="30"><strong>Bangle Size</strong></td>
<td align="center" bgcolor="#fcfcfc" width="90" height="30"><strong>Bangle Inside &Oslash; (mm)</strong></td>
</tr>
${body}
</tbody>
</table>
</div>
<p>A bracelet is measured done up, so the length above already allows room to move. A bangle has no clasp, so it is sized by the opening it has to pass over - if your hand is wide across the knuckles, take the next size up.</p>
<p>This chart is a guide only. If you are between sizes or buying as a surprise, please<span> </span><a href="https://www.edenraine.com/pages/contact">get in touch</a><span> </span>and we will help you choose.</p>
`.trim();

try {
  const cfg = await config();

  // Both the article and the page, so whichever a visitor lands on carries the chart.
  const ARTICLES = `query($q:String!){ articles(first:25, query:$q){ nodes{ id handle title body blog{ handle } } } }`;
  const PAGES = `query($q:String!){ pages(first:25, query:$q){ nodes{ id handle title body } } }`;

  const article = (await gql(cfg, ARTICLES, { q: `handle:${HANDLE}` })).articles.nodes
    .find((a) => a.handle === HANDLE && a.blog.handle === BLOG);
  const page = (await gql(cfg, PAGES, { q: `handle:${HANDLE}` })).pages.nodes
    .find((p) => p.handle === HANDLE);

  const targets = [];
  if (article) targets.push({ kind: 'article', where: `/blogs/${BLOG}/${HANDLE}`, ...article });
  if (page) targets.push({ kind: 'page', where: `/pages/${HANDLE}`, ...page });
  if (!targets.length) throw new Error(`No wrist sizer guide in this store under the handle "${HANDLE}".`);

  const todo = [];
  for (const t of targets) {
    if ((t.body || '').includes(MARKER)) { log(`${t.where} already carries the chart; left alone.`); continue; }
    todo.push({ ...t, next: `${(t.body || '').trim()}\n${CHART}\n` });
  }

  if (!todo.length) { log('Nothing to change.'); process.exit(0); }
  log(`${apply ? 'Applying' : 'Would apply'} ${todo.length} change(s):`);
  for (const t of todo) {
    log(`  - ${t.kind}: ${t.where}  body ${(t.body || '').length} -> ${t.next.length} chars`);
    log(`    appends a ${ROWS.length}-row wrist, bracelet and bangle size chart`);
  }
  if (!apply) { log('\nNothing written. Add --apply to write.'); process.exit(0); }

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const before = resolve(backupDir, `wrist-sizer-guide-before-chart-${stamp}.json`);
  writeFileSync(before, JSON.stringify(todo.map(({ next, ...rest }) => rest), null, 2));
  log(`\nSaved the current bodies to ${before}`);

  const ARTICLE_UPDATE = `mutation($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) { article { id handle } userErrors { field message } }
  }`;
  const PAGE_UPDATE = `mutation($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) { page { id handle } userErrors { field message } }
  }`;

  for (const t of todo) {
    if (t.kind === 'article') {
      await gql(cfg, ARTICLE_UPDATE, { id: t.id, article: { body: t.next } }, 'articleUpdate');
    } else {
      await gql(cfg, PAGE_UPDATE, { id: t.id, page: { body: t.next } }, 'pageUpdate');
    }
    log(`${t.where} updated.`);
  }
  log('\nDone.');
} catch (err) {
  console.error('\n' + err.message);
  process.exit(1);
}
