/*
  Studio options - our own option rows under the 3D viewer, on a phone only.

  The configurator is iJewel's page in a cross-origin frame: we cannot restyle
  a line of it. What we can do is talk to it. The live embed speaks an
  undocumented v2 bridge - see assets/ijewel-design.js for the envelope - and two
  of its methods are all this needs:

    getOptions({axis}) -> [{key, label, state: selected|available|no-file, icon}]
    select({axis, option}) -> {applied, moved, deactivated}

  So every row below the ring is filled from the builder itself. Nothing here
  is typed into the theme editor except the row's name, its question and which
  axis it is: the choices, their labels, their icons and which one is on are
  whatever the configurator says they are at the moment it is asked. A stone
  added or retired in iJewel Drive appears or disappears here with no theme
  change.

  A row opens in place - the list of rows is the page, and the choices unfold
  under the one you tapped, so the ring above never leaves the screen. A row
  may carry a second axis, shown as a plain radio list under the first: that is
  the metal pattern, where the colour is picked as a tile and the carat of gold
  underneath it.

  The frame is built lazily by assets/ijewel-studio.js once the section is near
  the viewport, so the iframe does not exist when this element connects - it is
  waited for. And the viewer does not boot until someone taps its play overlay,
  so `ready` does not fire on a page nobody has touched: until it does, the
  rows are closed and inert under a line asking for that tap.

  A custom element rather than a <script> in the section, so it re-arms every
  time the section re-renders in the theme editor.
*/
if (!customElements.get('studio-options')) {
  customElements.define(
    'studio-options',
    class StudioOptions extends HTMLElement {
      connectedCallback() {
        if (this.armed) return;
        this.armed = true;

        this.origin = this.dataset.origin || 'https://ijewel3d.com';
        this.single = this.dataset.single !== 'false';
        this.seq = 0;
        this.pending = new Map();
        this.rows = Array.from(this.querySelectorAll('.eso-row'));
        this.summary = this.querySelector('.eso-summary__body');
        this.total = this.querySelector('[data-total]');
        this.cta = this.querySelector('[data-cta]');
        this.ctaHref = this.cta ? this.cta.getAttribute('href') || '' : '';

        this.handler = this.receive.bind(this);
        window.addEventListener('message', this.handler);

        this.rows.forEach((row) => {
          const head = row.querySelector('.eso-row__head');
          if (head) head.addEventListener('click', () => this.toggle(row));
        });

        this.findFrame();
      }

      disconnectedCallback() {
        window.removeEventListener('message', this.handler);
        clearInterval(this.hunt);
      }

      /* ------------------------------------------------------------ the frame */

      // ijewel-studio.js only builds the iframe once its section is near the
      // viewport, and in the theme editor it can be rebuilt at any moment, so
      // the frame is looked for rather than assumed.
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
          if (message.error) reject_(slot, message.error);
          else slot.resolve(message.result);
          return;
        }

        if (!message.event) return;
        // The frame and this element may arrive in either order; the first
        // word from the builder settles which frame is the builder's.
        if (!this.frame && event.source) {
          this.frame =
            Array.from(document.querySelectorAll('iframe')).find((f) => f.contentWindow === event.source) ||
            this.frame;
        }

        switch (message.event) {
          case 'ready':
            this.setAttribute('data-live', 'true');
            this.refresh();
            break;
          case 'selection:changed':
            this.refresh();
            break;
          case 'price:changed':
            this.price(message.data);
            break;
          case 'load:started':
            this.setAttribute('data-busy', 'true');
            break;
          case 'load:complete':
            this.removeAttribute('data-busy');
            break;
        }
      }

      /* ---------------------------------------------------------------- rows */

      // Every axis is re-read after any change: choosing an oval can retire the
      // carats that only exist for a round, and the builder is the only thing
      // that knows which. Cheap enough - a handful of postMessage calls.
      refresh() {
        this.rows.forEach((row) => {
          this.load(row, row.dataset.axis, '.eso-choices');
          if (row.dataset.subAxis) this.load(row, row.dataset.subAxis, '.eso-sublist');
        });
        this.call('getState').then((state) => this.state(state)).catch(noop);
        this.call('getPrice').then((price) => this.price(price)).catch(noop);
      }

      load(row, axis, selector) {
        const host = row.querySelector(selector);
        if (!host) return;
        this.call('getOptions', { axis: axis })
          .then((options) => {
            const list = Array.isArray(options) ? options.filter((o) => o && o.state !== 'no-file') : [];
            this.paint(row, host, axis, list);
            if (selector === '.eso-choices') this.mark(row, list);
          })
          .catch(noop);
      }

      // The row's head carries the chosen value and the tick, so the list reads
      // as a summary when every row is closed.
      mark(row, list) {
        const chosen = list.find((o) => o.state === 'selected');
        const value = row.querySelector('.eso-row__value');
        if (value) value.textContent = chosen ? chosen.label : '';
        row.setAttribute('data-chosen', chosen ? 'true' : 'false');
        row.toggleAttribute('data-empty', list.length === 0);
        this.recap();
      }

      paint(row, host, axis, list) {
        const style = host.classList.contains('eso-sublist') ? 'list' : row.dataset.style || 'tiles';
        host.innerHTML = '';
        host.className = host.className.replace(/\s*eso-choices--\S+/g, '');
        if (style !== 'list' || !host.classList.contains('eso-sublist')) {
          host.classList.add('eso-choices--' + style);
        }

        list.forEach((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'eso-pick';
          button.setAttribute('aria-pressed', option.state === 'selected' ? 'true' : 'false');

          // A tile is the material itself: its icon if the builder sends one,
          // otherwise a colour the merchant mapped to the option's key.
          if (style === 'tiles' || style === 'grid') {
            const swatch = document.createElement('span');
            swatch.className = 'eso-pick__swatch';
            const colour = this.colour(option);
            if (option.icon) {
              // iJewel sends a rendered photograph of the material, not a flat
              // colour, so the name cannot sit on top of it and be read. The
              // tile becomes the picture and the name goes underneath it.
              button.classList.add('eso-pick--image');
              const img = document.createElement('img');
              img.src = option.icon;
              img.alt = '';
              img.loading = 'lazy';
              swatch.appendChild(img);
            } else if (colour) {
              swatch.style.background = colour;
            }
            if (colour && !option.icon) button.style.setProperty('--eso-tile-fill', colour);
            button.appendChild(swatch);
          }

          const name = document.createElement('span');
          name.className = 'eso-pick__label';
          name.textContent = option.label || option.key;
          button.appendChild(name);

          const extra = this.delta(option);
          if (extra) {
            const tag = document.createElement('span');
            tag.className = 'eso-pick__delta';
            tag.textContent = extra;
            button.appendChild(tag);
          }

          button.addEventListener('click', () => this.choose(axis, option));
          host.appendChild(button);
        });
      }

      choose(axis, option) {
        this.setAttribute('data-busy', 'true');
        this.call('select', { axis: axis, option: option.key })
          .catch(noop)
          .then(() => {
            this.removeAttribute('data-busy');
            this.refresh();
          });
      }

      // Swatch colours are not in the bridge: the builder sends an icon or
      // nothing. The section maps "option key | colour" lines so a metal can
      // still read as a metal, and an unmapped option simply has no swatch.
      colour(option) {
        if (!this.swatches) {
          this.swatches = {};
          (this.dataset.swatches || '').split('\n').forEach((line) => {
            const parts = line.split('|');
            if (parts.length < 2) return;
            this.swatches[parts[0].trim().toLowerCase()] = parts[1].trim();
          });
        }
        const key = String(option.key || '').toLowerCase();
        const label = String(option.label || '').toLowerCase();
        if (this.swatches[key]) return this.swatches[key];
        if (this.swatches[label]) return this.swatches[label];
        // The builder's own names carry the carat - "14K Yellow Gold" - so a
        // "Yellow Gold" line is matched inside them rather than against them.
        const near = Object.keys(this.swatches).find((k) => k && (label.indexOf(k) > -1 || key.indexOf(k) > -1));
        return near ? this.swatches[near] : '';
      }

      // Undocumented and not in every build, so it is read defensively: a
      // figure if one is there, nothing at all if not.
      delta(option) {
        const raw = [option.priceDelta, option.delta, option.surcharge].find((v) => typeof v === 'number');
        if (typeof raw !== 'number' || raw === 0) return '';
        const minor = typeof option.minorUnits === 'number' ? option.minorUnits : 2;
        const value = raw / Math.pow(10, minor);
        const sign = value > 0 ? '+' : '-';
        try {
          return (
            sign +
            new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: option.currency || this.dataset.currency || 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(Math.abs(value))
          );
        } catch (e) {
          return sign + Math.abs(Math.round(value));
        }
      }

      toggle(row) {
        const open = row.hasAttribute('data-open');
        if (this.single) this.rows.forEach((other) => other.removeAttribute('data-open'));
        row.toggleAttribute('data-open', !open);
        const head = row.querySelector('.eso-row__head');
        if (head) head.setAttribute('aria-expanded', String(!open));
      }

      recap() {
        if (!this.summary) return;
        const lines = this.rows
          .map((row) => {
            const value = row.querySelector('.eso-row__value');
            const label = row.querySelector('.eso-row__label');
            if (!value || !value.textContent || !label) return '';
            return (
              '<div class="eso-spec"><dt>' + label.textContent + '</dt><dd>' + value.textContent + '</dd></div>'
            );
          })
          .filter(Boolean);
        this.summary.innerHTML = lines.length ? '<dl class="eso-specs">' + lines.join('') + '</dl>' : '';
      }

      price(data) {
        if (!this.total || this.dataset.showPrice !== 'true' || !data) return;
        const amount = typeof data.total === 'number' ? data.total : data.amount;
        if (typeof amount !== 'number') return;
        const minor = typeof data.minorUnits === 'number' ? data.minorUnits : 2;
        const currency = data.currency || this.dataset.currency || 'USD';
        try {
          this.total.textContent = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(amount / Math.pow(10, minor));
        } catch (e) {
          this.total.textContent = currency + ' ' + Math.round(amount / Math.pow(10, minor));
        }
      }

      // ?state=... on the enquiry link reopens this exact ring, so whoever
      // picks the enquiry up sees what the shopper was looking at.
      state(state) {
        if (!this.cta || !state || !this.ctaHref) return;
        const join = this.ctaHref.indexOf('?') === -1 ? '?' : '&';
        this.cta.setAttribute('href', this.ctaHref + join + 'state=' + encodeURIComponent(state));
      }
    }
  );
}

function noop() {}

function reject_(slot, error) {
  slot.reject(new Error((error && error.code) || 'bridge error'));
}
