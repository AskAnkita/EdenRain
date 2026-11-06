/*
  Design support - the page that turns a saved design into an enquiry.

  Its job is to find the design, show it, and get it into the hidden fields of
  the contact form so it reaches the shop by email. Nothing here talks to the
  builder: the record was written in the studio by assets/ijewel-design.js and
  everything needed is already on it.

  WHICH DESIGN. In this order:

    1. ?design=<reference> against the records in this browser. This is how the
       studio's "Contact support" button arrives, and how the saved list links.
    2. the most recent saved design, when the URL names none. Somebody who
       walked to this page by themselves almost always means the last one.
    3. the URL alone - ?summary= and ?state= - which is all a link opened on
       another device, or in private browsing, has to go on. Thin, but enough
       to show the choices, rebuild the ring and send it to us.
    4. nothing, and the page says so and stays a working enquiry form.

  THE 3D PREVIEW. The saved state key is fed back to the builder as ?state= and
  it draws the identical ring. We hold the key, they hold the geometry - which
  is what "the design is stored as a 3D model" amounts to with a configurator
  in a cross-origin frame; see assets/eden-design-store.js. The frame is built
  here rather than by ijewel-studio.js because there is nothing to lazy-load,
  no splash to cover and no bridge to wait for: it is one small frame that
  exists only once a design has been found.
*/
if (!customElements.get('design-support')) {
  customElements.define(
    'design-support',
    class DesignSupport extends HTMLElement {
      connectedCallback() {
        if (this.armed) return;
        this.armed = true;

        this.panel = this.querySelector('[data-support-design]');
        this.empty = this.querySelector('[data-support-empty]');
        this.list = this.querySelector('[data-support-list]');

        const found = this.resolve();
        this.show(found);
        this.others(found);
      }

      /* ---------------------------------------------------------- the design */

      params() {
        try {
          return new URL(window.location.href).searchParams;
        } catch (error) {
          return new URLSearchParams();
        }
      }

      // A design carried only in the URL. The summary was written as
      // "Shape: Oval, Metal: 18k white gold", so it is read back the same way -
      // and a value with a comma in it is the one thing this gets wrong, which
      // is why it is the last resort rather than the first.
      fromUrl(params) {
        const summary = params.get('summary') || '';
        const state = params.get('state') || '';
        if (!summary && !state) return null;

        const options = summary
          .split(', ')
          .map((pair) => {
            const at = pair.indexOf(': ');
            if (at === -1) return null;
            return { name: pair.slice(0, at), value: pair.slice(at + 2) };
          })
          .filter(Boolean);

        return {
          id: params.get('design') || '',
          state: state,
          options: options,
          price: '',
          reopen: '',
          builder: '',
          partial: true
        };
      }

      resolve() {
        const params = this.params();
        const store = window.edenDesignStore;
        const wanted = params.get('design');

        if (store && wanted) {
          const row = store.find(wanted);
          if (row) return row;
        }

        if (store && !wanted) {
          const rows = store.list();
          if (rows.length) return rows[0];
        }

        // Named a design this browser does not have - a forwarded link, or a
        // store that was cleared since. Whatever the URL carries is better than
        // nothing, and it still names the reference the shopper was given.
        return this.fromUrl(params);
      }

      /* ------------------------------------------------------------- the view */

      // The reopen link is rebuilt from the studio page in the section settings
      // rather than taken off the record: the record was written with whatever
      // path the studio had at the time, and a page that has since been renamed
      // would leave a stale link on a design saved months ago.
      reopen(row) {
        if (!row || !row.state) return '';
        const studio = this.dataset.studio;
        if (studio) {
          try {
            const url = new URL(studio, window.location.origin);
            url.searchParams.set('state', row.state);
            return url.toString();
          } catch (error) {
            /* fall through to whatever the record kept */
          }
        }
        return row.reopen || row.builder || '';
      }

      builder(row) {
        if (!row || !row.state) return row && row.builder ? row.builder : '';
        const embed = this.dataset.embed;
        if (!embed) return row.builder || '';
        return embed + (embed.indexOf('?') === -1 ? '?' : '&') + 'state=' + encodeURIComponent(row.state);
      }

      show(row) {
        this.fill(row);

        if (!row) {
          if (this.empty) {
            this.empty.textContent = this.dataset.emptyText || '';
            this.empty.hidden = !this.empty.textContent;
          }
          return;
        }

        if (this.empty) this.empty.hidden = true;
        if (!this.panel) return;

        this.panel.hidden = false;

        const reference = this.panel.querySelector('[data-support-reference]');
        if (reference) {
          reference.textContent = row.id || '—';
        }

        const specs = this.panel.querySelector('[data-support-specs]');
        if (specs) {
          specs.innerHTML = '';
          (row.options || []).forEach((option) => {
            const term = document.createElement('dt');
            term.textContent = option.name;
            const value = document.createElement('dd');
            value.textContent = option.value;
            specs.append(term, value);
          });
          specs.hidden = !(row.options || []).length;
        }

        const link = this.panel.querySelector('[data-support-reopen]');
        if (link) {
          const href = this.reopen(row);
          link.hidden = !href;
          if (href) link.setAttribute('href', href);
        }

        this.draw(row);
      }

      // The ring, rebuilt. Only ever with a state key: the builder opened with
      // no key draws its own default ring, which would be somebody else's
      // design sitting under the words "your design".
      draw(row) {
        if (this.dataset.preview !== 'true') return;

        const host = this.querySelector('[data-support-preview]');
        if (!host) return;

        const src = this.builder(row);
        if (!src) {
          host.hidden = true;
          return;
        }

        host.hidden = false;

        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = this.dataset.previewTitle || 'Your saved design in 3D';
        frame.loading = 'lazy';
        // The same permissions the studio frame is given: autoplay to spin the
        // scene, xr-spatial-tracking for view-in-room, camera for try-on.
        frame.setAttribute('allow', 'autoplay; camera; fullscreen; xr-spatial-tracking; web-share');
        frame.setAttribute('allowfullscreen', '');
        frame.addEventListener('load', () => host.setAttribute('data-ready', 'true'));
        host.appendChild(frame);
      }

      /* ------------------------------------------------------- the hidden fields */

      // What actually reaches the shop. Every field is written even when it is
      // empty, so a swap to another design can never leave the previous one's
      // reference attached to this one's choices.
      fill(row) {
        const store = window.edenDesignStore;
        const summary = row && store ? store.summary(row) : '';
        const price = row && row.price ? row.price : '';
        const note = this.dataset.priceNote;

        const values = {
          id: row && row.id ? row.id : '',
          summary: summary,
          reopen: this.reopen(row),
          builder: this.builder(row),
          state: row && row.state ? row.state : '',
          price: price && this.dataset.sendPrice === 'true' ? (note ? price + ' (' + note + ')' : price) : ''
        };

        this.querySelectorAll('[data-support-field]').forEach((field) => {
          const key = field.getAttribute('data-support-field');
          field.value = values[key] === undefined ? '' : values[key];
        });
      }

      /* ------------------------------------------------- the other saved designs */

      others(current) {
        if (!this.list || !window.edenDesignStore) return;

        const rows = window.edenDesignStore.list().filter((row) => !current || row.id !== current.id);
        const wrap = this.list.closest('[data-support-other]');
        if (wrap) wrap.hidden = rows.length === 0;
        this.list.innerHTML = '';
        if (!rows.length) return;

        rows.forEach((row) => {
          const item = document.createElement('li');
          item.className = 'dsp-other__item';

          const name = document.createElement('p');
          name.className = 'dsp-other__name';
          name.textContent = row.id;
          item.appendChild(name);

          const summary = window.edenDesignStore.summary(row);
          if (summary) {
            const line = document.createElement('p');
            line.className = 'dsp-other__summary';
            line.textContent = summary;
            item.appendChild(line);
          }

          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'eden-link dsp-other__pick';
          pick.textContent = this.dataset.switchLabel || 'Ask about this one';
          pick.addEventListener('click', () => this.swap(row));
          item.appendChild(pick);

          this.list.appendChild(item);
        });
      }

      // Swapping which design the form is about, without a page load. The URL
      // is corrected as well, so a refresh - or a share - keeps the design the
      // form is actually carrying.
      swap(row) {
        const preview = this.querySelector('[data-support-preview]');
        if (preview) {
          preview.innerHTML = '';
          preview.removeAttribute('data-ready');
        }

        try {
          const url = new URL(window.location.href);
          url.searchParams.set('design', row.id);
          url.searchParams.delete('summary');
          url.searchParams.delete('state');
          window.history.replaceState({}, '', url.toString());
        } catch (error) {
          /* an address we cannot rewrite - the form is still correct */
        }

        this.show(row);
        this.others(row);
        this.panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  );
}
