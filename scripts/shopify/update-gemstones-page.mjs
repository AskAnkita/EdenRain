/*
 * Populates the /pages/gemstones guide with rich editorial content and images.
 *
 * Eden Raine's Education & Guides hub links to /pages/gemstones, which uses the
 * 'guide' template (sections/guide-page.liquid). That template expects page.content
 * to provide:
 *   1. A leading hero photo (<p><img src="..." alt="..."></p>) which it lifts into
 *      the split hero header.
 *   2. An introductory lead paragraph (<p>...</p>) which it lifts as the hero subtitle.
 *   3. Editorial sections (split by <h2> or image/text pairs) detailing:
 *      - The Big Three: Lab-Grown Sapphires, Emeralds & Rubies
 *      - Mohs Hardness & Everyday Wear Durability Guide
 *      - Lab-Grown vs. Mined: Ethical & Environmental Impact
 *      - How to Care for & Clean Your Gemstones
 *      - Choosing Your Gemstone
 *
 * Usage:
 *   node scripts/shopify/update-gemstones-page.mjs            # Preview content
 *   node scripts/shopify/update-gemstones-page.mjs --apply    # Write to Shopify
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

export function buildGemstonesHtml(images) {
  const heroImg = images.hero || 'https://cdn.shopify.com/s/files/1/0423/9668/0352/files/ER-lab-grown-mined-diamond_5d2e8ffa-1564-46a8-99ee-c25f98937cf3.jpg?v=1624534302';
  const sapphireImg = images.sapphire || heroImg;
  const emeraldImg = images.emerald || heroImg;
  const rubyImg = images.ruby || heroImg;

  return `<p><img src="${heroImg}" alt="Eden Raine Lab-Grown Gemstones"></p>
<p>Brilliant, ethically cultivated sapphires, emeralds, and rubies crafted with the exact physical, chemical, and optical composition of mined stones. Explore their vibrant hues, enduring durability, and conscious origins.</p>

<h2>The Beauty of Lab-Grown Gemstones</h2>
<p>At Eden Raine, every gemstone we set is cultured in a controlled, state-of-the-art laboratory environment. By recreating the intense heat, pressure, and mineral-rich conditions found deep within the earth's crust, our master growers cultivate genuine corundum (sapphires and rubies) and beryl (emeralds) of exceptional crystal purity.</p>
<p>Because they are grown under meticulous supervision, our gemstones display the vivid saturation and luminous clarity that are extraordinarily rare in mined stones—without the environmental disruption, open-pit mining, or unethical labor associated with traditional extraction.</p>

<h2>Lab-Grown Sapphires</h2>
<p><img src="${sapphireImg}" alt="Lab-Grown Royal Blue Sapphire"></p>
<p>Belonging to the corundum mineral family, sapphires are legendary for their velvety blue depths and aristocratic history. When grown in a laboratory, trace elements of iron and titanium are balanced to yield breathtaking royal blue, celestial cornflower, and pastel hues.</p>
<p>Measuring a formidable 9 on the Mohs hardness scale, sapphires are second only to diamonds in durability. This outstanding resilience makes them an exceptional choice for engagement rings, wedding bands, and signature heirloom pieces designed to be worn and cherished every day.</p>

<h2>Lab-Grown Emeralds</h2>
<p><img src="${emeraldImg}" alt="Lab-Grown Vivid Green Emerald"></p>
<p>Formed from the mineral beryl with rich infusions of chromium and vanadium, emeralds are celebrated worldwide for their lush, botanical green fires. Natural earth-mined emeralds are notorious for brittle fractures and deep inclusions (known as <em>jardin</em>), which often require chemical oils and resin stabilization.</p>
<p>Eden Raine hydrothermal lab-grown emeralds showcase the captivating green glow and classic crystal growth lines of the finest Colombian specimens, with superior structural integrity and clarity. Rated 7.5 to 8 on the Mohs scale, they deliver incomparable romance and sophistication.</p>

<h2>Lab-Grown Rubies</h2>
<p><img src="${rubyImg}" alt="Lab-Grown Vivid Red Pigeon Blood Ruby"></p>
<p>Also a variety of corundum, rubies owe their passionate crimson fire to trace amounts of chromium. Our lab-grown rubies showcase the coveted "pigeon’s blood" hue—an intense, pure red with natural fluorescent radiance that ignites vividly in sunlight.</p>
<p>With a Mohs hardness rating of 9, lab-grown rubies share the sapphire's exceptional resistance to scratching and chipping. They bring timeless warmth, drama, and symbolical courage to modern solitaires, three-stone rings, and eternity bands.</p>

<h2>Gemstone Hardness &amp; Durability Guide</h2>
<p>Choosing the right gemstone begins with understanding how each stone holds up to daily life. The Mohs scale measures a mineral's resistance to scratching on a scale from 1 to 10.</p>
<table border="1" bordercolor="#ebe4df" width="100%" cellspacing="0" cellpadding="1">
<thead>
<tr>
<th>Gemstone</th>
<th>Mineral Family</th>
<th>Mohs Hardness</th>
<th>Everyday Durability</th>
<th>Best Suited For</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Diamond</strong></td>
<td>Carbon</td>
<td>10 / 10</td>
<td>Exceptional (Hardest mineral)</td>
<td>Daily engagement rings, rings &amp; bands</td>
</tr>
<tr>
<td><strong>Sapphire</strong></td>
<td>Corundum</td>
<td>9 / 10</td>
<td>Superior (Scratch-resistant)</td>
<td>Engagement rings, daily rings &amp; bracelets</td>
</tr>
<tr>
<td><strong>Ruby</strong></td>
<td>Corundum</td>
<td>9 / 10</td>
<td>Superior (Scratch-resistant)</td>
<td>Engagement rings, anniversary bands</td>
</tr>
<tr>
<td><strong>Emerald</strong></td>
<td>Beryl</td>
<td>7.5 – 8 / 10</td>
<td>Good (Requires gentle care)</td>
<td>Cocktail rings, earrings, pendants &amp; sets</td>
</tr>
</tbody>
</table>

<h2>Lab-Grown vs. Mined: The Ethical Advantage</h2>
<p>While lab-grown gemstones are identical to mined gemstones in every optical, physical, and chemical measure, their origin makes a profound difference:</p>
<ul>
<li><strong>Zero Ecological Destruction:</strong> No open-pit excavation, riverbed dredging, or habitat deforestation.</li>
<li><strong>100% Conflict-Free:</strong> Complete supply-chain transparency from cultivation to master polishing.</li>
<li><strong>Remarkable Value:</strong> Enjoy stones of top-tier color saturation and carat weight at up to 40% to 60% less than mined equivalents of comparable grade.</li>
<li><strong>Recycled Precious Metals:</strong> All Eden Raine gemstone settings are cast in certified recycled 14K/18K gold and platinum.</li>
</ul>

<h2>Caring for Your Gemstones</h2>
<p>Fine gemstone jewellery is built to last for generations with simple, regular care:</p>
<ul>
<li><strong>Routine Cleaning:</strong> Soak your jewellery for 5 to 10 minutes in lukewarm water with a few drops of mild dish soap. Gently brush around the prongs and pavilion with a soft baby toothbrush, rinse clean, and pat dry with a lint-free cloth.</li>
<li><strong>Mindful Wear:</strong> Put your gemstone jewellery on last after applying cosmetics, hairspray, and perfume. Remove rings before rigorous workouts, gardening, swimming, or handling household cleaning detergents.</li>
<li><strong>Safe Storage:</strong> Because diamonds and sapphires can scratch other metals and softer stones, store each piece in its individual Eden Raine presentation box or a velvet-lined compartment.</li>
</ul>

<h2>Choosing Your Gemstone</h2>
<p>If you are deciding between a sapphire and a ruby for an engagement ring, or wondering whether an emerald will stand up to daily wear, the hardness table above is the place to start — and our team is happy to talk it through.</p>
<p><a href="/collections/all">Browse the collection</a> or <a href="/pages/contact">speak with an Eden Raine jewellery specialist</a> about a piece you have your eye on.</p>`;
}

async function main() {
  const cfg = config();
  log(`Connecting to store: ${cfg.domain}`);

  // Fetch current page
  const pageRes = await gql(
    cfg,
    `query {
      pages(first: 5, query: "handle:gemstones") {
        nodes {
          id title handle body templateSuffix
        }
      }
    }`
  );

  const page = pageRes.pages?.nodes?.[0];
  if (!page) {
    throw new Error('Page /pages/gemstones not found in store.');
  }

  log(`Found page: "${page.title}" (ID: ${page.id}, templateSuffix: "${page.templateSuffix}")`);
  log(`Current body length: ${page.body ? page.body.length : 0} characters (Blank: ${!page.body})`);

  // Check asset directory for generated images
  const assetDir = resolve(repoRoot, 'assets');
  const heroLocal = resolve(assetDir, 'gemstones-hero.jpg');
  const sapphireLocal = resolve(assetDir, 'gemstone-sapphire.jpg');
  const emeraldLocal = resolve(assetDir, 'gemstone-emerald.jpg');
  const rubyLocal = resolve(assetDir, 'gemstone-ruby.jpg');

  let images = {
    hero: 'https://cdn.shopify.com/s/files/1/0423/9668/0352/files/ER-lab-grown-mined-diamond_5d2e8ffa-1564-46a8-99ee-c25f98937cf3.jpg?v=1624534302',
    sapphire: null,
    emerald: null,
    ruby: null,
  };

  if (apply) {
    log('\nUploading gemstone imagery to Shopify files...');
    if (existsSync(heroLocal)) images.hero = await uploadImage(cfg, heroLocal, 'gemstones-hero.jpg');
    if (existsSync(sapphireLocal)) images.sapphire = await uploadImage(cfg, sapphireLocal, 'gemstone-sapphire.jpg');
    if (existsSync(emeraldLocal)) images.emerald = await uploadImage(cfg, emeraldLocal, 'gemstone-emerald.jpg');
    if (existsSync(rubyLocal)) images.ruby = await uploadImage(cfg, rubyLocal, 'gemstone-ruby.jpg');
  }

  const html = buildGemstonesHtml(images);

  log(`\nPrepared HTML Content (${html.length} characters):`);
  log('--------------------------------------------------');
  log(html.slice(0, 400) + '...\n[full content ready]');
  log('--------------------------------------------------');

  if (!apply) {
    log('\nPreview mode complete. To update the live Shopify page, run:');
    log('  node scripts/shopify/update-gemstones-page.mjs --apply\n');
    return;
  }

  // Backup existing page state
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = resolve(backupDir, `page-gemstones-before-update-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(page, null, 2));
  log(`\nSaved backup of page to ${backupFile}`);

  // Update page
  const updateRes = await gql(
    cfg,
    `mutation($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page {
          id
          title
          handle
          templateSuffix
          bodySummary
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      id: page.id,
      page: {
        body: html,
        templateSuffix: 'guide', // Ensures it stays on the editorial guide template
      },
    },
    'pageUpdate'
  );

  log(`\nSuccessfully updated page /pages/gemstones!`);
  log(`Summary: ${updateRes.pageUpdate?.page?.bodySummary || '(no summary)'}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
