// Shared helpers for the store scripts: reads .env and calls the Shopify Admin GraphQL API.
// No dependencies; needs Node 18+ (built-in fetch).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Values already in the environment win over .env, so a CI or cloud secret can override it.
export function loadEnv(file = resolve(repoRoot, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function config() {
  loadEnv();
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = process.env.SHOPIFY_ADMIN_TOKEN || '';
  const version = process.env.SHOPIFY_API_VERSION || '2026-07';
  const missing = [];
  if (!domain) missing.push('SHOPIFY_STORE_DOMAIN');
  if (!token) missing.push('SHOPIFY_ADMIN_TOKEN');
  if (missing.length) {
    console.error(`Missing ${missing.join(' and ')}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return { domain, token, version, repoRoot };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs a GraphQL query. Retries when Shopify throttles; throws on any other error,
// including userErrors returned by a mutation (pass the mutation's field name as `mutationField`).
export async function gql({ domain, token, version }, query, variables = {}, mutationField) {
  const url = `https://${domain}/admin/api/${version}/graphql.json`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!res.ok) {
      const hint = res.status === 401 ? ' (check SHOPIFY_ADMIN_TOKEN)' : res.status === 403 ? ' (the app is missing a scope)' : '';
      throw new Error(`Shopify answered ${res.status} ${res.statusText}${hint}`);
    }

    const body = await res.json();
    const throttled = body.errors?.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      await sleep(1000 * attempt);
      continue;
    }
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));

    if (mutationField) {
      const userErrors = body.data?.[mutationField]?.userErrors || [];
      if (userErrors.length) {
        throw new Error(`${mutationField}: ${userErrors.map((e) => `${(e.field || []).join('.')} ${e.message}`.trim()).join('; ')}`);
      }
    }
    return body.data;
  }
  throw new Error('Shopify kept throttling the request; try again in a minute.');
}
