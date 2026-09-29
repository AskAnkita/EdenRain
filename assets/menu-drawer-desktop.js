/* Desktop menu drawer (MiaDonna-style). Markup: snippets/header-menu-drawer-panel.liquid */
(function () {
  if (window.__edenMenuDrawer) return;
  window.__edenMenuDrawer = true;

  const HOVER_DELAY = 120;
  const CLOSE_DELAY = 200;
  const desktop = window.matchMedia('(min-width: 990px)');

  let activeRoot = null;
  let activeTrigger = null;
  let openTimer = null;
  let closeTimer = null;

  function init() {
    // Fixed-position drawers must not live inside the (transformed, sticky) header
    document.querySelectorAll('[data-menu-drawer-root]').forEach((root) => {
      if (root.parentElement !== document.body) document.body.appendChild(root);
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-menu-drawer-close]')) close();
      });
      root.querySelector('.menu-drawer-desktop__overlay')?.addEventListener('mouseenter', scheduleClose);
      root.querySelector('.menu-drawer-desktop__sheet')?.addEventListener('mouseenter', cancelClose);

      root.querySelectorAll('[data-menu-drawer-category]').forEach((button) => {
        const activate = () => showGroup(button);
        button.addEventListener('mouseenter', activate);
        button.addEventListener('click', activate);
        button.addEventListener('focus', activate);
      });
    });

    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        if (!desktop.matches) return;
        event.preventDefault();
        if (activeTrigger === trigger) close();
        else open(trigger);
      });
      trigger.addEventListener('mouseenter', () => {
        if (!desktop.matches) return;
        cancelClose();
        clearTimeout(openTimer);
        openTimer = setTimeout(() => open(trigger), activeRoot ? 0 : HOVER_DELAY);
      });
      trigger.addEventListener('mouseleave', () => clearTimeout(openTimer));
    });

    // Hovering a plain (no-drawer) header link closes the drawer
    document.querySelectorAll('.header__inline-menu .header__menu-item:not([data-menu-drawer-trigger])').forEach((link) => {
      link.addEventListener('mouseenter', () => activeRoot && scheduleClose());
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && activeRoot) {
        const trigger = activeTrigger;
        close();
        trigger?.focus();
      }
    });
    window.addEventListener('resize', () => activeRoot && positionRoot(activeRoot, activeTrigger));
    desktop.addEventListener('change', () => !desktop.matches && close());
  }

  function positionRoot(root, trigger) {
    const header = trigger.closest('header-component, .header, .shopify-section') || trigger;
    const bottom = Math.max(0, header.getBoundingClientRect().bottom);
    root.style.setProperty('--menu-drawer-top', `${Math.round(bottom)}px`);
  }

  function open(trigger) {
    const pageId = trigger.dataset.menuDrawerTrigger;
    const page = document.getElementById(pageId);
    if (!page) return;
    const root = page.closest('[data-menu-drawer-root]');

    if (activeRoot && activeRoot !== root) close(true);
    cancelClose();

    root.querySelectorAll('[data-menu-drawer-page]').forEach((p) => (p.hidden = p !== page));
    const firstCategory = page.querySelector('button[data-menu-drawer-category]');
    if (firstCategory) showGroup(firstCategory);

    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((t) => t.setAttribute('aria-expanded', String(t === trigger)));

    positionRoot(root, trigger);
    if (root.hidden) {
      root.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
      document.documentElement.style.overflow = 'hidden';
    }
    activeRoot = root;
    activeTrigger = trigger;
  }

  function showGroup(button) {
    const page = button.closest('[data-menu-drawer-page]');
    const groupId = button.dataset.menuDrawerCategory;
    page.querySelectorAll('[data-menu-drawer-category]').forEach((b) => b.classList.toggle('is-active', b === button));
    page.querySelectorAll('[data-menu-drawer-group]').forEach((g) => (g.hidden = g.dataset.menuDrawerGroup !== groupId));
  }

  function close(immediate = false) {
    clearTimeout(openTimer);
    cancelClose();
    const root = activeRoot;
    if (!root) return;
    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
    root.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    activeRoot = null;
    activeTrigger = null;
    if (immediate) {
      root.hidden = true;
    } else {
      setTimeout(() => {
        if (root !== activeRoot) root.hidden = true;
      }, 300);
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => close(), CLOSE_DELAY);
  }

  function cancelClose() {
    clearTimeout(closeTimer);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
