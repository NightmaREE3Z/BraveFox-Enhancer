// BraveFox Enhancer - BlockSite "Delete Account" Element Remover (Universal)
// Only removes "delete account" elements from BlockSite pages
// Keeps CSS pre-hiding and universal coverage, but DOES NOT touch trash icons, popup remove buttons, or general blocksite elements

(function() {
    'use strict';

    // === BRAVEFOX COMPLETE SITE EXCLUSIONS ===
    // These sites must run exactly as if BraveFox Enhancer were disabled.
    function braveFoxIsCompletelyExcludedSite() {
        const hosts = [];
        const addHost = value => {
            const host = String(value || '').toLowerCase().replace(/\.$/, '');
            if (host && !hosts.includes(host)) hosts.push(host);
        };

        try { addHost(window.location.hostname); } catch (e) {}
        try {
            const origins = window.location.ancestorOrigins;
            if (origins) {
                for (let i = 0; i < origins.length; i++) {
                    try { addHost(new URL(origins[i]).hostname); } catch (e) {}
                }
            }
        } catch (e) {}
        try {
            if (window.top === window) addHost(window.location.hostname);
            else addHost(window.top.location.hostname);
        } catch (e) {}

        return hosts.some(host =>
            host === 'is.fi' || host.endsWith('.is.fi') ||
            host === 'iltalehti.fi' || host.endsWith('.iltalehti.fi') ||
            /^translate\.google\./i.test(host)
        );
    }

    if (braveFoxIsCompletelyExcludedSite()) return;

    
    // Configuration
    const CONFIG = {
        targetUrls: [
		'user.blocksite.co/options/BLOCK_SITES',
		'user.blocksite.co/settings/account',
		'blocksite.co',
		'blocksite',
		'user.blocksite.co/blocked',
	 	'user.blocksite.co/app',
	 	'user.blocksite.co'
        ],
        selectors: [
            // Delete Account selectors only
		'[data-automation="delete-account-box"]',
		'[data-automation="delete-account"]',
		'[data-automation="change-password-box"]',
		'[data-automation="reset-password"]',
		'.sc-ckIfTa.gFXZNo[data-automation="change-password-box"]',
		'.sc-gsFSXq.dYOPBG[data-automation="reset-password"]',
		'.sc-dCrlla.gNWLCm[data-automation="change-password-box"]',
		'.sc-kBpyjw.dprlnK',
		'.sc-cscAeM.hllMaI',
		'.sc-dxcDKg.layfBB[data-automation="delete-account"]',
		'[data-automation="box-title"]',
		'[data-automation="box-subTitle"]'
        ],
        // CSS selectors for pre-hiding elements
        hideSelectors: [
		'[data-automation="delete-account-box"]',
		'[data-automation="delete-account"]',
		'.sc-cscAeM.hllMaI',
		'.sc-ckIfTa.gFXZNo[data-automation="change-password-box"]',
		'.sc-dCrlla.gNWLCm[data-automation="change-password-box"]',
		'.sc-kBpyjw.dprlnK',
		'.sc-gsFSXq.dYOPBG[data-automation="reset-password"]',
		'[data-automation="change-password-box"]',
		'[data-automation="reset-password"]',
		'.sc-dxcDKg.layfBB[data-automation="delete-account"]',
		'[data-automation="box-title"]:has-text("Delete Account")',
		'[data-automation="box-subTitle"]:has-text("permanently delete")',
		'div:has-text("Delete Account")',
		'div:has-text("Poista")',
		'div:has-text("You will permanently delete")'
        ],
        observerConfig: {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true
        },
        retryInterval: 100,
        maxRetries: 600,
        continuousMonitoringInterval: 1000,
        urlCheckInterval: 500
    };
    
    let retryCount = 0;
    let observer = null;
    let injectedStyleSheet = null;
    let continuousMonitorTimer = null;
    let urlMonitorTimer = null;
    let isInitialized = false;
    let lastProcessedUrl = '';
    let blockSiteRedirectTimer = null;
    let blockSiteCountdownTimer = null;
    let blockSiteRedirectDeadline = 0;
    let lastBlockSiteHistoryCleanupRequest = 0;
    let lastBlockSiteHistoryCleanupUrl = '';
    const BLOCKSITE_SAFE_DESTINATION = 'about:blank'; // last-ditch local fallback only; background.js sends the tab to New Tab
    const EXTENSION_BLOCKED_PAGE_TEXT = 'Laajennus on estänyt tämän sivun';
    
    // Utils
    function getClassNameAsString(element) {
        if (!element || !element.className) return '';
        if (typeof element.className === 'object' && element.className.toString) return element.className.toString();
        if (typeof element.className === 'string') return element.className;
        return '';
    }
    function getIdAsString(element) {
        if (!element || !element.id) return '';
        return typeof element.id === 'string' ? element.id : '';
    }
    function getTextContentAsString(element) {
        if (!element || !element.textContent) return '';
        return typeof element.textContent === 'string' ? element.textContent : '';
    }
    function isNextDNSDomain() {
        const href = window.location.href;
        return /^https?:\/\/(my\.)?nextdns\.io(\/|$)/i.test(href);
    }
    function isBlockSiteBlockedPage() {
        const href = window.location.href;
        // New BlockSite: /app/blocked?word=...
        // Older BlockSite: /blocked?word=... or /blocked/blocked?word=...
        return /^https?:\/\/user\.blocksite\.co\/(?:app\/blocked|blocked(?:\/blocked)?)(?:[?#]|$)/i.test(href);
    }
    function isOldBlockSiteBlockedPage() {
        const href = window.location.href;
        return /^https?:\/\/user\.blocksite\.co\/blocked(?:\/blocked)?(?:[?#]|$)/i.test(href);
    }
    function markBlockSiteBlockedPage() {
        try {
            const root = document.documentElement;
            if (!root) return false;
            const active = isBlockSiteBlockedPage();
            root.classList.toggle('bravefox-blocksite-blocked-page', active);
            root.classList.toggle('bravefox-blocksite-old-blocked-page', active && isOldBlockSiteBlockedPage());
            root.classList.toggle('bravefox-blocksite-new-blocked-page', active && !isOldBlockSiteBlockedPage());
            if (active) {
                requestBlockSiteHistoryCleanup('blocksite-blocked-page-detected');
                logBlockSiteRedirectReason();
                if (!root.classList.contains('bravefox-blocksite-ui-ready')) {
                    root.classList.add('bravefox-blocksite-ui-pending');
                }
            } else {
                root.classList.remove('bravefox-blocksite-ui-pending', 'bravefox-blocksite-ui-ready');
                clearBlockSiteRedirectTimer();
            }
            return active;
        } catch (e) {
            return false;
        }
    }
    function markBlockSiteUiReady() {
        try {
            if (!isBlockSiteBlockedPage()) return;
            const root = document.documentElement;
            if (!root) return;
            root.classList.remove('bravefox-blocksite-ui-pending');
            root.classList.add('bravefox-blocksite-ui-ready');
        } catch (e) {}
    }
    function getBlockedWordFromUrl() {
        try {
            const url = new URL(window.location.href);
            const raw = url.searchParams.get('word');
            if (!raw) return '';
            return raw.trim();
        } catch (e) {
            return '';
        }
    }
    function formatBlockedWord(word) {
        if (!word) return '';
        const cleaned = word.replace(/\+/g, ' ').trim();
        if (!cleaned) return '';
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    function normalizeSearchText(value) {
        try {
            return decodeURIComponent(String(value || '').replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim();
        } catch (e) {
            return String(value || '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    function getSearchTextFromPossibleUrl(value) {
        const raw = normalizeSearchText(value);
        if (!raw) return '';

        try {
            const maybeUrl = new URL(raw);
            const q = maybeUrl.searchParams.get('q') || maybeUrl.searchParams.get('query') || maybeUrl.searchParams.get('search') || maybeUrl.searchParams.get('text') || '';
            if (q && q.trim()) return normalizeSearchText(q);
        } catch (e) {}

        return raw;
    }

    function getAttemptedSearchFromBlockSiteContext() {
        const urlCandidates = [];
        try {
            const current = new URL(window.location.href);
            ['q', 'query', 'search', 'text', 'url', 'blockedUrl', 'blockedURL', 'sourceUrl', 'sourceURL', 'ref', 'referrer', 'from', 'target'].forEach(key => {
                const value = current.searchParams.get(key);
                if (value) urlCandidates.push(value);
            });
        } catch (e) {}

        try {
            if (document.referrer) urlCandidates.push(document.referrer);
        } catch (e) {}

        for (const candidate of urlCandidates) {
            const search = getSearchTextFromPossibleUrl(candidate);
            if (search) return search;
        }

        return normalizeSearchText(getBlockedWordFromUrl());
    }

    function blockSiteSearchLooksUseful(search, blockedWord) {
        try {
            const value = normalizeSearchText(search);
            const term = normalizeSearchText(blockedWord);
            if (!value) return false;
            if (!term) return true;
            if (value.toLowerCase() === term.toLowerCase()) return false;
            return value.toLowerCase().includes(term.toLowerCase()) || value.length > term.length + 2;
        } catch (e) {
            return false;
        }
    }

    function requestRecentGoogleSearchForBlockSite(blockedWord, callback) {
        try {
            const runtime = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
                ? chrome.runtime
                : null;
            if (!runtime) {
                callback && callback('');
                return false;
            }

            runtime.sendMessage({
                type: 'BRAVEFOX_GET_LAST_GOOGLE_QUERY_CONTEXT',
                blockedWord: normalizeSearchText(blockedWord),
                pageUrl: window.location.href,
                referrer: document.referrer || '',
                timestamp: new Date().toISOString()
            }, (response) => {
                try { void chrome.runtime.lastError; } catch (e) {}
                try {
                    const search = normalizeSearchText(response && (response.attemptedSearch || response.query || ''));
                    callback && callback(search);
                } catch (e) {
                    callback && callback('');
                }
            });
            return true;
        } catch (e) {
            try { callback && callback(''); } catch (_) {}
            return false;
        }
    }

    function resolveBlockSiteAttemptedSearchAsync(blockedWord, callback) {
        const fallback = getAttemptedSearchFromBlockSiteContext();
        if (blockSiteSearchLooksUseful(fallback, blockedWord)) {
            callback && callback(fallback);
            return;
        }

        const requested = requestRecentGoogleSearchForBlockSite(blockedWord, (search) => {
            if (blockSiteSearchLooksUseful(search, blockedWord)) {
                callback && callback(search);
            } else {
                callback && callback(fallback);
            }
        });

        if (!requested) {
            callback && callback(fallback);
        }
    }

    function escapeForRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function fillHighlightedText(target, text, trigger) {
        if (!target) return;
        target.textContent = '';

        const value = String(text || '').trim();
        const term = String(trigger || '').trim();
        if (!value) {
            target.textContent = 'Ei tiedossa';
            return;
        }

        if (!term) {
            target.textContent = value;
            return;
        }

        try {
            const re = new RegExp(escapeForRegExp(term), 'ig');
            let last = 0;
            let match;
            let hit = false;
            while ((match = re.exec(value)) !== null) {
                hit = true;
                if (match.index > last) target.appendChild(document.createTextNode(value.slice(last, match.index)));
                const mark = document.createElement('mark');
                mark.className = 'bravefox-blocksite-trigger-highlight';
                mark.textContent = value.slice(match.index, match.index + match[0].length);
                target.appendChild(mark);
                last = match.index + match[0].length;
                if (match[0].length === 0) re.lastIndex++;
            }
            if (last < value.length) target.appendChild(document.createTextNode(value.slice(last)));
            if (!hit) target.textContent = value;
        } catch (e) {
            target.textContent = value;
        }
    }

    let lastBlockSiteRedirectLogKey = '';
    let lastBlockSiteRedirectLogRequestKey = '';
    let lastBlockSiteRedirectLogRequestAt = 0;
    function logBlockSiteRedirectReason() {
        try {
            if (!isBlockSiteBlockedPage()) return;
            const blockedWord = normalizeSearchText(getBlockedWordFromUrl());
            const requestKey = `${blockedWord}::${window.location.href}`;
            const now = Date.now();
            if (requestKey === lastBlockSiteRedirectLogRequestKey && now - lastBlockSiteRedirectLogRequestAt < 1500) return;
            lastBlockSiteRedirectLogRequestKey = requestKey;
            lastBlockSiteRedirectLogRequestAt = now;

            resolveBlockSiteAttemptedSearchAsync(blockedWord, (attemptedSearch) => {
                try {
                    const finalAttemptedSearch = normalizeSearchText(attemptedSearch || getStickyBlockSiteAttemptedSearch(blockedWord, blockedWord) || getAttemptedSearchFromBlockSiteContext());
                    if (blockedWord && !blockSiteSearchLooksUseful(finalAttemptedSearch, blockedWord)) return;
                    const key = `${blockedWord}::${finalAttemptedSearch}::${window.location.href}`;
                    if (key === lastBlockSiteRedirectLogKey) return;
                    lastBlockSiteRedirectLogKey = key;

                    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
                    chrome.runtime.sendMessage({
                        type: 'BRAVEFOX_REDIRECT_LOG',
                        source: 'BlockSite',
                        blockedWord: blockedWord,
                        attemptedSearch: finalAttemptedSearch,
                        context: 'blocksite-blocked-page',
                        pageUrl: window.location.href,
                        referrer: document.referrer || '',
                        timestamp: new Date().toISOString()
                    }, () => {
                        try { void chrome.runtime.lastError; } catch (e) {}
                    });
                } catch (e) {}
            });
        } catch (e) {}
    }
    function getSecondsUntilBlockSiteRedirect() {
        if (!blockSiteRedirectDeadline) return 60;
        return Math.max(0, Math.ceil((blockSiteRedirectDeadline - Date.now()) / 1000));
    }
    function clearBlockSiteRedirectTimer() {
        if (blockSiteRedirectTimer) clearTimeout(blockSiteRedirectTimer);
        if (blockSiteCountdownTimer) clearInterval(blockSiteCountdownTimer);
        blockSiteRedirectTimer = null;
        blockSiteCountdownTimer = null;
        blockSiteRedirectDeadline = 0;
    }
    function requestBlockSiteHistoryCleanup(reason = 'content-script') {
        try {
            const href = window.location.href || '';
            if (!/blocksite/i.test(href)) return;

            const now = Date.now();
            if (href === lastBlockSiteHistoryCleanupUrl && now - lastBlockSiteHistoryCleanupRequest < 5000) return;
            lastBlockSiteHistoryCleanupUrl = href;
            lastBlockSiteHistoryCleanupRequest = now;

            const runtime = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
                ? chrome.runtime
                : null;
            if (!runtime) return;
            runtime.sendMessage({ type: 'BRAVEFOX_CLEAN_BLOCKSITE_HISTORY', reason, currentUrl: href }, () => {
                try { void chrome.runtime.lastError; } catch (e) {}
            });
        } catch (e) {}
    }
    function requestBackgroundCloseBlockSitePage(callback) {
        try {
            const runtime = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
                ? chrome.runtime
                : null;
            if (!runtime) return false;
            runtime.sendMessage({ type: 'BRAVEFOX_CLOSE_BLOCKSITE_PAGE' }, (response) => {
                try { void chrome.runtime.lastError; } catch (e) {}
                if (typeof callback === 'function') callback(response);
            });
            return true;
        } catch (e) {
            return false;
        }
    }
    function goToSafeBlankPage() {
        function fallbackDirectNavigation() {
            // Do NOT use chrome://newtab/ from a content script. Chrome/Brave rejects it as
            // a protected internal page and throws "Not allowed to load local resource".
            try {
                window.location.replace(BLOCKSITE_SAFE_DESTINATION);
            } catch (e) {
                try { window.location.href = BLOCKSITE_SAFE_DESTINATION; } catch (ignored) {}
            }
        }

        try {
            const runtime = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
                ? chrome.runtime
                : null;

            if (!runtime) {
                fallbackDirectNavigation();
                return;
            }

            let responded = false;
            const fallbackTimer = setTimeout(() => {
                if (!responded) fallbackDirectNavigation();
            }, 450);

            runtime.sendMessage({ type: 'BRAVEFOX_GO_SAFE_HOME' }, (response) => {
                responded = true;
                clearTimeout(fallbackTimer);
                let lastError = null;
                try { lastError = chrome.runtime && chrome.runtime.lastError; } catch (e) {}
                if (lastError || !response || response.ok !== true) fallbackDirectNavigation();
            });
        } catch (e) {
            fallbackDirectNavigation();
        }
    }
    function closeOrBlankBlockSitePage(event) {
        try {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) event.stopImmediatePropagation();
            }
        } catch (e) {}

        clearBlockSiteRedirectTimer();
        requestBlockSiteHistoryCleanup('blocksite-close-click');

        if (/blocksite/i.test(window.location.href || '')) {
            const backgroundCloseRequested = requestBackgroundCloseBlockSitePage((response) => {
                if (response && response.ok === true) return;
                // No window.close() fallback here. Content scripts are only allowed to close
                // tabs/windows they opened themselves, so using window.close() just creates
                // console errors on BlockSite pages. Background.js should send it to New Tab;
                // if that fails entirely, use the local about:blank fallback.
                setTimeout(() => {
                    if (!document.hidden) goToSafeBlankPage();
                }, 150);
            });

            if (backgroundCloseRequested) return;
        }

        setTimeout(() => {
            if (!document.hidden) goToSafeBlankPage();
        }, 150);
    }
    function updateBlockSiteRedirectCountdown() {
        // v6: automatic BlockSite countdown/close removed. Manual "Sulje sivu" button stays.
        clearBlockSiteRedirectTimer();
        try {
            document.querySelectorAll('.bravefox-blocksite-redirect-timer').forEach(timer => timer.remove());
        } catch (e) {}
    }
    function ensureBlockSiteAutoRedirectTimer() {
        // v6: no auto-close timer. This prevents Chrome's automatic-close warning while
        // keeping the manual Close Page button behavior intact.
        clearBlockSiteRedirectTimer();
        try {
            document.querySelectorAll('.bravefox-blocksite-redirect-timer').forEach(timer => timer.remove());
        } catch (e) {}
    }
    function isExtensionBlockedPageNode(node) {
        try {
            if (!node) return false;
            if (node.nodeType === Node.TEXT_NODE) {
                return (node.nodeValue || '').includes(EXTENSION_BLOCKED_PAGE_TEXT);
            }
            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return false;
            if (node.matches && node.matches('p') && getTextContentAsString(node).includes(EXTENSION_BLOCKED_PAGE_TEXT)) return true;
            const paragraphs = node.querySelectorAll ? node.querySelectorAll('p') : [];
            for (const p of paragraphs) {
                if (getTextContentAsString(p).includes(EXTENSION_BLOCKED_PAGE_TEXT)) return true;
            }
        } catch (e) {}
        return false;
    }
    function redirectExtensionBlockedPageIfPresent(node) {
        try {
            const target = node || document;
            if (!isExtensionBlockedPageNode(target)) return false;
            const root = document.documentElement;
            if (root) root.classList.add('bravefox-extension-blocked-page');
            if (document.body) hideElementNoGlimpse(document.body);
            setTimeout(goToSafeBlankPage, 0);
            return true;
        } catch (e) {
            return false;
        }
    }
    function transformBlockSiteBackButton() {
        try {
            if (!markBlockSiteBlockedPage()) return 0;
            let changed = 0;
            const candidates = new Set();

            document.querySelectorAll('[data-automation="block-page-go-back"]').forEach(button => candidates.add(button));

            // Older BlockSite build: the go-back control is an icon-only button using back.svg.
            document.querySelectorAll('button').forEach(button => {
                try {
                    if (button.querySelector('img[src*="/images/blockpage/back.svg"], img[src*="back.svg"]')) {
                        candidates.add(button);
                    }
                } catch (e) {}
            });

            candidates.forEach(button => {
                const textWrapper = button.querySelector('.Button_textWrapper__GSZCD') || button.querySelector('span') || button;
                if (textWrapper && textWrapper.textContent !== 'Sulje sivu') {
                    textWrapper.textContent = 'Sulje sivu';
                    changed++;
                }
                button.setAttribute('type', 'button');
                button.setAttribute('data-bravefox-close-page', 'true');
                button.setAttribute('title', 'Sulje sivu');
                button.setAttribute('aria-label', 'Sulje sivu');
                if (!button.__bravefoxClosePageHandler) {
                    const handler = closeOrBlankBlockSitePage;
                    button.__bravefoxClosePageHandler = handler;
                    button.addEventListener('click', handler, true);
                    button.addEventListener('auxclick', handler, true);
                }
            });
            return changed;
        } catch (e) {
            return 0;
        }
    }

    function normalizeBlockSiteBlockedPageCopy() {
        try {
            if (!isBlockSiteBlockedPage()) return;
            const nodes = Array.from(document.querySelectorAll('span, div, h1, h2'));
            nodes.forEach(node => {
                try {
                    const text = getTextContentAsString(node).replace(/\s+/g, ' ').trim();
                    if (!text) return;

                    // Old build can show "O-ou!" while new/custom builds already show "Sivusto estetty!".
                    if (text === 'O-ou!' || text === 'Sivusto estetty!' || text === 'Site blocked!' || text === 'Site is blocked!') {
                        node.textContent = 'Sivusto estetty!';
                        node.classList.add('bravefox-blocksite-title');
                    }

                    // Old build sentence: Ilmeisesti estit sanan "chewbacca". Pidetään siitä kiinni.
                    // Keep the short custom message consistent on both old/new BlockSite pages.
                    if (/Ilmeisesti estit sanan/i.test(text) || text === 'Suksi vittuun siitä.' || text === 'Suksi vittuun siitä') {
                        node.textContent = 'Suksi vittuun siitä.';
                        node.classList.add('bravefox-blocksite-subtitle');
                    }
                } catch (e) {}
            });
        } catch (e) {}
    }


    function upsertNewBlockSiteSubtitleFallback() {
        try {
            const fallbackId = 'bravefox-blocksite-subtitle-fallback';
            const existing = document.getElementById(fallbackId);

            // Old BlockSite already exposes the subtitle node reliably. Leave that version alone.
            if (!isBlockSiteBlockedPage() || isOldBlockSiteBlockedPage()) {
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                return;
            }

            let subtitle = existing;
            if (!subtitle) {
                subtitle = document.createElement('div');
                subtitle.id = fallbackId;
                subtitle.className = 'bravefox-blocksite-subtitle';
                subtitle.setAttribute('aria-hidden', 'true');
            }

            subtitle.textContent = 'Suksi vittuun siitä.';
            if (subtitle.parentNode !== document.body && document.body) {
                document.body.appendChild(subtitle);
            }
        } catch (e) {}
    }

    function moveBlockSiteCloseButtonUnderCard() {
        try {
            if (!isBlockSiteBlockedPage()) return 0;
            const card = document.getElementById('bravefox-blocksite-blocked-word-card');
            if (!card || !card.parentNode) return 0;

            let button = document.querySelector('[data-bravefox-close-page="true"]');
            if (!button) {
                button = Array.from(document.querySelectorAll('button')).find(btn => {
                    try {
                        const text = getTextContentAsString(btn).replace(/\s+/g, ' ').trim().toLowerCase();
                        return text === 'sulje sivu' || !!btn.querySelector('img[src*="/images/blockpage/back.svg"], img[src*="back.svg"]');
                    } catch (e) { return false; }
                });
            }
            if (!button) return 0;

            // Old icon-only button: replace the icon payload with real text.
            if (button.querySelector && button.querySelector('img[src*="back.svg"]')) {
                button.textContent = 'Sulje sivu';
            }
            if (getTextContentAsString(button).replace(/\s+/g, ' ').trim() !== 'Sulje sivu') {
                button.textContent = 'Sulje sivu';
            }

            button.setAttribute('type', 'button');
            button.setAttribute('data-bravefox-close-page', 'true');
            button.setAttribute('title', 'Sulje sivu');
            button.setAttribute('aria-label', 'Sulje sivu');
            button.classList.add('bravefox-blocksite-centered-close-button');
            if (!button.__bravefoxClosePageHandler) {
                const handler = closeOrBlankBlockSitePage;
                button.__bravefoxClosePageHandler = handler;
                button.addEventListener('click', handler, true);
                button.addEventListener('auxclick', handler, true);
            }

            let row = document.getElementById('bravefox-blocksite-close-row');
            if (!row) {
                row = document.createElement('div');
                row.id = 'bravefox-blocksite-close-row';
                row.className = 'bravefox-blocksite-action-row';
            }

            if (row.parentNode !== card.parentNode || row.previousElementSibling !== card) {
                card.parentNode.insertBefore(row, card.nextSibling);
            }
            if (button.parentNode !== row) row.appendChild(button);
            return 1;
        } catch (e) {
            return 0;
        }
    }

    function updateBlockSiteBlockedPageUi() {
        try {
            if (!markBlockSiteBlockedPage()) return;
            requestBlockSiteHistoryCleanup('blocksite-ui-update');
            if (!document.body) return;

            const hasBlockedPageShell = document.querySelector(
                '[data-automation="block-page-go-back"], [class^="BlockPageContent_heroContent__"], [class*=" BlockPageContent_heroContent__"], [class^="Blocked_blockPageContentWrapper__"], [class*=" Blocked_blockPageContentWrapper__"], .sc-bNdpFP, .sc-gVaSRo, .sc-uYXSi, button:has(img[src*="back.svg"]), button:has(img[src*="password.svg"])'
            );
            if (!hasBlockedPageShell) return;

            hideBlockSiteBlockedPageJunk();
            upsertBlockedWordCard();
            transformBlockSiteBackButton();
            normalizeBlockSiteBlockedPageCopy();
            upsertNewBlockSiteSubtitleFallback();
            moveBlockSiteCloseButtonUnderCard();
            ensureBlockSiteAutoRedirectTimer();
            markBlockSiteUiReady();
        } catch (e) {
            console.warn('BraveFox: Error updating BlockSite blocked page UI:', e);
        }
    }

    function hideElementNoGlimpse(element) {
        if (!element || !element.style) return false;
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('transition', 'none', 'important');
        element.style.setProperty('animation', 'none', 'important');
        return true;
    }
    function hideBlockSiteBlockedPageJunk() {
        if (!markBlockSiteBlockedPage()) return 0;

        let hiddenCount = 0;
        const blockedPageSelectors = [
            '[data-automation="block-page-password-protection"]',
            '[class^="BlockPageWidgets_blockPageWidgets__"]',
            '[class*=" BlockPageWidgets_blockPageWidgets__"]',
            '[class^="FeatureStrip_featureStrip__"]',
            '[class*=" FeatureStrip_featureStrip__"]',
            '[class^="CrossDeviceSync_crossDeviceSync__"]',
            '[class*=" CrossDeviceSync_crossDeviceSync__"]',
            '[class^="RateBlockSite_rateBlockSite__"]',
            '[class*=" RateBlockSite_rateBlockSite__"]',
            '[data-automation="block-page-rate-dismiss"]',
            // New BlockSite header/logo strip. We provide our own consistent copy/layout.
            '[class^="BlockPageHeader_blockPageHeaderWrapper__"]',
            '[class*=" BlockPageHeader_blockPageHeaderWrapper__"]',
            '[class^="BlockPageHeader_blockedLogoWrapper__"]',
            '[class*=" BlockPageHeader_blockedLogoWrapper__"]',
            '[class^="BlockPageHeader_blockedLogoText__"]',
            '[class*=" BlockPageHeader_blockedLogoText__"]',
            // Older BlockSite blocked-page junk from Elements.html / dad's build.
            'button:has(img[src*="/images/blockpage/password.svg"])',
            'button:has(img[src*="password.svg"]):not([data-bravefox-close-page="true"])',
            '.sc-hEKqXB.bxboqW',
            '[class^="sc-hEKqXB"], [class*=" sc-hEKqXB"]',
            '.sc-hTwFKb.ctupLK',
            '[class^="sc-hTwFKb"], [class*=" sc-hTwFKb"]',
            'button:has(img[src*="/images/blockpage/pallet.svg"])',
            'button:has(img[src*="pallet.svg"])',
            '.sc-ebnDkq.iIdujt',
            '[class^="sc-ebnDkq"], [class*=" sc-ebnDkq"]',
            '.sc-bTllmR.dxEkRz',
            '[class^="sc-bTllmR"], [class*=" sc-bTllmR"]',
            '.sc-hMxIkD.gRMMdD',
            '[class^="sc-hMxIkD"], [class*=" sc-hMxIkD"]',
            '.sc-fwPIEZ.kRfseK',
            '[class^="sc-fwPIEZ"], [class*=" sc-fwPIEZ"]',
            'button:has(img[src*="/images/blockpage/share.svg"])',
            'button:has(img[src*="share.svg"])'
        ];

        blockedPageSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    if (hideElementNoGlimpse(element)) hiddenCount++;
                });
            } catch (e) {}
        });

        return hiddenCount;
    }
    function setBlockSiteSearchCardValue(rawBlockedWord, blockedWord, attemptedSearch) {
        try {
            const card = document.getElementById('bravefox-blocksite-blocked-word-card');
            if (!card) return;
            const searchValueEl = card.querySelector('.bravefox-blocksite-search-value');
            if (!searchValueEl) return;

            const term = rawBlockedWord || blockedWord;
            const value = normalizeSearchText(attemptedSearch);
            const current = normalizeSearchText(searchValueEl.getAttribute('data-bravefox-current-search') || '');
            const currentUseful = blockSiteSearchLooksUseful(current, term);
            const valueUseful = blockSiteSearchLooksUseful(value, term);

            // Never downgrade a resolved full Google query back to the bare BlockSite word.
            // The page updater runs repeatedly because BlockSite mutates its own DOM; without
            // this guard the card flickers between "gen1r" and "computergen1ral".
            if (!valueUseful && currentUseful) return;
            if (!valueUseful) {
                clearBlockSiteSearchCardPendingIfEmpty(searchValueEl, rawBlockedWord, blockedWord);
                return;
            }

            rememberUsefulBlockSiteAttemptedSearch(rawBlockedWord, blockedWord, value);
            searchValueEl.removeAttribute('data-bravefox-search-pending');
            searchValueEl.setAttribute('data-bravefox-current-search', value);
            fillHighlightedText(searchValueEl, value, term);
        } catch (e) {}
    }

    let lastBlockSiteSearchResolveKey = '';
    let lastBlockSiteSearchResolveAt = 0;
    let blockSiteStickyAttemptedSearchKey = '';
    let blockSiteStickyAttemptedSearch = '';

    function getBlockSiteSearchStateKey(rawBlockedWord, blockedWord) {
        return `${normalizeSearchText(rawBlockedWord || blockedWord || '')}::${window.location.href}`;
    }

    function rememberUsefulBlockSiteAttemptedSearch(rawBlockedWord, blockedWord, attemptedSearch) {
        try {
            const term = rawBlockedWord || blockedWord;
            const value = normalizeSearchText(attemptedSearch);
            if (!blockSiteSearchLooksUseful(value, term)) return '';
            blockSiteStickyAttemptedSearchKey = getBlockSiteSearchStateKey(rawBlockedWord, blockedWord);
            blockSiteStickyAttemptedSearch = value;
            return value;
        } catch (e) {
            return '';
        }
    }

    function getStickyBlockSiteAttemptedSearch(rawBlockedWord, blockedWord) {
        try {
            const key = getBlockSiteSearchStateKey(rawBlockedWord, blockedWord);
            if (key !== blockSiteStickyAttemptedSearchKey) return '';
            if (!blockSiteSearchLooksUseful(blockSiteStickyAttemptedSearch, rawBlockedWord || blockedWord)) return '';
            return blockSiteStickyAttemptedSearch;
        } catch (e) {
            return '';
        }
    }

    function clearBlockSiteSearchCardPendingIfEmpty(searchValueEl, rawBlockedWord, blockedWord) {
        try {
            if (!searchValueEl) return;
            const current = searchValueEl.getAttribute('data-bravefox-current-search') || '';
            if (blockSiteSearchLooksUseful(current, rawBlockedWord || blockedWord)) return;
            searchValueEl.textContent = '';
            searchValueEl.setAttribute('data-bravefox-current-search', '');
            searchValueEl.setAttribute('data-bravefox-search-pending', 'true');
        } catch (e) {}
    }

    function refreshBlockSiteSearchCardFromRecentGoogle(rawBlockedWord, blockedWord, currentAttemptedSearch) {
        try {
            const term = rawBlockedWord || blockedWord;
            const usefulCurrent = rememberUsefulBlockSiteAttemptedSearch(rawBlockedWord, blockedWord, currentAttemptedSearch);
            if (usefulCurrent) {
                setBlockSiteSearchCardValue(rawBlockedWord, blockedWord, usefulCurrent);
                return;
            }

            const sticky = getStickyBlockSiteAttemptedSearch(rawBlockedWord, blockedWord);
            if (sticky) {
                setBlockSiteSearchCardValue(rawBlockedWord, blockedWord, sticky);
                return;
            }

            const resolveKey = getBlockSiteSearchStateKey(rawBlockedWord, blockedWord);
            const now = Date.now();
            if (resolveKey === lastBlockSiteSearchResolveKey && now - lastBlockSiteSearchResolveAt < 700) return;
            lastBlockSiteSearchResolveKey = resolveKey;
            lastBlockSiteSearchResolveAt = now;

            requestRecentGoogleSearchForBlockSite(term, (search) => {
                try {
                    const usefulSearch = rememberUsefulBlockSiteAttemptedSearch(rawBlockedWord, blockedWord, search);
                    if (!usefulSearch) return;
                    setBlockSiteSearchCardValue(rawBlockedWord, blockedWord, usefulSearch);
                } catch (e) {}
            });
        } catch (e) {}
    }

    function upsertBlockedWordCard() {
        try {
            if (!markBlockSiteBlockedPage()) return;

            const rawBlockedWord = normalizeSearchText(getBlockedWordFromUrl());
            const blockedWord = formatBlockedWord(rawBlockedWord);
            const attemptedSearch = getAttemptedSearchFromBlockSiteContext();
            logBlockSiteRedirectReason();

            let card = document.getElementById('bravefox-blocksite-blocked-word-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'bravefox-blocksite-blocked-word-card';

                const wordRow = document.createElement('div');
                wordRow.className = 'bravefox-blocksite-info-row bravefox-blocksite-word-row';

                const label = document.createElement('span');
                label.className = 'bravefox-blocksite-word-label';

                const value = document.createElement('span');
                value.className = 'bravefox-blocksite-word-value';

                const searchRow = document.createElement('div');
                searchRow.className = 'bravefox-blocksite-info-row bravefox-blocksite-search-row';

                const searchLabel = document.createElement('span');
                searchLabel.className = 'bravefox-blocksite-search-label';

                const searchValue = document.createElement('span');
                searchValue.className = 'bravefox-blocksite-search-value';

                wordRow.appendChild(label);
                wordRow.appendChild(value);
                searchRow.appendChild(searchLabel);
                searchRow.appendChild(searchValue);
                card.appendChild(wordRow);
                card.appendChild(searchRow);
            }

            const labelEl = card.querySelector('.bravefox-blocksite-word-label');
            const valueEl = card.querySelector('.bravefox-blocksite-word-value');
            const searchLabelEl = card.querySelector('.bravefox-blocksite-search-label');
            const searchValueEl = card.querySelector('.bravefox-blocksite-search-value');
            const timerEl = card.querySelector('.bravefox-blocksite-redirect-timer');

            if (labelEl) labelEl.textContent = rawBlockedWord ? 'Estetty sana:' : 'Estetty sivu:';
            if (valueEl) valueEl.textContent = blockedWord || 'Estetty';
            if (searchLabelEl) searchLabelEl.textContent = 'Yritetty haku:';
            if (searchValueEl) {
                const stickySearch = getStickyBlockSiteAttemptedSearch(rawBlockedWord, blockedWord);
                const usefulImmediateSearch = blockSiteSearchLooksUseful(attemptedSearch, rawBlockedWord || blockedWord) ? attemptedSearch : '';
                const valueToShow = stickySearch || usefulImmediateSearch;
                if (valueToShow) setBlockSiteSearchCardValue(rawBlockedWord, blockedWord, valueToShow);
                else clearBlockSiteSearchCardPendingIfEmpty(searchValueEl, rawBlockedWord, blockedWord);
            }
            refreshBlockSiteSearchCardFromRecentGoogle(rawBlockedWord, blockedWord, attemptedSearch);
            if (timerEl) timerEl.remove();

            // v4 unified layout: keep the card out of BlockSite's native layout tree.
            // Both old and new BlockSite builds position this card with fixed CSS, so
            // parking it directly under body prevents old flex/hero wrappers from
            // dragging it into the title/subtitle area.
            if (document.body && card.parentNode !== document.body) {
                document.body.appendChild(card);
            }
        } catch (e) {
            console.warn('BraveFox: Error adding blocked word/search card:', e);
        }
    }

    // CSS hiding
    function injectHidingCSS() {
        markBlockSiteBlockedPage();
        if (injectedStyleSheet) return;
        try {
            const cssRules = [
                '[data-automation="delete-account-box"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="delete-account"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="change-password-box"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="reset-password"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-ckIfTa.gFXZNo[data-automation="change-password-box"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-dCrlla.gNWLCm[data-automation="change-password-box"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-kBpyjw.dprlnK { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-gsFSXq.dYOPBG[data-automation="reset-password"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-cscAeM.hllMaI { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-dxcDKg.layfBB[data-automation="delete-account"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="box-title"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="box-subTitle"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-iLfJqh.WLbkL { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-bMqzMT.cEOiBM { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '.sc-gIJaau.hcReOu { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                '[data-automation="delete-account-box"], [data-automation="delete-account"], [data-automation="change-password-box"], [data-automation="reset-password"], .sc-cscAeM.hllMaI, .sc-dxcDKg.layfBB[data-automation="delete-account"], [data-automation="box-title"], [data-automation="box-subTitle"] { transition: none !important; animation: none !important; }',
                'html.bravefox-extension-blocked-page body { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }',
                'html.bravefox-blocksite-ui-pending body { opacity: 0 !important; pointer-events: none !important; transition: none !important; animation: none !important; }',
                'html.bravefox-blocksite-blocked-page [data-automation="block-page-password-protection"], html.bravefox-blocksite-blocked-page [class^="BlockPageHeader_blockPageHeaderWrapper__"], html.bravefox-blocksite-blocked-page [class*=" BlockPageHeader_blockPageHeaderWrapper__"], html.bravefox-blocksite-blocked-page [class^="BlockPageHeader_blockedLogoWrapper__"], html.bravefox-blocksite-blocked-page [class*=" BlockPageHeader_blockedLogoWrapper__"], html.bravefox-blocksite-blocked-page [class^="BlockPageHeader_blockedLogoText__"], html.bravefox-blocksite-blocked-page [class*=" BlockPageHeader_blockedLogoText__"], html.bravefox-blocksite-blocked-page [class^="BlockPageWidgets_blockPageWidgets__"], html.bravefox-blocksite-blocked-page [class*=" BlockPageWidgets_blockPageWidgets__"], html.bravefox-blocksite-blocked-page [class^="FeatureStrip_featureStrip__"], html.bravefox-blocksite-blocked-page [class*=" FeatureStrip_featureStrip__"], html.bravefox-blocksite-blocked-page [class^="CrossDeviceSync_crossDeviceSync__"], html.bravefox-blocksite-blocked-page [class*=" CrossDeviceSync_crossDeviceSync__"], html.bravefox-blocksite-blocked-page [class^="RateBlockSite_rateBlockSite__"], html.bravefox-blocksite-blocked-page [class*=" RateBlockSite_rateBlockSite__"], html.bravefox-blocksite-blocked-page [data-automation="block-page-rate-dismiss"], html.bravefox-blocksite-blocked-page button:has(img[src*="password.svg"]), html.bravefox-blocksite-blocked-page [class^="sc-hEKqXB"], html.bravefox-blocksite-blocked-page [class*=" sc-hEKqXB"], html.bravefox-blocksite-blocked-page [class^="sc-hTwFKb"], html.bravefox-blocksite-blocked-page [class*=" sc-hTwFKb"], html.bravefox-blocksite-blocked-page button:has(img[src*="pallet.svg"]), html.bravefox-blocksite-blocked-page [class^="sc-ebnDkq"], html.bravefox-blocksite-blocked-page [class*=" sc-ebnDkq"], html.bravefox-blocksite-blocked-page [class^="sc-bTllmR"], html.bravefox-blocksite-blocked-page [class*=" sc-bTllmR"], html.bravefox-blocksite-blocked-page [class^="sc-hMxIkD"], html.bravefox-blocksite-blocked-page [class*=" sc-hMxIkD"], html.bravefox-blocksite-blocked-page [class^="sc-fwPIEZ"], html.bravefox-blocksite-blocked-page [class*=" sc-fwPIEZ"], html.bravefox-blocksite-blocked-page button:has(img[src*="share.svg"]) { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; transition: none !important; animation: none !important; }',
                'html.bravefox-blocksite-blocked-page [data-bravefox-close-page="true"] { cursor: pointer !important; min-width: 92px !important; min-height: 38px !important; padding: 0 16px !important; border-radius: 10px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; font-weight: 800 !important; text-align: center !important; position: static !important; left: auto !important; top: auto !important; right: auto !important; bottom: auto !important; transform: none !important; margin: 0 auto !important; }',
                'html.bravefox-blocksite-blocked-page .bravefox-blocksite-title { position: fixed !important; left: 56px !important; top: clamp(118px, 22vh, 220px) !important; z-index: 2147483000 !important; display: block !important; width: min(780px, calc(100vw - 112px)) !important; margin: 0 !important; padding: 0 !important; color: #fff !important; text-align: left !important; font-size: clamp(48px, 7vw, 88px) !important; line-height: 0.98 !important; font-weight: 900 !important; letter-spacing: -0.045em !important; text-shadow: 0 3px 18px rgba(0,0,0,0.32) !important; }',
                'html.bravefox-blocksite-blocked-page .bravefox-blocksite-subtitle { position: fixed !important; left: 58px !important; top: calc(clamp(118px, 22vh, 220px) + clamp(66px, 7.6vw, 98px)) !important; z-index: 2147483000 !important; display: block !important; width: min(760px, calc(100vw - 116px)) !important; margin: 0 !important; padding: 0 !important; color: #fff !important; text-align: left !important; font-size: clamp(19px, 2vw, 28px) !important; line-height: 1.25 !important; font-weight: 700 !important; text-shadow: 0 2px 14px rgba(0,0,0,0.34) !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-close-row.bravefox-blocksite-action-row { box-sizing: border-box !important; display: flex !important; justify-content: center !important; align-items: center !important; position: fixed !important; left: 0 !important; top: calc(50vh + 132px) !important; width: 100vw !important; max-width: 100vw !important; margin: 0 !important; padding: 0 !important; z-index: 2147483001 !important; transform: none !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-close-row.bravefox-blocksite-action-row .bravefox-blocksite-centered-close-button { margin: 0 auto !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card { box-sizing: border-box !important; width: min(560px, calc(100vw - 32px)) !important; margin: 0 !important; padding: 16px 18px !important; border: 1px solid rgba(255,255,255,0.24) !important; border-radius: 14px !important; background: rgba(7, 22, 35, 0.72) !important; color: #fff !important; text-align: left !important; font-family: inherit !important; box-shadow: 0 12px 32px rgba(0,0,0,0.24) !important; backdrop-filter: blur(8px) !important; position: fixed !important; left: 50vw !important; top: 50vh !important; transform: translate(-50%, -50%) !important; z-index: 2147482999 !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-info-row { display: grid !important; grid-template-columns: 132px minmax(0, 1fr) !important; gap: 10px !important; align-items: baseline !important; margin: 0 0 8px 0 !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-word-label, html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-search-label { margin: 0 !important; font-size: 12px !important; font-weight: 800 !important; letter-spacing: 0.04em !important; text-transform: uppercase !important; opacity: 0.78 !important; white-space: nowrap !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-word-value { margin: 0 !important; font-size: 22px !important; line-height: 1.2 !important; font-weight: 900 !important; overflow-wrap: anywhere !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-search-value { margin: 0 !important; font-size: 13px !important; line-height: 1.28 !important; font-weight: 700 !important; overflow-wrap: anywhere !important; word-break: break-word !important; }',
                'html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card .bravefox-blocksite-trigger-highlight { display: inline !important; margin: 0 1px !important; padding: 0 2px !important; border-radius: 2px !important; background: #fff200 !important; color: #111 !important; font: inherit !important; font-weight: 900 !important; }',
                '@media (max-width: 900px) { html.bravefox-blocksite-blocked-page .bravefox-blocksite-title { left: 24px !important; top: 96px !important; width: calc(100vw - 48px) !important; font-size: 46px !important; } html.bravefox-blocksite-blocked-page .bravefox-blocksite-subtitle { left: 26px !important; top: 154px !important; width: calc(100vw - 52px) !important; font-size: 19px !important; } html.bravefox-blocksite-blocked-page #bravefox-blocksite-blocked-word-card { top: 54vh !important; } html.bravefox-blocksite-blocked-page #bravefox-blocksite-close-row.bravefox-blocksite-action-row { top: calc(54vh + 132px) !important; } }'
            ];
            
            // NextDNS pre-hide: prevent "Forgot password?" flash on any my.nextdns.io / nextdns.io pages
            if (isNextDNSDomain()) {
                cssRules.push(
                    'a[href="/reset-password"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                    '.mt-1.text-end a[href="/reset-password"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }',
                    '.mt-1.text-end[style*="font-size: 0.8em"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }'
                );
            }

            const styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.id = 'bravefox-blocksite-hider-universal';
            styleElement.textContent = cssRules.join('\n');
            const target = document.head || document.documentElement;
            if (target) {
                target.appendChild(styleElement);
                injectedStyleSheet = styleElement;
                console.log('BraveFox: Universal CSS hiding rules injected');
            } else {
                const headObserver = new MutationObserver((mutations, obs) => {
                    if (document.head) {
                        document.head.appendChild(styleElement);
                        injectedStyleSheet = styleElement;
                        console.log('BraveFox: Universal CSS hiding rules injected (delayed)');
                        obs.disconnect();
                    }
                });
                headObserver.observe(document.documentElement, { childList: true, subtree: true });
            }
        } catch (error) {
            console.warn('BraveFox: Error injecting universal CSS hiding rules:', error);
        }
    }
    // Only checks for "delete account" elements
    function isDeleteAccountElement(element) {
        const textContent = getTextContentAsString(element);
        const indicators = [
            element.getAttribute('data-automation') === 'delete-account-box',
            element.getAttribute('data-automation') === 'delete-account',
            element.getAttribute('data-automation') === 'change-password-box',
            element.getAttribute('data-automation') === 'reset-password',
            element.getAttribute('data-automation') === 'box-title',
            element.getAttribute('data-automation') === 'box-subTitle',
            element.classList.contains('sc-cscAeM') && element.classList.contains('hllMaI'),
            element.classList.contains('sc-dxcDKg') && element.classList.contains('layfBB'),
            element.classList.contains('sc-iLfJqh') && element.classList.contains('WLbkL'),
            element.classList.contains('sc-bMqzMT') && element.classList.contains('cEOiBM'),
            element.classList.contains('sc-gIJaau') && element.classList.contains('hcReOu'),
            element.classList.contains('sc-ckIfTa') && element.classList.contains('gFXZNo'),
            element.classList.contains('sc-dCrlla') && element.classList.contains('gNWLCm'),
            element.classList.contains('sc-kBpyjw') && element.classList.contains('dprlnK'),
            element.classList.contains('sc-gsFSXq') && element.classList.contains('dYOPBG') && element.getAttribute('data-automation') === 'reset-password',
            textContent && (
                textContent.trim() === 'Delete Account' ||
                textContent.trim() === 'Reset Password' ||
                textContent.includes('You will permanently delete your BlockSite user account') ||
                textContent.includes('won\'t be able to reactivate it')
            ),
            element.querySelector && element.querySelector('[data-automation="delete-account"]'),
            element.querySelector && element.querySelector('[data-automation="change-password-box"]'),
            element.querySelector && element.querySelector('[data-automation="reset-password"]'),
            element.querySelector && element.querySelector('[data-automation="box-title"]'),
            element.querySelector && element.querySelector('[data-automation="box-subTitle"]'),
            element.closest && (element.closest('[data-automation="delete-account-box"]') || element.closest('[data-automation="change-password-box"]')),
            element.matches && (element.matches('[data-automation="delete-account-box"] *') || element.matches('[data-automation="change-password-box"] *')),
            element.matches && element.matches('.sc-cscAeM.hllMaI *')
        ];
        return indicators.some(indicator => indicator === true);
    }
    function findElementContainer(element) {
        const containerSelectors = [
            '[data-automation="delete-account-box"]',
            '[data-automation="change-password-box"]',
            '.sc-cscAeM.hllMaI',
            '.sc-dxcDKg.layfBB[data-automation="delete-account"]',
            '.sc-ckIfTa.gFXZNo[data-automation="change-password-box"]',
            '.sc-dCrlla.gNWLCm[data-automation="change-password-box"]',
            '.sc-gIJaau.hcReOu'
        ];
        for (const selector of containerSelectors) {
            if (element.closest && element.closest(selector)) {
                return element.closest(selector);
            }
        }
        return element;
    }
    // Remove only "delete account" elements
    function removeUnwantedElements() {
        let removedCount = 0;
        CONFIG.selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (isDeleteAccountElement(element)) {
                        const parentToRemove = findElementContainer(element);
                        if (parentToRemove && parentToRemove.parentNode) {
                            parentToRemove.style.display = 'none';
                            parentToRemove.remove();
                            removedCount++;
                        }
                    }
                });
            } catch (error) {
                console.warn('BraveFox: Error processing selector:', selector, error);
            }
        });
        if (removedCount > 0) {
            console.log(`BraveFox: Removed ${removedCount} delete account elements`);
        }
        return removedCount;
    }

    // Hide "Forgot password?" / reset-password links on my.nextdns.io and nextdns.io (including /login)
    function hideNextDNSForgotPasswordLinks() {
        try {
            if (!isNextDNSDomain()) return;
            
            let hiddenCount = 0;
            const links = document.querySelectorAll('a[href="/reset-password"]');
            links.forEach(link => {
                const parent = link.parentElement;
                if (parent && parent.classList.contains('mt-1') && parent.classList.contains('text-end')) {
                    // Only hide, do NOT remove to avoid breaking NextDNS React tree
                    parent.style.display = 'none';
                    parent.style.visibility = 'hidden';
                    parent.style.opacity = '0';
                } else {
                    link.style.display = 'none';
                    link.style.visibility = 'hidden';
                    link.style.opacity = '0';
                }
                hiddenCount++;
            });
            if (hiddenCount > 0) {
                console.log(`BraveFox: Hid ${hiddenCount} NextDNS "Forgot password?" links (no DOM removal)`);
            }
        } catch (e) {
            console.warn('BraveFox: Error while hiding NextDNS "Forgot password?" links:', e);
        }
    }

    // Hijack and modify the BlockSite Error Notification text
    function modifyErrorNotification() {
        try {
            const errorIcons = document.querySelectorAll('[data-automation="notification-img-error"]');
            errorIcons.forEach(icon => {
                const container = icon.parentElement;
                if (container) {
                    const messageEl = container.querySelector('[data-automation="notification-message"]');
                    if (messageEl && messageEl.textContent !== 'Oho! Olemme paskoja ja emme toimi.') {
                        messageEl.textContent = 'Oho! Olemme paskoja, emme toimi.';
                        console.log('BraveFox: Replaced garbage error notification with the truth.');
                    }
                }
            });
        } catch (error) {
            console.warn('BraveFox: Error modifying notification:', error);
        }
    }

    // Observers and monitoring
    function setupObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (redirectExtensionBlockedPageIfPresent(node)) return;
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasUnwantedElements = CONFIG.selectors.some(selector => {
                                try {
                                    return node.querySelector && node.querySelector(selector);
                                } catch (e) { return false; }
                            });
                            
                            // Also trigger processing if the error notification pops up
                            let hasErrorNotification = false;
                            try {
                                hasErrorNotification = (node.querySelector && node.querySelector('[data-automation="notification-message"]')) || 
                                                       (node.matches && node.matches('[data-automation="notification-message"]'));
                            } catch (e) {}

                            let hasBlockSiteBlockedPageJunk = false;
                            try {
                                hasBlockSiteBlockedPageJunk = isBlockSiteBlockedPage() && (
                                    (node.querySelector && (
                                        node.querySelector('[data-automation="block-page-password-protection"]') ||
                                        node.querySelector('[data-automation="block-page-go-back"]') ||
                                        node.querySelector('[class^="BlockPageWidgets_blockPageWidgets__"], [class*=" BlockPageWidgets_blockPageWidgets__"]') ||
                                        node.querySelector('button:has(img[src*="back.svg"]), button:has(img[src*="password.svg"]), button:has(img[src*="pallet.svg"]), [class^="sc-hTwFKb"], [class*=" sc-hTwFKb"], [class^="sc-fwPIEZ"], [class*=" sc-fwPIEZ"]')
                                    )) ||
                                    (node.matches && (
                                        node.matches('[data-automation="block-page-password-protection"]') ||
                                        node.matches('[data-automation="block-page-go-back"]') ||
                                        node.matches('[class^="BlockPageWidgets_blockPageWidgets__"], [class*=" BlockPageWidgets_blockPageWidgets__"]') ||
                                        node.matches('button:has(img[src*="back.svg"]), button:has(img[src*="password.svg"]), button:has(img[src*="pallet.svg"]), [class^="sc-hTwFKb"], [class*=" sc-hTwFKb"], [class^="sc-fwPIEZ"], [class*=" sc-fwPIEZ"]')
                                    ))
                                );
                            } catch (e) {}

                            if (hasUnwantedElements || hasErrorNotification || hasBlockSiteBlockedPageJunk) shouldProcess = true;
                        }
                    });
                }
            });
            if (shouldProcess) {
                setTimeout(() => {
                    removeUnwantedElements();
                    updateBlockSiteBlockedPageUi();
                    modifyErrorNotification();
                }, 10);
            }
        });
        const observeTarget = document.body || document.documentElement;
        if (observeTarget) observer.observe(observeTarget, CONFIG.observerConfig);
    }
    function setupContinuousMonitoring() {
        if (continuousMonitorTimer) clearInterval(continuousMonitorTimer);
        continuousMonitorTimer = setInterval(() => {
            if (!injectedStyleSheet || !injectedStyleSheet.parentNode) injectHidingCSS();
            redirectExtensionBlockedPageIfPresent(document);
            removeUnwantedElements();
            updateBlockSiteBlockedPageUi();
            hideNextDNSForgotPasswordLinks();
            modifyErrorNotification();
            if (!observer) setupObserver();
        }, CONFIG.continuousMonitoringInterval);
    }
    function setupUrlMonitoring() {
        if (urlMonitorTimer) clearInterval(urlMonitorTimer);
        urlMonitorTimer = setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastProcessedUrl) {
                lastProcessedUrl = currentUrl;
                console.log('BraveFox: URL change detected universally, re-initializing');
                setTimeout(() => { reinitialize(); }, 50);
            }
        }, CONFIG.urlCheckInterval);
    }
    function reinitialize() {
        console.log('BraveFox: Reinitializing BlockSite delete account element remover universally');
        retryCount = 0;
        injectHidingCSS();
        requestBlockSiteHistoryCleanup('reinitialize');
        redirectExtensionBlockedPageIfPresent(document);
        removeUnwantedElements();
        updateBlockSiteBlockedPageUi();
        hideNextDNSForgotPasswordLinks();
        modifyErrorNotification();
        setupObserver();
        const fastRetryInterval = setInterval(() => {
            retryCount++;
            redirectExtensionBlockedPageIfPresent(document);
            const count = removeUnwantedElements();
            updateBlockSiteBlockedPageUi();
            hideNextDNSForgotPasswordLinks();
            modifyErrorNotification();
            if (retryCount >= CONFIG.retryInterval) clearInterval(fastRetryInterval);
        }, CONFIG.retryInterval);
    }
    function initialize() {
        console.log('BraveFox: Initializing BlockSite delete account element remover with UNIVERSAL coverage');
        isInitialized = true;
        lastProcessedUrl = window.location.href;
        injectHidingCSS();
        requestBlockSiteHistoryCleanup('reinitialize');
        redirectExtensionBlockedPageIfPresent(document);
        const initialCount = removeUnwantedElements();
        updateBlockSiteBlockedPageUi();
        hideNextDNSForgotPasswordLinks();
        modifyErrorNotification();
        console.log(`BraveFox: Initially processed ${initialCount} delete account elements universally`);
        setupObserver();
        setupContinuousMonitoring();
        setupUrlMonitoring();
        const initialRetryInterval = setInterval(() => {
            retryCount++;
            redirectExtensionBlockedPageIfPresent(document);
            const count = removeUnwantedElements();
            updateBlockSiteBlockedPageUi();
            hideNextDNSForgotPasswordLinks();
            modifyErrorNotification();
            if (count > 0) console.log(`BraveFox: Processed ${count} delete account elements universally (retry ${retryCount})`);
            if (retryCount >= CONFIG.maxRetries) {
                clearInterval(initialRetryInterval);
                console.log('BraveFox: Max retries reached, continuing with universal background monitoring');
            }
        }, CONFIG.retryInterval);
        window.addEventListener('beforeunload', () => {
            clearInterval(initialRetryInterval);
            clearInterval(continuousMonitorTimer);
            clearInterval(urlMonitorTimer);
            clearBlockSiteRedirectTimer();
            if (observer) observer.disconnect();
        });
    }
    function handleUrlChange() {
        console.log('BraveFox: URL change detected in universal navigation observer');
        setTimeout(() => { reinitialize(); }, 100);
    }
    // IMMEDIATE UNIVERSAL EXECUTION - Run on ALL sites
    markBlockSiteBlockedPage();
    requestBlockSiteHistoryCleanup('early-execution');
    injectHidingCSS();
    redirectExtensionBlockedPageIfPresent(document);
    updateBlockSiteBlockedPageUi();
    const earlyInterval = setInterval(() => {
        try { 
            redirectExtensionBlockedPageIfPresent(document);
            removeUnwantedElements(); 
            updateBlockSiteBlockedPageUi();
            hideNextDNSForgotPasswordLinks();
            modifyErrorNotification();
        } catch (e) {}
    }, 50);
    setTimeout(() => { clearInterval(earlyInterval); }, 5000);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 0);
    }
    window.addEventListener('load', () => {
        if (!isInitialized) initialize();
        else reinitialize();
    });
    let lastUrl = location.href;
    const navigationObserver = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            handleUrlChange();
        }
    });
    navigationObserver.observe(document, { 
        subtree: true, 
        childList: true,
        attributes: true,
        attributeFilter: ['href']
    });
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('pushstate', handleUrlChange);
    window.addEventListener('replacestate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        setTimeout(handleUrlChange, 0);
    };
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        setTimeout(handleUrlChange, 0);
    };
    window.BraveFoxBlockSite = {
        removeUnwantedElements,
        hideBlockSiteBlockedPageJunk,
        upsertBlockedWordCard,
        upsertNewBlockSiteSubtitleFallback,
        transformBlockSiteBackButton,
        ensureBlockSiteAutoRedirectTimer,
        requestBlockSiteHistoryCleanup,
        redirectExtensionBlockedPageIfPresent,
        getBlockedWordFromUrl,
        formatBlockedWord,
        injectHidingCSS,
        isTargetPage: () => true,
        isBlockSiteDomain: () => true,
        initialize,
        reinitialize,
        setupObserver,
        setupContinuousMonitoring,
        getClassNameAsString,
        getIdAsString,
        getTextContentAsString,
        getUnwantedElementCount: () => {
            let count = 0;
            CONFIG.selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (isDeleteAccountElement(element)) count++;
                    });
                } catch (e) {}
            });
            return count;
        },
        config: CONFIG,
        status: () => ({
            isInitialized,
            lastProcessedUrl,
            observerActive: !!observer,
            cssInjected: !!injectedStyleSheet,
            timersActive: {
                continuous: !!continuousMonitorTimer,
                url: !!urlMonitorTimer
            },
            blockSiteRedirectSeconds: getSecondsUntilBlockSiteRedirect(),
            universal: true
        })
    };
})();