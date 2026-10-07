// What the store should contain: collections and the main menu, modelled on MiaDonna's navigation.
// Edit this file, then run `node scripts/shopify/setup-store.mjs` to preview and add `--apply` to write.
//
// Collections
//   `rule` makes an automated (smart) collection that collects products by tag, e.g. tag a product
//   "shape:oval" and it joins Oval Engagement Rings. Leave `rule` out for a manual collection.
//   Existing collections (matched by handle) are never changed or deleted.
//
// Menu items
//   `collection` links to a collection by handle, `url` to any page, `items` nests children
//   (up to three levels: Engagement > Shop by Style > Solitaire).

const tag = (value) => ({ column: 'TAG', relation: 'EQUALS', condition: value });

export const collections = [
  // Engagement: by style (most already exist in the store; they are only created if missing)
  { handle: 'engagement-rings', title: 'Engagement Rings' },
  { handle: 'solitaire', title: 'Solitaire Engagement Rings' },
  { handle: 'side-stone', title: 'Side Stone Engagement Rings' },
  { handle: 'halo', title: 'Halo Engagement Rings' },
  { handle: 'hidden-halo', title: 'Hidden Halo Engagement Rings' },
  { handle: 'three-stone', title: 'Three Stone Engagement Rings' },
  { handle: 'bridal-sets', title: 'Bridal Sets' },
  { handle: 'vintage', title: 'Vintage Engagement Rings' },
  { handle: 'nature-inspired', title: 'Nature Inspired Engagement Rings' },
  { handle: 'toi-et-moi', title: 'Toi et Moi Engagement Rings' },
  { handle: 'promise', title: 'Promise Rings' },

  // Engagement: by shape (automated, by tag)
  ...['round', 'oval', 'cushion', 'emerald', 'pear', 'princess', 'radiant', 'marquise', 'asscher'].map((shape) => ({
    handle: `${shape}-engagement-rings`,
    title: `${shape[0].toUpperCase()}${shape.slice(1)} Engagement Rings`,
    rule: tag(`shape:${shape}`),
  })),

  // By metal (automated, by tag); shared by Engagement, Wedding and Jewelry
  ...[
    ['yellow-gold', 'Yellow Gold'],
    ['white-gold', 'White Gold'],
    ['rose-gold', 'Rose Gold'],
    ['platinum', 'Platinum'],
  ].map(([slug, name]) => ({ handle: `${slug}-jewelry`, title: `${name} Jewelry`, rule: tag(`metal:${slug}`) })),

  // Wedding
  { handle: 'wedding-bands', title: 'Wedding Bands' },
  { handle: 'anniversary-rings', title: 'Anniversary Rings', rule: tag('style:anniversary') },
  { handle: 'eternity-rings', title: 'Eternity Rings', rule: tag('style:eternity') },
  { handle: 'curved-wedding-bands', title: 'Curved Wedding Bands', rule: tag('style:curved') },
  { handle: 'stackable-rings', title: 'Stackable Rings', rule: tag('style:stackable') },
  { handle: 'mens-rings', title: "Men's Wedding Bands" },
  { handle: 'mens-engagement-rings', title: "Men's Engagement Rings" },

  // Jewelry
  { handle: 'earrings', title: 'Earrings' },
  { handle: 'necklaces', title: 'Necklaces' },
  { handle: 'bracelets', title: 'Bracelets' },
  { handle: 'rings', title: 'Rings' },
  { handle: 'new-in', title: 'New In' },
  { handle: 'best-sellers', title: 'Best Sellers' },
  { handle: 'ready-to-ship', title: 'Ready to Ship' },

  // Jewelry sub-categories, shown as the tiles under Jewellery in the mega menu
  { handle: 'studs', title: 'Stud Earrings' },
  { handle: 'hoops-huggies', title: 'Hoops & Huggies' },
  { handle: 'dangles-drops', title: 'Dangles & Drops' },
  { handle: 'climbers-jackets-cuffs', title: 'Climbers, Jackets & Cuffs' },
  { handle: 'signature-earrings', title: 'Signature Earrings' },
  { handle: 'tennis-necklaces', title: 'Tennis Necklaces' },
  { handle: 'pendants', title: 'Pendants' },
  { handle: 'fashion-necklaces', title: 'Fashion Necklaces' },
  { handle: 'signature-necklaces', title: 'Signature Necklaces' },
  { handle: 'tennis-bracelets', title: 'Tennis Bracelets' },
  { handle: 'bangles-cuffs', title: 'Bangles & Cuffs' },
  { handle: 'fashion-bracelets', title: 'Fashion Bracelets' },
  { handle: 'signature-bracelets', title: 'Signature Bracelets' },

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

const metalItems = [
  { title: 'Yellow Gold', collection: 'yellow-gold-jewelry' },
  { title: 'White Gold', collection: 'white-gold-jewelry' },
  { title: 'Rose Gold', collection: 'rose-gold-jewelry' },
  { title: 'Platinum', collection: 'platinum-jewelry' },
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
          items: ['Round', 'Oval', 'Cushion', 'Emerald', 'Pear', 'Princess', 'Radiant', 'Marquise', 'Asscher'].map((shape) => ({
            title: shape,
            collection: `${shape.toLowerCase()}-engagement-rings`,
          })),
        },
        { title: 'Shop by Metal', collection: 'engagement-rings', items: metalItems },
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
        {
          title: "Men's",
          collection: 'mens-rings',
          items: [
            { title: "Men's Wedding Bands", collection: 'mens-rings' },
            { title: "Men's Engagement Rings", collection: 'mens-engagement-rings' },
          ],
        },
        { title: 'Shop by Metal', collection: 'wedding-bands', items: metalItems },
      ],
    },
    {
      title: 'Jewelry',
      url: '/collections/all',
      items: [
        {
          title: 'Category',
          url: '/collections/all',
          items: [
            { title: 'Earrings', collection: 'earrings' },
            { title: 'Necklaces', collection: 'necklaces' },
            { title: 'Bracelets', collection: 'bracelets' },
            { title: 'Rings', collection: 'rings' },
          ],
        },
        {
          title: 'Featured',
          collection: 'new-in',
          items: [
            { title: 'New In', collection: 'new-in' },
            { title: 'Best Sellers', collection: 'best-sellers' },
          ],
        },
        { title: 'Shop by Metal', url: '/collections/all', items: metalItems },
      ],
    },
    { title: 'Diamonds', collection: 'lab-grown-diamonds' },
    { title: 'Design Studio', url: '/pages/custom-design' },
    // Shown on the right of the header (theme setting "right_menu_items")
    { title: 'Learn', url: '/pages/learn' },
    { title: 'About', url: '/pages/about' },
    { title: 'Contact Us', url: '/pages/contact' },
  ],
};
