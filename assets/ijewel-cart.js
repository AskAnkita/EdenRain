/*
  Catches the finished design when the shopper presses the builder's own
  "Add to cart" button.

  The configurator is somebody else's page in a cross-origin frame, so it cannot
  touch our cart and we cannot reach into it. The one way across is a message.
  Pressing the frame's own Add to cart posts, from the builder's origin:

    { source: 'ijewel', v: 2, event: 'cart:requested', data: {
        title, sku, state, selection, labels: [{ axis, label, option, value }],
        price: { amount, currency, minorUnits }, parts, tags, specs } }

  and then waits: the button does nothing further unless something on our side
  is listening. This is that something. The same bridge emits ready,
  price:changed, selection:changed and load:started/complete, and answers
  { source: 'ijewel', v: 2, id, method, params } calls - getState, getPrice,
  getSelection, getOptions({axis}), select({axis, option}) - which is what a
  cart bar or an options rail of our own would be built on.

  Two ways out, because a configured ring has a price Shopify will not be told:
  /cart/add.js takes a variant id, never a price.

    1. "cart" - the design is added as the product the section names, with every
       choice, the code, iJewel's price and the state key written onto the line
       as properties - the price underscored, and so out of the shopper's sight,
       whenever the section is covering it in the frame. Shopify charges that product's own price, so it has to be
       the one the shop means to charge - a bespoke deposit, a fixed design fee -
       and the real figure is read off the line.
    2. "enquiry" - nothing is charged. The design is saved to session storage and
       carried to the bespoke enquiry page in the query string, which is how the
       studio behaved before any of this. A failed cart add falls back to it.

  The state key is long and meant for machines, so it goes on the line as
  _Design key: an underscore keeps a property out of the shopper's cart.
*/
if (!customElements.get('ijewel-cart')) {
  customElements.define(
    'ijewel-cart',
    class IjewelCart extends HTMLElement {
      connectedCallback() {
        if (this.armed) return;
        this.armed = true;

        // Only the builder's own origin is listened to: every frame on the page
        // can post to us, and this one hands us something we put in a cart.
        this.origin = this.dataset.origin || 'https://ijewel3d.com';
        this.handler = this.receive.bind(this);
        window.addEventListener('message', this.handler);
      }

      disconnectedCallback() {
        window.removeEventListener('message', this.handler);
      }

      receive(event) {
        if (event.origin !== this.origin) return;

        const message = event.data;
        if (!message || typeof message !== 'object') return;
        if (message.source !== 'ijewel' || message.event !== 'cart:requested') return;

        const design = message.data || {};
        if (this.dataset.action === 'cart' && this.dataset.variant) {
          this.add(design);
        } else {
          this.enquire(design);
        }
      }

      // The builder sends its price in minor units with the scale alongside it -
      // 939000 at minorUnits 2 is $9,390.00 - so it is divided here rather than
      // printed raw onto an order line.
      money(price) {
        if (!price || typeof price !== 'object') return '';

        const amount = Number(price.amount);
        if (!isFinite(amount)) return '';

        const scale = Number.isFinite(Number(price.minorUnits)) ? Number(price.minorUnits) : 2;
        const value = amount / Math.pow(10, scale);
        const currency = price.currency || 'USD';

        try {
          return new Intl.NumberFormat(document.documentElement.lang || 'en', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: scale
          }).format(value);
        } catch (error) {
          return currency + ' ' + value.toFixed(scale);
        }
      }

      // The order line is what whoever makes the ring reads, so it is written in
      // the builder's own words: labels arrive as { axis, label, option, value }
      // and the shown value is the one that goes on the line, not the slug.
      properties(design) {
        const props = {};

        if (design.title) props.Design = String(design.title);

        const labels = design.labels;
        if (Array.isArray(labels)) {
          labels.forEach((row) => {
            if (!row) return;
            const name = row.label || row.axis || row.name || row.key;
            const value = row.value === undefined ? row.option : row.value;
            if (name && value !== undefined && value !== null && value !== '') {
              props[String(name)] = String(value);
            }
          });
        } else if (labels && typeof labels === 'object') {
          Object.keys(labels).forEach((name) => {
            const value = labels[name];
            if (value !== undefined && value !== null && value !== '') {
              props[name] = String(value);
            }
          });
        }

        const sku = design.sku || design.code;
        if (sku) props.Code = String(sku);

        // Where the studio is covering the builder's price, that figure is not
        // one the shop is quoting, so it is kept off the line the shopper reads
        // in their cart. It still travels on the order, underscored, because it
        // is what was on screen when they pressed the button - and whoever
        // prices the design by hand should see what they were shown.
        const price = this.money(design.price);
        if (price) props[this.dataset.price === 'hidden' ? '_Builder price' : 'Design price'] = price;

        // The state string reopens the exact ring in the builder, so the line
        // carries both it and the link that uses it. Underscored: these are for
        // whoever fulfils the order, not for the shopper's cart.
        const state = typeof design.state === 'string' ? design.state : '';
        if (state) {
          props['_Design key'] = state;
          if (this.dataset.embed) {
            props['_Reopen'] =
              this.dataset.embed +
              (this.dataset.embed.indexOf('?') === -1 ? '?' : '&') +
              'state=' +
              encodeURIComponent(state);
          }
        }

        return props;
      }

      add(design) {
        const routes = window.routes || {};
        const addUrl = routes.cart_add_url || '/cart/add.js';

        fetch(addUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: [
              {
                id: Number(this.dataset.variant),
                quantity: 1,
                properties: this.properties(design)
              }
            ]
          })
        })
          .then((response) => {
            if (!response.ok) throw new Error('Cart add refused');
            window.location = routes.cart_url || '/cart';
          })
          .catch(() => {
            // A sold-out or deleted variant would otherwise swallow the design
            // the shopper just spent ten minutes on.
            this.enquire(design);
          });
      }

      enquire(design) {
        // Kept whole for the enquiry form to read back; the query string below
        // is only the readable summary, and a long design would blow the URL.
        try {
          sessionStorage.setItem('eden-ring-design', JSON.stringify(design));
        } catch (error) {
          /* private browsing - the summary in the URL still gets through */
        }

        const link = this.dataset.enquiry;
        if (!link) return;

        const props = this.properties(design);
        const summary = Object.keys(props)
          .filter((name) => name.charAt(0) !== '_')
          .map((name) => name + ': ' + props[name])
          .join(', ')
          .slice(0, 800);

        const url = new URL(link, window.location.origin);
        if (summary) url.searchParams.set('design', summary);
        window.location = url.toString();
      }
    }
  );
}
