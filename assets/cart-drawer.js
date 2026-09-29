class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.overlay = this.querySelector('[id^="CartDrawer-Overlay"]');
    this.overlay?.addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();

    if (Shopify.designMode) {
      document.addEventListener('shopify:section:select', (e) => {
        if (e.target.matches('.section-cart-drawer')) this.open();
      });

      document.addEventListener('shopify:section:deselect', (e) => {
        if (e.target.matches('.section-cart-drawer')) this.close();
      });
    }
  }

  connectedCallback() {
    if (!this.dataset.moved) {
      this.dataset.moved = true;
      document.body.appendChild(this);
    }

    window.initCartDrawerHeaderHeight?.();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('.cart-icon--drawer');
    cartLink?.setAttribute('role', 'button');
    cartLink?.setAttribute('aria-haspopup', 'dialog');
    cartLink?.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink?.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  #getDrawerDirection() {
    let drawerDirection = this.getAttribute('data-drawer-direction');
    const rtl = typeof theme !== 'undefined' && theme.config && theme.config.rtl === true;

    if (rtl) {
      drawerDirection = drawerDirection === 'left' ? 'right' : 'left';
    }

    return drawerDirection;
  }

  #prepareDrawerAnimationState() {
    const contentElement = this.querySelector('[data-drawer-content]');
    if (!contentElement) return;

    contentElement.getAnimations().forEach((animation) => animation.cancel());

    const drawerDirection = this.#getDrawerDirection();
    contentElement.style.opacity = '0';
    contentElement.style.transform =
      drawerDirection === 'left' ? 'translateX(-100%)' : 'translateX(100%)';
  }

  #waitForNextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  #bindOverlayClose() {
    const overlay = this.querySelector('#CartDrawer-Overlay');
    if (!overlay) return;

    const newOverlay = overlay.cloneNode(true);
    overlay.replaceWith(newOverlay);
    newOverlay.addEventListener('click', () => this.close());
  }

  open(triggeredBy, options = {}) {
    const { deferLayoutMeasure = false } = options;

    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);

    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    const contentElement = this.querySelector('[data-drawer-content]');
    const drawerDirection = this.#getDrawerDirection();

    this.classList.add('open');

    const animation = Motion.timeline([
      [
        contentElement,
        {
          opacity: [0, 1],
          transform:
            drawerDirection === 'left'
              ? ['translateX(-100%)', 'translateX(0)']
              : ['translateX(100%)', 'translateX(0)'],
        },
        { duration: 0.3, easing: [0.61, 0.22, 0.23, 1], at: '-0.05' },
      ],
    ]);

    let openedHandled = false;
    const onDrawerOpened = () => {
      if (openedHandled) return;
      openedHandled = true;

      const containerToTrapFocusOn = this.classList.contains('is-empty')
        ? this.querySelector('.drawer__inner-empty')
        : document.getElementById('CartDrawer');
      const focusElement = this.querySelector('.drawer__close');
      trapFocus(containerToTrapFocusOn, focusElement);
      window.initCartDrawerHeaderHeight?.();
    };

    animation.finished.then(onDrawerOpened);
    this.addEventListener('transitionend', onDrawerOpened, { once: true });

    if (!deferLayoutMeasure) {
      window.scheduleCartDrawerHeaderHeight?.();
    }

    document.body.classList.add('overflow-hidden');
    document.documentElement.setAttribute('scroll-lock', '');
  }

  async close() {
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
    document.documentElement.removeAttribute('scroll-lock');
    const cartDrawerDirection = this.getAttribute("data-drawer-direction");
    const contentElement = this.querySelector("[data-drawer-content]");

    let rtl = typeof theme !== "undefined" && theme.config && theme.config.rtl === true;
    let drawerDirection = cartDrawerDirection;
    
    if (rtl) {
      drawerDirection = drawerDirection === "left" ? "right" : "left";
    }

    await Motion.timeline([
      [
        contentElement,
        {
          opacity: [1, 0],
          transform:
            drawerDirection === "left"
              ? ["translateX(0)", "translateX(-100%)"]
              : ["translateX(0)", "translateX(100%)"],
        },
        { duration: 0.3, easing: [0.61, 0.22, 0.23, 1] },
      ]
    ]).finished;

    this.classList.remove("open");
    this.classList.remove('active');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  async renderContents(parsedState) {
    this.productId = parsedState.id;
    const layoutOptions = { measureHeight: false };
    const recommendationsWrapper = this.querySelector('.drawer__cart-items-recommendations-wrapper');
    let preservedRecommendations = recommendationsWrapper?.innerHTML?.trim() || null;
    if (preservedRecommendations) {
      const preservedDoc = new DOMParser().parseFromString(preservedRecommendations, 'text/html');
      preservedDoc.querySelectorAll('.add-to-cart-button').forEach((button) => {
        button.removeAttribute('aria-disabled');
        button.classList.remove('loading');
        button.querySelector('.loading__spinner')?.classList.add('hidden');
      });
      preservedRecommendations = preservedDoc.body.innerHTML.trim();
    }
    
    const cartDrawerItems = document.querySelector('cart-drawer-items');
    const hasDualCartDrawerLayout = !!document.querySelector('[data-cart-drawer-empty]');
    const cartDrawerSectionKey = parsedState.sections
      ? Object.keys(parsedState.sections).find((key) => key.includes('cart-drawer'))
      : null;

    await Promise.all(
      this.getSectionsToRender().map((section) => {
        if (section.id === 'cart-icon-bubble') {
          return this.updateCartIconBubble(parsedState);
        }

        if (
          section.id === 'cart-drawer' &&
          hasDualCartDrawerLayout &&
          cartDrawerSectionKey &&
          parsedState.sections[cartDrawerSectionKey] &&
          cartDrawerItems?.updateSections
        ) {
          cartDrawerItems.updateSections(parsedState.sections, parsedState, layoutOptions);
          return;
        }

        const sectionElement = section.selector ? document.querySelector(section.selector) : document.getElementById(section.id);
        const sectionHtml =
          parsedState.sections?.[section.id] ||
          (cartDrawerSectionKey ? parsedState.sections[cartDrawerSectionKey] : null);

        if (sectionElement && sectionHtml) {
          sectionElement.innerHTML = this.getSectionInnerHTML(sectionHtml, section.selector);
        }
      })
    );

    if (hasDualCartDrawerLayout && parsedState.item_count !== undefined) {
      window.setCartDrawerEmptyState?.(parsedState.item_count === 0, layoutOptions);
    }

    if (preservedRecommendations) {
      const newRecommendationsWrapper = this.querySelector('.drawer__cart-items-recommendations-wrapper');
      const hasRecommendations = newRecommendationsWrapper?.querySelector('.cart-drawer__recommendations');
      if (newRecommendationsWrapper && !hasRecommendations) {
        newRecommendationsWrapper.innerHTML = preservedRecommendations;
      }
    }

    if (typeof initPurchaseConditions === 'function') {
      initPurchaseConditions(this);
    }

    this.#bindOverlayClose();
    this.#prepareDrawerAnimationState();
    await this.#waitForNextFrame();
    this.open(null, { deferLayoutMeasure: true });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  async updateCartIconBubble(parsedState) {
    const sectionHtml = parsedState.sections?.['cart-icon-bubble'];

    if (sectionHtml) {
      document.querySelectorAll('#cart-icon-bubble').forEach((cartIconBubble) => {
        const cartTrigger = cartIconBubble.closest('button, a');
        const hasCartText = cartTrigger?.querySelector('.cart-text');

        if (!hasCartText) {
          cartIconBubble.innerHTML = this.getSectionInnerHTML(sectionHtml);
        }
      });
    }

    let itemCount = this.getItemCountFromSectionHtml(sectionHtml);

    if (itemCount === undefined && parsedState.item_count !== undefined) {
      itemCount = parsedState.item_count;
    }

    if (itemCount === undefined) {
      try {
        const cart = await fetch('/cart.js').then((response) => response.json());
        itemCount = cart.item_count;
      } catch (e) {
        console.error(e);
      }
    }

    if (itemCount !== undefined) {
      this.updateCartCounts(itemCount);
    }
  }

  getItemCountFromSectionHtml(sectionHtml) {
    if (!sectionHtml) return undefined;

    const doc = new DOMParser().parseFromString(sectionHtml, 'text/html');
    const root = doc.querySelector('.shopify-section') || doc.body;
    const countEl = root.querySelector('[data-cart-count]');

    if (!countEl) return undefined;

    const text = countEl.textContent.trim();
    const num = parseInt(text, 10);

    if (!isNaN(num)) return num;

    if (text === window.cartStrings?.item_99) return 100;

    return undefined;
  }

  updateCartCounts(itemCount) {
    const maxLabel = window.cartStrings?.item_99;
    const countValue = itemCount < 100 ? String(itemCount) : maxLabel;

    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      if (el.closest('.cart-text')) {
        el.textContent = itemCount < 100 ? `(${itemCount})` : `(${maxLabel})`;
      } else {
        el.textContent = countValue;
      }
    });

    document.querySelectorAll('[data-cart-text]').forEach((el) => {
      if (itemCount === 1) {
        el.textContent = window.cartStrings?.item?.replace('[count]', itemCount) ?? el.textContent;
      } else {
        el.textContent = window.cartStrings?.items?.replace('[count]', itemCount) ?? el.textContent;
      }
    });

    document.querySelectorAll('button.cart-icon--drawer, a.cart-icon--drawer').forEach((trigger) => {
      const cartTextEl = trigger.querySelector('[data-cart-text]');
      if (cartTextEl) {
        trigger.setAttribute('aria-label', cartTextEl.textContent);
      }
    });

    window.updateCartEmptyStateVisibility?.(itemCount);
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}
if (!customElements.get('cart-drawer')) customElements.define('cart-drawer', CartDrawer);

class ModalComponent extends HTMLElement {
  constructor() {
    super();
    this.querySelector('#Modal-Overlay')?.addEventListener('click', this.close.bind(this));

    const modalId = `#${this.id}`;
    const toggleButtons = document.querySelectorAll(`[data-drawer-toggle="${modalId}"]`);

    toggleButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.isOpen ? this.close() : this.show(button);
      });
    });

    // Shopify Design Mode
    if (Shopify.designMode && this.hasAttribute('check-shopify-design-mode')) {
      this.addEventListener('shopify:block:select', () => (this.isOpen = true));
      this.addEventListener('shopify:block:deselect', () => (this.isOpen = false));
    }
  }

  connectedCallback() {
    if (!this.dataset.moved) {
      this.dataset.moved = true;
      document.body.appendChild(this);
    }
  }

  static get observedAttributes() {
    return ['open'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      this.setAttribute('aria-expanded', newValue === '' ? 'true' : 'false');
    }
  }

  get isOpen() {
    return this._isOpen;
  }

  set isOpen(value) {
    if (value !== this._isOpen) {
      this._isOpen = value;
      if (this.isConnected) {
        this._animate(value);
      } else {
        value ? this.setAttribute('open', '') : this.removeAttribute('open');
      }
    }
    this.setAttribute('aria-expanded', value ? 'true' : 'false');
  }

  show(opener) {
    this.openedBy = opener;
    this.isOpen = true;
    this.trapFocus();
  }

  close() {
    this.isOpen = false;
    removeTrapFocus(this.openedBy);
  }

  async _animate(open) {
    const inner = this.querySelector('.modal__inner');
    const content = this.querySelector('.modal-content');
    const header = this.querySelector('.modal-header');
    this.style.overflow = 'hidden';

    if (open) {
      this.setAttribute('open', '');
      await Motion.timeline([
        [inner, { opacity: [0, 1], transform: ['translateY(2rem)', 'translateY(0)'] }, { duration: 0.4, easing: 'cubic-bezier(0.7, 0, 0.3, 1)' }],
        [content, { opacity: [0, 1], transform: ['translateY(1rem)', 'translateY(0)'] }, { duration: 0.3, at: '-0.15' }],
        [header, { opacity: [0, 1], transform: ['translateY(-0.5rem)', 'translateY(0)'] }, { duration: 0.3, at: '-0.2' }],
      ]).finished;
    } else {
      await Motion.timeline([
        [header, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-0.5rem)'] }, { duration: 0.2 }],
        [content, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(1rem)'] }, { duration: 0.2 }],
        [inner, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(2rem)'] }, { duration: 0.25, easing: 'cubic-bezier(0.7, 0, 0.3, 1)' }],
      ]).finished;
      this.removeAttribute('open');
    }

    this.style.overflow = 'visible';
  }

  trapFocus() {
    this.addEventListener(
      'transitionend',
      () => {
        const container = this.querySelector('.modal__inner');
        const focusEl = this.querySelector('.modal__close');
        trapFocus(container, focusEl);
      },
      { once: true }
    );
  }
}

if (!customElements.get('modal-component')) {
  customElements.define('modal-component', ModalComponent);
}
