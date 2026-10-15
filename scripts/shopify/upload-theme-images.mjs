#!/usr/bin/env node
// Moves the theme's photographs into Shopify's Content > Files, so the theme renders them with
// `file_url` / `file_img_url` instead of shipping them inside assets/. A picture in Files can be
// swapped in the admin without a theme deploy, and it does not count towards the theme's own file
// budget — assets/ was 62 MB of which 38 MB was photography.
//
//   node scripts/shopify/upload-theme-images.mjs                 preview what would be uploaded
//   node scripts/shopify/upload-theme-images.mjs --apply         upload anything not already there
//   node scripts/shopify/upload-theme-images.mjs --apply a.png   upload just the files named
//   node scripts/shopify/upload-theme-images.mjs --verify        check every one resolves in Files
//   node scripts/shopify/upload-theme-images.mjs --apply --prune  ...then delete the assets/ copies
//
// A file of the same name already in Shopify is reused, never uploaded twice, so this is safe to
// re-run. The resulting CDN URLs are written to a manifest under backups/ for reference.
//
// --prune only ever deletes a local file whose upload has been confirmed to resolve over HTTP, so
// a failed or half-finished upload cannot take the local copy with it. Nothing is pruned unless
// every file in the run verified, because the theme points the whole set at Files or none of it.
//
// WHAT STAYS IN assets/ AND WHY
//   - every icon-*.svg, mask-arch.svg, square.svg, loading-spinner.svg: inlined by
//     `inline_asset_content`, which reads the theme, not Files.
//   - eden-raine-logo*.png, -icon*.png, -monogram.png, -favicon.png: the brand marks. They are
//     small, they load on every page, and a logo that can go missing from the admin is a bad
//     trade for 116 KB.
//   - icon-flag.png, icon-flag-2x.png, sparkle.gif: named by `url()` inside assets/icon-flag.css
//     and assets/base.css. A .css file is not Liquid, so it cannot call file_url; pointing it at
//     Files would mean pasting a CDN URL with a version string into the stylesheet.

import { existsSync, unlinkSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { config, uploadImage, writeBackup } from './lib.mjs';

// Every photograph the theme renders. Keep this in step with the Liquid: a name here must be
// resolved with file_url/file_img_url in the theme, and a name resolved with asset_url/
// asset_img_url must not be here.
const DEFAULT_FILES = [
  // About page and the category tiles
  'about-collection-grey.png',
  'about-craft-workshop.png',
  'category-best-sellers.png',
  'category-bracelets.png',
  'category-earrings.png',
  'category-necklaces.png',
  'category-rings.png',
  'category-rings-grey.png',
  'category-wedding-bands.png',
  // Design Studio: the split banner's setting and its 3D stones
  'design-split-ring-setting.webp',
  'design-stone-emerald-3d.webp',
  'design-stone-marquise-3d.webp',
  'design-stone-oval-3d.webp',
  'design-stone-pear-3d.webp',
  'design-stone-round-3d.webp',
  // Design Studio builder: one render per cut
  'diamond-shape-asscher.png',
  'diamond-shape-cushion.png',
  'diamond-shape-emerald.png',
  'diamond-shape-heart.png',
  'diamond-shape-marquise.png',
  'diamond-shape-oval.png',
  'diamond-shape-pear.png',
  'diamond-shape-princess.png',
  'diamond-shape-radiant.png',
  'diamond-shape-round.png',
  // Mega menu featured cards
  'featured-diamonds-care.jpg',
  'featured-diamonds-education.jpg',
  'featured-diamonds-gemstones.jpg',
  'featured-diamonds-sizing.jpg',
  'featured-engagement-bridal.jpg',
  'featured-engagement-new.jpg',
  'featured-engagement-signature.jpg',
  'featured-engagement-value.jpg',
  'featured-jewellery-bracelets.jpg',
  'featured-jewellery-earrings.jpg',
  'featured-jewellery-necklaces.jpg',
  'featured-jewellery-studs.jpg',
  'featured-wedding-anniversary.jpg',
  'featured-wedding-eternity.jpg',
  'featured-wedding-new.jpg',
  // Guides and editorial
  'gemstones-hero.jpg',
  'gifting-banner-background.jpg',
  'ring-size-guide-original.png',
  // Lifestyle photography
  'lifestyle-bracelet.jpg',
  'lifestyle-earring.jpg',
  'lifestyle-emerald-earring.jpg',
  'lifestyle-heart-necklace.jpg',
  'lifestyle-marquise-bracelet.jpg',
  'lifestyle-necklace.jpg',
  'lifestyle-pear-necklace.jpg',
  'lifestyle-princess-ring.jpg',
  'lifestyle-radiant-bracelet.jpg',
  'lifestyle-round-necklace.jpg',
  // Mega menu and carousel tiles
  'menu-tile-anniversary-rings.png',
  'menu-tile-bangles-cuffs.png',
  'menu-tile-best-sellers.png',
  'menu-tile-climbers-jackets-cuffs.png',
  'menu-tile-curved-wedding-bands.png',
  'menu-tile-dangles-drops.png',
  'menu-tile-eternity-rings.png',
  'menu-tile-fashion-bracelets.png',
  'menu-tile-fashion-necklaces.png',
  'menu-tile-hoops-huggies.png',
  'menu-tile-mens-rings.png',
  'menu-tile-new-in.png',
  'menu-tile-pendants.png',
  'menu-tile-plain-metal-wedding-bands.png',
  'menu-tile-ready-to-ship.png',
  'menu-tile-signature-bracelets.png',
  'menu-tile-signature-earrings.png',
  'menu-tile-signature-necklaces.png',
  'menu-tile-stackable-rings.png',
  'menu-tile-studs.png',
  'menu-tile-tennis-bracelets.png',
  'menu-tile-tennis-necklaces.png',
  'menu-tile-wedding-bands.png',
  // Skin tone preview on the product page
  'pear-ring-hand-tone-1.jpg',
  'pear-ring-hand-tone-2.jpg',
  'pear-ring-hand-tone-3.jpg',
  'pear-ring-hand-tone-4.jpg',
  'pear-ring-hand-tone-5.jpg',
  'pear-ring-hand-tone-6.jpg',
  // The desktop mega menu's shape column: one outline per cut, one per ring setting, and one per
  // wedding band style. All three sets are built by name at render time (`shape-outline-` /
  // `ring-style-` / `band-style-` plus the menu item's handle in
  // snippets/header-menu-drawer-links.liquid), so the whole set has to be present or a column of
  // the menu shows broken pictures. The outlines are generated from the illustrator's originals
  // by scripts/images/normalise-shape-outlines.py.
  'band-style-anniversary.png',
  'band-style-eternity.png',
  'band-style-plain-metal.png',
  'band-style-wedding.png',
  'ring-style-bridal-sets.png',
  'ring-style-halo.png',
  'ring-style-hidden-halo.png',
  'ring-style-nature-inspired.png',
  'ring-style-promise.png',
  'ring-style-side-stone.png',
  'ring-style-solitaire.png',
  'ring-style-three-stone.png',
  'ring-style-toi-et-moi.png',
  'ring-style-vintage.png',
  'shape-outline-asscher.png',
  'shape-outline-cushion.png',
  'shape-outline-emerald.png',
  'shape-outline-heart.png',
  'shape-outline-marquise.png',
  'shape-outline-oval.png',
  'shape-outline-pear.png',
  'shape-outline-princess.png',
  'shape-outline-radiant.png',
  'shape-outline-round.png',
  // Ring setting styles, and the photograph each one swaps to on hover
  'style-bridal-sets.png',
  'style-halo.png',
  'style-halo-hover.jpg',
  'style-hidden-halo.png',
  'style-hidden-halo-hover.jpg',
  'style-nature-inspired.png',
  'style-nature-inspired-hover.jpg',
  'style-promise.png',
  'style-promise-hover.jpg',
  'style-side-stone.png',
  'style-side-stone-hover.jpg',
  'style-solitaire.png',
  'style-solitaire-hover.jpg',
  'style-three-stone.png',
  'style-three-stone-hover.jpg',
  'style-toi-et-moi.png',
  'style-vintage.png',
  'style-vintage-hover.jpg',
];

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const prune = args.includes('--prune');
const verifyOnly = args.includes('--verify');
const named = args.filter((a) => !a.startsWith('--'));
const files = named.length ? named : DEFAULT_FILES;
const cfg = config();

// A URL from fileCreate can be served before the image has finished processing, so a HEAD that
// 404s once is retried rather than failed.
async function resolves(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return true;
    } catch {
      // network hiccup; retried below
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return false;
}

// `file_img_url` looks a picture up by the name the theme asks for, so a URL is only good enough
// if it is on Shopify's CDN and still carries that exact name. Two things this catches: an upload
// whose processing poll timed out, which hands back the staged Google Storage URL rather than a
// CDN one, and a name Shopify had to change because something was already called that, where the
// upload succeeds but the theme's reference would quietly resolve to nothing.
function usable(url, filename) {
  let parsed;
  try {
    parsed = new URL(url, 'https://example.invalid');
  } catch {
    return { ok: false, why: 'not a URL' };
  }
  if (!/(^|\.)shopify(cdn)?\.com$/.test(parsed.hostname) && !parsed.hostname.endsWith('shopifycdn.net')) {
    return { ok: false, why: `not a Shopify CDN URL (${parsed.hostname})` };
  }
  const basename = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  if (basename !== filename) return { ok: false, why: `Shopify stored it as ${basename}` };
  return { ok: true };
}

try {
  const results = {};
  const missing = [];
  const failed = [];

  for (const filename of files) {
    const localPath = resolve(cfg.repoRoot, 'assets', filename);

    if (!apply && !verifyOnly) {
      if (existsSync(localPath)) console.log(`  . Would upload ${filename}`);
      else {
        missing.push(filename);
        console.log(`  ! Not in assets/: ${filename}`);
      }
      continue;
    }

    // --verify on its own asks Shopify what it already holds, so it works after a prune has
    // removed the local copies.
    const url = await uploadImage(cfg, verifyOnly ? null : localPath, filename, MIME[extname(filename).toLowerCase()] || 'image/png');
    if (!url) {
      missing.push(filename);
      console.log(`  ! Not in Files and not in assets/: ${filename}`);
      continue;
    }
    const check = usable(url, filename);
    if (!check.ok) {
      failed.push(filename);
      console.log(`  x ${filename}: ${check.why}`);
    } else if (!(await resolves(url))) {
      failed.push(filename);
      console.log(`  x In Files but the URL does not resolve: ${filename}`);
    } else {
      results[filename] = url;
    }
  }

  if (!apply && !verifyOnly) {
    console.log(`\n${files.length - missing.length} file(s) ready. Re-run with --apply to upload.`);
    if (missing.length) console.log(`Skipped (not found): ${missing.join(', ')}`);
    process.exit(0);
  }

  const ok = Object.keys(results).length;
  console.log(`\n${ok} of ${files.length} file(s) confirmed in Shopify Files.`);
  if (!verifyOnly) writeBackup(cfg, 'theme-images-in-files', results);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
  if (failed.length) console.log(`Did not resolve: ${failed.join(', ')}`);

  if (prune) {
    if (missing.length || failed.length) {
      console.log(
        '\nNothing pruned: the theme points this whole set at Files, so a local copy is only ' +
          'safe to delete once every file in the run has been confirmed. Fix the above and re-run.'
      );
      process.exit(1);
    }
    let gone = 0;
    for (const filename of Object.keys(results)) {
      const localPath = resolve(cfg.repoRoot, 'assets', filename);
      if (existsSync(localPath)) {
        unlinkSync(localPath);
        gone += 1;
      }
    }
    console.log(`Pruned ${gone} file(s) from assets/. They are served from Files from now on.`);
  }
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
}
