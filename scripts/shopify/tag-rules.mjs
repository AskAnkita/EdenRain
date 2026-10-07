// What tag a product should carry, worked out from its title, its own tags and its option values.
//
// The store's products arrived without the tags the theme browses by: 294 of 304 had no shape,
// category or metal tag, so every tag-driven collection came out empty and every "Studs" or
// "Round" link in the mega menu opened nothing. These tables close that gap; `tag-products.mjs`
// applies them and `store-config.mjs` builds a collection per value.
//
// A rule is { value, any: [RegExp], not: [RegExp], from: 'title' | 'all' }:
//   value  the tag's second half, e.g. "stud" becomes "category:stud"
//   any    the product matches when ANY of these hit
//   not    ...unless one of these hits as well
//   from   'title' reads the title only; 'all' also reads the product's tags and option values
//
// Word boundaries are doing real work here, so keep them:
//   \bring\b    does not match "Earrings"     \bpear\b   does not match "Pearl"
//   \bround\b   does not match "Wrap Around"  \bcuffs?\b is narrowed against "Ear Cuff"

const rule = (value, any, extra = {}) => ({ value, any, not: [], from: 'title', ...extra });

// ---------- category: what kind of piece it is ----------
// These feed the tiles the mega menu already lists under Jewellery (snippets/menu-static-items).
export const category = [
  rule('stud', [/\bstuds?\b/]),
  rule('hoop-huggie', [/\bhoops?\b/, /\bhuggies?\b/, /\bhuggers?\b/]),
  rule('dangle-drop', [/\bdangles?\b/, /\bdrops?\b/, /\bteardrops?\b/, /\bchandeliers?\b/, /\bthreaders?\b/]),
  // "Ear cuff" is an earring; a plain "cuff" is a bracelet, so each side excludes the other.
  rule('climber-jacket-cuff', [/\bclimbers?\b/, /\bcrawlers?\b/, /\bear cuffs?\b/, /\bjackets?\b/]),
  rule('pendant', [/\bpendants?\b/]),
  rule('chain', [/\bchains?\b/], { not: [/\bbracelets?\b/, /\banklets?\b/] }),
  rule('charm', [/\bcharms?\b/]),
  rule('bangle-cuff', [/\bbangles?\b/, /\bcuffs?\b/], { not: [/\bear cuffs?\b/] }),
  rule('anklet', [/\banklets?\b/]),
  // The four top-level groups. An earring is recognised by its product type as well, because a
  // few titles ("Thick Huggies") never say the word.
  rule('earring', [/\bearrings?\b/, /\bear\b/, /\bstuds?\b/, /\bhoops?\b/, /\bhuggies?\b/, /\bhuggers?\b/, /\bclimbers?\b/, /\bcrawlers?\b/, /^earring$/, /^ear cuff$/], { from: 'all' }),
  rule('necklace', [/\bnecklaces?\b/, /\bchokers?\b/, /\bpendants?\b/, /\bchains?\b/, /^necklace$/], {
    from: 'all',
    not: [/\bbracelets?\b/, /\banklets?\b/, /\bearrings?\b/],
  }),
  rule('bracelet', [/\bbracelets?\b/, /\bbracelete?s?\b/, /\bbangles?\b/, /^bracelete?$/], { from: 'all' }),
  rule('ring', [/\brings?\b/, /^ring$/], { from: 'all', not: [/\bearrings?\b/] }),
];

// ---------- shape: the cut of the stone (or the outline of the piece) ----------
// What "Shop by Shape" browses, and what the Shape group in snippets/static-filters.liquid
// filters on: that drawer already builds `filter.p.tag=shape:<value>` URLs.
export const shape = [
  rule('round', [/\bround\b/, /\bbrilliant\b/], { from: 'all' }),
  rule('oval', [/\boval\b/], { from: 'all' }),
  rule('cushion', [/\bcushion\b/], { from: 'all' }),
  // "Emerald" is a cut and a gemstone. Only the cut goes here; the stone is in `stone` below.
  rule('emerald', [/\bemerald[\s-]*(cut|shape)/], { from: 'all' }),
  rule('pear', [/\bpear\b/], { from: 'all' }),
  rule('princess', [/\bprincess\b/], { from: 'all' }),
  rule('radiant', [/\bradiant\b/], { from: 'all' }),
  rule('marquise', [/\bmarquise\b/], { from: 'all' }),
  rule('asscher', [/\basscher\b/], { from: 'all' }),
  rule('heart', [/\bhearts?\b/], { from: 'all' }),
  rule('baguette', [/\bbaguettes?\b/], { from: 'all' }),
  rule('trillion', [/\btrillions?\b/, /\btriangles?\b/], { from: 'all' }),
  rule('square', [/\bsquares?\b/], { from: 'all' }),
];

// ---------- stone: what the piece is set with ----------
export const stone = [
  rule('cubic-zirconia', [/cubic zirconia/, /\bcz\b/]),
  rule('lab-grown-diamond', [/lab[\s-]?grown/]),
  rule('diamond', [/\bdiamonds?\b/]),
  rule('moissanite', [/\bmoissanites?\b/]),
  rule('pearl', [/\bpearls?\b/]),
  rule('turquoise', [/\bturquoise\b/]),
  rule('onyx', [/\bonyx\b/]),
  rule('opal', [/\bopals?\b/]),
  rule('shell', [/\babalone\b/, /\bshells?\b/], { not: [/\bseashell pendant\b/] }),
  rule('amethyst', [/\bamethyst\b/]),
  rule('garnet', [/\bgarnet\b/]),
  rule('emerald', [/\bemeralds?\b/], { not: [/emerald[\s-]*(cut|shape)/] }),
  rule('sapphire', [/\bsapphires?\b/]),
  rule('birthstone', [/\bbirthstones?\b/]),
];

// ---------- metal ----------
// Mostly carried by the variant options rather than the title: 101 products have a Colour option
// of "18k White Gold" / "18k Yellow Gold", and the engagement rings a "Jewelry material" option
// listing 10k/14k/18k in three colours plus silver. A product offered in two metals joins both.
export const metal = [
  rule('yellow-gold', [/yellow gold/, /gold vermeil/], { from: 'all' }),
  rule('white-gold', [/white gold/], { from: 'all' }),
  rule('rose-gold', [/rose gold/, /pink gold/], { from: 'all' }),
  rule('sterling-silver', [/sterling silver/, /\b925\b/], { from: 'all' }),
  rule('platinum', [/\bplatinum\b/], { from: 'all' }),
  rule('rhodium', [/\brhodium\b/], { from: 'all' }),
];

// ---------- style ----------
// The setting, not the shape. `anniversary-rings`, `eternity-rings`, `curved-wedding-bands` and
// `stackable-rings` are already automated on these tags and were standing empty.
export const style = [
  rule('solitaire', [/\bsolitaire\b/], { from: 'all' }),
  rule('halo', [/\bhalo\b/], { from: 'all' }),
  rule('three-stone', [/\bthree[\s-]stone\b/, /\btrilogy\b/], { from: 'all' }),
  rule('cluster', [/\bclusters?\b/], { from: 'all' }),
  rule('twist', [/\btwists?\b/, /\btwisted\b/], { from: 'all' }),
  rule('eternity', [/\beternity\b/], { from: 'all' }),
  rule('curved', [/\bcurved\b/, /\bv[\s-]shaped\b/], { from: 'all' }),
  rule('stackable', [/\bstackable\b/, /\bstacking\b/], { from: 'all' }),
  rule('anniversary', [/\banniversary\b/], { from: 'all' }),
  rule('infinity', [/\binfinity\b/], { from: 'all' }),
  rule('signet', [/\bsignet\b/], { from: 'all' }),
  rule('pave', [/\bpav[eé]\b/], { from: 'all' }),
  rule('vintage', [/\bvintage\b/], { from: 'all' }),
];

// ---------- type ----------
// Keeps the shape tags honest. `round-engagement-rings` is automated on `shape:round`; now that a
// stud earring can carry `shape:round` too, the engagement collections need a second rule, and
// this is the tag they test. See store-config.mjs.
export const type = [
  rule('engagement-ring', [/engagement ring/, /^type:engagement ring$/], { from: 'all' }),
  rule('wedding-band', [/wedding band/, /\beternity band\b/], { from: 'all' }),
  rule('loose-diamond', [/\bloose (diamond|stone)\b/], { from: 'all' }),
];

export const namespaces = { category, shape, stone, metal, style, type };
