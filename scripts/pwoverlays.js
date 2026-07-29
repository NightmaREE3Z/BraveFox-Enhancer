// BraveFox Enhancer Master Password Protection Module

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

    
    // Password Protection Configuration
    const PASSWORD_CONFIG = {
        enabled: true,
        password: '5u89asyadhy2adhg9uh3572y1',
        sessionKey: 'bravefox_auth', 
        navigationKey: 'bravefox_navigation', 
        maxAttempts: 15,
        lockoutDuration: 300000, 
        lockoutKey: 'bravefox_lockout', 
        authTTL: 300000,
        
        targetDomains: [
            'example.com'
        ],
        
        exactPaths: [
            { hostname: 'reddit.com', pathname: '/settings/preferences' },
            { hostname: 'www.reddit.com', pathname: '/settings/preferences' },
            { hostname: 'old.reddit.com', pathname: '/prefs' },
            { hostname: 'reddit.com', pathname: '/answers' },
            { hostname: 'www.reddit.com', pathname: '/answers' },
        ],
        
        urlPatterns: [
            'virtualbox.org/*',
            'google.com/chrome/*',
            'chrome.google.com/*', 
            'chromewebstore.google.com/*',
            'google.com/intl/fi/chrome/update/*',
            'google.com/intl/fi/chrome/*',
            'gist.github.com/*',
            'gist.github.com/',
            'partner.microsoft.com/*',
            'addons.mozilla.org/*',
            'mega.nz*',
            'github.com/NightmaREE3Z*',
            '*github.com/NightmaREE3Z*',
            '*github.com/ungoogled-software*',
            '*gemini.google.com/gem/7b575190249c*',
            '*gemini.google.com/app/7b575190249c*',
            'gist.github.com/',
            'chrome.google.com/webstore/devconsole*', 
            '*blocksite.co/options*',
            '*blocksite.co/*BLOCK_SITES*'
        ],
        
        exactUrls: [],
        
        queryParams: [
            { param: 'tab', value: 'blocking', hostname: 'www.facebook.com', pathname: '/settings/' },
            { param: 'tab', value: 'blocking', hostname: 'facebook.com', pathname: '/settings/' },
        ]
    };
    
    let passwordOverlayHost = null;
    let isAuthenticated = false;
    let attemptCount = 0;
    let initializationComplete = false;
    let contentHidingStyleSheet = null;
    let urlCheckInterval = null;
    let lastCheckedUrl = '';
    let facebookNavigationObserver = null;
    let facebookMutationObserver = null;
    let githubMutationObserver = null;
    let geminiMutationObserver = null;
    let chromeDevConsoleMutationObserver = null;
    
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; 
        }
        return hash.toString();
    }
    
    function matchesPattern(pattern, url) {
        const cleanUrl = url.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
        const cleanPattern = pattern.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
        
        let regexPattern = cleanPattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') 
            .replace(/\\\*/g, '.*'); 
        
        if (cleanPattern.includes('github.com/nightmareee3z')) {
            if (cleanPattern === 'github.com/nightmareee3z*') {
                regexPattern = 'github\\.com/nightmareee3z($|/.*|\\?.*)';
            }
        }
        
        const regex = new RegExp('^' + regexPattern + '$', 'i');
        return regex.test(cleanUrl);
    }
    
    function shouldProtectPage() {
        const hostname = window.location.hostname.toLowerCase();
        const pathname = window.location.pathname.toLowerCase();
        const href = window.location.href.toLowerCase();
        const search = window.location.search.toLowerCase();
        
        const isDomainMatch = PASSWORD_CONFIG.targetDomains.some(domain => {
            return hostname.includes(domain.toLowerCase());
        });
        
        const isExactPathMatch = PASSWORD_CONFIG.exactPaths.some(pathConfig => {
            const targetHostname = pathConfig.hostname.toLowerCase();
            const targetPathname = pathConfig.pathname.toLowerCase();
            
            const hostnameMatches = 
                hostname === targetHostname || 
                hostname === `www.${targetHostname}` ||
                (hostname.startsWith('www.') && hostname.substring(4) === targetHostname) ||
                (targetHostname.startsWith('www.') && targetHostname.substring(4) === hostname);
            
            return hostnameMatches && pathname === targetPathname;
        });
        
        const isPatternMatch = PASSWORD_CONFIG.urlPatterns.some(pattern => {
            return matchesPattern(pattern, href);
        });
        
        const isExactUrlMatch = PASSWORD_CONFIG.exactUrls.some(exactUrl => {
            return href === exactUrl.toLowerCase();
        });
        
        const isQueryParamMatch = PASSWORD_CONFIG.queryParams.some(paramConfig => {
            const urlParams = new URLSearchParams(search);
            const paramValue = urlParams.get(paramConfig.param);
            const paramMatches = paramValue && paramValue.toLowerCase() === paramConfig.value.toLowerCase();
            
            let hostnameMatches = true;
            let pathnameMatches = true;
            
            if (paramConfig.hostname) {
                const targetHostname = paramConfig.hostname.toLowerCase();
                hostnameMatches = 
                    hostname === targetHostname || 
                    hostname === `www.${targetHostname}` ||
                    (hostname.startsWith('www.') && hostname.substring(4) === targetHostname) ||
                    (targetHostname.startsWith('www.') && targetHostname.substring(4) === hostname);
            }
            
            if (paramConfig.pathname) {
                pathnameMatches = pathname === paramConfig.pathname.toLowerCase();
            }
            
            return paramMatches && hostnameMatches && pathnameMatches;
        });
        
        const isRedditSpecialCase = (
            (hostname.includes('reddit.com') || hostname.includes('old.reddit.com')) &&
            (pathname === '/settings/preferences' || pathname === '/prefs' || pathname === '/answers')
        );
        
        const isGitHubProfileMatch = (
            hostname === 'github.com' && 
            (pathname === '/nightmareee3z' || pathname === '/nightmareee3z/' || pathname.startsWith('/nightmareee3z/') || pathname.startsWith('/nightmareee3z?'))
        );
        
        return PASSWORD_CONFIG.enabled && (
            isDomainMatch || 
            isExactPathMatch || 
            isPatternMatch || 
            isExactUrlMatch || 
            isQueryParamMatch ||
            isRedditSpecialCase ||
            isGitHubProfileMatch
        );
    }
    
    function isPageRefresh() {
        const navigationFlag = sessionStorage.getItem(PASSWORD_CONFIG.navigationKey);
        if (navigationFlag) {
            sessionStorage.removeItem(PASSWORD_CONFIG.navigationKey);
            return false;
        }
        return true;
    }
    
    function setNavigationFlag() {
        sessionStorage.setItem(PASSWORD_CONFIG.navigationKey, 'true');
    }
    
    function isLockedOut() {
        const lockoutData = sessionStorage.getItem(PASSWORD_CONFIG.lockoutKey);
        if (!lockoutData) return false;
        
        const lockoutTime = parseInt(lockoutData);
        if (Date.now() - lockoutTime < PASSWORD_CONFIG.lockoutDuration) {
            return true;
        } else {
            sessionStorage.removeItem(PASSWORD_CONFIG.lockoutKey);
            return false;
        }
    }
    
    function setLockout() {
        sessionStorage.setItem(PASSWORD_CONFIG.lockoutKey, Date.now().toString());
    }
    
    function checkAuthentication() {
        const hostname = window.location.hostname;
        const expectedToken = simpleHash(PASSWORD_CONFIG.password + hostname);
        let authenticated = false;

        try {
            const authRaw = sessionStorage.getItem(PASSWORD_CONFIG.sessionKey);
            if (authRaw) {
                try {
                    const parsed = JSON.parse(authRaw);
                    const okToken = parsed && parsed.token === expectedToken;
                    const okTime = parsed && typeof parsed.ts === 'number' && (Date.now() - parsed.ts) <= PASSWORD_CONFIG.authTTL;
                    if (okToken && okTime) {
                        authenticated = true;
                    } else if (okToken && !okTime) {
                        sessionStorage.removeItem(PASSWORD_CONFIG.sessionKey);
                    }
                } catch {
                    if (authRaw === expectedToken) {
                        sessionStorage.removeItem(PASSWORD_CONFIG.sessionKey);
                    }
                }
            }
        } catch {}
        
        return authenticated;
    }
    
    function setAuthentication() {
        const token = simpleHash(PASSWORD_CONFIG.password + window.location.hostname);
        const payload = JSON.stringify({ token, ts: Date.now() });
        try {
            sessionStorage.setItem(PASSWORD_CONFIG.sessionKey, payload);
        } catch {}
        isAuthenticated = true;
    }

    function setupIframeMessageListener() {
        if (!window.braveFoxGlobalListenerAdded) {
            window.addEventListener('message', (event) => {
                if (typeof chrome !== 'undefined' && chrome.runtime && event.origin !== `chrome-extension://${chrome.runtime.id}`) {
                    return; 
                }
                
                if (event.data === 'BraveFox-Unlock' || (event.data && event.data.type === 'BraveFox-Unlock')) {
                    setAuthentication();
                    removePasswordOverlay();
                    showPageContent();
                    attemptCount = 0;
                    sessionStorage.removeItem(PASSWORD_CONFIG.lockoutKey);
                    window.dispatchEvent(new CustomEvent('bravefoxAuthenticated'));
                }
            });
            window.braveFoxGlobalListenerAdded = true;
        }
    }
    
    function createPasswordOverlay() {
        if (passwordOverlayHost && document.contains(passwordOverlayHost)) {
            return; 
        }
        
        setupIframeMessageListener();
        
        const randomId = 'bfx-' + Math.random().toString(36).substring(2, 10);
        passwordOverlayHost = document.createElement('div');
        passwordOverlayHost.id = randomId;
        passwordOverlayHost.style.cssText = `
            all: initial !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            pointer-events: auto !important;
            display: block !important;
        `;
        
        const shadow = passwordOverlayHost.attachShadow({ mode: 'closed' });
        const iframe = document.createElement('iframe');
        
        let targetSrc = '';
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            targetSrc = chrome.runtime.getURL('html/password-protected.html');
        }
        
        iframe.src = targetSrc;
        iframe.style.cssText = `
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: rgba(0, 0, 0, 0.95) !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
        `;
        
        shadow.appendChild(iframe);
        const attachmentTarget = document.body || document.documentElement;
        attachmentTarget.appendChild(passwordOverlayHost);
    }
    
    function removePasswordOverlay() {
        if (passwordOverlayHost && passwordOverlayHost.parentNode) {
            passwordOverlayHost.parentNode.removeChild(passwordOverlayHost);
            passwordOverlayHost = null;
        }
    }
    
    function hidePageContent() {
        if (contentHidingStyleSheet && document.contains(contentHidingStyleSheet)) {
            return; 
        }
        
        const cssRules = [
            'body > *:not([id^="bfx-"]) { visibility: hidden !important; opacity: 0 !important; }',
            'body { background: #000 !important; }',
            'nav, header, .header, .navigation, .navbar { visibility: hidden !important; opacity: 0 !important; }',
            'main, .main, .content, .container, #root, #app { visibility: hidden !important; opacity: 0 !important; }',
            '[data-reactroot], [data-vue-app] { visibility: hidden !important; opacity: 0 !important; }',
            '[data-testid], [data-click-id], .Post, .Comment, [id*="AppRouter"], [class*="Layout"] { visibility: hidden !important; opacity: 0 !important; }',
            '[role="main"], [data-pagelet], .fb_content, #content, [id*="mount"], [class*="mount"] { visibility: hidden !important; opacity: 0 !important; }',
            '[data-turbo-permanent], [data-turbo-body], [data-turbo-nav], .js-header-wrapper, .application-main, #js-repo-pjax-container, #js-pjax-container, [data-hpc] { visibility: hidden !important; opacity: 0 !important; }',
            'chat-app, .gemini-chat-app, [class*="chat-app"], [class*="gemini"], model-response, user-query { visibility: hidden !important; opacity: 0 !important; }',
            'cws-developer-console, cws-dashboard, [class*="cws-"], c-wiz { visibility: hidden !important; opacity: 0 !important; }'
        ];
        
        contentHidingStyleSheet = document.createElement('style');
        contentHidingStyleSheet.type = 'text/css';
        contentHidingStyleSheet.id = 'bfx-style-' + Math.random().toString(36).substring(2, 8);
        contentHidingStyleSheet.textContent = cssRules.join('\n');
        
        const target = document.head || document.documentElement;
        target.appendChild(contentHidingStyleSheet);
    }
    
    function showPageContent() {
        if (contentHidingStyleSheet && contentHidingStyleSheet.parentNode) {
            contentHidingStyleSheet.parentNode.removeChild(contentHidingStyleSheet);
            contentHidingStyleSheet = null;
        }
        
        document.documentElement.style.visibility = 'visible';
        document.documentElement.style.opacity = '1';
        
        if (document.body) {
            document.body.style.visibility = 'visible';
            document.body.style.opacity = '1';
            document.body.style.display = '';
            document.body.style.background = '';
        }
    }
    
    function handleUrlChange() {
        const currentUrl = window.location.href;
        
        if (currentUrl !== lastCheckedUrl) {
            lastCheckedUrl = currentUrl;
            setNavigationFlag();
            
            if (shouldProtectPage()) {
                if (!checkAuthentication()) {
                    createPasswordOverlay();
                    hidePageContent();
                } else {
                    showPageContent();
                    removePasswordOverlay();
                }
            } else {
                showPageContent();
                removePasswordOverlay();
            }
        }
    }
    
    function setupGitHubNavigation() {
        if (!window.location.hostname.toLowerCase().includes('github.com')) return;
        
        document.addEventListener('turbo:visit', () => {
            setTimeout(handleUrlChange, 10);
            setTimeout(handleUrlChange, 100);
            setTimeout(handleUrlChange, 300);
        });
        
        document.addEventListener('turbo:load', () => {
            setTimeout(handleUrlChange, 10);
            setTimeout(handleUrlChange, 100);
            setTimeout(handleUrlChange, 300);
        });
        
        document.addEventListener('turbo:render', () => {
            setTimeout(handleUrlChange, 10);
            setTimeout(handleUrlChange, 100);
        });
        
        if (githubMutationObserver) githubMutationObserver.disconnect();
        
        githubMutationObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (
                                node.matches('[data-turbo-permanent]') ||
                                node.matches('[data-turbo-body]') ||
                                node.matches('[data-turbo-nav]') ||
                                node.matches('.js-header-wrapper') ||
                                node.matches('.application-main') ||
                                node.matches('#js-repo-pjax-container') ||
                                node.matches('.js-navigation-item') ||
                                node.classList.contains('Layout')
                            )) shouldCheck = true;
                        }
                    });
                }
            });
            if (shouldCheck) {
                setTimeout(handleUrlChange, 10);
                setTimeout(handleUrlChange, 100);
            }
        });
        
        githubMutationObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-turbo-permanent', 'class'] });
        
        const originalReplaceState = history.replaceState;
        const originalPushState = history.pushState;
        
        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            setTimeout(handleUrlChange, 10);
            setTimeout(handleUrlChange, 100);
        };
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            setTimeout(handleUrlChange, 10);
            setTimeout(handleUrlChange, 100);
        };
        
        window.addEventListener('popstate', handleUrlChange);
        window.addEventListener('hashchange', handleUrlChange);
        
        let rafId;
        const checkUrlWithRAF = () => {
            if (window.location.href !== lastCheckedUrl) handleUrlChange();
            rafId = requestAnimationFrame(checkUrlWithRAF);
        };
        checkUrlWithRAF();
        window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
    }
    
    function setupFacebookNavigation() {
        if (!window.location.hostname.toLowerCase().includes('facebook.com')) return;
        
        const intervals = [100, 200, 500, 1000];
        intervals.forEach(interval => {
            setInterval(() => {
                if (window.location.href !== lastCheckedUrl) handleUrlChange();
            }, interval);
        });
        
        if (facebookMutationObserver) facebookMutationObserver.disconnect();
        
        facebookMutationObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (node.matches('[data-pagelet]') || node.matches('[role="main"]'))) {
                                shouldCheck = true;
                            }
                        }
                    });
                }
            });
            if (shouldCheck) {
                setTimeout(handleUrlChange, 10);
                setTimeout(handleUrlChange, 100);
            }
        });
        
        facebookMutationObserver.observe(document, { childList: true, subtree: true });
        
        const originalReplaceState = history.replaceState;
        const originalPushState = history.pushState;
        
        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            setTimeout(handleUrlChange, 50);
        };
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            setTimeout(handleUrlChange, 50);
        };
        
        window.addEventListener('popstate', handleUrlChange);
        window.addEventListener('hashchange', handleUrlChange);
    }

    function setupGeminiNavigation() {
        if (!window.location.hostname.toLowerCase().includes('gemini.google.com')) return;
        
        let rafId;
        const checkUrlWithRAF = () => {
            if (window.location.href !== lastCheckedUrl) handleUrlChange();
            rafId = requestAnimationFrame(checkUrlWithRAF);
        };
        checkUrlWithRAF();
        window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));

        if (geminiMutationObserver) geminiMutationObserver.disconnect();

        geminiMutationObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) shouldCheck = true;
            });
            if (shouldCheck) {
                setTimeout(handleUrlChange, 100);
            }
        });

        if (document.body) {
            geminiMutationObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    function setupChromeDevConsoleNavigation() {
        if (!window.location.hostname.toLowerCase().includes('chrome.google.com')) return;
        
        let rafId;
        const checkUrlWithRAF = () => {
            if (window.location.href !== lastCheckedUrl) handleUrlChange();
            rafId = requestAnimationFrame(checkUrlWithRAF);
        };
        checkUrlWithRAF();
        window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));

        if (chromeDevConsoleMutationObserver) chromeDevConsoleMutationObserver.disconnect();

        chromeDevConsoleMutationObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) shouldCheck = true;
            });
            if (shouldCheck) {
                setTimeout(handleUrlChange, 100);
            }
        });

        if (document.body) {
            chromeDevConsoleMutationObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
    
    function setupUrlMonitoring() {
        if (urlCheckInterval) clearInterval(urlCheckInterval);
        
        urlCheckInterval = setInterval(handleUrlChange, 200);
        window.addEventListener('popstate', handleUrlChange);
        
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            setTimeout(handleUrlChange, 50);
        };
        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            setTimeout(handleUrlChange, 50);
        };
        
        window.addEventListener('hashchange', handleUrlChange);
    }
    
    function handlePasswordProtection() {
        if (!shouldProtectPage()) {
            isAuthenticated = true;
            showPageContent();
            return true;
        }
        
        const isRefresh = isPageRefresh();
        
        if (isRefresh) {
            isAuthenticated = checkAuthentication();
            if (!isAuthenticated) {
                createPasswordOverlay(); 
                hidePageContent(); 
                return false;
            } else {
                showPageContent();
                removePasswordOverlay();
                return true;
            }
        } else {
            isAuthenticated = checkAuthentication();
        }
        
        if (isAuthenticated) {
            showPageContent();
            removePasswordOverlay();
            return true;
        } else {
            createPasswordOverlay(); 
            hidePageContent(); 
            return false;
        }
    }
    
    function initialize() {
        if (initializationComplete) return;
        initializationComplete = true;

        setupUrlMonitoring();
        setupFacebookNavigation();
        setupGitHubNavigation();
        setupGeminiNavigation(); 
        setupChromeDevConsoleNavigation(); 
        
        handlePasswordProtection();
        
        const antiTamperObserver = new MutationObserver(() => {
            if (!isAuthenticated && shouldProtectPage()) {
                if (!passwordOverlayHost || !document.contains(passwordOverlayHost)) {
                    passwordOverlayHost = null; 
                    createPasswordOverlay();
                }
                if (!contentHidingStyleSheet || !document.contains(contentHidingStyleSheet)) {
                    contentHidingStyleSheet = null; 
                    hidePageContent();
                }
            }
        });
        
        antiTamperObserver.observe(document.documentElement, { childList: true, subtree: true });
        
        const spaNavigationObserver = new MutationObserver(() => {
            setTimeout(handleUrlChange, 100);
        });
        
        if (document.body) {
            spaNavigationObserver.observe(document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['data-testid', 'class', 'data-pagelet', 'role', 'data-turbo-permanent']
            });
        }
    }
    
    function isSPASite() {
        const hostname = window.location.hostname.toLowerCase();
        return hostname.includes('reddit.com') || 
               hostname.includes('facebook.com') || 
               hostname.includes('fb.com') ||
               hostname.includes('github.com') ||
               hostname.includes('gemini.google.com') ||
               hostname.includes('chrome.google.com'); 
    }
    
    window.addEventListener('beforeunload', () => {
        if (urlCheckInterval) clearInterval(urlCheckInterval);
        if (facebookMutationObserver) facebookMutationObserver.disconnect();
        if (githubMutationObserver) githubMutationObserver.disconnect();
        if (geminiMutationObserver) geminiMutationObserver.disconnect();
        if (chromeDevConsoleMutationObserver) chromeDevConsoleMutationObserver.disconnect();
        
        removePasswordOverlay();
        if (contentHidingStyleSheet && contentHidingStyleSheet.parentNode) {
            contentHidingStyleSheet.parentNode.removeChild(contentHidingStyleSheet);
        }
    });
    
    if (shouldProtectPage()) {
        if (!checkAuthentication()) {
            document.documentElement.style.background = '#000';
            if (document.body) {
                document.body.style.background = '#000';
            }
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
        } else {
            setTimeout(initialize, 0);
        }
        
        window.addEventListener('load', () => {
            if (!initializationComplete) initialize();
        });
        
        setTimeout(() => {
            if (!initializationComplete) initialize();
        }, 100);
    }
    
    if (isSPASite()) {
        setTimeout(() => {
            if (!initializationComplete) initialize();
            setupUrlMonitoring();
            setupFacebookNavigation();
            setupGitHubNavigation();
            setupGeminiNavigation();
            setupChromeDevConsoleNavigation(); 
        }, 500);
    }
    
})();