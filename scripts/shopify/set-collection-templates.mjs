/*
 * Puts the Engagement and Wedding collections on their own theme templates.
 *
 * Every collection used to render through templates/collection.json, and a section's
 * settings belong to the template, not the collection - so a banner uploaded while
 * looking at Engagement Rings showed up on Wedding Bands, Earrings and everything
 * else too. With these assignments each family has its own copy of the grid banners:
 *
 *   collection.engagement-collections.json   engagement rings, styles and shapes
 *   collection.wedding-collections.json      wedding bands and their sub-collections
 *   collection.json                          everything else (jewellery, shapes, stones)
 *
 * In the theme editor, pick the template from the dropdown at the top (Collections >
 * engagement-collections) and edit the banners there.
 *
 *   node scripts/shopify/set-collection-templates.mjs            # preview, writes nothing
 *   node scripts/shopify/set-collection-templates.mjs --apply    # write
 *   node scripts/shopify/set-collection-templates.mjs --reset --apply   # all back to default
 *
 * The templates must exist on the live theme first (theme dev or theme push), or the
 * collections will ask for a template the theme has not got. Current suffixes are
 * saved to backups/ before anything is written.
 */
import { config, gql, paginate, writeBackup } from './lib.mjs';

const apply = process.argv.includes('--apply');
const reset = process.argv.includes('--reset');

const ASSIGN = {
  'engagement-collections': [
    'engagement-rings', 'solitaire', 'side-stone', 'halo', 'hidden-halo', 'three-stone',
    'vintage', 'nature-inspired', 'toi-et-moi', 'promise', 'mens-engagement-rings',
    'round-engagement-rings', 'oval-engagement-rings', 'cushion-engagement-rings',
    'emerald-engagement-rings', 'pear-engagement-rings', 'princess-engagement-rings',
    'radiant-engagement-rings', 'marquise-engagement-rings', 'asscher-engagement-rings',
    'heart-engagement-rings',
  ],
  'wedding-collections': [
    'wedding-bands', 'anniversary-rings', 'eternity-rings', 'curved-wedding-bands',
    'stackable-rings', 'bridal-sets', 'plain-metal-wedding-bands',
  ],
};
const MANAGED = new Set(Object.keys(ASSIGN));

const target = new Map();
for (const [suffix, handles] of Object.entries(ASSIGN)) {
  for (const h of handles) target.set(h, reset ? '' : suffix);
}

const UPDATE = `mutation($input: CollectionInput!) {
  collectionUpdate(input: $input) { collection { handle templateSuffix } userErrors { field message } }
}`;

const cfg = await config();
const all = await paginate(
  cfg,
  `query($after:String){ collections(first:100, after:$after){ pageInfo{hasNextPage endCursor} nodes{ id handle templateSuffix } } }`,
  'collections'
);

const changes = [];
for (const c of all) {
  const current = c.templateSuffix || '';
  let want = target.get(c.handle);
  // A collection that was on one of these templates but has left the list goes back to default.
  if (want === undefined) want = MANAGED.has(current) ? '' : current;
  if (want !== current) changes.push({ ...c, current, want });
}
const missing = [...target.keys()].filter((h) => !all.some((c) => c.handle === h));
if (missing.length) console.log(`Not in the store (skipped): ${missing.join(', ')}`);

if (!changes.length) { console.log('Every collection is already on its template; nothing to do.'); process.exit(0); }
console.log(`${apply ? 'Applying' : 'Would apply'} ${changes.length} change(s):`);
for (const c of changes) console.log(`  /collections/${c.handle}  ${c.current || '(default)'}  ->  ${c.want || '(default)'}`);
if (!apply) { console.log('\nNothing written. Add --apply to write.'); process.exit(0); }

const backup = writeBackup(cfg, 'collection-templates', changes.map(({ handle, current }) => ({ handle, templateSuffix: current })));
console.log(`Backup: ${backup}`);

let failed = 0;
for (const c of changes) {
  const d = await gql(cfg, UPDATE, { input: { id: c.id, templateSuffix: c.want || null } });
  const errs = d.collectionUpdate.userErrors;
  if (errs.length) { failed++; console.log(`  ✖ ${c.handle}: ${errs.map((e) => e.message).join('; ')}`); }
  else console.log(`  ✓ ${c.handle} -> ${d.collectionUpdate.collection.templateSuffix || '(default)'}`);
}
process.exit(failed ? 1 : 0);
