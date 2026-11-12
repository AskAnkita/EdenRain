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
      this.arrows = this.querySelector('[data-gift-arrows]');
      this.progress = this.querySelector('[data-gift-progress]');
      this.bar = this.querySelector('[data-gift-bar]');
      this.prev = this.querySelector('.gifting-banner__arrow--prev');
      this.next = this.querySelector('.gifting-banner__arrow--next');

      this.boundUpdate = this.update.bind(this);

      this.prev?.addEventListener('click', () => this.go(-1));
      this.next?.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', this.boundUpdate, { passive: true });
      window.addEventListener('resize', this.boundUpdate);

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
      window.removeEventListener('resize', this.boundUpdate);
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
