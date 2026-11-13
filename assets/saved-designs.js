/*
  The designs saved in this browser, shown on the cart page.

  WHY THEY ARE HERE AND NOT UNDER THE STUDIO

  They used to sit at the foot of the studio page, below the frame, the buttons
  and the saved panel - which is the one place nobody looks once they have
  finished designing. A saved design is a thing the shopper has set aside, and
  the page where you look at what you have set aside is the bag. So the list
  lives on /cart now, beside the real one, as its own panel.

  IT IS NOT THE CART, AND IT MUST NOT LOOK LIKE IT

  Nothing in here is bought, reserved or priced. A saved design is a record in
  THIS browser's localStorage - see assets/eden-design-store.js - that holds
  every choice in the builder's own words, a quotable reference, and the state
  key that rebuilds the identical 3D ring. It does not follow anyone to another
  device and it is not known to the shop until somebody sends it to us. The
  panel says so in its own words, and it is drawn as a panel of its own rather
  than as more cart lines.

  A design is only in the bag when it has been added to it: that is the "Add to
  bag" action below, and it needs the section to name a product to charge the
  line against - the same stand-in the studio uses, because Shopify charges a
  line the variant's own price and a configured ring has no variant. With no
  product named the action is not drawn at all, and the panel is a shelf.

  WHY IT IS EMPTY UNTIL JAVASCRIPT RUNS

  The records are in localStorage, which Liquid cannot read, so the panel can
  only be built in the browser. It therefore ships hidden and shows itself once
  it has something to show, rather than rendering an empty "no saved designs"
  box on every cart page - including the carts of everyone who has never opened
  the studio.
*/
if (!customElements.get('saved-designs')) {
  customElements.define(
    'saved-designs',
    class SavedDesigns extends HTMLElement {
      connectedCallback() {
        if (this.armed) return;
        this.armed = true;

        this.list = this.querySelector('[data-saved-list]');
        this.status = this.querySelector('[data-saved-status]');
        this.variant = Number(this.dataset.cartVariant || 0) || 0;

        this.paint();
      }

      say(message, tone) {
        if (!this.status) return;
        this.status.textContent = message || '';
        this.status.toggleAttribute('hidden', !message);
        if (tone) this.status.setAttribute('data-tone', tone);
        else this.status.removeAttribute('data-tone');
      }

      rows() {
        // The store is a separate file and this one does not depend on the
        // studio being on the page, so a cart page loaded without it shows
        // nothing rather than throwing.
        if (!window.edenDesignStore) return [];
        try {
          return window.edenDesignStore.list();
        } catch (error) {
          return [];
        }
      }

      paint() {
        if (!this.list) return;

        const rows = this.rows();
        this.list.innerHTML = '';

        // The whole panel, heading and all, is the element's own business:
        // there is no empty state, because a cart page belonging to somebody
        // who has never designed a ring should say nothing about designs.
        this.toggleAttribute('hidden', rows.length === 0);
        if (!rows.length) return;

        rows.forEach((row) => this.list.appendChild(this.card(row)));

        const count = this.querySelector('[data-saved-count]');
        if (count) count.textContent = String(rows.length);

        this.land();
      }

      // Arriving from a save. The studio sends the shopper here with
      // #saved-designs on the URL rather than scrolling its own page before
      // leaving it, because this is the list they pressed the button to get
      // to. The panel is hidden when the page is parsed and built here a
      // moment later, so the browser's own anchor jump finds nothing - the
      // scroll has to be made once there is something to scroll to. Only on
      // the first paint: removing a design repaints the list, and a list that
      // jumped up the page every time would be a trap.
      land() {
        if (this.landed) return;
        if (window.location.hash !== '#saved-designs') return;
        this.landed = true;
        try {
          this.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
          this.scrollIntoView();
        }
      }

      card(row) {
        const item = document.createElement('li');
        item.className = 'sdg-card';

        const head = document.createElement('div');
        head.className = 'sdg-card__head';

        const name = document.createElement('p');
        name.className = 'sdg-card__ref';
        name.textContent = row.id;
        head.appendChild(name);

        // The builder's own figure, where the record kept one. It is labelled
        // as the builder's estimate rather than printed as a price, because
        // while the studio is covering that figure in the frame it is not a
        // number the shop is standing behind.
        if (row.price && this.dataset.showPrice === 'true') {
          const price = document.createElement('p');
          price.className = 'sdg-card__price';
          price.textContent = row.price;
          head.appendChild(price);
        }

        item.appendChild(head);

        if (row.title) {
          const title = document.createElement('p');
          title.className = 'sdg-card__title';
          title.textContent = row.title;
          item.appendChild(title);
        }

        // Every choice, in the builder's own words - the same pairs the studio
        // shows on the saved panel and the same ones that go on a cart line.
        const specs = document.createElement('dl');
        specs.className = 'sdg-card__specs';
        (row.options || []).forEach((option) => {
          if (!option || !option.name) return;
          const term = document.createElement('dt');
          term.textContent = option.name;
          const value = document.createElement('dd');
          value.textContent = option.value;
          specs.append(term, value);
        });
        if (specs.childElementCount) item.appendChild(specs);

        if (row.saved) {
          const when = document.createElement('p');
          when.className = 'sdg-card__when';
          when.textContent = (this.dataset.savedLead || 'Saved') + ' ' + this.when(row.saved);
          item.appendChild(when);
        }

        item.appendChild(this.actions(row));
        return item;
      }

      when(stamp) {
        try {
          return new Date(stamp).toLocaleDateString(document.documentElement.lang || 'en', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
        } catch (error) {
          return String(stamp).slice(0, 10);
        }
      }

      actions(row) {
        const wrap = document.createElement('div');
        wrap.className = 'sdg-card__actions';

        // Adding it to the bag is the one action that changes anything, so it
        // is the filled one - and it is only drawn when there is a product to
        // charge the line against.
        if (this.variant) {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'eden-action eden-action--solid sdg-card__add';
          add.textContent = this.dataset.addLabel || 'Add to bag';
          add.addEventListener('click', () => this.add(row, add));
          wrap.appendChild(add);
        }

        const href = row.reopen || row.builder || '';
        if (href) {
          const open = document.createElement('a');
          open.className = 'eden-link';
          open.href = href;
          open.textContent = this.dataset.reopenLabel || 'Reopen';
          wrap.appendChild(open);
        }

        if (this.dataset.support) {
          const ask = document.createElement('a');
          ask.className = 'eden-link';
          try {
            const url = new URL(this.dataset.support, window.location.origin);
            url.searchParams.set('design', row.id);
            ask.href = url.toString();
          } catch (error) {
            ask.href = this.dataset.support;
          }
          ask.textContent = this.dataset.askLabel || 'Contact support';
          wrap.appendChild(ask);
        }

        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'sdg-card__drop';
        drop.textContent = this.dataset.removeLabel || 'Remove';
        drop.addEventListener('click', () => {
          // Deliberately quiet: this is the shopper's own shelf, the design is
          // in no order and nothing is undone by removing it from a browser.
          window.edenDesignStore.remove(row.id);
          this.paint();
        });
        wrap.appendChild(drop);

        return wrap;
      }

      /* --------------------------------------------------------- the bag */

      add(row, button) {
        if (!this.variant || button.disabled) return;

        button.disabled = true;
        this.setAttribute('data-busy', 'true');
        this.say(this.dataset.addingText || 'Adding your design to the bag', 'busy');

        fetch(this.dataset.cartAdd || '/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: [
              {
                id: this.variant,
                quantity: 1,
                properties: window.edenDesignStore.properties(row, { price: this.dataset.cartPrice })
              }
            ]
          })
        })
          .then((response) =>
            response.json().then((data) => {
              if (!response.ok) throw new Error((data && data.description) || 'cart refused');
              return data;
            })
          )
          .then(() => {
            // The cart's own markup is rendered by Liquid and there is no safe
            // way to splice a line into it from here, so the page is reloaded:
            // the new line then arrives drawn by the theme, with the totals,
            // the shipping message and the count all correct. The panel
            // repaints itself on the way back up.
            window.location = this.dataset.cartUrl || window.location.pathname;
          })
          .catch(() => {
            button.disabled = false;
            this.removeAttribute('data-busy');
            this.say(
              this.dataset.addFailText ||
                'We could not add that design to your bag just now. Your design is still saved - contact support and we will pick it up with you.',
              'error'
            );
          });
      }
    }
  );
}
