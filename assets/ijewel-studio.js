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
        if (this.listen) window.removeEventListener('message', this.listen);
      }

      build() {
        if (this.built) return;
        this.built = true;

        const iframe = document.createElement('iframe');
        const guided = this.dataset.guidedMobile === 'true' && window.matchMedia('(max-width: 749px)').matches;

        // The builder's document arrives in a moment but the scene behind it
        // waits for a tap on its own play button, so "the frame loaded" is the
        // wrong moment to take our cover away - it uncovers the vendor's poster
        // and the vendor's logo. When the builder speaks a bridge, its own ready
        // event is the right moment, and our cover takes no clicks (the
        // stylesheet gives it pointer-events: none), so the tap that starts the
        // scene goes straight through it.
        //
        // The same bridge says when the builder's own panel is on screen, and
        // that is the only moment anything of ours may sit over it. Before the
        // tap the frame is the vendor's poster and a full-bleed render: there
        // is no price under our price patch, and the line floats on a
        // photograph. So the first word from the builder, whatever it is, marks
        // the element live and the stylesheet fades the patch in. It is
        // listened for whether or not the cover is waiting on it.
        this.waitReady = this.dataset.waitReady === 'true';
        this.listen = (event) => {
          if (this.dataset.origin && event.origin !== this.dataset.origin) return;
          const message = event.data;
          if (!message || typeof message !== 'object' || message.source !== 'ijewel') return;
          this.setAttribute('data-live', 'true');
          if (this.waitReady && message.event === 'ready') this.ready();
        };
        window.addEventListener('message', this.listen);
        if (guided) {
          this.setAttribute('data-guided', 'true');
          // Load the locally owned interface without trying to restyle a remote frame.
          if (!window.edenGuidedDocumentPromise) {
            window.edenGuidedDocumentPromise = new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = this.dataset.guidedDocument;
              script.onload = () => window.edenGuidedDocument ? resolve(window.edenGuidedDocument) : reject(new Error('Missing guided document'));
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          window.edenGuidedDocumentPromise.then(html => { iframe.srcdoc = html; }).catch(() => {
            this.removeAttribute('data-guided');
            iframe.src = this.src;
          });
        } else {
          iframe.src = this.src;
        }
        iframe.title = this.dataset.title || 'Design your own jewellery';
        // The viewer asks for these: autoplay to spin the scene, xr-spatial-tracking
        // for view-in-room, camera for try-on, web-share for the share button.
        iframe.setAttribute('allow', 'autoplay; camera; fullscreen; xr-spatial-tracking; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.addEventListener('load', () => {
          if (guided && !iframe.srcdoc && !iframe.hasAttribute('src')) return;
          if (this.waitReady) return;
          this.ready();
        });
        this.appendChild(iframe);

        // A viewer that never fires load - a blocked frame, a slow CDN - would
        // otherwise sit behind the poster for good. Waiting on the bridge gets
        // longer rope, since it is waiting on a person to tap as well.
        this.timer = setTimeout(() => this.ready(), this.waitReady ? 45000 : 12000);
      }

      ready() {
        clearTimeout(this.timer);
        // The listener stays: the cover is only one of the things the bridge
        // is telling us about, and the price patch is still waiting on it.
        this.setAttribute('data-ready', 'true');

        const poster = this.parentElement?.querySelector('.ijw-poster');
        if (!poster) return;

        // Neither signal means the scene is on screen. The frame's load event
        // only says its document arrived, and the bridge's ready event comes
        // while the builder is still fetching and rendering the model - measured
        // on this studio, ready lands 2-3 seconds before the ring first paints,
        // and the gap is wider on a slow line. Uncovering on either one hands the
        // viewer its own loading screen, logo and progress bar, which is the one
        // thing the cover exists to hide. So the hold applies to both: it is the
        // rope after the signal, not instead of it. Then faded rather than cut,
        // so an early reveal is a soft one.
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
