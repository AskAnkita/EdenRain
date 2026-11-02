/*
 * Builds a print-ready PDF of the Ring Size Guide from /pages/er-sizing.
 *
 * The store already has er_Ring_sizer.pdf in Content > Files, but that is only the
 * cut-out band sizer - the international conversion chart (80 rows, UK to US to EU)
 * lives as an HTML table in the page body and has never existed as a PDF. This
 * builds one: page 1 is the measuring instructions, page 2 is the whole chart.
 *
 * Everything is read live from the page, so re-running after an edit in the Shopify
 * admin picks the change up. Nothing is written back to the store; the PDF lands in
 * design-previews/ for a human to check before it is uploaded to Files.
 *
 * Fixes a short list of plain typos in the page copy on the way through (see TYPOS);
 * they are logged on every run so the page itself can be corrected separately.
 *
 * Rendering uses the Playwright chromium already in the npx cache - this repo has no
 * node_modules of its own.
 *
 *   node scripts/shopify/build-ring-size-pdf.mjs                 # build the PDF
 *   node scripts/shopify/build-ring-size-pdf.mjs --out=path.pdf  # somewhere else
 *   node scripts/shopify/build-ring-size-pdf.mjs --html          # also keep the HTML
 */

import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const keepHtml = process.argv.includes('--html');
const outPath = resolve(repoRoot, arg('out') || 'design-previews/eden-raine-ring-size-guide.pdf');
const log = (...m) => console.log(...m);

const HANDLE = 'er-sizing';
const LOGO = 'https://cdn.shopify.com/s/files/1/0423/9668/0352/files/Eden_Raine_Logo_Full.png?v=1615321151';
const SIZER_PDF = 'https://cdn.shopify.com/s/files/1/0423/9668/0352/files/er_Ring_sizer.pdf?v=1624288622';
// The helpline the theme prints in the header and on the contact page.
const PHONE = '+44 (0) 203 554 887';

// Plain mistakes in the live page copy. Left-hand side must match exactly or the run
// reports it, so a fixed page stops being patched here silently.
// (The chart's own "Britan & Australia" heading is not listed: this PDF draws its
// own column headings, so that typo never reaches the page. It still wants fixing
// on the website.)
const TYPOS = [['it is. not too tight', 'it is not too tight']];

// "click here" is a link on the website and nothing at all on paper, so the printed
// copy points at the panel that carries the address instead.
const PRINT_ADAPTATIONS = [['simply click here to download', 'simply download the sizer below']];

// ---------------------------------------------------------------- page content

async function fetchPage(cfg) {
  const data = await gql(cfg, `{ pages(first: 1, query: "handle:${HANDLE}") { nodes { id title handle body } } }`);
  const page = data.pages.nodes[0];
  if (!page) throw new Error(`No page with handle "${HANDLE}" on this store.`);
  return page;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function rewrite(body, pairs, label) {
  let out = body;
  for (const [from, to] of pairs) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      log(`  ${label}: "${from}" -> "${to}"`);
    }
  }
  return out;
}

// The steps are the paragraphs between the download banner and the sentence that
// introduces the chart. Taking them by position rather than by class keeps this
// working if the admin's editor rewrites the markup.
function parseSteps(body) {
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const bannerAt = paragraphs.findIndex((p) => /er-ring-sizer-download/.test(p));
  const chartAt = paragraphs.findIndex((p) => /Below is our international/i.test(p));
  if (bannerAt === -1 || chartAt === -1) throw new Error('Could not find the steps between the banner and the chart.');
  return paragraphs
    .slice(bannerAt + 1, chartAt)
    .map(stripTags)
    .filter((t) => t.length > 20);
}

function parseIntro(body) {
  const first = body.match(/<p[^>]*>((?:(?!<img)[\s\S])*?)<\/p>/i);
  return first ? stripTags(first[1]) : '';
}

function parseChart(body) {
  const start = body.indexOf('<table');
  const end = body.lastIndexOf('</table>');
  if (start === -1 || end === -1) throw new Error('No conversion table in the page body.');
  const table = body.slice(start, end);
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]))
  );
  // Rows 0 and 1 are the table's own two heading rows; the rest are sizes.
  const sizes = rows.slice(2).filter((r) => r.length === 7);
  if (!sizes.length) throw new Error('Found the table but no 7-column size rows.');
  return sizes;
}

// ------------------------------------------------------------------- the page

// A cell reading "·" means that country has no equivalent for this size.
const cell = (value) =>
  value === '·' || value === '' ? '<td class="none">·</td>' : `<td>${value}</td>`;

// UK whole-letter sizes (A, B ... Z) are the ones a customer is actually quoted, so
// they get a tinted band; the quarters and halves between them stay plain.
const isWholeSize = (uk) => /^[A-Z]$/.test(uk.trim());

function chartBlock(rows) {
  const body = rows
    .map(
      (r) => `<tr class="${isWholeSize(r[4]) ? 'whole' : ''}">
        <td class="uk">${r[4]}</td>${cell(r[5])}${cell(r[6])}
        <td class="num">${r[0]}</td><td class="num">${r[2]}</td><td class="num dim">${r[1]}</td>
      </tr>`
    )
    .join('\n');
  return `<table class="chart">
    <thead>
      <tr><th colspan="3" class="grp">Standard sizes</th><th colspan="3" class="grp grp-alt">Inside measurement</th></tr>
      <tr><th class="uk">UK &amp;<br>AUS</th><th>US &amp;<br>CAN</th><th>EU</th>
          <th class="num">Dia.<br>mm</th><th class="num">Circ.<br>mm</th><th class="num">Dia.<br>in</th></tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildHtml({ intro, steps, rows, generatedOn }) {
  const half = Math.ceil(rows.length / 2);
  const stepList = steps.map((s) => `<li>${s}</li>`).join('\n');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Eden Raine London — Ring Size Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:wght@300;400;500&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 13mm 12mm; }

  :root {
    --pink: #e3d4cf;
    --pink-soft: #f4ece9;
    --ink: #000;
    --muted: #6a6a6a;
    --rule: #d8d8d8;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Source Sans 3', 'Source Sans Pro', -apple-system, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1, h2, .display { font-family: Cormorant, Georgia, serif; font-weight: 400; margin: 0; }

  /* A4 is 297mm; the @page margins take 14mm off the top and 12mm off the bottom,
     so this is exactly the printable height. Making each sheet that tall lets the
     footer sit on the baseline of its own page without position:fixed, which Chrome
     would otherwise repeat on every page. */
  .sheet { height: 271mm; display: flex; flex-direction: column; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .foot-spacer { margin-top: auto; }

  /* --- masthead ------------------------------------------------------- */
  .masthead { text-align: center; padding-bottom: 7mm; border-bottom: 1px solid var(--ink); }
  .masthead img { width: 46mm; height: auto; }
  h1 { font-size: 30pt; letter-spacing: .14em; text-transform: uppercase; margin-top: 6mm; }
  .kicker {
    font-size: 8pt; letter-spacing: .3em; text-transform: uppercase;
    color: var(--muted); margin-top: 3mm;
  }

  /* --- page 1 --------------------------------------------------------- */
  .intro { margin: 7mm 0 0; font-size: 10pt; line-height: 1.65; }
  .intro .lead { font-family: Cormorant, Georgia, serif; font-size: 13pt; line-height: 1.5; }

  .band {
    background: var(--pink); padding: 5mm 6mm; margin: 7mm 0;
    display: flex; align-items: center; gap: 6mm;
  }
  .band .label { font-size: 8pt; letter-spacing: .22em; text-transform: uppercase; }
  .band .title { font-family: Cormorant, Georgia, serif; font-size: 15pt; line-height: 1.2; }
  .band .url { font-size: 7.5pt; color: #4a4a4a; word-break: break-all; line-height: 1.35; margin-top: 1.5mm; }

  h2 {
    font-size: 15pt; letter-spacing: .04em; margin: 8mm 0 4mm;
    padding-bottom: 2mm; border-bottom: 1px solid var(--rule);
  }

  ol.steps { margin: 0; padding: 0; list-style: none; counter-reset: step; }
  ol.steps li {
    counter-increment: step; position: relative;
    padding: 0 0 4mm 11mm; line-height: 1.55;
  }
  ol.steps li::before {
    content: counter(step); position: absolute; left: 0; top: -0.3mm;
    width: 7mm; height: 7mm; background: var(--pink);
    font-family: Cormorant, Georgia, serif; font-size: 11pt;
    display: flex; align-items: center; justify-content: center;
  }

  .note {
    margin-top: 4mm; padding: 4mm 5mm; background: var(--pink-soft);
    font-size: 8.5pt; line-height: 1.5;
  }

  .foot {
    margin-top: auto; display: flex; justify-content: space-between;
    font-size: 7pt; letter-spacing: .14em; text-transform: uppercase;
    color: var(--muted); border-top: 1px solid var(--rule); padding-top: 2mm;
  }

  /* --- page 2: the chart ---------------------------------------------- */
  .chart-head { text-align: center; margin-bottom: 5mm; }
  .chart-head .display { font-size: 21pt; letter-spacing: .05em; }
  .chart-head p { margin: 2mm 0 0; font-size: 8.5pt; color: var(--muted); }

  .columns { display: flex; gap: 6mm; }
  .columns > div { flex: 1; }

  table.chart { width: 100%; border-collapse: collapse; font-size: 7.2pt; font-variant-numeric: tabular-nums; line-height: 1.25; }
  table.chart th, table.chart td {
    padding: 0.62mm 0.6mm; text-align: center; border-bottom: 0.3pt solid var(--rule);
  }
  table.chart .grp {
    background: var(--ink); color: #fff; font-weight: 400;
    font-size: 6.6pt; letter-spacing: .16em; text-transform: uppercase; padding: 1.4mm 0;
  }
  table.chart .grp-alt { background: #5a5a5a; }
  table.chart thead tr:last-child th {
    background: var(--pink); font-weight: 600; font-size: 6.6pt;
    letter-spacing: .04em; line-height: 1.2; padding: 1.2mm 0.4mm;
    border-bottom: 0.6pt solid var(--ink);
  }
  table.chart td.uk, table.chart th.uk { font-weight: 600; }
  table.chart tr.whole { background: var(--pink-soft); }
  table.chart tr.whole td.uk { font-size: 8.4pt; }
  table.chart td.none { color: #bdbdbd; }
  table.chart td.dim { color: var(--muted); }

  .key {
    margin-top: 4mm; display: flex; gap: 7mm; justify-content: center;
    font-size: 7.5pt; color: var(--muted); align-items: center;
  }
  .key span { display: inline-flex; align-items: center; gap: 2mm; }
  .key i { width: 4mm; height: 3mm; display: inline-block; }
  .key i.whole { background: var(--pink-soft); border: 0.3pt solid var(--rule); }
</style>
</head>
<body>

<section class="sheet">
  <header class="masthead">
    <img src="${LOGO}" alt="Eden Raine London">
    <h1>Ring Size Guide</h1>
    <p class="kicker">How to measure at home</p>
  </header>

  <div class="intro"><p class="lead">${intro}</p></div>

  <div class="band">
    <div>
      <div class="label">Step one</div>
      <div class="title">Print the free Eden Raine ring sizer</div>
      <div class="url">${SIZER_PDF}</div>
    </div>
  </div>

  <h2>Measuring your finger</h2>
  <ol class="steps">${stepList}</ol>

  <div class="note">
    <strong>Need a hand?</strong> Call us on ${PHONE} and we will talk you through it, or see the full
    guide at edenraine.com/pages/${HANDLE}.
  </div>

  <div class="foot"><span>Eden Raine London</span><span>Page 1 of 2</span></div>
</section>

<section class="sheet">
  <header class="chart-head">
    <div class="display">International Conversion Chart</div>
    <p>Compare ring sizes between the UK, the United States and Europe. ${rows.length} sizes.</p>
  </header>

  <div class="columns">
    <div>${chartBlock(rows.slice(0, half))}</div>
    <div>${chartBlock(rows.slice(half))}</div>
  </div>

  <div class="key">
    <span><i class="whole"></i> Whole UK letter size</span>
    <span>· No equivalent size</span>
    <span>Dia. = inside diameter &nbsp;·&nbsp; Circ. = inside circumference</span>
  </div>

  <div class="foot"><span>Eden Raine London &nbsp;·&nbsp; edenraine.com/pages/${HANDLE}</span><span>${generatedOn} &nbsp;·&nbsp; Page 2 of 2</span></div>
</section>

</body>
</html>`;
}

// ------------------------------------------------------------------ rendering

// This repo keeps no node_modules, so borrow the playwright that `npx playwright`
// left in the npm cache. Any of its copies will do.
async function loadPlaywright() {
  const npxRoot = resolve(homedir(), '.npm', '_npx');
  if (!existsSync(npxRoot)) throw new Error('No npx cache - run `npx playwright install chromium` once.');
  for (const dir of readdirSync(npxRoot)) {
    const entry = resolve(npxRoot, dir, 'node_modules', 'playwright', 'index.js');
    if (!existsSync(entry)) continue;
    // playwright's entry is CommonJS, so the named export lands on .default here.
    const mod = await import(`file://${entry}`);
    const chromium = mod.chromium || mod.default?.chromium;
    if (chromium) return chromium;
  }
  throw new Error('Playwright is not in the npx cache - run `npx playwright install chromium` once.');
}

// The npx copy of playwright is usually newer than the browser build left in
// ~/Library/Caches/ms-playwright, so drive the installed Google Chrome instead and
// only fall back to a bundled chromium if there is no Chrome on this machine.
async function launch(chromium) {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (err) {
    log(`  Chrome not usable (${err.message.split('\n')[0]}); trying the bundled chromium`);
    return chromium.launch();
  }
}

async function render(html, destination) {
  const chromium = await loadPlaywright();
  const browser = await launch(chromium);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: destination, format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

// ----------------------------------------------------------------------- main

const cfg = config();
log(`Reading /pages/${HANDLE} ...`);
const page = await fetchPage(cfg);
const body = page.body;

// Both rewrites run on the extracted text rather than the raw markup: the admin's
// editor sprinkles <span> tags mid-sentence ("simply<span> </span>click here"), so a
// phrase is only reliably matchable once the tags are gone.
const clean = (text) => rewrite(rewrite(text, TYPOS, 'fixed typo'), PRINT_ADAPTATIONS, 'adapted for print');

const intro = clean(parseIntro(body));
const steps = parseSteps(body).map(clean);
const rows = parseChart(body);
log(`  "${page.title}" - ${steps.length} steps, ${rows.length} sizes in the chart`);

const generatedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const html = buildHtml({ intro, steps, rows, generatedOn });

mkdirSync(dirname(outPath), { recursive: true });
if (keepHtml) {
  const htmlPath = outPath.replace(/\.pdf$/, '.html');
  writeFileSync(htmlPath, html);
  log(`  HTML -> ${htmlPath}`);
}

log('Rendering ...');
await render(html, outPath);
log(`Done -> ${outPath}`);
