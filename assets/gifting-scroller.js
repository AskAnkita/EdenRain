/*
  The row of gifts in sections/eden-quote.liquid.

  A custom element rather than a script inside the section: the theme preview
  and the theme editor swap a section's HTML in by assignment, which never runs
  an inline script, so the arrows would stop working the moment a setting was
  changed and stay broken until the page was reloaded. An element upgrades
  itself whenever it is put into the page, however it got there.

  Everything is optional. The arrows, the progress bar or both can be switched
  off in the editor, and the element simply does less; with neither of them it
  still leaves a row that scrolls by swipe and by trackpad.
*/
if (!customElements.get('gifting-scroller')) {
  class GiftingScroller extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-gift-track]');
      if (!this.track) return;

      this.controls = this.querySelector('.gifting-banner__controls');
      // The arrow pair sits beside the heading, outside this scroller, while
      // the progress bar stays under the product row.
      this.arrows = this.closest('.eden-quote')?.querySelector('[data-gift-arrows]');
      this.progress = this.querySelector('[data-gift-progress]');
      this.bar = this.querySelector('[data-gift-bar]');
      this.prev = this.arrows?.querySelector('.gifting-banner__arrow--prev');
      this.next = this.arrows?.querySelector('.gifting-banner__arrow--next');
      this.mobileAutoplay = this.closest('.eden-quote')?.dataset.mobileAutoplay === 'true';

      this.boundUpdate = this.update.bind(this);

      this.prev?.addEventListener('click', () => this.go(-1));
      this.next?.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', this.boundUpdate, { passive: true });
      window.addEventListener('resize', this.boundUpdate);

      this.autoVisible = false;
      this.autoMedia = window.matchMedia('(max-width: 989px)');
      this.boundAutoState = this.syncAutoAdvance.bind(this);
      this.autoMedia.addEventListener('change', this.boundAutoState);
      document.addEventListener('visibilitychange', this.boundAutoState);
      this.autoObserver = new IntersectionObserver(([entry]) => {
        this.autoVisible = entry.isIntersecting;
        this.syncAutoAdvance();
      }, { threshold: 0.4 });
      this.autoObserver.observe(this);
      this.pauseAutoAdvance = () => {
        this.autoPausedByUser = true;
        clearTimeout(this.autoTimer);
      };
      this.track.addEventListener('pointerdown', this.pauseAutoAdvance, { passive: true });

      // The cards are lazy-loaded, so the row is usually measured before the
      // pictures have arrived and settled its own width. Each one re-checks.
      this.track.querySelectorAll('img').forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', this.boundUpdate);
        img.addEventListener('error', this.boundUpdate);
      });

      this.update();
    }

    disconnectedCallback() {
      clearTimeout(this.settleTimer);
      clearTimeout(this.autoTimer);
      this.autoObserver?.disconnect();
      this.autoMedia?.removeEventListener('change', this.boundAutoState);
      document.removeEventListener('visibilitychange', this.boundAutoState);
      this.track?.removeEventListener('pointerdown', this.pauseAutoAdvance);
      window.removeEventListener('resize', this.boundUpdate);
    }

    // "Auto-scroll on mobile" plays a single hint rather than a loop: the first
    // time the row is on screen it glides on by one card and back, so the
    // shopper sees it swipes, and then it never moves by itself again.
    syncAutoAdvance() {
      clearTimeout(this.autoTimer);
      if (this.autoHintDone || !this.mobileAutoplay || this.autoPausedByUser) return;
      if (!this.autoVisible || !this.autoMedia?.matches || document.hidden) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.autoTimer = setTimeout(() => {
        if (this.autoPausedByUser || this.maxScroll <= 2 || this.track.scrollLeft > 2) return;
        this.autoHintDone = true;
        this.autoObserver?.disconnect();
        this.go(1);
        this.autoTimer = setTimeout(() => {
          if (this.autoPausedByUser) return;
          this.track.scrollTo({ left: 0, behavior: 'smooth' });
          clearTimeout(this.settleTimer);
          this.settleTimer = setTimeout(this.boundUpdate, 600);
        }, 1400);
      }, 700);
    }

    get maxScroll() {
      return this.track.scrollWidth - this.track.clientWidth;
    }

    update() {
      const max = this.maxScroll;

      // Fewer gifts than fit the panel: there is nothing to scroll, so the
      // arrows and the bar go rather than sit under the cards doing nothing.
      // A collection of three then looks exactly as it did before the row
      // could scroll at all.
      const scrollable = max > 2;
      if (this.controls) this.controls.hidden = !scrollable;
      if (this.arrows) this.arrows.hidden = !scrollable;
      if (this.progress) this.progress.hidden = !scrollable;

      if (this.bar) {
        // The same fill as the rest of the theme's carousels: it starts at the
        // left edge covering the share of the row on screen and grows to the
        // full width at the last card, rather than sliding along as a thumb.
        const filled = this.track.scrollWidth
          ? (this.track.scrollLeft + this.track.clientWidth) / this.track.scrollWidth
          : 1;
        this.bar.style.transform = `scaleX(${Math.min(1, filled)})`;
      }

      if (!this.prev || !this.next) return;
      this.prev.disabled = this.track.scrollLeft <= 2;
      this.next.disabled = this.track.scrollLeft >= max - 2;
    }

    // One card per click, so the row always lands on a card edge rather than
    // part way through one and letting scroll snapping decide where it stops.
    step() {
      const card = this.track.querySelector('.gifting-banner__product');
      if (!card) return this.track.clientWidth;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap || this.track.clientWidth;
    }

    go(direction) {
      // The scroll listener keeps the arrows in step while the row glides, and
      // this settles their state once it has stopped, in case the last scroll
      // event lands before the final pixel.
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(this.boundUpdate, 600);
      this.track.scrollBy({ left: direction * this.step(), behavior: 'smooth' });
    }
  }

  customElements.define('gifting-scroller', GiftingScroller);
}
