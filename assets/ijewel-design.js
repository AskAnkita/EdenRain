/*
  Save design / Contact support - what the studio does instead of adding to a
  cart.

  This replaces assets/ijewel-cart.js. The old element put a configured ring in
  the Shopify cart by charging some other product's price and writing the real
  figure onto the line as a property, which is a workaround for a thing the
  shop does not actually want to do: a bespoke ring is quoted, not bought off a
  shelf. So nothing is charged here. The design is saved and sent to us.

  THE TWO ACTIONS

    Save design       asks the builder what is on screen, writes the record to
                      assets/eden-design-store.js, and shows the reference and
                      a link that reopens the ring.
    Contact support   saves the design if it is not saved already, then goes to
                      the support page carrying its reference, where the record
                      is shown above a contact form that sends it to us.

  Both end in the same record, and the record carries the builder's state key -
  the string that rebuilds the exact 3D scene. See eden-design-store.js for why
  that key is the design as far as anything outside the frame is concerned.

  WHERE THE DESIGN COMES FROM

  Two ways in, because there are two buttons and only one of them is ours.

  1. Our own buttons ask. The builder speaks an undocumented v2 bridge - the
     same envelope assets/studio-options.js uses - and answers getState,
     getPrice, getAxes, getSelection and getOptions({axis}). So a design can be
     read at any moment, which is what lets "Save design" sit wherever it is
     useful rather than only where the builder put its own button. The readable
     choices come from getAxes, which answers with every axis, the label the
     builder itself shows for it, and its options with the chosen one marked -
     so the words on the record are the vendor's own, never a slug and never a
     word of ours.

  2. The builder's own Add to cart is caught. It lives inside a cross-origin
     frame, so it cannot be relabelled or removed from out here - their page,
     their button. What it does is ours, though: pressing it posts
     cart:requested out to this page and then waits, doing nothing further
     unless something is listening. This listens, and treats the press as a
     save. Nothing is added to any cart. That payload already carries proper
     labels, so it is used as sent.

     On a phone this rarely fires: studio-options.liquid crops the frame to its
     3D stage and the builder's button falls below the cut. That is exactly why
     the mobile bar's own button must be wired to the actions here.

  The bridge cannot answer before the viewer is running, and the viewer waits
  to be tapped, so a press before that is answered with the line asking for the
  tap rather than with a broken button or an empty record.
*/
if (!customElements.get('ijewel-design')) {
  customElements.define(
    'ijewel-design',
    class IjewelDesign extends HTMLElement {
      connectedCallback() {
        if (this.armed) return;
        this.armed = true;

        this.origin = this.dataset.origin || 'https://ijewel3d.com';
        this.seq = 0;
        this.pending = new Map();
        this.live = false;

        this.status = this.querySelector('[data-design-status]');
        this.panel = this.querySelector('[data-design-panel]');
        this.list = this.querySelector('[data-design-list]');

        this.handler = this.receive.bind(this);
        window.addEventListener('message', this.handler);

        this.findFrame();
        this.wire();
        this.paintList();
      }

      disconnectedCallback() {
        window.removeEventListener('message', this.handler);
        clearInterval(this.hunt);
      }

      /* ------------------------------------------------------------ the frame */

      // ijewel-studio.js only builds the iframe once its section is near the
      // viewport, and the theme editor can rebuild it at any moment, so the
      // frame is looked for rather than assumed.
      findFrame() {
        const selector = this.dataset.frame || 'ijewel-studio iframe';
        const look = () => {
          const frame = document.querySelector(selector);
          if (!frame) return false;
          this.frame = frame;
          return true;
        };
        if (look()) return;
        this.hunt = setInterval(() => {
          if (look()) clearInterval(this.hunt);
        }, 400);
      }

      call(method, params) {
        return new Promise((resolve, reject) => {
          if (!this.frame || !this.frame.contentWindow) {
            reject(new Error('no frame'));
            return;
          }
          const id = ++this.seq;
          this.pending.set(id, { resolve: resolve, reject: reject });
          this.frame.contentWindow.postMessage(
            { source: 'ijewel', v: 2, id: id, method: method, params: params || {} },
            this.origin
          );
          setTimeout(() => {
            if (!this.pending.has(id)) return;
            this.pending.delete(id);
            reject(new Error(method + ' timed out'));
          }, 10000);
        });
      }

      receive(event) {
        if (event.origin !== this.origin) return;
        const message = event.data;
        if (!message || typeof message !== 'object' || message.source !== 'ijewel') return;

        if (message.id && this.pending.has(message.id)) {
          const slot = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) slot.reject(new Error((message.error && message.error.code) || 'bridge error'));
          else slot.resolve(message.result);
          return;
        }

        if (!message.event) return;

        // The frame and this element may arrive in either order; the first word
        // from the builder settles which frame is the builder's.
        if (!this.frame && event.source) {
          this.frame =
            Array.from(document.querySelectorAll('iframe')).find((f) => f.contentWindow === event.source) || this.frame;
        }

        // Any word at all means the viewer is running and the bridge will
        // answer. Until then our buttons say so rather than failing.
        this.live = true;
        this.setAttribute('data-live', 'true');

        // Their Add to cart. Caught, and turned into whatever the merchant
        // chose this to mean - never a cart add.
        if (message.event === 'cart:requested') {
          const design = message.data || {};
          if (this.dataset.intercept === 'support') this.support(design);
          else if (this.dataset.intercept === 'save') this.save(design);
        }
      }

      /* ---------------------------------------------------------- the buttons */

      // Buttons are found across the page, not only inside this element, so the
      // mobile bar in studio-options.liquid - which is the only action surface
      // a phone has, the builder's own button being cropped away - drives the
      // same flow by naming the attribute.
      wire() {
        document.querySelectorAll('[data-design-save]').forEach((node) => {
          node.addEventListener('click', (event) => {
            event.preventDefault();
            this.save();
          });
        });

        document.querySelectorAll('[data-design-support]').forEach((node) => {
          node.addEventListener('click', (event) => {
            // A link, so it still works with no JavaScript and still works
            // when the bridge never answers: the support page has a plain
            // enquiry form on it either way. Taken over here only to get the
            // design onto the record first.
            event.preventDefault();
            this.support();
          });
        });
      }

      say(message, tone) {
        if (!this.status) return;
        this.status.textContent = message || '';
        this.status.toggleAttribute('hidden', !message);
        if (tone) this.status.setAttribute('data-tone', tone);
        else this.status.removeAttribute('data-tone');
      }

      /* ----------------------------------------------------------- the design */

      // The axis keys are the builder's slugs - shankMetal, headGem - and they
      // are not for reading. The merchant can name them in the section; a slug
      // with no name is split up and sentence-cased, which is right often
      // enough to be better than printing the slug.
      names() {
        if (this.axisNames) return this.axisNames;
        this.axisNames = {};
        (this.dataset.axisNames || '')
          .split('\n')
          .forEach((line) => {
            const parts = line.split('=');
            if (parts.length < 2) return;
            const axis = parts[0].trim();
            const name = parts.slice(1).join('=').trim();
            if (axis && name) this.axisNames[axis] = name;
          });
        return this.axisNames;
      }

      // The merchant's own wording wins if they have set any, then the label the
      // builder shows, and only then a slug tidied up - which is the last
      // resort rather than the first.
      name(axis, given) {
        const named = this.names()[axis];
        if (named) return named;
        if (given) return String(given);
        const words = String(axis)
          .replace(/[_-]+/g, ' ')
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .trim();
        return words.charAt(0).toUpperCase() + words.slice(1);
      }

      // getPrice answers with the total under either name depending on the
      // build, so both are read and handed on in the shape the store expects.
      price(data) {
        if (!data || typeof data !== 'object') return null;
        const amount = typeof data.total === 'number' ? data.total : data.amount;
        if (typeof amount !== 'number') return null;
        return { amount: amount, currency: data.currency || this.dataset.currency || 'GBP', minorUnits: typeof data.minorUnits === 'number' ? data.minorUnits : 2 };
      }

      // The choices, in the builder's own words.
      //
      // getAxes answers with every axis at once - its key, the label the
      // builder itself shows for it, and its options with the chosen one marked
      // state: 'selected'. So one call reads the whole design, and the names on
      // the record are the vendor's rather than ours: "Center Stone", "Shank
      // Metal", not a slug we tidied up and not a word we invented. That
      // matters - renaming an option is how the words on an order line stop
      // matching the words the shopper was looking at.
      //
      // It is undocumented, like the rest of this bridge, so a build that does
      // not answer it falls back to the way the option rows do it: ask what is
      // selected, then ask each axis for its options and read the label off.
      axes() {
        return this.call('getAxes').then((axes) => {
          if (!Array.isArray(axes) || !axes.length) throw new Error('no axes');
          return axes
            .filter((axis) => axis && axis.key && axis.active !== false)
            .map((axis) => {
              const options = Array.isArray(axis.options) ? axis.options : [];
              const chosen = options.find((option) => option && option.state === 'selected');
              if (!chosen) return null;
              return {
                axis: axis.key,
                label: this.name(axis.key, axis.label),
                option: chosen.key,
                value: chosen.label || chosen.key
              };
            })
            .filter(Boolean);
        });
      }

      legacyAxes() {
        return this.call('getSelection').then((selection) => {
          const axes = selection && typeof selection === 'object' ? Object.keys(selection) : [];
          return Promise.all(
            axes.map((axis) =>
              this.call('getOptions', { axis: axis })
                .then((options) => {
                  const list = Array.isArray(options) ? options : [];
                  const chosen = list.find((option) => option && option.state === 'selected');
                  if (!chosen) return null;
                  return { axis: axis, label: this.name(axis), option: chosen.key, value: chosen.label || chosen.key };
                })
                .catch(() => null)
            )
          ).then((labels) => labels.filter(Boolean));
        });
      }

      // Ask the builder what is on screen. The state key is the one thing that
      // must arrive - without it there is no design to reopen - so it is the
      // only call that is allowed to fail the whole read.
      collect() {
        return this.call('getState').then((state) => {
          return Promise.all([
            this.call('getPrice').catch(() => null),
            this.axes().catch(() => this.legacyAxes()).catch(() => [])
          ]).then(([price, labels]) => ({
            title: this.dataset.title || '',
            state: typeof state === 'string' ? state : '',
            price: this.price(price),
            labels: labels
          }));
        });
      }

      // Both actions need a saved record and neither should save the same ring
      // twice, so this is the one place a record is made. `design` is the
      // builder's own cart:requested payload when the press came from their
      // button, and nothing when it came from ours.
      record(design) {
        const context = {
          embed: this.dataset.embed || '',
          studio: this.dataset.studio || window.location.pathname,
          prefix: this.dataset.prefix || 'ER'
        };

        if (design) return Promise.resolve(window.edenDesignStore.save(design, context));

        if (!this.frame) return Promise.reject(new Error('no frame'));
        if (!this.live) return Promise.reject(new Error('not ready'));

        return this.collect().then((data) => window.edenDesignStore.save(data, context));
      }

      trouble(error) {
        const reason = error && error.message;
        if (reason === 'not ready' || reason === 'no frame') {
          this.say(this.dataset.waitText || 'Tap the ring to start the designer, then save your design.', 'wait');
        } else {
          // The bridge is undocumented and a build that stops answering is a
          // real possibility, so the way out is named rather than hidden: the
          // support page takes an enquiry with no design attached.
          this.say(this.dataset.failText || 'We could not read the design just now. Contact support and we will pick it up with you.', 'error');
        }
      }

      /* ----------------------------------------------------------- the actions */

      save(design) {
        this.say(this.dataset.savingText || 'Saving your design', 'busy');
        this.setAttribute('data-busy', 'true');

        return this.record(design)
          .then((row) => {
            this.removeAttribute('data-busy');
            this.show(row);
            this.paintList();
            return row;
          })
          .catch((error) => {
            this.removeAttribute('data-busy');
            this.trouble(error);
          });
      }

      support(design) {
        this.say(this.dataset.savingText || 'Saving your design', 'busy');
        this.setAttribute('data-busy', 'true');

        return this.record(design)
          .then((row) => this.go(row))
          .catch(() => {
            // Still sent, with nothing attached: somebody who pressed "contact
            // support" asked to talk to a person, and a failed read of the
            // builder is not a reason to refuse them.
            this.removeAttribute('data-busy');
            this.go(null);
          });
      }

      // The support page reads the record out of local storage by reference.
      // The summary and the state key travel in the URL as well, so the page
      // still has something to show when the link is opened somewhere that has
      // no store to read - a forwarded link, another device, private browsing.
      go(row) {
        const link = this.dataset.support;
        if (!link) {
          this.removeAttribute('data-busy');
          this.say(this.dataset.failText || 'Contact support is not set up on this page yet.', 'error');
          return;
        }

        const url = new URL(link, window.location.origin);
        if (row) {
          url.searchParams.set('design', row.id);
          const summary = window.edenDesignStore.summary(row);
          if (summary) url.searchParams.set('summary', summary.slice(0, 600));
          // A state key runs to a couple of kilobytes on a complicated ring and
          // the whole URL has to survive being pasted into an email, so it only
          // rides along while it is short enough to be harmless. The record in
          // the store has it in full either way.
          if (row.state && row.state.length <= 1200) url.searchParams.set('state', row.state);
        }
        window.location = url.toString();
      }

      /* ------------------------------------------------------------- the panel */

      show(row) {
        if (!row) return;

        this.say('', '');

        if (!this.panel) {
          this.say((this.dataset.savedText || 'Design saved') + ' - ' + row.id, 'done');
          return;
        }

        this.panel.hidden = false;
        const reference = this.panel.querySelector('[data-design-reference]');
        if (reference) reference.textContent = row.id;

        const specs = this.panel.querySelector('[data-design-specs]');
        if (specs) {
          specs.innerHTML = '';
          (row.options || []).forEach((option) => {
            const term = document.createElement('dt');
            term.textContent = option.name;
            const value = document.createElement('dd');
            value.textContent = option.value;
            specs.append(term, value);
          });
          specs.toggleAttribute('hidden', !(row.options || []).length);
        }

        const reopen = this.panel.querySelector('[data-design-reopen]');
        if (reopen) {
          const href = row.reopen || row.builder || '';
          reopen.toggleAttribute('hidden', !href);
          if (href) reopen.setAttribute('href', href);
        }

        const support = this.panel.querySelector('[data-design-go]');
        if (support && this.dataset.support) {
          const url = new URL(this.dataset.support, window.location.origin);
          url.searchParams.set('design', row.id);
          support.setAttribute('href', url.toString());
        }

        // A design that could not be written down is still on screen and still
        // usable through the link, so it is not reported as saved.
        const warning = this.panel.querySelector('[data-design-unstored]');
        if (warning) warning.toggleAttribute('hidden', row.stored !== false);

        this.panel.setAttribute('tabindex', '-1');
        this.panel.focus({ preventScroll: true });
      }

      // Everything saved on this device, so a shopper who comes back to the
      // studio finds the ring they made last week rather than starting again.
      paintList() {
        if (!this.list) return;

        const rows = window.edenDesignStore.list();
        this.list.innerHTML = '';
        this.list.closest('[data-design-saved]')?.toggleAttribute('hidden', rows.length === 0);
        if (!rows.length) return;

        rows.forEach((row) => {
          const item = document.createElement('li');
          item.className = 'ijd-saved__item';

          const name = document.createElement('p');
          name.className = 'ijd-saved__name';
          name.textContent = row.id;
          item.appendChild(name);

          const summary = window.edenDesignStore.summary(row);
          if (summary) {
            const line = document.createElement('p');
            line.className = 'ijd-saved__summary';
            line.textContent = summary;
            item.appendChild(line);
          }

          const actions = document.createElement('p');
          actions.className = 'ijd-saved__actions';

          const href = row.reopen || row.builder || '';
          if (href) {
            const open = document.createElement('a');
            open.className = 'eden-link';
            open.href = href;
            open.textContent = this.dataset.reopenLabel || 'Reopen';
            actions.appendChild(open);
          }

          if (this.dataset.support) {
            const url = new URL(this.dataset.support, window.location.origin);
            url.searchParams.set('design', row.id);
            const ask = document.createElement('a');
            ask.className = 'eden-link';
            ask.href = url.toString();
            ask.textContent = this.dataset.askLabel || 'Contact support';
            actions.appendChild(ask);
          }

          const drop = document.createElement('button');
          drop.type = 'button';
          drop.className = 'ijd-saved__drop';
          drop.textContent = this.dataset.removeLabel || 'Remove';
          drop.addEventListener('click', () => {
            window.edenDesignStore.remove(row.id);
            this.paintList();
          });
          actions.appendChild(drop);

          item.appendChild(actions);
          this.list.appendChild(item);
        });
      }
    }
  );
}
