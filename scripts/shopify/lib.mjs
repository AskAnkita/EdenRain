// Shared helpers for the store scripts: reads .env and calls the Shopify Admin GraphQL API.
// No dependencies; needs Node 18+ (built-in fetch).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// .env wins over variables already set in the terminal (an old `export SHOPIFY_ADMIN_TOKEN=...`
// in ~/.zshrc would otherwise be used instead), and an empty line in .env clears that variable.
// Without a .env file (e.g. in CI or a cloud session), the environment's own variables are used.
export function loadEnv(file = resolve(repoRoot, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] !== undefined && process.env[key] !== value) {
      console.log(`Using ${key} from .env instead of the one set in your terminal`);
    }
    process.env[key] = value;
  }
}

export function config() {
  loadEnv();
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = process.env.SHOPIFY_ADMIN_TOKEN || '';
  const clientId = process.env.SHOPIFY_CLIENT_ID || '';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  const version = process.env.SHOPIFY_API_VERSION || '2026-07';
  const missing = [];
  if (!domain) missing.push('SHOPIFY_STORE_DOMAIN');
  if (!token && !(clientId && clientSecret)) missing.push('SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN)');
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return { domain, token, clientId, clientSecret, version, repoRoot };
}

// Dev Dashboard apps give a client ID and secret rather than a token. For an app installed on a
// store in the same organization, Shopify swaps them for an Admin API token (valid about 24 hours)
// through the client credentials grant. Fetched once per run and reused.
let cachedToken = null;

async function accessToken(cfg) {
  if (cachedToken) return cachedToken;
  if (cfg.token) {
    console.log(`Signing in with SHOPIFY_ADMIN_TOKEN (${describeToken(cfg.token)})`);
    cachedToken = cfg.token;
    return cachedToken;
  }
  console.log('Signing in with SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET');

  const res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON; reported below
  }
  if (!res.ok || !body.access_token) {
    const reason = body.error_description || body.error || text.slice(0, 200) || res.statusText;
    throw new Error(
      `Could not get an access token from the client ID and secret (${res.status}): ${reason}. ` +
        'Check that the app is installed on this store and the ID and secret are copied exactly.'
    );
  }
  cachedToken = body.access_token;
  console.log(`Got an access token (${describeToken(cachedToken)}; scopes: ${body.scope || 'not listed'})`);
  return cachedToken;
}

// Safe to print: the kind of token and its length, never the token itself
function describeToken(token) {
  const kind = token.startsWith('shpat_') ? 'shpat_ admin token' : token.startsWith('shpss_') ? 'shpss_ app SECRET, not a token' : `starts "${token.slice(0, 4)}…"`;
  return `${kind}, ${token.length} characters`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs a GraphQL query. Retries when Shopify throttles; throws on any other error,
// including userErrors returned by a mutation (pass the mutation's field name as `mutationField`).
export async function gql(cfg, query, variables = {}, mutationField) {
  const { domain, version } = cfg;
  const token = await accessToken(cfg);
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
      const hint = res.status === 401 ? ' (the token or app credentials were not accepted)' : res.status === 403 ? ' (the app is missing a scope)' : '';
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Shopify answered ${res.status} ${res.statusText}${hint}${detail ? `\n  Shopify said: ${detail}` : ''}`);
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
