(() => {
  let previews = [];
  let enabled = false;
  const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function previewStorage(mode, operation) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('lensify-tryon', 1)

      open.onupgradeneeded = () => {
        open.result.createObjectStore('previews')
      }

      open.onerror = () => reject(open.error);

      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction('previews', mode);
        const request = operation(transaction.objectStore('previews'));

        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };

        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? new Error('Preview storage was aborted'));
        };
      }
    })
  }

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

  function showPreviews(data, galleries, block) {
    const overlays = new Map(data.overlays.map(({ id, overlay }) => [id, overlay]));
    const catalog = JSON.parse(block?.querySelector('[data-lensify-catalog]')?.value || '[]');
    const frames = new Map(catalog.map((frame) => [frame.id, frame]));
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
      const card = gallery.closest('product-card');
      const frame = frames.get(id);
      let requestedImage;
      let variantUrl;
      function clearVariant() {
        if (variantUrl) URL.revokeObjectURL(variantUrl);
        variantUrl = undefined;
      }
      async function setVariant(variantId) {
        const imageUrl = frame?.variantImages?.[variantId];
        if (imageUrl === requestedImage && variantUrl) return;
        requestedImage = imageUrl;
        if (!imageUrl || imageUrl === frame.imageUrl) {
          glasses.src = url;
          glasses.hidden = imageUrl === null;
          clearVariant();
          return;
        }
        glasses.hidden = true;
        try {
          const { extractGlasses } = await import(block.dataset.lensifyExtractionUrl);
          const overlay = await extractGlasses(imageUrl);
          if (!element.isConnected || requestedImage !== imageUrl) return;
          clearVariant();
          variantUrl = URL.createObjectURL(overlay);
          glasses.src = variantUrl;
          glasses.hidden = false;
        } catch (error) {
          if (!element.isConnected || requestedImage !== imageUrl) return;
          glasses.hidden = true;
          clearVariant();
          console.warn('Could not load try-on variant', error);
        }
      }
      const selected = card?.querySelector('input[data-variant-id]:checked');
      if (selected) void setVariant(selected.dataset.variantId);
      next.push({ element, url, card, setVariant, clearVariant });
    }
    if (!next.length) return false;

    for (const { element, url, clearVariant } of previews) {
      element.remove();
      URL.revokeObjectURL(url);
      clearVariant();
    }
    previews = next;
    setTryOnEnabled(true);
    return true;
  }

  function getGalleries() {
    return Array.from(
      document.querySelectorAll('product-card .card-gallery'),
      (gallery) => ({
        id: gallery.dataset.productId || gallery.closest('product-card')?.dataset.productId,
        gallery,
      })
    )
  }

  async function openCamera(block, button) {
    const dialog = document.getElementById(block.dataset.lensifyDialog);
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;

    const iframe = dialog.querySelector('iframe');
    const catalog = JSON.parse(block.querySelector('[data-lensify-catalog]')?.value || '[]');
    if (!iframe) return;

    const galleries = getGalleries();

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
        return;
      } else if (data?.type === 'LENSIFY_STOREFRONT_CANCEL') {
        dialog.close();
        return;
      } else if (data?.type === 'LENSIFY_STOREFRONT_PREVIEWS') {
        const { photo, aspectRatio, fit, overlays } = data;

        if (!showPreviews(data, galleries, block)) {
          showStatus(block, 'The try-on previews are unavailable on this page.');
        }

        previewStorage('readwrite', (store) =>
          store.put({
            photo,
            aspectRatio,
            fit,
            overlays,
            expiresAt: Date.now() + PHOTO_TTL_MS,
          }, 'latest')
        ).catch((error) => console.warn('Could not save try-on preview', error));
      } else {
        return;
      }
      dialog.close();
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

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked || !input.dataset.variantId) return;
    const card = input.closest('product-card');
    if (!card) return;
    const preview = previews.find((entry) => entry.card === card);
    if (preview) void preview.setVariant(input.dataset.variantId);
  }, true);

  async function restorePreview() {
    try {
      const saved = await previewStorage('readonly', (store) => store.get('latest'));
      if (!saved) return;

      if (Date.now() >= saved.expiresAt) {
        await previewStorage('readwrite', (store) => store.delete('latest'));
        return;
      }

      if (!previews.length) {
        showPreviews(saved, getGalleries(), document.querySelector('[data-lensify-dialog]'));
      }
    } catch (error) {
      console.warn('Could not restore try-on preview', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restorePreview, { once: true });
  } else {
    restorePreview();
  }
})();
