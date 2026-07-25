// ==UserScript==
// @name         Content hiding and filtering
// @version      2026-07-25
// @description  Filter out stuff on the internet (Targeted Enforcer)
// @match        *://*/* 
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // === TARGET SITES FOR **FILTERING/HIDING** CONTENT ===
    // This extension/js file does NOT encourage or otherwise facilitate the use or access to adult content sites in under any circumstance. The only purpose of this function/file is to filter out certain types of content from XVideos for my own use case, such as AI-generated stuff. Furthermore, this extension is meant for PERSONAL USE ONLY. It is only set to "Unlisted" so I can install it from direct link when needed. I'd honestly prefer that it would not be shown in any type of searches at all, if that's doable. 
    const targetDomains = ['xvideos.com'];
    const currentHost = window.location.hostname.toLowerCase();
    
    if (!targetDomains.some(domain => currentHost.includes(domain))) {
        return; // Script goes completely dormant on normal websites like Outlook.
    }

    console.log("WebCleaner running on targeted video domain.");

    // --- DOCUMENT-START NO-GLIMPSE SHIELD ---
    // Hide result cards before their title/metadata can flash on screen. Clean cards are
    // revealed only after the regex scanner explicitly marks them as safe.
    const VIDEO_RESULT_CARD_SELECTOR = '.thumb-block';
    const VIDEO_RESULT_STATE_ATTR = 'data-bravefox-video-filter-state';
    const VIDEO_RESULT_SOURCE_ATTR = 'data-bravefox-video-source';
    const VIDEO_RESULT_REVISION_ATTR = 'data-bravefox-video-filter-revision';
    const VIDEO_RESULT_LOCAL_HASH_ATTR = 'data-bravefox-video-local-hash';

    // Classify listing cards with the linked video's own title/uploader/model metadata.
    // Requests are queued and cached so infinite-scroll pages do not hammer the site.
    const VIDEO_PAGE_FETCH_CONCURRENCY = 4;
    const VIDEO_PAGE_FETCH_TIMEOUT_MS = 12000;
    const VIDEO_PAGE_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const VIDEO_PAGE_METADATA_FAILURE_CACHE_TTL_MS = 30 * 60 * 1000;
    const VIDEO_PAGE_METADATA_CACHE_MAX = 800;
    const videoPageMetadataCache = new Map();
    const videoPageMetadataPending = new Map();
    const videoPageFetchQueue = [];
    const videoPageAbortControllers = new Set();
    let activeVideoPageFetches = 0;
    let videoFilterRevision = 1;

    // Capture the native implementation before the legacy tracker wrapper lower in the file.
    const braveFoxNativeFetch = typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : null;
    const VIDEO_OVERLAY_LINK_SELECTOR = [
        'a.video-overlay-title[href]',
        'a.video-overlay-title-invideo[href]',
        'a.sheer-sponsor[href]',
        'a[href*="//sheer.com"]',
        'a[href*="//www.sheer.com"]'
    ].join(', ');

    function injectNoGlimpseCSS() {
        try {
            if (document.getElementById('bravefox-filtering-no-glimpse')) return;

            document.documentElement.classList.add('bravefox-filtering-active');

            const style = document.createElement('style');
            style.id = 'bravefox-filtering-no-glimpse';
            style.textContent = `
                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}:not([${VIDEO_RESULT_STATE_ATTR}="clean"]),
                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="blocked"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transition: none !important;
                    animation: none !important;
                }

                ${VIDEO_OVERLAY_LINK_SELECTOR},
                .video-overlay-title-txt,
                .video-overlay-title-icon {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transition: none !important;
                    animation: none !important;
                }
            `;

            (document.head || document.documentElement).appendChild(style);
        } catch (e) {
            console.log('Unable to install no-glimpse CSS: ' + e.message);
        }
    }

    injectNoGlimpseCSS();

    // Memory management
    const observerInstances = new Set();
    let processedElements = new WeakSet();
    let processedCategoryEntries = new WeakSet();
    let isCleaningUp = false;
    let dynamicWrestlerRefreshInterval = null;
    let removeStorageChangeListener = null;

    // --- SPA Awareness State ---
    let __lastKnownUrl = window.location.href;
    let isRedirectingNow = false;

    // --- BULLETPROOF UNIVERSAL STORAGE WRAPPER ---
    // A content script from an older extension generation can remain alive briefly after
    // the extension is reloaded. Storage calls then throw synchronously with
    // "Extension context invalidated", before a Promise .catch() can run.
    let extensionStorageUnavailable = false;

    function isExtensionContextError(error) {
        const message = String(error && (error.message || error) || '');
        return /extension context invalidated|context invalidated|message port closed/i.test(message);
    }

    function disableExtensionStorage() {
        extensionStorageUnavailable = true;

        // A page that survived an extension reload belongs to the old extension generation.
        // Stop all storage work quietly; logging a warning here makes Chromium list the handled
        // condition as an extension error even though nothing escaped the catch path.
        if (dynamicWrestlerRefreshInterval !== null) {
            clearInterval(dynamicWrestlerRefreshInterval);
            dynamicWrestlerRefreshInterval = null;
        }

        if (typeof removeStorageChangeListener === 'function') {
            const removeListener = removeStorageChangeListener;
            removeStorageChangeListener = null;
            try { removeListener(); } catch (e) {}
        }
    }

    function handleStorageFailure(error) {
        if (isExtensionContextError(error)) {
            disableExtensionStorage();
            return;
        }

        // Storage is optional for the page filter. Fail quietly and keep the static filters alive.
        try { console.debug('BraveFox: Optional storage access failed.', error); } catch (e) {}
    }

    const StorageHelper = {
        get: function(keys, callback) {
            let completed = false;
            const finish = (result) => {
                if (completed) return;
                completed = true;
                try { callback(result || {}); } catch (e) {}
            };

            if (extensionStorageUnavailable) {
                finish({});
                return;
            }

            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                    let request;
                    try {
                        request = browser.storage.local.get(keys);
                    } catch (error) {
                        handleStorageFailure(error);
                        finish({});
                        return;
                    }

                    Promise.resolve(request)
                        .then(result => finish(result))
                        .catch(error => {
                            handleStorageFailure(error);
                            finish({});
                        });
                    return;
                }

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    try {
                        chrome.storage.local.get(keys, result => {
                            let lastError = null;
                            try { lastError = chrome.runtime && chrome.runtime.lastError; } catch (error) { lastError = error; }

                            if (lastError) {
                                handleStorageFailure(lastError);
                                finish({});
                            } else {
                                finish(result || {});
                            }
                        });
                    } catch (error) {
                        handleStorageFailure(error);
                        finish({});
                    }
                    return;
                }
            } catch (error) {
                handleStorageFailure(error);
            }

            finish({});
        },

        onChanged: function(callback) {
            if (extensionStorageUnavailable) return null;

            try {
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
                    browser.storage.onChanged.addListener(callback);
                    return () => {
                        try { browser.storage.onChanged.removeListener(callback); } catch (error) {}
                    };
                }

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
                    chrome.storage.onChanged.addListener(callback);
                    return () => {
                        try { chrome.storage.onChanged.removeListener(callback); } catch (error) {}
                    };
                }
            } catch (error) {
                handleStorageFailure(error);
            }

            return null;
        }
    };

    // Cleanup function
    function cleanup() {
        if (isCleaningUp) return;
        isCleaningUp = true;
        
        try {
            observerInstances.forEach(observer => {
                try {
                    if (observer && typeof observer.disconnect === 'function') {
                        observer.disconnect();
                    }
                } catch (e) {}
            });
            observerInstances.clear();

            videoPageAbortControllers.forEach(controller => {
                try { controller.abort(); } catch (e) {}
            });
            videoPageAbortControllers.clear();
            videoPageFetchQueue.splice(0, videoPageFetchQueue.length).forEach(job => {
                try { job.resolve(''); } catch (e) {}
            });
            videoPageMetadataPending.clear();

            if (dynamicWrestlerRefreshInterval !== null) {
                clearInterval(dynamicWrestlerRefreshInterval);
                dynamicWrestlerRefreshInterval = null;
            }

            if (typeof removeStorageChangeListener === 'function') {
                try { removeStorageChangeListener(); } catch (e) {}
                removeStorageChangeListener = null;
            }

            console.log("WebCleaner cleanup completed");
        } finally {
            isCleaningUp = false;
        }
    }

    // Page cleanup events
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // Throttle function for performance
    function throttle(fn, wait) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= wait) {
                lastCall = now;
                return fn.apply(this, args);
            }
        };
    }

    // List of blocked content selectors
    const blockSelectors = [
        'a.video-overlay-title[href]',
        'a.video-overlay-title-invideo[href]',
        'a.sheer-sponsor[href]',
        'a[href*="//sheer.com"]',
        'a[href*="//www.sheer.com"]',
        '.video-overlay-title-txt',
        '.video-overlay-title-icon',
        '.h89F20Be33CbCbbc86A39FAC9Ecdb7Eaa',
        '.ntvbb39f1a4fbfB7BC3598CbD224f8e2BB9',
        '.videoad-title-txt > strong',
        '.h91229b450eb7B15bC39f3DE0F015F9ef > p > span',
        '.h91229b450eb7B15bC39f3DE0F015F9ef > p',
        '.h91229b450eb7B15bC39f3DE0F015F9ef',
        '.ntv6AB7a9eB4c8BB21B0178A95feCDAB1Ec',
        '.ntv6AB7a9eB4c8BB21B0178A95feCDAB1Ec > .btn',
        '.videoad-title-txt',
        '.sheer-sponsor.noselect.videoad-title-invideo.videoad-title',
        '.hA895aBD4d64A2Fa4c4F8420cf8B662fC',
        '.hABa422d7CeD4318EC3FB5fa0DdD4FFD6',
        '.ntvdb927B1C2b659fEFAAEAccdb27c8cFeb',
        '.msC25cDba3aa02D065E7fAF726D8BE444d',
        '.ntv5cEBb4DA8Cab53861deC68948d20D82a',
        '.ntvA4bceECc91D5CD0f99E4F2c88a196f44',
        '.ntv91a5B3aA73ea5Eb47CEb0c4906B81fF9',
        '.ntv27afEb15E80d296aCc2aEf2c81Ced8d7',
        '.msC25cDba3aa02D065E7fAF726D8BE444d',
        '.ntv4AC658c95df05A57A3fa6D8Eb2f3a5e0',
        '.ntv3Ff9a2974c0C2e11bDdf7C9df1A945Ca',
        '.ntvAFf474a6Edfdbb5179e7Ac3ef478FF2D',
        '.ntvc24718ABeAEcdeEA1e2cB75C89B0Fd9c',
        '.ntv5FAb56c4D2759E0a5Ec1BEE9ea8A6F8F',
    ];

    // Regex-only static blocklist.
    const blockedRegexWords = [
        /deepn/i, /deepf/i, /deeps/i, /udif/i, /nudif/i, /ndres/i, /alexa/i, /poshspi(?:c|s)y/i, /face[\s_-]*swap/i, /swap[\s_-]*face/i, /Brie/i,
        /face[\s_-]*morph/i, /morph[\s_-]*face/i, /dream[\s_-]*booth/i, /wondershare/i, /filmora/i, /app/i, /Liv[\s_-]+Morgan/i, /Liv[\s_-]+Xoxo/i, 
	/Morgan[\s_-]+Xoxo/i, /Sweeney/i, /Sydne/i, /Steward/i, /Stewart/i, /Kristen/i, /Kriis/i, /Bella/i, /Nikki/i, /Chyna/i, /China/i, /Hulk/i,
        /lex[\s_-]*bl/i, /leks[\s_-]*bl/i, /Lexi/i, /Hogan/i, /Tiffy/i, /Bliss/i, /Marg[\s_-]+Robb/i, /Margo/i, /Robbie/i, /Elyna/i, /Elyina/i, 
	/Eliyna/i, /Eliyina/i, /Dua[\s_-]*Lipa/i, /Kamitani/i, /Katie/i, /Nikkita/i, /Lisa[\s_-]+Marie/i, /Lisa[\s_-]+Varon/i, /Marie[\s_-]+Varon/i,
	/Takaichi/i, /Sakurai/i, /Arrivederci/i, /Alice/i, /Alicy/i, /Alici/i, /Arisu[\s_-]+Endo/i, /Crowley/i, /Ruby[\s_-]+Soho/i, /Castillo/i,
	/Monica/i, /Matsumoto/i, /Shino[\s_-]+Suzuki/i, /Lily[\s_-]+Adam/i, /Lana/i, /Blake/i, /Bailey/i, /Bayley/i, /Naomi/i, /Irving/i, /Monroe/i, 
	/Del[\s_-]+Rey/i, /McMahon/i, /CJ[\s_-]+Perry/i, /Stratton/i, /Ruca/i, /Lola[\s_-]+Vice/i, /shirakawa/i, /Belts[\s_-]+Mone/i, /pride/i,
	/Amanda[\s_-]+Huber/i, /Joanie[\s_-]+Laurer/i, /AEW/i, /TNA/i, /WWE/i, /NJPW/i, /LGBT/i, /Trans/i, /playboy/i, /anorexic/i, /Arab/i, /Sol/i, 
        /deviant[\s_-]*art/i, /r[\s_-]*34/i, /Stee/i, /Sweee/i, /Waaa/i, /Transsexual/i, /Femdom/i, /Animat/i, 

        // Symbols and standalone abbreviations
	/\*/i, /#/i, /(^|[^a-z0-9])AI([^a-z0-9]|$)/i, 

	// Boundaried Regex blocklist
        /\bMLM\b/i, /\bLLM\b/i, /\bgay\b/i, /\b3D\b/i,
    ];

    // Dynamic patterns imported from wrestling.js / TheSmackDownHotel.
    let dynamicWrestlerRegexWords = [];
    let dynamicWrestlerSignature = '';

    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function regexMatches(regex, text) {
        try {
            regex.lastIndex = 0;
            return regex.test(text);
        } catch (e) {
            return false;
        }
    }

    function containsBlockedContent(value) {
        const text = String(value || '');
        if (!text) return false;

        return blockedRegexWords.some(regex => regexMatches(regex, text)) ||
               dynamicWrestlerRegexWords.some(regex => regexMatches(regex, text));
    }

    function resetProcessedCaches() {
        // A newly imported wrestler list must be able to re-check elements that were clean earlier.
        processedElements = new WeakSet();
        processedCategoryEntries = new WeakSet();
    }

    function scheduleFullFilterPass() {
        const run = () => {
            removeExternalVideoOverlayLinks();
            filterSearchAutocompleteEntries();
            filterVideoResultCards();
            checkAndRedirectUrlBlockedContent();
            checkAndRedirectVideoPageBlockedContent();
            removeBlockedCategoryEntries();
            hideBlockedContent();
            deleteContent();
        };

        run();
        // The hide/delete functions are throttled, so repeat once after their cooldown.
        setTimeout(run, 350);
    }

    // --- DYNAMIC WRESTLER BANS (IMPORTED FROM TAG TEAM) ---
    const dynamicWrestlerExclusions = new Set([
        'melina', 'melina-perez', 'aj-lee', 'aj', 'becky-lynch', 'becky',
        'katarina', 'jojo'
    ]);

    function buildDynamicWrestlerPatterns(urls) {
        const patterns = [];
        const seenNames = new Set();

        (Array.isArray(urls) ? urls : []).forEach(url => {
            try {
                const parts = String(url).split('/').filter(Boolean);
                if (parts.length === 0) return;

                const slug = decodeURIComponent(parts[parts.length - 1]).toLowerCase().trim();
                if (!slug || dynamicWrestlerExclusions.has(slug)) return;

                const nameParts = slug
                    .split(/[-_\s]+/)
                    .map(part => part.trim())
                    .filter(Boolean);

                if (nameParts.length === 0) return;

                const normalizedName = nameParts.join(' ');
                if (seenNames.has(normalizedName)) return;
                seenNames.add(normalizedName);

                // Match spaces, hyphens, and underscores so roster slugs and visible names both work.
                const flexibleName = nameParts.map(escapeRegex).join('[\\s_-]+');
                patterns.push(new RegExp('\\b' + flexibleName + '\\b', 'i'));
            } catch (e) {}
        });

        return patterns;
    }

    function installDynamicWrestlerBans(urls, source) {
        const normalizedUrls = Array.isArray(urls)
            ? [...new Set(urls.map(value => String(value).toLowerCase()).filter(Boolean))].sort()
            : [];
        const signature = normalizedUrls.join('\n');

        if (signature === dynamicWrestlerSignature) return false;

        dynamicWrestlerSignature = signature;
        dynamicWrestlerRegexWords = buildDynamicWrestlerPatterns(normalizedUrls);
        videoFilterRevision++;
        resetProcessedCaches();

        console.log(`Loaded ${dynamicWrestlerRegexWords.length} dynamic wrestler-name filters from ${source || 'storage'}.`);
        scheduleFullFilterPass();
        return true;
    }

    function applyDynamicWrestlerBans() {
        if (extensionStorageUnavailable) return;

        StorageHelper.get(['wrestling_women_urls'], function(result) {
            if (extensionStorageUnavailable) return;

            const urls = result && Array.isArray(result.wrestling_women_urls)
                ? result.wrestling_women_urls
                : [];
            installDynamicWrestlerBans(urls, 'TheSmackDownHotel cache');
        });
    }

    applyDynamicWrestlerBans();

    removeStorageChangeListener = StorageHelper.onChanged(function(changes, areaName) {
        if (areaName && areaName !== 'local') return;
        if (!changes || !Object.prototype.hasOwnProperty.call(changes, 'wrestling_women_urls')) return;

        const change = changes.wrestling_women_urls || {};
        installDynamicWrestlerBans(change.newValue || [], 'live storage update');
    });

    // Fallback for environments where storage change events are unavailable or unreliable.
    dynamicWrestlerRefreshInterval = setInterval(applyDynamicWrestlerBans, 15000);

    // --- SAFE REDIRECT HELPER ---
    function safeRedirectToHome() {
        if (isRedirectingNow) return;

        const isCleanHomepage = window.location.pathname === '/' && window.location.search === '';
        if (isCleanHomepage) {
            // Never blank the entire page. A false positive must fail harmlessly.
            try { console.debug('BraveFox: Ignored a blocked-content redirect request on the homepage.'); } catch (e) {}
            return;
        }

        isRedirectingNow = true;
        const homeUrl = window.location.origin + '/';

        try {
            if (typeof window.location.replace === 'function') {
                window.location.replace(homeUrl);
            } else {
                window.location.href = homeUrl;
            }
        } catch (e) {
            window.location.href = homeUrl;
        }
    }

    function isVideoWatchPath(pathname) {
        const path = String(pathname || '').toLowerCase();
        if (/^\/videos(?:\/|$)/i.test(path)) return false;
        return /^\/video(?:[._\/-]|[a-z0-9])/i.test(path);
    }

    function isLikelyVideoWatchPage() {
        return isVideoWatchPath(window.location.pathname);
    }

    // Never redirect a watch page because of tags, title, uploader, model, or related cards.
    // Those checks happen before navigation by inspecting and hiding the result card.
    function checkAndRedirectVideoPageBlockedContent() {
        return;
    }

    // Search listing URLs can still be redirected when their explicit `k=` query is banned.
    // Watch pages are exempt because XVideos can carry stale search parameters into them.
    function checkAndRedirectUrlBlockedContent() {
        try {
            if (isLikelyVideoWatchPage()) return;

            const urlParams = new URLSearchParams(window.location.search);
            const searchTerm = urlParams.get('k');
            if (searchTerm && containsBlockedContent(searchTerm)) {
                console.log(`Blocked keyword found in URL: ${searchTerm}`);
                safeRedirectToHome();
            }
        } catch (e) {
            console.log('Error checking URL content: ' + e.message);
        }
    }

    // Remove category-menu entries whose label or category URL contains a banned term.
    // XVideos often mounts an empty/recycled anchor first and fills its label later, so links are
    // rechecked whenever their text or href signature changes instead of being permanently skipped.
    const CATEGORY_SIGNATURE_ATTR = 'data-bravefox-category-filter-signature';
    const CATEGORY_LINK_SELECTOR = [
        // Dynamic category menu entries such as: <li class="dyn"><a href="/gay?fmc=1">…</a></li>
        'li.dyn > a[href]',
        'li.dyn a[href]',
        // Orientation/category switch buttons such as:
        // <a href="/switch-sexual-orientation/gay/straight" class="btn cat">…</a>
        'li > a.btn.cat[href]',
        'a.btn.cat[href]',
        'a[href^="/switch-sexual-orientation/"]',
        'a[href*="/switch-sexual-orientation/"]',
        'li.dyntop-cat a[href]',
        '.dyntop-cat a[href]',
        'li[class*="top-cat"] a[href]',
        'li[class*="category"] a[href]',
        'li[class*="categories"] a[href]',
        '[class*="category-list"] a[href]',
        '[class*="categories-list"] a[href]',
        '[id*="category"] a[href]',
        '[id*="categories"] a[href]',
        'a[href^="/c/"]',
        'a[href*="/c/"]',
        'a[href^="/category/"]',
        'a[href^="/categories/"]'
    ].join(', ');

    function isCategoryIndexPage() {
        const path = String(window.location.pathname || '').toLowerCase();
        return /^\/(?:categories?|porn-categories)(?:\/|$)/i.test(path);
    }

    function isCategoryMenuLink(link) {
        if (!link || !link.getAttribute) return false;

        const rawHref = link.getAttribute('href') || '';
        let parsed = null;
        let pathname = rawHref;
        try {
            parsed = new URL(rawHref, window.location.origin);
            pathname = parsed.pathname || rawHref;
        } catch (e) {}

        if (/^\/(?:c|category|categories)(?:\/|$)/i.test(pathname)) return true;

        // Sexual-orientation switch controls are category buttons even though they do not
        // use the usual /c/ or /category/ route family.
        if (/^\/switch-sexual-orientation(?:\/|$)/i.test(pathname)) return true;
        if (link.matches && link.matches('a.btn.cat[href]')) return true;

        // XVideos also exposes top-level category routes inside <li class="dyn"> wrappers,
        // for example /gay?fmc=1. The wrapper is the authoritative category signal here.
        if (link.closest && link.closest('li.dyn')) return true;

        if (isCategoryIndexPage()) {
            if (parsed && parsed.origin !== window.location.origin) return false;
            if (isVideoWatchPath(pathname)) return false;
            if (/^\/(?:profiles|channels|model-channels)(?:\/|$)/i.test(pathname)) return false;
            return true;
        }

        return !!link.closest(
            'li.dyn, li.dyntop-cat, .dyntop-cat, li[class*="top-cat"], ' +
            'li[class*="category"], li[class*="categories"], ' +
            '[class*="category-list"], [class*="categories-list"], ' +
            '[id*="category"], [id*="categories"]'
        );
    }

    function removeBlockedCategoryEntries() {
        try {
            const categoryLinks = new Set(document.querySelectorAll(CATEGORY_LINK_SELECTOR));

            // Category-index layouts sometimes use plain list/grid wrappers with no useful class.
            // On that page only, inspect same-site links broadly and still remove just the matching entry.
            if (isCategoryIndexPage()) {
                document.querySelectorAll('a[href]').forEach(link => categoryLinks.add(link));
            }

            categoryLinks.forEach(link => {
                if (!link || !link.isConnected || !isCategoryMenuLink(link)) return;

                const rawHref = link.getAttribute('href') || '';
                let decodedHref = rawHref;
                try { decodedHref = decodeURIComponent(rawHref.replace(/\+/g, ' ')); } catch (e) {}

                const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
                const searchableValue = `${label} ${decodedHref}`.trim();
                const signature = simpleTextHash(searchableValue);

                if (link.getAttribute(CATEGORY_SIGNATURE_ATTR) === signature) return;
                link.setAttribute(CATEGORY_SIGNATURE_ATTR, signature);

                if (!containsBlockedContent(searchableValue)) return;

                const categoryEntry = link.closest(
                    // The final `li` deliberately catches plain wrappers around `.btn.cat`
                    // orientation/category controls without collapsing the surrounding menu.
                    'li.dyn, li.dyntop-cat, li[class*="top-cat"], li[class*="category"], ' +
                    'li[class*="categories"], [data-category], li'
                ) || link;

                if (categoryEntry && categoryEntry.isConnected) {
                    categoryEntry.remove();
                }
            });
        } catch (e) {
            console.log('Error removing blocked category entries: ' + e.message);
        }
    }


    // --- SEARCH AUTOCOMPLETE ENTRY FILTERING ---
    // Keep this scanner deliberately scoped to autocomplete lists. Broad page-level <li>
    // scanning can accidentally hide unrelated navigation or content cards.
    const autocompleteSectionTitleRegex = /^(?:channels|suggestions|models|pornstars)$/i;

    function isAutocompleteResultLink(link) {
        if (!link || !link.getAttribute) return false;
        const href = (link.getAttribute('href') || '').toLowerCase();
        return href.startsWith('/profiles/') ||
               href.startsWith('/channels/') ||
               href.startsWith('/model-channels/') ||
               href.startsWith('/?k=') ||
               href.includes('?k=');
    }

    function addAutocompleteListEntries(container, entries) {
        if (!container || !container.querySelectorAll) return 0;
        let added = 0;

        const candidates = [];
        if (container.matches && container.matches('li')) candidates.push(container);

        // Prefer direct list entries. Allow one wrapper level for site markup changes.
        try { candidates.push(...container.querySelectorAll(':scope > li, :scope > ul > li')); }
        catch (e) { candidates.push(...container.querySelectorAll('li')); }

        candidates.forEach(entry => {
            const link = entry.querySelector && entry.querySelector('a[href]');
            if (!isAutocompleteResultLink(link)) return;
            entries.add(entry);
            added++;
        });

        return added;
    }

    function collectSearchAutocompleteEntries() {
        const entries = new Set();

        // Exact list classes observed in the live search dropdown.
        document.querySelectorAll(
            'ul.keywords, ul.s-pornstars, ul.s-channels, ul.channels.s-channels'
        ).forEach(list => addAutocompleteListEntries(list, entries));

        // Structural fallback: a named section heading followed by its own list/wrapper.
        document.querySelectorAll('div.title').forEach(title => {
            const titleText = (title.textContent || '').replace(/\s+/g, ' ').trim();
            if (!autocompleteSectionTitleRegex.test(titleText)) return;

            let sibling = title.nextElementSibling;
            let hops = 0;
            while (sibling && hops < 3) {
                if (sibling.matches && sibling.matches('div.title')) break;
                if (addAutocompleteListEntries(sibling, entries) > 0) break;
                sibling = sibling.nextElementSibling;
                hops++;
            }
        });

        return entries;
    }

    function getAutocompleteEntrySearchText(entry) {
        const values = [entry.textContent || ''];
        const link = entry.querySelector('a[href]');

        if (link) {
            const rawHref = link.getAttribute('href') || '';
            let decodedHref = rawHref;
            try { decodedHref = decodeURIComponent(rawHref.replace(/\+/g, ' ')); } catch (e) {}

            values.push(decodedHref);

            try {
                const parsed = new URL(rawHref, window.location.origin);
                values.push(parsed.pathname.replace(/[-_]+/g, ' '));
                const searchTerm = parsed.searchParams.get('k');
                if (searchTerm) values.push(searchTerm);
            } catch (e) {}
        }

        return values.join(' ');
    }

    function setAutocompleteEntryCollapsed(entry, shouldCollapse) {
        if (!entry || !entry.style) return;

        entry.setAttribute('data-bravefox-autocomplete-entry', 'true');

        if (shouldCollapse) {
            const wasBlocked = entry.getAttribute('data-bravefox-autocomplete-filtered') === 'true';

            if (!wasBlocked) {
                entry.setAttribute('data-bravefox-original-display', entry.style.getPropertyValue('display') || '');
                entry.setAttribute('data-bravefox-original-display-priority', entry.style.getPropertyPriority('display') || '');
            }

            entry.setAttribute('data-bravefox-autocomplete-filtered', 'true');
            entry.setAttribute('aria-hidden', 'true');
            entry.style.setProperty('display', 'none', 'important');

            if (!wasBlocked) {
                console.log(`Collapsed blocked autocomplete entry: ${getAutocompleteEntrySearchText(entry).trim()}`);
            }
            return;
        }

        // XVideos can recycle an existing <li> for a new result. Restore only our display change.
        if (entry.getAttribute('data-bravefox-autocomplete-filtered') === 'true') {
            const originalDisplay = entry.getAttribute('data-bravefox-original-display') || '';
            const originalPriority = entry.getAttribute('data-bravefox-original-display-priority') || '';

            if (originalDisplay) entry.style.setProperty('display', originalDisplay, originalPriority);
            else entry.style.removeProperty('display');

            entry.removeAttribute('data-bravefox-autocomplete-filtered');
            entry.removeAttribute('data-bravefox-original-display');
            entry.removeAttribute('data-bravefox-original-display-priority');
            entry.removeAttribute('aria-hidden');
        }
    }

    function filterSearchAutocompleteEntries() {
        try {
            collectSearchAutocompleteEntries().forEach(entry => {
                if (!entry || !entry.isConnected) return;
                const searchableValue = getAutocompleteEntrySearchText(entry);
                setAutocompleteEntryCollapsed(entry, containsBlockedContent(searchableValue));
            });
        } catch (e) {
            console.log('Error filtering search autocomplete entries: ' + e.message);
        }
    }

    function isInsideSearchAutocomplete(element) {
        if (!element || !element.closest) return false;

        if (element.closest('[data-bravefox-autocomplete-entry="true"], ul.keywords, ul.s-pornstars, ul.s-channels, ul.channels.s-channels')) {
            return true;
        }

        // Fallback for a freshly mounted entry before our marker is applied.
        const listItem = element.closest('li');
        if (!listItem) return false;
        const link = listItem.querySelector('a[href]');
        if (!isAutocompleteResultLink(link)) return false;

        let previous = listItem.parentElement && listItem.parentElement.previousElementSibling;
        return !!(previous && previous.matches && previous.matches('div.title') &&
            autocompleteSectionTitleRegex.test((previous.textContent || '').replace(/\s+/g, ' ').trim()));
    }

    // --- NO-GLIMPSE VIDEO RESULT FILTERING ---
    function addUniqueSearchValue(values, seen, value) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        values.push(normalized);
    }

    function simpleTextHash(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function normalizeVideoWatchUrl(rawValue) {
        const raw = String(rawValue || '').replace(/&amp;/gi, '&').trim();
        if (!raw) return '';

        try {
            const parsed = new URL(raw, window.location.origin);
            const hostname = parsed.hostname.toLowerCase();
            if (!(hostname === 'xvideos.com' || hostname.endsWith('.xvideos.com'))) return '';

            let pathname = parsed.pathname || '';
            if (!isVideoWatchPath(pathname)) return '';

            // Some thumbnail/hover templates expose a pseudo-watch URL containing a numeric
            // thumbnail id and the literal THUMBNUM placeholder. That URL always 404s.
            pathname = pathname
                .replace(/\/\d+\/THUMBNUM(?=\/|$)/ig, '')
                .replace(/\/THUMBNUM(?=\/|$)/ig, '')
                .replace(/\/{2,}/g, '/');

            if (/THUMB(?:NUM|ID|URL)?/i.test(pathname)) return '';
            if (!isVideoWatchPath(pathname)) return '';

            return parsed.origin + pathname;
        } catch (e) {
            return '';
        }
    }

    function getVideoResultCardVideoUrl(card) {
        if (!card || !card.querySelectorAll) return '';

        const candidates = [];
        const addCandidate = (rawValue, score) => {
            const normalized = normalizeVideoWatchUrl(rawValue);
            if (!normalized) return;
            candidates.push({ url: normalized, score });
        };

        // Prefer the visible title/thumbnail anchors over hidden hover-template anchors.
        card.querySelectorAll('a[href], a[data-href], a[data-url], a[data-video-url]').forEach(link => {
            let score = 0;
            if (link.matches('.thumb-title a, a.thumb-title, .thumb-inside a, a.video-title')) score += 100;
            if (link.textContent && link.textContent.trim()) score += 20;
            if (link.getAttribute('title')) score += 15;

            ['href', 'data-href', 'data-url', 'data-video-url'].forEach(attribute => {
                const rawValue = link.getAttribute(attribute) || '';
                if (!rawValue) return;

                let candidateScore = score;
                if (/THUMBNUM|THUMBID|THUMBURL/i.test(rawValue)) candidateScore -= 40;
                addCandidate(rawValue, candidateScore);
            });

            // The DOM property may contain a resolved URL even when the raw attribute is templated.
            try { addCandidate(link.href, score + 5); } catch (e) {}
        });

        ['data-href', 'data-url', 'data-video-url'].forEach(attribute => {
            if (card.hasAttribute && card.hasAttribute(attribute)) {
                addCandidate(card.getAttribute(attribute), 30);
            }
        });

        if (candidates.length === 0) return '';
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].url;
    }

    function getVideoResultCardLocalSearchText(card) {
        const values = [];
        const seen = new Set();
        const addValue = value => addUniqueSearchValue(values, seen, value);

        // Only card-local title/uploader/model information. Tags and broad `.metadata`
        // containers are deliberately excluded.
        const localSelectors = [
            '.thumb-title', '.thumb-title a', '.video-title',
            '.username', '.user-profile-name', '.uploader', '.main-uploader',
            '.uploader-tag .name', '.model', '.models', '.model-name',
            '[data-title]', '[data-video-title]', '[data-uploader]',
            '[data-username]', '[data-model]', '[data-models]',
            '[data-performer]', '[data-performers]'
        ].join(', ');

        card.querySelectorAll(localSelectors).forEach(element => {
            addValue(element.innerText || element.textContent || '');
            addValue(element.getAttribute && element.getAttribute('title'));
            addValue(element.getAttribute && element.getAttribute('alt'));
            [
                'data-title', 'data-video-title', 'data-uploader', 'data-username',
                'data-model', 'data-models', 'data-performer', 'data-performers'
            ].forEach(attribute => {
                if (element.hasAttribute && element.hasAttribute(attribute)) {
                    addValue(element.getAttribute(attribute));
                }
            });
        });

        for (const link of card.querySelectorAll('a[href]')) {
            const rawHref = link.getAttribute('href') || '';
            try {
                const parsed = new URL(rawHref, window.location.origin);
                if (!isVideoWatchPath(parsed.pathname)) continue;
                addValue(link.getAttribute('title'));
                addValue(link.textContent || '');
                addValue(decodeURIComponent(parsed.pathname).replace(/[-_./]+/g, ' '));
            } catch (e) {}
        }

        return values.join(' ');
    }

    function addPeopleValue(values, seen, value) {
        if (!value) return;
        if (typeof value === 'string' || typeof value === 'number') {
            addUniqueSearchValue(values, seen, value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => addPeopleValue(values, seen, item));
            return;
        }
        if (typeof value === 'object') {
            addUniqueSearchValue(values, seen, value.name || value.alternateName || '');
        }
    }

    function collectVideoObjectMetadata(node, values, seen) {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(item => collectVideoObjectMetadata(item, values, seen));
            return;
        }
        if (typeof node !== 'object') return;

        const rawType = node['@type'];
        const types = Array.isArray(rawType) ? rawType : [rawType];
        const isVideoObject = types.some(type => String(type || '').toLowerCase() === 'videoobject');

        if (isVideoObject) {
            addUniqueSearchValue(values, seen, node.name || node.headline || '');
            addPeopleValue(values, seen, node.author);
            addPeopleValue(values, seen, node.creator);
            addPeopleValue(values, seen, node.actor);
            addPeopleValue(values, seen, node.contributor);
            addPeopleValue(values, seen, node.performer);
        }

        if (node['@graph']) collectVideoObjectMetadata(node['@graph'], values, seen);
    }

    function extractVideoPageTitleUploaderModel(html) {
        const values = [];
        const seen = new Set();
        const addValue = value => addUniqueSearchValue(values, seen, value);

        if (!html || typeof DOMParser === 'undefined') return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc) return '';

        addValue(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'));
        addValue(doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content'));
        addValue(doc.querySelector('title')?.textContent);

        doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
                collectVideoObjectMetadata(JSON.parse(script.textContent || ''), values, seen);
            } catch (e) {}
        });

        const titleSelectors = [
            'main h1', '#main h1', 'h1.page-title', '.page-title h1',
            '.video-title h1', 'h1.video-title', '[itemtype*="VideoObject"] [itemprop="name"]'
        ].join(', ');

        doc.querySelectorAll(titleSelectors).forEach(element => {
            if (element.closest('.thumb-block, .related-videos, #related-videos, .autocomplete')) return;
            addValue(element.textContent || '');
        });

        const peopleSelectors = [
            '.main-uploader', '.main-uploader .name', '.uploader-tag', '.uploader-tag .name',
            '.video-metadata [itemprop="author"]', '.video-metadata [itemprop="creator"]',
            '.video-metadata [itemprop="actor"]', '.video-metadata li.model',
            '.video-metadata .model', '.video-metadata .models',
            '.video-models', '.models-list', '[itemprop="author"]',
            '[itemprop="creator"]', '[itemprop="actor"]'
        ].join(', ');

        doc.querySelectorAll(peopleSelectors).forEach(element => {
            if (element.closest('.thumb-block, .related-videos, #related-videos, .autocomplete, .video-tags, .tags')) return;
            addValue(element.textContent || '');
        });

        doc.querySelectorAll(
            '.video-metadata, .main-uploader, .uploader-tag, .video-models, .models-list, li.model'
        ).forEach(root => {
            root.querySelectorAll(
                'a[href^="/profiles/"], a[href^="/channels/"], a[href^="/model-channels/"]'
            ).forEach(link => {
                addValue(link.textContent || '');
                try {
                    const parsed = new URL(link.getAttribute('href') || '', 'https://www.xvideos.com');
                    const slug = parsed.pathname.split('/').filter(Boolean).pop() || '';
                    addValue(decodeURIComponent(slug).replace(/[-_]+/g, ' '));
                } catch (e) {}
            });
        });

        return values.join(' ');
    }

    function trimVideoPageMetadataCache() {
        while (videoPageMetadataCache.size > VIDEO_PAGE_METADATA_CACHE_MAX) {
            const oldestKey = videoPageMetadataCache.keys().next().value;
            if (oldestKey === undefined) break;
            videoPageMetadataCache.delete(oldestKey);
        }
    }

    async function fetchVideoPageMetadata(url) {
        if (!braveFoxNativeFetch) return '';

        const controller = new AbortController();
        videoPageAbortControllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), VIDEO_PAGE_FETCH_TIMEOUT_MS);

        try {
            const candidates = [url];

            // Current links can contain an optional title slug. The opaque /video... route itself
            // is a safe fallback when the title-bearing form has gone stale.
            try {
                const parsed = new URL(url, window.location.origin);
                const firstPathPart = parsed.pathname.split('/').filter(Boolean)[0] || '';
                if (firstPathPart && /^video/i.test(firstPathPart)) {
                    const opaqueOnly = `${parsed.origin}/${firstPathPart}`;
                    if (!candidates.includes(opaqueOnly)) candidates.push(opaqueOnly);
                }
            } catch (e) {}

            for (const candidate of candidates) {
                const response = await braveFoxNativeFetch(candidate, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'force-cache',
                    redirect: 'follow',
                    signal: controller.signal,
                    headers: { 'Accept': 'text/html,application/xhtml+xml' }
                });

                if (!response.ok) continue;

                const metadata = extractVideoPageTitleUploaderModel(await response.text());
                if (metadata) return metadata;
            }

            return '';
        } finally {
            clearTimeout(timeoutId);
            videoPageAbortControllers.delete(controller);
        }
    }

    function pumpVideoPageFetchQueue() {
        while (activeVideoPageFetches < VIDEO_PAGE_FETCH_CONCURRENCY && videoPageFetchQueue.length > 0) {
            const job = videoPageFetchQueue.shift();
            activeVideoPageFetches++;

            fetchVideoPageMetadata(job.url)
                .then(metadata => {
                    const value = String(metadata || '');
                    videoPageMetadataCache.set(job.url, {
                        metadata: value,
                        fetchedAt: Date.now(),
                        failed: value.length === 0
                    });
                    trimVideoPageMetadataCache();
                    job.resolve(value);
                })
                .catch(error => {
                    // Network failures must not create a warning storm or retrigger on every DOM
                    // mutation. Cache the empty result briefly and fall back to card-local metadata.
                    videoPageMetadataCache.set(job.url, {
                        metadata: '',
                        fetchedAt: Date.now(),
                        failed: true
                    });
                    trimVideoPageMetadataCache();

                    if (error && error.name !== 'AbortError') {
                        try { console.debug('BraveFox: Optional video-page inspection failed.', job.url); } catch (e) {}
                    }
                    job.resolve('');
                })
                .finally(() => {
                    videoPageMetadataPending.delete(job.url);
                    activeVideoPageFetches--;
                    pumpVideoPageFetchQueue();
                });
        }
    }

    function getVideoPageMetadata(url) {
        const cached = videoPageMetadataCache.get(url);
        if (cached) {
            const ttl = cached.failed
                ? VIDEO_PAGE_METADATA_FAILURE_CACHE_TTL_MS
                : VIDEO_PAGE_METADATA_CACHE_TTL_MS;

            if (Date.now() - cached.fetchedAt < ttl) {
                return Promise.resolve(cached.metadata || '');
            }
        }

        if (videoPageMetadataPending.has(url)) return videoPageMetadataPending.get(url);

        const promise = new Promise(resolve => {
            videoPageFetchQueue.push({ url, resolve });
            pumpVideoPageFetchQueue();
        });
        videoPageMetadataPending.set(url, promise);
        return promise;
    }

    function setVideoResultCardState(card, state, logText) {
        if (!card || !card.setAttribute) return;

        const previousState = card.getAttribute(VIDEO_RESULT_STATE_ATTR);
        card.setAttribute(VIDEO_RESULT_STATE_ATTR, state);
        card.setAttribute(VIDEO_RESULT_REVISION_ATTR, String(videoFilterRevision));

        if (state === 'blocked') {
            card.setAttribute('aria-hidden', 'true');
            if (previousState !== 'blocked') {
                console.log(`No-glimpse blocked video result: ${String(logText || '').trim()}`);
            }
        } else if (state === 'clean') {
            card.removeAttribute('aria-hidden');
        } else {
            card.setAttribute('aria-hidden', 'true');
        }
    }

    function filterVideoResultCard(card) {
        if (!card || !card.isConnected || isInsideSearchAutocomplete(card)) return;

        const videoUrl = getVideoResultCardVideoUrl(card);
        const localText = getVideoResultCardLocalSearchText(card);
        const localHash = simpleTextHash(localText);
        const previousUrl = card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '';
        const previousHash = card.getAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR) || '';
        const previousRevision = card.getAttribute(VIDEO_RESULT_REVISION_ATTR) || '';
        const previousState = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';

        if (
            previousUrl === videoUrl &&
            previousHash === localHash &&
            previousRevision === String(videoFilterRevision) &&
            ['checking', 'clean', 'blocked'].includes(previousState)
        ) return;

        card.setAttribute(VIDEO_RESULT_SOURCE_ATTR, videoUrl);
        card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, localHash);

        if (containsBlockedContent(localText)) {
            setVideoResultCardState(card, 'blocked', localText);
            return;
        }

        if (!videoUrl) {
            setVideoResultCardState(card, 'clean', localText);
            return;
        }

        setVideoResultCardState(card, 'checking', localText);
        const requestRevision = videoFilterRevision;

        getVideoPageMetadata(videoUrl).then(remoteMetadata => {
            if (!card.isConnected) return;
            if ((card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '') !== videoUrl) return;

            const latestLocalText = getVideoResultCardLocalSearchText(card);
            const combinedText = `${latestLocalText} ${remoteMetadata || ''}`.trim();
            card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, simpleTextHash(latestLocalText));
            setVideoResultCardState(
                card,
                containsBlockedContent(combinedText) ? 'blocked' : 'clean',
                combinedText
            );

            if (requestRevision !== videoFilterRevision) {
                queueMicrotask(() => filterVideoResultCard(card));
            }
        });
    }

    function filterVideoResultCards() {
        try {
            document.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(filterVideoResultCard);
        } catch (e) {
            console.log('Error filtering video result cards: ' + e.message);
        }
    }

    // Remove the complete clickable sponsor overlay, not merely its text. The class-based
    // selector catches the same player element even if its destination stops being sheer.com.
    function removeExternalVideoOverlayLinks() {
        try {
            document.querySelectorAll(VIDEO_OVERLAY_LINK_SELECTOR).forEach(link => {
                if (link && link.isConnected) link.remove();
            });

            // Clean up orphan payload nodes if the site mounts them separately.
            document.querySelectorAll('.video-overlay-title-txt, .video-overlay-title-icon').forEach(element => {
                if (!element.closest('a') && element.isConnected) element.remove();
            });
        } catch (e) {
            console.log('Error removing external video overlay links: ' + e.message);
        }
    }

    // Function to hide elements containing blocked regex matches
    const hideBlockedContent = throttle(() => {
        try {
            filterVideoResultCards();

            const elements = document.querySelectorAll(
                '.thumb-title a, .title a, .username, .user-profile-name, .thumb-block, .thumb, .thumb-inside, .video-title, ' +
                'li.model:nth-of-type(2), .hover-name.uploader-tag.main.label.btn-default.btn > .name, .hover-name.uploader-tag.main.label.btn-default.btn, ' +
                '.main-uploader, .cropped.ordered-label-list.video-tags-list.video-metadata, .thumb-under > .metadata > .bg a > .name, ' +
                '.thumb-under > .metadata > .bg a, .cropped.ordered-label-list.video-tags-list.video-metadata > ul, .btn-default.btn.is-keyword'
            );

            elements.forEach(element => {
                if (!element || isInsideSearchAutocomplete(element)) return;
                if (element.closest && element.closest(VIDEO_RESULT_CARD_SELECTOR)) return;
                if (processedElements.has(element)) return;
                processedElements.add(element);

                const text = element.innerText || element.textContent || '';
                if (containsBlockedContent(text)) {
                    const parentElement = element.closest(
                        '.thumb-block, .thumb, .thumb-inside, .video-title, ' +
                        'li.model:nth-of-type(2), .hover-name.uploader-tag.main.label.btn-default.btn, .main-uploader, ' +
                        '.cropped.ordered-label-list.video-tags-list.video-metadata, .metadata .bg'
                    );
                    if (parentElement) {
                        parentElement.style.setProperty('display', 'none', 'important');
                        console.log(`Blocked element containing: ${element.innerText}`);
                    }
                }
            });
        } catch (e) {
            console.log('Error hiding blocked content: ' + e.message);
        }
    }, 200);

    // Function to delete elements based on selectors
    const deleteContent = throttle(() => {
        try {
            blockSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (!processedElements.has(element)) {
                        processedElements.add(element);
                        element.remove();
                        console.log(`Deleted element: ${selector}`);
                    }
                });
            });
        } catch (e) {
            console.log('Error deleting content: ' + e.message);
        }
    }, 200);

    // Function to detect if it's the home page and perform actions accordingly
    function handleHomePage() {
        try {
            if (document.body) {
                const bodyClass = document.body.className;
                if (bodyClass.includes('home')) {
                    console.log("On the home page. Performing home page specific actions.");
                    filterSearchAutocompleteEntries();
                    filterVideoResultCards();
                    removeBlockedCategoryEntries();
                    hideBlockedContent();
                    deleteContent();
                }
            }
        } catch (e) {
            console.log('Error handling home page: ' + e.message);
        }
    }

    // Intercept network requests to block tracker URLs
    const trackerPatterns = [
        /tracker\.example\.com/,
        /analytics\.example\.com/
    ];

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        const url = args[0];
        if (trackerPatterns.some(pattern => pattern.test(url))) {
            console.log(`Blocked tracker URL: ${url}`);
            return Promise.reject('Blocked tracker URL');
        }
        return originalFetch.apply(this, args);
    };

    // Intercept XMLHttpRequest (for older-style tracking) and block requests to known trackers
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (trackerPatterns.some(pattern => pattern.test(url))) {
            console.log(`Blocked tracker URL: ${url}`);
            return;
        }
        originalXhrOpen.apply(this, arguments);
    };

    // --- TITANIUM SPA AWARENESS HOOKS ---
    function checkSPARouting() {
        if (__lastKnownUrl !== window.location.href) {
            __lastKnownUrl = window.location.href;
            window.dispatchEvent(new Event('locationchange'));
        }
    }
    setInterval(checkSPARouting, 70);

    (function() {
        const _wr = function(type) {
            const orig = history[type];
            return function() {
                const rv = orig.apply(this, arguments);
                window.dispatchEvent(new Event(type));
                window.dispatchEvent(new Event('locationchange'));
                return rv;
            };
        };
        history.pushState = _wr('pushState');
        history.replaceState = _wr('replaceState');
        window.addEventListener('popstate', function() {
            window.dispatchEvent(new Event('locationchange'));
        });
    })();

    // Listen for location changes
    window.addEventListener('locationchange', function() {
        removeExternalVideoOverlayLinks();
        filterSearchAutocompleteEntries();
        filterVideoResultCards();
        checkAndRedirectVideoPageBlockedContent();
        checkAndRedirectUrlBlockedContent();
        removeBlockedCategoryEntries();
        hideBlockedContent();
        deleteContent();
        handleHomePage();
    });

    // Observe URL changes to check for blocked content (Legacy Support)
    function observeUrlChanges() {
        let currentUrl = window.location.href;
        
        const throttledUrlCheck = throttle(() => {
            if (currentUrl !== window.location.href) {
                currentUrl = window.location.href;
                removeExternalVideoOverlayLinks();
                filterSearchAutocompleteEntries();
                filterVideoResultCards();
                checkAndRedirectVideoPageBlockedContent();
                checkAndRedirectUrlBlockedContent();
            }
        }, 500);
        
        const observer = new MutationObserver(throttledUrlCheck);
        observerInstances.add(observer);

        const observeWhenReady = () => {
            if (document.body) {
                observer.observe(document.body, { 
                    childList: true, 
                    subtree: true,
                    attributes: false,
                    characterData: false
                });
            } else {
                setTimeout(observeWhenReady, 100);
            }
        };

        observeWhenReady();
    }

    // Initial check for blocked content
    removeExternalVideoOverlayLinks();
    filterSearchAutocompleteEntries();
    filterVideoResultCards();
    checkAndRedirectVideoPageBlockedContent();
    checkAndRedirectUrlBlockedContent();

    // Initial checks for blocked content and home page content
    removeBlockedCategoryEntries();
    hideBlockedContent();
    deleteContent();
    handleHomePage();

    // Start observing URL changes and applying content filtering
    observeUrlChanges();

    // Observe DOM changes to dynamically apply filters on new content.
    // Card classification and sponsor removal run on every mutation microtask so blocked
    // results never receive a paint. Heavier broad scans remain throttled.
    const throttledDomObserverWork = throttle(() => {
        removeBlockedCategoryEntries();
        hideBlockedContent();
        checkAndRedirectVideoPageBlockedContent();
        deleteContent();
    }, 300);

    const domObserver = new MutationObserver(() => {
        removeExternalVideoOverlayLinks();
        filterSearchAutocompleteEntries();
        filterVideoResultCards();
        throttledDomObserverWork();
    });
    observerInstances.add(domObserver);

    // Ensure the document body is available before observing
    const observeDOMWhenReady = () => {
        if (document.body) {
            domObserver.observe(document.body, { 
                childList: true, 
                subtree: true,
                attributes: false,
                characterData: true
            });
        } else {
            setTimeout(observeDOMWhenReady, 100);
        }
    };

    observeDOMWhenReady();

})();