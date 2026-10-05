# Store setup scripts

Creates collections and the main menu through the Shopify Admin API, using your dev app's token.
These files are not part of the theme: `.shopifyignore` keeps them out of `shopify theme push`,
and Shopify's GitHub sync only reads the theme folders (assets, blocks, config, layout, locales,
sections, snippets, templates).

## Setup (once)

1. `cp .env.example .env` and fill in `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` from your
   dev app (the app must be installed on the store). The script swaps them for a short-lived
   Admin API token on each run. If you have an `shpat_` token instead, put it in
   `SHOPIFY_ADMIN_TOKEN`. `.env` is git-ignored, so none of this is ever committed.
2. Needs Node 18 or newer (`node --version`).

## Use

```bash
node scripts/shopify/setup-store.mjs                          # preview: shows what would change
node scripts/shopify/setup-store.mjs --apply                  # create missing collections + write the menu
node scripts/shopify/setup-store.mjs --apply --only=collections
node scripts/shopify/setup-store.mjs --apply --only=menu
node scripts/shopify/setup-store.mjs --apply --menu-handle=miadonna-menu   # new menu beside the live one
```

- Edit `store-config.mjs` to change the collections or the menu.
- Existing collections are never changed or deleted; only missing ones are created and published
  to the Online Store.
- Automated collections fill themselves from product tags, e.g. tag a product `shape:oval` or
  `metal:rose-gold`.
- Before the menu is replaced, the current one is saved to `scripts/shopify/backups/` (git-ignored).

## Undo the menu / match collection pictures to the homepage

```bash
node scripts/shopify/restore-menu.mjs                  # preview: the menu from before the first setup run
node scripts/shopify/restore-menu.mjs --apply          # put it back (the current menu is backed up first)
node scripts/shopify/set-collection-images.mjs         # preview: homepage category pictures -> collection images
node scripts/shopify/set-collection-images.mjs --apply # set them (add --force to replace existing images)
```

## Products show in the admin but not on the storefront

A product can be Active and still be missing from the storefront: it also has to be published to
the **Online Store** sales channel. When it isn't, the collection page says "0 products" even
though the admin lists items in that collection.

```bash
node scripts/shopify/publish-products.mjs                             # preview: every Active product not on the Online Store
node scripts/shopify/publish-products.mjs --apply                     # publish them
node scripts/shopify/publish-products.mjs --collection=engagement-rings --apply
node scripts/shopify/publish-products.mjs --include-drafts --apply    # also publish Draft products (sets them Active)
```

Drafts are left alone unless you pass `--include-drafts`, since publishing a draft does nothing on
its own — that flag sets them Active as well.

## Same ring, different centre stone: merge into one product with a Shape option

Two listings that are the same ring in a different cut (AJLR257 cushion / AJLR262 pear) belong in one
product with a `Shape` option. The cards already draw diamond-cut icons off the first product option
whose name contains "shape" and swap the photo on click, and the product page now draws the same
icons for that option, so the merge is purely a data change.

```bash
node scripts/shopify/merge-shape-products.mjs                   # preview: what would change
node scripts/shopify/merge-shape-products.mjs --apply           # do it
node scripts/shopify/merge-shape-products.mjs --group=twist-engagement-ring --apply
node scripts/shopify/merge-shape-products.mjs --apply --keep-donors   # don't archive the folded-in products
```

Edit the `MERGES` list at the top of the script to add a pair. Each entry names the product to keep
and the ones to fold into it by SKU prefix, the shape each one becomes, and the merged title, handle
and description.

What a merge does:

- Adds a `Shape` option in position 1; the keeper's existing variants all take the keeper's shape.
- Copies the donor's photos across and folds the shape into every photo's media-grouping alt text —
  `#Jewelry material_Gold` becomes `#Jewelry material_Pear Gold` — so `product-metal-media.js`
  filters the gallery by shape *and* metal with no change to the theme's JavaScript.
- Creates one variant per donor shape x material, keeping the donor's price, SKU, weight and photo.
- Takes the union of the tags, so each tag-driven shape collection (`cushion-engagement-rings`,
  `pear-engagement-rings`, …) still lists the merged product.
- Archives each donor (reversible; its order history stays) and adds a
  `/products/<donor>` -> `/products/<keeper>` redirect, plus one for the keeper's old handle when the
  merge renames it.

Nothing is deleted, the before-state of every product goes to `backups/` first, and re-running is
safe — each step checks whether it has already been done.

## Remove collections that aren't in store-config

```bash
node scripts/shopify/prune-collections.mjs                      # preview: what would go
node scripts/shopify/prune-collections.mjs --apply              # delete them
node scripts/shopify/prune-collections.mjs --keep=all,sale --apply
node scripts/shopify/prune-collections.mjs --include-theme-links --apply
```

Deletes every collection the store has that `store-config.mjs` doesn't describe. Never touches
anything the theme links to (that would turn a live link into a 404) unless you pass
`--include-theme-links`, and never `frontpage`. Products are left alone — only the grouping goes.
Before anything is deleted, the full details of what's going are written to `backups/`.

## What the card swatches key off (read-only)

The metal and shape swatches on product cards are driven by product data, not by the theme:
a swatch only becomes clickable when its value maps to a variant that has its own image.
This script reports what the products actually carry, so you can see why a row is interactive,
decorative, or missing. It changes nothing.

```bash
node scripts/shopify/inspect-product-options.mjs                      # 250 products, 3 examples per case
node scripts/shopify/inspect-product-options.mjs --limit=500 --examples=5
```

It prints the option names in use (the engagement rings call theirs **Jewelry material**), how many
products carry metal/shape values as options vs tags, and — the part that matters for clicking —
how many have per-variant images.
