/*
  Studio options - our own option rows under the 3D viewer, on a phone only.

  The configurator is iJewel's page in a cross-origin frame: we cannot restyle
  a line of it. What we can do is talk to it. The live embed speaks an
  undocumented v2 bridge - see assets/ijewel-design.js for the envelope - and two
  of its methods are all this needs:

    getOptions({axis}) -> [{key, label, state, icon}]
    select({axis, option}) -> {applied, moved, deactivated}

  An option's state is one of four, and only one of them means "do not print
  it". `selected` and `available` can be picked. `blocked` is an option this
  design rules out - an oval has no asscher head - and `no-file` is one whose
  3D model has not been uploaded to iJewel Drive yet. Both of those are shown
  dimmed and unpickable, the way the builder's own panel shows them: a shape
  that is simply absent from our list reads as a shape the shop does not make,
  which is a different and wrong message. Only `hidden` is dropped, because
  that is the builder being told the option is not on offer at all.

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
        this.showUnavailable = this.dataset.showUnavailable !== 'false';
        this.seq = 0;
        this.pending = new Map();
        // The builder opens on a finished default ring, so every axis has a
        // selection from the first frame. A tick means the visitor chose it:
        // rows they have picked in, or every row when ?state= reopened a ring
        // they designed before.
        this.touched = new Set();
        this.restored = /[?&]state=/.test(window.location.search);
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

        if (this.classList.contains('er-studio-options--steps')) this.setupSteps();

        this.findFrame();
      }

      disconnectedCallback() {
        window.removeEventListener('message', this.handler);
        clearInterval(this.hunt);
        // Moved up above the viewer it is no longer ours to lose with the
        // section, so a re-render in the theme editor would leave it behind.
        if (this.stepNav && !this.contains(this.stepNav)) this.stepNav.remove();
      }

      /* --------------------------------------------------------------- steps */

      // On a phone the rows become steps: one row on show at a time, Back and
      // Next under it, and a numbered strip that jumps straight to any row in
      // either direction. Rows are the same rows, with the same tiles - a step
      // is only which of them is showing. Wider screens keep the list as it was.
      setupSteps() {
        this.stepped = true;
        this.phone = window.matchMedia('(max-width: 749px)');
        this.stepNav = this.querySelector('[data-steps]');
        this.stepList = this.stepNav ? this.stepNav.querySelector('.eso-steps__list') : null;

        if (this.stepNav && this.stepNav.dataset.place === 'viewer') {
          const studio = document.querySelector('ijewel-studio');
          const section = studio ? studio.closest('.shopify-section') || studio : null;
          if (section && section.parentNode) section.parentNode.insertBefore(this.stepNav, section);
        }

        const back = this.querySelector('[data-step-back]');
        const next = this.querySelector('[data-step-next]');
        if (back) back.addEventListener('click', () => this.go(this.stepIndex() - 1, true));
        if (next) next.addEventListener('click', () => this.go(this.stepIndex() + 1, true));

        this.go(0, false);
      }

      // Rows the builder has nothing to offer for are hidden, so they are not
      // steps either; the numbering closes up around them.
      steps() {
        return this.rows.filter((row) => !row.hasAttribute('data-empty'));
      }

      stepIndex() {
        return Math.max(0, this.steps().indexOf(this.current));
      }

      go(index, user) {
        if (!this.stepped) return;
        const steps = this.steps();
        if (!steps.length) return;
        const i = Math.min(Math.max(index, 0), steps.length - 1);
        this.current = steps[i];
        this.rows.forEach((row) => row.toggleAttribute('data-step-active', row === this.current));
        this.toggleAttribute('data-step-first', i === 0);
        this.toggleAttribute('data-step-last', i === steps.length - 1);
        this.drawSteps();
        const count = this.querySelector('[data-step-count]');
        if (count) count.textContent = i + 1 + ' / ' + steps.length;

        // The ring stays where it is; only when the shopper has scrolled past
        // the top of the choices is the page brought back to the new step.
        if (user && this.phone.matches) {
          const top = this.getBoundingClientRect().top;
          if (top < 0) window.scrollBy({ top: top - 8, behavior: 'smooth' });
        }
      }

      drawSteps() {
        if (!this.stepList) return;
        const steps = this.steps();
        // The current row may have just emptied out under a new choice.
        if (this.current && steps.indexOf(this.current) === -1) {
          this.go(Math.min(this.rows.indexOf(this.current), steps.length - 1), false);
          return;
        }
        this.stepList.innerHTML = '';
        steps.forEach((row, i) => {
          const item = document.createElement('li');
          item.className = 'eso-steps__item';
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'eso-steps__dot';
          dot.textContent = String(i + 1);
          const label = row.querySelector('.eso-row__label');
          dot.setAttribute('aria-label', (i + 1) + '. ' + (label ? label.textContent.trim() : ''));
          if (row === this.current) dot.setAttribute('aria-current', 'step');
          if (row.getAttribute('data-chosen') === 'true') dot.setAttribute('data-done', '');
          dot.addEventListener('click', () => this.go(i, true));
          item.appendChild(dot);
          this.stepList.appendChild(item);
        });
        const count = this.querySelector('[data-step-count]');
        const at = steps.indexOf(this.current);
        if (count && at > -1) count.textContent = at + 1 + ' / ' + steps.length;
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
        // A carat has no picture of its own, so the tile shows the chosen
        // shape's icon drawn at that weight - the same stone, bigger or smaller.
        const shape =
          axis === 'carat'
            ? this.call('getOptions', { axis: 'shape' })
                .then((shapes) => {
                  const on = Array.isArray(shapes) ? shapes.find((o) => o && o.state === 'selected') : null;
                  return on && on.icon ? on.icon : '';
                })
                .catch(() => '')
            : Promise.resolve('');
        Promise.all([this.call('getOptions', { axis: axis }), shape])
          .then(([options, shapeIcon]) => {
            const all = Array.isArray(options) ? options.filter(Boolean) : [];
            const list = all.filter(
              (option) =>
                option.state !== 'hidden' &&
                !this.dropped(option) &&
                (this.showUnavailable || !unpickable(option))
            );
            if (shapeIcon) this.weigh(list, shapeIcon);
            this.paint(row, host, axis, list);
            if (selector === '.eso-choices') this.mark(row, list);
          })
          .catch(noop);
      }

      // A stone's width grows with the cube root of its weight, so 2 ct is
      // about 1.26x the width of 1 ct, not twice it. The heaviest carat on
      // offer fills the tile and the rest scale down from it.
      weigh(list, icon) {
        const weight = (option) => {
          const m = String(option.label || option.key || '').match(/\d+(?:\.\d+)?/);
          return m ? parseFloat(m[0]) : 0;
        };
        const top = Math.max(0, ...list.map(weight));
        if (!top) return;
        list.forEach((option) => {
          const w = weight(option);
          if (!w) return;
          option.stone = icon;
          option.scale = Math.max(0.3, Math.cbrt(w / top));
        });
      }

      // The row's head carries the chosen value and the tick, so the list reads
      // as a summary when every row is closed.
      mark(row, list) {
        const chosen = list.find((o) => o.state === 'selected');
        const value = row.querySelector('.eso-row__value');
        if (value) value.textContent = chosen ? chosen.label : '';
        const mine = this.restored || this.touched.has(row);
        row.setAttribute('data-chosen', chosen && mine ? 'true' : 'false');
        row.toggleAttribute('data-empty', list.length === 0);
        this.recap();
        if (this.stepped) this.drawSteps();
      }

      paint(row, host, axis, list) {
        // A second axis offering the same materials as the first (band metal,
        // then setting metal) is drawn the same way, so the two read as a pair.
        const rowStyle = row.dataset.style || 'tiles';
        const style = host.classList.contains('eso-sublist') && rowStyle !== 'tiles' ? 'list' : rowStyle;
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

          // Dimmed and inert, not missing. A disabled button is skipped by a
          // screen reader's button list, so the state is also said in words on
          // the label itself.
          const off = unpickable(option);
          if (off) {
            button.disabled = true;
            button.setAttribute('data-unavailable', '');
            const note = this.dataset.unavailableNote || '';
            if (note) {
              button.title = note;
              button.setAttribute('aria-label', (option.label || option.key) + ' - ' + note);
            }
          }

          // A tile is the material itself. The merchant's mapped colour wins over
          // the builder's icon: iJewel's metal icons are mirror balls reflecting
          // a studio, which read as photographs of a room, not as gold.
          // A choice with no material to show (a carat weight) is its name in a
          // box, not an empty swatch over its name.
          const plain = style === 'tiles' && !option.stone && !option.icon && !this.colour(option);
          if (plain) button.classList.add('eso-pick--text');
          if ((style === 'tiles' && !plain) || style === 'grid') {
            const swatch = document.createElement('span');
            swatch.className = 'eso-pick__swatch';
            const colour = style === 'tiles' ? this.colour(option) : '';
            if (option.stone) {
              button.classList.add('eso-pick--stone');
              const img = document.createElement('img');
              img.src = option.stone;
              img.alt = '';
              img.style.setProperty('--eso-stone-scale', option.scale);
              swatch.appendChild(img);
            } else if (option.icon && !colour) {
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

          if (!off) button.addEventListener('click', () => this.choose(axis, option));
          host.appendChild(button);
        });
      }

      // Options the shop does not offer for now, named in the section settings.
      // Left out of this list only - the builder itself still has them.
      dropped(option) {
        if (!this.hiddenNames) {
          this.hiddenNames = (this.dataset.hide || '')
            .split('\n')
            .map((line) => line.trim().toLowerCase())
            .filter(Boolean);
        }
        const label = String(option.label || '').toLowerCase();
        const key = String(option.key || '').toLowerCase();
        return this.hiddenNames.some((name) => name === label || name === key);
      }

      choose(axis, option) {
        const row = this.rows.find((r) => r.dataset.axis === axis || r.dataset.subAxis === axis);
        if (row) this.touched.add(row);
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
        // As a step the row is always open; its name is a heading, not a switch.
        if (this.stepped && this.phone.matches) return;
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

// The two states the builder answers with for an option it cannot put on the
// ring as things stand: `blocked` is ruled out by the rest of the design,
// `no-file` has no 3D model uploaded for it yet. Everything else is pickable.
function unpickable(option) {
  return option.state === 'blocked' || option.state === 'no-file';
}

function reject_(slot, error) {
  slot.reject(new Error((error && error.code) || 'bridge error'));
}
