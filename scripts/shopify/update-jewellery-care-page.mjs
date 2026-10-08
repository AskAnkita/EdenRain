/*
 * Fills the /pages/jewellery-care guide with its editorial content and photographs.
 *
 * The page sits on the 'guide' template (sections/guide-page.liquid), which reads
 * page.content and expects it in the shape the other guides use:
 *   1. An opening photo (<p><img src="..." alt="..."></p>), lifted into the split hero.
 *   2. A lead paragraph (<p>...</p>), lifted as the hero subtitle.
 *   3. <h2> chapters. A chapter carrying one picture is laid out as a two-column
 *      row, alternating side down the page; a chapter with only words or a table
 *      runs the full measure.
 *
 * Imagery: four slots, each looked for in assets/ first and falling back to a photograph
 * the store already holds. Drop a file named below into assets/ and re-run to use it.
 *
 * Usage:
 *   node scripts/shopify/update-jewellery-care-page.mjs            # Preview content
 *   node scripts/shopify/update-jewellery-care-page.mjs --apply    # Write to Shopify
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql, uploadImage } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

const CDN = 'https://cdn.shopify.com/s/files/1/0423/9668/0352/files';

// Each slot resolves in order: the photograph shot for this guide, then a stand-in already in
// the theme's assets/, then a URL. A theme asset is a local file, so it has to be uploaded to
// Content > Files before a page body can point at it - a /files/ URL for it does not exist
// until something puts it there.
const IMAGE_SLOTS = [
  { key: 'hero', asset: 'care-hero.jpg', standIn: null, url: `${CDN}/bespoke-jewellery-1.jpg` },
  { key: 'everyday', asset: 'care-everyday.jpg', standIn: 'lifestyle-bracelet.jpg' },
  { key: 'cleaning', asset: 'care-cleaning.jpg', standIn: 'featured-diamonds-care.jpg' },
  { key: 'storage', asset: 'care-storage.jpg', standIn: 'lifestyle-necklace.jpg' },
];

export function buildCareHtml(images) {
  return `<p><img src="${images.hero}" alt="Eden Raine fine jewellery care"></p>
<p>Lab-grown diamonds, sapphires and recycled gold are built to be worn, not saved for best. A few minutes of care a week, and a check once a year, is all it takes to keep a piece as bright as the day it was made.</p>

<h2>Everyday habits that keep it looking new</h2>
<p><img src="${images.everyday}" alt="Diamond tennis bracelet worn every day"></p>
<p>Most of what dulls a piece of jewellery is not damage, it is build-up. Hand cream, soap residue, hairspray and the natural oils of your skin settle in the gaps beneath a stone, and because a diamond draws light from underneath, a thin film there costs more sparkle than a scratch on the surface ever would.</p>
<p>Put your jewellery on last, once make-up, perfume and hairspray have dried, and take it off first at the end of the day. Rings come off for the gym, the garden, the washing-up and the swimming pool: chlorine attacks the alloys in gold over time, and a knock against a weight rack is the commonest way a prong is bent.</p>

<h2>Cleaning at home, step by step</h2>
<p><img src="${images.cleaning}" alt="Diamond eternity bands in white, yellow and rose gold"></p>
<p>A warm soapy soak once a week takes care of almost everything, and nothing in it will harm a lab-grown diamond, a sapphire or a solid gold setting.</p>
<ol>
<li><strong>Soak.</strong> Half fill a bowl with warm — not hot — water and add a drop of plain washing-up liquid. Leave the piece in it for ten to fifteen minutes to soften the film.</li>
<li><strong>Brush.</strong> Work gently around the setting with a soft baby toothbrush, paying attention to the underside of the stone and the gaps between the prongs, where the dullness actually sits.</li>
<li><strong>Rinse.</strong> Rinse in clean warm water. Do it in a bowl rather than under a running tap, so a wet ring that slips cannot reach the drain.</li>
<li><strong>Dry.</strong> Pat dry with a lint-free cloth and leave it to air a few minutes before putting it away. Water trapped under a stone will dry to a mark.</li>
</ol>
<p>Leave the toothpaste, bicarbonate of soda and bleach where they are. Toothpaste is an abrasive and will put a haze on polished gold; chlorine bleach attacks the alloy itself and the damage cannot be polished out.</p>

<h2>Care by metal</h2>
<p>What a piece is made of decides how it ages and what it needs.</p>
<table border="1" bordercolor="#ebe4df" width="100%" cellspacing="0" cellpadding="1">
<thead>
<tr>
<th>Metal</th>
<th>How it ages</th>
<th>What it needs</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>14K &amp; 18K yellow gold</strong></td>
<td>Keeps its colour; picks up fine surface marks with wear</td>
<td>Warm soapy water; an occasional professional polish</td>
</tr>
<tr>
<td><strong>White gold</strong></td>
<td>Plated in rhodium, which wears thin over the years and warms in tone</td>
<td>Re-plating every year or two restores the bright white</td>
</tr>
<tr>
<td><strong>Rose gold</strong></td>
<td>Very stable; the copper in the alloy deepens slightly with age</td>
<td>Warm soapy water; no special treatment</td>
</tr>
<tr>
<td><strong>Platinum</strong></td>
<td>Does not wear away but develops a soft matte patina</td>
<td>Soapy water; polish only if you prefer the bright finish</td>
</tr>
<tr>
<td><strong>Sterling silver</strong></td>
<td>Tarnishes on contact with air and humidity</td>
<td>A silver polishing cloth; store in a sealed pouch</td>
</tr>
</tbody>
</table>

<h2>Care by stone</h2>
<p>Hardness is not the whole story. A stone can be hard and still be sensitive to heat or to a sudden knock.</p>
<table border="1" bordercolor="#ebe4df" width="100%" cellspacing="0" cellpadding="1">
<thead>
<tr>
<th>Stone</th>
<th>Mohs hardness</th>
<th>Soapy water</th>
<th>Ultrasonic cleaner</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Diamond &amp; lab-grown diamond</strong></td>
<td>10</td>
<td>Yes</td>
<td>Yes, unless the setting is fragile</td>
</tr>
<tr>
<td><strong>Sapphire &amp; ruby</strong></td>
<td>9</td>
<td>Yes</td>
<td>Yes</td>
</tr>
<tr>
<td><strong>Emerald</strong></td>
<td>7.5 – 8</td>
<td>Yes, briefly</td>
<td>No — vibration opens existing fissures</td>
</tr>
<tr>
<td><strong>Cubic zirconia</strong></td>
<td>8 – 8.5</td>
<td>Yes</td>
<td>Yes</td>
</tr>
<tr>
<td><strong>Opal &amp; turquoise</strong></td>
<td>5 – 6.5</td>
<td>Wipe only, never soak</td>
<td>No</td>
</tr>
<tr>
<td><strong>Pearl &amp; shell</strong></td>
<td>2.5 – 4</td>
<td>Wipe with a damp cloth</td>
<td>No</td>
</tr>
</tbody>
</table>
<p>Pearls are the exception to nearly every rule: they are organic, porous, and dissolve in anything acidic. Wipe a strand with a soft damp cloth after wearing, never soak it, and have it restrung every year or two if you wear it often.</p>

<h2>Storing it safely</h2>
<p><img src="${images.storage}" alt="Oval diamond pendant on a fine chain"></p>
<p>A diamond will scratch everything else in the drawer, including other diamonds. Give each piece its own compartment, pouch or the box it arrived in, rather than letting a pile of rings and chains settle against one another.</p>
<p>Keep the store somewhere dry and out of direct sunlight. Chains travel best done up and laid flat, or threaded through a drinking straw, which stops a fine cable chain knotting itself in a bag. Silver likes a sealed pouch with an anti-tarnish strip; it tarnishes from the air itself, so the less air the better.</p>

<h2>When to have a piece checked</h2>
<p>Cleaning is something you can do at home. Checking the setting is not — a prong thins from the outside in, and by the time a stone feels loose it has usually been loose for a while.</p>
<ul>
<li><strong>Once a year</strong> for anything worn daily: an engagement ring, a wedding band, a pendant you never take off.</li>
<li><strong>Straight away</strong> if a stone rattles or catches on fabric, if a prong feels sharp against your fingertip, or if a claw looks flattened.</li>
<li><strong>After a knock</strong> — a hard strike against a door frame or a worktop can shift a stone even when nothing looks wrong.</li>
<li><strong>Before and after travel</strong> if a piece is going in hold luggage or being worn somewhere it will take a beating.</li>
</ul>

<h2>What to keep it away from</h2>
<ul>
<li><strong>Chlorine and bromine</strong> — swimming pools and hot tubs attack the alloys in gold and will, over time, make a setting brittle.</li>
<li><strong>Household cleaners</strong> — bleach, oven cleaner and limescale remover. Take rings off before you put gloves on, not after.</li>
<li><strong>Abrasives</strong> — toothpaste, bicarbonate of soda, scouring powder and paper towel all leave fine scratches on polished metal.</li>
<li><strong>Sudden heat</strong> — a hot bath, a sauna or a steam cleaner on a stone that has not been checked for fissures first.</li>
<li><strong>Weights and tools</strong> — the single commonest cause of a bent prong is a gym session with a ring still on.</li>
</ul>

<h2>Care at Eden Raine</h2>
<p>Every Eden Raine piece comes with complimentary cleaning and a setting check for as long as you own it. Our workshop also handles re-plating, resizing, restringing and the kind of repair that is better not left — a worn prong reset is a small job, a lost stone is not.</p>
<p><a href="/pages/contact">Talk to our team</a> to book a check, or read our <a href="/pages/gemstones">gemstone guide</a> for more on how each stone behaves.</p>`;
}

async function main() {
  const cfg = config();
  log(`Connecting to store: ${cfg.domain}`);

  const pageRes = await gql(
    cfg,
    `query {
      pages(first: 5, query: "handle:jewellery-care") {
        nodes { id title handle body templateSuffix }
      }
    }`
  );

  const page = pageRes.pages?.nodes?.[0];
  if (!page) throw new Error('Page /pages/jewellery-care not found in store.');

  log(`Found page: "${page.title}" (ID: ${page.id}, templateSuffix: "${page.templateSuffix}")`);
  log(`Current body length: ${page.body ? page.body.length : 0} characters (Blank: ${!page.body})`);

  const assetDir = resolve(repoRoot, 'assets');
  const images = {};

  log('\nResolving imagery...');
  for (const slot of IMAGE_SLOTS) {
    const chosen = [slot.asset, slot.standIn]
      .filter(Boolean)
      .find((name) => existsSync(resolve(assetDir, name)));

    if (!chosen) {
      images[slot.key] = slot.url;
      log(`  = ${slot.key}: nothing in assets/, using ${slot.url.split('/').pop()}`);
      continue;
    }
    if (chosen !== slot.asset) {
      log(`  = ${slot.key}: no assets/${slot.asset} yet, standing in assets/${chosen}`);
    }
    // Without --apply nothing is uploaded, so the preview shows where the file will land.
    images[slot.key] = apply ? await uploadImage(cfg, resolve(assetDir, chosen), chosen) : `${CDN}/${chosen}`;
  }

  const html = buildCareHtml(images);

  log(`\nPrepared HTML content (${html.length} characters):`);
  log('--------------------------------------------------');
  log(html.slice(0, 400) + '...\n[full content ready]');
  log('--------------------------------------------------');

  if (!apply) {
    log('\nPreview mode complete. To update the live Shopify page, run:');
    log('  node scripts/shopify/update-jewellery-care-page.mjs --apply\n');
    return;
  }

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = resolve(backupDir, `page-jewellery-care-before-update-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(page, null, 2));
  log(`\nSaved backup of page to ${backupFile}`);

  const updateRes = await gql(
    cfg,
    `mutation($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id title handle templateSuffix bodySummary }
        userErrors { field message }
      }
    }`,
    {
      id: page.id,
      page: {
        body: html,
        templateSuffix: 'guide',
      },
    },
    'pageUpdate'
  );

  log(`\nSuccessfully updated page /pages/jewellery-care!`);
  log(`Summary: ${updateRes.pageUpdate?.page?.bodySummary || '(no summary)'}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
