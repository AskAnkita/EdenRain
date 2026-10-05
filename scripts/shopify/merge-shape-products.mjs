#!/usr/bin/env node
// Folds products that are the same ring in a different centre-stone shape into one product with a
// "Shape" option, so the shape icons the cards and the product page already draw come from real
// variants instead of two separate listings.
//
//   node scripts/shopify/merge-shape-products.mjs                   preview only, changes nothing
//   node scripts/shopify/merge-shape-products.mjs --apply           do the merge
//   node scripts/shopify/merge-shape-products.mjs --group=twist-engagement-ring --apply
//   node scripts/shopify/merge-shape-products.mjs --apply --keep-donors   leave the folded-in products Active
//
// What a merge does to the keeper product:
//   - adds a "Shape" option in position 1, every existing variant taking the keeper's own shape
//   - copies each donor's photos across, and rewrites every photo's media-grouping alt text from
//     "#Jewelry material_Gold" to "#Jewelry material_Pear Gold", so product-metal-media.js filters
//     the gallery by shape *and* metal without any change to the theme's JS
//   - creates one variant per (donor shape x donor material), keeping the donor's own price, SKU,
//     weight and photo
//   - takes the union of the tags, so the tag-driven shape collections
//     (cushion-engagement-rings, pear-engagement-rings, ...) each keep listing it
//   - sets the merged title, handle and description from MERGES below
//
// And to each donor: status ARCHIVED (reversible, and its order history stays intact) plus a
// /products/<donor> -> /products/<keeper> redirect so the old link never 404s. A redirect is also
// created for the keeper's previous handle when the merge renames it.
//
// Nothing is deleted. Before any change, the full before-state of every product involved is
// written to scripts/shopify/backups/ (git-ignored). Re-running is safe: each step checks whether
// it has already been done.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

// ---------- what to merge ----------

// `keep` and `donors` are SKU prefixes (the style codes). `shape` is the option value that product
// becomes — it has to contain one of the shape names the theme ships an icon for (round, oval,
// cushion, emerald, princess, radiant, asscher, heart, marquise, pear) or the icon falls back to
// plain text.
const MERGES = [
  {
    id: 'twist-engagement-ring',
    option: 'Shape',
    keep: { sku: 'AJLR257', shape: 'Cushion' },
    donors: [{ sku: 'AJLR262', shape: 'Pear' }],
    title: '2.2 CTW Lab-Grown Diamond Twist Engagement Ring',
    handle: '2-2-ctw-lab-grown-diamond-twist-engagement-ring',
    descriptionHtml: [
      '<p><strong>Description</strong></p>',
      '<p>A lab-grown diamond raised in fine claws above a band that splits and crosses beneath it,',
      ' each strand pavé-set with round accents. Choose the cushion cut for a soft, square outline or',
      ' the pear for a tapered one — the twisted shoulders are the same on both.</p>',
      '<p>The twist lifts the centre stone and carries light along the shoulders, so the ring sparkles',
      ' even where there is no large stone.</p>',
      '<p><strong>Cushion cut</strong></p>',
      '<ul>',
      '<li>Shape: Cushion Cut</li>',
      '<li>Carat: 2.27 CTW</li>',
      '<li>Measurement: 7 mm centre, 0.9–1 mm accents</li>',
      '<li>Diamonds: 67</li>',
      '<li>Metal Weight: Silver 2.8 g, 14K 3.4 g, 18K 4.1 g</li>',
      '</ul>',
      '<p><strong>Pear cut</strong></p>',
      '<ul>',
      '<li>Shape: Pear Cut</li>',
      '<li>Carat: 2.29 CTW</li>',
      '<li>Measurement: 9 x 7 mm centre, 0.9–1 mm accents</li>',
      '<li>Diamonds: 75</li>',
      '<li>Metal Weight: Silver 3 g, 14K 3.7 g, 18K 4.4 g</li>',
      '</ul>',
      '<p><strong>Both shapes</strong></p>',
      '<ul>',
      '<li>Color: E-F</li>',
      '<li>Clarity: VVS-VS</li>',
      '<li>Metal: 925 Sterling Silver, 10K, 14K &amp; 18K Gold</li>',
      '<li>Style: Twist Engagement Ring</li>',
      '</ul>',
    ].join(''),
  },
];

// ---------- arguments ----------

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keepDonors = args.includes('--keep-donors');
const onlyGroup = (args.find((a) => a.startsWith('--group=')) || '').split('=')[1] || null;

const cfg = config();
const log = (...m) => console.log(...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- reading the store ----------

const PRODUCT_FIELDS = `
  id handle title status descriptionHtml tags vendor productType
  options { id name position optionValues { id name } }
  media(first: 100) {
    nodes {
      id alt mediaContentType status
      ... on MediaImage { image { url width height } }
    }
  }
  variants(first: 100) {
    nodes {
      id title sku price compareAtPrice taxable barcode inventoryPolicy
      selectedOptions { name value }
      media(first: 1) { nodes { id alt } }
      inventoryItem {
        tracked requiresShipping
        measurement { weight { value unit } }
      }
    }
  }
  collections(first: 50) { nodes { id handle title ruleSet { rules { column } } } }
`;

// The style code is the SKU prefix, which is also in every photo's filename, so a plain product
// search finds it whichever field Shopify happens to index.
async function productBySkuPrefix(prefix) {
  const data = await gql(
    cfg,
    `query($q: String!) { products(first: 20, query: $q) { nodes { ${PRODUCT_FIELDS} } } }`,
    { q: prefix }
  );
  const matches = data.products.nodes.filter((p) =>
    p.variants.nodes.some((v) => (v.sku || '').toUpperCase().startsWith(prefix.toUpperCase()))
  );
  if (matches.length === 0) throw new Error(`No product has a variant whose SKU starts with "${prefix}".`);
  if (matches.length > 1) {
    throw new Error(
      `"${prefix}" matches more than one product (${matches.map((p) => p.handle).join(', ')}); ` +
        'merge those by hand or make the SKU prefixes distinct.'
    );
  }
  return matches[0];
}

// ---------- the pieces of a merge ----------

const optionValues = (product, name) => {
  const option = product.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
  return option ? option.optionValues.map((v) => v.name) : null;
};

const materialOption = (product, shapeOptionName) =>
  product.options.find((o) => o.name.toLowerCase() !== shapeOptionName.toLowerCase());

// "#Jewelry material_Gold" -> "#Jewelry material_Pear Gold". The group name is only ever compared
// to itself (product-metal-media.js matches a variant's photo group against each photo's), so the
// shape can be folded into it freely; what matters is that cushion and pear end up in different
// groups. Media with no "#" group is left alone — the theme never hides those.
function scopedAlt(alt, shape) {
  const text = (alt || '').trim();
  const match = text.match(/^#([^_]+)_(.*)$/);
  if (!match) return null;
  const [, prefix, rest] = match;
  if (rest.toLowerCase().startsWith(`${shape.toLowerCase()} `)) return text; // already scoped
  return `#${prefix}_${shape} ${rest}`;
}

function describeProduct(product) {
  return `${product.handle} ("${product.title}", ${product.status}, ${product.variants.nodes.length} variants, ${product.media.nodes.length} photos)`;
}

// Everything a merge would change, worked out before anything is written.
function planMerge(merge, keeper, donors) {
  const shapeName = merge.option;
  const keeperMaterial = materialOption(keeper, shapeName);
  if (!keeperMaterial) throw new Error(`${keeper.handle} has no option other than "${shapeName}".`);

  const problems = [];
  const ungrouped = [];

  for (const product of [keeper, ...donors.map((d) => d.product)]) {
    const material = materialOption(product, shapeName);
    if (!material) {
      problems.push(`${product.handle} has no material option`);
      continue;
    }
    if (material.name !== keeperMaterial.name) {
      problems.push(
        `${product.handle} calls its material option "${material.name}" but ${keeper.handle} calls it "${keeperMaterial.name}"`
      );
    }
    for (const m of product.media.nodes) {
      if (!scopedAlt(m.alt, 'x')) ungrouped.push(`${product.handle}: ${(m.image?.url || m.id).split('/').pop()}`);
    }
  }

  const existingShapes = optionValues(keeper, shapeName) || [];
  const newMedia = [];
  const newVariants = [];
  const tags = new Set(keeper.tags);
  const collectionsToJoin = [];
  const keeperSkus = new Set(keeper.variants.nodes.map((v) => v.sku));

  for (const donor of donors) {
    const { product, shape } = donor;
    for (const m of product.media.nodes) {
      if (m.mediaContentType !== 'IMAGE' || !m.image?.url) {
        problems.push(`${product.handle} has a ${m.mediaContentType} (${m.id}); only photos are copied`);
        continue;
      }
      newMedia.push({ donorMediaId: m.id, url: m.image.url, alt: scopedAlt(m.alt, shape) || m.alt, shape });
    }
    for (const v of product.variants.nodes) {
      const material = v.selectedOptions.find((o) => o.name === materialOption(product, shapeName).name);
      if (!material) {
        problems.push(`${product.handle} variant ${v.sku} has no ${keeperMaterial.name} value`);
        continue;
      }
      if (keeperSkus.has(v.sku)) continue; // already merged on an earlier run
      newVariants.push({
        shape,
        material: material.value,
        donorMediaId: v.media.nodes[0]?.id || null,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        taxable: v.taxable,
        barcode: v.barcode,
        inventoryPolicy: v.inventoryPolicy,
        sku: v.sku,
        tracked: v.inventoryItem?.tracked ?? false,
        requiresShipping: v.inventoryItem?.requiresShipping ?? true,
        weight: v.inventoryItem?.measurement?.weight || null,
      });
      if (!optionValues(keeper, keeperMaterial.name).includes(material.value)) {
        problems.push(
          `${product.handle} has the ${keeperMaterial.name} "${material.value}", which ${keeper.handle} does not — it will be added`
        );
      }
    }
    for (const t of product.tags) tags.add(t);
    for (const c of product.collections.nodes) {
      const automated = Boolean(c.ruleSet);
      const alreadyIn = keeper.collections.nodes.some((k) => k.id === c.id);
      if (!automated && !alreadyIn) collectionsToJoin.push(c);
    }
  }

  const renames = [];
  if (merge.title && merge.title !== keeper.title) renames.push(['title', keeper.title, merge.title]);
  if (merge.handle && merge.handle !== keeper.handle) renames.push(['handle', keeper.handle, merge.handle]);
  if (merge.descriptionHtml && merge.descriptionHtml !== keeper.descriptionHtml)
    renames.push(['description', `${keeper.descriptionHtml.length} characters`, `${merge.descriptionHtml.length} characters`]);

  const redirects = donors.map((d) => [`/products/${d.product.handle}`, `/products/${merge.handle || keeper.handle}`]);
  if (merge.handle && merge.handle !== keeper.handle)
    redirects.unshift([`/products/${keeper.handle}`, `/products/${merge.handle}`]);

  return {
    shapeName,
    materialName: keeperMaterial.name,
    needsShapeOption: !existingShapes.length,
    shapeValuesToAdd: [merge.keep.shape, ...donors.map((d) => d.shape)].filter(
      (s) => !existingShapes.includes(s)
    ),
    newMedia,
    newVariants,
    tags: [...tags],
    addedTags: [...tags].filter((t) => !keeper.tags.includes(t)),
    collectionsToJoin,
    renames,
    redirects,
    problems,
    ungrouped,
  };
}

// ---------- writing ----------

async function addShapeOption(keeper, plan, shape) {
  const data = await gql(
    cfg,
    `mutation($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options, variantStrategy: LEAVE_AS_IS) {
        product { options { id name position optionValues { id name } } }
        userErrors { field message }
      }
    }`,
    {
      productId: keeper.id,
      options: [{ name: plan.shapeName, position: 1, values: [{ name: shape }] }],
    },
    'productOptionsCreate'
  );
  return data.productOptionsCreate.product.options;
}

async function addShapeValues(keeper, optionId, values) {
  await gql(
    cfg,
    `mutation($productId: ID!, $option: OptionUpdateInput!, $add: [OptionValueCreateInput!]) {
      productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $add, variantStrategy: LEAVE_AS_IS) {
        userErrors { field message }
      }
    }`,
    { productId: keeper.id, option: { id: optionId }, add: values.map((name) => ({ name })) },
    'productOptionUpdate'
  );
}

async function copyMedia(keeper, newMedia) {
  const created = [];
  // Shopify caps a media batch; stay well under it and keep the submitted order so each new
  // photo can be matched back to the donor photo it came from.
  for (let i = 0; i < newMedia.length; i += 10) {
    const batch = newMedia.slice(i, i + 10);
    const data = await gql(
      cfg,
      `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id status } }
          mediaUserErrors { field message }
          userErrors { field message }
        }
      }`,
      {
        productId: keeper.id,
        media: batch.map((m) => ({ originalSource: m.url, alt: m.alt, mediaContentType: 'IMAGE' })),
      },
      'productCreateMedia'
    );
    const errors = data.productCreateMedia.mediaUserErrors || [];
    if (errors.length) throw new Error(`productCreateMedia: ${errors.map((e) => e.message).join('; ')}`);
    const made = data.productCreateMedia.media;
    if (made.length !== batch.length)
      throw new Error(`Asked Shopify for ${batch.length} photos and got ${made.length} back.`);
    made.forEach((m, index) => created.push({ ...batch[index], newMediaId: m.id }));
  }
  return created;
}

// A copied photo is fetched and processed in the background; it cannot be attached to a variant
// until it is READY.
async function waitForMedia(ids) {
  const pending = new Set(ids);
  for (let attempt = 1; attempt <= 40 && pending.size; attempt++) {
    const data = await gql(
      cfg,
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { id status } } }`,
      { ids: [...pending] }
    );
    for (const node of data.nodes) {
      if (!node) continue;
      if (node.status === 'READY') pending.delete(node.id);
      if (node.status === 'FAILED') throw new Error(`Shopify could not process a copied photo (${node.id}).`);
    }
    if (pending.size) await sleep(1500);
  }
  if (pending.size) throw new Error(`${pending.size} copied photo(s) were still processing after a minute.`);
}

async function rescopeExistingAlts(keeper, shape) {
  const files = [];
  for (const m of keeper.media.nodes) {
    const next = scopedAlt(m.alt, shape);
    if (next && next !== m.alt.trim()) files.push({ id: m.id, alt: next });
  }
  if (!files.length) return 0;
  await gql(
    cfg,
    `mutation($files: [FileUpdateInput!]!) {
      fileUpdate(files: $files) { files { id } userErrors { field message } }
    }`,
    { files },
    'fileUpdate'
  );
  return files.length;
}

async function createVariants(keeper, plan, copied) {
  const byDonorMedia = new Map(copied.map((m) => [m.donorMediaId, m.newMediaId]));
  const variants = plan.newVariants.map((v) => {
    const input = {
      optionValues: [
        { optionName: plan.shapeName, name: v.shape },
        { optionName: plan.materialName, name: v.material },
      ],
      price: v.price,
      taxable: v.taxable,
      inventoryPolicy: v.inventoryPolicy,
      inventoryItem: {
        sku: v.sku,
        tracked: v.tracked,
        requiresShipping: v.requiresShipping,
      },
    };
    if (v.compareAtPrice) input.compareAtPrice = v.compareAtPrice;
    if (v.barcode) input.barcode = v.barcode;
    if (v.weight) input.inventoryItem.measurement = { weight: { value: v.weight.value, unit: v.weight.unit } };
    const mediaId = v.donorMediaId ? byDonorMedia.get(v.donorMediaId) : null;
    if (mediaId) input.mediaId = mediaId;
    return input;
  });

  const created = [];
  for (let i = 0; i < variants.length; i += 25) {
    const data = await gql(
      cfg,
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
          productVariants { id title sku }
          userErrors { field message }
        }
      }`,
      { productId: keeper.id, variants: variants.slice(i, i + 25) },
      'productVariantsBulkCreate'
    );
    created.push(...data.productVariantsBulkCreate.productVariants);
  }
  return created;
}

async function updateKeeper(keeper, merge, plan) {
  const input = { id: keeper.id, tags: plan.tags };
  if (merge.title) input.title = merge.title;
  if (merge.handle) input.handle = merge.handle;
  if (merge.descriptionHtml) input.descriptionHtml = merge.descriptionHtml;
  await gql(
    cfg,
    `mutation($input: ProductUpdateInput!) {
      productUpdate(product: $input) { product { id handle title } userErrors { field message } }
    }`,
    { input },
    'productUpdate'
  );
}

async function joinCollections(keeper, collections) {
  for (const c of collections) {
    await gql(
      cfg,
      `mutation($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
      }`,
      { id: c.id, productIds: [keeper.id] },
      'collectionAddProducts'
    );
  }
}

async function archive(product) {
  await gql(
    cfg,
    `mutation($input: ProductUpdateInput!) {
      productUpdate(product: $input) { product { id status } userErrors { field message } }
    }`,
    { input: { id: product.id, status: 'ARCHIVED' } },
    'productUpdate'
  );
}

async function createRedirect(path, target) {
  try {
    await gql(
      cfg,
      `mutation($redirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $redirect) { urlRedirect { id path target } userErrors { field message } }
      }`,
      { redirect: { path, target } },
      'urlRedirectCreate'
    );
    return 'created';
  } catch (error) {
    // A redirect for this path already exists, which is the state we wanted anyway.
    if (/already|taken|exists/i.test(error.message)) return 'already there';
    throw error;
  }
}

// ---------- run ----------

function backup(groups) {
  const dir = resolve(cfg.repoRoot, 'scripts/shopify/backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(dir, `merge-shape-products-${stamp}.json`);
  writeFileSync(file, JSON.stringify(groups, null, 2));
  return file;
}

async function main() {
  const wanted = onlyGroup ? MERGES.filter((m) => m.id === onlyGroup) : MERGES;
  if (!wanted.length) {
    log(`No merge group called "${onlyGroup}". Known groups: ${MERGES.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }

  const groups = [];
  for (const merge of wanted) {
    const keeper = await productBySkuPrefix(merge.keep.sku);
    const donors = [];
    for (const d of merge.donors) donors.push({ ...d, product: await productBySkuPrefix(d.sku) });
    groups.push({ merge, keeper, donors, plan: planMerge(merge, keeper, donors) });
  }

  for (const { merge, keeper, donors, plan } of groups) {
    log(`\n=== ${merge.id} ===`);
    log(`  keep   ${describeProduct(keeper)} as "${merge.keep.shape}"`);
    for (const d of donors) log(`  fold   ${describeProduct(d.product)} as "${d.shape}"`);
    log(`  option "${plan.shapeName}" ${plan.needsShapeOption ? 'to be created in position 1' : 'already exists'}` +
      (plan.shapeValuesToAdd.length ? `, values to add: ${plan.shapeValuesToAdd.join(', ')}` : ''));
    log(`  photos ${plan.newMedia.length} copied across; all of the keeper's alt groups get "${merge.keep.shape} " folded in`);
    log(`  variants ${plan.newVariants.length} to create:`);
    for (const v of plan.newVariants) log(`           ${v.shape} / ${v.material.padEnd(20)} ${String(v.price).padStart(8)}  ${v.sku}`);
    if (plan.addedTags.length) log(`  tags   + ${plan.addedTags.join(', ')}`);
    for (const [field, from, to] of plan.renames) log(`  ${field.padEnd(6)} "${from}" -> "${to}"`);
    if (plan.collectionsToJoin.length)
      log(`  joins  ${plan.collectionsToJoin.map((c) => c.handle).join(', ')} (the tag-driven ones follow the tags)`);
    for (const [path, target] of plan.redirects) log(`  redirect ${path} -> ${target}`);
    log(`  donors ${keepDonors ? 'left Active (--keep-donors)' : 'set to ARCHIVED'}`);
    if (plan.ungrouped.length) {
      log(`  ! ${plan.ungrouped.length} photo(s) carry no "#..._..." media group, so they will show for every shape:`);
      for (const u of plan.ungrouped) log(`      ${u}`);
    }
    for (const p of plan.problems) log(`  ! ${p}`);
  }

  if (!apply) {
    log('\nPreview only — nothing was changed. Re-run with --apply to do the merge.');
    return;
  }

  log(`\nBefore-state written to ${backup(groups)}`);

  for (const { merge, keeper, donors, plan } of groups) {
    log(`\n=== applying ${merge.id} ===`);

    let shapeOptionId = keeper.options.find((o) => o.name.toLowerCase() === plan.shapeName.toLowerCase())?.id;
    if (!shapeOptionId) {
      const options = await addShapeOption(keeper, plan, merge.keep.shape);
      shapeOptionId = options.find((o) => o.name.toLowerCase() === plan.shapeName.toLowerCase()).id;
      log(`  added the "${plan.shapeName}" option; every existing variant is now "${merge.keep.shape}"`);
    }

    const haveValues = optionValues(keeper, plan.shapeName) || [merge.keep.shape];
    const missing = donors.map((d) => d.shape).filter((s) => !haveValues.includes(s));
    if (missing.length) {
      await addShapeValues(keeper, shapeOptionId, missing);
      log(`  added the shape value(s) ${missing.join(', ')}`);
    }

    const rescoped = await rescopeExistingAlts(keeper, merge.keep.shape);
    if (rescoped) log(`  rewrote ${rescoped} of the keeper's photo alt groups to "${merge.keep.shape} ..."`);

    let copied = [];
    if (plan.newMedia.length) {
      copied = await copyMedia(keeper, plan.newMedia);
      log(`  copied ${copied.length} photo(s) across; waiting for Shopify to process them`);
      await waitForMedia(copied.map((m) => m.newMediaId));
      log('  photos ready');
    }

    if (plan.newVariants.length) {
      const created = await createVariants(keeper, plan, copied);
      log(`  created ${created.length} variant(s)`);
    }

    await updateKeeper(keeper, merge, plan);
    log(`  updated the keeper's title, handle, description and tags`);

    if (plan.collectionsToJoin.length) {
      await joinCollections(keeper, plan.collectionsToJoin);
      log(`  added it to ${plan.collectionsToJoin.map((c) => c.handle).join(', ')}`);
    }

    for (const [path, target] of plan.redirects) {
      const how = await createRedirect(path, target);
      log(`  redirect ${path} -> ${target} (${how})`);
    }

    if (!keepDonors) {
      for (const d of donors) {
        await archive(d.product);
        log(`  archived ${d.product.handle}`);
      }
    }
  }

  log('\nDone. Open the keeper product on the storefront and check that picking a shape swaps the gallery.');
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
