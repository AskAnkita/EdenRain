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
  // A charm necklace is the one kind of necklace that is neither a pendant nor a chain on its
  // own: stones joined into the chain itself, at a joint or a station, more than one of them.
  // Not a motif hanging from a bail - that is a pendant, and `not` keeps the two apart, so the
  // 2.16 CTW Two-Stone Pendant stays in Pendants while the toi et moi necklaces, whose two
  // stones are claw-set straight onto the chain, come here. The shop's own words for the same
  // construction are station, graduated, bar and toi et moi; nothing in the catalogue is titled
  // "charm", which is why the Charms tile under Necklaces opened empty until 2026-11-13.
  //
  // Tennis is excluded because a graduated tennis necklace is a tennis necklace - a continuous
  // line of stones, not stones set apart - and bracelets because `category:charm` has only the
  // one collection, Charms under Necklaces (see store-config.mjs).
  rule('charm', [/\bcharms?\b/, /\bstations?\b/, /\bgraduated\b/, /\bbars?\b/, /\btoi[\s-]et[\s-]moi\b/], {
    from: 'all',
    not: [/\bpendants?\b/, /\bbracelets?\b/, /\banklets?\b/, /\bearrings?\b/, /\btennis\b/],
  }),
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
  // `not` on hidden halo, which would otherwise match twice over: `\bhalo\b` finds the "halo"
  // in the `style:hidden-halo` tag this rule reads, and a hidden halo is the one setting that is
  // NOT a halo ring - the stones sit under the centre stone where no one sees them, which is why
  // Engagement lists the two separately.
  rule('halo', [/\bhalo\b/], { from: 'all', not: [/hidden[\s-]halo/] }),
  // Side stone is a setting, not a name: a centre stone with smaller stones set beside it. Eight
  // rings say "Side Stone" in the title, but a crossover, a three-stone, a cluster and a pave
  // shoulder are all the same thing to a shopper looking for stones either side of the centre,
  // and they were all missing from the collection. So the rule reads the setting as well as the
  // name, and the titles carry both words - "Lab-Grown Diamond Crossover Engagement Ring" - so
  // each pattern asks for the style AND "engagement ring". That is what keeps a pave bracelet
  // or a cluster necklace out of a collection titled Side Stone Engagement Rings; the two tag
  // rules on the collection itself (store-config.mjs) are the second guard.
  //
  // `from: 'title'`, deliberately, where the other style rules read everything: C&B's own
  // `Style:Cluster` tag would otherwise drag in every cluster piece in the shop. The one
  // exception is handled by the first pattern, which does read the tags - the C&B halo that
  // arrived carrying `Style:Side Stone` and was the collection's only member for months.
  //
  // What this leaves out, and should: solitaires, twists, bezels, cathedrals and the plain
  // halo. Nothing sits beside their centre stone.
  rule('side-stone', [/\bside[\s-]?stones?\b/], { from: 'all' }),
  rule('side-stone', [/\bcrossover\b.*\bengagement ring\b/], { from: 'title' }),
  rule('side-stone', [/\bthree[\s-]stone\b.*\bengagement ring\b/], { from: 'title' }),
  rule('side-stone', [/\bclusters?\b.*\bengagement ring\b/], { from: 'title' }),
  // `pav\S*` rather than `pav[e\u00e9]`: the shop's titles spell it with a COMBINING acute
  // (e + U+0301), so "pave" with a precomposed \u00e9 never matches and a trailing \b lands
  // between the e and the mark. Match the word loosely and let "engagement ring" do the work.
  rule('side-stone', [/\bpav\S*.*\bengagement ring\b/], { from: 'title' }),
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
  // The four kinds a bracelet comes in, which the Bracelets column of the mega menu browses by,
  // plus the tennis necklace the Necklaces column leads with (snippets/menu-static-items.liquid).
  // They are styles rather than categories because the same word describes a bracelet and a
  // necklace - there are tennis necklaces, charm necklaces and station necklaces too - and the
  // menu scopes each row to its own collection. "Chain" takes the link patterns with it: a cuban
  // link, a bolo or a curb bracelet is a chain bracelet by any other name. `category:charm` is a
  // different tag and stays what it is: a charm sold on its own, which is what the Charms
  // collection under Necklaces holds.
  rule('tennis', [/\btennis\b/], { from: 'all' }),
  rule('chain', [/\bchains?\b/, /\bcuban\b/, /\bbolo\b/, /\bcurb\b/, /\bfigaro\b/, /\bpaperclip\b/], { from: 'all' }),
  rule('charm', [/\bcharms?\b/], { from: 'all' }),
  // Three bracelets the shop sells as charm bracelets. None of them says "charm" anywhere - the
  // word is in the look of the piece, stones spaced along a fine chain, not in its name - so
  // they are named here, the way the hidden halos are. They keep their own kind as well: the
  // tennis bracelet is still in Tennis and the chain bracelet still in Chain Link, because
  // their titles say so and a bracelet can honestly sit in two of these.
  rule('charm', [
    /^pink & white lab-grown diamond flower station bracelet$/,
    /^blue & white lab-grown diamond tennis bracelet$/,
    /^round brilliant lab-grown diamond solitaire chain bracelet$/,
  ], { from: 'title' }),
  // Station is the bangle, whose pave stones sit in stations around it. The flower bracelet
  // carries the word "Station" in its name but is sold as a charm bracelet, so it is excluded
  // here and named in the charm rule above instead - the one place in this file where the title
  // and the category disagree and the category wins.
  rule('station', [/\bstations?\b/], { from: 'all', not: [/flower station bracelet/] }),
  rule('station', [/^round brilliant lab-grown diamond pav\S* bangle bracelet$/], { from: 'title' }),

  // Hidden halo: a ring of small stones set UNDER the centre stone, which cannot be seen from
  // above and is therefore never in the title. There is nothing to derive it from, so the one
  // two rings the shop holds are named here outright. The twist was the collection's only
  // member, added by hand before it was automated; the pave ring was the one the collection was
  // missing. This is the only rule in the file that matches products rather than a pattern, and
  // it is here rather than hand-tagged in the admin so
  // that `tag-products.mjs --undo` still knows the tag is ours and the collection keeps filling
  // itself. Add a line when another hidden halo is stocked; delete this comment when the range
  // is big enough for a real pattern.
  rule('hidden-halo', [
    /^2\.2 ctw lab-grown diamond twist engagement ring$/,
    /^2\.52 ctw pear cut lab-grown diamond pav\S* engagement ring$/,
  ], { from: 'title' }),
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
