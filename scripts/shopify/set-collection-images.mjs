#!/usr/bin/env node
// Gives collections the same pictures the homepage uses for them, so the menu panels (which show
// each collection's image) match the homepage categories section.
//
//   node scripts/shopify/set-collection-images.mjs            preview
//   node scripts/shopify/set-collection-images.mjs --apply    set images on collections that have none
//   node scripts/shopify/set-collection-images.mjs --apply --force   also replace existing images
//
// Pairs are read from templates/index.json: any block with a background image that links to a
// collection (itself or through a button inside it).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, gql } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const cfg = config();
const log = (...m) => console.log(...m);

function homepagePairs() {
  const raw = readFileSync(resolve(cfg.repoRoot, 'templates/index.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  const template = JSON.parse(raw);
  const pairs = new Map(); // collection handle -> image file name

  const findCollection = (block) => {
    const own = Object.values(block.settings || {}).find((v) => typeof v === 'string' && v.startsWith('shopify://collections/'));
    if (own) return own.split('/').pop();
    for (const child of Object.values(block.blocks || {})) {
      const found = findCollection(child);
      if (found) return found;
    }
    return null;
  };

  const walk = (node) => {
    for (const block of Object.values(node.blocks || {})) {
      const image = Object.values(block.settings || {}).find((v) => typeof v === 'string' && v.startsWith('shopify://shop_images/'));
      const handle = image && findCollection(block);
      if (handle && !pairs.has(handle)) pairs.set(handle, image.replace('shopify://shop_images/', ''));
      walk(block);
    }
  };
  for (const section of Object.values(template.sections || {})) if (!section.disabled) walk(section);
  return pairs;
}

async function fileUrl(filename) {
  const data = await gql(
    cfg,
    `query($q: String!) { files(first: 5, query: $q) { nodes { ... on MediaImage { image { url } } ... on GenericFile { url } } } }`,
    { q: `filename:${filename}` }
  );
  const node = data.files.nodes.find((n) => n.image?.url || n.url);
  return node?.image?.url || node?.url || null;
}

try {
  const pairs = homepagePairs();
  log(`${apply ? 'Setting' : 'Preview of'} collection images on ${cfg.domain}${apply ? '' : '. Nothing will change; add --apply to write.'}\n`);
  for (const [handle, filename] of pairs) {
    const data = await gql(cfg, `query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id title image { url } } }`, { h: handle });
    const collection = data.collectionByIdentifier;
    if (!collection) {
      log(`  ! ${handle}: no such collection`);
      continue;
    }
    if (collection.image && !force) {
      log(`  = ${handle}: already has an image (use --force to replace it)`);
      continue;
    }
    const url = await fileUrl(filename);
    if (!url) {
      log(`  ! ${handle}: could not find the file ${filename} in Content > Files`);
      continue;
    }
    if (!apply) {
      log(`  + ${handle}: would use ${filename}`);
      continue;
    }
    await gql(
      cfg,
      `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`,
      { input: { id: collection.id, image: { src: url, altText: collection.title } } },
      'collectionUpdate'
    );
    log(`  + ${handle}: image set (${filename})`);
  }
  log('\nDone.');
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exit(1);
}
