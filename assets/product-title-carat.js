/*
 * <product-title-carat> - puts the total carat weight at the head of the product page title
 * ("3.21 CTW Lab-Grown Diamond Halo Engagement Ring") when the product's own title has none.
 *
 * A merged shape product is titled without a carat because every centre-stone shape weighs
 * differently. The figure is the one the "Total Carat Weight" row already shows
 * (blocks/product-info.liquid, the variant metafield custom.total_carat_weight), and
 * product-info.js rewrites that row on every variant change, so watching it keeps the title
 * on the selected shape. A custom element rather than an inline script so it survives the
 * section re-rendering in the editor and on theme dev.
 */
if (!customElements.get('product-title-carat')) {
  customElements.define(
    'product-title-carat',
    class ProductTitleCarat extends HTMLElement {
      connectedCallback() {
        this.row = this.closest('[data-carat]');
        this.value = this.row && this.row.querySelector('.product-info-value');
        const section = this.closest('.shopify-section') || document;
        this.heading = section.querySelector('h1');
        if (!this.value || !this.heading) return;

        // A title that already says "2.5 CTW" keeps it; nothing is added twice.
        const own = Array.from(this.heading.childNodes)
          .filter((node) => !(node instanceof Element && node.matches('.product-title-carat')))
          .map((node) => node.textContent)
          .join('');
        if (/\bctw\b/i.test(own)) return;

        this.span = this.heading.querySelector('.product-title-carat');
        if (!this.span) {
          this.span = document.createElement('span');
          this.span.className = 'product-title-carat';
          this.heading.prepend(this.span);
        }
        this.update();
        this.observer = new MutationObserver(() => this.update());
        this.observer.observe(this.row, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
      }

      disconnectedCallback() {
        if (this.observer) this.observer.disconnect();
        if (this.span && this.span.isConnected) this.span.remove();
      }

      update() {
        const text = this.value.textContent.trim();
        const shown = text && this.row.style.display !== 'none';
        this.span.textContent = shown ? text + ' ' : '';
        this.span.hidden = !shown;
      }
    }
  );
}
