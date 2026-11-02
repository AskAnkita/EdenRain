// Read-only. Reports how metals and diamond shapes are actually stored on the products,
// so the card swatches (blocks/_card-product-metals.liquid, _card-product-shapes.liquid)
// can be wired to whatever the data really looks like. Makes no changes.
//
//   node scripts/shopify/inspect-product-options.mjs
//   node scripts/shopify/inspect-product-options.mjs --limit=500 --examples=5

import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const LIMIT = flag('limit', 250);
const EXAMPLES = flag('examples', 3);

const METALS = ['rose', 'white', 'yellow', 'platinum', 'silver', 'gold'];
const SHAPES = ['round', 'oval', 'cushion', 'emerald', 'princess', 'radiant', 'pear', 'marquise', 'asscher', 'heart'];

const QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        title
        handle
        tags
        options { name values }
        media(first: 12) { nodes { ... on MediaImage { alt image { url } } } }
        variants(first: 60) {
          nodes { title selectedOptions { name value } image { url } }
        }
      }
    }
  }
`;

const looksLike = (text, words) => words.some((w) => text.includes(w));
const filename = (url) => (url || '').split('/').pop().split('?')[0].toLowerCase();

const cfg = config();

const products = [];
let cursor = null;
while (products.length < LIMIT) {
  const data = await gql(cfg, QUERY, { cursor });
  products.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}

const stats = {
  total: products.length,
  optionNames: new Map(),
  metalOption: 0,
  shapeOption: 0,
  metalTags: 0,
  shapeTags: 0,
  anyVariantImage: 0,
  allVariantImages: 0,
  singleVariant: 0,
  mediaNamedByMetal: 0,
  multiMedia: 0,
};

const examples = { metalOption: [], variantImages: [], mediaNamed: [], nothing: [] };

for (const p of products) {
  const optionNames = p.options.map((o) => o.name);
  optionNames.forEach((n) => stats.optionNames.set(n, (stats.optionNames.get(n) || 0) + 1));

  const metalOpt = p.options.find((o) => looksLike(o.name.toLowerCase(), ['metal', 'color', 'colour', 'finish']));
  const shapeOpt = p.options.find((o) => looksLike(o.name.toLowerCase(), ['shape', 'cut', 'stone']));
  if (metalOpt && looksLike(metalOpt.values.join(' ').toLowerCase(), METALS)) stats.metalOption++;
  if (shapeOpt) stats.shapeOption++;

  const tagText = p.tags.join(' ').toLowerCase();
  if (looksLike(tagText, METALS)) stats.metalTags++;
  if (looksLike(tagText, SHAPES)) stats.shapeTags++;

  const variants = p.variants.nodes;
  const withImage = variants.filter((v) => v.image?.url);
  if (variants.length === 1) stats.singleVariant++;
  if (withImage.length > 0) stats.anyVariantImage++;
  if (variants.length > 1 && withImage.length === variants.length) stats.allVariantImages++;

  const media = p.media.nodes.filter(Boolean);
  if (media.length > 1) stats.multiMedia++;
  const namedByMetal = media.filter((m) =>
    looksLike(`${(m.alt || '').toLowerCase()} ${filename(m.image?.url)}`, ['rose', 'white-gold', 'whitegold', 'yellow', 'platinum', 'silver'])
  );
  if (namedByMetal.length > 1) stats.mediaNamedByMetal++;

  const record = {
    title: p.title,
    handle: p.handle,
    options: p.options.map((o) => `${o.name}: [${o.values.join(' | ')}]`),
    variants: variants.slice(0, 8).map((v) => `${v.title}  ->  ${v.image?.url ? 'own image' : 'NO image'}`),
    media: media.slice(0, 6).map((m) => `${filename(m.image?.url)}${m.alt ? `   alt="${m.alt}"` : ''}`),
    metalTags: p.tags.filter((t) => looksLike(t.toLowerCase(), METALS)),
    shapeTags: p.tags.filter((t) => looksLike(t.toLowerCase(), SHAPES)),
  };

  if (metalOpt && withImage.length > 1 && examples.variantImages.length < EXAMPLES) examples.variantImages.push(record);
  else if (metalOpt && examples.metalOption.length < EXAMPLES) examples.metalOption.push(record);
  else if (namedByMetal.length > 1 && examples.mediaNamed.length < EXAMPLES) examples.mediaNamed.push(record);
  else if (!metalOpt && !shapeOpt && examples.nothing.length < EXAMPLES) examples.nothing.push(record);
}

const pct = (n) => `${n} / ${stats.total} (${Math.round((n / stats.total) * 100)}%)`;

console.log(`\n=== ${stats.total} products sampled ===\n`);
console.log('Option names in use:');
[...stats.optionNames.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`   ${String(c).padStart(5)}  ${n}`));

console.log('\nWhat the card swatches could key off:');
console.log(`   metal-ish option with metal values : ${pct(stats.metalOption)}`);
console.log(`   shape-ish option                   : ${pct(stats.shapeOption)}`);
console.log(`   metal words in tags                : ${pct(stats.metalTags)}`);
console.log(`   shape words in tags                : ${pct(stats.shapeTags)}`);

console.log('\nImages (this is what makes a swatch clickable):');
console.log(`   only one variant                   : ${pct(stats.singleVariant)}`);
console.log(`   at least one variant has own image : ${pct(stats.anyVariantImage)}`);
console.log(`   every variant has own image        : ${pct(stats.allVariantImages)}`);
console.log(`   more than one product photo        : ${pct(stats.multiMedia)}`);
console.log(`   2+ photos named/alt'd by metal     : ${pct(stats.mediaNamedByMetal)}`);

const dump = (label, rows) => {
  if (!rows.length) return;
  console.log(`\n--- ${label} ---`);
  for (const r of rows) {
    console.log(`\n  ${r.title}  (${r.handle})`);
    r.options.forEach((o) => console.log(`     option   ${o}`));
    r.variants.forEach((v) => console.log(`     variant  ${v}`));
    r.media.forEach((m) => console.log(`     media    ${m}`));
    if (r.metalTags.length) console.log(`     tags(metal)  ${r.metalTags.join(', ')}`);
    if (r.shapeTags.length) console.log(`     tags(shape)  ${r.shapeTags.join(', ')}`);
  }
};

dump('Products with a metal option AND per-variant images (swatches already work here)', examples.variantImages);
dump('Products with a metal option but no per-variant images', examples.metalOption);
dump('Products whose photos look named by metal', examples.mediaNamed);
dump('Products with neither a metal nor a shape option', examples.nothing);
console.log('');
