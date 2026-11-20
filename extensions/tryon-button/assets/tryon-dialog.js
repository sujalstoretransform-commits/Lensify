(() => {
  let previews = [];
  let enabled = false;

  function showStatus(block, text) {
    const status = block.querySelector('[data-lensify-status]');
    status.textContent = text;
    status.hidden = !text;
  }

  function setTryOnEnabled(value) {
    enabled = value;
    for (const { element } of previews) element.hidden = !value;
    for (const block of document.querySelectorAll('[data-lensify-dialog]')) {
      const toggle = block.querySelector('[data-lensify-toggle]');
      toggle.textContent = value ? 'Try-On ON' : 'Try-On OFF';
      toggle.setAttribute('aria-pressed', String(value));
      block.querySelector('[data-lensify-retake]').hidden = false;
    }
  }

  function showPreviews(data, galleries) {
    const overlays = new Map(data.overlays.map(({ id, overlay }) => [id, overlay]));
    const next = [];
    for (const { id, gallery } of galleries) {
      const overlay = overlays.get(id);
      if (!gallery.isConnected || !(overlay instanceof Blob) || overlay.type !== 'image/png') continue;

      const url = URL.createObjectURL(overlay);
      const element = document.createElement('div');
      element.className = 'lensify-preview';
      element.style.setProperty('--lensify-photo-ratio', data.aspectRatio);
      const photoContainer = document.createElement('div');
      photoContainer.className = 'lensify-preview-photo';
      const photo = new Image();
      photo.src = data.photo;
      photo.alt = 'Your virtual try-on';
      const glasses = new Image();
      glasses.src = url;
      glasses.alt = '';
      glasses.className = 'lensify-preview-glasses';
      Object.assign(glasses.style, data.fit);
      photoContainer.append(photo, glasses);
      element.append(photoContainer);
      gallery.append(element);
      next.push({ element, url });
    }
    if (!next.length) return false;

    for (const { element, url } of previews) {
      element.remove();
      URL.revokeObjectURL(url);
    }
    previews = next;
    setTryOnEnabled(true);
    return true;
  }

  async function openCamera(block, button) {
    const dialog = document.getElementById(block.dataset.lensifyDialog);
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;

    const iframe = dialog.querySelector('iframe');
    const catalog = JSON.parse(block.querySelector('[data-lensify-catalog]')?.value || '[]');
    if (!iframe) return;

    const galleries = Array.from(document.querySelectorAll('product-card .card-gallery'), (gallery) => ({
      id: gallery.dataset.productId || gallery.closest('product-card')?.dataset.productId,
      gallery,
    }));
    const visibleProductIds = new Set(galleries.map(({ id }) => id));
    const frames = catalog.filter(({ id, imageUrl }) => imageUrl && visibleProductIds.has(id));
    if (!frames.length) {
      showStatus(block, 'No matching frames are available on this page.');
      return;
    }
    showStatus(block, '');
    const buttonLabel = button.textContent;
    button.textContent = 'Opening camera…';
    button.disabled = true;
    let url;
    try {
      const response = await fetch('/apps/lensify', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Try-on connection failed');
      const { cameraUrl } = await response.json();
      url = new URL(cameraUrl);
      if (url.protocol !== 'https:') throw new Error('Try-on requires HTTPS');
    } catch {
      showStatus(block, 'Try-on is temporarily unavailable. Please try again.');
      return;
    } finally {
      button.textContent = buttonLabel;
      button.disabled = false;
    }
    if (!dialog.isConnected || dialog.open) return;
    const handleCameraMessage = (message) => {
      if (message.source !== iframe.contentWindow || message.origin !== url.origin) return;
      const data = message.data;
      if (data?.type === 'LENSIFY_STOREFRONT_READY') {
        iframe.contentWindow.postMessage({ type: 'LENSIFY_STOREFRONT_CATALOG', catalog: frames }, url.origin);
      } else if (data?.type === 'LENSIFY_STOREFRONT_CANCEL') {
        dialog.close();
      } else if (data?.type === 'LENSIFY_STOREFRONT_PREVIEWS') {
        if (!showPreviews(data, galleries)) {
          showStatus(block, 'The try-on previews aren’t available on this page.');
        }
        dialog.close();
      }
    };
    dialog.addEventListener('close', () => {
      window.removeEventListener('message', handleCameraMessage);
      iframe.src = 'about:blank';
    }, { once: true });
    window.addEventListener('message', handleCameraMessage);
    url.searchParams.set('origin', window.location.origin);
    iframe.allow = `camera ${url.origin}`;
    iframe.src = url.href;
    dialog.showModal();
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-lensify-launch]');
    const block = button?.closest('[data-lensify-dialog]');
    if (!block) return;

    if (previews.length && button.hasAttribute('data-lensify-toggle')) {
      setTryOnEnabled(!enabled);
    } else {
      openCamera(block, button);
    }
  });
})();
