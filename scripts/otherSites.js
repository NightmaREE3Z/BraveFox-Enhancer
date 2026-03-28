// BraveFox Enhancer - BlockSite "Delete Account" Element Remover (Universal)
// Only removes "delete account" elements from BlockSite pages
// Keeps CSS pre-hiding and universal coverage, but DOES NOT touch trash icons, popup remove buttons, or general blocksite elements

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        targetUrls: [
            'user.blocksite.co/options/BLOCK_SITES',
            'user.blocksite.co/settings/account',
            'blocksite.co',
            'blocksite'
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
    // CSS hiding
    function injectHidingCSS() {
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
                '[data-automation="delete-account-box"], [data-automation="delete-account"], [data-automation="change-password-box"], [data-automation="reset-password"], .sc-cscAeM.hllMaI, .sc-dxcDKg.layfBB[data-automation="delete-account"], [data-automation="box-title"], [data-automation="box-subTitle"] { transition: none !important; animation: none !important; }'
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

                            if (hasUnwantedElements || hasErrorNotification) shouldProcess = true;
                        }
                    });
                }
            });
            if (shouldProcess) {
                setTimeout(() => {
                    removeUnwantedElements();
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
            removeUnwantedElements();
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
        removeUnwantedElements();
        hideNextDNSForgotPasswordLinks();
        modifyErrorNotification();
        setupObserver();
        const fastRetryInterval = setInterval(() => {
            retryCount++;
            const count = removeUnwantedElements();
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
        const initialCount = removeUnwantedElements();
        hideNextDNSForgotPasswordLinks();
        modifyErrorNotification();
        console.log(`BraveFox: Initially processed ${initialCount} delete account elements universally`);
        setupObserver();
        setupContinuousMonitoring();
        setupUrlMonitoring();
        const initialRetryInterval = setInterval(() => {
            retryCount++;
            const count = removeUnwantedElements();
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
            if (observer) observer.disconnect();
        });
    }
    function handleUrlChange() {
        console.log('BraveFox: URL change detected in universal navigation observer');
        setTimeout(() => { reinitialize(); }, 100);
    }
    // IMMEDIATE UNIVERSAL EXECUTION - Run on ALL sites
    injectHidingCSS();
    const earlyInterval = setInterval(() => {
        try { 
            removeUnwantedElements(); 
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
            universal: true
        })
    };
})();