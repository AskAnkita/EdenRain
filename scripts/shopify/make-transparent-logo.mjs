/*
 * Mats the white background out of a logo in Content > Files and puts the result
 * back as a transparent PNG.
 *
 * The sign-in page showed the wordmark inside a white rectangle. That is not a
 * colour setting and no branding field removes it: the file in use was
 * Eden_Raine_Logo_Fullm_-_PinkVWeb.jpg, and a JPEG has no alpha channel, so its
 * white background is part of the picture. Dropped onto the page's off-white it
 * reads as a white box around the logo.
 *
 * The transparent PNGs already in Files (Eden_Raine-web.png,
 * Eden-Raine-text2_FullColor.png, Eden_Raine_Logo_Full.png) all set LONDON in black,
 * so none of them is a like-for-like swap. This keeps the pink.
 *
 *   node scripts/shopify/make-transparent-logo.mjs            # preview, writes nothing
 *   node scripts/shopify/make-transparent-logo.mjs --apply    # upload to Files
 *
 *   SOURCE_LOGO=Eden_Raine_Logo_Fullm_-_PinkVWeb.jpg
 *   OUTPUT_LOGO=eden-raine-logo-transparent.png
 *
 * Alpha comes from how far each pixel sits from white, not from a flat colour key,
 * so the anti-aliased edges of the letterforms stay smooth instead of going jagged.
 * RGB is left untouched, which is what keeps LONDON the right pink - unpremultiplying
 * against white would wash it out. JPEG noise around the glyphs sits well below LO.
 *
 * Needs the app's write_files scope, which it already has, and Python with Pillow
 * for the pixel work.
 *
 * The source file in Files is never modified; this only ever adds a new one.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, gql, uploadImage } from './lib.mjs';

const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

const SOURCE = process.env.SOURCE_LOGO || 'Eden_Raine_Logo_Fullm_-_PinkVWeb.jpg';
const OUTPUT = process.env.OUTPUT_LOGO || 'eden-raine-logo-transparent.png';

// Distance from white, 0-255. At or below LO the pixel is background and goes fully
// clear; at or above HI it is artwork and stays fully opaque; between the two the
// alpha ramps, which is what keeps the edges smooth. The pink of LONDON sits around
// 74, well clear of HI.
const LO = Number(process.env.LOGO_ALPHA_LO || 10);
const HI = Number(process.env.LOGO_ALPHA_HI || 45);

const PY = `
import sys
from PIL import Image
src, dst, lo, hi = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB')
px = im.load()
out = Image.new('RGBA', im.size)
op = out.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b = px[x, y]
        d = 255 - min(r, g, b)
        a = 0 if d <= lo else (255 if d >= hi else int(255 * (d - lo) / (hi - lo)))
        op[x, y] = (r, g, b, a)
box = out.getchannel('A').getbbox()
if box:
    out = out.crop(box)
out.save(dst)
print('%d %d' % out.size)
`;

async function sourceUrl(cfg, filename) {
  const res = await gql(
    cfg,
    `query($q: String!) { files(first: 20, query: $q) { nodes { ... on MediaImage { image { url } } } } }`,
    { q: `filename:${filename}` }
  );
  for (const node of res.files?.nodes || []) {
    const url = node?.image?.url;
    if (!url) continue;
    if (decodeURIComponent(url.split('?')[0].split('/').pop() || '') === filename) return url;
  }
  return null;
}

try {
  const cfg = await config();

  const url = await sourceUrl(cfg, SOURCE);
  if (!url) {
    log(`No file named ${SOURCE} in Content > Files.`);
    process.exit(1);
  }

  // The downloaded image and the script that reads it go in separate directories.
  // Python puts the script's own directory on sys.path, so keeping the download out
  // of it means nothing that arrived over the network can be imported - a file
  // called json.py landing beside the script would otherwise be picked up by an
  // ordinary `import json`. (-I would do the same job, but Pillow is installed in
  // the user site-packages that -I switches off.)
  const dir = mkdtempSync(join(tmpdir(), 'logo-img-'));
  const scriptDir = mkdtempSync(join(tmpdir(), 'logo-bin-'));
  const src = join(dir, SOURCE);
  const dst = join(dir, OUTPUT);
  const script = join(scriptDir, 'matte.py');

  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(src, bytes);
  writeFileSync(script, PY);
  log(`Source: ${SOURCE} (${bytes.length} bytes)`);

  let size;
  try {
    size = execFileSync('python3', [script, src, dst, String(LO), String(HI)], {
      encoding: 'utf8',
      cwd: scriptDir,
    }).trim();
  } catch (err) {
    log('Could not run the conversion. Pillow is needed: python3 -m pip install Pillow');
    log(String(err.stderr || err.message).trim());
    process.exit(1);
  }

  if (!existsSync(dst)) {
    log('The conversion produced no file.');
    process.exit(1);
  }
  log(`Matted and trimmed to ${size.replace(' ', 'x')} -> ${dst}`);

  if (!apply) {
    log('');
    log(`Preview only. Open the file above to check it, then re-run with --apply`);
    log(`to upload it to Files as ${OUTPUT}.`);
    process.exit(0);
  }

  const uploaded = await uploadImage(cfg, dst, OUTPUT, 'image/png');
  log(`In Files as ${OUTPUT}`);
  log(uploaded);
  log('');
  log('Point the sign-in page at it with:');
  log(`  SIGNIN_LOGO=${OUTPUT} node scripts/shopify/brand-sign-in-page.mjs --apply`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
