/*
  Puts the 3D configurator into the studio page.

  The frame is only built once the section is near the viewport: a 3D scene is a
  heavy first load and the studio page is often reached by scrolling. The poster
  under it is removed once the frame reports it has loaded, so a slow scene is
  never a blank grey box.

  The embed itself is whatever URL the merchant pasted from iJewel's Embedding
  tab (ijewel3d.com/<instance>/files/<id>/embedded, or a drive URL with a tag and
  a scope). Nothing here is iJewel-specific beyond the permissions the viewer
  needs - any configurator handed to us as a URL renders the same way.

  It is a custom element rather than a <script> in the section so it re-arms every
  time the section re-renders in the theme editor.
*/
if (!customElements.get('ijewel-studio')) {
  customElements.define(
    'ijewel-studio',
    class IjewelStudio extends HTMLElement {
      connectedCallback() {
        if (this.built) return;

        this.src = this.dataset.src || '';
        if (!this.src) return;

        if (this.dataset.lazy === 'false' || !('IntersectionObserver' in window)) {
          this.build();
          return;
        }

        this.observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            this.observer.disconnect();
            this.build();
          },
          { rootMargin: '600px 0px' }
        );
        this.observer.observe(this);
      }

      disconnectedCallback() {
        this.observer?.disconnect();
      }

      build() {
        if (this.built) return;
        this.built = true;

        const iframe = document.createElement('iframe');
        iframe.src = this.src;
        iframe.title = this.dataset.title || 'Design your own jewellery';
        // The viewer asks for these: autoplay to spin the scene, xr-spatial-tracking
        // for view-in-room, camera for try-on, web-share for the share button.
        iframe.setAttribute('allow', 'autoplay; camera; fullscreen; xr-spatial-tracking; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.addEventListener('load', () => this.ready());
        this.appendChild(iframe);

        // A viewer that never fires load - a blocked frame, a slow CDN - would
        // otherwise sit behind the poster for good.
        this.timer = setTimeout(() => this.ready(), 12000);
      }

      ready() {
        clearTimeout(this.timer);
        this.setAttribute('data-ready', 'true');
        this.parentElement?.querySelector('.ijw-poster')?.remove();
      }
    }
  );
}
