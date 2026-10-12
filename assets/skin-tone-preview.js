/*
 * Skin tone preview.
 *
 * The swatch row is a radiogroup that also behaves like a slider: clicking a swatch, arrowing
 * along the row and dragging the finger across it all land on the same step. Dragging is what
 * most shoppers try first on a tone strip, and a pointer drag over six round buttons otherwise
 * does nothing at all.
 *
 * Each tone is its own photograph, so changing tone means loading one. Two stacked layers
 * cross-fade: the incoming photo is decoded off-screen and only then faded in, which is what
 * keeps the tile from flashing its background while the file arrives. The rest of the ladder is
 * fetched once the shopper shows interest, not on page load -- six hands is a megabyte, and most
 * visitors never touch the slider.
 *
 * On a merged product -- one design, several stone shapes, the shape in the SKU prefix -- the
 * hand shot belongs to one shape only. The section prints each variant's SKU; the tile hides
 * itself whenever the selected variant is not one it was shot for.
 */
(function () {
  function parseJSON(element) {
    if (!element) return null;
    try {
      return JSON.parse(element.textContent);
    } catch (error) {
      return null;
    }
  }

  class SkinTonePreview {
    constructor(root) {
      this.root = root;
      this.layers = Array.from(root.querySelectorAll('[data-skin-tone-layer]'));
      this.steps = Array.from(root.querySelectorAll('[data-skin-tone-step]'));
      this.caption = root.querySelector('[data-skin-tone-caption]');
      this.track = root.querySelector('[data-skin-tone-track]');
      this.captionTemplate = root.dataset.caption || '';
      if (this.layers.length < 2 || !this.steps.length) return;

      this.front = this.layers[0];
      this.back = this.layers[1];
      this.current = this.steps.find((step) => step.getAttribute('aria-checked') === 'true') || this.steps[0];
      this.preloaded = false;

      this.bindSteps();
      this.bindDrag();
      this.bindVariant();
      this.applyVariant(this.selectedVariantId());
    }

    /* One image object per tone, kept alive on the element so the browser cache is warm by the
       time the shopper reaches the far end of the slider. */
    preload() {
      if (this.preloaded) return;
      this.preloaded = true;
      for (const step of this.steps) {
        const src = step.dataset.skinToneSrc;
        if (!src) continue;
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
      }
    }

    bindSteps() {
      for (const step of this.steps) {
        step.addEventListener('click', () => this.select(step));
        step.addEventListener('pointerenter', () => this.preload());
        step.addEventListener('focus', () => this.preload());
        step.addEventListener('keydown', (event) => {
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!delta) return;
          event.preventDefault();
          const next = this.steps[this.steps.indexOf(step) + delta];
          if (!next) return;
          this.select(next);
          next.focus();
        });
      }
    }

    /* Drag along the row: the swatch nearest the pointer wins, so the tone follows the finger
       even between two swatches. */
    bindDrag() {
      if (!this.track) return;
      let dragging = false;

      const pick = (clientX) => {
        let best = null;
        let bestDistance = Infinity;
        for (const step of this.steps) {
          const box = step.getBoundingClientRect();
          const distance = Math.abs(clientX - (box.left + box.width / 2));
          if (distance < bestDistance) {
            bestDistance = distance;
            best = step;
          }
        }
        if (best) this.select(best);
      };

      this.track.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        dragging = true;
        this.preload();
        if (this.track.setPointerCapture) this.track.setPointerCapture(event.pointerId);
        pick(event.clientX);
      });

      this.track.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        event.preventDefault();
        pick(event.clientX);
      });

      const stop = (event) => {
        if (!dragging) return;
        dragging = false;
        if (this.track.releasePointerCapture && event.pointerId !== undefined) {
          try {
            this.track.releasePointerCapture(event.pointerId);
          } catch (error) {
            /* the pointer was already gone */
          }
        }
      };
      this.track.addEventListener('pointerup', stop);
      this.track.addEventListener('pointercancel', stop);
    }

    select(step) {
      if (!step || step === this.current) return;
      this.current = step;

      for (const other of this.steps) {
        const on = other === step;
        other.setAttribute('aria-checked', on ? 'true' : 'false');
        other.tabIndex = on ? 0 : -1;
        other.classList.toggle('is-active', on);
      }

      const label = step.dataset.skinToneLabel || '';
      if (this.caption && this.captionTemplate) {
        this.caption.textContent = this.captionTemplate.replace('[tone]', label);
      }

      this.show(step.dataset.skinToneSrc, step.dataset.skinToneAlt || '');
    }

    show(src, alt) {
      if (!src || this.front.getAttribute('src') === src) return;

      const incoming = this.back;
      const outgoing = this.front;
      incoming.alt = alt;
      incoming.removeAttribute('aria-hidden');
      incoming.src = src;

      const reveal = () => {
        incoming.classList.add('is-shown');
        outgoing.classList.remove('is-shown');
        outgoing.alt = '';
        outgoing.setAttribute('aria-hidden', 'true');
        this.front = incoming;
        this.back = outgoing;
      };

      if (incoming.decode) {
        incoming.decode().then(reveal, reveal);
      } else {
        reveal();
      }
    }

    /* Variant gating ------------------------------------------------------------------ */

    variantSkus() {
      if (this.skus) return this.skus;
      const rows = parseJSON(this.root.querySelector('script[data-skin-tone-variants]')) || [];
      this.skus = new Map(rows.map((row) => [String(row.id), String(row.sku || '').toLowerCase()]));
      return this.skus;
    }

    terms() {
      return (this.root.dataset.skuMatch || '')
        .toLowerCase()
        .split(',')
        .map((term) => term.trim())
        .filter(Boolean);
    }

    selectedVariantId() {
      const form = document.querySelector('product-info [name="id"], form [name="id"]');
      return form ? String(form.value || '') : '';
    }

    applyVariant(variantId) {
      const terms = this.terms();
      if (!terms.length) return;
      const sku = this.variantSkus().get(String(variantId));
      /* No SKU for this id means the map does not cover the form on the page -- a quick-add
         drawer, say. Leave the tile as the template rendered it rather than hiding it. */
      if (sku === undefined) return;
      this.root.hidden = !terms.some((term) => sku.indexOf(term) !== -1);
    }

    bindVariant() {
      document.addEventListener('variant:update', (event) => {
        const variant = event.detail && event.detail.resource;
        if (!variant || !variant.id) return;
        this.applyVariant(variant.id);
      });
    }
  }

  function init() {
    for (const root of document.querySelectorAll('[data-skin-tone]')) {
      if (root.dataset.skinToneReady) continue;
      root.dataset.skinToneReady = 'true';
      new SkinTonePreview(root);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
