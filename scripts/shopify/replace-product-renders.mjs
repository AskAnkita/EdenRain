#!/usr/bin/env node
// Swaps a product's whole render gallery for a fresh set from the Drive, keeping the product
// itself (handle, SKUs, prices, reviews, links) untouched.
//
//   node scripts/shopify/replace-product-renders.mjs                    preview every earring
//   node scripts/shopify/replace-product-renders.mjs --apply            replace them
//   node scripts/shopify/replace-product-renders.mjs --only=AJER827 --apply
//   node scripts/shopify/replace-product-renders.mjs --dir="<folder>" --only=CODE,CODE --apply
//
// Written for the ten earrings imported on 2026-11-13 from Chain & Bracelet's export: they went
// up with C&B's renders, and Eden Raine's own renders of the same ten codes landed in
// `Eden Raine/Render/Earring` on 2026-11-16. Each code has a folder holding CODE[-carat]-{Y,W,R}{1-4}.png.
//
// Order of work, per product: upload the new files -> attach them (alt = the colour's
// "#Jewelry material_*" group, which is how the gallery filters by metal) -> wait until Shopify
// has processed them -> delete the old media -> point every variant at the first render of its
// colour. Old media is only deleted once all new media is READY, so a failed upload leaves the
// product with its old gallery rather than none. A backup of the old media list goes to backups/.
//
// lib.mjs's uploadImage() is deliberately not used: it returns an existing file of the same
// name from Content > Files, and the C&B renders already sit there as AJER827-Y1.png etc.,
// so it would hand back the very images being replaced.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { config, gql, writeBackup } from './lib.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DIR = flag('dir') || join(homedir(), 'Google Drive/My Drive/Asimi/Eden Raine/Render/Earring');
const ONLY = (flag('only') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const COLOURS = { Y: '#Jewelry material_Gold', W: '#Jewelry material_white_gold', R: '#Jewelry material_Rose gold' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = config();

// Shopify's API occasionally drops a socket on a long run; retry those as well as what gql retries.
async function q(query, variables, field) {
  for (let i = 1; ; i++) {
    try {
      return await gql(cfg, query, variables, field);
    } catch (e) {
      if (i >= 4 || !/fetch failed|ECONNRESET|socket/i.test(e.message)) throw e;
      await sleep(2000 * i);
    }
  }
}

function rendersFor(folder) {
  const files = readdirSync(join(DIR, folder)).filter((f) => /\.png$/i.test(f));
  const out = [];
  for (const c of Object.keys(COLOURS)) {
    for (let n = 1; n <= 9; n++) {
      const f = files.find((x) => new RegExp(`-${c}${n}-?\\.png$`, 'i').test(x));
      if (f) out.push({ file: f, colour: c, n });
    }
  }
  return out;
}

async function stageAndPost(path, filename) {
  const staged = await q(
    `mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{name value} } userErrors{field message} } }`,
    { input: [{ filename, mimeType: 'image/png', resource: 'PRODUCT_IMAGE', httpMethod: 'POST' }] },
    'stagedUploadsCreate'
  );
  const t = staged.stagedUploadsCreate.stagedTargets[0];
  for (let i = 1; ; i++) {
    const form = new FormData();
    for (const p of t.parameters) form.append(p.name, p.value);
    form.append('file', new Blob([readFileSync(path)], { type: 'image/png' }), filename);
    try {
      const res = await fetch(t.url, { method: 'POST', body: form });
      if (res.ok) return t.resourceUrl;
      if (i >= 3) throw new Error(`upload ${filename} failed: ${res.status}`);
    } catch (e) {
      if (i >= 3) throw e;
    }
    await sleep(2000 * i);
  }
}

const PRODUCT = `query($q:String!){ products(first:10, query:$q){ nodes{ id title handle status
  variants(first:100){ nodes{ id sku media(first:1){ nodes{ id } } } }
  media(first:100){ nodes{ id alt mediaContentType ... on MediaImage{ image{ url } } } } } } }`;

const folders = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let failed = 0;

console.log(`${APPLY ? 'Replacing' : 'Preview of'} renders from ${DIR}${APPLY ? '' : ' (add --apply to write)'}\n`);

for (const folder of folders) {
  const code = folder.match(/^[A-Z]+\d+/i)?.[0]?.toUpperCase();
  if (!code || (ONLY.length && !ONLY.includes(code))) continue;
  try {
    const renders = rendersFor(folder);
    const found = await q(PRODUCT, { q: `sku:${code}-*` });
    const live = found.products.nodes.filter((p) => p.status === 'ACTIVE' && p.variants.nodes.some((v) => (v.sku || '').toUpperCase().startsWith(`${code}-`)));
    if (live.length !== 1) {
      console.log(`! ${code}: ${live.length} active products carry this code; skipped`);
      failed++;
      continue;
    }
    const p = live[0];
    console.log(`${code}  ${p.title}`);
    console.log(`    ${p.media.nodes.length} old media -> ${renders.length} new (${renders.map((r) => r.colour + r.n).join(' ')})`);
    if (renders.length < 3) {
      console.log('    ! too few renders found; skipped');
      failed++;
      continue;
    }
    if (!APPLY) continue;

    writeBackup(cfg, `renders-${code}`, { product: p.id, handle: p.handle, media: p.media.nodes, variants: p.variants.nodes });

    // 1. upload + attach
    const inputs = [];
    for (const r of renders) {
      const name = `${code}-${r.colour}${r.n}.png`;
      inputs.push({ originalSource: await stageAndPost(join(DIR, folder, r.file), name), alt: COLOURS[r.colour], mediaContentType: 'IMAGE' });
    }
    const created = await q(
      `mutation($id:ID!,$media:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$media){ media{ id } mediaUserErrors{ field message } } }`,
      { id: p.id, media: inputs }
    );
    const errs = created.productCreateMedia.mediaUserErrors;
    if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
    const newIds = created.productCreateMedia.media.map((m) => m.id);

    // 2. wait for processing
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(3000);
      const s = await q(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage{ id status } } }`, { ids: newIds });
      const st = s.nodes.map((n) => n?.status);
      if (st.includes('FAILED')) throw new Error('Shopify failed to process a new render; old gallery kept');
      ready = st.every((x) => x === 'READY');
    }
    if (!ready) throw new Error('new renders still processing after 90s; old gallery kept, re-check by hand');

    // 3. delete old media (detaches the variants from it)
    const oldIds = p.media.nodes.map((m) => m.id);
    if (oldIds.length) {
      await q(`mutation($id:ID!,$ids:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$ids){ deletedMediaIds mediaUserErrors{ message } } }`, { id: p.id, ids: oldIds });
    }

    // 4. variant -> first render of its colour (SKU is CODE-METAL-COLOUR[-c&b])
    const firstOf = {};
    renders.forEach((r, i) => (firstOf[r.colour] ??= newIds[i]));
    const variantMedia = p.variants.nodes
      .map((v) => ({ variantId: v.id, colour: (v.sku || '').split('-')[2]?.toUpperCase() }))
      .filter((v) => firstOf[v.colour])
      .map((v) => ({ variantId: v.variantId, mediaIds: [firstOf[v.colour]] }));
    if (variantMedia.length) {
      await q(
        `mutation($id:ID!,$vm:[ProductVariantAppendMediaInput!]!){ productVariantAppendMedia(productId:$id, variantMedia:$vm){ userErrors{ field message } } }`,
        { id: p.id, vm: variantMedia },
        'productVariantAppendMedia'
      );
    }
    console.log(`    done: ${newIds.length} new, ${oldIds.length} removed, ${variantMedia.length}/${p.variants.nodes.length} variants linked`);
  } catch (e) {
    failed++;
    console.log(`! ${code}: ${e.message}`);
  }
}

if (failed) {
  console.log(`\n${failed} product(s) need attention.`);
  process.exit(1);
}
