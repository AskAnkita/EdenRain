// Copy products from a Chain & Bracelet CSV export into Eden Raine.
//
//   node scripts/shopify/import-cb-export.mjs <export.csv>            preview
//   node scripts/shopify/import-cb-export.mjs <export.csv> --apply    create them
//   ... --only=AJLB236,AJER666      just those item codes
//   ... --categories=Bracelets,Earrings
//
// Why a second importer: `import.js` builds a product out of Drive renders and a price list.
// Everything needed here is already in the export - titles, copy, options, per-variant prices
// and CDN image URLs - and C&B's bracelet renders are not on the Drive at all. Shopify can
// fetch an image straight from a public URL (productCreateMedia originalSource), so nothing is
// downloaded: the pictures move store-to-store without touching this machine.
//
// What it normalises on the way in, so these sit beside the products already in the store:
//   - vendor becomes Eden Raine, not ChainandBracelet
//   - the handle comes from the title, so C&B's "...-copy" and "untitled-description-needed"
//     handles do not follow the product across
//   - option values are forced to the display form. Half of C&B's bracelets carry the
//     metafield-linked values ("925-sterling-silver"); Eden Raine's carry "925 Sterling Silver",
//     and a store cannot show one swatch row for both spellings.
//   - SKUs are rebuilt as CODE-METAL-COLOUR-c&b. The export's own SKUs disagree with themselves
//     (AJER668 numbers its variants -1..-10 and calls every one of them S925-W), and the -c&b
//     tail is what marks a C&B-sourced item in this store. See the skuSuffix note in import.js.
//   - `needs-price` is dropped when every variant has a real price, and the store's own
//     category:/metal:/shape:/style: tags are added from scripts/shopify/tag-rules.mjs, so the
//     automated collections pick the product up the moment it lands.

import { readFileSync } from 'node:fs';
import { config, gql } from './lib.mjs';
import { namespaces } from './tag-rules.mjs';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const only = ((args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const wantCats = ((args.find((a) => a.startsWith('--categories=')) || '').split('=')[1] || 'Bracelets,Earrings,Necklaces,Charms & Pendants').split(',').filter(Boolean);

if (!csvPath) {
  console.error('Usage: node scripts/shopify/import-cb-export.mjs <export.csv> [--apply] [--only=CODE,CODE] [--categories=...]');
  process.exit(1);
}

const cfg = config();
const SKU_SUFFIX = '-c&b';

// lib.mjs retries a 429 or a 5xx, but not a socket that never answered. Pulling ~500 images
// across 38 products keeps one connection busy for minutes at a time and `fetch failed` comes
// back often enough to lose a product to it, so every call goes through here.
async function api(...args) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await gql(cfg, ...args);
    } catch (e) {
      // A userErrors rejection is the store saying no - repeating it changes nothing.
      if (!/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(e.message)) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw last;
}

// ---------- CSV ----------

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- normalising ----------

// C&B writes a metal two ways depending on whether the option is linked to the
// shopify.jewelry-material metafield. Both land on the display form Eden Raine uses.
const METALS = [
  ['925 Sterling Silver', 'S925', 'W'],
  ['10k Yellow Gold', 'G10K', 'Y'],
  ['10k White Gold', 'G10K', 'W'],
  ['10k Rose Gold', 'G10K', 'R'],
  ['14k Yellow Gold', 'G14K', 'Y'],
  ['14k White Gold', 'G14K', 'W'],
  ['14k Rose Gold', 'G14K', 'R'],
  ['18k Yellow Gold', 'G18K', 'Y'],
  ['18k White Gold', 'G18K', 'W'],
  ['18k Rose Gold', 'G18K', 'R'],
];
const metalByKey = new Map();
for (const [label, metal, colour] of METALS) {
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '');       // "925sterlingsilver"
  metalByKey.set(key, { label, metal, colour });
}
function metalOf(value) {
  const hit = metalByKey.get(String(value).toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!hit) throw new Error(`unknown metal option value "${value}"`);
  return hit;
}
const metalOrder = new Map(METALS.map(([label], i) => [label, i]));

// Accents are folded rather than dropped, or "Pave\u0301" becomes "pav-" in the URL.
const handleOf = (title) =>
  title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);

const fileOf = (url) => (url || '').split('?')[0].split('/').pop();

// C&B's editor leaves its own markup in the body - class names like "PDq2pG_selectionAnchor",
// empty anchor spans, and a heading where the rest of the catalogue uses a bold line. Strip it,
// so every product reads the same in the store and nothing carries another site's CSS hooks.
function cleanBody(html) {
  return (html || '')
    .replace(/<span class="[^"]*selectionAnchor[^"]*"><\/span>/gi, '')
    .replace(/\s(class|id|style|data-[\w-]+)="[^"]*"/gi, '')
    .replace(/<h[1-6]>\s*Description\s*<\/h[1-6]>/gi, '<p><strong>Description</strong></p>')
    .replace(/<h[1-6]>\s*(Key Features:?)\s*<\/h[1-6]>/gi, '<p><strong>Key Features:</strong></p>')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---------- the store's own tags ----------
// Same two haystacks tag-products.mjs reads: a rule marked `title` sees only the title, so a
// category is never read off an option value that happens to contain the word "ring".
function storeTags(title, productType, tags, optionValues) {
  const t = title.toLowerCase();
  const hay = { title: t, all: `${t} ${[productType, ...tags, ...optionValues].join(' ').toLowerCase()}` };
  const out = [];
  for (const [ns, rules] of Object.entries(namespaces))
    for (const r of rules)
      if (r.any.some((p) => p.test(hay[r.from])) && !r.not.some((p) => p.test(hay[r.from]))) out.push(`${ns}:${r.value}`);
  return out;
}

// ---------- taxonomy ----------
const catCache = new Map();
async function categoryId(name) {
  if (catCache.has(name)) return catCache.get(name);
  const d = await api(`query($q:String!){ taxonomy{ categories(first:20, search:$q){ nodes{ id name fullName } } } }`, { q: name });
  const nodes = d.taxonomy?.categories?.nodes || [];
  const hit = nodes.find((n) => /jewelry/i.test(n.fullName) && n.name.toLowerCase() === name.toLowerCase())
           || nodes.find((n) => /jewelry/i.test(n.fullName)) || null;
  catCache.set(name, hit);
  return hit;
}

// ---------- build the plan ----------

function buildPlan(rows) {
  const byHandle = new Map();
  for (const r of rows) {
    if (!byHandle.has(r.Handle)) byHandle.set(r.Handle, []);
    byHandle.get(r.Handle).push(r);
  }

  const plans = [];
  for (const [handle, rs] of byHandle) {
    const head = rs.find((r) => r.Title) || rs[0];
    const cat = (head['Product Category'] || '').split('>').pop().trim();
    if (!wantCats.includes(cat)) continue;

    const variantRows = rs.filter((r) => (r['Variant SKU'] || '').trim());
    const code = (() => {
      for (const r of variantRows) {
        const m = (r['Variant SKU'] || '').match(/^([A-Z]+\d+)/);
        if (m) return m[1];
      }
      return null;
    })();
    if (!code) continue;
    if (only.length && !only.includes(code)) continue;

    const title = head.Title.trim();
    const opt2Name = (head['Option2 Name'] || '').trim();

    // Variants, keyed so a repeated metal/length pair cannot create two of the same.
    const seen = new Set();
    const variants = [];
    for (const r of variantRows) {
      const m = metalOf(r['Option1 Value']);
      const len = opt2Name ? (r['Option2 Value'] || '').trim() : null;
      const key = `${m.label}|${len || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const grams = parseFloat(r['Variant Grams'] || '0');
      variants.push({
        metal: m, length: len,
        price: Number(parseFloat(r['Variant Price'] || '0').toFixed(2)),
        sku: `${code}-${m.metal}-${m.colour}${SKU_SUFFIX}`,
        grams: Number.isFinite(grams) && grams > 0 && (r['Variant Weight Unit'] || '') === 'g' ? grams : null,
        image: fileOf(r['Variant Image']),
      });
    }
    // Metal is the primary option, so order by metal then by the length order the export used.
    const lengthOrder = [];
    for (const v of variants) if (v.length && !lengthOrder.includes(v.length)) lengthOrder.push(v.length);
    variants.sort((a, b) =>
      (metalOrder.get(a.metal.label) - metalOrder.get(b.metal.label)) ||
      (lengthOrder.indexOf(a.length) - lengthOrder.indexOf(b.length)));

    // Images in the export's own position order; a filename appears once.
    const media = [];
    const byFile = new Set();
    for (const r of rs.slice().sort((a, b) => (+a['Image Position'] || 999) - (+b['Image Position'] || 999))) {
      const url = (r['Image Src'] || '').trim();
      if (!url) continue;
      const f = fileOf(url);
      if (byFile.has(f)) continue;
      byFile.add(f);
      media.push({ url, file: f, alt: (r['Image Alt Text'] || '').trim() || null });
    }

    // C&B's facet tags are "Shape:Round" / "Style:Pave\u0301" and the store's other C&B products carry
    // exactly those. Its bare words ("bracelet", "bracelets") are not a namespace this store reads
    // and nothing browses by them, so they stay behind.
    const sourceTags = (head.Tags || '').split(',').map((s) => s.trim()).filter((t) => t.includes(':'));
    const everyPriced = variants.length > 0 && variants.every((v) => v.price > 0);
    const keep = everyPriced ? sourceTags : [...sourceTags, 'needs-price'];
    const derived = storeTags(title, 'Jewellery', keep, [
      ...new Set(variants.map((v) => v.metal.label)), ...lengthOrder,
    ]);

    plans.push({
      code, cat, title, handle: handleOf(title), sourceHandle: handle,
      descriptionHtml: cleanBody(head['Body (HTML)']),
      tags: [...new Set([...keep, ...derived])].sort(),
      opt2Name, lengthOrder,
      metals: [...new Set(variants.map((v) => v.metal.label))].sort((a, b) => metalOrder.get(a) - metalOrder.get(b)),
      variants, media,
      everyPriced,
      status: head.Status === 'active' ? 'ACTIVE' : 'DRAFT',
      sourcePublished: head.Published === 'true',
    });
  }
  return plans;
}

// ---------- write ----------

async function createOne(p) {
  const input = {
    title: p.title,
    handle: p.handle,
    descriptionHtml: p.descriptionHtml,
    vendor: 'Eden Raine',
    productType: 'Jewellery',
    status: 'ACTIVE',
    tags: p.tags,
    productOptions: [
      { name: 'Jewelry material', values: p.metals.map((n) => ({ name: n })) },
      ...(p.opt2Name ? [{ name: p.opt2Name, values: p.lengthOrder.map((n) => ({ name: n })) }] : []),
    ],
  };
  const cat = await categoryId(p.cat === 'Charms & Pendants' ? 'Necklaces' : p.cat);
  if (cat) input.category = cat.id;

  const d = await api(`mutation($input: ProductInput!){ productCreate(input:$input){ product{ id handle } userErrors{ field message } } }`, { input }, 'productCreate');
  const product = d.productCreate.product;

  // Media, in batches. originalSource is C&B's CDN URL: Shopify pulls the file itself.
  const mediaIdByFile = new Map();
  for (let i = 0; i < p.media.length; i += 5) {
    const batch = p.media.slice(i, i + 5);
    const dm = await api(
      `mutation($productId: ID!, $media: [CreateMediaInput!]!){
         productCreateMedia(productId:$productId, media:$media){
           media{ ... on MediaImage { id image { url } } }
           mediaUserErrors{ field message }
         } }`,
      { productId: product.id, media: batch.map((m) => ({ originalSource: m.url, mediaContentType: 'IMAGE', ...(m.alt ? { alt: m.alt } : {}) })) });
    const errs = dm.productCreateMedia.mediaUserErrors || [];
    if (errs.length) throw new Error(`productCreateMedia: ${errs.map((e) => e.message).join('; ')}`);
    dm.productCreateMedia.media.forEach((m, j) => mediaIdByFile.set(batch[j].file, m.id));
  }

  // Variants, in batches of 50 - the bulk mutation's ceiling.
  let made = 0;
  for (let i = 0; i < p.variants.length; i += 50) {
    const batch = p.variants.slice(i, i + 50).map((v) => ({
      optionValues: [
        { optionName: 'Jewelry material', name: v.metal.label },
        ...(p.opt2Name ? [{ optionName: p.opt2Name, name: v.length }] : []),
      ],
      price: v.price.toFixed(2),
      inventoryItem: { sku: v.sku, tracked: false, ...(v.grams ? { measurement: { weight: { value: v.grams, unit: 'GRAMS' } } } : {}) },
      ...(mediaIdByFile.get(v.image) ? { mediaId: mediaIdByFile.get(v.image) } : {}),
    }));
    const dv = await api(
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!){
         productVariantsBulkCreate(productId:$productId, variants:$variants, strategy: REMOVE_STANDALONE_VARIANT){
           productVariants{ id } userErrors{ field message } } }`,
      { productId: product.id, variants: batch }, 'productVariantsBulkCreate');
    made += dv.productVariantsBulkCreate.productVariants.length;
  }
  return { product, media: mediaIdByFile.size, variants: made };
}

// ---------- --copy: fill in the descriptions the export did not carry ----------
// Eighteen of these arrived from C&B as a bare <ul> of specifications and nothing else, which is
// below what the rest of this catalogue reads like. data/cb-bracelet-copy.json holds a Description
// written from that same list - carats, stone counts, millimetres - and this puts it above the
// list, labelling what was already there as Key Features. It only ever touches a product whose
// body still starts with that bare <ul>, so running it twice cannot stack two descriptions.
if (args.includes('--copy')) {
  const copy = JSON.parse(readFileSync(new URL('./data/cb-bracelet-copy.json', import.meta.url), 'utf8'));
  let done = 0, already = 0;
  for (const [code, prose] of Object.entries(copy)) {
    if (code.startsWith('_')) continue;
    const d = await api(`query($q:String!){ products(first:1, query:$q){ nodes{ id handle title descriptionHtml } } }`, { q: `sku:${code}-*` });
    const prod = d.products.nodes[0];
    if (!prod) { console.log(`  ?    ${code.padEnd(8)} not in the store`); continue; }
    if (!/^\s*<ul>/.test(prod.descriptionHtml)) { already++; continue; }
    const body = `<p><strong>Description</strong></p>${prose}<p><strong>Key Features:</strong></p>${prod.descriptionHtml}`;
    if (apply) await api(`mutation($input: ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ field message } } }`, { input: { id: prod.id, descriptionHtml: body } }, 'productUpdate');
    console.log(`  ${apply ? 'ok  ' : 'would'} ${code.padEnd(8)} ${prod.title.slice(0, 64)}`);
    done++;
  }
  console.log(`\n${apply ? 'Updated' : 'Would update'} ${done}; ${already} already had a description.`);
  process.exit(0);
}

// ---------- run ----------

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const plans = buildPlan(rows);

// Never create something the store already has: match on item code across every SKU.
const existing = new Set();
{
  let after = null;
  do {
    const d = await api(`query($after:String){ products(first:250, after:$after){ pageInfo{hasNextPage endCursor} nodes{ variants(first:100){ nodes{ sku } } } } }`, { after });
    for (const n of d.products.nodes) for (const v of n.variants.nodes) {
      const m = (v.sku || '').match(/^([A-Z]+\d+)/);
      if (m) existing.add(m[1]);
    }
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
}

const todo = plans.filter((p) => !existing.has(p.code));
const skipped = plans.filter((p) => existing.has(p.code));
const unpriced = todo.filter((p) => !p.everyPriced);
const go = todo.filter((p) => p.everyPriced);

console.log(`${csvPath}: ${plans.length} products in ${wantCats.join('/')}`);
console.log(`  already in ${cfg.domain}: ${skipped.length}`);
console.log(`  no price on every variant, left out: ${unpriced.length}${unpriced.length ? ` (${unpriced.map((p) => p.code).join(', ')})` : ''}`);
console.log(`  to create: ${go.length}\n`);
for (const p of go) {
  const bare = /^\s*<ul>/.test(p.descriptionHtml);
  console.log(`${p.cat.slice(0, 9).padEnd(9)} ${p.code.padEnd(8)} ${String(p.variants.length).padStart(2)}v ${String(p.media.length).padStart(2)}img  ${bare ? 'SPEC-ONLY' : 'has copy '}  ${p.title.slice(0, 58)}`);
  console.log(`          ${p.handle}`);
  console.log(`          tags: ${p.tags.join(', ')}`);
}

if (!apply) {
  console.log('\nPreview only. Re-run with --apply to create these in the store.');
  process.exit(0);
}

console.log(`\nCreating ${go.length} products in ${cfg.domain}...\n`);
const made = [];
for (const p of go) {
  try {
    const r = await createOne(p);
    made.push({ code: p.code, id: r.product.id, handle: r.product.handle });
    console.log(`  ok   ${p.code.padEnd(8)} ${r.variants}v ${r.media}img  ${r.product.handle}`);
  } catch (e) {
    console.log(`  FAIL ${p.code.padEnd(8)} ${e.message.slice(0, 160)}`);
  }
}
console.log(`\nCreated ${made.length} of ${go.length}.`);
console.log('Next: node scripts/shopify/publish-products.mjs --apply   (puts them on the Online Store)');
