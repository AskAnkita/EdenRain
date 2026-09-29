// create a container and set the full-size image as its background
function createOverlay(image) {
  const overlayImage = document.createElement('img');
  overlayImage.setAttribute('src', `${image.currentSrc || image.src}`);
  const overlay = document.createElement('div');
  prepareOverlay(overlay, overlayImage);

  image.style.opacity = '50%';
  toggleLoadingSpinner(image);

  overlayImage.onload = () => {
    toggleLoadingSpinner(image);
    image.parentElement.insertBefore(overlay, image);
    image.style.opacity = '100%';
  };

  return overlay;
}

function prepareOverlay(container, image) {
  container.setAttribute('class', 'image-zoom-inline-full-size');
  container.setAttribute('aria-hidden', 'true');
  container.style.backgroundImage = `url('${image.src}')`;
  container.style.backgroundColor = 'var(--color-background)';
}

function toggleLoadingSpinner(image) {
  const root = image.closest('.product-media') || image.parentElement;
  const loadingSpinner = root?.querySelector('.loading__spinner');
  loadingSpinner?.classList.toggle('hidden');
}

function moveWithHover(overlay, image, event, zoomRatio) {
  const ratio = image.height / image.width;
  const container = event.target.getBoundingClientRect();
  const xPosition = event.clientX - container.left;
  const yPosition = event.clientY - container.top;
  const xPercent = `${xPosition / (image.clientWidth / 100)}%`;
  const yPercent = `${yPosition / ((image.clientWidth * ratio) / 100)}%`;

  overlay.style.backgroundPosition = `${xPercent} ${yPercent}`;
  overlay.style.backgroundSize = `${image.width * zoomRatio}px`;
}

function magnify(image, zoomRatio, initialEvent) {
  const overlay = createOverlay(image);
  overlay.onclick = () => overlay.remove();
  overlay.onmousemove = (event) => moveWithHover(overlay, image, event, zoomRatio);
  overlay.onmouseleave = () => overlay.remove();
  if (initialEvent) {
    moveWithHover(overlay, image, initialEvent, zoomRatio);
  }
}

function enableZoomOnHover(zoomRatio) {
  const images = document.querySelectorAll('.image-zoom-inline');
  images.forEach((image) => {
    image.onclick = (event) => {
      magnify(image, zoomRatio, event);
    };
  });
}

function initProductInlineZoom() {
  enableZoomOnHover(2);
}

initProductInlineZoom();

document.addEventListener('product:inline-zoom-reinit', initProductInlineZoom);
