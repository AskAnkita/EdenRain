/*
  Puts the booking diary into the consultation page, and switches it when someone picks a
  different way to meet.

  The scheduling itself is not ours: availability, timezones, double-booking, the calendar
  invitation and the reminder emails all belong to the provider (Cal.com, Calendly, or any
  booking page handed to us as a URL). What is ours is the page around it - the chooser, the
  copy and the photograph - so this file does the smallest possible job: load the provider's
  embed on demand, and point it at the link belonging to the chosen way to meet.

  Three providers, in order of how much they give back:

    cal        the official embed.js. Resizes itself, takes prefill and brand colour.
    calendly   the official widget.js. Same idea, prefill under different names.
    iframe     the link in a plain <iframe>, for a provider with no embed script of its own
               (or a self-hosted Cal instance behind a sign-in).

  Either official script can fail to load - an ad blocker, a content blocker on the customer's
  phone, a bad day at the CDN - so both fall back to the plain iframe, which is the same page
  the embed would have shown and still books an appointment. If even that does not paint, the
  section's own fallback panel is revealed instead, so nobody reaches a dead rectangle.

  The frame is only built once the section is near the viewport: the provider's bundle is heavy
  and the page is often reached by scrolling past the intro.

  What is prefilled: the signed-in customer's name and email, which the section writes onto the
  element, and a note built from the query string - /pages/book-a-consultation?piece=... from a
  product page, so the consultant arrives at the call already knowing what it is about.

  It is a custom element rather than a <script> in the section so it re-arms every time the
  section re-renders in the theme editor.
*/

const CAL_EMBED_SRC = 'https://app.cal.com/embed/embed.js';
const CALENDLY_SCRIPT_SRC = 'https://assets.calendly.com/assets/external/widget.js';
const CALENDLY_STYLE_HREF = 'https://assets.calendly.com/assets/external/widget.css';

// A note is built from whichever of these the page was reached with, so a "book a consultation"
// button on a product page can say what the appointment is about without a form field for it.
const NOTE_PARAMS = ['piece', 'product', 'design', 'notes', 'note', 'ref'];

const loadedScripts = new Map();

/* Loads a script once per page, however many sections or switches ask for it. */
function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const pending = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(src)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener('error', () => reject(new Error(src)), { once: true });
    document.head.appendChild(script);
  });

  loadedScripts.set(src, pending);
  return pending;
}

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/*
  Cal's embed.js expects the queue stub from its own snippet to already exist on window, and
  throws if it does not, so the stub is planted before the script is asked for. This is Cal's
  published snippet, written out rather than minified into one line.
*/
function calStub() {
  if (window.Cal && window.Cal.loaded !== undefined) return window.Cal;

  const push = (api, args) => api.q.push(args);

  window.Cal =
    window.Cal ||
    function () {
      const cal = window.Cal;
      const args = arguments;

      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        cal.loaded = true;
        loadScript(CAL_EMBED_SRC).catch(() => {
          // The caller watches for this through its own timeout and falls back to an iframe.
        });
      }

      if (args[0] === 'init') {
        const api = function () {
          push(api, arguments);
        };
        const namespace = args[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          push(cal.ns[namespace], args);
          push(cal, ['initNamespace', namespace]);
        } else {
          push(cal, args);
        }
        return;
      }

      push(cal, args);
    };

  return window.Cal;
}

/*
  Turns whatever was pasted into the setting into the two things an embed needs: the origin it
  is served from and the link within it. "cal.com/eden-raine/showroom",
  "https://cal.com/eden-raine/showroom?month=2026-11" and "eden-raine/showroom" all land on the
  same place, because a merchant copying from the provider's own UI gets a full URL, not a slug.
*/
function splitLink(value, fallbackOrigin) {
  const raw = (value || '').trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch (error) {
    // Not a URL at all - treat it as a bare slug on the default origin.
    return { origin: fallbackOrigin, path: raw.replace(/^\/+/, ''), search: '' };
  }

  // A bare slug ("eden-raine/showroom") parses as a hostname, which is not what was meant.
  const looksLikeHost = /^https?:\/\//i.test(raw) || url.hostname.includes('.');
  if (!looksLikeHost) {
    return { origin: fallbackOrigin, path: raw.replace(/^\/+/, ''), search: '' };
  }

  return {
    origin: url.origin,
    path: url.pathname.replace(/^\/+/, '').replace(/\/+$/, ''),
    search: url.search.replace(/^\?/, ''),
  };
}

if (!customElements.get('consultation-booking')) {
  customElements.define(
    'consultation-booking',
    class ConsultationBooking extends HTMLElement {
      connectedCallback() {
        this.stage = this.querySelector('[data-booking-stage]');
        this.frame = this.querySelector('[data-booking-frame]');
        this.choices = Array.from(this.querySelectorAll('[data-booking-choice]'));
        this.fallback = this.querySelector('[data-booking-fallback]');

        if (!this.stage || !this.frame) return;

        this.provider = this.dataset.provider || 'cal';
        this.defaultOrigin = this.dataset.origin || (this.provider === 'calendly' ? 'https://calendly.com' : 'https://cal.com');
        this.prefill = this.readPrefill();
        this.sequence = 0;

        this.choices.forEach((choice) => {
          choice.addEventListener('click', () => this.choose(choice));
        });

        this.active = this.choices.find((choice) => choice.getAttribute('aria-pressed') === 'true') || this.choices[0];
        this.link = this.active?.dataset.bookingLink || this.dataset.link || '';

        // Nothing to embed: the links have not been pasted in yet, so the fallback panel is
        // the whole stage and the provider is never asked for.
        if (!this.link) {
          this.showFallback();
          return;
        }

        if (this.dataset.lazy === 'false' || !('IntersectionObserver' in window)) {
          this.build();
          return;
        }

        this.observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            this.observer.disconnect();
            this.build();
          },
          { rootMargin: '600px 0px' }
        );
        this.observer.observe(this);
      }

      disconnectedCallback() {
        this.observer?.disconnect();
        clearTimeout(this.timer);
      }

      readPrefill() {
        const params = new URLSearchParams(window.location.search);
        const notes = NOTE_PARAMS.map((key) => params.get(key))
          .filter(Boolean)
          .join(' - ');

        return {
          name: this.dataset.name || params.get('name') || '',
          email: this.dataset.email || params.get('email') || '',
          notes: notes || this.dataset.notes || '',
        };
      }

      /* A different way to meet is a different link in the same stage. */
      choose(choice) {
        const link = choice.dataset.bookingLink || '';
        this.choices.forEach((other) => other.setAttribute('aria-pressed', String(other === choice)));
        this.active = choice;

        if (!link || link === this.link) {
          this.link = link || this.link;
          if (!link) this.showFallback();
          return;
        }

        this.link = link;
        this.frame.replaceChildren();
        this.stage.removeAttribute('data-ready');
        this.stage.classList.remove('ebk-stage--fallback');
        if (this.fallback) this.fallback.hidden = true;
        this.built = false;
        this.build();
      }

      build() {
        if (this.built || !this.link) return;
        this.built = true;
        this.sequence += 1;

        const parts = splitLink(this.link, this.defaultOrigin);
        if (!parts || !parts.path) {
          this.showFallback();
          return;
        }

        if (this.provider === 'iframe') {
          this.buildIframe(parts);
          return;
        }

        if (this.provider === 'calendly') {
          this.buildCalendly(parts);
          return;
        }

        this.buildCal(parts);
      }

      buildCal(parts) {
        const namespace = `ebk-${this.dataset.sectionId || 'booking'}-${this.sequence}`;

        try {
          const Cal = calStub();
          Cal('init', namespace, { origin: parts.origin });

          Cal.ns[namespace]('inline', {
            elementOrSelector: this.frame,
            calLink: parts.path,
            layout: this.dataset.layout || 'month_view',
            config: {
              layout: this.dataset.layout || 'month_view',
              theme: this.dataset.theme || 'light',
              ...(this.prefill.name ? { name: this.prefill.name } : {}),
              ...(this.prefill.email ? { email: this.prefill.email } : {}),
              ...(this.prefill.notes ? { notes: this.prefill.notes } : {}),
            },
          });

          Cal.ns[namespace]('ui', {
            theme: this.dataset.theme || 'light',
            hideEventTypeDetails: this.dataset.hideDetails === 'true',
            styles: { branding: { brandColor: this.dataset.brandColor || '#171714' } },
          });

          Cal.ns[namespace]('on', {
            action: 'linkReady',
            callback: () => this.ready(),
          });
        } catch (error) {
          this.buildIframe(parts);
          return;
        }

        this.watch(parts);
      }

      buildCalendly(parts) {
        loadStylesheet(CALENDLY_STYLE_HREF);

        const host = document.createElement('div');
        host.className = 'calendly-inline-widget';
        this.frame.appendChild(host);

        loadScript(CALENDLY_SCRIPT_SRC)
          .then(() => {
            if (!window.Calendly) throw new Error('Calendly missing');
            window.Calendly.initInlineWidget({
              url: `${parts.origin}/${parts.path}${parts.search ? `?${parts.search}` : ''}`,
              parentElement: host,
              prefill: {
                name: this.prefill.name,
                email: this.prefill.email,
                customAnswers: this.prefill.notes ? { a1: this.prefill.notes } : {},
              },
            });
          })
          .catch(() => {
            host.remove();
            this.buildIframe(parts);
          });

        this.watch(parts);
      }

      /*
        The provider's booking page in a frame of our own. No auto-resize, so the stage's
        minimum height from the stylesheet is what holds the shape - which is why that height
        is a setting rather than a guess.
      */
      buildIframe(parts) {
        const params = new URLSearchParams(parts.search);

        if (this.provider === 'calendly') {
          params.set('embed_domain', window.location.hostname);
          params.set('embed_type', 'Inline');
          params.set('hide_gdpr_banner', '1');
          if (this.prefill.name) params.set('name', this.prefill.name);
          if (this.prefill.email) params.set('email', this.prefill.email);
          if (this.prefill.notes) params.set('a1', this.prefill.notes);
        } else if (this.provider === 'cal') {
          params.set('embed', 'true');
          params.set('layout', this.dataset.layout || 'month_view');
          params.set('theme', this.dataset.theme || 'light');
          if (this.prefill.name) params.set('name', this.prefill.name);
          if (this.prefill.email) params.set('email', this.prefill.email);
          if (this.prefill.notes) params.set('notes', this.prefill.notes);
        }

        const query = params.toString();
        const iframe = document.createElement('iframe');
        iframe.src = `${parts.origin}/${parts.path}${query ? `?${query}` : ''}`;
        iframe.title = this.dataset.frameTitle || 'Book a consultation';
        iframe.loading = 'lazy';
        iframe.setAttribute('allow', 'camera; microphone; fullscreen; payment');
        iframe.addEventListener('load', () => this.ready());
        this.frame.replaceChildren(iframe);

        this.watch(parts, true);
      }

      /*
        A provider script that loads but never paints would otherwise leave the spinner turning
        for good. If nothing has appeared in the stage by the deadline, the embed is given up on
        for the plain iframe, and the iframe in turn gives up for the fallback panel.
      */
      watch(parts, isIframe = false) {
        clearTimeout(this.timer);
        const deadline = Number(this.dataset.timeout || 12000);

        this.timer = setTimeout(() => {
          if (this.stage.dataset.ready === 'true') return;
          if (isIframe) {
            this.showFallback();
            return;
          }
          this.frame.replaceChildren();
          this.buildIframe(parts);
        }, deadline);
      }

      ready() {
        clearTimeout(this.timer);
        this.stage.dataset.ready = 'true';
      }

      showFallback() {
        clearTimeout(this.timer);
        this.stage.dataset.ready = 'true';
        this.stage.classList.add('ebk-stage--fallback');
        if (this.fallback) this.fallback.hidden = false;
      }
    }
  );
}
