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
  to the Online Store. `--update-rules` adds to an automated collection any rule `store-config.mjs`
  gives it that it is missing — additively, so a rule an app put there (the gift-box app adds
  `TYPE NOT_EQUALS giftbox_ghost_product` everywhere) survives. `--update-rules --convert-manual`
  goes further and hands a manual collection to the rules, which discards whatever was added to it
  by hand; the preview names each one and how many products it holds before you decide.
- Automated collections fill themselves from product tags, e.g. tag a product `shape:oval` or
  `metal:rose-gold`. **Run `tag-products.mjs` first** (below) — without the tags they are empty.
- Before the menu is replaced, the current one is saved to `scripts/shopify/backups/` (git-ignored).

## The tags every collection and filter is built on

The products arrived with almost no tags: 294 of 304 had nothing saying what kind of piece they
were, what shape the stone was, or what metal. So every automated collection stood empty, the
Shape and Metal groups in the collection filter drawer had nothing to filter, and the mega menu's
"Studs", "Hoops" and "Round" tiles pointed at collections that did not exist at all.

`tag-products.mjs` works the tags out from each product's title, its existing tags and its option
values — "Round Stud Earrings 3MM" becomes `category:stud`, `category:earring`, `shape:round`, and
a Colour option of "18k White Gold" becomes `metal:white-gold`. Six namespaces: `category:`,
`shape:`, `stone:`, `metal:`, `style:`, `type:`.

```bash
node scripts/shopify/tag-products.mjs                    # preview: a count per tag, nothing written
node scripts/shopify/tag-products.mjs --verbose          # ...and every product it would touch
node scripts/shopify/tag-products.mjs --apply            # add them
node scripts/shopify/tag-products.mjs --only=shape,metal # just those namespaces
node scripts/shopify/tag-products.mjs --handle=some-product   # one product, to check a rule
node scripts/shopify/tag-products.mjs --undo --apply     # remove the tags it added
```

It only ever **adds** tags, so nothing set by hand is lost, and the current tags of every product
go to `backups/` before the first write. `--undo` removes only those six namespaces; a tag outside
them is never touched.

The rules live in `tag-rules.mjs`, as a table per namespace. Word boundaries are doing real work
there — `\bring\b` must not match "Earrings", `\bpear\b` must not match "Pearl", `\bround\b`
must not match "Wrap Around Ring" — so check a change with
`node scripts/shopify/tag-products.mjs --only=<namespace> --verbose` before applying it.

The order for a fresh store is: tag the products, then create the collections, then write the menu.

```bash
node scripts/shopify/tag-products.mjs --apply
node scripts/shopify/setup-store.mjs --apply --update-rules
```

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

## Put the About page on its story template

`/pages/about-er` was rendering through the default page template: the title and one block of rich
text at the full width of the browser. `templates/page.about-er.json` lays the same story out with a
hero, the founder's letter beside a portrait, the figures, what we make, how a piece is made and a
closing panel — but a template only takes effect once the page is pointed at it, which is this.

```bash
node scripts/shopify/set-about-template.mjs            # preview, writes nothing
node scripts/shopify/set-about-template.mjs --apply    # write
```

Push the theme first (`shopify theme push`), or the page asks for a template the live theme hasn't
got yet. The page's current template is saved to `backups/` before anything is written, and
`ABOUT_TEMPLATE= node scripts/shopify/set-about-template.mjs --apply` puts it back on the default
one. `ABOUT_HANDLE` points the same script at another page.

## Fill an empty guide page

The Education & Guides hub links to four guides. Two of them — Gemstones and Jewellery Care — were
pages with the `guide` template already set and a body of nought characters, so they rendered as a
bare heading over an empty hero. These write the body.

```bash
node scripts/shopify/update-gemstones-page.mjs              # preview, writes nothing
node scripts/shopify/update-gemstones-page.mjs --apply      # write

node scripts/shopify/update-jewellery-care-page.mjs         # preview, writes nothing
node scripts/shopify/update-jewellery-care-page.mjs --apply # write
```

Both write the shape `sections/guide-page.liquid` reads: an opening photograph, which is lifted
into the split hero, a lead paragraph, which becomes the hero's subtitle, and then `<h2>` chapters.
A chapter carrying one picture is laid out as a two-column row that alternates side down the page;
a chapter of words or a table runs the full measure. Don't hand-wrap a table in
`<div class="gp-table-scroll">` — `snippets/editorial-content.liquid` adds that itself.

Pictures come from `assets/`, and are uploaded to Content > Files on `--apply`, because a page body
can only point at a `/files/` URL: a theme asset has no such URL until something puts it there. A
file already up there under the same name is reused, so re-running is cheap.

The care guide looks for four photographs and stands in an existing one for each it can't find:

| Slot | Looks for | Stands in |
| --- | --- | --- |
| hero | `assets/care-hero.jpg` | `bespoke-jewellery-1.jpg`, already in Files |
| everyday wear | `assets/care-everyday.jpg` | `assets/lifestyle-bracelet.jpg` |
| cleaning | `assets/care-cleaning.jpg` | `assets/featured-diamonds-care.jpg` |
| storage | `assets/care-storage.jpg` | `assets/lifestyle-necklace.jpg` |

Drop a photograph in under the name in the middle column and re-run with `--apply` to use it. The
page's current body is saved to `backups/` before either script writes.

The dev server caches page content, so a guide can still look empty after a run — reload with a
query string (`?x=1`) to see it.

## Redirects: the broken ones and the missing ones

A redirect into a dead page is worse than no redirect: the visitor still loses, and a search
engine sees a 301 into a 404. Three of the store's four redirects were doing this — one to a blog
that holds no articles, one to a collection handle that doesn't exist, and one to a product that
had been deleted.

The same script also creates the redirects the store is missing, for handles it used to serve and
no longer does. A pruned collection leaves its old URL in Google's index and in people's
bookmarks; without a redirect every one of those visits is a 404.

```bash
node scripts/shopify/fix-redirects.mjs            # preview: every redirect, and what's wrong
node scripts/shopify/fix-redirects.mjs --apply    # repair the broken ones, create the missing ones
```

Each target is resolved the way the storefront would resolve it — the product, collection, page,
blog or article behind the handle has to exist, a product has to be Active, and an article has to
be in the blog the path names — so re-running keeps catching breakage after a product is renamed
or `prune-collections.mjs` removes a collection.

Two tables at the top of the script drive it. `FIXES` holds the repairs, keyed by the redirect's
path, so an existing redirect is only ever corrected in place — never deleted. When the script
finds a broken redirect with no entry in `FIXES` it names it and moves on, rather than guessing.
`RETIRED` holds the paths that should exist, each with the live page that now owns the intent and
the reason that page was chosen; a path already redirected is left exactly as it is, on the
assumption that whatever is in the store was put there deliberately, and a path that turns out to
still resolve is reported so it can be dropped from the table. Every target in both tables is
resolved before it is written, so a table entry that has itself gone stale is skipped rather than
creating a fresh 301-into-404. All redirects go to `backups/` before anything is written.

`RETIRED` currently covers the twelve collection handles the prune left behind — `18k-gold`,
`18k-white-gold`, `925-sterling-silver`, `adjustable`, `all-bracelets`, `all-earrings`,
`all-necklaces`, `dangle`, `ear-cuffs`, `new-arrivals`, `tennis`, `trending-now`. Most map onto an
obvious successor (`dangle` → Dangles & Drops, `new-arrivals` → New In). Three were a judgement
call, and the `why` on each entry says what it was: `18k-gold` reads unqualified gold as yellow
gold, and `adjustable` and `tennis` go to the bracelets category page because the catalogue no
longer groups anything that way.

A `FIXES` entry marked `force: true` is for a target that resolves but points at the wrong thing,
which a 404 check can't catch on its own — the wrist sizer redirect landed on the legacy 2021 blog
article instead of `/pages/wrist-sizer-guide`, the page on the `guide` template that the menus link
to. Those read as `wrong` rather than `404` in the preview.

The storefront is password-protected, so a redirect can't be checked with an anonymous request:
the password gate answers 302 to `/password` before redirects are evaluated. Check with this
script, or in a browser with an admin session.


## The Avada SEO app's HTML sitemap pages

Avada SEO Suite generates `/pages/avada-sitemap`, `-collections`, `-products`, `-pages`, `-blogs`
and `-articles` as ordinary Shopify pages. They are a frozen snapshot of the catalogue at the
moment the app ran — the ones on this store were written in June 2022 — and they are redundant
with Shopify's own `/sitemap.xml`, which is generated per request and is always current.

Being a snapshot, they rot. After the collection prune they were still linking to 13 collections
that no longer existed, 26 dead links in all, on the two pages whose whole purpose is to be
crawled.

```bash
node scripts/shopify/cleanup-avada-sitemap.mjs            # preview only, deletes nothing
node scripts/shopify/cleanup-avada-sitemap.mjs --apply    # delete them
```

It matches only handles beginning `avada-sitemap`, so a page written by hand is never caught — the
store's own empty `/pages/sitemap` is left alone. Before it deletes anything it checks every
navigation menu for links to the pages and refuses to run if it finds one, since deleting a page
the nav points at just moves the 404. The full record of each page, body HTML included, goes to
`backups/` first; deleting a page is permanent.

No redirects are created for the deleted URLs. A 404 is the correct answer for a page removed on
purpose: search engines drop it from the index, and nothing on the store linked to these.

**One step is not scriptable.** The Avada app has no public API for its settings, so the HTML
sitemap feature has to be turned off in the Avada dashboard by hand. While it is on, the app will
generate these pages again, and the new snapshot will start going stale the same way.


## Blogs nobody posts to

The store carried four blogs and wrote to two of them. `/blogs/news` and
`/blogs/musings-of-eden-raine` held zero articles each: a live page that says "no posts yet" is a
dead end for a visitor and a thin page for a crawler, and no menu, section, template or snippet in
the theme linked to either one. This shop's content lives in pages — the guides are `/pages/*` on
the `guide` template, and the 2021 blog articles are the legacy import — so there was nothing for
the two empty blogs to grow into.

```bash
node scripts/shopify/remove-empty-blogs.mjs                 # preview only, deletes nothing
node scripts/shopify/remove-empty-blogs.mjs --apply         # delete them and tidy the links
node scripts/shopify/remove-empty-blogs.mjs --keep=news --apply     # spare these as well
node scripts/shopify/remove-empty-blogs.mjs --drafts --apply        # also delete unpublished articles
```

Only a blog holding zero articles is ever a candidate; one with posts in it is listed, with its
count, and left alone however old they are. A blog whose handle appears anywhere in the theme is
kept too, the same rule `prune-collections.mjs` uses, because deleting it would turn a live link
into a 404 — the preview names any it finds.

Links are followed through rather than left behind. After a delete, any page whose body links to a
blog that has gone has that list entry cut, which on this store was the two Avada sitemap pages
(`/pages/avada-sitemap` and `-blogs`, two dead links each). A link found outside a list item is
reported instead of edited, since rewriting a sentence needs a person. URL redirects are left
alone on purpose: a redirect fires on a path that 404s, so `/blogs/news/wrist-s` keeps working with
no blog behind it.

Unpublished articles are reported on every run, in whatever blog they sit, because an article that
is not published 404s for anyone holding its URL. The store has one, `/blogs/about/ethical-gemstones`
— a 2021 draft whose subject is already covered by the live `/pages/gemstones`. It is left in place
unless `--drafts` is passed; nothing links to it, so it costs nothing where it is.

Deleting a blog is permanent. Every blog about to go, every article inside it, and the original
body of every page about to be edited are written to `backups/` before the first write.
