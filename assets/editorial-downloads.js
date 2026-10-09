/*
  Makes a file link in an article or guide actually download the file.

  The guides offer a printable sizer, and the merchant links it the only way the
  admin rich-text editor allows: a plain link to the file. Shopify serves that
  file from cdn.shopify.com, a different origin from the shop, and a browser
  ignores the "download" attribute across origins - so the link opened the sizer
  in a tab instead of saving it, and a reader who needed it on paper got a
  picture to right-click.

  So the file is fetched and handed over as a blob, which carries no origin rule.
  The "download" attribute is still set, because it costs nothing and is what
  works if the file ever moves to the shop's own domain; and if the fetch is
  refused the link is simply followed as before, so the worst case is today's
  behaviour rather than a dead button.
*/
(() => {
  const FILE = /\.(pdf|png|jpe?g|webp|gif|svg|zip)(?:[?#]|$)/i;

  const nameFor = (url) => {
    try {
      const last = new URL(url, window.location.href).pathname.split('/').pop();
      return decodeURIComponent(last) || 'download';
    } catch {
      return 'download';
    }
  };

  const save = (blob, name) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Freed on the next tick; revoking straight away cancels the save in Safari.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  };

  const enableDownload = (link, name) => {
    link.setAttribute('download', name);
    link.addEventListener('click', async (event) => {
      // A modified click is the reader asking for a tab or their own save; leave it.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      link.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(link.href, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`${response.status}`);
        save(await response.blob(), name);
      } catch {
        window.open(link.href, '_blank', 'noopener');
      } finally {
        link.removeAttribute('aria-busy');
      }
    });
  };

  document.querySelectorAll('[data-editorial-downloads] a[href]').forEach((link) => {
    if (!FILE.test(link.getAttribute('href') || '')) return;

    const name = nameFor(link.href);
    enableDownload(link, name);
  });

  document.querySelectorAll('[data-sizer-download]').forEach((content) => {
    // Use the selected wrist sizer image when available; otherwise use the first body image.
    const images = [...content.querySelectorAll('img')];
    const preferredSource = content.dataset.sizerDownloadSrc;
    const preferredName = preferredSource
      ? new URL(preferredSource, window.location.href).pathname.split('/').pop()
      : '';
    const image = (preferredName && images.find((candidate) =>
      new URL(candidate.src, window.location.href).pathname.endsWith(preferredName)
    )) || images[0];
    if (!image) return;
    const source = preferredSource || image.getAttribute('src');
    if (!source) return;

    const kind = content.dataset.sizerDownload;
    const labels = {
      finger: ['Download Finger Sizer', 'finger-sizer'],
      wrist: ['Download Wrist Sizer', 'wrist-sizer'],
    };
    const download = labels[kind];
    if (!download) return;

    const button = document.createElement('a');
    button.className = 'gp-sizer-download';
    button.href = source;
    button.textContent = download[0];
    button.setAttribute('data-editorial-sizer-download', '');

    const extension = (new URL(button.href, window.location.href).pathname.match(/\.[a-z0-9]+$/i) || [])[0] || '.png';
    enableDownload(button, `${download[1]}${extension}`);

    const media = image.closest('.gp-split__media') || image.parentElement;
    media.append(button);
  });
})();
