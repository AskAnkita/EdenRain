# Store setup scripts

Creates collections and the main menu through the Shopify Admin API, using your dev app's token.
These files are not part of the theme: `.shopifyignore` keeps them out of `shopify theme push`,
and Shopify's GitHub sync only reads the theme folders (assets, blocks, config, layout, locales,
sections, snippets, templates).

## Setup (once)

1. `cp .env.example .env` and paste your Admin API token into `SHOPIFY_ADMIN_TOKEN`.
   `.env` is git-ignored, so the token is never committed.
2. Needs Node 18 or newer (`node --version`).

## Use

```bash
node scripts/shopify/setup-store.mjs                          # preview: shows what would change
node scripts/shopify/setup-store.mjs --apply                  # create missing collections + write the menu
node scripts/shopify/setup-store.mjs --apply --only=collections
node scripts/shopify/setup-store.mjs --apply --only=menu
```

- Edit `store-config.mjs` to change the collections or the menu.
- Existing collections are never changed or deleted; only missing ones are created and published
  to the Online Store.
- Automated collections fill themselves from product tags, e.g. tag a product `shape:oval` or
  `metal:rose-gold`.
- Before the menu is replaced, the current one is saved to `scripts/shopify/backups/` (git-ignored).
