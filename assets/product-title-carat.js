/*
 * <product-title-carat> - leads the product page title with the selected shape, and with the
 * total carat weight above 2 CTW: "3.21 CTW Round Halo Lab-Grown Diamond Engagement Ring".
 *
 * A merged shape product is titled by its design alone ("Solitaire Lab-Grown Diamond
 * Engagement Ring") because it holds every centre-stone shape, so the shape the shopper has
 * picked is put in front of the design: "Pear Solitaire ...". It is read from the Shape
 * option's selected value in the variant picker, which product-info.js keeps current.
 *
 * The carat is the one the "Total Carat Weight" row already shows (blocks/product-info.liquid,
 * the variant metafield custom.total_carat_weight), which product-info.js also rewrites on
 * every variant change. A piece of 2 CTW or less is titled by its design alone: the block sets
 * data-min-carat="2", and a figure at or under it is left out. A title that already carries its
 * own carat ("2.2 CTW Twist ...") keeps it, and the shape goes in after it.
 *
 * Card titles do the same in snippets/card-carat-prefix.liquid + card-shape-prefix.liquid. A
 * custom element rather than an inline script so it survives the section re-rendering in the
 * editor and on theme dev.
 */
if (!customElements.get('product-title-carat')) {
  customElements.define(
    'product-title-carat',
    class ProductTitleCarat extends HTMLElement {
      connectedCallback() {
        this.row = this.closest('[data-carat]');
        this.value = this.row && this.row.querySelector('.product-info-value');
        this.section = this.closest('.shopify-section') || document;
        this.heading = this.section.querySelector('h1');
        if (!this.heading) return;

        const ownText = () =>
          Array.from(this.heading.childNodes)
            .filter((node) => !(node instanceof Element && node.matches('.product-title-carat, .product-title-shape')))
            .map((node) => node.textContent)
            .join('');

        this.ownCarat = /\bctw\b/i.test(ownText());

        // Carat: only when the title has none of its own.
        if (this.value && !this.ownCarat) {
          this.span = this.heading.querySelector('.product-title-carat');
          if (!this.span) {
            this.span = document.createElement('span');
            this.span.className = 'product-title-carat';
            this.heading.prepend(this.span);
          }
        }

        // Shape: only on a product with a Shape option.
        if (this.shapeInput()) {
          this.shapeSpan = this.heading.querySelector('.product-title-shape');
          if (!this.shapeSpan) {
            this.shapeSpan = document.createElement('span');
            this.shapeSpan.className = 'product-title-shape';
            this.placeShape();
          }
        }

        if (!this.span && !this.shapeSpan) return;
        this.update();
        this.observer = new MutationObserver(() => this.update());
        if (this.row) {
          this.observer.observe(this.row, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
        }
        const picker = this.shapeInput();
        const pickerRoot = picker && (picker.closest('variant-selects, variant-radios') || picker.parentElement);
        if (pickerRoot) this.observer.observe(pickerRoot, { childList: true, characterData: true, subtree: true });
      }

      disconnectedCallback() {
        if (this.observer) this.observer.disconnect();
        if (this.span && this.span.isConnected) this.span.remove();
        if (this.shapeSpan && this.shapeSpan.isConnected) this.shapeSpan.remove();
      }

      // The picker's Shape fieldset or dropdown, found by its label.
      shapeInput() {
        return Array.from(this.section.querySelectorAll('.product-form__input')).find((input) => {
          const label = input.querySelector('.form__label');
          return label && /^\s*shape\b/i.test(label.textContent);
        });
      }

      // After the title's own "2.2 CTW ", else straight after the carat span (or first).
      placeShape() {
        if (this.ownCarat) {
          const text = Array.from(this.heading.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE && /\bctw\b/i.test(node.textContent)
          );
          const match = text && /^\s*[\d.]+\s*CTW\s+/i.exec(text.textContent);
          if (match) {
            const rest = text.splitText(match[0].length);
            this.heading.insertBefore(this.shapeSpan, rest);
            return;
          }
        }
        if (this.span) this.span.after(this.shapeSpan);
        else this.heading.prepend(this.shapeSpan);
      }

      update() {
        if (this.span) {
          const text = this.value.textContent.trim();
          const min = Number(this.dataset.minCarat) || 0;
          const carat = parseFloat(text);
          const shown = text && this.row.style.display !== 'none' && !(min && carat <= min);
          this.span.textContent = shown ? text + ' ' : '';
          this.span.hidden = !shown;
        }
        if (this.shapeSpan) {
          const input = this.shapeInput();
          const selected = input && input.querySelector('[data-selected-value]');
          const shape = selected ? selected.textContent.trim() : '';
          if (this.shapeSpan.textContent !== (shape ? shape + ' ' : '')) {
            this.shapeSpan.textContent = shape ? shape + ' ' : '';
          }
          this.shapeSpan.hidden = !shape;
        }
      }
    }
  );
}
