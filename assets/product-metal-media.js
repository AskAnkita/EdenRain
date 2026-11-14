/*
 * Show only the gallery photos that belong to the selected metal.
 *
 * Product media carry Shopify's media-grouping alt text -- "#Jewelry material_Gold",
 * "#Jewelry material_white_gold" -- and every variant's own photo sits in one of those
 * groups. main-product.liquid prints the variant -> group map; this reads each photo's
 * alt and hides the ones from other groups. Media with no "#" alt is never hidden, so a
 * product that does not use the convention keeps its whole gallery.
 */
(function () {
  const ITEM_SELECTOR = [
    '.media-gallery__grid-item',
    '.product-media-container',
    '.dialog-thumbnails-list__thumbnail',
    '.swiper-slide',
  ].join(', ');

  const normalise = (value) => (value || '').trim().toLowerCase();

  /* An item's group, or null when it holds no tagged photo or wraps several groups
     (which means it is an ancestor of the real items, not one of them). */
  function itemGroup(item) {
    let group = null;
    for (const img of item.querySelectorAll('img[alt]')) {
      const alt = normalise(img.alt);
      if (alt.charAt(0) !== '#') continue;
      if (group && group !== alt) return null;
      group = alt;
    }
    return group;
  }

  function variantGroups(section) {
    const json = section.querySelector('script[data-metal-media-groups]');
    if (!json) return null;
    try {
      const map = new Map();
      for (const row of JSON.parse(json.textContent)) {
        map.set(String(row.id), normalise(row.group));
      }
      return map;
    } catch (error) {
      return null;
    }
  }

  function currentVariantId(section) {
    const input = section.querySelector('[name="id"]');
    return input ? String(input.value || '') : '';
  }

  /*
    Swiper cannot skip a hidden slide: it still counts it, so with other metals' photos
    hidden in place the slide numbers and the positions disagree and a tap on a thumbnail
    lands on a photo that is not there - the gallery shows the wrong picture, or none.
    So the slides of other metals are taken out of the carousel altogether (kept here, in
    their original order, to be put back when the metal changes) and Swiper is told.
  */
  const wrapperSlides = new WeakMap();
  const sectionWrappers = new WeakMap();

  function swiperWrappers(section) {
    if (!sectionWrappers.has(section)) sectionWrappers.set(section, new Set());
    const known = sectionWrappers.get(section);
    section.querySelectorAll('.swiper-wrapper').forEach((wrapper) => {
      if (known.has(wrapper)) return;
      const slides = Array.from(wrapper.children).filter((el) => el.classList.contains('swiper-slide'));
      if (!slides.some((slide) => itemGroup(slide) !== null)) return;
      known.add(wrapper);
      wrapperSlides.set(wrapper, slides);
    });
    /* A re-rendered gallery brings new wrappers; forget the ones no longer on the page. */
    for (const wrapper of known) {
      if (!wrapper.isConnected) known.delete(wrapper);
    }
    return known;
  }

  function rebuildSwiper(wrapper, group, filtering) {
    const slides = wrapperSlides.get(wrapper);
    const shown = slides.filter((slide) => !filtering || itemGroup(slide) === null || itemGroup(slide) === group);
    const current = Array.from(wrapper.children).filter((el) => el.classList.contains('swiper-slide'));
    const unchanged = current.length === shown.length && current.every((slide, i) => slide === shown[i]);
    for (const slide of slides) slide.hidden = false;
    if (unchanged) return;

    current.forEach((slide) => slide.remove());
    shown.forEach((slide) => wrapper.appendChild(slide));

    const swiper = wrapper.parentElement && wrapper.parentElement.swiper;
    if (!swiper || swiper.destroyed) return;
    swiper.update();
    swiper.slideTo(0, 0);
  }

  function syncSwipers(section, group, filtering) {
    const wrappers = swiperWrappers(section);
    for (const wrapper of wrappers) rebuildSwiper(wrapper, group, filtering);
    /* The main carousel marks its thumbnail through Swiper's thumbs module; refresh it
       once both carousels hold the same photos. */
    for (const wrapper of wrappers) {
      const swiper = wrapper.parentElement && wrapper.parentElement.swiper;
      if (swiper && !swiper.destroyed && swiper.thumbs && swiper.thumbs.swiper) {
        swiper.thumbs.update(true);
      }
    }
  }

  function apply(section, group) {
    const wrappers = swiperWrappers(section);
    const inSwiper = new Set();
    for (const wrapper of wrappers) wrapperSlides.get(wrapper).forEach((slide) => inSwiper.add(slide));
    const items = Array.from(section.querySelectorAll(ITEM_SELECTOR)).filter((item) => !inSwiper.has(item));
    for (const slide of inSwiper) items.push(slide);
    const tagged = items.filter((item) => itemGroup(item) !== null);
    if (!tagged.length) return;

    const filtering = Boolean(group) && tagged.some((item) => itemGroup(item) === group);

    const shownPerGrid = new Map();
    for (const item of tagged) {
      const show = !filtering || itemGroup(item) === group;
      item.hidden = !show;

      /* The two-column layout makes every third tile full width off :nth-child, which
         counts hidden tiles too. Re-mark the visible ones so the rhythm survives. */
      const grid = item.parentElement;
      if (!grid) continue;
      if (!shownPerGrid.has(grid)) shownPerGrid.set(grid, 0);
      item.classList.remove('media-gallery__grid-item--wide');
      if (!show) continue;
      const index = shownPerGrid.get(grid) + 1;
      shownPerGrid.set(grid, index);
      if (index % 3 === 0) item.classList.add('media-gallery__grid-item--wide');
    }

    for (const grid of shownPerGrid.keys()) {
      grid.classList.toggle('is-metal-filtered', filtering);
    }

    syncSwipers(section, group, filtering);
  }

  function applyForVariant(section, variantId) {
    const groups = variantGroups(section);
    if (!groups) return;
    apply(section, groups.get(String(variantId)) || '');
  }

  function sections() {
    return Array.from(document.querySelectorAll('script[data-metal-media-groups]'))
      .map((json) => json.closest('[data-section]'))
      .filter(Boolean);
  }

  function refresh() {
    for (const section of sections()) applyForVariant(section, currentVariantId(section));
  }

  document.addEventListener('variant:update', (event) => {
    const variant = event.detail && event.detail.resource;
    if (!variant || !variant.id) return;
    for (const section of sections()) applyForVariant(section, variant.id);
    /* The gallery is re-rendered around this event; re-apply once it has settled. */
    requestAnimationFrame(refresh);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
