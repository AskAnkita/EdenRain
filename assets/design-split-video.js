/*
  Keeps the split banner's feature video running.

  The video carries autoplay/loop/muted/playsinline, so it starts and repeats without this file.
  What a browser will not do on its own is resume: Chrome and Safari pause a muted background
  video once it scrolls out of view or its tab goes to the background, and nothing restarts it
  when you come back. This element watches for those moments and presses play again.

  It is a custom element rather than a <script> in the section so it re-arms every time the
  section re-renders in the theme editor.
*/
if (!customElements.get('dsp-video')) {
  customElements.define(
    'dsp-video',
    class DspVideo extends HTMLElement {
      connectedCallback() {
        this.video = this.querySelector('video');
        if (!this.video) return;

        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (this.reducedMotion.matches) {
          this.video.pause();
          return;
        }

        this.play = this.play.bind(this);
        this.onVisibility = this.onVisibility.bind(this);

        // 'ended' should never fire while loop is set, but a stalled loop lands there.
        this.video.addEventListener('ended', this.play);
        this.video.addEventListener('pause', this.onPause.bind(this));
        this.video.addEventListener('error', () => {
          this.closest('.dsp-media')?.setAttribute('data-video-fallback', '');
        });
        this.video.addEventListener('loadeddata', () => {
          this.closest('.dsp-media')?.removeAttribute('data-video-fallback');
        });
        document.addEventListener('visibilitychange', this.onVisibility);

        if ('IntersectionObserver' in window) {
          this.observer = new IntersectionObserver(
            (entries) => {
              this.visible = entries.some((entry) => entry.isIntersecting);
              if (this.visible) this.play();
            },
            { threshold: 0.2 }
          );
          this.observer.observe(this.video);
        } else {
          this.visible = true;
          this.play();
        }
      }

      disconnectedCallback() {
        this.observer?.disconnect();
        document.removeEventListener('visibilitychange', this.onVisibility);
      }

      play() {
        if (this.reducedMotion.matches) return;
        const attempt = this.video.play();
        // Autoplay can be refused before the first interaction; the next cue tries again.
        if (attempt) attempt.catch(() => {});
      }

      onPause() {
        // A pause we did not ask for - the browser idling the video - is undone once it is
        // back on screen. Scrolled away, we leave it paused and the observer restarts it.
        if (this.visible !== false && !document.hidden) {
          window.requestAnimationFrame(this.play);
        }
      }

      onVisibility() {
        if (!document.hidden && this.visible !== false) this.play();
      }
    }
  );
}
