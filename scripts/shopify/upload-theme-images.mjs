#!/usr/bin/env node
// Puts theme picture files into Shopify's Content > Files, so the theme can render them with
// `file_url` instead of shipping them inside assets/. Pictures that live in Files can be swapped
// in the admin without a theme deploy, and they do not count towards the theme's own file budget.
//
//   node scripts/shopify/upload-theme-images.mjs                 preview what would be uploaded
//   node scripts/shopify/upload-theme-images.mjs --apply         upload anything not already there
//   node scripts/shopify/upload-theme-images.mjs --apply a.png   upload just the files named
//
// A file of the same name already in Shopify is reused, never uploaded twice, so this is safe to
// re-run. The resulting CDN URLs are written to a manifest under backups/ for reference.

import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { config, uploadImage, writeBackup } from './lib.mjs';

// The pictures the About page and the category tiles render. Everything else under assets/ is
// CSS, JS or an icon, which belongs in the theme rather than in Files.
const DEFAULT_FILES = [
  // Added for the About page and the category tiles (the grey-background set)
  'about-care-grey.png',
  'about-collection-grey.png',
  'about-craft-grey.png',
  'category-best-sellers-grey.png',
  'category-bracelets-grey.png',
  'category-earrings-grey.png',
  'category-necklaces-grey.png',
  'category-rings-grey.png',
  // Earlier renders of the same three About pillars, kept so they can be picked in the admin
  'about-care-generated.png',
  'about-collection-generated.png',
  'about-craft-generated.png',
  'about-craft-workshop.png',
  // Already on the About page, moved across so the whole page reads from Files
  'lifestyle-bracelet.jpg',
  'lifestyle-earring.jpg',
  'lifestyle-necklace.jpg',
  'lifestyle-heart-necklace.jpg',
  'gemstones-hero.jpg',
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const named = args.filter((a) => !a.startsWith('--'));
const files = named.length ? named : DEFAULT_FILES;
const cfg = config();

try {
  const results = {};
  const missing = [];

  for (const filename of files) {
    const localPath = resolve(cfg.repoRoot, 'assets', filename);
    if (!existsSync(localPath)) {
      missing.push(filename);
      console.log(`  ! Not in assets/: ${filename}`);
      continue;
    }
    if (!apply) {
      console.log(`  . Would upload ${filename}`);
      continue;
    }
    const url = await uploadImage(cfg, localPath, filename, MIME[extname(filename).toLowerCase()] || 'image/png');
    if (!url) throw new Error(`No URL came back for ${filename}`);
    results[filename] = url;
  }

  if (!apply) {
    console.log(`\n${files.length - missing.length} file(s) ready. Re-run with --apply to upload.`);
  } else {
    writeBackup(cfg, 'theme-images-in-files', results);
    console.log(`\nDone. ${Object.keys(results).length} file(s) in Shopify Files.`);
  }
  if (missing.length) console.log(`Skipped (not found): ${missing.join(', ')}`);
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
}
