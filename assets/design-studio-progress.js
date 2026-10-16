/*
  Design studio progress bar - <ds-progress> in sections/design-studio.liquid.

  The bar is a row of in-page links, one per step block, over a hairline track.
  Nothing here navigates: a click is cancelled and turned into a scroll to the
  step on the same page, offset by the sticky header and by the bar itself, and
  the hash is written with replaceState so the back button is not filled with
  steps. As the page scrolls, the fill runs from the first step to the last and
  the step the reader is on is the only one in full ink.

  A custom element rather than a script in the section: an inline script runs
  once and is gone after the theme editor swaps the section's HTML, while a
  custom element is constructed again with the new markup.
*/
(() => {
  if (customElements.get('ds-progress')) return;

  const reduceMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class DesignStudioProgress extends HTMLElement {
    connectedCallback() {
      this.links = Array.from(this.querySelectorAll('[data-ds-progress-link]'));
      this.fill = this.querySelector('[data-ds-progress-fill]');
      this.targets = this.links.map((link) => {
        const id = (link.getAttribute('href') || '').slice(1);
        return id ? document.getElementById(id) : null;
      });

      // Nothing to point at - the steps band is off, or its markup changed.
      if (!this.targets.some(Boolean)) {
        this.hidden = true;
        return;
      }
      this.hidden = false;

      this.onClick = this.onClick.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.addEventListener('click', this.onClick);
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
      this.update();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onScroll);
      cancelAnimationFrame(this.frame);
    }

    /* The sticky header is measured rather than assumed: the theme's header
       height changes with the announcement bar and between breakpoints. */
    offsetTop() {
      const header = document.querySelector(
        '.shopify-section-header-sticky, sticky-header, .section-header'
      );
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const barHeight = this.hasAttribute('data-sticky')
        ? this.getBoundingClientRect().height
        : 0;
      return headerHeight + barHeight + 16;
    }

    onClick(event) {
      const link = event.target.closest('[data-ds-progress-link]');
      if (!link || !this.contains(link)) return;

      const id = (link.getAttribute('href') || '').slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      event.preventDefault();
      const top =
        target.getBoundingClientRect().top + window.scrollY - this.offsetTop();
      window.scrollTo({
        top: Math.max(top, 0),
        behavior: reduceMotion() ? 'auto' : 'smooth',
      });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (id && history.replaceState) {
        history.replaceState(null, '', `#${id}`);
      }
    }

    onScroll() {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.update());
    }

    update() {
      const line = this.offsetTop() + 1;
      const steps = this.targets;
      let current = -1;

      steps.forEach((target, index) => {
        if (target && target.getBoundingClientRect().top <= line) current = index;
      });

      // Above the first step the bar reads as "not started" rather than as the
      // first step being done, so the fill stays empty until one is passed.
      this.links.forEach((link, index) => {
        link.classList.toggle('is-current', index === current);
        link.classList.toggle('is-done', current > -1 && index < current);
        if (index === current) {
          link.setAttribute('aria-current', 'step');
        } else {
          link.removeAttribute('aria-current');
        }
      });

      if (!this.fill) return;

      const first = steps.find(Boolean);
      const last = [...steps].reverse().find(Boolean);
      let percent = 0;
      if (first && last) {
        const start = first.getBoundingClientRect().top + window.scrollY;
        const end =
          last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight / 2;
        const span = end - start;
        percent = span > 0 ? ((window.scrollY - start) / span) * 100 : 100;
      }
      this.fill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
    }
  }

  customElements.define('ds-progress', DesignStudioProgress);
})();
