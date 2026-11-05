/*
  The arrows on the style card row in sections/collection-style-strip.liquid.

  A custom element rather than a script inside the section: the theme editor and the preview swap a
  section's HTML in by assignment, which never runs an inline script, so the arrows would go dead
  until the page was reloaded. An element upgrades itself whenever it is put into the page.

  The row is an ordinary horizontal scroller. The arrows only scroll it, so with this file blocked
  the cards can still be swiped and every one is still reachable.
*/
if (!customElements.get('collection-style-strip')) {
  class CollectionStyleStrip extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-strip-track]');
      if (!this.track) return;

      this.arrows = this.querySelector('[data-strip-arrows]');
      this.prev = this.querySelector('.style-strip__arrow--prev');
      this.next = this.querySelector('.style-strip__arrow--next');

      this.boundUpdate = this.update.bind(this);

      this.prev?.addEventListener('click', () => this.go(-1));
      this.next?.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', this.boundUpdate, { passive: true });
      window.addEventListener('resize', this.boundUpdate);

      // A card picture still loading when the row is measured would leave the arrows in the wrong
      // state, so each one re-checks once it has arrived.
      this.track.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', this.boundUpdate, { once: true });
      });

      this.scrollToCurrent();
      this.update();
    }

    disconnectedCallback() {
      window.removeEventListener('resize', this.boundUpdate);
      this.track?.removeEventListener('scroll', this.boundUpdate);
    }

    get maxScroll() {
      return this.track.scrollWidth - this.track.clientWidth;
    }

    /* One screenful less a card, so the card at the edge stays in view as a hand-hold. */
    get step() {
      const card = this.track.querySelector('.style-strip__item');
      const cardWidth = card ? card.getBoundingClientRect().width : 0;
      return Math.max(cardWidth, this.track.clientWidth - cardWidth);
    }

    go(direction) {
      this.track.scrollBy({ left: this.step * direction, behavior: 'smooth' });
    }

    /*
      The card for the collection being viewed can sit off the right of the row - Toi et Moi is
      eleventh of eleven - which reads as if the row did not know where the shopper was. It is
      brought into view without scrolling the page itself.
    */
    scrollToCurrent() {
      const current = this.track.querySelector('.style-strip__card--active');
      if (!current) return;
      const card = current.closest('.style-strip__item');
      if (!card) return;
      const offset = card.offsetLeft - (this.track.clientWidth - card.offsetWidth) / 2;
      this.track.scrollLeft = Math.max(0, Math.min(offset, this.maxScroll));
    }

    update() {
      const max = this.maxScroll;
      // Every card already fits: there is nothing to scroll, so the arrows go rather than sit
      // there doing nothing.
      if (this.arrows) this.arrows.hidden = max <= 2;
      if (!this.prev || !this.next) return;
      this.prev.disabled = this.track.scrollLeft <= 2;
      this.next.disabled = this.track.scrollLeft >= max - 2;
    }
  }

  customElements.define('collection-style-strip', CollectionStyleStrip);
}
