(() => {
    'use strict';

    const DEBUG = false;
    const STYLE_ID = 'bravefox-chatgpt-style-v2';
    const HIDDEN_CLASS = 'bravefox-chatgpt-hidden';

    function devLog(...args) {
        if (DEBUG) {
            try { console.log('[BraveFox ChatGPT]', ...args); } catch (e) {}
        }
    }

    /* ============================
       CSS
       Inject immediately at document_start. Chrome can sit on /c/<id> SPA routes,
       so waiting for DOMContentLoaded makes the styling feel random/late.
    ============================ */
    function injectStyles() {
        try {
            let style = document.getElementById(STYLE_ID);
            if (!style) {
                style = document.createElement('style');
                style.id = STYLE_ID;
                style.setAttribute('data-bravefox-chatgpt', '1');
            }

            style.textContent = `
                .${HIDDEN_CLASS} {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                }

                /* --- REMOVE GRAY SLAB BEHIND USER CONTENT --- */
                [data-message-author-role="user"] .bg-token-main-surface-secondary,
                [data-message-author-role="user"] .bg-token-message-surface {
                    background: none !important;
                    border: none !important;
                    box-shadow: none !important;
                }

                /* --- USER BUBBLE --- */
                [data-message-author-role="user"] .user-message-bubble-color,
                [data-message-author-role="user"] [class*="user-message-bubble"] {
                    background-color: #cce4ff !important;
                    border-radius: 16px !important;
                    border: 1px solid #a0b8c8 !important;
                    margin-left: auto !important;
                    margin-right: 2% !important;
                    max-width: 98% !important;
                    padding: 12px !important;
                    box-sizing: border-box !important;
                }

                /* --- ASSISTANT BUBBLE --- */
                [data-message-author-role="assistant"] .prose.markdown {
                    background-color: #e9eaea !important;
                    border: 1px solid #cfcfcf !important;
                    border-radius: 16px !important;
                    margin-left: 2% !important;
                    max-width: 98% !important;
                    padding: 12px !important;
                    box-sizing: border-box !important;
                    color: #222 !important;
                }

                /* --- ASSISTANT FEEDBACK BAR --- */
                [data-message-author-role="assistant"] .text-token-text-secondary {
                    background: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin-top: 4px !important;
                }

                /* --- CODE BLOCK OVERRIDES --- */
                .CodeBlock-module__code--KUcqT div,
                [class*="CodeBlock"] div {
                    background-color: #ffffff !important;
                    border: none !important;
                    border-radius: 0 !important;
                }

                .CodeBlock-module__code--KUcqT code,
                [class*="CodeBlock"] code {
                    font-family: "Courier New", monospace !important;
                    font-size: 1rem !important;
                    color: #222 !important;
                }
            `;

            const parent = document.head || document.documentElement;
            if (parent && !style.isConnected) {
                parent.appendChild(style);
            }
        } catch (e) {
            devLog('Style injection failed:', e);
        }
    }

    injectStyles();

    /* ============================
       CLEANUP ONLY (NO RENAMING)
    ============================ */
    const MODELS_TO_REMOVE = new Set([
        'GPT-5 Instant',
        'GPT-5 Thinking mini',
        'GPT-5 Thinking',
        'o3',
        'o4-mini',
    ]);

    function firstLineText(el) {
        return String(el?.innerText || el?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')[0] ? String(el?.innerText || el?.textContent || '').trim().split('\n')[0].trim() : '';
    }

    function hideElement(el) {
        try {
            if (!el || el.classList?.contains(HIDDEN_CLASS)) return;
            el.classList.add(HIDDEN_CLASS);
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
        } catch (e) {}
    }

    function cleanModelMenu(root = document) {
        try {
            const scope = root && root.querySelectorAll ? root : document;
            scope.querySelectorAll('div[role="menuitem"], [role="menuitemradio"], [cmdk-item]').forEach(item => {
                const raw = String(item.innerText || item.textContent || '').trim();
                const first = raw.split('\n')[0].trim();
                if (MODELS_TO_REMOVE.has(first)) {
                    item.remove();
                }
            });
        } catch (e) {
            devLog('Model cleanup failed:', e);
        }
    }

    /* ============================
       CLEAN UI ELEMENTS
    ============================ */
    const TEXT_HIDE_RULES = [
        { selector: 'button, a, div[role="button"]', text: 'Hanki Plus' },
        { selector: 'button, a, div[role="button"]', text: 'Get Plus' },
        { selector: 'div, span, button', text: 'Muisti täynnä' },
        { selector: 'div, span, button', text: 'Memory full' },
        { selector: 'button[aria-label="Päivitä"], button[aria-label="Upgrade"], a[aria-label="Päivitä"], a[aria-label="Upgrade"]', text: '' },
    ];

    function cleanUIElements(root = document) {
        try {
            const scope = root && root.querySelectorAll ? root : document;

            // Stable-ish direct attributes first.
            scope.querySelectorAll('button[aria-label="Päivitä"], a[aria-label="Päivitä"], button[aria-label="Upgrade"], a[aria-label="Upgrade"]').forEach(hideElement);

            TEXT_HIDE_RULES.forEach(({ selector, text }) => {
                scope.querySelectorAll(selector).forEach(el => {
                    const value = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (text && value.includes(text)) hideElement(el);
                });
            });
        } catch (e) {
            devLog('UI cleanup failed:', e);
        }
    }

    let cleanupQueued = false;
    function queueCleanup(root = document) {
        if (cleanupQueued) return;
        cleanupQueued = true;
        const run = () => {
            cleanupQueued = false;
            injectStyles();
            cleanModelMenu(root);
            cleanUIElements(root);
        };
        try {
            requestAnimationFrame(run);
        } catch (e) {
            setTimeout(run, 0);
        }
    }

    function installObserver() {
        try {
            const target = document.body || document.documentElement;
            if (!target) return false;

            const obs = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes && mutation.addedNodes.length) {
                        queueCleanup(mutation.target || document);
                        return;
                    }
                }
            });

            obs.observe(target, { childList: true, subtree: true });
            return true;
        } catch (e) {
            devLog('Observer install failed:', e);
            return false;
        }
    }

    function init() {
        injectStyles();
        cleanModelMenu();
        cleanUIElements();
        installObserver();
        devLog('ChatGPT cleanup active.');
    }

    if (document.body) {
        init();
    } else {
        const earlyObs = new MutationObserver(() => {
            if (document.body) {
                try { earlyObs.disconnect(); } catch (e) {}
                init();
            }
        });
        try {
            earlyObs.observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {}

        document.addEventListener('DOMContentLoaded', init, { once: true });
    }
})();
