/*
 * Feedback for the gap between clicking a link and the next page being ready.
 *
 * That wait has two halves, and the bar covers both:
 *
 *   1. Click until the browser commits the navigation. The old page is still on
 *      screen; nothing else says the click registered.
 *   2. The new document, from its first paint until window load. The old page's bar
 *      died with it, but the stylesheets, fonts and photos are still arriving.
 *
 * Half two is what makes the bar worth having. On a quick server response half one
 * lasts a few dozen milliseconds -- too short to see, which is why a click-only bar
 * reads as broken -- while the page it lands on keeps loading for a good while after.
 *
 * Neither half reports real progress, so the bar eases towards a ceiling on a timer
 * and only ever completes when the wait actually ends. Clicks that a component handles
 * itself -- facet filters, the cart drawer, anything that calls preventDefault -- have
 * defaultPrevented set by the time the event reaches document, so they never start it.
 * A watchdog retracts the bar for whatever slips through, such as a navigation the
 * browser declines to make.
 */
(() => {
  const CEILING = 0.9;
  const START_AT = 0.12;
  const TICK_MS = 300;
  const WATCHDOG_MS = 8000;
  const LAND_MS = 320;
  const FADE_MS = 240;

  /* A page that is already warm finishes inside this, and stays quiet. */
  const LOAD_GRACE_MS = 150;

  let root = null;
  let bar = null;
  let progress = 0;
  let tickTimer = null;
  let watchdogTimer = null;
  let hideTimer = null;
  let positionFrame = null;

  function mount() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'page-progress';
    root.setAttribute('aria-hidden', 'true');
    bar = document.createElement('div');
    bar.className = 'page-progress__bar';
    root.appendChild(bar);
    document.body.appendChild(root);
  }

  function paint() {
    if (bar) bar.style.width = `${(progress * 100).toFixed(2)}%`;
  }

  /* The bar hangs off the bottom of the nav bar, so it reads as part of the header
     rather than as something floating over the announcement bar above it.
     That edge is measured, never assumed: the header is sticky on most templates,
     transparent on some, and slides out of the way on scroll-up, and the announcement
     bar above it is editable, so its height is not ours to hardcode. */
  function syncPosition() {
    positionFrame = null;
    const header = document.querySelector('#header-component');
    const bottom = header ? header.getBoundingClientRect().bottom : 0;
    /* A header that has scrolled away, or slid up out of view, leaves the bar at the
       top of the viewport rather than following it off-screen. */
    const top = Math.max(0, Math.min(bottom, window.innerHeight));
    document.documentElement.style.setProperty('--page-progress-top', `${Math.round(top)}px`);
  }

  function queueSync() {
    if (positionFrame !== null) return;
    positionFrame = requestAnimationFrame(syncPosition);
  }

  /* Steps shrink as the bar advances, so it never looks stalled and never looks about
     to finish -- the one thing a fake progress bar must not promise. */
  function tick() {
    progress = Math.min(CEILING, progress + Math.max((CEILING - progress) * 0.12, 0.004));
    queueSync();
    paint();
  }

  function stopTimers() {
    clearInterval(tickTimer);
    clearTimeout(watchdogTimer);
    clearTimeout(hideTimer);
  }

  function start() {
    if (root && root.dataset.state === 'loading') return;
    stopTimers();
    mount();

    /* Opens at a width you can see, in one frame, with the transition off: the bar has
       to be present the instant it is asked for, not slide in from nothing. */
    bar.style.transition = 'none';
    progress = START_AT;
    syncPosition();
    paint();
    root.dataset.state = 'loading';

    requestAnimationFrame(() => {
      if (root.dataset.state === 'loading') bar.style.transition = '';
    });

    tickTimer = setInterval(tick, TICK_MS);
    watchdogTimer = setTimeout(retract, WATCHDOG_MS);
  }

  function finish() {
    if (!root || root.dataset.state !== 'loading') return;
    stopTimers();
    root.dataset.state = 'done';
    progress = 1;
    paint();
    hideTimer = setTimeout(retract, LAND_MS);
  }

  function retract() {
    stopTimers();
    if (!root) return;
    delete root.dataset.state;
    progress = 0;
    /* Width goes back to zero only once the bar has faded, so the trip back to the
       left edge is never on screen. */
    hideTimer = setTimeout(() => {
      if (!root.dataset.state) {
        bar.style.transition = 'none';
        paint();
      }
    }, FADE_MS);
  }

  function navigates(link) {
    const href = (link.getAttribute('href') || '').trim();
    if (!href || /^(#|javascript:|mailto:|tel:|sms:)/i.test(href)) return false;
    if (link.hasAttribute('download') || 'noProgress' in link.dataset) return false;

    const target = link.getAttribute('target');
    if (target && target !== '_self') return false;

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (error) {
      return false;
    }
    if (url.origin !== window.location.origin) return false;

    /* A link to this same document plus a hash scrolls, it does not load. */
    const samePath = url.href.split('#')[0] === window.location.href.split('#')[0];
    return !(samePath && url.hash);
  }

  /* Captured, then decided a tick later.
   *
   * Capture is so that a component calling stopPropagation on a card or nav link --
   * this theme does it in several places -- cannot stop the event reaching here at
   * all. The deferred check is so preventDefault is still honoured: the facet and
   * cart-drawer handlers only call it once the event has reached them, which is after
   * the capture phase, and a task scheduled from capture runs after the whole dispatch
   * has finished. So both kinds of intercepted click are read correctly. */
  function decideLater(event, isWanted) {
    setTimeout(() => {
      if (!event.defaultPrevented && isWanted()) start();
    }, 0);
  }

  document.addEventListener(
    'click',
    (event) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest('a[href]');
      if (link) decideLater(event, () => navigates(link));
    },
    true
  );

  /* Search, login and address forms navigate; add-to-cart and facet forms are
     intercepted by their own handlers, which the deferred check catches. */
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement) {
        decideLater(event, () => !('noProgress' in form.dataset));
      }
    },
    true
  );

  /* Only while the bar is on screen: there is nothing to reposition otherwise, and a
     scroll listener that measures on every page in the store is not worth its cost. */
  ['scroll', 'resize'].forEach((type) => {
    window.addEventListener(
      type,
      () => {
        if (root && root.dataset.state) queueSync();
      },
      { passive: true }
    );
  });

  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);

  /* A back/forward restore brings the DOM back exactly as it was left -- mid-creep or
     sitting at 100% -- so clear it rather than let the old bar linger. */
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) retract();
  });

  function watchThisPage() {
    if (document.readyState === 'complete') return;

    const grace = setTimeout(() => {
      if (document.readyState !== 'complete') start();
    }, LOAD_GRACE_MS);

    window.addEventListener(
      'load',
      () => {
        clearTimeout(grace);
        finish();
      },
      { once: true }
    );
  }

  watchThisPage();

  /* A handle for checking this from the console: pageProgress.start() should put the
     bar on screen straight away, which separates "the bar does not render" from "the
     click was never seen". */
  window.pageProgress = { start, finish, retract };
})();
