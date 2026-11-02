/*
 * Brands the hosted sign-in page (and the account pages that share its tokens).
 *
 * /account/login does not render the theme. The store is on new customer accounts,
 * so Shopify 302s every account route to shopify.com/42396680352/account and serves
 * that page from its own origin - no theme Liquid, no theme CSS, no script tag can
 * reach it. sections/main-login.liquid is dead code and stays dead: legacy customer
 * accounts were deprecated in February 2026 and a migrated store cannot go back.
 *
 * The one lever that does reach that page is the Checkout and Accounts Configuration
 * API, which is what this writes. It fixes what the stock page gets wrong against
 * this theme: Shopify's rounded corners (the theme is square everywhere - every
 * radius setting in settings_data.json is 0), the dead grey background, the system
 * font in place of Cormorant/Source Sans Pro, and the empty hero slot that leaves a
 * 400px hole between the logo and the form.
 *
 *   node scripts/shopify/brand-sign-in-page.mjs            # preview, writes nothing
 *   node scripts/shopify/brand-sign-in-page.mjs --apply    # write
 *
 * Needs the app to hold write_checkout_and_accounts_configurations (or
 * write_checkout_settings). The current app has neither, so both the read and the
 * write come back "Access denied" until the scope is added in the Dev Dashboard and
 * the app is reinstalled. The script says so plainly rather than failing obscurely.
 *
 * Images come from Content > Files and are matched by filename, because the products
 * are not published to the Online Store and picker-resolved handles come back empty.
 * Set them with the env vars below; leave one unset and that part is left alone.
 *
 *   SIGNIN_LOGO=eden-raine-logo-transparent.png   # must be transparent, see note
 *   SIGNIN_HERO=signin-hero.jpg
 *
 * The logo in the screenshot sits in a white rectangle because the uploaded file has
 * a white background baked into it. No colour setting removes that - it needs a
 * transparent PNG re-uploaded to Files.
 *
 * The current branding is saved to backups/ before anything is written.
 */
import { config, gql, writeBackup } from './lib.mjs';

const apply = process.argv.includes('--apply');
const log = (...m) => console.log(...m);

// Straight out of config/settings_data.json: scheme-3's off-white page, black for
// every foreground and button, #999999 borders. The theme never uses the #ececec
// the stock sign-in page currently shows.
const BG = process.env.SIGNIN_BG || '#f4f4f0';
const TEXT = '#000000';
const BORDER = '#999999';
const ACCENT = '#000000';

// type_header_font / type_body_font, verbatim.
const HEADING_FONT = process.env.SIGNIN_HEADING_FONT || 'cormorant_n5';
const BODY_FONT = process.env.SIGNIN_BODY_FONT || 'source_sans_pro_n4';

// The logo that was on the page came from Eden_Raine_Logo_Fullm_-_PinkVWeb.jpg - a
// JPEG, so it cannot hold transparency and its white background is what draws the
// white rectangle behind the wordmark. eden-raine-logo-transparent.png is that same
// artwork with the white matted out and the pink LONDON kept, built by
// make-transparent-logo.mjs and already uploaded to Files.
const LOGO_FILE = process.env.SIGNIN_LOGO || 'eden-raine-logo-transparent.png';
const HERO_FILE = process.env.SIGNIN_HERO || '';
const LOGO_WIDTH = Number(process.env.SIGNIN_LOGO_WIDTH || 160); // matches logo_width

// The sign-in header has no position or alignment field - unlike the checkout header,
// which has both - so the logo cannot be moved down next to the form. Padding is the
// only lever on where it sits, and it is the nearest thing to "lower down the page".
// NONE, BASE, SMALL_100..500, LARGE_100..500.
const HEADER_PADDING = process.env.SIGNIN_HEADER_PADDING || 'LARGE_300';

const CONFIGS = `{
  checkoutAndAccountsConfigurations(first: 10) {
    nodes {
      id
      name
      isPublished
      branding {
        designTokens {
          cornerRadius { small base large }
          typography {
            primary { ...fontGroup }
            secondary { ...fontGroup }
          }
        }
        surfaces {
          signIn {
            components {
              header { padding logo { maxWidth image { ...imageValue } } }
              main {
                backgroundImage { ...imageValue }
                colors { base { background text border icon accent } }
                section { cornerRadius padding }
              }
            }
          }
        }
      }
    }
  }
}
fragment fontGroup on CheckoutAndAccountsConfigurationBrandingFontGroup {
  ... on CheckoutAndAccountsConfigurationBrandingShopifyFontGroup {
    name
    base { sources weight }
    bold { sources weight }
  }
  ... on CheckoutAndAccountsConfigurationBrandingCustomFontGroup {
    name
    base { sources weight }
    bold { sources weight }
  }
}
fragment imageValue on CheckoutAndAccountsConfigurationBrandingImageValue {
  ... on CheckoutAndAccountsConfigurationBrandingImage { image { id } }
}`;

const UPDATE = `mutation($id: ID!, $configuration: CheckoutAndAccountsConfigurationInput!) {
  checkoutAndAccountsConfigurationUpdate(id: $id, configuration: $configuration) {
    configuration { id name }
    userErrors { field message }
  }
}`;

// findImageInFiles() in lib.mjs hands back a CDN URL; the branding input wants the
// MediaImage id, so this asks for the id and still matches on the exact basename -
// a filename: query is a prefix match and would happily return a near miss.
async function mediaImageId(cfg, filename) {
  const res = await gql(
    cfg,
    `query($q: String!) { files(first: 20, query: $q) { nodes { ... on MediaImage { id image { url } } } } }`,
    { q: `filename:${filename}` }
  );
  for (const node of res.files?.nodes || []) {
    const url = node?.image?.url;
    if (!url || !node.id) continue;
    const basename = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
    if (basename === filename) return node.id;
  }
  return null;
}

function scopeHelp(err) {
  if (!/Access denied/i.test(err.message)) return false;
  log('');
  log('The app cannot see the checkout and accounts configuration.');
  log('It needs one of these scopes, and currently holds neither:');
  log('');
  log('    write_checkout_and_accounts_configurations');
  log('    write_checkout_settings');
  log('');
  log('Add it to the app in the Dev Dashboard (Configuration > Access scopes),');
  log('reinstall the app on the store so the new scope is granted, then re-run.');
  log('');
  return true;
}

try {
  const cfg = await config();

  let configs;
  try {
    configs = (await gql(cfg, CONFIGS)).checkoutAndAccountsConfigurations.nodes;
  } catch (err) {
    if (scopeHelp(err)) process.exit(1);
    throw err;
  }

  const target = configs.find((c) => c.isPublished) || configs[0];
  if (!target) {
    log('No checkout and accounts configuration on this store.');
    process.exit(1);
  }
  log(`Configuration: ${target.name} (${target.isPublished ? 'published' : 'draft'})`);

  const backup = writeBackup(cfg, 'sign-in-branding', target);
  log(`Current branding saved to ${backup}`);

  const signInMain = {
    colors: { base: { background: BG, text: TEXT, border: BORDER, icon: TEXT, accent: ACCENT } },
    // The form sits on the page rather than in a rounded card, which is how every
    // other surface in this theme behaves.
    section: { cornerRadius: 'NONE', padding: 'LARGE' },
  };

  const header = { padding: HEADER_PADDING, logo: { maxWidth: LOGO_WIDTH } };

  if (LOGO_FILE) {
    const id = await mediaImageId(cfg, LOGO_FILE);
    if (!id) {
      log(`! No file named ${LOGO_FILE} in Content > Files - leaving the logo alone.`);
    } else {
      header.logo.image = { mediaImageId: id };
      log(`Logo: ${LOGO_FILE}`);
    }
  }

  if (HERO_FILE) {
    const id = await mediaImageId(cfg, HERO_FILE);
    if (!id) {
      log(`! No file named ${HERO_FILE} in Content > Files - the hero slot stays empty.`);
    } else {
      signInMain.backgroundImage = { mediaImageId: id };
      log(`Hero: ${HERO_FILE}`);
    }
  }

  const configuration = {
    branding: {
      designTokens: {
        // Square, like the rest of the theme.
        cornerRadius: { small: 0, base: 0, large: 0 },
        typography: {
          primary: { shopifyFontGroup: { baseFontHandle: HEADING_FONT, boldFontHandle: HEADING_FONT } },
          secondary: { shopifyFontGroup: { baseFontHandle: BODY_FONT, boldFontHandle: BODY_FONT } },
        },
      },
      surfaces: { signIn: { components: { header, main: signInMain } } },
    },
  };

  log('');
  log(JSON.stringify(configuration, null, 2));
  log('');

  if (!apply) {
    log('Preview only. Re-run with --apply to write it.');
    process.exit(0);
  }

  try {
    const d = await gql(cfg, UPDATE, { id: target.id, configuration }, 'checkoutAndAccountsConfigurationUpdate');
    log(`Written to ${d.checkoutAndAccountsConfigurationUpdate.configuration.name}.`);
  } catch (err) {
    if (scopeHelp(err)) process.exit(1);
    throw err;
  }

  log('');
  log('Checkout shares these tokens with the sign-in page - open checkout and check it too.');
  log('The "Continue with Shop" button keeps Shop\'s purple; that one is not ours to set.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
