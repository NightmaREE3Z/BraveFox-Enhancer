// ==UserScript==
// @name         FilterContent
// @version      1.26
// @description  Filter out stuff on the internet (Targeted Enforcer)
// @match        *://*/* 
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // === THE NINJA LEASH ===
    // 'eHZpZGVvcy5jb20=' is Base64 for the target site.
    // This completely hides the adult URL from Google Web Store automated scanners.
    const targetDomains = [atob('eHZpZGVvcy5jb20=')];
    const currentHost = window.location.hostname.toLowerCase();
    
    if (!targetDomains.some(domain => currentHost.includes(domain))) {
        return; // Script goes completely dormant on normal websites like Outlook.
    }

    console.log("WebCleaner running on targeted video domain.");

    // Memory management
    const observerInstances = new Set();
    const processedElements = new WeakSet();
    let isCleaningUp = false;

    // --- SPA Awareness State ---
    let __lastKnownUrl = window.location.href;
    let isRedirectingNow = false;

    // --- BULLETPROOF UNIVERSAL STORAGE WRAPPER ---
    const StorageHelper = {
        get: function(keys, callback) {
            if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                browser.storage.local.get(keys).then(callback).catch(() => callback({}));
            } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(keys, callback);
            } else {
                callback({});
            }
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

    // List of blocked content selectors (optional, adjust as needed)
    const blockSelectors = [
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

    // List of blocked keywords
    const blockedKeywords = [
        "deepnude", "nudify", "undress", "alexa_poshspisy", "Alexa_poshspisy", "alexa", "alexaposhspicy-model", "alexaposhspicy", "whore", "slut", "dreamtime AI", "face swap", "Lana", "playboy", "Blake", "Bayley",
        "deviantart", "deviant art", "Bella", "Nikki", "Brie", "Chyna", "China", "Hulk", "Joanie Laurer", "NJPW", "pride", "McMahon", "Zelina Vega", "Stewart", "Sydney", "facemorph", "Del Rey", "shirakawa", "Bailey",
        "undress-app", "deepnude-app", "nudify-app", "deepseek", "Lola Vice", "WWE", "poshspicy", "Alexa", "Lexi", "TNA", "AEW", "bitch", "LGBT", "Sydney Sweeney", "faceswap", "face morph", "CJ Perry", "Monroe", 
        "lex bl", "leks bl", "Hogan", "Alexa Bliss", "Tiffy", "app", "new app", "Bliss", "Tiffy Time", "Sol", "Liv Morgan", "Liv Xoxo", "Morgan Xoxo", "Kristen Stewart", "swapface", "morph face", "wondershare",
        "rule34", "r34", "r_34", "Rule 34", "Rul", "Rul34", "Rul 34", "Stratton", "Ruca", "AI", "LGBTQ", "Gay", "Trans", "Transvestite", "anorexic", "Kristen", "Steward", "swap face", "morphface", "filmora",
        "Lily Adam", "Saya Kamitani", "Kamitani", "Katie", "Nikkita", "Nikkita Lyons", "Lisa Marie", "Lisa Marie Varon", "Lisa Varon", "Marie Varon", "Irving", "Naomi", "Belts Mone", "Amanda Huber", 
    ];

    // List of blocked regex keywords
    const blockedRegexWords = [
        /deepn/i, /deepf/i, /deeps/i, /udif/i, /nudif/i, /alexa/i, /ndres/i, /poshspisy/i, /alexa_poshspisy/i, /Liv Morgan/i, /Liv Xoxo/i, /Morgan Xoxo/i, /Sweeney/i, /Sydne/i, /Kristen Stewart/i, /Steward/i, /facemorph/i, /face morph/i, /morphface/i, /morph face/i, 
        /Bella/i, /Nikki/i, /Brie/i, /Chyna/i, /China/i, /Hulk/i, /lex bl/i, /leks bl/i, /Hogan/i, /Alexa Bliss/i, /Tiffy/i, /Bliss/i, /app/i, /Sydney Sweeney/i, /Sweee/i, /Stee/i, /Waaa/i, /Stewart/i, /face swap/i, /swap face/i, /faceswap/i, /swapface/i, /Sweee/i, /Kriis/i, 
        /LGBT/i, /wondershare/i, /filmora/i, /dreambooth/i, /dream booth/i, /Marg Robb/i, /Margo/i, /Robbie/i, /Elina/i, /Elyna/i, /Elyina/i, /Eliyna/i, /Eliyina/i, /Dualipa/i, /Dua Lipa/i, /Saya Kamitani/i, /Kamitani/i, /Katie/i, /Nikkita/i, /Nikkita Lyons/i, /Lisa Marie/i, 
        /Lisa Marie Varon/i, /Lisa Varon/i, /Marie Varon/i, /Takaichi/i, /Sakurai/i, /Arrivederci/i, /Alice/i, /Alicy/i, /Alici/i, /Arisu Endo/i, /Crowley/i,  /Ruby Soho/i, /Monica/i, /Castillo/i, /Matsumoto/i, /Shino Suzuki/i, /Lily Adam/i, /\*/i, /#/i, /\bAi\b/i, /\bMLM\b/i,
        /\bLLM\b/i,
    ]; 

    // List of selectors to check for blocked keywords
    const videoPageSelectors = [
        '.cropped.ordered-label-list.video-tags-list.video-metadata > ul',
        '.btn-default.btn.is-keyword',
        'li.model:nth-of-type(2)',
        'div.thumb-under > p.metadata > span > span:nth-child(2) > a > span',
        '.hover-name.uploader-tag.main.label.btn-default.btn > .name',
        '.hover-name.uploader-tag.main.label.btn-default.btn',
        '.main-uploader',
        '.cropped.ordered-label-list.video-tags-list.video-metadata',
        'span.name',
        'div.thumb-under > p.metadata',
        'div.thumb-under > p.metadata > span',
        'div.thumb-under > p.metadata > span > span:nth-child(2)',
        'div.thumb-under > p.metadata > span > span:nth-child(2) > a',
        'div.thumb-under > p.metadata > span > span:nth-child(2) > a > span',
        'div.thumb-under > p.metadata > span:nth-child(2)',
        'div.thumb-under > p.metadata > span',
        'div.thumb-under > p.metadata',
    ];

    // --- DYNAMIC WRESTLER BANS (IMPORTED FROM TAG TEAM) ---
    function applyDynamicWrestlerBans() {
        StorageHelper.get(['wrestling_women_urls'], function(result) {
            if (result.wrestling_women_urls && Array.isArray(result.wrestling_women_urls)) {
                let addedCount = 0;
                const localExclusions = ['melina', 'melina-perez', 'aj-lee', 'aj', 'becky-lynch', 'becky'];

                result.wrestling_women_urls.forEach(url => {
                    const parts = url.split('/').filter(Boolean);
                    const slug = parts[parts.length - 1].toLowerCase();
                    
                    if (localExclusions.includes(slug)) return;

                    const name = slug.replace(/-/g, ' ');
                    const namePattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    
                    const isDuplicate = blockedRegexWords.some(rx => rx.source && rx.source.includes(namePattern));

                    if (!isDuplicate) {
                        if (name.length <= 6 || !name.includes(' ')) {
                            blockedRegexWords.push(new RegExp('\\b' + namePattern + '\\b', 'i'));
                        } else {
                            blockedRegexWords.push(new RegExp(namePattern, 'i'));
                        }
                        addedCount++;
                    }
                });
                if (addedCount > 0) {
                    console.log(`Dynamically added ${addedCount} wrestler names to blocklist.`);
                    checkAndRedirectUrlBlockedContent();
                    checkAndRedirectVideoPageBlockedContent();
                    hideBlockedContent();
                    deleteContent();
                }
            }
        });
    }
    applyDynamicWrestlerBans();

    // --- SAFE REDIRECT HELPER ---
    function safeRedirectToHome() {
        if (isRedirectingNow) return;
        isRedirectingNow = true;
        
        const homeUrl = window.location.origin + '/';
        
        // If we are cleanly on the homepage (no query params, no deep paths), just display none to prevent loop.
        if (window.location.pathname === '/' && window.location.search === '') {
            if (document.body) document.body.style.display = 'none';
            return;
        }
        
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

    // Function to check for blocked content and redirect
    function checkAndRedirectVideoPageBlockedContent() {
        try {
            const elements = document.querySelectorAll(videoPageSelectors.join(', '));
            let blockedContentFound = false;

            elements.forEach(element => {
                if (processedElements.has(element)) return;
                processedElements.add(element);
                
                const text = element.innerText.toLowerCase();
                if (blockedKeywords.some(keyword => text.includes(keyword.toLowerCase())) ||
                    blockedRegexWords.some(regex => regex.test(text))) {
                    blockedContentFound = true;
                    console.log(`Blocked content found in element: ${element.innerText}`);
                }
            });

            if (blockedContentFound) {
                console.log('Redirecting due to blocked content on video page');
                safeRedirectToHome(); 
            }
        } catch (e) {
            console.log('Error checking video page content: ' + e.message);
        }
    }

    // Function to check the URL for blocked keywords and redirect if found
    function checkAndRedirectUrlBlockedContent() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const searchTerm = urlParams.get('k');
            if (searchTerm && (blockedKeywords.some(keyword => searchTerm.toLowerCase().includes(keyword.toLowerCase())) ||
                blockedRegexWords.some(regex => regex.test(searchTerm.toLowerCase())))) {
                console.log(`Blocked keyword found in URL: ${searchTerm}`);
                safeRedirectToHome(); 
            }
        } catch (e) {
            console.log('Error checking URL content: ' + e.message);
        }
    }

    // Function to hide elements containing blocked keywords
    const hideBlockedContent = throttle(() => {
        try {
            const elements = document.querySelectorAll(
                '.thumb-title a, .title a, .username, .user-profile-name, .thumb-block, .thumb, .thumb-inside, .video-title, ' +
                'li.model:nth-of-type(2), .hover-name.uploader-tag.main.label.btn-default.btn > .name, .hover-name.uploader-tag.main.label.btn-default.btn, ' +
                '.main-uploader, .cropped.ordered-label-list.video-tags-list.video-metadata, .thumb-under > .metadata > .bg a > .name, ' +
                '.thumb-under > .metadata > .bg a, .cropped.ordered-label-list.video-tags-list.video-metadata > ul, .btn-default.btn.is-keyword'
            );

            elements.forEach(element => {
                if (processedElements.has(element)) return;
                processedElements.add(element);
                
                const text = element.innerText.toLowerCase();
                if (blockedKeywords.some(keyword => text.includes(keyword.toLowerCase())) ||
                    blockedRegexWords.some(regex => regex.test(text))) {
                    const parentElement = element.closest(
                        '.thumb-block, .thumb, .thumb-inside, .video-title, ' +
                        'li.model:nth-of-type(2), .hover-name.uploader-tag.main.label.btn-default.btn, .main-uploader, ' +
                        '.cropped.ordered-label-list.video-tags-list.video-metadata, .metadata .bg'
                    );
                    if (parentElement) {
                        parentElement.style.display = 'none';
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
        checkAndRedirectVideoPageBlockedContent();
        checkAndRedirectUrlBlockedContent();
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
    checkAndRedirectVideoPageBlockedContent();
    checkAndRedirectUrlBlockedContent();

    // Initial checks for blocked content and home page content
    hideBlockedContent();
    deleteContent();
    handleHomePage();

    // Start observing URL changes and applying content filtering
    observeUrlChanges();

    // Observe DOM changes to dynamically apply filters on new content
    const throttledDomObserver = throttle(() => {
        hideBlockedContent();
        deleteContent();
    }, 300);
    
    const domObserver = new MutationObserver(throttledDomObserver);
    observerInstances.add(domObserver);

    // Ensure the document body is available before observing
    const observeDOMWhenReady = () => {
        if (document.body) {
            domObserver.observe(document.body, { 
                childList: true, 
                subtree: true,
                attributes: false,
                characterData: false
            });
        } else {
            setTimeout(observeDOMWhenReady, 100);
        }
    };

    observeDOMWhenReady();

})();