# Mega menu artwork: the source copies

The PNG tiles the desktop mega menu draws beside each shape and each ring setting. The menu builds
their names at render time in `snippets/header-menu-drawer-links.liquid` —
`shape-outline-` or `ring-style-` plus the menu item's handle — so the whole set has to resolve or
a column of the menu shows broken pictures. Which keys take a picture rather than a drawn icon is
`shapes_with_images` and `styles_with_images` in that file; a key left out of those lists falls
through to the inline SVG in `snippets/icon-diamond-shape.liquid` or
`snippets/icon-ring-style.liquid` instead.

These are kept here because the theme no longer ships them. Like the rest of the photography they
live in Content > Files and are uploaded by `../shopify/upload-theme-images.mjs`, and Files is
where the storefront reads them from. This folder is the local copy, so the set can be re-uploaded,
re-cropped or regenerated without first downloading it back out of the admin.

`shape-outline-*.png` also has a step behind it: `../shape-outline-source/` holds the illustrator's
untouched drawings and `../normalise-shape-outlines.py` evens them out into these. `ring-style-*.png`
has no such source — these files are it.

`.shopifyignore` excludes `scripts/*`, so nothing here is uploaded to the theme.
