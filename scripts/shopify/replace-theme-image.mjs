#!/usr/bin/env node
// Swaps the contents of a picture already in Content > Files for the copy in assets/, keeping the
// file's name. `upload-theme-images.mjs` deliberately never uploads over something already up
// there - it is meant to be re-run - so it is no use when a drawing has actually been redrawn.
//
//   node scripts/shopify/replace-theme-image.mjs shape-outline-heart.png        preview
//   node scripts/shopify/replace-theme-image.mjs --apply shape-outline-heart.png
//
// Shopify's `fileUpdate` keeps the file's id and its name, so every `images['...']` lookup in the
// theme goes on resolving and nothing has to be re-pointed; only the bytes and the CDN version
// string change. Caches hold the old picture for a few minutes afterwards.
//
// Before anything is written, the URL of each file about to be replaced is saved to backups/ and
// the old bytes are downloaded beside it, so a swap can be undone by re-running this against the
// saved copy.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { config, gql, writeBackup } from './lib.mjs';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const names = args.filter((a) => !a.startsWith('--')).map((a) => basename(a));

if (!names.length) {
  console.error('Name at least one file, e.g. shape-outline-heart.png');
  process.exit(1);
}

const cfg = config();

// `filename:` matches loosely, so the basename of every result is checked rather than the first
// one taken: a query for shape-outline-heart.png also comes back with shape-outline-heart-2.png.
async function findFile(filename) {
  const res = await gql(
    cfg,
    `query($q: String!) {
      files(first: 20, query: $q) {
        nodes {
          id
          fileStatus
          ... on MediaImage { image { url width height } }
        }
      }
    }`,
    { q: `filename:${filename}` }
  );
  for (const node of res.files?.nodes || []) {
    const url = node?.image?.url;
    if (!url) continue;
    if (decodeURIComponent(url.split('?')[0].split('/').pop() || '') === filename) return { ...node, url };
  }
  return null;
}

async function stage(localPath, filename, mimeType) {
  const staged = await gql(
    cfg,
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input: [{ filename, mimeType, resource: 'IMAGE', httpMethod: 'POST' }] },
    'stagedUploadsCreate'
  );
  const target = staged.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error(`Could not stage an upload for ${filename}`);

  const form = new FormData();
  for (const param of target.parameters) form.append(param.name, param.value);
  form.append('file', new Blob([readFileSync(localPath)], { type: mimeType }), filename);
  const res = await fetch(target.url, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Upload of ${filename} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return target.resourceUrl;
}

// The new bytes are processed after the mutation returns, and until that finishes the file still
// answers with the old URL. Polled rather than assumed, so a failed swap is reported as one.
async function settled(id, previousUrl) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await gql(
      cfg,
      `query($id: ID!) {
        node(id: $id) { ... on MediaImage { fileStatus fileErrors { message } image { url width height } } }
      }`,
      { id }
    );
    const file = res.node || {};
    if (file.fileErrors?.length) throw new Error(file.fileErrors.map((e) => e.message).join('; '));
    if (file.fileStatus === 'READY' && file.image?.url && file.image.url !== previousUrl) return file;
  }
  return null;
}

try {
  const before = {};
  const plan = [];

  for (const filename of names) {
    const localPath = resolve(cfg.repoRoot, 'assets', filename);
    if (!existsSync(localPath)) {
      console.log(`  ! Not in assets/: ${filename}`);
      continue;
    }
    const file = await findFile(filename);
    if (!file) {
      console.log(`  ! Not in Content > Files: ${filename} - upload-theme-images.mjs puts it there first`);
      continue;
    }
    before[filename] = { id: file.id, url: file.url, width: file.image?.width, height: file.image?.height };
    plan.push({ filename, localPath, file });
    console.log(`  . ${apply ? 'Replacing' : 'Would replace'} ${filename} (${file.image?.width}x${file.image?.height})`);
  }

  if (!plan.length) process.exit(1);
  if (!apply) {
    console.log('\nNothing written. Re-run with --apply.');
    process.exit(0);
  }

  const backup = writeBackup(cfg, 'files-before-replace', before);
  console.log(`\nCurrent URLs saved to ${backup}`);
  for (const { filename, file } of plan) {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`Could not download the current ${filename} to back it up (${res.status})`);
    const copy = resolve(cfg.repoRoot, 'scripts', 'shopify', 'backups', `${filename}.before-replace`);
    writeFileSync(copy, Buffer.from(await res.arrayBuffer()));
    console.log(`  = Old ${filename} saved to ${copy}`);
  }

  for (const { filename, localPath, file } of plan) {
    const resourceUrl = await stage(localPath, filename, MIME[extname(filename).toLowerCase()] || 'image/png');
    await gql(
      cfg,
      `mutation($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files { id fileStatus }
          userErrors { field message }
        }
      }`,
      { files: [{ id: file.id, originalSource: resourceUrl }] },
      'fileUpdate'
    );
    const done = await settled(file.id, file.url);
    if (!done) {
      console.log(`  x ${filename}: Shopify has not served the new picture yet - check Content > Files`);
      continue;
    }
    console.log(`  + ${filename} replaced (${done.image.width}x${done.image.height})`);
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
