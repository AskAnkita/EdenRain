/*
 * Option swatches on product cards — metals and diamond shapes
 * (blocks/_card-product-metals.liquid, blocks/_card-product-shapes.liquid).
 *
 * The two rows pick different options of the same product, so a click is read as a
 * change to one axis of a combined selection: choosing Pear keeps the metal already
 * chosen, choosing Rose Gold keeps the shape. The card's variant JSON (the
 * <template data-json-product> the card block renders) is searched for the variant
 * that matches both, and the card's photo, links and both rows' active states are
 * moved onto it. Delegated from the document so cards that arrive later — filtering,
 * pagination, quick view — work without rebinding.
 *
 * A card that is not built from the theme's card blocks joins by marking itself: the
 * favourites carousel's panels carry `data-swatch-card` on the panel and
 * `data-swatch-media` on the box its photo sits in, plus the same variant JSON.
 */
(function () {
  const CARD_SELECTOR = '[data-product-card-id], .card-wrapper, [data-swatch-card]';
  const SRCSET_WIDTHS = [240, 352, 650, 832, 1200];
  const DISPLAY_WIDTH = 832;
  const SHAPES = [
    'round',
    'oval',
    'cushion',
    'emerald',
    'princess',
    'radiant',
    'asscher',
    'heart',
    'marquise',
    'pear',
  ];

  const variantCache = new WeakMap();
  const selectionCache = new WeakMap();
  const mediaCache = new WeakMap();

  /*
   * The same collapsing the Liquid blocks do, so a swatch's key matches the option
   * value on a variant: every karat of white gold is "wg", "Pear Shape" is "pear".
   */
  function handleize(text) {
    return text
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalize(role, value) {
    const text = String(value == null ? '' : value).toLowerCase();
    if (!text) return '';
    if (role === 'shape') {
      const match = SHAPES.find((shape) => text.indexOf(shape) !== -1);
      return match || handleize(text);
    }
    if (text.indexOf('rose') !== -1 || text.indexOf('pink') !== -1) return 'rg';
    if (text.indexOf('white') !== -1) return 'wg';
    if (text.indexOf('yellow') !== -1) return 'yg';
    if (text.indexOf('platinum') !== -1) return 'pl';
    if (text.indexOf('silver') !== -1) return 'ss';
    if (text.indexOf('gold') !== -1) return 'yg';
    return handleize(text);
  }

  function primaryImage(card) {
    const own = card.querySelector('[data-swatch-media] > img');
    if (own) return own;
    const media = card.querySelector('.card__media .media');
    return media ? media.querySelector(':scope > img') : null;
  }

  /*
   * The card's product data. A per-shape copy is sent without its own (the section strips
   * it to keep the page light) and reads the one on its product's main card.
   */
  function jsonHolder(card) {
    let template = card.querySelector('template');
    if (!template) {
      const item = card.closest('[data-card-shape]');
      const id = item && item.getAttribute('data-product-id');
      const grid = item && item.parentElement;
      const main = id && grid && grid.querySelector(':scope > [data-product-id="' + id + '"]:not([data-card-shape])');
      template = main && main.querySelector('template');
    }
    return template ? template.content.querySelector('[data-json-product]') : null;
  }

  function cardVariants(card) {
    if (variantCache.has(card)) return variantCache.get(card);
    let list = [];
    const holder = jsonHolder(card);
    if (holder) {
      try {
        const data = JSON.parse(holder.getAttribute('data-json-product'));
        if (data && Array.isArray(data.variants)) list = data.variants;
      } catch (error) {
        /* fall back to the image baked into the swatch */
      }
    }
    variantCache.set(card, list);
    return list;
  }

  function selections(card) {
    let current = selectionCache.get(card);
    if (!current) {
      current = new Map();
      // Seed from whatever the card rendered as active, so the first click on one
      // row keeps the other row's value instead of snapping back to the default.
      card.querySelectorAll('[data-card-swatch]').forEach((button) => {
        if (button.getAttribute('aria-pressed') !== 'true') return;
        const index = Number(button.dataset.swatchOptionIndex);
        if (!Number.isInteger(index) || index < 0) return;
        current.set(index, { role: button.dataset.swatchRole, key: button.dataset.swatchKey });
      });
      selectionCache.set(card, current);
    }
    return current;
  }

  function variantImageSrc(variant) {
    const image = variant && variant.featured_image;
    const src = image && (image.src || image.url);
    return src || '';
  }

  function sizedUrl(src, width) {
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set('width', String(width));
      return url.href;
    } catch (error) {
      return src;
    }
  }

  /*
   * The variant that matches the most of the current selection, and always the axis
   * just clicked. A product whose photos only cover some combinations still moves to
   * something sensible rather than ignoring the click.
   */
  function resolveVariant(card, requiredIndex) {
    const chosen = selections(card);
    const candidates = cardVariants(card).filter((variant) => variantImageSrc(variant));
    if (!candidates.length) return null;

    let best = null;
    let bestScore = -1;
    candidates.forEach((variant) => {
      const options = variant.options || [];
      let score = 0;
      let eligible = true;
      chosen.forEach((selection, index) => {
        const matches = normalize(selection.role, options[index]) === selection.key;
        if (matches) {
          score += 1;
        } else if (index === requiredIndex) {
          eligible = false;
        }
      });
      if (eligible && score > bestScore) {
        bestScore = score;
        best = variant;
      }
    });
    return best;
  }

  function setImage(img, src, srcset, alt) {
    img.setAttribute('src', src);
    if (srcset) {
      img.setAttribute('srcset', srcset);
    } else {
      img.removeAttribute('srcset');
    }
    // "#Jewelry material_Gold" is the metal-grouping tag, not a description: keep the card's own alt.
    if (alt && alt.trim().charAt(0) !== '#') img.setAttribute('alt', alt);
  }

  // `hover` is { src, srcset } for the chosen variant's own second photo, or null.
  function showImage(card, src, srcset, alt, hover) {
    const img = primaryImage(card);
    if (!img || !src) return;
    setImage(img, src, srcset, alt);
    const media = img.parentElement;
    const hoverImg = img.nextElementSibling instanceof HTMLImageElement ? img.nextElementSibling : null;
    if (hover && hoverImg) {
      setImage(hoverImg, hover.src, hover.srcset, '');
      if (media) media.classList.remove('is-swatch-selected');
      return;
    }
    // No second photo of the chosen variant: the hover image still shows the card's
    // default variant, so hold it back.
    if (media) media.classList.add('is-swatch-selected');
  }

  function cardMedia(card) {
    if (mediaCache.has(card)) return mediaCache.get(card);
    let list = [];
    const holder = jsonHolder(card);
    if (holder) {
      try {
        const data = JSON.parse(holder.getAttribute('data-json-product'));
        if (data && Array.isArray(data.media)) list = data.media.filter((item) => item.media_type === 'image');
      } catch (error) {
        /* no hover swap without the media list */
      }
    }
    mediaCache.set(card, list);
    return list;
  }

  function mediaSrc(item) {
    return item.src || (item.preview_image && item.preview_image.src) || '';
  }

  function srcsetFor(src, width) {
    return SRCSET_WIDTHS.filter((candidate) => !width || candidate <= width)
      .map((candidate) => sizedUrl(src, candidate) + ' ' + candidate + 'w')
      .join(', ');
  }

  /*
   * The hover photo for a variant: the next photo in the same alt group. Every render
   * of a shape-and-metal pair shares one alt ("#Jewelry material_Pear Rose gold"), so
   * the photo after the variant's own is another angle of the same ring.
   */
  function hoverFor(card, variant) {
    const featured = variant.featured_image;
    if (!featured) return null;
    const list = cardMedia(card);
    const index = list.findIndex(
      (item) => item.position === featured.position || (featured.id && item.id === featured.id)
    );
    if (index === -1) return null;
    const group = (list[index].alt || '').trim().toLowerCase();
    if (!group) return null;
    const sameGroup = (item) => (item.alt || '').trim().toLowerCase() === group;
    const next = list.slice(index + 1).find(sameGroup) || list.slice(0, index).find(sameGroup);
    const src = next && mediaSrc(next);
    if (!src) return null;
    const width = (next.preview_image && next.preview_image.width) || next.width || 0;
    return { src: sizedUrl(src, DISPLAY_WIDTH), srcset: srcsetFor(src, width) };
  }

  function showVariantImage(card, variant) {
    const src = variantImageSrc(variant);
    if (!src) return;
    const width = (variant.featured_image && variant.featured_image.width) || 0;
    const alt = (variant.featured_image && variant.featured_image.alt) || '';
    showImage(card, sizedUrl(src, DISPLAY_WIDTH), srcsetFor(src, width), alt, hoverFor(card, variant));
  }

  function updateLinks(card, variantId) {
    if (!variantId) return;
    card.querySelectorAll('a[href*="/products/"]').forEach((link) => {
      try {
        const url = new URL(link.href, window.location.origin);
        url.searchParams.set('variant', variantId);
        link.href = url.pathname + url.search + url.hash;
      } catch (error) {
        /* leave the link alone if it isn't parseable */
      }
    });
  }

  function markActive(list, active) {
    list.querySelectorAll('.is-active').forEach((item) => item.classList.remove('is-active'));
    list.querySelectorAll('[data-card-swatch]').forEach((button) => {
      button.setAttribute('aria-pressed', button === active ? 'true' : 'false');
    });
    const item = active && active.closest('li');
    if (item) item.classList.add('is-active');
  }

  /*
   * Both rows follow the variant actually on screen, so the underlined shape and the
   * underlined metal always describe the photo — including when the chosen pair has
   * no photo of its own and the lookup landed somewhere nearby.
   */
  function syncRows(card, variant) {
    const options = variant.options || [];
    const chosen = selections(card);
    card.querySelectorAll('.card-metals, .card-shapes').forEach((list) => {
      const buttons = Array.from(list.querySelectorAll('[data-card-swatch]'));
      if (!buttons.length) return;
      const match = buttons.find((button) => {
        const index = Number(button.dataset.swatchOptionIndex);
        if (!Number.isInteger(index) || index < 0) return false;
        return normalize(button.dataset.swatchRole, options[index]) === button.dataset.swatchKey;
      });
      if (!match) return;
      markActive(list, match);
      chosen.set(Number(match.dataset.swatchOptionIndex), {
        role: match.dataset.swatchRole,
        key: match.dataset.swatchKey,
      });
    });
  }

  function select(button) {
    const card = button.closest(CARD_SELECTOR);
    if (!card) return;

    const index = Number(button.dataset.swatchOptionIndex);
    const hasOption = Number.isInteger(index) && index >= 0;
    if (hasOption) {
      selections(card).set(index, { role: button.dataset.swatchRole, key: button.dataset.swatchKey });
    }

    const variant = hasOption ? resolveVariant(card, index) : null;
    if (variant) {
      showVariantImage(card, variant);
      updateLinks(card, variant.id);
      syncRows(card, variant);
      return;
    }

    // No variant JSON on the card (or nothing matched): fall back to the single
    // image the swatch carries.
    const list = button.closest('.card-metals, .card-shapes');
    if (list) markActive(list, button);
    showImage(card, button.dataset.swatchSrc, button.dataset.swatchSrcset, button.dataset.swatchAlt);
    updateLinks(card, button.dataset.swatchVariant);
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-card-swatch]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    select(button);
  });

  /*
   * Per-shape copies of a card (sections/main-collection-product-grid-banner-adv.liquid
   * marks them data-card-shape="<cut>"). The card blocks only know the product, so the
   * copy arrives drawn in the product's own cut; pressing its cut's icon here moves the
   * photo, links and rows onto that cut. A copy whose cut has no icon button left to
   * press would only repeat the original card, so it is removed.
   */
  function applyCardShapes(root) {
    const items = (root || document).querySelectorAll('[data-card-shape]:not([data-card-shape-ready])');
    items.forEach((item) => {
      item.setAttribute('data-card-shape-ready', '');
      const key = item.getAttribute('data-card-shape');
      const button = Array.from(item.querySelectorAll('[data-card-swatch][data-swatch-role="shape"]')).find(
        (candidate) => candidate.dataset.swatchKey === key
      );
      if (!button) {
        item.remove();
        return;
      }
      select(button);
      applyCardMetal(item, button);
    });
  }

  /*
   * Copies also carry data-card-metal (yg / wg / rg, rotated in the section) so a
   * product's cuts do not all open on the same metal. The metal is only pressed when
   * this cut has a photo in it — otherwise the lookup would drift onto another cut and
   * the copy would repeat a different card — and the next tone is tried instead.
   */
  const TONE_CYCLE = ['yg', 'wg', 'rg'];

  function applyCardMetal(item, shapeButton) {
    const wanted = item.getAttribute('data-card-metal');
    if (!wanted) return;
    const card = shapeButton.closest(CARD_SELECTOR);
    if (!card) return;
    const shapeIndex = Number(shapeButton.dataset.swatchOptionIndex);
    const shapeKey = shapeButton.dataset.swatchKey;
    const metalButtons = Array.from(card.querySelectorAll('[data-card-swatch][data-swatch-role="metal"]'));
    if (!metalButtons.length) return;
    const photographed = cardVariants(card).filter(
      (variant) =>
        variantImageSrc(variant) && normalize('shape', (variant.options || [])[shapeIndex]) === shapeKey
    );
    const start = Math.max(0, TONE_CYCLE.indexOf(wanted));
    for (let step = 0; step < TONE_CYCLE.length; step += 1) {
      const tone = TONE_CYCLE[(start + step) % TONE_CYCLE.length];
      const metalButton = metalButtons.find((candidate) => candidate.dataset.swatchKey === tone);
      if (!metalButton) continue;
      const metalIndex = Number(metalButton.dataset.swatchOptionIndex);
      const hasPhoto = photographed.some(
        (variant) => normalize('metal', (variant.options || [])[metalIndex]) === tone
      );
      if (!hasPhoto) continue;
      if (metalButton.getAttribute('aria-pressed') !== 'true') select(metalButton);
      return;
    }
  }

  let pending = false;
  function scheduleApply() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      applyCardShapes(document);
    });
  }

  applyCardShapes(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyCardShapes(document), { once: true });
  }
  // Filtering, sorting and infinite scroll swap grid items in after load.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node instanceof Element &&
          (node.matches('[data-card-shape]') || node.querySelector('[data-card-shape]'))
        ) {
          scheduleApply();
          return;
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
