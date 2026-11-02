/*
 * Shows the gallery's own spinner while a product photo is being fetched.
 *
 * product-media.liquid renders a hidden loading-spinner inside every .product-media
 * and nothing ever un-hid it. A photo earns a spinner only once the browser has
 * actually started fetching it, which for a lazy image is when it nears the viewport
 * -- so an IntersectionObserver decides when to look, rather than a sweep at load that
 * would leave spinners turning over every photo below the fold.
 *
 * A variant change replaces the whole product-info subtree with freshly rendered
 * markup, and the grid gallery moves media nodes around, so added nodes are picked up
 * from a MutationObserver instead of only at startup.
 */
(() => {
  /* main-product.liquid loads this from inside product-info, and a variant change
     re-injects every script in that subtree -- so this runs again on each swap. The
     observers below outlive the swap, so the second run must do nothing. */
  if (window.productMediaLoadingReady) return;
  window.productMediaLoadingReady = true;

  const MEDIA_SELECTOR = '.product-media';
  const IMAGE_SELECTOR = 'img.product-media__image';
  const LOADING_CLASS = 'is-media-loading';
  const NEAR_VIEWPORT = '200px';

  const seen = new WeakSet();

  function settle(media) {
    media.classList.remove(LOADING_CLASS);
    media.querySelector(':scope > .loading__spinner')?.classList.add('hidden');
  }

  function watch(media) {
    const image = media.querySelector(IMAGE_SELECTOR);
    if (!image) return;

    /* complete is true for a cached hit, for a decode that finished before this ran,
       and for a broken image -- settling is the right answer to all three. */
    if (image.complete) {
      settle(media);
      return;
    }

    media.classList.add(LOADING_CLASS);
    media.querySelector(':scope > .loading__spinner')?.classList.remove('hidden');

    const done = () => settle(media);
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  }

  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              observer.unobserve(entry.target);
              watch(entry.target);
            }
          },
          { rootMargin: NEAR_VIEWPORT }
        )
      : null;

  function register(media) {
    if (seen.has(media)) return;
    seen.add(media);
    if (observer) observer.observe(media);
    else watch(media);
  }

  function scan(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(MEDIA_SELECTOR)) register(node);
    node.querySelectorAll(MEDIA_SELECTOR).forEach(register);
  }

  function init() {
    scan(document.body);

    /* Watching body rather than main: switching to a product in a combined listing
       replaces main itself, which would strand an observer bound to it. */
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
