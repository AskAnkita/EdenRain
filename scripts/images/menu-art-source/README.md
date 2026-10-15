# Mega menu artwork: the source copies

The PNG tiles the desktop mega menu draws beside each shape, each ring setting and each wedding
band style. The menu builds their names at render time in
`snippets/header-menu-drawer-links.liquid` — `shape-outline-`, `ring-style-` or `band-style-` plus
the menu item's handle — so the whole set has to resolve or a column of the menu shows broken
pictures. Which keys take a picture rather than a drawn icon is `shapes_with_images`,
`styles_with_images` and `band_styles_with_images` in that file; a key left out of those lists
falls through to the inline SVG in `snippets/icon-diamond-shape.liquid`,
`snippets/icon-ring-style.liquid` or `snippets/icon-band-style.liquid` instead.

These are kept here because the theme no longer ships them. Like the rest of the photography they
live in Content > Files and are uploaded by `../shopify/upload-theme-images.mjs`, and Files is
where the storefront reads them from. This folder is the local copy, so the set can be re-uploaded,
re-cropped or regenerated without first downloading it back out of the admin.

`shape-outline-*.png` also has a step behind it: `../shape-outline-source/` holds the illustrator's
untouched drawings and `../normalise-shape-outlines.py` evens them out into these. `ring-style-*.png`
has no such source — these files are it.

`band-style-*.png` are the same kind of file and follow the same geometry as `ring-style-*.png`:
black line art carried entirely in the alpha channel, 264px of ink wide with 8px of padding, on a
canvas 280px wide whose height follows the drawing. They came in as 1254px renders on white paper
and were cropped to their ink, inverted into alpha and scaled to that. Three of the four are drawn
in three-quarter view and fill the menu's icon box by width; the eternity ring is drawn face-on and
so fits it by height instead, which is why the canvas height is not fixed across the set.

`.shopifyignore` excludes `scripts/*`, so nothing here is uploaded to the theme.
