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
 */
(function () {
  const CARD_SELECTOR = '[data-product-card-id], .card-wrapper';
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
    const media = card.querySelector('.card__media .media');
    return media ? media.querySelector(':scope > img') : null;
  }

  function cardVariants(card) {
    if (variantCache.has(card)) return variantCache.get(card);
    let list = [];
    const template = card.querySelector('template');
    const holder = template && template.content.querySelector('[data-json-product]');
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

  function showImage(card, src, srcset, alt) {
    const img = primaryImage(card);
    if (!img || !src) return;
    img.setAttribute('src', src);
    if (srcset) {
      img.setAttribute('srcset', srcset);
    } else {
      img.removeAttribute('srcset');
    }
    if (alt) img.setAttribute('alt', alt);
    // The hover image belongs to the card's default variant, so hold it back
    // once a swatch has been chosen.
    const media = img.parentElement;
    if (media) media.classList.add('is-swatch-selected');
  }

  function showVariantImage(card, variant) {
    const src = variantImageSrc(variant);
    if (!src) return;
    const width = (variant.featured_image && variant.featured_image.width) || 0;
    const srcset = SRCSET_WIDTHS.filter((candidate) => !width || candidate <= width)
      .map((candidate) => sizedUrl(src, candidate) + ' ' + candidate + 'w')
      .join(', ');
    const alt = (variant.featured_image && variant.featured_image.alt) || '';
    showImage(card, sizedUrl(src, DISPLAY_WIDTH), srcset, alt);
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
})();
