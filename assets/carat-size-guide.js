/*
 * Centre-stone carat size guide.
 *
 * The renderer supplies a handful of anchor renders per shape -- typically 1 ct, 3 ct and
 * 5 ct -- rather than one render per step on the track. For any carat in between, the
 * nearest anchor is scaled: a diamond's linear size grows with the cube root of its
 * weight, so a 5 ct stone is only (5/3)^(1/3) = 1.19x as wide across as a 3 ct one, not
 * 1.67x. Scaling by that factor is dimensionally correct, which is the whole point of the
 * tile -- it is a size guide, and the setting in the picture is explicitly "for reference
 * only" (same wording the trade uses, because the ring shown is not the ring sold).
 *
 * The ring render is its own layer over a fixed hand photo, so scaling moves the stone and
 * leaves the hand alone. A shape with no hand photo behind it falls back to showing the
 * nearest anchor full-bleed with no scaling, which still works, just in coarser steps.
 *
 * The shape follows the product's own Shape/Cut option where it has one: the theme fires
 * `variant:update` on every swatch press and the selected variant names its shape, so the
 * guide re-points at the matching block without a reload.
 */
(function () {
  /** Pick the anchor needing the smallest scale, measured as a ratio rather than a gap:
      going 1 -> 2 ct is a bigger visual jump than 4 -> 5 ct. */
  function nearestAnchor(anchors, carat) {
    let best = null;
    let bestCost = Infinity;
    for (const anchor of anchors) {
      if (!(anchor.ct > 0)) continue;
      const cost = Math.abs(Math.log(carat / anchor.ct));
      if (cost < bestCost) {
        bestCost = cost;
        best = anchor;
      }
    }
    return best;
  }

  function preload(anchors) {
    for (const anchor of anchors) {
      if (!anchor.src || anchor.loaded) continue;
      anchor.loaded = true;
      const img = new Image();
      if (anchor.srcset) img.srcset = anchor.srcset;
      img.src = anchor.src;
    }
  }

  class CaratGuide {
    constructor(root) {
      this.root = root;
      this.shapes = this.readConfig();
      if (!this.shapes) return;

      this.base = root.querySelector('[data-carat-base]');
      this.ring = root.querySelector('[data-carat-ring]');
      this.caption = root.querySelector('[data-carat-readout]');
      this.steps = Array.from(root.querySelectorAll('[data-carat-step]'));
      this.captionTemplate = root.dataset.caratCaption || '';
      this.optionIndex = parseInt(root.dataset.shapeOptionIndex, 10);

      this.shape = this.shapes[root.dataset.defaultShape] ? root.dataset.defaultShape : Object.keys(this.shapes)[0];
      this.carat = this.steps.find((step) => step.getAttribute('aria-checked') === 'true') || this.steps[0];

      this.bindSteps();
      this.bindVariant();
      this.render();
    }

    readConfig() {
      const json = this.root.querySelector('script[data-carat-shapes]');
      if (!json) return null;
      try {
        const parsed = JSON.parse(json.textContent);
        return Object.keys(parsed).length ? parsed : null;
      } catch (error) {
        return null;
      }
    }

    bindSteps() {
      for (const step of this.steps) {
        step.addEventListener('click', () => this.select(step));
        step.addEventListener('keydown', (event) => {
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
          if (!delta) return;
          event.preventDefault();
          const next = this.steps[this.steps.indexOf(step) + delta];
          if (!next) return;
          this.select(next);
          next.focus();
        });
      }
    }

    /* The shape option's value is free text ("Emerald Cut"), so match it against the block
       keys the section printed rather than expecting an exact key. */
    shapeFromValue(value) {
      const text = String(value || '').toLowerCase();
      if (!text) return null;
      for (const key of Object.keys(this.shapes)) {
        if (text.indexOf(key) !== -1) return key;
      }
      return null;
    }

    bindVariant() {
      if (!(this.optionIndex >= 0)) return;
      document.addEventListener('variant:update', (event) => {
        const variant = event.detail && event.detail.resource;
        if (!variant || !variant.options) return;
        const key = this.shapeFromValue(variant.options[this.optionIndex]);
        if (!key || key === this.shape) return;
        this.shape = key;
        this.render();
      });
    }

    select(step) {
      if (step === this.carat) return;
      this.carat = step;
      this.render();
    }

    render() {
      const shape = this.shapes[this.shape];
      if (!shape || !this.carat) return;

      const carat = parseFloat(this.carat.dataset.caratValue);
      const label = this.carat.dataset.caratLabel || this.carat.textContent.trim();

      for (const step of this.steps) {
        const on = step === this.carat;
        step.setAttribute('aria-checked', on ? 'true' : 'false');
        step.tabIndex = on ? 0 : -1;
        step.classList.toggle('is-active', on);
      }

      if (this.caption && this.captionTemplate) {
        this.caption.textContent = this.captionTemplate.replace('[ct]', label);
      }

      preload(shape.anchors);
      const anchor = nearestAnchor(shape.anchors, carat);
      if (!anchor) return;

      const flat = !shape.base;
      this.root.classList.toggle('carat-guide--flat', flat);

      if (this.base) {
        this.base.hidden = flat;
        if (!flat && this.base.getAttribute('src') !== shape.base) {
          this.base.src = shape.base;
          if (shape.baseSrcset) this.base.srcset = shape.baseSrcset;
        }
      }

      if (!this.ring) return;
      if (this.ring.getAttribute('src') !== anchor.src) {
        this.ring.src = anchor.src;
        if (anchor.srcset) this.ring.srcset = anchor.srcset;
      }
      this.ring.alt = (shape.alt || '').replace('[ct]', label);

      if (flat) {
        this.ring.style.cssText = '';
        return;
      }

      const scale = Math.cbrt(carat / anchor.ct);
      this.ring.style.left = shape.originX + '%';
      this.ring.style.top = shape.originY + '%';
      this.ring.style.width = shape.width + '%';
      this.ring.style.transform = 'translate(-50%, -50%) scale(' + scale.toFixed(4) + ')';
    }
  }

  function init() {
    for (const root of document.querySelectorAll('[data-carat-guide]')) {
      if (root.dataset.caratReady) continue;
      root.dataset.caratReady = 'true';
      new CaratGuide(root);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
