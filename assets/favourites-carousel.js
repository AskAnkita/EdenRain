/*
  The row of picture panels in sections/favourites-carousel.liquid.

  A custom element rather than a script inside the section: the theme preview and the
  theme editor swap a section's HTML in by assignment, which never runs an inline
  script, so the arrows would stop working until the page was reloaded. An element
  upgrades itself whenever it is put into the page, however it got there.
*/
if (!customElements.get('favourites-carousel')) {
  class FavouritesCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('.fav-track');
      if (!this.track) return;

      this.arrows = this.querySelector('.fav-arrows');
      this.prev = this.querySelector('.fav-arrow--prev');
      this.next = this.querySelector('.fav-arrow--next');
      this.bar = this.querySelector('[data-fav-bar]');
      this.progress = this.querySelector('[data-fav-progress]');
      // Off by default: the row stops at the last panel rather than jumping back to
      // the first one.
      this.loop = this.dataset.loop === 'true';

      this.boundUpdate = this.update.bind(this);

      this.prev?.addEventListener('click', () => this.go(-1));
      this.next?.addEventListener('click', () => this.go(1));
      this.track.addEventListener('scroll', this.boundUpdate, { passive: true });
      window.addEventListener('resize', this.boundUpdate);

      // A picture asked for by file name or URL may not be there yet; the panel keeps
      // its background and caption instead of showing a broken image.
      this.track.querySelectorAll('img[data-fav-asset]').forEach((img) => {
        img.addEventListener('error', () => img.remove());
        // A picture still loading when the row is measured would leave the arrows in
        // the wrong state, so each one re-checks once it has arrived.
        img.addEventListener('load', this.boundUpdate);
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
      if (this.bar) {
        // The same fill as the rest of the theme's carousels: it starts at the left edge
        // covering the share of the row on screen and grows to the full width at the last
        // panel, rather than sliding along the track as a thumb.
        const filled = this.track.scrollWidth
          ? (this.track.scrollLeft + this.track.clientWidth) / this.track.scrollWidth
          : 1;
        this.bar.style.transform = `scaleX(${Math.min(1, filled)})`;
      }
      // Fewer panels than fit the row: there is nothing to scroll, so the arrows and
      // the progress bar go rather than sit there doing nothing.
      if (this.arrows) this.arrows.hidden = max <= 2;
      if (this.progress) this.progress.hidden = max <= 2;
      if (!this.prev || !this.next) return;
      this.prev.disabled = this.loop ? false : this.track.scrollLeft <= 2;
      this.next.disabled = this.loop ? false : this.track.scrollLeft >= max - 2;
    }

    // One panel per click: the row moves on by a single product and always lands on a
    // panel edge rather than part way through one.
    step() {
      const card = this.track.querySelector('.fav-card');
      if (!card) return this.track.clientWidth;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap || this.track.clientWidth;
    }

    go(direction) {
      const max = this.maxScroll;
      // The scroll listener keeps the arrows in step while the row glides, and this
      // settles their state once it has stopped, in case the last scroll event lands
      // before the final pixel.
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(this.boundUpdate, 600);
      if (this.loop && direction > 0 && this.track.scrollLeft >= max - 2) {
        this.track.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }
      if (this.loop && direction < 0 && this.track.scrollLeft <= 2) {
        this.track.scrollTo({ left: max, behavior: 'smooth' });
        return;
      }
      this.track.scrollBy({ left: direction * this.step(), behavior: 'smooth' });
    }
  }

  customElements.define('favourites-carousel', FavouritesCarousel);
}
