/*
 * Fills /pages/refund-returns with a full return policy and puts it on its own template.
 *
 * The page held three sentences - a 30-day promise, an email address, and nothing about how a
 * return actually works. This writes the policy out properly: the window and what happens at each
 * stage of it, what can and cannot be sent back, how to start one, how refunds are paid,
 * exchanges, resizing, international returns, faulty goods, and where UK law sits behind all of
 * it. The shape is MiaDonna's returns page; the window is Eden Raine's own 30 days, which is what
 * the announcement bar, the homepage service marquee and the brand benefits row all promise.
 *
 * It carries no imagery. The page goes on templates/page.refund-returns.json, where
 * sections/page-content.liquid cuts the body at each </table> and sets the photograph from the
 * matching panel block beside it - so the pictures are the template's, chosen in the theme editor,
 * and the words are the merchant's, edited in Online Store > Pages. Two tables, two panels.
 *
 * Push the theme before --apply, or the page's new template suffix points at a file the live
 * theme does not have yet. A `shopify theme dev` session syncs it on save.
 *
 * Three things have to move together, which is why they are all in here:
 *
 *   page   - /pages/refund-returns, the full policy with its tables and photographs.
 *   policy - the store's Refund policy (Settings > Policies), which is a separate record from the
 *            page and the one Shopify shows at checkout. It renders through Shopify's own
 *            shopify-policy__ markup, not through a theme section, so it gets no panels and no
 *            pictures - it is the same policy written as prose, pointing at the page.
 *   menu   - the footer's "Return Policy", which pointed at the policy rather than at the page,
 *            so the footer link showed the three-sentence version. It now points at the page.
 *            The separate "Refund policy" item stays on the policy, where it belongs.
 *
 * Usage:
 *   node scripts/shopify/update-returns-page.mjs                   # preview, writes nothing
 *   node scripts/shopify/update-returns-page.mjs --apply           # write all three
 *   node scripts/shopify/update-returns-page.mjs --apply --only=menu
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, gql } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, 'backups');
const apply = process.argv.includes('--apply');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()) : ['page', 'policy', 'menu'];
const wants = (step) => only.includes(step);
const log = (...m) => console.log(...m);

const PAGE_HANDLE = 'refund-returns';
const PAGE_PATH = `/pages/${PAGE_HANDLE}`;
const TEMPLATE = 'refund-returns';
const EMAIL = 'sales@edenraine.co.uk';
const FOOTER_MENU = 'footer';
const FOOTER_ITEM = 'Return Policy';

/*
 * The markup is the admin editor's own: <h1> as the label above a table, a first row standing in
 * for a header, a two-column table whose narrow first column is the label and whose second holds
 * the detail as a list. assets/page-content.css styles exactly that, so content written this way
 * comes out looking like the Shipping & Handling page rather than a browser default.
 *
 * The first column is set in the heading face and never wraps, so every value in it stays short.
 */
export function buildReturnsHtml() {
  return `<h1 style="text-align: center;">30 day returns</h1>
<p>Eden Raine was built on service as much as on stones. If a piece is not right — the size, the setting, the way it sits on the hand — send it back within 30 days and we will refund it in full. Return postage is on us, in the UK and internationally.</p>
<p>The piece needs to come back unworn and in the box it arrived in, with its certificate. Beyond that the policy is deliberately plain: four steps, no restocking fee, and a person at the other end of the email.</p>
<table width="100%">
<tbody>
<tr>
<td style="width: 22%;">when</td>
<td style="width: 78%;">what happens</td>
</tr>
<tr>
<td>30 days</td>
<td>
<ul>
<li>You have 30 days from the day the order arrives to ask for a return</li>
<li>Email <strong>${EMAIL}</strong> with your order number and we send a prepaid label back</li>
<li>The window runs from delivery, not from the day you ordered</li>
<li>A request made after 30 days cannot be accepted</li>
</ul>
</td>
</tr>
<tr>
<td>7 days</td>
<td>
<ul>
<li>Once a return is approved, post it within 7 days of the label reaching you</li>
<li>Hand the parcel over the counter at a Post Office — never drop it in a postbox</li>
<li>Keep the receipt, it is your proof of posting while the parcel is with Royal Mail</li>
</ul>
</td>
</tr>
<tr>
<td>5 days</td>
<td>
<ul>
<li>Your piece is checked by our workshop when it reaches us, usually within 5 working days</li>
<li>We look at the item itself, the packaging and the certificate it came with</li>
<li>You get an email either way, and we say what we found</li>
</ul>
</td>
</tr>
<tr>
<td>3–5 days</td>
<td>
<ul>
<li>The refund is issued to the card or account the order was paid with</li>
<li>Most show within 3 to 5 working days; some banks take a day or two longer</li>
<li>The original shipping you paid, if any, is refunded with it</li>
</ul>
</td>
</tr>
</tbody>
</table>
<h1 style="text-align: center;">What can be returned</h1>
<p>Almost everything we sell can come back. The exceptions are the pieces that were made for one person and cannot be sold to another, and anything that has already been worn or altered.</p>
<table width="100%">
<tbody>
<tr>
<td style="width: 22%;">status</td>
<td style="width: 78%;">which pieces</td>
</tr>
<tr>
<td>returnable</td>
<td>
<ul>
<li>Every ready-to-wear piece — rings, earrings, necklaces, bracelets and wedding bands</li>
<li>Made-to-order pieces, built to a standard size and setting</li>
<li>Loose lab-grown diamonds and gemstones</li>
<li>A piece bought as a gift, sent back by whoever received it, with the order number</li>
</ul>
</td>
</tr>
<tr>
<td>not returnable</td>
<td>
<ul>
<li>Anything worn, resized, altered or repaired by someone other than Eden Raine</li>
<li>Engraved pieces and bespoke commissions, made to your own specification</li>
<li>Earrings whose hygiene seal has been broken</li>
<li>A piece sent back without its box, its certificate or an approved return label</li>
<li>Anything sold as final sale, which is said on the product page before you buy</li>
</ul>
</td>
</tr>
</tbody>
</table>
<h2>How to start a return</h2>
<p>There is no portal and no form to fill in. One email starts it, and the same person sees it through.</p>
<ol>
<li><strong>Email us.</strong> Send your order number and which piece you are returning to <strong>${EMAIL}</strong>, within 30 days of delivery. Telling us why helps — if it is the size, a resize may be the quicker answer.</li>
<li><strong>Wait for the label.</strong> We reply with a prepaid, insured, tracked return label, usually the same working day. Do not post a piece back without one: an uninsured parcel is not covered if it goes missing, and we cannot match it to an order.</li>
<li><strong>Pack it as it came.</strong> The piece in its own box, the certificate with it, and the whole thing inside the outer packaging. Address the parcel exactly as the label reads and write nothing about jewellery or diamonds on the outside.</li>
<li><strong>Post it within 7 days.</strong> Over the counter, and keep the receipt. The tracking number comes to you by email so you can follow the parcel yourself.</li>
</ol>
<h2>Refunds</h2>
<p>Once the workshop has checked the piece, the refund goes back to the card or account the order was paid with — card, PayPal, Apple Pay, Google Pay or Klarna all return to source. We cannot refund to a different card from the one that paid.</p>
<p>The full amount comes back, including any shipping you paid on the original order. There is no restocking fee and no charge for the return label. If a certificate or a gift that came with the piece is missing when it reaches us, we will tell you what it costs to replace before anything is deducted.</p>
<h2>Exchanges</h2>
<p>If you would rather have a different piece than a refund, say so in your first email. We will send the label as usual, and once the first piece is back and checked we post the replacement free of charge. If the new piece costs more we send a payment link for the difference; if it costs less, the difference is refunded.</p>
<p>Exchanges run inside the same 30 days. We can only hold a replacement for a few days, so for a piece that is nearly out of stock it is usually safer to order it straight away and return the first one separately.</p>
<h2>Ring resizing</h2>
<p>A ring that is close but not quite right does not need to be returned at all. Your first resize within 60 days of delivery is free, including postage both ways, on any ring that can be resized — most plain and solitaire settings can move a size or two either way.</p>
<p>Eternity rings, full pavé bands and tension settings cannot be resized without being remade, because the stones run the whole way round. For those we exchange for the right size instead, under the policy above. If you are not sure of your size, the <a href="/pages/er-sizing">ring size guide</a> is worth five minutes before you order.</p>
<h2>International returns</h2>
<p>Returns from outside the UK are free as well, and work the same way: email us, and we send a prepaid label for your country. Post it over the counter and keep the receipt.</p>
<p>Two things to get right, or customs will hold the parcel and the refund with it. Mark the outside of the box and the customs declaration <strong>"Return of UK goods"</strong>, and quote the original order number on the declaration. Sign and include every document we send with the label. Any duty or tax you paid when the order arrived is reclaimed from your own customs authority rather than from us — keep the paperwork, as you will need it to do that.</p>
<h2>Faulty, damaged or lost in transit</h2>
<p>If a piece arrives damaged, or a stone or clasp fails in normal wear, that is not a return — it is a repair or a replacement, and the 30 days do not apply. Email us with your order number and a photograph of the problem and we will put it right.</p>
<p>If a parcel does not arrive at all, tell us within 30 days of the dispatch email. Every order leaves here insured and tracked, so we can trace it with Royal Mail and either find it or replace the piece.</p>
<h2>Your rights under UK law</h2>
<p>Nothing on this page replaces your statutory rights, and this policy is deliberately more generous than the law requires. Under the Consumer Contracts Regulations you have 14 days from delivery to cancel an online order; we give 30. Under the Consumer Rights Act you can reject faulty goods within 30 days of receiving them, and that right stands however long ago you ordered.</p>
<p>Bespoke and personalised pieces are the one place the law agrees with us: goods made to your own specification are exempt from the cancellation right, which is why an engraved or commissioned piece cannot be returned simply because you have changed your mind.</p>
<h2>Still not sure?</h2>
<p>Ask before you post anything. If you tell us what is wrong with the piece, there is a good chance the answer is a free resize or a repair rather than a return at all.</p>
<p>Email us at <strong>${EMAIL}</strong> and we will come back to you the same working day.</p>`;
}

/*
 * The same policy, as prose. Shopify renders a shop policy in its own container with none of the
 * theme's section markup around it, so there are no tables to pair pictures with and no panels to
 * put them in - tables here would come out as an unstyled wireframe. It says the same things in
 * the same order and sends anyone who wants the detail to the page.
 */
export function buildPolicyHtml() {
  // No heading of its own at the top: Shopify prints the policy's title above this, and
  // assets/policy-page.css sets it as the masthead, so an opening <h3> is a second title.
  return `<p>If a piece is not right — the size, the setting, the way it sits on the hand — send it back within 30 days of delivery and we will refund it in full. Return postage is on us, in the UK and internationally. There is no restocking fee.</p>
<p>The full policy, including resizing, exchanges and international returns, is at <a href="${PAGE_PATH}">Return &amp; Refund Policy</a>.</p>

<h3>The window</h3>
<p>You have 30 days from the day your order arrives to ask for a return. The window runs from delivery, not from the day you ordered, and a request made after 30 days cannot be accepted.</p>
<p>Once a return is approved, post it within 7 days of the prepaid label reaching you. Your piece is checked by our workshop when it gets to us, usually within 5 working days, and the refund is issued to the card or account the order was paid with — most show within 3 to 5 working days.</p>

<h3>What can be returned</h3>
<p>Every ready-to-wear piece, made-to-order pieces built to a standard size and setting, and loose lab-grown diamonds and gemstones. A piece bought as a gift can be sent back by whoever received it, with the order number. The piece must come back unworn, in its original box, with its certificate.</p>
<p>We cannot accept anything worn, resized, altered or repaired by someone other than Eden Raine; engraved pieces and bespoke commissions, which are made to your own specification; earrings whose hygiene seal has been broken; a piece sent without its box, certificate or an approved return label; or anything sold as final sale.</p>

<h3>How to start a return</h3>
<p>Email <strong>${EMAIL}</strong> with your order number and which piece you are returning. We reply with a prepaid, insured, tracked return label, usually the same working day. Do not post a piece back without one — an uninsured parcel is not covered if it goes missing, and we cannot match it to an order.</p>
<p>Pack the piece in its own box with the certificate, inside the outer packaging, and hand the parcel over the counter at a Post Office rather than dropping it in a postbox. Keep the receipt as proof of posting.</p>

<h3>Refunds and exchanges</h3>
<p>Refunds go back to the original payment method — card, PayPal, Apple Pay, Google Pay or Klarna all return to source. The full amount comes back, including any shipping you paid on the original order. We cannot refund to a different card from the one that paid.</p>
<p>If you would rather exchange than refund, say so in your first email. Once the first piece is back and checked we post the replacement free of charge, and settle any difference in price either way.</p>

<h3>Ring resizing</h3>
<p>A ring that is close but not quite right does not need to be returned. Your first resize within 60 days of delivery is free, including postage both ways, on any ring that can be resized. Eternity rings, full pavé bands and tension settings cannot be resized without being remade; for those we exchange for the right size instead.</p>

<h3>International returns</h3>
<p>Returns from outside the UK are free and work the same way. Mark the outside of the box and the customs declaration <strong>"Return of UK goods"</strong> and quote the original order number, or customs will hold the parcel and the refund with it. Any duty or tax you paid when the order arrived is reclaimed from your own customs authority rather than from us.</p>

<h3>Faulty or damaged pieces</h3>
<p>If a piece arrives damaged, or a stone or clasp fails in normal wear, that is a repair or a replacement rather than a return, and the 30 days do not apply. Email us with your order number and a photograph of the problem.</p>

<h3>Your rights under UK law</h3>
<p>Nothing here replaces your statutory rights, and this policy is deliberately more generous than the law requires. Under the Consumer Contracts Regulations you have 14 days from delivery to cancel an online order; we give 30. Under the Consumer Rights Act you can reject faulty goods within 30 days of receiving them. Goods made to your own specification are exempt from the cancellation right, which is why an engraved or commissioned piece cannot be returned because you have changed your mind.</p>
<p>Questions before you post anything: <strong>${EMAIL}</strong>.</p>`;
}

// menuUpdate rebuilds the menu from the input, so every item has to be sent back, not just the
// one that changes, and the ids are dropped on the way.
function toInput(item) {
  const out = { title: item.title, type: item.type };
  if (item.resourceId) out.resourceId = item.resourceId;
  else if (item.url) out.url = item.url;
  if (item.items && item.items.length) out.items = item.items.map(toInput);
  return out;
}

function backup(name, data) {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(backupDir, `${name}-before-${stamp}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  log(`  saved ${file}`);
}

async function main() {
  const cfg = config();

  const found = await gql(
    cfg,
    `query($q: String!) {
      pages(first: 1, query: $q) { nodes { id title handle templateSuffix body } }
    }`,
    { q: `handle:${PAGE_HANDLE}` }
  );

  const page = found.pages.nodes[0];
  if (!page) throw new Error(`No ${PAGE_PATH} in this store.`);

  const html = buildReturnsHtml();
  const policyHtml = buildPolicyHtml();

  // ------------------------------------------------------------------ the page
  if (wants('page')) {
    const tables = (html.match(/<\/table>/g) || []).length;
    log(`page   ${PAGE_PATH}  "${page.title}"`);
    log(`       template ${page.templateSuffix || '(default)'} -> ${TEMPLATE}`);
    log(`       body ${page.body ? page.body.length : 0} -> ${html.length} characters`);
    log(`       ${tables} tables, so templates/page.${TEMPLATE}.json needs ${tables} panel blocks`);

    if (apply) {
      backup(`page-${PAGE_HANDLE}`, page);
      await gql(
        cfg,
        `mutation($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id handle templateSuffix }
            userErrors { field message }
          }
        }`,
        { id: page.id, page: { body: html, templateSuffix: TEMPLATE } },
        'pageUpdate'
      );
      log(`       written`);
    }
  }

  // --------------------------------------------------------------- the policy
  if (wants('policy')) {
    const shop = await gql(cfg, `query { shop { shopPolicies { id type title body } } }`);
    const policy = shop.shop.shopPolicies.find((p) => p.type === 'REFUND_POLICY');
    if (!policy) throw new Error('This store has no Refund policy to update.');

    log(`\npolicy /policies/refund-policy  "${policy.title}"`);
    log(`       body ${policy.body ? policy.body.length : 0} -> ${policyHtml.length} characters`);

    if (apply) {
      backup('policy-refund', policy);
      await gql(
        cfg,
        `mutation($policy: ShopPolicyInput!) {
          shopPolicyUpdate(shopPolicy: $policy) {
            shopPolicy { id type }
            userErrors { field message }
          }
        }`,
        { policy: { type: 'REFUND_POLICY', body: policyHtml } },
        'shopPolicyUpdate'
      );
      log(`       written`);
    }
  }

  // ----------------------------------------------------------------- the menu
  if (wants('menu')) {
    const data = await gql(
      cfg,
      `query { menus(first: 50) { nodes { id handle title
         items { id title type url resourceId
           items { id title type url resourceId items { id title type url resourceId } } } } } }`
    );
    const menu = data.menus.nodes.find((m) => m.handle === FOOTER_MENU);
    if (!menu) throw new Error(`The store has no menu with handle "${FOOTER_MENU}".`);

    const target = menu.items.find((i) => i.title === FOOTER_ITEM);
    if (!target) throw new Error(`The "${FOOTER_MENU}" menu has no item called "${FOOTER_ITEM}".`);

    log(`\nmenu   ${FOOTER_MENU} > "${FOOTER_ITEM}"`);
    log(`       ${target.type} ${target.url}  ->  PAGE ${PAGE_PATH}`);

    if (target.url === PAGE_PATH) {
      log('       already points at the page; nothing to do');
    } else if (apply) {
      backup(`menu-${FOOTER_MENU}`, menu);
      const items = menu.items.map((i) =>
        i.id === target.id
          ? { title: FOOTER_ITEM, type: 'PAGE', resourceId: page.id }
          : toInput(i)
      );
      await gql(
        cfg,
        `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
          menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
            menu { id }
            userErrors { field message }
          }
        }`,
        { id: menu.id, title: menu.title, handle: FOOTER_MENU, items },
        'menuUpdate'
      );
      log(`       written`);
    }
  }

  if (!apply) {
    log('\nNothing written. Add --apply to write, after the theme has been pushed.');
    return;
  }
  log('\nDone.');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
