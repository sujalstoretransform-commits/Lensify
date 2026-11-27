(() => {
  let viewerLibrary;
  const sessions = new WeakMap();
  const libraryTimeout = 10000;

  function loadViewerLibrary() {
    if (typeof window.Shopify?.ModelViewerUI === 'function' || customElements.get('model-viewer')) {
      return Promise.resolve();
    }

    viewerLibrary ??= (async () => {
      let loadError;
      window.Shopify.loadFeatures([{
        name: 'model-viewer-ui',
        version: '1.0',
        onLoad(errors) {
          if (errors?.length || errors instanceof Error) loadError = errors;
        },
      }]);

      const deadline = Date.now() + libraryTimeout;
      while (Date.now() < deadline) {
        if (typeof window.Shopify.ModelViewerUI === 'function' || customElements.get('model-viewer')) return;
        if (loadError) throw loadError;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Shopify ModelViewerUI did not become available');
    })().catch((error) => {
      viewerLibrary = undefined;
      throw error;
    });

    return viewerLibrary;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.lensify-frame-launch');
    const block = button?.closest('[data-lensify-frame-viewer]');
    if (!block) return;

    const dialog = block.querySelector('dialog');
    if (dialog.open) return;

    const stage = dialog.querySelector('[data-frame-stage]');
    const hint = dialog.querySelector('[data-frame-hint]');
    const loading = dialog.querySelector('[data-frame-loading]');
    const error = dialog.querySelector('[data-frame-error]');
    sessions.get(dialog)?.abort();
    const session = new AbortController();
    sessions.set(dialog, session);
    const { signal } = session;

    function showError(message, cause) {
      if (signal.aborted || !dialog.open) return;
      console.warn(`[Lensify 360°] ${message}`, cause);
      stage.replaceChildren();
      hint.hidden = true;
      loading.hidden = true;
      error.hidden = false;
    }

    hint.hidden = true;
    error.hidden = true;
    loading.hidden = false;
    stage.replaceChildren();
    dialog.showModal();
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      session.abort();
      sessions.delete(dialog);
      stage.replaceChildren();
    }, { signal });

    try {
      const content = block.querySelector('template').content.cloneNode(true);
      const viewer = content.querySelector('model-viewer');
      if (!viewer?.getAttribute('src')) {
        showError('Shopify did not provide a model URL');
        return;
      }
      viewer.addEventListener('load', () => {
        loading.hidden = true;
        hint.hidden = false;
      }, { once: true, signal });
      viewer.addEventListener('error', (event) => {
        showError('Could not render the product model', {
          src: viewer.getAttribute('src'),
          detail: event.detail,
        });
      }, { once: true, signal });
      stage.replaceChildren(content);
      await loadViewerLibrary();
      if (signal.aborted || !dialog.open || !viewer.isConnected) return;

      const ModelViewerUI = window.Shopify?.ModelViewerUI;
      if (typeof ModelViewerUI === 'function') {
        const viewerUI = new ModelViewerUI(viewer);
        viewerUI.play();
      }
    } catch (cause) {
      showError('Could not initialize the model viewer', cause);
    }
  });
})();
