/*
  Puts the 3D configurator into the studio page.

  The frame is only built once the section is near the viewport: a 3D scene is a
  heavy first load and the studio page is often reached by scrolling. The poster
  over it is removed once the frame reports it has loaded, so a slow scene is
  never a blank grey box - and when the section asks for it, the poster is an
  opaque cover held a few seconds longer, because the viewer's own splash screen
  runs on inside the frame after its document has loaded.

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

        const poster = this.parentElement?.querySelector('.ijw-poster');
        if (!poster) return;

        // The frame's load event only says its document arrived - a 3D viewer
        // spends the next few seconds on its own splash screen, which is inside
        // the frame and cannot be styled from here. The cover is held over it
        // for as long as the section says, then faded rather than cut, so an
        // early reveal is a soft one.
        const hold = parseInt(this.dataset.hold || '0', 10) || 0;
        const fade = () => {
          poster.setAttribute('data-fading', 'true');
          setTimeout(() => poster.remove(), 500);
        };

        if (hold > 0 && poster.classList.contains('ijw-poster--cover')) {
          setTimeout(fade, hold);
        } else {
          poster.remove();
        }
      }
    }
  );
}
