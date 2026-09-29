class AgeVerificationPopup extends HTMLElement {
  constructor() {
    super();

    this.expiresDays = this.getAttribute('data-expire') || 1;
    this.timeToShow = parseInt(this.getAttribute('data-delay'), 10) || 0;
    this._storage = this.getBestStorage();

    const popupId = this.id || 'global';
    this.dismissKey = `_halo_age_verification_popup_dismiss_${popupId}`;

    this.overlay = this.querySelector('.drawer__overlay') || this.querySelector('[id^="Drawer-Overlay-"]');
    this.content = this.querySelector('.popup__inner');

    this.querySelector('[data-age-verification-confirm]')?.addEventListener('click', this.dismiss.bind(this));

    if (Shopify.designMode) {
      document.addEventListener('shopify:section:select', (e) => {
        if (!e?.target?.matches?.('.section-age-verification-popup')) return;
        const selectedSectionId = e?.detail?.sectionId;
        const mySectionId = (this.id || '').replace('Age-verification-popup-', '');
        if (selectedSectionId && mySectionId && selectedSectionId !== mySectionId) return;
        this.setOpenPopup(0);
      });

      document.addEventListener('shopify:section:deselect', (e) => {
        if (!e?.target?.matches?.('.section-age-verification-popup')) return;
        const deselectedSectionId = e?.detail?.sectionId;
        const mySectionId = (this.id || '').replace('Age-verification-popup-', '');
        if (deselectedSectionId && mySectionId && deselectedSectionId !== mySectionId) return;
        this.close({ persist: false });
      });
    }
  }

  connectedCallback() {
    try {
      this.load();
    } catch (_) {
      this.setOpenPopup(this.timeToShow);
    }
  }

  load() {
    if (this.getStore(this.dismissKey)) return;
    if (!Shopify.designMode) this.setOpenPopup(this.timeToShow);
  }

  setOpenPopup(timeToShow) {
    setTimeout(() => {
      this.activeElement = document.activeElement;
      this.setAttribute('open', 'true');
      this.animateOpen();
      document.body.classList.add('overflow-hidden');
      document.documentElement.setAttribute('scroll-lock', '');

      this.addEventListener(
        'transitionend',
        () => {
          const containerToTrapFocusOn = this.content;
          const focusElement = this.querySelector('[data-age-verification-confirm]');
          trapFocus(containerToTrapFocusOn, focusElement);
        },
        { once: true }
      );
    }, timeToShow);
  }

  close({ persist } = { persist: true }) {
    if (persist) this.setStoreDays(this.dismissKey, '1', this.expiresDays);
    this.animateClose();
    setTimeout(() => {
      this.removeAttribute('open');
      document.body.classList.remove('overflow-hidden');
      document.documentElement.removeAttribute('scroll-lock');
      removeTrapFocus(this.activeElement);
    }, 100);
  }

  animateOpen() {
    if (typeof Motion === 'undefined' || !this.content) return;
    Motion.timeline([
      [
        this.content,
        { opacity: [0, 1], transform: ['translate(-50%, -40%)', 'translate(-50%, -50%)'] },
        { duration: 0.3, at: '-0.15' }
      ]
    ]).finished;
  }

  animateClose() {
    if (typeof Motion === 'undefined' || !this.content) return;
    Motion.timeline([
      [
        this.content,
        { opacity: [1, 0], transform: ['translate(-50%, -50%)', 'translate(-50%, -40%)'] },
        { duration: 0.2 }
      ]
    ]).finished;
  }

  dismiss() {
    this.close({ persist: true });
  }

  setStoreDays(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + 24 * 60 * 60 * 1000 * days);
    this.setStoreUntil(name, value, d);
  }

  setStoreUntil(name, value, date) {
    try {
      if (!this._storage) return;
      const payload = { v: value, exp: date.getTime() };
      this._storage.setItem(name, JSON.stringify(payload));
    } catch (_) {}
  }

  getStore(name) {
    try {
      if (!this._storage) return null;
      const raw = this._storage.getItem(name);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || typeof payload.exp !== 'number') return null;
      if (Date.now() > payload.exp) {
        this._storage.removeItem(name);
        return null;
      }
      return payload.v;
    } catch (_) {
      return null;
    }
  }

  getBestStorage() {
    try {
      const k = '__av_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (_) {}
    try {
      const k2 = '__av_test__';
      window.sessionStorage.setItem(k2, '1');
      window.sessionStorage.removeItem(k2);
      return window.sessionStorage;
    } catch (_) {}
    return null;
  }
}

if (!customElements.get('age-verification-popup')) {
  customElements.define('age-verification-popup', AgeVerificationPopup);
}
