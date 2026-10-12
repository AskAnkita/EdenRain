/*
 * Feedback for the gap between clicking a link and the next page painting.
 *
 * The browser gives no progress events for a document navigation, so the bar eases
 * towards a ceiling on a timer and only completes on unload. Clicks that a component
 * handles itself -- facet filters, the cart drawer, anything that calls
 * preventDefault -- have defaultPrevented set by the time the event reaches document,
 * so they never start the bar. A watchdog retracts it for whatever slips through, such
 * as a navigation the browser declines to make.
 */
(() => {
  const CEILING = 0.9;
  const START_AT = 0.08;
  const TICK_MS = 300;
  const WATCHDOG_MS = 8000;
  const LAND_MS = 400;

  let root = null;
  let bar = null;
  let progress = 0;
  let tickTimer = null;
  let watchdogTimer = null;
  let hideTimer = null;

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

  /* Steps shrink as the bar advances, so it never looks stalled and never looks about
     to finish -- the one thing a fake progress bar must not promise. */
  function tick() {
    progress = Math.min(CEILING, progress + Math.max((CEILING - progress) * 0.12, 0.004));
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

    /* Rewind unanimated: a bar that starts again straight after a retract has to look
       like it begins at the left edge, not like it slides back to it. */
    bar.style.transition = 'none';
    progress = 0;
    paint();
    root.dataset.state = 'loading';

    /* The zero width is committed in this frame, so the first real step has somewhere
       to travel from once the transition is back on. */
    requestAnimationFrame(() => {
      if (root.dataset.state !== 'loading') return;
      bar.style.transition = '';
      progress = START_AT;
      paint();
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
    /* Width goes back to zero only once the bar has faded out, so the trip back to the
       left edge is never on screen. */
    hideTimer = setTimeout(() => {
      if (!root.dataset.state) paint();
    }, 240);
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

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest('a[href]');
    if (link && navigates(link)) start();
  });

  /* Search, login and address forms navigate; add-to-cart and facet forms are
     intercepted by their own handlers and so arrive here already prevented. */
  document.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    const form = event.target;
    if (form instanceof HTMLFormElement && !('noProgress' in form.dataset)) start();
  });

  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);

  /* A back/forward restore brings the DOM back exactly as it was left -- mid-animation
     or sitting at 100% -- so clear it rather than let the old bar linger. */
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) retract();
  });
})();
