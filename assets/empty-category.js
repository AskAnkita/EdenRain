/*
  <empty-category-page> - the category page a dead /collections/<handle> URL shows.

  Shopify rewrites the path before it renders the 404 template: by then `request.path` is "/404"
  and the handle the shopper asked for is gone from every Liquid object, so the heading cannot be
  written on the server. The browser still has the URL, which is what this reads.

  The element is rendered by snippets/empty-category.liquid inside sections/main-404.liquid, next
  to the 404's own blocks, and neither is visible until this script decides which one it is:

  - a path with /collections/<handle> in it puts `is-empty-category` on <html>, which shows this
    element and hides the 404 beside it, and fills in the heading, the breadcrumb and the tab
    title from the handle;
  - any other dead URL - a product, a page, an article - leaves the class off, so the ordinary
    404 shows and this element stays hidden. assets/empty-category.css is where both are decided.

  With JavaScript off or blocked, the class is never added and the 404 stands, which is why the
  404's blocks are still rendered rather than replaced.

  The heading is title case over the handle's words - "plain-metal-wedding-bands" becomes "Plain
  Metal Wedding Bands" - and `shape-` and `stone-` handles are named the way
  scripts/shopify/store-config.mjs names those collections. Keep this in step with the Liquid in
  snippets/empty-category.liquid, which spells a real collection's title the same way.
*/

const SKIP_HANDLES = ['all', 'types', 'vendors'];

function handleFromPath(pathname) {
  const match = /\/collections\/([^/?#]+)/.exec(pathname || '');
  if (!match) return '';
  let handle = '';
  try {
    handle = decodeURIComponent(match[1]);
  } catch (error) {
    handle = match[1];
  }
  handle = handle.trim().toLowerCase();
  if (!handle || SKIP_HANDLES.indexOf(handle) !== -1) return '';
  return handle;
}

function titleFromHandle(handle) {
  const words = handle.replace(/_/g, '-').split('-').filter(Boolean);
  if (!words.length) return '';
  const lead = words[0];
  const rest = lead === 'shape' || lead === 'stone' ? words.slice(1) : words;
  const spelled = rest.map((word) => {
    if (word === 'jewelry' || word === 'jewellery') return 'Jewellery';
    if (word === 'and') return '&';
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  let title = spelled.join(' ');
  if (lead === 'shape') title += ' Shape Jewellery';
  if (lead === 'stone') title += ' Jewellery';
  return title.trim();
}

class EmptyCategoryPage extends HTMLElement {
  connectedCallback() {
    this.handle = handleFromPath(window.location.pathname);
    this.categoryTitle = this.handle ? titleFromHandle(this.handle) : '';
    // No handle, or nothing that can be made into a heading: leave the 404 showing rather than
    // put up a category page with no category on it.
    if (!this.categoryTitle) return;

    // Before anything is painted, so the 404 never flashes up behind this.
    document.documentElement.classList.add('is-empty-category');
    this.measure();
    window.addEventListener('resize', this.measure, { passive: true });

    if (this.querySelector('[data-empty-category-title]')) {
      this.fill();
    } else {
      // The element is upgraded as the parser reaches its opening tag, so on a cold cache its
      // own children may not exist yet.
      document.addEventListener('DOMContentLoaded', () => this.fill(), { once: true });
    }
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.measure);
  }

  /*
    The band runs the full width of the window while this element sits inside the section's
    page-width column, so the width has to be measured rather than written as 100vw: 100vw
    counts the scrollbar, and a band 15px wider than the window gives the whole page a
    horizontal scroll. documentElement.clientWidth does not count it.
  */
  measure = () => {
    this.style.setProperty('--ec-viewport', `${document.documentElement.clientWidth}px`);
  };

  fill() {
    const title = this.categoryTitle;

    const heading = this.querySelector('[data-empty-category-title]');
    if (heading) heading.textContent = title;

    const crumb = this.querySelector('[data-empty-category-crumb]');
    if (crumb) crumb.textContent = title;

    document.title = [title, document.title.split(/\s[–|-]\s/).pop()].filter(Boolean).join(' – ');

    this.fillParent(title);
  }

  // The nearest family collection that is in the store and has something in it. Liquid wrote the
  // list, so a family the store does not stock is never offered.
  fillParent(title) {
    const link = this.querySelector('[data-empty-category-parent]');
    if (!link || this.dataset.showParent === 'false') return;

    let families = [];
    try {
      families = JSON.parse(this.dataset.families || '[]');
    } catch (error) {
      families = [];
    }

    const family = families.find(
      (candidate) =>
        candidate.handle !== this.handle &&
        (candidate.words || []).some((word) => this.handle.indexOf(word) !== -1)
    );
    if (!family) return;

    const prefix = this.dataset.parentPrefix || 'Shop';
    const label = link.querySelector('[data-empty-category-parent-label]');
    if (label) label.textContent = `${prefix} ${family.label}`.trim();
    link.href = family.url;
    link.setAttribute('aria-label', `${prefix} ${family.label}`.trim());
    link.removeAttribute('hidden');
    link.dataset.emptyCategoryFor = title;
  }
}

if (!customElements.get('empty-category-page')) {
  customElements.define('empty-category-page', EmptyCategoryPage);
}
