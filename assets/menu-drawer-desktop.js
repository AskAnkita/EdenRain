/* Desktop mega menu: opens full-width under the header. Markup: snippets/header-menu-drawer-panel.liquid */
(function () {
  if (window.__edenMenuDrawer) return;
  window.__edenMenuDrawer = true;

  const HOVER_DELAY = 120;
  const CLOSE_DELAY = 200;
  const desktop = window.matchMedia('(min-width: 990px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let activeRoot = null;
  let activeTrigger = null;
  let openTimer = null;
  let closeTimer = null;

  function init() {
    // Fixed-position panels must not live inside the (transformed, sticky) header
    document.querySelectorAll('[data-menu-drawer-root]').forEach((root) => {
      if (root.parentElement !== document.body) document.body.appendChild(root);
      // Clicking the dimmed area behind the panel closes it
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-menu-drawer-close]')) close();
      });
      root.querySelector('.menu-drawer-desktop__sheet')?.addEventListener('mouseenter', cancelClose);
      root.querySelector('.menu-drawer-desktop__sheet')?.addEventListener('mouseleave', scheduleClose);

      root.querySelectorAll('[data-menu-drawer-category]').forEach((button) => {
        const activate = () => showGroup(button);
        button.addEventListener('mouseenter', activate);
        button.addEventListener('click', activate);
        button.addEventListener('focus', activate);
      });

      root.querySelectorAll('[data-menu-drawer-video]').forEach((button) => {
        button.addEventListener('click', () => {
          const video = button.closest('.menu-drawer-desktop__feature')?.querySelector('video');
          if (!video) return;
          // A visitor who pauses a card keeps it paused for the rest of the visit, even
          // after switching tabs and coming back
          if (video.paused) {
            delete video.dataset.menuDrawerPaused;
            video.play().catch(() => {});
          } else {
            video.dataset.menuDrawerPaused = 'true';
            video.pause();
          }
          markToggle(button, video);
        });
      });

      root.querySelectorAll('[data-menu-drawer-product]').forEach((button) => {
        const activate = () => showProduct(button);
        button.addEventListener('mouseenter', activate);
        button.addEventListener('click', activate);
        button.addEventListener('focus', activate);
      });
    });

    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((trigger) => {
      // The panel opens on hover, so a click is left to follow the link to the menu item's page.
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
    // The header is sticky, so the panel's top edge moves while the page scrolls
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });
    desktop.addEventListener('change', () => !desktop.matches && close());
  }

  function reposition() {
    if (activeRoot) positionRoot(activeRoot, activeTrigger);
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
    const firstProduct = page.querySelector('button[data-menu-drawer-product]');
    const firstCategory = page.querySelector('button[data-menu-drawer-category]');
    if (firstProduct) showProduct(firstProduct);
    else if (firstCategory) showGroup(firstCategory);

    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((t) => t.setAttribute('aria-expanded', String(t === trigger)));

    positionRoot(root, trigger);
    if (root.hidden) {
      root.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    }
    activeRoot = root;
    activeTrigger = trigger;
    // after activeRoot, which is what syncVideos reads to tell an open panel from a closed one
    syncVideos(page);
  }

  function showGroup(button) {
    const page = button.closest('[data-menu-drawer-page]');
    const groupId = button.dataset.menuDrawerCategory;
    page.querySelectorAll('[data-menu-drawer-category]').forEach((b) => b.classList.toggle('is-active', b === button));
    page.querySelectorAll('[data-menu-drawer-group]').forEach((g) => (g.hidden = g.dataset.menuDrawerGroup !== groupId));
    syncVideos(page);
  }

  function markToggle(button, video) {
    button.classList.toggle('is-paused', video.paused);
    const caption = (button.getAttribute('aria-label') || '').replace(/^(Play|Pause) video, /, '');
    button.setAttribute('aria-label', `${video.paused ? 'Play' : 'Pause'} video, ${caption}`);
  }

  // The featured cards are the only videos in the menu. They carry preload="none" and are
  // left alone until their tab is open, so a menu nobody opens costs no bandwidth, and a
  // tab the visitor has left stops rather than playing on out of sight.
  function syncVideos(scope) {
    (scope || document).querySelectorAll('[data-menu-drawer-group] video').forEach((video) => {
      const group = video.closest('[data-menu-drawer-group]');
      const page = video.closest('[data-menu-drawer-page]');
      const visible = group && !group.hidden && page && !page.hidden && activeRoot;
      const toggle = video.closest('.menu-drawer-desktop__feature')?.querySelector('[data-menu-drawer-video]');

      if (!visible || reducedMotion.matches || video.dataset.menuDrawerPaused) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
      if (toggle) markToggle(toggle, video);
    });
  }

  function showProduct(button) {
    const page = button.closest('[data-menu-drawer-page]');
    const groupId = button.dataset.menuDrawerProduct;
    page.querySelectorAll('[data-menu-drawer-product]').forEach((item) => {
      const isActive = item === button;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
    page.querySelectorAll('[data-menu-drawer-product-group]').forEach((group) => {
      group.hidden = group.dataset.menuDrawerProductGroup !== groupId;
    });
  }

  function close(immediate = false) {
    clearTimeout(openTimer);
    cancelClose();
    const root = activeRoot;
    if (!root) return;
    document.querySelectorAll('[data-menu-drawer-trigger]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
    root.classList.remove('is-open');
    activeRoot = null;
    root.querySelectorAll('video').forEach((video) => video.pause());
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
