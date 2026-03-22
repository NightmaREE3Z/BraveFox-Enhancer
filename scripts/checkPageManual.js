/* checkPageManual.js
 * Lightweight delegator to overlays.js. Runs at document_start.
 * If overlays.js is present, let it decide. Otherwise, this can force a lock for known targets.
 */

(() => {
  'use strict';

  // If overlays.js exported an API, we use it as the single source of truth.
  function tryInvokeOverlay() {
    // Example: explicitly lock BlockSite options pages if overlays.js didn't already mount itself.
    const isBlockSiteOptions =
      /\.?blocksite\.co$/i.test(location.hostname) &&
      (/^\/options/i.test(location.pathname) || /BLOCK_SITES/i.test(location.pathname));

    if (isBlockSiteOptions && (!window.BraveFoxOverlay || !window.BraveFoxOverlay.isVisible())) {
      // Fall back to a minimal inline request to show overlay via API if available, else no-op.
      if (window.BraveFoxOverlay && typeof window.BraveFoxOverlay.show === 'function') {
        window.BraveFoxOverlay.show({
          title: 'Settings locked',
          subtitle: 'Enter the password to continue',
        });
      }
    }
  }

  // Run as early as we can
  try {
    tryInvokeOverlay();
  } catch {
    // ignore
  }
})();