/* overlays.js
 * Injects a BraveFox password overlay on targeted webpages (e.g., BlockSite options UI),
 * uses a fixed password, and now exposes a success callback + session unlock token
 * that pwprotection.js can consume.
 *
 * Safe DOM usage: no unsafe innerHTML.
 */

(() => {
  'use strict';

  // Configuration
  const BRAND_NAME = 'BraveFox Enhancer';
  const ICON_PATH = 'icons/icon48.png';
  const FIXED_PASSWORD = '5u89asyadhy2adhg9uh3572y1';

  // TTL for authenticated session from this overlay (5 minutes)
  const AUTH_TTL_MS = 300000;

  // Session unlock token so we don't reprompt on reload for this host
  // Store a millisecond timestamp; consider it valid only within AUTH_TTL_MS
  const SESSION_UNLOCK_PREFIX = 'bravefox_overlay_unlocked:';
  const setSessionUnlockedForHost = (host) => {
    try { sessionStorage.setItem(SESSION_UNLOCK_PREFIX + host, String(Date.now())); } catch {}
  };
  const isSessionUnlockedForHost = (host) => {
    try {
      const raw = sessionStorage.getItem(SESSION_UNLOCK_PREFIX + host);
      const ts = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isFinite(ts)) return false;
      const fresh = (Date.now() - ts) <= AUTH_TTL_MS;
      if (!fresh) {
        // Expired, clear token
        try { sessionStorage.removeItem(SESSION_UNLOCK_PREFIX + host); } catch {}
      }
      return fresh;
    } catch { return false; }
  };

  // Targets to lock. You can add more host/path tests here.
  // Protect more sites here. Each rule can specify:
  // - host: string | RegExp | Array<string|RegExp>  (the hostname must match)
  // - path: RegExp (optional, pathname must also match)
  const PROTECTED_SITES = [
    // Default BlockSite settings page protection:
    { host: /\.?blocksite\.co$/i, path: /^(\/options|\/.*BLOCK_SITES)/i },
    // Add your additional sites below:
    // { host: /(^|\.)example\.com$/i },
  ];

  // If you want a quick test everywhere, set FORCE_ALL = true temporarily.
  // DO NOT leave this true in production if you only want certain pages locked.
  const FORCE_ALL = false;

  // State
  let overlayMounted = false;
  let onSuccessCallback = null; // optional callback passed by consumers (e.g., pwprotection.js)

  function hostMatches(pattern) {
    if (pattern instanceof RegExp) return pattern.test(location.hostname);
    if (typeof pattern === 'string') {
      return location.hostname === pattern || location.hostname.endsWith(`.${pattern}`);
    }
    if (Array.isArray(pattern)) return pattern.some(p => hostMatches(p));
    return false;
  }

  function shouldProtectNow() {
    if (FORCE_ALL) return true;
    for (const rule of PROTECTED_SITES) {
      const okHost = hostMatches(rule.host);
      const okPath = rule.path ? rule.path.test(location.pathname) : true;
      if (okHost && okPath) return true;
    }
    return false;
  }

  function createStyle() {
    const style = document.createElement('style');
    style.setAttribute('data-bravefox-overlay-style', 'true');
    style.textContent = `
      .bravefox-overlay-root {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(245, 246, 250, 0.92);
        backdrop-filter: blur(2px);
      }
      .bravefox-overlay-card {
        width: min(560px, 90vw);
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.12);
        padding: 24px 24px 28px 24px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
        color: #111827;
      }
      .bravefox-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .bravefox-logo {
        width: 32px;
        height: 32px;
        border-radius: 6px;
      }
      .bravefox-brand {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .bravefox-title {
        font-size: 28px;
        font-weight: 800;
        margin: 12px 0 8px 0;
      }
      .bravefox-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f3f4f6;
        border-radius: 10px;
        padding: 6px 6px 6px 12px;
        border: 1px solid #e5e7eb;
      }
      .bravefox-input {
        border: none;
        outline: none;
        background: transparent;
        font-size: 16px;
        padding: 10px 6px;
        width: 100%;
        flex: 1 1 auto;
      }
      .bravefox-submit-btn {
        appearance: none;
        border: none;
        outline: none;
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: #2563eb;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex: 0 0 auto;
      }
      .bravefox-submit-btn:focus-visible,
      .bravefox-input:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
      .bravefox-error {
        margin-top: 10px;
        color: #b91c1c;
        font-size: 13px;
        min-height: 18px;
      }
      .bravefox-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 1px, 1px);
        white-space: nowrap;
        border: 0;
      }
      .bravefox-lock-body {
        overflow: hidden !important;
      }
    `;
    return style;
  }

  function createIcon() {
    const img = document.createElement('img');
    img.className = 'bravefox-logo';
    try {
      // Use chrome.runtime.getURL when available; fall back to ICON_PATH
      const src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL(ICON_PATH)
        : ICON_PATH;
      img.src = src;
    } catch {
      img.src = ICON_PATH;
    }
    img.alt = `${BRAND_NAME} logo`;
    img.referrerPolicy = 'no-referrer';
    return img;
  }

  function buildOverlayContent(options) {
    const { title } = options || {};

    const card = document.createElement('div');
    card.className = 'bravefox-overlay-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'bravefox-title');

    const header = document.createElement('div');
    header.className = 'bravefox-header';

    const logo = createIcon();
    const brand = document.createElement('div');
    brand.className = 'bravefox-brand';
    brand.textContent = BRAND_NAME;

    header.appendChild(logo);
    header.appendChild(brand);

    const titleEl = document.createElement('div');
    titleEl.className = 'bravefox-title';
    titleEl.id = 'bravefox-title';
    titleEl.textContent = title || 'Saatana! Sivu on salasanasuojattu';

    const form = document.createElement('form');
    form.setAttribute('autocomplete', 'off');
    form.setAttribute('spellcheck', 'false');

    const inputRow = document.createElement('div');
    inputRow.className = 'bravefox-input-row';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'bravefox-input';
    input.placeholder = 'Anna se perhanan salasana';
    input.setAttribute('aria-label', 'Password');

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'bravefox-submit-btn';
    submitBtn.setAttribute('aria-label', 'Kirjaudu');
    submitBtn.appendChild(svgIcon('arrow'));

    inputRow.appendChild(input);
    inputRow.appendChild(submitBtn);

    const error = document.createElement('div');
    error.className = 'bravefox-error';
    error.setAttribute('aria-live', 'polite');

    form.appendChild(inputRow);
    form.appendChild(error);

    card.appendChild(header);
    card.appendChild(titleEl);
    card.appendChild(form);

    // Behavior
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const ok = input.value === FIXED_PASSWORD;
      if (ok) {
        // Mark this host unlocked for the session (timestamp)
        setSessionUnlockedForHost(location.hostname);
        // Notify pwprotection.js if present
        try {
          if (window.BraveFoxPasswordProtection && typeof window.BraveFoxPasswordProtection.setAuthentication === 'function') {
            window.BraveFoxPasswordProtection.setAuthentication();
          }
        } catch {}
        // Fire a public event others can listen to
        try { window.dispatchEvent(new CustomEvent('BraveFoxOverlay:unlocked', { detail: { host: location.hostname } })); } catch {}
        // Invoke optional callback set via show({ onSuccess })
        try { if (typeof onSuccessCallback === 'function') onSuccessCallback(); } catch {}
        // Close overlay
        unlock();
      } else {
        error.textContent = 'Incorrect password. Try again.';
        // brief shake
        card.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 180 }
        );
        input.focus();
        input.select();
      }
    });

    // Trap focus within overlay
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const focusables = card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = Array.from(focusables).filter(el => !el.hasAttribute('disabled'));
        if (list.length) {
          const first = list[0];
          const last = list[list.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        // Do not allow closing with Esc
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Auto focus
    setTimeout(() => input.focus(), 0);

    return { card, input, error };
  }

  function svgIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const paths = {
      eye: [
        ['path', { d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z' }],
        ['circle', { cx: '12', cy: '12', r: '3' }],
      ],
      'eye-off': [
        ['path', { d: 'M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-6.94' }],
        ['path', { d: 'M1 1l22 22' }],
        ['path', { d: 'M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88' }],
      ],
      arrow: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'M12 5l7 7-7 7' }],
      ],
    };

    for (const [el, attrs] of paths[name] || []) {
      const node = document.createElementNS(ns, el);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.appendChild(node);
    }
    return svg;
  }

  function mountOverlay({ title }) {
    if (overlayMounted) return;

    overlayMounted = true;
    document.documentElement.classList.add('bravefox-lock-body');

    const root = document.createElement('div');
    root.className = 'bravefox-overlay-root';
    root.setAttribute('data-bravefox-overlay', 'true');

    const { card } = buildOverlayContent({ title });
    root.appendChild(card);

    // Insert style once
    if (!document.querySelector('style[data-bravefox-overlay-style]')) {
      document.documentElement.appendChild(createStyle());
    }

    document.documentElement.appendChild(root);
  }

  function unlock() {
    const root = document.querySelector('[data-bravefox-overlay="true"]');
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
    document.documentElement.classList.remove('bravefox-lock-body');
    overlayMounted = false;
    onSuccessCallback = null; // reset callback after closing
  }

  // Public API on window for other scripts to use if needed
  const api = {
    show(opts = {}) {
      // Allow consumers to pass onSuccess callback and custom title
      onSuccessCallback = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;

      // If already unlocked for this host (within TTL), short-circuit and call success immediately
      if (isSessionUnlockedForHost(location.hostname)) {
        try { if (onSuccessCallback) onSuccessCallback(); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('BraveFoxOverlay:unlocked', {
            detail: { host: location.hostname, alreadyUnlocked: true, ttlMs: AUTH_TTL_MS }
          }));
        } catch {}
        return;
      }

      // If a stale token exists, clear it before showing
      try {
        const raw = sessionStorage.getItem(SESSION_UNLOCK_PREFIX + location.hostname);
        if (raw) {
          const ts = parseInt(raw, 10);
          if (!Number.isFinite(ts) || (Date.now() - ts) > AUTH_TTL_MS) {
            sessionStorage.removeItem(SESSION_UNLOCK_PREFIX + location.hostname);
          }
        }
      } catch {}

      mountOverlay({ title: opts.title || 'Saatana! Sivu on salasanasuojattu' });
    },
    hide() {
      unlock();
    },
    isVisible() {
      return !!document.querySelector('[data-bravefox-overlay="true"]');
    },
    // Allow runtime customization
    addProtectedSite(rule) {
      if (rule && rule.host) PROTECTED_SITES.push(rule);
    },
    setProtectedSites(list) {
      if (Array.isArray(list)) {
        PROTECTED_SITES.splice(0, PROTECTED_SITES.length, ...list);
      }
    },
    forceLock() {
      mountOverlay({ title: 'Saatana! Sivu on salasanasuojattu' });
    },
    // New helpers for session unlock with TTL
    isSessionUnlocked() {
      return isSessionUnlockedForHost(location.hostname);
    },
    setSessionUnlockedForHost,
  };
  try {
    Object.defineProperty(window, 'BraveFoxOverlay', {
      value: api,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  } catch {
    // ignore if cannot define
    window.BraveFoxOverlay = api;
  }

  // Auto-invoke on pages we want to lock
  const shouldLockThisPage = shouldProtectNow();
  if (shouldLockThisPage && !isSessionUnlockedForHost(location.hostname)) {
    const title = 'Saatana! Sivu on salasanasuojattu';
    mountOverlay({ title });
  }
})();