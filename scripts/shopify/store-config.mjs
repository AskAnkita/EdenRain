// What the store should contain: collections and the main menu, modelled on MiaDonna's navigation.
// Edit this file, then run `node scripts/shopify/setup-store.mjs` to preview and add `--apply` to write.
//
// Collections
//   `rule` makes an automated (smart) collection that collects products by tag, e.g. tag a product
//   "shape:oval" and it joins Oval Engagement Rings. `rules` takes several, all of which must
//   match. Leave both out for a manual collection. The tags themselves come from
//   `tag-products.mjs`, which derives them from each product's title and options — run that first,
//   or an automated collection here has nothing to collect.
//   Existing collections (matched by handle) are never changed or deleted, except by
//   `setup-store.mjs --update-rules`, which brings an automated collection's rules into line
//   with this file.
//
// Menu items
//   `collection` links to a collection by handle, `url` to any page, `items` nests children
//   (up to three levels: Engagement > Shop by Style > Solitaire).

const tag = (value) => ({ column: 'TAG', relation: 'EQUALS', condition: value });

export const collections = [
  // Engagement: by style (most already exist in the store; they are only created if missing)
  { handle: 'engagement-rings', title: 'Engagement Rings' },
  // These three exist as manual collections holding almost nothing, while the catalogue has 16
  // solitaires, 7 three-stone and 6 halo pieces. The rules below fill them from the `style:` tags,
  // but turning a manual collection into an automated one throws away whatever was added to it by
  // hand, so setup-store.mjs will not do it unless you pass --convert-manual.
  { handle: 'solitaire', title: 'Solitaire Engagement Rings', rule: tag('style:solitaire') },
  { handle: 'side-stone', title: 'Side Stone Engagement Rings' },
  { handle: 'halo', title: 'Halo Engagement Rings', rule: tag('style:halo') },
  { handle: 'hidden-halo', title: 'Hidden Halo Engagement Rings' },
  { handle: 'three-stone', title: 'Three Stone Engagement Rings', rule: tag('style:three-stone') },
  { handle: 'bridal-sets', title: 'Bridal Sets' },
  { handle: 'vintage', title: 'Vintage Engagement Rings' },
  { handle: 'nature-inspired', title: 'Nature Inspired Engagement Rings' },
  { handle: 'toi-et-moi', title: 'Toi et Moi Engagement Rings' },
  { handle: 'promise', title: 'Promise Rings' },

  // Engagement: by shape (automated, by tag)
  //
  // Two rules, not one. `shape:round` is the shop-wide stone-shape tag — a round stud earring
  // carries it too — so these collections also require the engagement-ring type tag, or every
  // earring would turn up under Round Engagement Rings. Both tags come from tag-products.mjs.
  ...['round', 'oval', 'cushion', 'emerald', 'pear', 'princess', 'radiant', 'marquise', 'asscher', 'heart'].map((shape) => ({
    handle: `${shape}-engagement-rings`,
    title: `${shape[0].toUpperCase()}${shape.slice(1)} Engagement Rings`,
    rules: [tag(`shape:${shape}`), tag('type:engagement-ring')],
  })),

  // By metal (automated, by tag); shared by Engagement, Wedding and Jewelry
  ...[
    ['yellow-gold', 'Yellow Gold'],
    ['white-gold', 'White Gold'],
    ['rose-gold', 'Rose Gold'],
    ['platinum', 'Platinum'],
    // Sterling silver is the biggest metal in the catalogue (124 pieces) and had no collection,
    // while platinum has none at all — the menu shows silver in platinum's place.
    ['sterling-silver', 'Sterling Silver'],
  ].map(([slug, name]) => ({ handle: `${slug}-jewelry`, title: `${name} Jewelry`, rule: tag(`metal:${slug}`) })),

  // Wedding
  { handle: 'wedding-bands', title: 'Wedding Bands' },
  { handle: 'anniversary-rings', title: 'Anniversary Rings', rule: tag('style:anniversary') },
  { handle: 'eternity-rings', title: 'Eternity Rings', rule: tag('style:eternity') },
  { handle: 'curved-wedding-bands', title: 'Curved Wedding Bands', rule: tag('style:curved') },
  { handle: 'stackable-rings', title: 'Stackable Rings', rule: tag('style:stackable') },

  // Jewelry. The four top-level groups, each a manual collection that was holding a fraction of
  // what the shop sells — Earrings listed 56 of 209, Rings 14 of 38, Bracelets 2 of 18. Same
  // --convert-manual caveat as the engagement styles above.
  { handle: 'earrings', title: 'Earrings', rule: tag('category:earring') },
  { handle: 'necklaces', title: 'Necklaces', rule: tag('category:necklace') },
  { handle: 'bracelets', title: 'Bracelets', rule: tag('category:bracelet') },
  { handle: 'rings', title: 'Rings', rule: tag('category:ring') },
  { handle: 'new-in', title: 'New In' },
  { handle: 'best-sellers', title: 'Best Sellers' },
  { handle: 'ready-to-ship', title: 'Ready to Ship' },

  // Men's. Both of these already existed in the store and neither was described here, which
  // left them a prune away from deletion; the Men's column in the mega menu links to them
  // (snippets/menu-static-items.liquid), so they are named here now. Manual, not automated:
  // there is no men's tag, and no rule to write one from until the range is stocked.
  { handle: 'mens-rings', title: "Men's Rings" },
  { handle: 'mens-engagement-rings', title: "Men's Engagement Rings" },
  // The third row of the Men's column. This one does not exist in the store yet; until it is
  // created the menu sends that row to /collections/bracelets rather than to a 404
  // (snippets/menu-static-items.liquid).
  { handle: 'mens-bracelets', title: "Men's Bracelets" },

  // Jewelry sub-categories, shown as the tiles under Jewellery in the mega menu.
  //
  // Automated on the `category:` tags, so they fill themselves and keep filling as products are
  // added. The count after each one is what the catalogue held when these were written; a
  // category the shop does not stock yet (bangles, anklets, tennis settings) is left out rather
  // than created empty, because an empty collection is the dead link this set exists to fix.
  ...[
    ['studs', 'Stud Earrings', 'stud'],
    ['hoops-huggies', 'Hoops & Huggies', 'hoop-huggie'],
    ['dangles-drops', 'Dangles & Drops', 'dangle-drop'],
    ['climbers-jackets-cuffs', 'Climbers, Jackets & Cuffs', 'climber-jacket-cuff'],
    ['pendants', 'Pendants', 'pendant'],
    ['chains', 'Chains', 'chain'],
    ['charms', 'Charms', 'charm'],
  ].map(([handle, title, value]) => ({ handle, title, rule: tag(`category:${value}`) })),

  // Shop by shape, across the whole catalogue: every piece whose stone or outline is that shape,
  // not just engagement rings. `shape:<x>` is the same tag the Shape group in the collection
  // filter drawer builds its URLs from (snippets/static-filters.liquid), so the two agree.
  // Cushion, emerald and asscher are here with a single piece each; they are created so the
  // collection exists as stock arrives, and left out of the menu until it does.
  ...[
    ['round', 'Round'],
    ['heart', 'Heart'],
    ['pear', 'Pear'],
    ['marquise', 'Marquise'],
    ['trillion', 'Triangle'],
    ['baguette', 'Baguette'],
    ['oval', 'Oval'],
    ['princess', 'Princess'],
    ['square', 'Square'],
    ['cushion', 'Cushion'],
    ['emerald', 'Emerald'],
    ['asscher', 'Asscher'],
    // The ninth cut the By Shape column in the mega menu lists, and the only one of the nine
    // with no collection behind it yet. Until this is created the menu reaches radiant through
    // the tag filter instead (snippets/menu-static-items.liquid).
    ['radiant', 'Radiant'],
  ].map(([slug, name]) => ({ handle: `shape-${slug}`, title: `${name} Shape Jewellery`, rule: tag(`shape:${slug}`) })),

  // Shop by stone. Richer than shape in this catalogue, and the shape tiles lean on it: a
  // "round shape" shopper is after a round stone, which is what these name outright.
  ...[
    ['cubic-zirconia', 'Cubic Zirconia'],
    ['diamond', 'Diamond'],
    ['lab-grown-diamond', 'Lab-Grown Diamond'],
    ['pearl', 'Pearl'],
    ['shell', 'Shell & Abalone'],
    ['turquoise', 'Turquoise'],
    ['onyx', 'Black Onyx'],
    ['opal', 'Opal'],
    ['birthstone', 'Birthstone'],
  ].map(([slug, name]) => ({ handle: `stone-${slug}`, title: `${name} Jewellery`, rule: tag(`stone:${slug}`) })),

  // Loose lab-grown diamonds (automated, by tag)
  { handle: 'lab-grown-diamonds', title: 'Lab-Grown Diamonds', rule: tag('loose-diamond') },

  // Loose diamonds by shape, shown as the tiles under Diamonds in the mega menu. Tagged
  // "diamond-shape:round" rather than "shape:round" so engagement rings don't join them.
  ...['round', 'oval', 'emerald', 'cushion', 'marquise', 'radiant', 'pear', 'princess', 'asscher', 'heart'].map((shape) => ({
    handle: `${shape}-diamonds`,
    title: `${shape[0].toUpperCase()}${shape.slice(1)} Diamonds`,
    rule: tag(`diamond-shape:${shape}`),
  })),
];

// Platinum is not in the menu: the shop stocks none, and a tile that opens an empty page is the
// problem this set was written to fix. Sterling silver takes its place and is the largest of the
// four. The platinum collection still exists, ready for the first platinum piece.
//
// A metal is a filter, not a destination. These used to link at the <metal>-jewelry collections,
// whose Image in admin is a colour swatch - a gold disc on white - which the collection hero drew
// across the full width of the page. So a metal links at the panel's own collection with the metal
// filter applied, which also keeps the context: Yellow Gold under Engagement means yellow-gold
// engagement rings, not every yellow-gold piece in the shop. The tags are the ones
// tag-products.mjs writes and snippets/static-filters.liquid filters on; the menu in the theme
// builds the same links in snippets/menu-static-items.liquid - keep the two in step. The
// <metal>-jewelry collections still exist and still work; nothing in the menu points at them.
//
// Needs the tag filter switched on in Search & Discovery, or the link lands on the collection
// unfiltered - the same condition the Metal group in the filter drawer is under.
const metalItems = (base) =>
  [
    ['Yellow Gold', 'yellow-gold'],
    ['White Gold', 'white-gold'],
    ['Rose Gold', 'rose-gold'],
    ['Sterling Silver', 'sterling-silver'],
  ].map(([title, slug]) => ({ title, url: `${base}?filter.p.tag=metal:${slug}` }));

// Shop by Shape and Shop by Stone, shared by the Jewellery panel and the drawer. Only values the
// catalogue actually carries more than one of; see the collection list above for the rest.
// The nine cuts, in the order the trade lists them - the same nine, in the same order, as the
// By Shape column in the mega menu (snippets/menu-static-items.liquid) and as Engagement's own
// Shop by Shape. Heart, triangle, baguette and square are off the list: there is no drawing for
// the last three and no stock behind any of them. Radiant goes through the tag filter until its
// collection is created, which is why it is the one with a url rather than a collection.
const shapeItems = [
  { title: 'Round', collection: 'shape-round' },
  { title: 'Oval', collection: 'shape-oval' },
  { title: 'Cushion', collection: 'shape-cushion' },
  { title: 'Emerald', collection: 'shape-emerald' },
  { title: 'Pear', collection: 'shape-pear' },
  { title: 'Princess', collection: 'shape-princess' },
  { title: 'Radiant', url: '/collections/all?filter.p.tag=shape:radiant' },
  { title: 'Marquise', collection: 'shape-marquise' },
  { title: 'Asscher', collection: 'shape-asscher' },
];

const stoneItems = [
  { title: 'Cubic Zirconia', collection: 'stone-cubic-zirconia' },
  { title: 'Lab-Grown Diamond', collection: 'stone-lab-grown-diamond' },
  { title: 'Pearl', collection: 'stone-pearl' },
  { title: 'Shell & Abalone', collection: 'stone-shell' },
  { title: 'Turquoise', collection: 'stone-turquoise' },
  { title: 'Black Onyx', collection: 'stone-onyx' },
  { title: 'Opal', collection: 'stone-opal' },
  { title: 'Birthstone', collection: 'stone-birthstone' },
];

export const menu = {
  handle: 'main-menu',
  title: 'Main menu',
  items: [
    {
      title: 'Engagement',
      collection: 'engagement-rings',
      items: [
        {
          title: 'Shop by Style',
          collection: 'engagement-rings',
          items: [
            { title: 'All Engagement Rings', collection: 'engagement-rings' },
            { title: 'Solitaire', collection: 'solitaire' },
            { title: 'Side Stone', collection: 'side-stone' },
            { title: 'Halo', collection: 'halo' },
            { title: 'Hidden Halo', collection: 'hidden-halo' },
            { title: 'Three Stone', collection: 'three-stone' },
            { title: 'Bridal Sets', collection: 'bridal-sets' },
            { title: 'Vintage', collection: 'vintage' },
            { title: 'Nature Inspired', collection: 'nature-inspired' },
            { title: 'Toi et Moi', collection: 'toi-et-moi' },
            { title: 'Promise', collection: 'promise' },
          ],
        },
        {
          title: 'Shop by Shape',
          collection: 'engagement-rings',
          items: ['Round', 'Oval', 'Cushion', 'Emerald', 'Pear', 'Princess', 'Radiant', 'Marquise', 'Asscher', 'Heart'].map((shape) => ({
            title: shape,
            collection: `${shape.toLowerCase()}-engagement-rings`,
          })),
        },
        { title: 'Shop by Metal', collection: 'engagement-rings', items: metalItems('/collections/engagement-rings') },
      ],
    },
    {
      title: 'Wedding',
      collection: 'wedding-bands',
      items: [
        {
          title: "Women's",
          collection: 'wedding-bands',
          items: [
            { title: 'All Wedding Bands', collection: 'wedding-bands' },
            { title: 'Anniversary', collection: 'anniversary-rings' },
            { title: 'Eternity', collection: 'eternity-rings' },
            { title: 'Curved', collection: 'curved-wedding-bands' },
            { title: 'Stackable', collection: 'stackable-rings' },
            { title: 'Bridal Sets', collection: 'bridal-sets' },
          ],
        },
        { title: 'Shop by Metal', collection: 'wedding-bands', items: metalItems('/collections/wedding-bands') },
      ],
    },
    {
      // "Jewellery" with the British spelling, which is how the live menu reads it and how
      // snippets/menu-static-groups.liquid looks the panel up.
      title: 'Jewellery',
      url: '/collections/all',
      // Rings, Earrings, Necklaces, Bracelets, Men's: the same order and the same nesting the
      // desktop mega menu draws its five category columns in, so the two menus read alike
      // (snippets/header-menu-drawer-links.liquid).
      items: [
        {
          title: 'Rings',
          collection: 'rings',
          items: [
            { title: 'All Rings', collection: 'rings' },
            { title: 'Engagement', collection: 'engagement-rings' },
            { title: 'Wedding Bands', collection: 'wedding-bands' },
            { title: 'Eternity', collection: 'eternity-rings' },
            { title: 'Anniversary', collection: 'anniversary-rings' },
            { title: 'Stackable', collection: 'stackable-rings' },
            { title: 'Promise', collection: 'promise' },
          ],
        },
        {
          title: 'Earrings',
          collection: 'earrings',
          items: [
            { title: 'All Earrings', collection: 'earrings' },
            { title: 'Studs', collection: 'studs' },
            { title: 'Hoops & Huggies', collection: 'hoops-huggies' },
            { title: 'Dangles & Drops', collection: 'dangles-drops' },
            { title: 'Climbers, Jackets & Cuffs', collection: 'climbers-jackets-cuffs' },
          ],
        },
        {
          title: 'Necklaces',
          collection: 'necklaces',
          items: [
            { title: 'All Necklaces', collection: 'necklaces' },
            { title: 'Pendants', collection: 'pendants' },
            { title: 'Chains', collection: 'chains' },
            { title: 'Charms', collection: 'charms' },
          ],
        },
        // Bracelets has no sub-categories to list: the shop sells bracelets, not tennis
        // bracelets and bangles, and a collection for a range it does not stock would be the
        // dead link this set exists to avoid. The menu breaks it down by metal filter instead
        // (snippets/menu-static-items.liquid).
        {
          title: 'Bracelets',
          collection: 'bracelets',
          items: [
            { title: 'All Bracelets', collection: 'bracelets' },
            ...metalItems('/collections/bracelets'),
          ],
        },
        {
          title: "Men's",
          collection: 'mens-rings',
          items: [
            { title: 'Rings', collection: 'mens-rings' },
            { title: 'Engagement Rings', collection: 'mens-engagement-rings' },
            { title: 'Bracelets', collection: 'bracelets' },
          ],
        },
        { title: 'Shop by Shape', url: '/collections/all', items: shapeItems },
        { title: 'Shop by Stone', url: '/collections/all', items: stoneItems },
        { title: 'Shop by Metal', url: '/collections/all', items: metalItems('/collections/all') },
        {
          title: 'Featured',
          collection: 'new-in',
          items: [
            { title: 'New In', collection: 'new-in' },
            { title: 'Best Sellers', collection: 'best-sellers' },
          ],
        },
      ],
    },
    { title: 'Diamonds', collection: 'lab-grown-diamonds' },
    { title: 'Design Studio', url: '/pages/design-your-own' },
    // Shown on the right of the header (theme setting "right_menu_items")
    { title: 'Learn', url: '/pages/education-guides' },
    { title: 'About', url: '/pages/about-er' },
    { title: 'Contact Us', url: '/pages/contact' },
  ],
};
