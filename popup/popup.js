'use strict';

const runtime = globalThis.chrome?.runtime;
const updateButton = document.querySelector('#checkExtensionUpdate');
const versionLabel = document.querySelector('#enhancerVersion');

const installedVersion = runtime?.getManifest?.().version || 'unknown';

function requestExtensionUpdateCheck() {
  return new Promise((resolve, reject) => {
    if (!runtime?.requestUpdateCheck) {
      reject(new Error('Update checking is not available in this browser.'));
      return;
    }

    let settled = false;

    const finish = (resultOrStatus, details = undefined) => {
      if (settled) return;
      settled = true;

      const runtimeError = runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      const result = typeof resultOrStatus === 'string'
        ? { status: resultOrStatus, ...(details || {}) }
        : resultOrStatus;

      resolve(result || { status: 'no_update' });
    };

    try {
      const maybePromise = runtime.requestUpdateCheck(finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish, error => {
          if (settled) return;
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }
    } catch (error) {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

if (versionLabel) {
  versionLabel.textContent = `BraveFox Enhancer v${installedVersion}`;
}

if (updateButton) {
  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    updateButton.textContent = 'Checking for updates…';

    try {
      const result = await requestExtensionUpdateCheck();
      const status = result?.status || 'no_update';

      if (status === 'update_available') {
        updateButton.textContent = result?.version
          ? `Update ${result.version} found`
          : 'Update found';
        return;
      }

      if (status === 'throttled') {
        updateButton.textContent = 'Try again later';
        return;
      }

      updateButton.textContent = 'Up to date';
    } catch (error) {
      console.warn('BraveFox Enhancer update check failed:', error);
      updateButton.textContent = 'Check again';
    } finally {
      updateButton.disabled = false;
    }
  });
}
