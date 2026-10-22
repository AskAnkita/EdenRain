/*
  The booking dialog for the consultation page.

  Every "Book an appointment" button on the page - the one in the hero, and one per kind of
  appointment - opens the same dialog, and what goes inside it depends on what the shop has set
  up:

    an app block     a booking app installed in the shop, added to the section in the theme
                     editor. It is already rendered inside the dialog when the page is served,
                     so there is nothing to load and nothing to fall back to - and it outranks
                     both of the paths below, which are not consulted at all.

    a booking link   the provider's own calendar (Cal.com, Calendly, or any booking page given
                     as a URL). It owns availability, timezones, the confirmation email and the
                     Google Meet or Zoom link, which is set on the event type in the provider's
                     own admin, not here.

    no link yet      our own picker: a month calendar and a row of times, over the shop's
                     contact form. It cannot know what is free, so it asks rather than books -
                     the request arrives by email and someone confirms it.

  The second one is not a stand-in for the first. A shop with a diary wants instant confirmation;
  a shop without one still needs the page to work today, and a request with a date and a time on
  it is a far better message than "please get in touch".

  Either official embed script can fail - an ad blocker, a content blocker on a phone, a bad day
  at the CDN - so both fall back to a plain iframe of the same booking page, and that falls back
  to our own picker. Nobody reaches a dead rectangle.

  The dialog is an ordinary overlay, not a native <dialog> opened with showModal(). A modal
  dialog lives in the browser's top layer, which makes every other element inert - including
  the hCaptcha challenge Shopify's bot protection appends to <body> when it wants a visitor
  verified. Inside showModal() that challenge cannot be clicked at any z-index, so the request
  form could never be sent. The cost is that Esc, the backdrop, the scroll lock and focus are
  ours to handle, which is what openDialog and closeDialog below do.

  It is a custom element rather than a <script> in the section so it re-arms every time the
  section re-renders in the theme editor.
*/

const CAL_EMBED_SRC = 'https://app.cal.com/embed/embed.js';
const CALENDLY_SCRIPT_SRC = 'https://assets.calendly.com/assets/external/widget.js';
const CALENDLY_STYLE_HREF = 'https://assets.calendly.com/assets/external/widget.css';

// A note is built from whichever of these the page was reached with, so a "book an appointment"
// button on a product page can say what the appointment is about without a field for it.
const NOTE_PARAMS = ['piece', 'product', 'design', 'notes', 'note', 'ref'];

const loadedScripts = new Map();

function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
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
  Cal's embed.js expects the queue stub from its own snippet to already exist on window and
  throws if it does not, so the stub is planted before the script is asked for. This is Cal's
  published snippet, written out rather than minified onto one line.
*/
function calStub() {
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
          // The caller watches for this with its own timeout and falls back to an iframe.
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
  Turns whatever was pasted into the setting into the two things an embed needs: the origin it is
  served from and the link within it. "cal.com/eden-raine/showroom",
  "https://cal.com/eden-raine/showroom?month=2026-11" and "eden-raine/showroom" all land in the
  same place, because a merchant copying from the provider's own UI gets a full URL, not a slug.
*/
function splitLink(value, fallbackOrigin) {
  const raw = (value || '').trim();
  if (!raw) return null;

  const hasScheme = /^https?:\/\//i.test(raw);
  let url;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch (error) {
    return { origin: fallbackOrigin, path: raw.replace(/^\/+/, ''), search: '' };
  }

  // A bare slug ("eden-raine/showroom") parses as a hostname, which is not what was meant.
  if (!hasScheme && !url.hostname.includes('.')) {
    return { origin: fallbackOrigin, path: raw.replace(/^\/+/, ''), search: '' };
  }

  return {
    origin: url.origin,
    path: url.pathname.replace(/^\/+/, '').replace(/\/+$/, ''),
    search: url.search.replace(/^\?/, ''),
  };
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

if (!customElements.get('consultation-booking')) {
  customElements.define(
    'consultation-booking',
    class ConsultationBooking extends HTMLElement {
      connectedCallback() {
        this.dialog = this.querySelector('[data-booking-dialog]');
        this.stage = this.querySelector('[data-booking-stage]');
        this.appStage = this.querySelector('[data-booking-app]');
        this.frame = this.querySelector('[data-booking-frame]');
        this.request = this.querySelector('[data-booking-request]');
        this.openers = Array.from(this.querySelectorAll('[data-booking-open]'));
        this.switches = Array.from(this.querySelectorAll('[data-booking-switch]'));

        if (!this.dialog) return;

        this.provider = this.dataset.provider || 'cal';
        this.defaultOrigin =
          this.dataset.origin || (this.provider === 'calendly' ? 'https://calendly.com' : 'https://cal.com');
        this.prefill = this.readPrefill();
        this.sequence = 0;
        this.builtLink = null;

        this.titleEl = this.querySelector('[data-booking-title]');
        this.eyebrowEl = this.querySelector('[data-booking-eyebrow]');
        this.typeField = this.querySelector('[data-booking-field-type]');

        this.openers.forEach((opener) => {
          opener.addEventListener('click', (event) => {
            event.preventDefault();
            this.open(opener);
          });
        });

        this.switches.forEach((button) => {
          button.addEventListener('click', () => this.open(button, { keepOpen: true }));
        });

        this.querySelectorAll('[data-booking-close]').forEach((button) => {
          button.addEventListener('click', () => this.closeDialog());
        });

        // A click on the backdrop lands on the overlay element itself, never on its contents.
        this.dialog.addEventListener('click', (event) => {
          if (event.target === this.dialog) this.closeDialog();
        });

        this.onKeydown = (event) => {
          if (event.key === 'Escape') this.closeDialog();
          if (event.key === 'Tab') this.keepFocusInside(event);
        };

        this.setupRequest();

        /*
          What the server made of the last request. Shopify answers a contact form with a new
          page, so its answer is markup inside the form rather than something this script was
          handed: a success note, or the reason it was refused. Both are read here, and the
          query string is only one way of three to learn that something was sent - the way back
          from /contact is Shopify's to choose, and behind a password gate or a redirect rule it
          need not carry the flag.
        */
        const flagged = new URLSearchParams(window.location.search).get('contact_posted') === 'true';
        const serverSaid = this.querySelector('[data-booking-posted]');
        const serverErrors = this.querySelector('[data-booking-errors]');

        if (serverSaid || flagged || this.dataset.posted === 'true') {
          // Coming back from a posted contact form, the dialog reopens on the thank-you message
          // rather than leaving the visitor looking at the page wondering whether it sent.
          this.clearStash();
          this.reopenOnRequest();
          // The slow path has come back: the request did go, so show the thank-you in the
          // place the form was rather than the form again under it.
          this.requestSent();
        } else if (serverErrors) {
          /*
            And the other answer. A malformed address, a failed bot check, a shop having a bad
            morning: Shopify sends the visitor back here with the reason rendered inside the
            form, and the form is inside a dialog that is shut. Without this the page simply
            reloads and the Send appears to have done nothing at all. So the dialog reopens, the
            reason is said out loud where the dialog always speaks, and the day and time are put
            back - a refused request is something to correct, not something to make twice.
          */
          this.reopenOnRequest();
          this.restoreStash();
          const reason = serverErrors.textContent.trim();
          // Said once. The copy in the form would be a second voice saying the same thing, and
          // it is about to be hidden behind the thank-you's place anyway.
          serverErrors.remove();
          this.setStatus(reason || this.statusEl?.dataset.error, 'error');
        }
      }

      disconnectedCallback() {
        clearTimeout(this.timer);
        document.removeEventListener('keydown', this.onKeydown);
        if (this.isOpen) document.body.style.overflow = this.scrollWas || '';
        // A re-render in the theme editor replaces the section but not the overlay we moved
        // out of it, which would otherwise be left behind on every edit.
        this.portalHost?.remove();
      }

      readPrefill() {
        const params = new URLSearchParams(window.location.search);
        const notes = NOTE_PARAMS.map((key) => params.get(key))
          .filter(Boolean)
          .join(' - ');

        return {
          name: this.dataset.name || '',
          email: this.dataset.email || '',
          notes: notes || '',
        };
      }

      /* ------------------------------------------------------------ opening */

      open(trigger, { keepOpen = false, silent = false } = {}) {
        // A card on the page and a button in the dialog's own row stand for the same
        // appointment, so opening from either marks the same one as chosen. The hero button
        // names no kind at all, and stands for the first one offered.
        if (trigger && this.switches.length && !this.switches.includes(trigger)) {
          const label = trigger.dataset.bookingLabel;
          trigger = this.switches.find((button) => button.dataset.bookingLabel === label) || (label ? trigger : this.switches[0]);
        }

        const link = trigger?.dataset.bookingLink || this.dataset.link || '';
        const label = trigger?.dataset.bookingLabel || '';
        const meta = trigger?.dataset.bookingMeta || '';

        if (label && this.titleEl) this.titleEl.textContent = label;
        if (this.eyebrowEl) this.eyebrowEl.textContent = meta || this.eyebrowEl.dataset.default || '';
        if (this.typeField && label) this.typeField.value = meta ? `${label} (${meta})` : label;

        this.switches.forEach((button) => {
          button.setAttribute('aria-pressed', String(button === trigger));
        });

        if (!silent) this.show(link);
        else this.show(link, true);

        if (!keepOpen) this.openDialog();
      }

      /*
        What a native modal would have done for us: hold the page still behind the overlay,
        put focus where the visitor is now, close on Esc, and give focus back on the way out.
      */
      openDialog() {
        if (this.isOpen) return;
        this.isOpen = true;

        /*
          The overlay is moved to <body> the first time it opens. Where the section renders it,
          it sits inside main.content-for-layout, which has position:relative and z-index:2 and
          so is a stacking context of its own: inside it no z-index, however large, can rise
          above the sticky header, which paints over the top of the dialog. A native modal
          escaped this through the top layer; without one, the element has to leave.
        */
        if (!this.portalHost) {
          const section = this.closest('.eden-booking');
          const host = document.createElement('div');
          // Every --ebk- token is set on the section element, by the stylesheet and by the
          // settings written inline, so the overlay travels inside a copy of it or it would
          // lose its colours, borders and sizes on the way out.
          host.className = `${section ? section.className : 'eden-booking'} eden-booking--portal`;
          host.setAttribute('style', section ? section.getAttribute('style') || '' : '');
          host.appendChild(this.dialog);
          document.body.appendChild(host);
          this.portalHost = host;
        }

        this.lastFocused = document.activeElement;
        this.scrollWas = document.body.style.overflow;

        this.dialog.hidden = false;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', this.onKeydown);

        const first = this.dialog.querySelector('[data-booking-close]');
        first?.focus({ preventScroll: true });
      }

      /*
        Back on the request panel with the dialog open, however the visitor arrived here. The
        kind of appointment they had chosen is put back first, so what reopens is the dialog
        they left rather than the first one in the row - and the request panel is what shows,
        never the provider's diary, because an answer to our own form belongs on our own form.
      */
      reopenOnRequest() {
        const stash = this.readStash();
        const trigger =
          (stash && this.switches.find((button) => button.dataset.bookingLabel === stash.label)) ||
          this.switches[0] ||
          null;

        if (trigger) {
          const label = trigger.dataset.bookingLabel || '';
          const meta = trigger.dataset.bookingMeta || '';
          if (label && this.titleEl) this.titleEl.textContent = label;
          if (this.eyebrowEl) this.eyebrowEl.textContent = meta || this.eyebrowEl.dataset.default || '';
          if (this.typeField && label) this.typeField.value = meta ? `${label} (${meta})` : label;
          this.switches.forEach((button) => button.setAttribute('aria-pressed', String(button === trigger)));
        }

        this.showRequest();
        this.openDialog();
      }

      /*
        Shopify's answer is a new page, and a new page takes the chosen day and time with it: the
        hidden field comes back empty and the calendar comes back blank. Holding them over the
        round trip is the difference between correcting a request and making it again.
      */
      get stashKey() {
        return `ebk-request-${this.dataset.sectionId || 'booking'}`;
      }

      stashChoice() {
        try {
          sessionStorage.setItem(
            this.stashKey,
            JSON.stringify({
              date: this.chosenDate || '',
              slot: this.chosenSlot || '',
              label:
                this.switches.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.bookingLabel ||
                '',
            })
          );
        } catch (error) {
          // Storage switched off, or a private window: the round trip loses the choice, which is
          // what it did before any of this, not something worse.
        }
      }

      readStash() {
        try {
          const raw = sessionStorage.getItem(this.stashKey);
          return raw ? JSON.parse(raw) : null;
        } catch (error) {
          return null;
        }
      }

      clearStash() {
        try {
          sessionStorage.removeItem(this.stashKey);
        } catch (error) {
          // Nothing was written, so there is nothing to clear.
        }
      }

      restoreStash() {
        const stash = this.readStash();
        if (!stash || !stash.date) return;

        const [year, month, day] = stash.date.split('-').map(Number);
        if (!year || !month || !day) return;

        const date = new Date(year, month - 1, day);
        // A refused request can be corrected the next morning, by which time the day they chose
        // may have fallen inside the lead time, or gone altogether.
        if (date < this.firstDay || date > this.lastDay) return;
        if (!this.openDays.includes(date.getDay())) return;

        this.viewMonth = new Date(year, month - 1, 1);
        this.chooseDate(date);

        if (stash.slot && this.slotTimes.includes(stash.slot)) {
          this.chosenSlot = stash.slot;
          this.renderSlots();
          this.updateChosen();
        }
      }

      closeDialog() {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.dialog.hidden = true;
        document.body.style.overflow = this.scrollWas || '';
        document.removeEventListener('keydown', this.onKeydown);

        if (this.lastFocused instanceof HTMLElement) this.lastFocused.focus({ preventScroll: true });
      }

      /*
        Tab stays inside the overlay, with one exception: while Shopify's bot protection has a
        challenge open, focus has to be allowed to reach it, because it lives outside this
        element and the visitor cannot send the form without answering it.
      */
      keepFocusInside(event) {
        if (document.querySelector('iframe[src*="hcaptcha"], iframe[src*="recaptcha"], .h-captcha')) return;

        const focusable = Array.from(
          this.dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter((el) => el.offsetParent !== null);

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      show(link, silent = false) {
        /*
          An app block is the whole booking system and the server has already rendered it inside
          the dialog: there is no link to resolve, no provider script to wait for and nothing to
          fall back to. It only has to be uncovered - and the two paths it replaces have to be
          put away, or the visitor meets a second calendar underneath it.
        */
        if (this.appStage) {
          this.appStage.hidden = false;
          if (this.stage) this.stage.hidden = true;
          if (this.request) this.request.hidden = true;
          return;
        }

        if (!link) {
          this.showRequest();
          return;
        }

        if (this.builtLink === link) return;

        this.builtLink = link;
        this.frame.replaceChildren();
        this.stage.removeAttribute('data-ready');
        this.stage.classList.remove('ebk-stage--fallback');
        if (this.request) this.request.hidden = true;
        this.stage.hidden = false;
        this.build(link, silent);
      }

      /* ----------------------------------------------------- the provider's diary */

      build(link, silent) {
        const parts = splitLink(link, this.defaultOrigin);
        if (!parts || !parts.path) {
          this.showRequest();
          return;
        }

        this.sequence += 1;

        if (this.provider === 'iframe') {
          this.buildIframe(parts);
          return;
        }
        if (this.provider === 'calendly') {
          this.buildCalendly(parts);
          return;
        }
        this.buildCal(parts, silent);
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

          Cal.ns[namespace]('on', { action: 'linkReady', callback: () => this.ready() });
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
        iframe.title = this.dataset.frameTitle || 'Book an appointment';
        iframe.setAttribute('allow', 'camera; microphone; fullscreen; payment');
        iframe.addEventListener('load', () => this.ready());
        this.frame.replaceChildren(iframe);

        this.watch(parts, true);
      }

      /*
        A provider script that loads but never paints would leave the spinner turning for good.
        If nothing has appeared by the deadline the embed is given up on for the plain iframe,
        and the iframe in turn gives up for our own picker.
      */
      watch(parts, isIframe = false) {
        clearTimeout(this.timer);
        const deadline = Number(this.dataset.timeout || 12000);

        this.timer = setTimeout(() => {
          if (this.stage.dataset.ready === 'true') return;
          if (isIframe) {
            this.showRequest();
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

      /* ------------------------------------------------- our own date and time picker */

      showRequest() {
        clearTimeout(this.timer);
        this.builtLink = null;
        this.stage.hidden = true;
        this.stage.dataset.ready = 'true';
        if (this.request) {
          this.request.hidden = false;
          this.buildCalendar();
        }
      }

      setupRequest() {
        if (!this.request) return;

        this.calendarEl = this.request.querySelector('[data-booking-calendar]');
        this.slotsEl = this.request.querySelector('[data-booking-slots]');
        this.slotField = this.request.querySelector('[data-booking-field-slot]');
        this.chosenEl = this.request.querySelector('[data-booking-chosen]');

        this.form = this.request.querySelector('form');
        this.statusEl = this.request.querySelector('[data-booking-status]');
        this.form?.addEventListener('submit', (event) => this.sendRequest(event));

        const settings = this.calendarEl?.dataset || {};
        this.openDays = (settings.openDays || '1,2,3,4,5')
          .split(',')
          .map((day) => Number(day.trim()))
          .filter((day) => !Number.isNaN(day));
        this.slotTimes = (settings.slots || '10:00,11:00,12:00,14:00,15:00,16:00')
          .split(',')
          .map((slot) => slot.trim())
          .filter(Boolean);
        this.leadDays = Number(settings.leadDays || 1);
        this.windowDays = Number(settings.windowDays || 60);
        // A bare "en" formats dates the American way ("Wednesday, October 21"), which is not
        // how a London diary reads, so it is treated as en-GB; a locale with a region is kept.
        const lang = document.documentElement.lang;
        this.locale = !lang || lang.toLowerCase() === 'en' ? 'en-GB' : lang;

        this.firstDay = addDays(startOfDay(new Date()), this.leadDays);
        this.lastDay = addDays(startOfDay(new Date()), this.windowDays);
        this.viewMonth = new Date(this.firstDay.getFullYear(), this.firstDay.getMonth(), 1);
      }

      buildCalendar() {
        if (!this.calendarEl || this.calendarBuilt) return;
        this.calendarBuilt = true;
        this.renderCalendar();
      }

      renderCalendar() {
        const monthLabel = new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric' }).format(this.viewMonth);
        const dayNames = [];
        // A week that starts on Monday, which is how a British diary reads.
        for (let i = 0; i < 7; i += 1) {
          const sample = new Date(2024, 0, 1 + i); // 1 Jan 2024 was a Monday
          dayNames.push(new Intl.DateTimeFormat(this.locale, { weekday: 'narrow' }).format(sample));
        }

        const first = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 0).getDate();

        const prevDisabled = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth(), 1) <= new Date(this.firstDay.getFullYear(), this.firstDay.getMonth(), 1);
        const nextDisabled = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth(), 1) >= new Date(this.lastDay.getFullYear(), this.lastDay.getMonth(), 1);

        this.calendarEl.replaceChildren();

        const head = document.createElement('div');
        head.className = 'ebk-cal__head';
        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'ebk-cal__nav';
        prev.innerHTML = '&#8592;';
        prev.setAttribute('aria-label', 'Previous month');
        prev.disabled = prevDisabled;
        prev.addEventListener('click', () => {
          this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() - 1, 1);
          this.renderCalendar();
        });
        const label = document.createElement('span');
        label.className = 'ebk-cal__month';
        label.textContent = monthLabel;
        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'ebk-cal__nav';
        next.innerHTML = '&#8594;';
        next.setAttribute('aria-label', 'Next month');
        next.disabled = nextDisabled;
        next.addEventListener('click', () => {
          this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 1);
          this.renderCalendar();
        });
        head.append(prev, label, next);

        const grid = document.createElement('div');
        grid.className = 'ebk-cal__grid';

        dayNames.forEach((name) => {
          const cell = document.createElement('span');
          cell.className = 'ebk-cal__dayname';
          cell.textContent = name;
          grid.appendChild(cell);
        });

        for (let i = 0; i < offset; i += 1) {
          const blank = document.createElement('span');
          blank.className = 'ebk-cal__day ebk-cal__day--empty';
          grid.appendChild(blank);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth(), day);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ebk-cal__day';
          button.textContent = String(day);
          button.dataset.date = isoDate(date);

          const closed = !this.openDays.includes(date.getDay());
          const tooSoon = date < this.firstDay;
          const tooFar = date > this.lastDay;
          button.disabled = closed || tooSoon || tooFar;
          button.setAttribute('aria-pressed', String(this.chosenDate === button.dataset.date));
          button.setAttribute(
            'aria-label',
            new Intl.DateTimeFormat(this.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
          );

          if (!button.disabled) {
            button.addEventListener('click', () => this.chooseDate(date));
          }

          grid.appendChild(button);
        }

        this.calendarEl.append(head, grid);
        this.renderSlots();
      }

      chooseDate(date) {
        this.chosenDate = isoDate(date);
        this.chosenDateLabel = new Intl.DateTimeFormat(this.locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(date);
        this.chosenSlot = null;
        this.renderCalendar();
        this.updateChosen();
      }

      renderSlots() {
        if (!this.slotsEl) return;
        this.slotsEl.replaceChildren();

        if (!this.chosenDate) {
          const empty = document.createElement('p');
          empty.className = 'ebk-cal__empty';
          empty.textContent = this.slotsEl.dataset.emptyText || 'Pick a day to see the times we keep free.';
          this.slotsEl.appendChild(empty);
          return;
        }

        const heading = document.createElement('h4');
        heading.className = 'ebk-cal__slots-heading';
        heading.textContent = this.chosenDateLabel;

        const list = document.createElement('div');
        list.className = 'ebk-cal__slot-list';

        this.slotTimes.forEach((time) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ebk-cal__slot';
          button.textContent = time;
          button.setAttribute('aria-pressed', String(this.chosenSlot === time));
          button.addEventListener('click', () => {
            this.chosenSlot = time;
            this.renderSlots();
            this.updateChosen();
          });
          list.appendChild(button);
        });

        this.slotsEl.append(heading, list);
      }

      /*
        Sending the request.

        This is Shopify's own contact form and it is left to post the way Shopify means it to:
        a real navigation to /contact and a redirect back. That is slower than posting it in
        the background, and it was tempting to do the latter - but this shop has Shopify's bot
        protection switched on, and the hCaptcha token it attaches is put there by Shopify's
        own script listening for exactly this submit. A background post would arrive without
        the token, be refused at the edge, and have to be sent a second time anyway; worse, the
        two scripts would each believe they owned the submit and the shop could receive the
        request twice.

        So all this does is the part Shopify cannot: refuse a request with no day on it, and
        say that something is happening while the page goes. return_to in the markup brings the
        visitor back to this page with the posted flag, and connectedCallback reopens the
        dialog on the thank-you, so the round trip reads as one movement rather than a page
        that blinked and lost what they chose.
      */
      sendRequest(event) {
        if (!this.form) return;

        // A day and a time are the whole point of the request; without them this is a message,
        // and the shop has a contact page for those.
        if (this.slotField && !this.slotField.value) {
          event.preventDefault();
          this.setStatus(this.statusEl?.dataset.pick, 'error');
          this.statusEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }

        /*
          Nothing can post from a local preview. shopify theme dev serves the storefront from
          127.0.0.1, Shopify's edge answers a form post from there with a bot challenge (403,
          cf-mitigated: challenge), and that challenge cannot load its own assets on a local
          origin - it arrives as a blank page. Better to say so here than to let a developer
          read the blank page as a broken form.
        */
        if (this.isLocalPreview) {
          event.preventDefault();
          console.warn(
            '[consultation-booking] Form posts cannot complete through `shopify theme dev`: Shopify refuses a POST from %s with a bot challenge. Test the request panel on a theme preview URL or the live storefront.',
            window.location.origin
          );
          this.setStatus(this.statusEl?.dataset.local, 'error');
          return;
        }

        if (this.sending) {
          event.preventDefault();
          return;
        }

        this.sending = true;
        this.stashChoice();
        this.setStatus(this.statusEl?.dataset.sending, 'pending');
      }

      // shopify theme dev proxies the real storefront through a local origin, which every edge
      // check downstream treats as what it is: not the shop.
      get isLocalPreview() {
        return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(window.location.hostname);
      }

      requestSent() {
        if (!this.form) return;
        this.sending = false;
        this.form.hidden = true;
        this.setStatus(this.statusEl?.dataset.sent, 'sent');
      }

      setStatus(text, state) {
        if (!this.statusEl) return;

        if (!text) {
          this.statusEl.hidden = true;
          this.statusEl.textContent = '';
          return;
        }

        this.statusEl.textContent = text;
        this.statusEl.classList.toggle('ebk-form__message--error', state === 'error');
        this.statusEl.classList.toggle('ebk-form__message--pending', state === 'pending');
        this.statusEl.hidden = false;
      }

      updateChosen() {
        // A day has just been chosen, so "choose a day first" has had its answer.
        if (this.statusEl && this.statusEl.classList.contains('ebk-form__message--error')) this.setStatus(null);

        if (!this.chosenEl) return;

        if (!this.chosenDate) {
          this.chosenEl.hidden = true;
          if (this.slotField) this.slotField.value = '';
          return;
        }

        const text = this.chosenSlot
          ? `${this.chosenDateLabel} at ${this.chosenSlot}`
          : `${this.chosenDateLabel} - no time chosen yet`;

        this.chosenEl.hidden = false;
        this.chosenEl.textContent = `${this.chosenEl.dataset.prefix || 'You have asked for'} ${text}.`;
        if (this.slotField) this.slotField.value = this.chosenSlot ? `${this.chosenDateLabel} at ${this.chosenSlot}` : this.chosenDateLabel;
      }
    }
  );
}
