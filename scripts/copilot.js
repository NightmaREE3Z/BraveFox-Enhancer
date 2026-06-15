// copilot.js
// BraveFox Enhancer - STRICT GitHub Copilot password protection.
// Protect ONLY https://github.com/copilot and any sub-path under /copilot.
// One-time auth per browser session (sessionStorage). No TTL.
// Uses same password as other BraveFox modules.
//
// Safe DOM usage: no unsafe innerHTML.
// Ends with })(); on last line as required.

(function() {
    'use strict';

    // Configuration
    const PASSWORD = '5u89asyadhy2adhg9uh3572y1';
    const SESSION_KEY = 'bravefox_copilot_auth_session';
    const OVERLAY_UNLOCK_EVENT = 'BraveFoxOverlay:unlocked'; // In case overlay module unlocks
    const OVERLAY_SESSION_PREFIX = 'bravefox_overlay_unlocked:'; // Accept existing overlay host token

    // State
    let initialized = false;
    let isAuthenticated = false;
    let hideStyleEl = null;
    let inlineOverlayEl = null;
    let lastUrl = window.location.href;
    let urlInterval = null;
    let rafId = null;

    /**
     * Simple hash (parity with other modules, though not strictly required).
     */
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + c;
            hash |= 0;
        }
        return hash.toString();
    }

    /**
     * Determine if this page must be protected.
     * Strict: hostname is github.com (or www.github.com) AND pathname starts with /copilot.
     */
    function isCopilotPage() {
        const host = window.location.hostname.toLowerCase();
        if (host !== 'github.com' && host !== 'www.github.com') return false;
        const path = window.location.pathname.toLowerCase();
        // Accept /copilot and anything that begins with /copilot/
        return path === '/copilot' || path.startsWith('/copilot/');
    }

    /**
     * Check if already authenticated for this session.
     */
    function checkAuth() {
        try {
            const token = sessionStorage.getItem(SESSION_KEY);
            const expected = simpleHash(PASSWORD + '::github-copilot');
            if (token && token === expected) {
                isAuthenticated = true;
                return true;
            }
        } catch {}
        isAuthenticated = false;
        return false;
    }

    /**
     * Set authentication (one-time until browser session ends).
     */
    function setAuth() {
        const expected = simpleHash(PASSWORD + '::github-copilot');
        try { sessionStorage.setItem(SESSION_KEY, expected); } catch {}
        isAuthenticated = true;
        showContent();
        removeInlineOverlay();
        console.log('BraveFox Copilot: Auth granted for session.');
        try { window.dispatchEvent(new CustomEvent('bravefoxCopilotAuthenticated')); } catch {}
    }

    /**
     * Clear authentication manually.
     */
    function clearAuth() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        isAuthenticated = false;
        console.log('BraveFox Copilot: Auth cleared.');
    }

    /**
     * Accept overlay's existing unlock token if present (host-limited).
     */
    function adoptOverlaySessionToken() {
        try {
            const host = window.location.hostname;
            const raw = sessionStorage.getItem(OVERLAY_SESSION_PREFIX + host);
            if (!raw) return false;
            // Presence alone is enough to accept for this simplified flow.
            setAuth();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Hide page content.
     */
    function hideContent() {
        if (hideStyleEl) return;
        hideStyleEl = document.createElement('style');
        hideStyleEl.id = 'bravefox-copilot-hide';
        hideStyleEl.type = 'text/css';
        hideStyleEl.textContent = `
            body > *:not(#bravefox-copilot-overlay) { visibility: hidden !important; opacity: 0 !important; }
            html, body { background: #000 !important; }
            #bravefox-copilot-overlay { visibility: visible !important; opacity: 1 !important; display: flex !important; }
            header, nav, .application-main, #js-repo-pjax-container, #js-pjax-container, [data-turbo-body] {
                visibility: hidden !important;
                opacity: 0 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(hideStyleEl);
    }

    /**
     * Show page content.
     */
    function showContent() {
        if (hideStyleEl && hideStyleEl.parentNode) {
            hideStyleEl.parentNode.removeChild(hideStyleEl);
            hideStyleEl = null;
        }
        document.documentElement.style.visibility = 'visible';
        document.documentElement.style.opacity = '1';
        if (document.body) {
            document.body.style.visibility = 'visible';
            document.body.style.opacity = '1';
            document.body.style.background = '';
        }
    }

    /**
     * Fast redirect to ChatGPT (no history entry) while keeping the overlay/blackout up.
     * Ensures no GitHub content glimpse by: re-applying blackout, keeping overlay visible,
     * disabling buttons, and performing redirect on next frame.
     */
    function closeOrGoBack() {
        try {
            // Reinforce blackout just in case
            hideContent();
            if (inlineOverlayEl) {
                inlineOverlayEl.style.visibility = 'visible';
                inlineOverlayEl.style.opacity = '1';
            }
            // Also enforce a black background at document level
            document.documentElement.style.background = '#000';
            if (document.body) document.body.style.background = '#000';
        } catch {}

        // Redirect on next frame to ensure the styles above are committed first
        try {
            requestAnimationFrame(() => {
                try { window.location.replace('https://chatgpt.com/'); } catch {}
            });
        } catch {
            try { window.location.replace('https://chatgpt.com/'); } catch {}
        }
    }

    /**
     * Build inline overlay with a two-step UI:
     * - Step 1: Gate with two buttons ("FUCK YES!", "OH HELL NO!").
     * - Step 2: Password input + submit (existing logic).
     */
    function buildInlineOverlay() {
        if (inlineOverlayEl) return;
        inlineOverlayEl = document.createElement('div');
        inlineOverlayEl.id = 'bravefox-copilot-overlay';
        inlineOverlayEl.style.cssText = `
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: rgba(0,0,0,0.9) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            background: #fff !important;
            padding: 34px 36px !important;
            border-radius: 10px !important;
            width: min(480px, 92vw) !important;
            box-shadow: 0 22px 46px rgba(0,0,0,0.4) !important;
            text-align: center !important;
        `;

        const title = document.createElement('h2');
        title.textContent = 'Ready to conquer the world of JS?';
        title.style.cssText = `
            margin: 0 0 16px 0 !important;
            font-size: 23px !important;
            font-weight: 800 !important;
            color: #222 !important;
        `;

        // STEP 1: Gate view
        const gate = document.createElement('div');
        gate.style.cssText = `
            display: block !important;
        `;

        const gateRow = document.createElement('div');
        gateRow.style.cssText = `
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
            margin-top: 8px !important;
        `;

        const yesBtn = document.createElement('button');
        yesBtn.type = 'button';
        yesBtn.textContent = 'FUCK YES!';
        yesBtn.style.cssText = `
            appearance: none !important;
            border: none !important;
            outline: none !important;
            border-radius: 10px !important;
            height: 44px !important;
            background: #2563eb !important;
            color: #fff !important;
            font-weight: 700 !important;
            cursor: pointer !important;
        `;
        yesBtn.addEventListener('mouseenter', () => yesBtn.style.background = '#1d4ed8');
        yesBtn.addEventListener('mouseleave', () => yesBtn.style.background = '#2563eb');

        const noBtn = document.createElement('button');
        noBtn.type = 'button';
        noBtn.textContent = 'OH HELL NO!';
        noBtn.style.cssText = `
            appearance: none !important;
            border: 2px solid #e5e7eb !important;
            outline: none !important;
            border-radius: 10px !important;
            height: 44px !important;
            background: #f8fafc !important;
            color: #0f172a !important;
            font-weight: 700 !important;
            cursor: pointer !important;
        `;

        gateRow.appendChild(yesBtn);
        gateRow.appendChild(noBtn);
        gate.appendChild(gateRow);

        // STEP 2: Auth view (hidden initially)
        const auth = document.createElement('div');
        auth.style.cssText = `
            display: none !important;
            margin-top: 8px !important;
        `;

        const input = document.createElement('input');
        input.type = 'password';
        input.placeholder = "Gimme the fuckin' password";
        input.setAttribute('aria-label', "Gimme the fuckin' password");
        input.style.cssText = `
            width: 100% !important;
            padding: 12px 14px !important;
            border: 2px solid #ddd !important;
            border-radius: 6px !important;
            font-size: 16px !important;
            outline: none !important;
            transition: border-color .2s !important;
            margin-bottom: 12px !important;
            box-sizing: border-box !important;
        `;
        input.addEventListener('focus', () => input.style.borderColor = '#2563eb');
        input.addEventListener('blur', () => input.style.borderColor = '#ddd');

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Log in';
        button.style.cssText = `
            width: 100% !important;
            padding: 12px 14px !important;
            background: #2563eb !important;
            color: #fff !important;
            font-size: 16px !important;
            border: none !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            transition: background .2s !important;
        `;
        button.addEventListener('mouseenter', () => button.style.background = '#1d4ed8');
        button.addEventListener('mouseleave', () => button.style.background = '#2563eb');

        const error = document.createElement('div');
        error.style.cssText = `
            min-height: 20px !important;
            font-size: 13px !important;
            color: #b91c1c !important;
            margin-top: 4px !important;
        `;

        function submit() {
            if (input.value === PASSWORD) {
                setAuth();
            } else {
                error.textContent = 'Wrong password.';
                input.value = '';
                card.animate(
                    [
                        { transform: 'translateX(0)' },
                        { transform: 'translateX(-6px)' },
                        { transform: 'translateX(6px)' },
                        { transform: 'translateX(0)' }
                    ],
                    { duration: 180 }
                );
                input.focus();
            }
        }

        button.addEventListener('click', submit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submit();
        });

        // Gate buttons behavior
        yesBtn.addEventListener('click', () => {
            gate.style.display = 'none';
            auth.style.display = 'block';
            setTimeout(() => input.focus(), 30);
        });
        noBtn.addEventListener('click', () => {
            // Keep overlay and blackout up; disable buttons and show status, then fast redirect
            try {
                yesBtn.disabled = true;
                noBtn.disabled = true;
                yesBtn.style.opacity = '0.6';
                noBtn.style.opacity = '0.6';
                yesBtn.style.cursor = 'not-allowed';
                noBtn.style.cursor = 'not-allowed';
                title.textContent = 'Heading to ChatGPT...';
            } catch {}
            closeOrGoBack();
        });

        auth.appendChild(input);
        auth.appendChild(button);
        auth.appendChild(error);

        // Mount everything
        card.appendChild(title);
        card.appendChild(gate);
        card.appendChild(auth);
        inlineOverlayEl.appendChild(card);
        (document.body || document.documentElement).appendChild(inlineOverlayEl);

        // Initial focus to primary gate action for quick keyboard flow
        setTimeout(() => yesBtn.focus(), 30);
    }

    function removeInlineOverlay() {
        if (inlineOverlayEl && inlineOverlayEl.parentNode) {
            inlineOverlayEl.parentNode.removeChild(inlineOverlayEl);
            inlineOverlayEl = null;
        }
    }

    /**
     * Override BraveFoxOverlay password placeholder after it mounts.
     * (Kept for parity, though we now use our inline two-step overlay by default.)
     */
    function overrideOverlayPlaceholder() {
        if (!isCopilotPage()) return;
        try {
            const input = document.querySelector('.bravefox-overlay-card input.bravefox-input');
            if (input) {
                input.placeholder = "Gimme the fuckin' password";
                input.setAttribute('aria-label', "Gimme the fuckin' password");
            }
        } catch {}
    }

    /**
     * Show overlay (now always uses our inline two-step overlay for custom UX).
     */
    function showOverlay() {
        hideContent();
        buildInlineOverlay();
    }

    /**
     * Core logic.
     */
    function enforceProtection() {
        if (!isCopilotPage()) {
            showContent();
            removeInlineOverlay();
            return;
        }

        // If auth already done or overlay token adopted
        if (checkAuth() || adoptOverlaySessionToken()) {
            showContent();
            removeInlineOverlay();
        } else {
            showOverlay();
        }
    }

    /**
     * Setup GitHub navigation (Turbo / SPA).
     */
    function setupNavigationWatch() {
        const host = window.location.hostname.toLowerCase();
        if (host !== 'github.com' && host !== 'www.github.com') return;

        // Turbo events
        document.addEventListener('turbo:visit', navEvent);
        document.addEventListener('turbo:load', navEvent);
        document.addEventListener('turbo:render', navEvent);
        document.addEventListener('turbo:before-cache', navEvent);

        // History patch
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function() {
            origPush.apply(history, arguments);
            navEvent();
        };
        history.replaceState = function() {
            origReplace.apply(history, arguments);
            navEvent();
        };

        // popstate / hashchange
        window.addEventListener('popstate', navEvent);
        window.addEventListener('hashchange', navEvent);

        // RAF polling
        const rafLoop = () => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                navEvent();
            }
            rafId = requestAnimationFrame(rafLoop);
        };
        rafLoop();

        // Interval fallback
        urlInterval = setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                navEvent();
            }
        }, 500);
    }

    function navEvent() {
        setTimeout(enforceProtection, 50);
        setTimeout(enforceProtection, 200);
    }

    /**
     * Initialize.
     */
    function initialize() {
        if (initialized) return;
        initialized = true;
        console.log('BraveFox Copilot: Initializing strict /copilot protection.');

        // Listen for overlay global unlock event
        window.addEventListener(OVERLAY_UNLOCK_EVENT, () => {
            if (isCopilotPage() && !isAuthenticated) {
                setAuth();
            }
        });

        setupNavigationWatch();
        enforceProtection();

        // Mutation observer to re-assert overlay / hidden content if DOM changes pre-auth
        const mo = new MutationObserver(() => {
            if (isCopilotPage() && !isAuthenticated) {
                if (!hideStyleEl) hideContent();
                if (!inlineOverlayEl && !(window.BraveFoxOverlay && window.BraveFoxOverlay.isVisible && window.BraveFoxOverlay.isVisible())) {
                    showOverlay();
                }
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });

        window.addEventListener('beforeunload', () => {
            try { mo.disconnect(); } catch {}
            if (urlInterval) clearInterval(urlInterval);
            if (rafId) cancelAnimationFrame(rafId);
        });
    }

    /**
     * Public API
     */
    window.BraveFoxCopilotProtection = {
        initialize,
        isAuthenticated: () => isAuthenticated,
        clearAuthentication: clearAuth,
        isCopilotPage,
        forcePrompt: () => {
            clearAuth();
            if (isCopilotPage()) showOverlay();
        },
        getSessionKey: () => SESSION_KEY
    };

    console.log('BraveFox Copilot: Module loaded.');

    // Auto-init if on github.com domain (so that navigation watch starts early).
    if (window.location.hostname.toLowerCase().includes('github.com')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize, { once: true });
        } else {
            initialize();
        }
    }
})();