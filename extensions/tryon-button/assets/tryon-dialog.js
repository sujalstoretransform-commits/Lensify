(() => {
  const previews = new Map();
  const nearbyGalleries = new WeakSet();
  function distanceFromViewport({ top, bottom }) {
    return Math.max(0, top - window.innerHeight, -bottom);
  }

  const galleryObserver = new IntersectionObserver((entries) => {
    const entering = [];
    for (const { target, isIntersecting, boundingClientRect } of entries) {
      if (isIntersecting) {
        nearbyGalleries.add(target);
        entering.push({ target, distance: distanceFromViewport(boundingClientRect) });
      } else {
        nearbyGalleries.delete(target);
      }
    }
    entering.sort((a, b) => a.distance - b.distance);
    for (const { target } of entering) previews.get(target)?.syncGalleryImage();
  }, { rootMargin: '1000px 0px' });
  let previewData;
  let previewBlock;
  let reconcileFrame;
  let enabled = false;
  const TRY_ON_STATE_KEY = 'lensify-tryon-enabled';
  const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const EXTRACTION_VERSION = 10;
  const CAMERA_URL_TTL_MS = 30_000;
  let cameraUrlRequest;
  let cameraUrlExpiresAt = 0;

  function getCameraUrl() {
    if (cameraUrlRequest && Date.now() < cameraUrlExpiresAt) return cameraUrlRequest;

    cameraUrlExpiresAt = Date.now() + CAMERA_URL_TTL_MS;
    cameraUrlRequest = fetch('/apps/lensify', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Try-on connection failed');
      const { cameraUrl } = await response.json();
      const url = new URL(cameraUrl);
      if (url.protocol !== 'https:') throw new Error('Try-on requires HTTPS');
      return url.href;
    }).catch((error) => {
      cameraUrlRequest = undefined;
      throw error;
    });
    return cameraUrlRequest;
  }

  function previewStorage(mode, operation, storeName = 'previews') {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('lensify-tryon', 2)

      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('previews')) {
          open.result.createObjectStore('previews');
        }
        const overlays = open.result.createObjectStore('overlays');
        overlays.createIndex('expiresAt', 'expiresAt');
      }

      open.onerror = () => reject(open.error);

      open.onsuccess = () => {
        const db = open.result
        const transaction = db.transaction(storeName, mode);
        const request = operation(transaction.objectStore(storeName));

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

  function saveGeneratedOverlay(key, overlay) {
    const entry = { overlay, expiresAt: Date.now() + PHOTO_TTL_MS };
    void previewStorage('readwrite', (store) => store.put(entry, [EXTRACTION_VERSION, key]), 'overlays')
      .catch((error) => console.warn('Could not save generated overlay', error));
  }

  async function readGeneratedOverlay(key) {
    const saved = await previewStorage('readonly', (store) => store.get([EXTRACTION_VERSION, key]), 'overlays')
      .catch(() => undefined);
    if (saved?.expiresAt > Date.now()) return saved.overlay;
  }

  function pruneExpiredOverlays() {
    void previewStorage('readwrite', (store) => {
      const request = store.index('expiresAt').openCursor(IDBKeyRange.upperBound(Date.now()));
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      });
      return request;
    }, 'overlays').catch((error) => console.warn('Could not clean up expired overlays', error));
  }

  function setTryOnEnabled(value) {
    enabled = value;
    if (value) {
      productObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-product-id', 'data-active-color'],
      });
    } else {
      productObserver.disconnect();
      if (reconcileFrame !== undefined) cancelAnimationFrame(reconcileFrame);
      reconcileFrame = undefined;
    }
    for (const preview of previews.values()) preview.updateVisibility();
    for (const block of document.querySelectorAll('[data-lensify-dialog]')) {
      const toggle = block.querySelector('[data-lensify-toggle]');
      const label = value ? 'Try-On ON' : 'Try-On OFF';
      if (toggle.textContent !== label) toggle.textContent = label;
      toggle.setAttribute('aria-pressed', String(value));
      block.querySelector('[data-lensify-retake]').hidden = false;
    }
  }

  function rememberTryOnState(value) {
    try {
      sessionStorage.setItem(TRY_ON_STATE_KEY, String(value));
    } catch {
      // Try-on still works when session storage is unavailable.
    }
  }

  function wasTryOnEnabled() {
    try {
      return sessionStorage.getItem(TRY_ON_STATE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function removePreview(gallery, { element, clearVariant }) {
    galleryObserver.unobserve(gallery);
    nearbyGalleries.delete(gallery);
    element.remove();
    clearVariant();
    previews.delete(gallery);
  }

  function reconcilePreviews(syncExisting = false) {
    if (!previewData) return;
    const data = previewData;
    const block = previewBlock?.isConnected ? previewBlock : getRestoreBlock();
    const blockChanged = block !== previewBlock;
    previewBlock = block;
    const catalog = JSON.parse(block?.querySelector('[data-lensify-catalog]')?.value || '[]');
    const frames = new Map(catalog.map((frame) => [frame.id, frame]));
    const galleries = getEligibleGalleries(block, frames);
    const productIds = new Map(galleries.map(({ id, gallery }) => [gallery, id]));
    for (const [gallery, preview] of previews) {
      if (blockChanged || productIds.get(gallery) !== preview.id || preview.element.parentNode !== gallery) {
        removePreview(gallery, preview);
      }
    }
    for (const { id, gallery } of galleries) {
      const existing = previews.get(gallery);
      if (existing) {
        if (syncExisting) existing.syncGalleryImage();
        continue;
      }
      if (!gallery.isConnected) continue;
      const frame = frames.get(id) ?? {};
      const card = gallery.closest('product-card, article.product-card');
      const element = document.createElement('div');
      element.className = 'lensify-preview';
      element.style.setProperty('--lensify-photo-ratio', data.aspectRatio);
      const photoContainer = document.createElement('div');
      photoContainer.className = 'lensify-preview-photo';
      const photo = new Image();
      photo.alt = 'Your virtual try-on';
      let glasses = new Image();
      glasses.alt = '';
      glasses.className = 'lensify-preview-glasses';
      const { anchorTop, top: savedTop, ...fit } = data.fit;
      // Older previews stored an eye position with the former 103.5% scale baked in.
      const eyeTop = anchorTop ?? parseFloat(savedTop) / 1.035;
      Object.assign(glasses.style, fit);
      glasses.style.setProperty('--lensify-eye-top', `${eyeTop}%`);
      photoContainer.append(photo, glasses);
      element.append(photoContainer);
      gallery.append(element);
      let requestedImage;
      let imageRequest = 0;
      let variantUrl;
      let ready = false;
      function updateVisibility() {
        element.toggleAttribute('data-lensify-visible', enabled && ready);
      }
      function clearVariant() {
        if (variantUrl) URL.revokeObjectURL(variantUrl);
        variantUrl = undefined;
      }
      async function setImage(images) {
        const request = JSON.stringify(images);
        if (request === requestedImage) return;
        requestedImage = request;
        const requestId = ++imageRequest;
        const isCurrent = () => element.isConnected && imageRequest === requestId;
        ready = false;
        updateVisibility();
        if (!images.length) {
          clearVariant();
          return;
        }
        let nextVariantUrl;
        try {
          const cacheKey = `${id}:${request}`;
          let overlay = await readGeneratedOverlay(cacheKey);
          if (!isCurrent()) return;
          if (!(overlay instanceof Blob) || overlay.type !== 'image/png') {
            const { extractFrontGlasses } = await import(block.dataset.lensifyExtractionUrl);
            const result = await extractFrontGlasses(
              images,
              () => isCurrent() && enabled,
              () => nearbyGalleries.has(gallery)
                ? distanceFromViewport(gallery.getBoundingClientRect())
                : Infinity,
            );
            if (!result) {
              if (isCurrent()) requestedImage = undefined;
              return;
            }
            ({ overlay } = result);
            saveGeneratedOverlay(cacheKey, overlay);
          }
          if (!isCurrent()) return;
          nextVariantUrl = URL.createObjectURL(overlay);
          const nextGlasses = glasses.cloneNode(false);
          nextGlasses.src = nextVariantUrl;
          if (!photo.src) photo.src = data.photo;
          await Promise.all([nextGlasses.decode(), photo.decode()]);
          if (!isCurrent()) return;
          glasses.replaceWith(nextGlasses);
          glasses = nextGlasses;
          clearVariant();
          variantUrl = nextVariantUrl;
          nextVariantUrl = undefined;
          ready = true;
          updateVisibility();
        } catch (error) {
          if (!isCurrent()) return;
          ready = false;
          updateVisibility();
          clearVariant();
          requestedImage = undefined;
          console.warn('Could not load selected try-on image', error);
        } finally {
          if (nextVariantUrl) URL.revokeObjectURL(nextVariantUrl);
        }
      }
      function syncGalleryImage(input = card?.querySelector('input[data-variant-id]:checked')) {
        if (!enabled) return;
        void setImage(getFrameImages(gallery, frame, input));
      }
      function warmVariant(input) {
        const images = getFrameImages(gallery, frame, input);
        if (!images.length) return;
        void import(block.dataset.lensifyExtractionUrl)
          .then(({ extractFrontGlasses }) => extractFrontGlasses(images, () => enabled && nearbyGalleries.has(gallery)))
          .catch(() => {});
      }
      previews.set(gallery, { id, element, syncGalleryImage, warmVariant, clearVariant, updateVisibility });
      galleryObserver.observe(gallery);
      syncGalleryImage();
    }
    setTryOnEnabled(enabled);
  }

  function showPreviews(data, block) {
    for (const [gallery, preview] of previews) removePreview(gallery, preview);
    previewData = data;
    previewBlock = block;
    enabled = true;
    rememberTryOnState(true);
    reconcilePreviews();
    return previews.size > 0;
  }

  function getGalleries() {
    return Array.from(
      document.querySelectorAll('product-card .card-gallery, article.product-card .product-card__image-wrap'),
      (gallery) => {
        const card = gallery.closest('product-card, article.product-card');
        const id = gallery.dataset.productId || card?.dataset.productId
          || gallery.querySelector('.product-card__wishlist[data-product-id]')?.dataset.productId;
        return { id, gallery };
      }
    ).filter(({ id }) => /^\d+$/.test(id ?? ''));
  }

  function getRestoreBlock() {
    return document.querySelector('[data-lensify-dialog][data-lensify-restrict-collection]')
      ?? document.querySelector('[data-lensify-dialog]');
  }

  function getEligibleGalleries(block, frames) {
    if (!block) return [];
    const galleries = getGalleries();
    if (!block.hasAttribute('data-lensify-restrict-collection')) return galleries;
    const useCollectionGrid = block.hasAttribute('data-lensify-collection-grid');
    return galleries.filter(({ id, gallery }) =>
      frames.has(id) || (useCollectionGrid && gallery.closest('.main-collection-grid, #col-product-grid'))
    );
  }

  function getProductImageUrl(source) {
    if (!source) return;
    const url = new URL(source, window.location.href);
    if (url.protocol !== 'https:') return;
    url.searchParams.set('width', '1280');
    url.searchParams.sort();
    return url.href;
  }

  function getFrameImages(gallery, frame, input) {
    if (gallery.matches('.product-card__image-wrap')) {
      const variants = gallery.closest('article.product-card')?.querySelector('[data-card-variants]');
      const imageData = variants?.querySelector('[data-card-images-json]');
      let sources = [];
      try {
        const images = JSON.parse(imageData?.textContent || '{}')?.[variants?.dataset.activeColor];
        if (Array.isArray(images)) sources = images.filter((image) => typeof image === 'string');
      } catch {
        // Some cards only expose their current image.
      }
      const primary = gallery.querySelector('img:not([data-card-slide-next])');
      const urls = sources.length ? sources : [primary?.getAttribute('src') || primary?.currentSrc || frame.imageUrl];
      return [...new Set(urls.map(getProductImageUrl).filter(Boolean))]
        .map((imageUrl) => ({ imageUrl, labeledFront: /__(?:fr|cfr)\.[^/?]+(?:\?|$)/i.test(imageUrl) }))
        .sort((a, b) => Number(b.labeledFront) - Number(a.labeledFront))
        .slice(0, 5);
    }
    const variantId = input?.dataset.variantId;
    // The gallery can still show the previous swatch while the theme updates it.
    const variantUrl = getProductImageUrl(frame.variantImages?.[variantId]);
    const media = Array.from(gallery.querySelectorAll('slideshow-slide img, .product-media-container img'));
    const imageUrlFor = (image) => getProductImageUrl(image?.getAttribute('src')) || getProductImageUrl(image?.currentSrc);
    const primary = media.find((image) => !image.matches('.card-gallery__image--hover, .product-card__image--secondary'));
    const primaryUrl = getProductImageUrl(frame.imageUrl) || imageUrlFor(primary);
    const urls = variantUrl ? [variantUrl] : [primaryUrl, ...media.map(imageUrlFor)];
    const candidates = [];
    for (const imageUrl of new Set(urls)) {
      if (!imageUrl) continue;
      const alt = media.find((image) => imageUrlFor(image) === imageUrl)?.alt || '';
      if (/\b(?:angled?|three[\s-]quarter|(?:back|rear|side)[\s-]+(?:view|profile)|view from (?:behind|the back|the rear|the side))\b|45°/i.test(alt)) continue;
      const foldedArms = /\b(?:folded|closed|crossed)[\s-]+(?:arms|temples)\b|\b(?:arms|temples)[\s-]+(?:folded|closed|crossed)\b/i.test(alt);
      const labeledFront = /\b(?:front[\s-]+(?:view|facing|on)|straight[\s-]+on|view from the front)\b/i.test(alt);
      const openArms = /\b(?:open|unfolded)[\s-]+(?:arms|temples)\b|\b(?:arms|temples)[\s-]+(?:open|unfolded)\b/i.test(alt);
      candidates.push({ imageUrl, labeledFront, priority: Number(openArms) - Number(foldedArms) });
    }
    return candidates.sort((a, b) => b.priority - a.priority).slice(0, 5)
      .map(({ imageUrl, labeledFront }) => ({ imageUrl, labeledFront }));
  }

  async function openCamera(block, button) {
    const dialog = document.getElementById(block.dataset.lensifyDialog);
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;

    const iframe = dialog.querySelector('iframe');
    const catalog = JSON.parse(block.querySelector('[data-lensify-catalog]')?.value || '[]');
    if (!iframe) return;

    const catalogById = new Map(catalog.map((frame) => [frame.id, frame]));
    const nearbyFrames = [];
    let firstFrame;
    for (const { id, gallery } of getEligibleGalleries(block, catalogById)) {
      const distance = distanceFromViewport(gallery.getBoundingClientRect());
      const nearby = distance <= 500;
      if (!nearby && firstFrame) continue;
      const selected = gallery.closest('product-card')?.querySelector('input[data-variant-id]:checked');
      const images = getFrameImages(gallery, catalogById.get(id) ?? {}, selected);
      if (!images.length) continue;
      const frame = { id, images };
      firstFrame ??= frame;
      if (nearby) nearbyFrames.push({ images, distance });
    }
    if (!firstFrame) {
      showStatus(block, 'No matching frames are available on this page.');
      return;
    }
    showStatus(block, '');
    const buttonLabel = button.textContent;
    button.textContent = 'Opening camera…';
    button.disabled = true;
    nearbyFrames.sort((a, b) => a.distance - b.distance);
    // Frame preparation is independent of the photo and the camera connection.
    void import(block.dataset.lensifyExtractionUrl).then(({ extractFrontGlasses }) => {
      for (const { images, distance } of nearbyFrames) {
        void extractFrontGlasses(images, () => button.disabled || dialog.open, () => distance).catch(() => {});
      }
    }).catch(() => {});
    let url;
    try {
      url = new URL(await getCameraUrl());
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
        // The camera only needs one eligible frame to start. The storefront
        // prepares overlays as cards come into range.
        iframe.contentWindow.postMessage({ type: 'LENSIFY_STOREFRONT_CATALOG', catalog: [firstFrame] }, url.origin);
        return;
      } else if (data?.type === 'LENSIFY_STOREFRONT_CANCEL') {
        dialog.close();
        return;
      } else if (data?.type === 'LENSIFY_STOREFRONT_PREVIEWS') {
        const { photo, aspectRatio, fit } = data;
        // Older storefront scripts also read this IndexedDB record.
        const saved = { photo, aspectRatio, fit, overlays: [], expiresAt: Date.now() + PHOTO_TTL_MS };

        if (!showPreviews(saved, block)) {
          showStatus(block, 'The try-on previews are unavailable on this page.');
        }

        previewStorage('readwrite', (store) =>
          store.put(saved, 'latest')
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

  function prefetchCameraUrl(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-lensify-dialog] [data-lensify-launch]');
    if (!button || (previewData && button.hasAttribute('data-lensify-toggle'))) return;
    void getCameraUrl().catch(() => {});
  }

  document.addEventListener('pointerover', prefetchCameraUrl);
  document.addEventListener('focusin', prefetchCameraUrl);

  function prefetchSwatch(event) {
    if (!enabled || !(event.target instanceof Element)) return;
    const input = event.target.closest('input[data-variant-id]') ?? event.target.closest('label')?.control;
    if (!(input instanceof HTMLInputElement) || !input.dataset.variantId) return;
    const card = input.closest('product-card');
    if (!card) return;
    for (const gallery of card.querySelectorAll('.card-gallery')) {
      previews.get(gallery)?.warmVariant(input);
    }
  }

  document.addEventListener('pointerover', prefetchSwatch);
  document.addEventListener('focusin', prefetchSwatch);

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-lensify-launch]');
    const block = button?.closest('[data-lensify-dialog]');
    if (!block) return;

    if (previewData && button.hasAttribute('data-lensify-toggle')) {
      setTryOnEnabled(!enabled);
      rememberTryOnState(enabled);
      if (enabled) reconcilePreviews(true);
    } else {
      openCamera(block, button);
    }
  });

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked || !input.dataset.variantId) return;
    const card = input.closest('product-card');
    if (!card) return;
    for (const gallery of card.querySelectorAll('.card-gallery')) {
      const preview = previews.get(gallery);
      if (preview) preview.syncGalleryImage(input);
    }
  }, true);

  document.addEventListener('load', (event) => {
    const image = event.target;
    if (!enabled || !(image instanceof HTMLImageElement) || image.closest('.lensify-preview')) return;
    const gallery = image.closest('.card-gallery, .product-card__image-wrap');
    previews.get(gallery)?.syncGalleryImage();
  }, true);

  async function restorePreview() {
    try {
      const saved = await previewStorage('readonly', (store) => store.get('latest'));
      if (!saved) return;

      if (Date.now() >= saved.expiresAt) {
        await previewStorage('readwrite', (store) => store.delete('latest'));
        return;
      }

      if (!previewData) {
        previewData = saved;
        previewBlock = getRestoreBlock();
        setTryOnEnabled(wasTryOnEnabled());
        if (enabled) reconcilePreviews();
      }
    } catch (error) {
      console.warn('Could not restore try-on preview', error);
    }
  }

  const productObserver = new MutationObserver((records) => {
    if (!enabled) return;
    const cardSelector = 'product-card, .card-gallery, article.product-card, .product-card__image-wrap, [data-lensify-dialog]';
    for (const record of records) {
      if (record.attributeName !== 'data-active-color') continue;
      const gallery = record.target.closest('article.product-card')?.querySelector('.product-card__image-wrap');
      previews.get(gallery)?.syncGalleryImage();
    }
    if (reconcileFrame !== undefined) return;
    const cardsChanged = records.some((record) => {
      if (record.type === 'attributes') {
        return record.attributeName === 'data-product-id'
          && (record.target.matches(cardSelector) || record.target.matches('.product-card__wishlist'));
      }
      return [...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof Element && (node.matches(cardSelector) || node.querySelector(cardSelector))
      );
    });
    if (!cardsChanged) return;
    reconcileFrame = requestAnimationFrame(() => {
      reconcileFrame = undefined;
      reconcilePreviews();
    });
  });

  function showControls(root) {
    for (const block of root.querySelectorAll('[data-lensify-dialog]')) {
      block.showPopover?.();
    }
  }

  document.addEventListener('shopify:section:load', (event) => showControls(event.target));

  function initialize() {
    showControls(document);
    void restorePreview().then(pruneExpiredOverlays);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
