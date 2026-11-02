/*
  Takes the render deferral back off below-the-fold sections as they come up.

  lazy-section.css hands every section past the first few to the browser as
  "skip this for now". That also clips whatever leans out of a section, so the
  mark has to come off before the visitor can see it - well before, hence the
  generous rootMargin - and once off it stays off.

  This is one global script rather than a script per section because it has to
  see all of them at once. It re-arms on the theme editor's section events and on
  sections the Section Rendering API appends, so a re-rendered section is never
  left contained.
*/
(function () {
  const SEEN_CLASS = 'section--seen';
  const SECTION_SELECTOR = '#MainContent > .shopify-section, .shopify-section-group-footer-group';
  const ROOT_MARGIN = '1200px 0px';
  const root = document.documentElement;

  // The snippet in the head only adds this once it has checked the browser can
  // do the work; without it there is nothing to undo.
  if (!root.classList.contains('lazy-sections')) return;

  function standDown() {
    root.className = root.className.replace(/\blazy-sections(--skip-\d+)?\b/g, '').replace(/\s+/g, ' ').trim();
  }

  // No observer means no way to tell when a section is coming up, and a section
  // left contained for good is worse than one that was never deferred.
  if (!('IntersectionObserver' in window)) {
    standDown();
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        entry.target.classList.add(SEEN_CLASS);
      });
    },
    { rootMargin: ROOT_MARGIN }
  );

  function arm() {
    document.querySelectorAll(SECTION_SELECTOR).forEach(function (section) {
      if (section.classList.contains(SEEN_CLASS) || section.dataset.lazySectionArmed) return;
      section.dataset.lazySectionArmed = 'true';
      observer.observe(section);
    });
  }

  arm();

  // The theme editor swaps a section for a freshly rendered copy.
  document.addEventListener('shopify:section:load', arm);

  // So does the Section Rendering API - filtered grids, paged lists, quick views.
  const main = document.getElementById('MainContent');
  if (main && 'MutationObserver' in window) {
    new MutationObserver(arm).observe(main, { childList: true });
  }
})();
