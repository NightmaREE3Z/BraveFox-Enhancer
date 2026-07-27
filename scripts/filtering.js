// ==UserScript==
// @name         Content hiding and filtering
// @version      2026-07-27
// @description  Filter out stuff on the internet (Targeted Enforcer)
// @match        *://*/* 
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // === TARGET SITES FOR **FILTERING/HIDING** CONTENT ===
    // This extension/js file does NOT encourage or otherwise facilitate the use or access to adult content sites in under any circumstance. The only purpose of this function/file is to filter out certain types of content from XVideos for my own use case, such as AI-generated stuff. Furthermore, this extension is meant for PERSONAL USE ONLY. It is only set to "Unlisted" so I can install it from direct link when needed. I'd honestly prefer that it would not be shown in any type of searches at all, if that's doable. 
    const targetDomains = ['xvideos.com'];
    const currentHost = window.location.hostname.toLowerCase().replace(/\.$/, '');
    const isTargetDomain = targetDomains.some(domain =>
        currentHost === domain || currentHost.endsWith(`.${domain}`)
    );
    
    if (!isTargetDomain) {
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
    const VIDEO_RESULT_PENDING_RETRY_ATTR = 'data-bravefox-video-pending-retries';
    // Once a card is committed to an approved row, ordinary rescans and blocklist refreshes must
    // never make it disappear. This marker is cleared only when the card's canonical video URL changes.
    const VIDEO_RESULT_COMMITTED_ATTR = 'data-bravefox-video-batch-committed';
    const VIDEO_RESULT_MAX_PENDING_RETRIES = 18;
    const VIDEO_RESULT_PENDING_RETRY_MS = 80;
    const VIDEO_RESULT_CACHE_STORAGE_KEY = 'bravefox_xvideos_video_verdict_cache_v3';
    const VIDEO_RESULT_CACHE_MAX = 1600;

    // The desktop XVideos layout is five cards wide. Batches are counted by approved cards rather
    // than visual top coordinates, so hidden/blocked cards cannot split or reshuffle a row.
    const VIDEO_BATCH_CARDS_PER_ROW = 5;
    const VIDEO_BATCH_INITIAL_LISTING_CARDS = 8 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_INITIAL_WATCH_CARDS = 8 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_PREFERRED_CARDS = 8 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_SLOW_FALLBACK_CARDS = 4 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_PIPELINE_HALF_CARDS = 4 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_PIPELINE_MAX_FUTURE = 1;
    // The active reserve aims for forty approved cards but overbooks twenty extra candidates.
    // Blocked verdicts are therefore absorbed in the same network wave instead of forcing a
    // serial refill after every rejected card. The cache-only warm reserve stays at twenty.
    const VIDEO_BATCH_ACTIVE_OVERBOOK_CARDS = 4 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_LOOKAHEAD_CARDS = 4 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_MIN_ATOMIC_REVEAL_CARDS = 4 * VIDEO_BATCH_CARDS_PER_ROW;
    const VIDEO_BATCH_SLOW_THRESHOLD_MS = 3500;
    // The active hidden batch is Batch A; one cache-only lookahead window is Batch B. Batch B
    // starts after Batch A reaches halfway, while viewport urgency temporarily gives Batch A more
    // fetch slots and pauses queued lookahead work near the committed edge.
    const VIDEO_BATCH_FETCH_URGENCY_NORMAL = 'normal';
    const VIDEO_BATCH_FETCH_URGENCY_NEAR = 'near';
    const VIDEO_BATCH_FETCH_URGENCY_URGENT = 'urgent';
    const VIDEO_BATCH_URGENT_EDGE_PX = Math.max(
        120,
        Math.round((window.innerHeight || document.documentElement.clientHeight || 900) * 0.18)
    );
    const VIDEO_BATCH_SETTLE_MS = 110;
    const VIDEO_BATCH_FILL_WAIT_MS = 1400;
    const VIDEO_BATCH_GUARD_HARD_TIMEOUT_MS = 30000;
    // Start preparing/revealing roughly three viewports before the committed edge. Fast wheel
    // scrolling and scrollbar jumps can skip a single IntersectionObserver delivery, so a cheap
    // passive viewport watchdog backs the sentinel up without cancelling any user input.
    const VIDEO_BATCH_SENTINEL_ROOT_MARGIN_PX = Math.max(
        2200,
        Math.round((window.innerHeight || document.documentElement.clientHeight || 900) * 3)
    );
    const VIDEO_BATCH_VIEWPORT_POLL_MS = 220;
    const VIDEO_BATCH_COMMIT_RETRY_MS = 80;
    // Profile/channel/model video tabs often mount fewer than forty cards per page, even when the
    // account owns thousands of videos. Wait for a brief DOM-quiet window, then treat the mounted
    // grid as a finite page and reveal every approved result atomically.
    const VIDEO_PROFILE_TAB_HYDRATION_GRACE_MS = 1600;
    const VIDEO_PROFILE_TAB_DOM_QUIET_MS = 550;
    const VIDEO_PROFILE_TAB_EMPTY_WATCH_MS = 10000;
    const VIDEO_RESULT_SETTLED_STATES = new Set(['clean', 'blocked']);

    // Approved cards far outside the viewport keep their place in the feed but stop costing
    // continuous preview/media work. IntersectionObserver handles this without scroll listeners.
    const VIDEO_CARD_MEDIA_FROZEN_ATTR = 'data-bravefox-video-media-frozen';
    const VIDEO_CARD_MEDIA_ROOT_MARGIN_PX = Math.max(1800, Math.round(
        (window.innerHeight || document.documentElement.clientHeight || 900) * 2
    ));

    // Uncached cards are checked against both persistent on-card metadata and the linked video page.
    // The queue is deduplicated and bounded so each canonical URL is fetched only once per verdict revision.
    const VIDEO_PAGE_FETCH_CONCURRENCY_NORMAL = 4;
    const VIDEO_PAGE_FETCH_CONCURRENCY_NEAR = 6;
    const VIDEO_PAGE_FETCH_CONCURRENCY_URGENT = 8;
    const VIDEO_PAGE_FETCH_TIMEOUT_MS = 5000;
    const VIDEO_PAGE_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const VIDEO_PAGE_METADATA_FAILURE_CACHE_TTL_MS = 30 * 60 * 1000;
    const VIDEO_PAGE_METADATA_CACHE_MAX = 800;
    const videoPageMetadataCache = new Map();
    const videoPageMetadataPending = new Map();
    const videoPageFetchQueue = [];
    const videoPageFetchJobsByUrl = new Map();
    const videoPageAbortControllers = new Set();
    let activeVideoPageFetches = 0;
    let videoPageFetchSequence = 0;
    let videoBatchFetchUrgency = VIDEO_BATCH_FETCH_URGENCY_NORMAL;
    let videoFilterRevision = 1;

    // Verdicts survive DOM-node replacement and SPA navigation. The cache is keyed by canonical
    // video URL and the stable title/uploader/model fingerprint, never by a temporary hover node.
    const videoVerdictCache = new Map();
    const routeCommittedVideoUrls = new Set();
    let videoVerdictCachePersistTimer = null;

    // Cards are prepared invisibly, then committed by approved-card batches. Batch A is the active
    // hidden reveal batch; Batch B is one cache-only lookahead window that starts at A's halfway
    // point. Adaptive fetch priority keeps the pipeline warm without sacrificing edge responsiveness.
    const queuedVideoResultCards = new Set();
    let activeVideoBatchCards = null;
    let activeVideoBatchTargetCleanCount = 0;
    let activeVideoBatchReleaseInitialGuard = false;
    let activeVideoBatchLastCandidateAt = 0;
    let activeVideoBatchStartedAt = 0;
    let videoBatchPassTimer = null;
    let videoBatchProcessing = false;
    let videoLookaheadGeneration = 1;
    let videoLookaheadWindowSequence = 0;
    let videoLookaheadWindows = [];
    const videoLookaheadReservedUrls = new Set();
    let videoBatchInitialCommitted = false;
    let videoBatchRouteStartedAt = Date.now();
    let videoBatchLastCardDiscoveryAt = Date.now();
    let videoBatchViewportHooksInstalled = false;
    let initialVideoGuard = null;
    let initialVideoGuardHardTimer = null;
    let initialVideoGuardRouteUrl = '';
    let initialVideoGuardTimedOutRouteUrl = '';
    // After the opening commit, the last approved card acts as a passive infinite-scroll sentinel.
    // No wheel/key/touch event is cancelled and the script never fights the browser's scrollbar.
    // One future batch may be prepared in a bounded lookahead pipeline. This flag means only that the viewport
    // is close enough to the committed edge for a completed batch to become visible.
    let videoBatchNextBatchRequested = false;
    let videoBatchBottomObserver = null;
    let videoBatchObservedCard = null;
    let videoBatchBottomIntersecting = false;
    let videoBatchViewportCheckScheduled = false;
    let videoBatchViewportPollTimer = null;
    let videoBatchCommitScheduled = false;

    // The expected count changes only through an authorized batch commit. If XVideos later
    // recycles a committed node or late metadata upgrades one to blocked, a prepared reserve
    // card is promoted immediately so the visible grid cannot permanently shrink mid-row.
    let videoBatchExpectedCommittedCleanCount = 0;
    let videoBatchRowRepairScheduled = false;
    let videoBatchRowRepairInProgress = false;
    const deferredVideoTailCards = new Set();

    let videoCardMediaObserver = null;
    let videoCardMediaObservedCards = new WeakSet();
    const videoCardMediaFreezeQueue = new Set();
    let videoCardMediaFreezeHandle = null;

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

    // Main-menu buttons removed everywhere on XVideos, including menus mounted after navigation.
    const UNWANTED_XVIDEOS_MENU_BUTTON_SELECTOR = [
        'a.head__menu-line__main-menu__lvl1[href*="/channels-index"]',
        'a.head__menu-line__main-menu__lvl1[href*="/pornstars-index"]',
        'a.head__menu-line__main-menu__lvl1.red-ticket',
        'a.head__menu-line__main-menu__lvl1.live-cams',
        'a.head__menu-line__main-menu__lvl1.ignore-popunder',
        'a.head__menu-line__main-menu__lvl1.nutaku-games',
        'a.head__menu-line__main-menu__lvl1[href="/best"]',
        'a.head__menu-line__main-menu__lvl1[href="/best/"]',
        'a.head__menu-line__main-menu__lvl1[href^="https://www.xvideos.com/best"]',
        'a.head__menu-line__main-menu__lvl1[href*=".xvideos.com/best"]'
    ].join(', ');
    const XVVIDEOS_MAIN_CATEGORY_BUTTON_SELECTOR = 'button#site-main-cat.head__choice--main-cat';


    function isWatchPathForInitialGuard(pathname) {
        const path = String(pathname || '').toLowerCase();
        if (/^\/videos(?:\/|$)/i.test(path)) return false;
        return /^\/video(?:[._\/-]|[a-z0-9])/i.test(path);
    }

    function isFiniteProfileVideoTabRoute() {
        const path = String(window.location.pathname || '').toLowerCase();
        const hash = String(window.location.hash || '').toLowerCase();
        return /^\/(?:profiles|pornstars|channels|model-channels)(?:\/|$)/i.test(path) &&
            hash.includes('tabvideos');
    }

    function shouldUseFullInitialVideoGuard() {
        // Entity video tabs hydrate asynchronously and may expose only six, twenty, or another
        // finite number of cards. Keep the page chrome visible and gate the cards themselves.
        return !isWatchPathForInitialGuard(window.location.pathname) && !isFiniteProfileVideoTabRoute();
    }

    function hideInitialVideoGuard(reason) {
        if (initialVideoGuardHardTimer !== null) {
            clearTimeout(initialVideoGuardHardTimer);
            initialVideoGuardHardTimer = null;
        }
        if (initialVideoGuard && initialVideoGuard.isConnected) {
            initialVideoGuard.remove();
        }
        initialVideoGuard = null;
        try { document.documentElement.removeAttribute('data-bravefox-initial-video-guard'); } catch (e) {}
        if (reason) {
            try { console.debug('BraveFox: Initial video guard released:', reason); } catch (e) {}
        }
    }

    function showInitialVideoGuard(reason) {
        if (!shouldUseFullInitialVideoGuard()) {
            hideInitialVideoGuard('watch-page');
            return;
        }

        const routeUrl = window.location.href;

        // The guard is a once-per-real-route gate. Startup, pageshow, visibility restoration and
        // repeated filter passes must never resurrect it after the route has already committed.
        if (videoBatchInitialCommitted && initialVideoGuardRouteUrl === routeUrl) return;
        if (initialVideoGuardTimedOutRouteUrl === routeUrl) return;
        if (initialVideoGuardRouteUrl === routeUrl && initialVideoGuard && initialVideoGuard.isConnected) return;

        initialVideoGuardRouteUrl = routeUrl;
        if (!initialVideoGuard || !initialVideoGuard.isConnected) {
            initialVideoGuard = document.createElement('div');
            initialVideoGuard.id = 'bravefox-initial-video-guard';
            initialVideoGuard.setAttribute('aria-hidden', 'true');
            initialVideoGuard.style.cssText = [
                'position:fixed', 'inset:0', 'background:#fff', 'z-index:2147483647',
                'pointer-events:all', 'transition:none', 'animation:none'
            ].join(';');
            document.documentElement.appendChild(initialVideoGuard);
        }

        try { document.documentElement.setAttribute('data-bravefox-initial-video-guard', 'true'); } catch (e) {}
        if (initialVideoGuardHardTimer !== null) clearTimeout(initialVideoGuardHardTimer);
        initialVideoGuardHardTimer = setTimeout(() => {
            // Release only the full-page guard after an extreme timeout. Pending cards remain
            // display:none and are still classified as the opening forty-card approved batch.
            initialVideoGuardTimedOutRouteUrl = routeUrl;
            hideInitialVideoGuard('hard-timeout');
            scheduleVideoBatchPass(0);
        }, VIDEO_BATCH_GUARD_HARD_TIMEOUT_MS);

        if (reason) {
            try { console.debug('BraveFox: Initial video guard armed:', reason); } catch (e) {}
        }
    }

    // Arm before the site can paint its first listing grid. Watch pages keep only unapproved
    // recommendation cards absent, so the player and page chrome are never covered.
    showInitialVideoGuard('startup');

    function getLastCommittedVideoCard() {
        let lastCard = null;
        try {
            document.querySelectorAll(
                `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"][${VIDEO_RESULT_COMMITTED_ATTR}="true"]`
            ).forEach(card => {
                if (card && card.isConnected) lastCard = card;
            });
        } catch (e) {}
        return lastCard;
    }

    function isLastCommittedCardNearViewport() {
        const card = getLastCommittedVideoCard();
        if (!card) return false;
        try {
            const rect = card.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
            return rect.top <= viewportHeight + VIDEO_BATCH_SENTINEL_ROOT_MARGIN_PX && rect.bottom >= -80;
        } catch (e) {
            return false;
        }
    }

    function isDocumentNearCommittedEdge() {
        try {
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
            const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const documentHeight = Math.max(
                document.documentElement ? document.documentElement.scrollHeight : 0,
                document.body ? document.body.scrollHeight : 0
            );
            const distanceToBottom = Math.max(0, documentHeight - (scrollTop + viewportHeight));
            if (distanceToBottom <= VIDEO_BATCH_SENTINEL_ROOT_MARGIN_PX) return true;
        } catch (e) {}
        return isLastCommittedCardNearViewport();
    }


    function getDistanceToCommittedEdge() {
        try {
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
            const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const documentHeight = Math.max(
                document.documentElement ? document.documentElement.scrollHeight : 0,
                document.body ? document.body.scrollHeight : 0
            );
            return Math.max(0, documentHeight - (scrollTop + viewportHeight));
        } catch (e) {
            return Number.POSITIVE_INFINITY;
        }
    }

    function isDocumentAtCommittedEdge() {
        return getDistanceToCommittedEdge() <= VIDEO_BATCH_URGENT_EDGE_PX;
    }

    function getVideoFetchConcurrencyLimit() {
        if (videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_URGENT) {
            return VIDEO_PAGE_FETCH_CONCURRENCY_URGENT;
        }
        if (videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_NEAR) {
            return VIDEO_PAGE_FETCH_CONCURRENCY_NEAR;
        }
        return VIDEO_PAGE_FETCH_CONCURRENCY_NORMAL;
    }

    function reprioritizeActiveVideoFetchJobs() {
        const activeUrls = getActiveVideoBatchUrlSet();
        if (activeUrls.size === 0) return;
        activeUrls.forEach(url => {
            const job = videoPageFetchJobsByUrl.get(url);
            if (!job) return;
            job.source = 'active';
            job.priority = videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_URGENT ? 0 : 1;
        });
    }

    function updateVideoBatchFetchUrgency(reason) {
        let nextUrgency = VIDEO_BATCH_FETCH_URGENCY_NORMAL;
        if (videoBatchInitialCommitted && (activeVideoBatchCards || queuedVideoResultCards.size > 0)) {
            const distance = getDistanceToCommittedEdge();
            if (distance <= VIDEO_BATCH_URGENT_EDGE_PX) {
                nextUrgency = VIDEO_BATCH_FETCH_URGENCY_URGENT;
            } else if (distance <= VIDEO_BATCH_SENTINEL_ROOT_MARGIN_PX) {
                nextUrgency = VIDEO_BATCH_FETCH_URGENCY_NEAR;
            }
        }

        if (nextUrgency !== videoBatchFetchUrgency) {
            videoBatchFetchUrgency = nextUrgency;
            reprioritizeActiveVideoFetchJobs();
            if (reason) {
                try { console.debug('BraveFox: Video fetch urgency:', nextUrgency, reason); } catch (e) {}
            }
        }
        pumpVideoPageFetchQueue();
    }

    function scheduleVideoBatchViewportCheck(reason) {
        if (videoBatchViewportCheckScheduled) return;
        videoBatchViewportCheckScheduled = true;

        const run = () => {
            videoBatchViewportCheckScheduled = false;
            updateVideoBatchFetchUrgency(reason || 'viewport-watchdog');
            if (!videoBatchInitialCommitted) return;
            if (isDocumentNearCommittedEdge()) requestNextVideoBatch(reason || 'viewport-watchdog');
        };

        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function ensureVideoBatchViewportPoll() {
        if (videoBatchViewportPollTimer !== null) return;
        videoBatchViewportPollTimer = setInterval(() => {
            updateVideoBatchFetchUrgency('bottom-watchdog');
            if (!videoBatchInitialCommitted) return;
            if (!activeVideoBatchCards && queuedVideoResultCards.size === 0) return;
            if (isDocumentNearCommittedEdge()) requestNextVideoBatch('bottom-watchdog');
        }, VIDEO_BATCH_VIEWPORT_POLL_MS);
    }

    function refreshVideoBatchBottomObserver() {
        if (videoBatchBottomObserver && videoBatchObservedCard) {
            try { videoBatchBottomObserver.unobserve(videoBatchObservedCard); } catch (e) {}
        }

        videoBatchObservedCard = getLastCommittedVideoCard();
        videoBatchBottomIntersecting = false;
        if (videoBatchBottomObserver && videoBatchObservedCard) {
            try { videoBatchBottomObserver.observe(videoBatchObservedCard); } catch (e) {}
        }

        // An observer attached after a very fast scrollbar jump may not report until the next frame.
        // Check the same edge synchronously on the following frame as a deterministic fallback.
        scheduleVideoBatchViewportCheck('observer-refresh');
    }

    function disconnectVideoBatchBottomObserver() {
        if (videoBatchBottomObserver) {
            try { videoBatchBottomObserver.disconnect(); } catch (e) {}
        }
        videoBatchObservedCard = null;
        videoBatchBottomIntersecting = false;
        videoBatchViewportCheckScheduled = false;
    }

    function cancelVideoCardMediaFreezeWork() {
        if (videoCardMediaFreezeHandle === null) return;
        try {
            if (typeof cancelIdleCallback === 'function') cancelIdleCallback(videoCardMediaFreezeHandle);
        } catch (e) {}
        try { clearTimeout(videoCardMediaFreezeHandle); } catch (e) {}
        videoCardMediaFreezeHandle = null;
    }

    function freezeVideoCardMedia(card) {
        if (!card || !card.isConnected) return;
        if (card.getAttribute(VIDEO_RESULT_STATE_ATTR) !== 'clean' ||
            card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) !== 'true') return;

        card.setAttribute(VIDEO_CARD_MEDIA_FROZEN_ATTR, 'true');

        // XVideos injects hover-preview <video> nodes into cards. Strip their media sources while
        // preserving the thumbnail/title/link. When a separate <img> thumbnail exists, discard the
        // preview node completely; otherwise keep its poster-capable shell so the card never blanks.
        const hasStaticThumbnail = !!card.querySelector('img');
        card.querySelectorAll('video').forEach(video => {
            try { video.pause(); } catch (e) {}
            try { video.removeAttribute('autoplay'); } catch (e) {}
            try { video.preload = 'none'; } catch (e) {}
            try { video.querySelectorAll('source').forEach(source => source.removeAttribute('src')); } catch (e) {}
            try { video.removeAttribute('src'); } catch (e) {}
            try { video.load(); } catch (e) {}
            if (hasStaticThumbnail) {
                try { video.remove(); } catch (e) {}
            }
        });
    }

    function thawVideoCardMedia(card) {
        if (!card || !card.removeAttribute) return;
        videoCardMediaFreezeQueue.delete(card);
        card.removeAttribute(VIDEO_CARD_MEDIA_FROZEN_ATTR);
    }

    function flushVideoCardMediaFreezeQueue(deadline) {
        videoCardMediaFreezeHandle = null;
        let processed = 0;

        for (const card of Array.from(videoCardMediaFreezeQueue)) {
            videoCardMediaFreezeQueue.delete(card);
            freezeVideoCardMedia(card);
            processed++;

            const outOfIdleTime = deadline && typeof deadline.timeRemaining === 'function' &&
                deadline.timeRemaining() < 2 && !deadline.didTimeout;
            if (processed >= 16 || outOfIdleTime) break;
        }

        if (videoCardMediaFreezeQueue.size > 0) scheduleVideoCardMediaFreezeWork();
    }

    function scheduleVideoCardMediaFreezeWork() {
        if (videoCardMediaFreezeHandle !== null || videoCardMediaFreezeQueue.size === 0) return;

        if (typeof requestIdleCallback === 'function') {
            videoCardMediaFreezeHandle = requestIdleCallback(flushVideoCardMediaFreezeQueue, { timeout: 600 });
        } else {
            videoCardMediaFreezeHandle = setTimeout(() => flushVideoCardMediaFreezeQueue(null), 80);
        }
    }

    function ensureVideoCardMediaObserver() {
        if (videoCardMediaObserver || typeof IntersectionObserver !== 'function') return;

        videoCardMediaObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const card = entry && entry.target;
                if (!card || !card.isConnected) {
                    try { if (card) videoCardMediaObserver.unobserve(card); } catch (e) {}
                    return;
                }

                if (entry.isIntersecting) {
                    thawVideoCardMedia(card);
                } else {
                    videoCardMediaFreezeQueue.add(card);
                }
            });
            scheduleVideoCardMediaFreezeWork();
        }, {
            root: null,
            rootMargin: `${VIDEO_CARD_MEDIA_ROOT_MARGIN_PX}px 0px ${VIDEO_CARD_MEDIA_ROOT_MARGIN_PX}px 0px`,
            threshold: 0
        });
    }

    function observeVideoCardMedia(card) {
        if (!card || !card.isConnected || videoCardMediaObservedCards.has(card)) return;
        ensureVideoCardMediaObserver();
        if (!videoCardMediaObserver) return;
        try {
            videoCardMediaObserver.observe(card);
            videoCardMediaObservedCards.add(card);
        } catch (e) {}
    }

    function unobserveVideoCardMedia(card) {
        if (!card) return;
        videoCardMediaFreezeQueue.delete(card);
        thawVideoCardMedia(card);
        videoCardMediaObservedCards.delete(card);
        if (videoCardMediaObserver) {
            try { videoCardMediaObserver.unobserve(card); } catch (e) {}
        }
    }

    function disconnectVideoCardMediaObserver() {
        cancelVideoCardMediaFreezeWork();
        videoCardMediaFreezeQueue.clear();
        if (videoCardMediaObserver) {
            try { videoCardMediaObserver.disconnect(); } catch (e) {}
        }
        videoCardMediaObserver = null;
        videoCardMediaObservedCards = new WeakSet();
    }

    function requestNextVideoBatch(reason) {
        if (!videoBatchInitialCommitted || videoBatchNextBatchRequested) return;

        // Preparation already runs in the background. Reaching the sentinel only authorizes an
        // atomic reveal: 40 cards when ready, or 20 after the slow-network threshold.
        videoBatchNextBatchRequested = true;
        updateVideoBatchFetchUrgency(reason || 'batch-requested');
        reprioritizeActiveVideoFetchJobs();
        scheduleVideoBatchPass(0);

        if (reason) {
            try { console.debug('BraveFox: Authorized staged video batch reveal:', reason); } catch (e) {}
        }
    }


    // `/tags` has its own plain anchor-list layout. Keep every candidate hidden until it has
    // been checked so banned labels, titles, language names, and URL slugs never flash onscreen.
    const TAGS_PAGE_HTML_CLASS = 'bravefox-tags-page-filtering-active';
    const TAGS_PAGE_LINK_SELECTOR = 'a[href^="/tags/"], a[href^="/lang/"]';
    const TAGS_PAGE_STATE_ATTR = 'data-bravefox-tags-page-filter-state';
    const TAGS_PAGE_SIGNATURE_ATTR = 'data-bravefox-tags-page-filter-signature';
    const TAGS_PAGE_ENTRY_STATE_ATTR = 'data-bravefox-tags-page-entry-state';

    function isTagsIndexPage() {
        return /^\/tags\/?$/i.test(String(window.location.pathname || ''));
    }

    function syncTagsPageNoGlimpseState() {
        try {
            document.documentElement.classList.toggle(TAGS_PAGE_HTML_CLASS, isTagsIndexPage());
        } catch (e) {}
    }

    syncTagsPageNoGlimpseState();

    function injectNoGlimpseCSS() {
        try {
            if (document.getElementById('bravefox-filtering-no-glimpse')) return;

            document.documentElement.classList.add('bravefox-filtering-active');

            const style = document.createElement('style');
            style.id = 'bravefox-filtering-no-glimpse';
            style.textContent = `
                /* Stealth queue: uncommitted cards contribute no pixels and no page height.
                   The document naturally ends after the final approved row; a passive sentinel
                   stages the next preferred eight rows and commits them atomically. */
                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR} {
                    transition: none !important;
                    animation: none !important;
                }

                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}:not([${VIDEO_RESULT_STATE_ATTR}="clean"]):not([${VIDEO_RESULT_STATE_ATTR}="blocked"]):not([${VIDEO_RESULT_COMMITTED_ATTR}="true"]) {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transition: none !important;
                    animation: none !important;
                }

                /* Keep pagination/footer out of reach while hidden card batches remain. */
                html[data-bravefox-video-batch-pending="true"] footer,
                html[data-bravefox-video-batch-pending="true"] #footer,
                html[data-bravefox-video-batch-pending="true"] .footer,
                html[data-bravefox-video-batch-pending="true"] .pagination,
                html[data-bravefox-video-batch-pending="true"] [class*="pagination"],
                html[data-bravefox-video-batch-pending="true"] [id*="pagination"] {
                    display: none !important;
                }

                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="blocked"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transition: none !important;
                    animation: none !important;
                }

                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"] {
                    visibility: visible !important;
                    opacity: 1 !important;
                    background: transparent !important;
                    transition: none !important;
                    animation: none !important;
                }

                /* Let Chromium skip layout/paint work for settled cards that are far off-screen.
                   The auto size remembers the real card height after first paint, keeping the scrollbar stable. */
                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"][${VIDEO_RESULT_COMMITTED_ATTR}="true"][${VIDEO_CARD_MEDIA_FROZEN_ATTR}="true"] {
                    content-visibility: auto;
                    contain-intrinsic-size: auto 260px;
                }

                html.bravefox-filtering-active ${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_CARD_MEDIA_FROZEN_ATTR}="true"] * {
                    animation-play-state: paused !important;
                }

                html.${TAGS_PAGE_HTML_CLASS} a[href^="/tags/"]:not([${TAGS_PAGE_STATE_ATTR}="clean"]),
                html.${TAGS_PAGE_HTML_CLASS} a[href^="/lang/"]:not([${TAGS_PAGE_STATE_ATTR}="clean"]),
                html.${TAGS_PAGE_HTML_CLASS} a[href^="/tags/"][${TAGS_PAGE_STATE_ATTR}="blocked"],
                html.${TAGS_PAGE_HTML_CLASS} a[href^="/lang/"][${TAGS_PAGE_STATE_ATTR}="blocked"],
                html.${TAGS_PAGE_HTML_CLASS} [${TAGS_PAGE_ENTRY_STATE_ATTR}="blocked"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transition: none !important;
                    animation: none !important;
                }

                ${XVVIDEOS_MAIN_CATEGORY_BUTTON_SELECTOR},
                [data-bravefox-static-main-cat="true"] {
                    pointer-events: none !important;
                    cursor: default !important;
                    transition: none !important;
                    animation: none !important;
                }

                ${VIDEO_OVERLAY_LINK_SELECTOR},
                ${UNWANTED_XVIDEOS_MENU_BUTTON_SELECTOR},
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
    let spaRootObserver = null;
    let spaRoutePollInterval = null;
    let spaBroadMutationTimer = null;
    let spaRouteGeneration = 0;
    let spaRuntimeStarted = false;
    const spaFollowUpTimers = new Set();

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
            spaRootObserver = null;
            spaRuntimeStarted = false;

            if (spaRoutePollInterval !== null) {
                clearInterval(spaRoutePollInterval);
                spaRoutePollInterval = null;
            }
            if (spaBroadMutationTimer !== null) {
                clearTimeout(spaBroadMutationTimer);
                spaBroadMutationTimer = null;
            }
            spaFollowUpTimers.forEach(timerId => clearTimeout(timerId));
            spaFollowUpTimers.clear();

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

            if (videoBatchPassTimer !== null) {
                clearTimeout(videoBatchPassTimer);
                videoBatchPassTimer = null;
            }
            if (videoVerdictCachePersistTimer !== null) {
                clearTimeout(videoVerdictCachePersistTimer);
                videoVerdictCachePersistTimer = null;
            }
            hideInitialVideoGuard('cleanup');
            disconnectVideoBatchBottomObserver();
            disconnectVideoCardMediaObserver();
            resetVideoLookaheadPipeline('cleanup');

            if (typeof removeStorageChangeListener === 'function') {
                try { removeStorageChangeListener(); } catch (e) {}
                removeStorageChangeListener = null;
            }

            if (videoBatchViewportPollTimer !== null) {
                clearInterval(videoBatchViewportPollTimer);
                videoBatchViewportPollTimer = null;
            }

            console.log("WebCleaner cleanup completed");
        } finally {
            isCleaningUp = false;
        }
    }

    // Page cleanup events. A page placed in the back-forward cache must stay alive;
    // tearing down its observers on a persisted pagehide is what makes restored SPA pages stale.
    window.addEventListener('pagehide', event => {
        if (!event.persisted) cleanup();
    });

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
	/Del[\s_-]+Rey/i, /McMahon/i, /CJ[\s_-]+Perry/i, /Stratton/i, /Ruca/i, /Lola[\s_-]+Vice/i, /shirakawa/i, /Belts[\s_-]+Mone/i, /gay/i, /pride/i,
	/Amanda[\s_-]+Huber/i, /Joanie[\s_-]+Laurer/i, /AEW/i, /TNA/i, /WWE/i, /NJPW/i, /LGBT/i, /Trans/i, /playboy/i, /anorexic/i, /Arab/i, /Sol/i, 
        /deviant[\s_-]*art/i, /r[\s_-]*34/i, /Stee/i, /Sweee/i, /Waaa/i, /Transsexual/i, /Femdom/i, /Animat/i, /AI Porn/i, /AI Nude/i, /AI Pussy/i,
	/AI Anal/i, /AI Sex/i, /guy-guy/i, /homo/i, /grandpa/i, /grandma/i, /aunty/i, /piss/i, /pee/i, /crap/i, /shit/i, /fece/i, /Cuckold/i, /Bikini/i, 
	/Lingerie/i, /Hentai/i, /Animation/i, /Artific/i, /Intel/i, /male-/i, /africa/i, /japan/i, /china/i, /chine/i, /twerk/i, /strip/i, /whori/i, 
	/muscular/i, /-male/i, /male-/i, /shemale/i, /-red/i, /red-/i, /shemale/i, /old-young/i, /young-old/i, /old-vs-young/i, /Nude AI/i, /nudi AI/i, 
	/undre AI/i, /Nud3/i, /Nud1/i, /Naked AI/i, /-AI/i, /AI-/i, /-AI-/i, /AI App/i, /-App/i, /App-/i, /Appli/i, /software/i, /-IA/i, /IA-/i, /-IA-/i,

        // Symbols and standalone abbreviations
	/\*/i, /#/i, /(^|[^a-z0-9])AI([^a-z0-9]|$)/i, 

	// Boundaried Regex blocklist
        /\bMLM\b/i, /\bLLM\b/i, /\bAI\b/i, /\bAsia\b/i, /\bAsian\b/i, /\bMale\b/i, /\bRed\b/i, /\bOld\b/i, /\bIA\b/i,
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
            removeUnwantedXVideosMenuButtons();
            removeExternalVideoOverlayLinks();
            filterSearchAutocompleteEntries();
            filterVideoResultCards();
            checkAndRedirectUrlBlockedContent();
            checkAndRedirectVideoPageBlockedContent();
            removeBlockedCategoryEntries();
            filterTagsPageLinks();
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
        resetVideoLookaheadPipeline('blocklist-revision');
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

    // Remove category/menu/tag entries whose label or URL contains a banned term.
    // This scanner is intentionally site-wide: XVideos uses different category markup on the
    // homepage, search pages, watch pages, profile pages, and dynamically replaced menus.
    const CATEGORY_SIGNATURE_ATTR = 'data-bravefox-category-filter-signature';
    const CATEGORY_LINK_SELECTOR = [
        // Dynamic category menu entries such as: <li class="dyn"><a href="/gay?fmc=1">…</a></li>
        'li.dyn > a[href]',
        'li.dyn a[href]',
        'li.dyntop-cat a[href]',
        '.dyntop-cat a[href]',
        // Orientation/category switches and one-click category/tag pills.
        'li > a.btn.cat[href]',
        'a.btn.cat[href]',
        'a.btn.is-keyword[href]',
        'a[data-category][href]',
        '[data-category] a[href]',
        // Category and tag lists used outside the homepage.
        '.video-tags-list a[href]',
        '.ordered-label-list a[href]',
        '.video-metadata a.btn[href]',
        'li[class*="top-cat"] a[href]',
        'li[class*="category"] a[href]',
        'li[class*="categories"] a[href]',
        '[class*="category-list"] a[href]',
        '[class*="categories-list"] a[href]',
        '[id*="category"] a[href]',
        '[id*="categories"] a[href]',
        // Site-wide navigation wrappers can lose their category-specific classes on subpages.
        '.head__menu-line__main-menu a[href]',
        'nav a[href]',
        'header a[href]',
        '[role="navigation"] a[href]',
        // Known category route families and the site's top-level `fmc` category links.
        'a[href^="/c/"]',
        'a[href*="/c/"]',
        'a[href^="/category/"]',
        'a[href^="/categories/"]',
        'a[href^="/switch-sexual-orientation/"]',
        'a[href*="/switch-sexual-orientation/"]',
        'a[href*="?fmc="]',
        'a[href*="&fmc="]'
    ].join(', ');

    const CATEGORY_CONTEXT_SELECTOR = [
        'li.dyn',
        'li.dyntop-cat',
        '.dyntop-cat',
        'li[class*="top-cat"]',
        'li[class*="category"]',
        'li[class*="categories"]',
        '[class*="category-list"]',
        '[class*="categories-list"]',
        '[id*="category"]',
        '[id*="categories"]',
        '[data-category]',
        '.video-tags-list',
        '.ordered-label-list',
        '.video-metadata',
        '.head__menu-line__main-menu',
        'nav',
        'header',
        '[role="navigation"]'
    ].join(', ');

    function isCategoryIndexPage() {
        const path = String(window.location.pathname || '').toLowerCase();
        return /^\/(?:categories?|porn-categories)(?:\/|$)/i.test(path);
    }

    function isCategoryMenuLink(link) {
        if (!link || !link.getAttribute) return false;

        const rawHref = link.getAttribute('href') || '';
        if (!rawHref || /^(?:javascript:|mailto:|tel:|#)/i.test(rawHref.trim())) return false;

        let parsed;
        try {
            parsed = new URL(rawHref, window.location.origin);
        } catch (e) {
            return false;
        }

        // Category filtering is strictly limited to XVideos itself, while still allowing links
        // between its normal subdomains. External ads and sponsor buttons use separate rules.
        const parsedHost = parsed.hostname.toLowerCase().replace(/\.$/, '');
        const isXVideosLink = targetDomains.some(domain =>
            parsedHost === domain || parsedHost.endsWith(`.${domain}`)
        );
        if (!isXVideosLink) return false;

        const pathname = parsed.pathname || '';
        const lowerPath = pathname.toLowerCase();

        // Never classify actual videos, profiles, channels, or model pages as category entries.
        if (isVideoWatchPath(pathname)) return false;
        if (/^\/(?:profiles|channels|model-channels)(?:\/|$)/i.test(lowerPath)) return false;

        if (/^\/(?:c|category|categories)(?:\/|$)/i.test(lowerPath)) return true;
        if (/^\/switch-sexual-orientation(?:\/|$)/i.test(lowerPath)) return true;
        if (parsed.searchParams.has('fmc')) return true;

        if (link.matches && link.matches(
            'a.btn.cat[href], a.btn.is-keyword[href], a[data-category][href], ' +
            'a[class*="category"][href], a[class*="top-cat"][href]'
        )) return true;

        if (link.closest && link.closest(CATEGORY_CONTEXT_SELECTOR)) {
            // Header/navigation layouts frequently use plain one- or two-segment paths for
            // categories, with no category class on the anchor itself.
            const pathParts = lowerPath.split('/').filter(Boolean);
            if (pathParts.length <= 2) return true;
            if (link.closest('.video-tags-list, .ordered-label-list, .video-metadata')) return true;
            if (link.closest(
                'li.dyn, li.dyntop-cat, .dyntop-cat, li[class*="top-cat"], ' +
                'li[class*="category"], li[class*="categories"], ' +
                '[class*="category-list"], [class*="categories-list"], ' +
                '[id*="category"], [id*="categories"], [data-category]'
            )) return true;
        }

        // Category-index layouts sometimes use completely plain grid/list wrappers.
        return isCategoryIndexPage();
    }

    function getCategorySearchableValue(link) {
        const rawHref = link.getAttribute('href') || '';
        let decodedHref = rawHref;
        try { decodedHref = decodeURIComponent(rawHref.replace(/\+/g, ' ')); } catch (e) {}

        const values = [
            link.textContent || '',
            link.getAttribute('title') || '',
            link.getAttribute('aria-label') || '',
            decodedHref
        ];

        try {
            const parsed = new URL(rawHref, window.location.origin);
            values.push(parsed.pathname.replace(/[-_./]+/g, ' '));
            parsed.searchParams.forEach(value => values.push(value));
        } catch (e) {}

        return values.join(' ').replace(/\s+/g, ' ').trim();
    }

    function getCategoryEntryForRemoval(link) {
        if (!link || !link.closest) return link;

        return link.closest(
            'li.dyn, li.dyntop-cat, li[class*="top-cat"], li[class*="category"], ' +
            'li[class*="categories"], [data-category], [class*="category-item"], ' +
            '[class*="category-card"], [class*="category-tile"], .video-tags-list li, ' +
            '.ordered-label-list li, li'
        ) || link;
    }

    function removeBlockedCategoryEntries() {
        try {
            const categoryLinks = new Set(document.querySelectorAll(CATEGORY_LINK_SELECTOR));

            // Category-index layouts can use completely anonymous grid wrappers. Only there do
            // we broaden the scan to every anchor; other pages stay on the targeted selectors above.
            if (isCategoryIndexPage()) {
                document.querySelectorAll('a[href]').forEach(link => categoryLinks.add(link));
            }

            categoryLinks.forEach(link => {
                if (!link || !link.isConnected || !isCategoryMenuLink(link)) return;

                const searchableValue = getCategorySearchableValue(link);
                const signature = simpleTextHash(searchableValue);

                if (link.getAttribute(CATEGORY_SIGNATURE_ATTR) === signature) return;
                link.setAttribute(CATEGORY_SIGNATURE_ATTR, signature);

                if (!containsBlockedContent(searchableValue)) return;

                const categoryEntry = getCategoryEntryForRemoval(link);
                if (categoryEntry && categoryEntry.isConnected) {
                    categoryEntry.remove();
                    console.log(`Removed blocked category/menu entry: ${searchableValue}`);
                }
            });
        } catch (e) {
            console.log('Error removing blocked category entries: ' + e.message);
        }
    }


    // --- `/tags` PAGE NO-GLIMPSE FILTERING ---
    // This stays deliberately restricted to the exact `/tags` index. Other pages can use
    // `/tags/...` links as ordinary metadata, and hiding those globally would be too aggressive.
    function getTagsPageLinkSearchableValue(link) {
        const rawHref = link.getAttribute('href') || '';
        let decodedHref = rawHref;
        try { decodedHref = decodeURIComponent(rawHref.replace(/\+/g, ' ')); } catch (e) {}

        const values = [
            link.textContent || '',
            link.getAttribute('title') || '',
            link.getAttribute('aria-label') || '',
            decodedHref
        ];

        try {
            const parsed = new URL(rawHref, window.location.origin);
            values.push(parsed.pathname.replace(/[-_./]+/g, ' '));
            parsed.searchParams.forEach(value => values.push(value));
        } catch (e) {}

        return values.join(' ').replace(/\s+/g, ' ').trim();
    }

    function getTagsPageEntry(link) {
        if (!link || !link.closest) return link;

        // Hide a small, self-contained wrapper when one exists so blocked anchors do not leave
        // empty list/grid spacing. Only claim a wrapper that owns one candidate link; otherwise a
        // clean sibling could accidentally reveal a blocked entry sharing the same container.
        const entry = link.closest('li, [class*="tag-item"], [class*="tag-entry"], [class*="language-item"]');
        if (!entry || !entry.querySelectorAll) return link;
        return entry.querySelectorAll(TAGS_PAGE_LINK_SELECTOR).length === 1 ? entry : link;
    }

    function setTagsPageLinkState(link, state) {
        link.setAttribute(TAGS_PAGE_STATE_ATTR, state);

        const entry = getTagsPageEntry(link);
        if (state === 'blocked') {
            link.setAttribute('aria-hidden', 'true');
            if (entry && entry !== link) entry.setAttribute(TAGS_PAGE_ENTRY_STATE_ATTR, 'blocked');
        } else {
            link.removeAttribute('aria-hidden');
            if (entry && entry !== link) entry.removeAttribute(TAGS_PAGE_ENTRY_STATE_ATTR);
        }
    }

    function filterTagsPageLinks() {
        try {
            syncTagsPageNoGlimpseState();
            if (!isTagsIndexPage()) return;

            document.querySelectorAll(TAGS_PAGE_LINK_SELECTOR).forEach(link => {
                if (!link || !link.isConnected) return;

                const searchableValue = getTagsPageLinkSearchableValue(link);
                // Include the current filter revision so a freshly imported dynamic wrestler list
                // rechecks links whose visible text and href have not changed.
                const signature = simpleTextHash(`${videoFilterRevision}
${searchableValue}`);
                const oldSignature = link.getAttribute(TAGS_PAGE_SIGNATURE_ATTR) || '';
                const oldState = link.getAttribute(TAGS_PAGE_STATE_ATTR) || '';

                if (oldSignature === signature && (oldState === 'clean' || oldState === 'blocked')) return;

                link.setAttribute(TAGS_PAGE_SIGNATURE_ATTR, signature);
                const isBlocked = containsBlockedContent(searchableValue);
                setTagsPageLinkState(link, isBlocked ? 'blocked' : 'clean');

                if (isBlocked && oldState !== 'blocked') {
                    console.log(`No-glimpse blocked /tags entry: ${searchableValue}`);
                }
            });
        } catch (e) {
            console.log('Error filtering /tags page entries: ' + e.message);
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

    function getVideoVerdictRevisionKey() {
        try {
            const staticSignature = blockedRegexWords.map(regex => String(regex)).join('\n');
            return simpleTextHash(`${staticSignature}\n${dynamicWrestlerSignature || ''}`);
        } catch (e) {
            return String(videoFilterRevision);
        }
    }

    function loadVideoVerdictCache() {
        try {
            const raw = localStorage.getItem(VIDEO_RESULT_CACHE_STORAGE_KEY) ||
                sessionStorage.getItem(VIDEO_RESULT_CACHE_STORAGE_KEY);
            if (!raw) return;
            const records = JSON.parse(raw);
            if (!Array.isArray(records)) return;
            records.slice(-VIDEO_RESULT_CACHE_MAX).forEach(record => {
                if (!record || !record.url || !['clean', 'blocked'].includes(record.state)) return;
                videoVerdictCache.set(String(record.url), {
                    state: record.state,
                    hash: String(record.hash || ''),
                    revision: String(record.revision || ''),
                    title: String(record.title || ''),
                    timestamp: Number(record.timestamp || 0)
                });
            });
        } catch (e) {}
    }

    function persistVideoVerdictCacheSoon() {
        if (videoVerdictCachePersistTimer !== null) return;
        videoVerdictCachePersistTimer = setTimeout(() => {
            videoVerdictCachePersistTimer = null;
            try {
                const records = Array.from(videoVerdictCache.entries())
                    .slice(-VIDEO_RESULT_CACHE_MAX)
                    .map(([url, record]) => ({ url, ...record }));
                const serialized = JSON.stringify(records);
                localStorage.setItem(VIDEO_RESULT_CACHE_STORAGE_KEY, serialized);
                sessionStorage.setItem(VIDEO_RESULT_CACHE_STORAGE_KEY, serialized);
            } catch (e) {}
        }, 350);
    }

    function trimVideoVerdictCache() {
        while (videoVerdictCache.size > VIDEO_RESULT_CACHE_MAX) {
            const oldest = videoVerdictCache.keys().next().value;
            if (oldest === undefined) break;
            videoVerdictCache.delete(oldest);
        }
    }

    function rememberVideoVerdict(url, state, localHash, localText) {
        const normalized = normalizeVideoWatchUrl(url);
        if (!normalized || !['clean', 'blocked'].includes(state)) return;

        const revision = getVideoVerdictRevisionKey();
        const existing = videoVerdictCache.get(normalized);

        // Verdicts are monotonic for one canonical URL within one blocklist revision. A blocked URL
        // can never be downgraded by a later incomplete/hover-mutated card snapshot.
        const finalState = existing && existing.revision === revision && existing.state === 'blocked'
            ? 'blocked'
            : state;

        videoVerdictCache.delete(normalized);
        videoVerdictCache.set(normalized, {
            state: finalState,
            hash: String(localHash || existing?.hash || ''),
            revision,
            title: String(localText || existing?.title || '').slice(0, 500),
            timestamp: Date.now()
        });
        trimVideoVerdictCache();
        persistVideoVerdictCacheSoon();
    }

    function getCachedVideoVerdict(url, localHash, localText) {
        const normalized = normalizeVideoWatchUrl(url);
        if (!normalized) return null;
        const record = videoVerdictCache.get(normalized);
        if (!record || record.revision !== getVideoVerdictRevisionKey()) return null;

        // URL is the durable identity. Text/hash are supporting evidence only: hydration, localization,
        // counters and uploader markup routinely alter them without changing the underlying video.
        // A newly observed blocked term may still upgrade a previously clean verdict to blocked.
        if (localText && containsBlockedContent(localText) && record.state === 'clean') return null;
        return record;
    }

    loadVideoVerdictCache();

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

    function getVideoResultCardVideoUrl(card, preferredUrl) {
        if (!card || !card.querySelectorAll) return '';

        const normalizedPreferred = normalizeVideoWatchUrl(preferredUrl);
        const persistentCandidates = [];
        const fallbackCandidates = [];
        const persistentSeen = new Set();
        const fallbackSeen = new Set();

        const addCandidate = (collection, seen, rawValue, score, order) => {
            const normalized = normalizeVideoWatchUrl(rawValue);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            collection.push({ url: normalized, score, order });
        };

        let order = 0;

        // The title link is the card's durable identity on XVideos. Hover previews frequently
        // replace or supplement thumbnail anchors, but they do not normally replace this link.
        const persistentSelectors = [
            '.thumb-title a[href]',
            'a.thumb-title[href]',
            'a.video-title[href]',
            '[data-video-title] a[href]',
            'a[data-video-url][data-title]',
            'a[data-video-id][href]'
        ];

        persistentSelectors.forEach((selector, selectorIndex) => {
            card.querySelectorAll(selector).forEach(link => {
                if (link.closest && link.closest('.video-overlay-title, .videoad-title, .sheer-sponsor, [class*="preview"]')) return;
                const baseScore = 2000 - (selectorIndex * 100);
                ['href', 'data-href', 'data-url', 'data-video-url'].forEach((attribute, attributeIndex) => {
                    const rawValue = link.getAttribute(attribute) || '';
                    if (rawValue) addCandidate(persistentCandidates, persistentSeen, rawValue, baseScore - attributeIndex, order++);
                });
                try { addCandidate(persistentCandidates, persistentSeen, link.href, baseScore - 10, order++); } catch (e) {}
            });
        });

        if (persistentCandidates.length > 0) {
            // The highest-priority persistent title identity wins. Preview/hover candidates are
            // excluded above, so an obsolete secondary link cannot pin a genuinely recycled card
            // to its former URL forever.
            persistentCandidates.sort((a, b) => (b.score - a.score) || (a.order - b.order));
            return persistentCandidates[0].url;
        }

        // During a hover animation XVideos can temporarily detach the normal title/thumbnail
        // anchors. An already classified identity remains authoritative until a new persistent
        // title anchor appears; otherwise the card oscillates between preview URLs.
        const previousState = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
        if (normalizedPreferred && previousState) {
            return normalizedPreferred;
        }

        // Fallbacks are used only for a card that has never established an identity.
        ['data-href', 'data-url', 'data-video-url'].forEach(attribute => {
            if (card.hasAttribute && card.hasAttribute(attribute)) {
                addCandidate(fallbackCandidates, fallbackSeen, card.getAttribute(attribute), 800, order++);
            }
        });

        const fallbackSelectors = [
            '.thumb-inside > a[href]',
            '.thumb-inside a[href]',
            'a[href][data-video-url]',
            'a[href][data-id]'
        ];

        fallbackSelectors.forEach((selector, selectorIndex) => {
            card.querySelectorAll(selector).forEach(link => {
                if (link.matches && link.matches(VIDEO_OVERLAY_LINK_SELECTOR)) return;
                if (link.closest && link.closest(
                    '.video-overlay-title, .videoad-title, .sheer-sponsor, video, ' +
                    '[class*="preview"], [class*="hover"]'
                )) return;

                const baseScore = 600 - (selectorIndex * 100);
                ['href', 'data-href', 'data-url', 'data-video-url'].forEach((attribute, attributeIndex) => {
                    const rawValue = link.getAttribute(attribute) || '';
                    if (rawValue) addCandidate(fallbackCandidates, fallbackSeen, rawValue, baseScore - attributeIndex, order++);
                });
            });
        });

        if (fallbackCandidates.length === 0) return '';
        fallbackCandidates.sort((a, b) => (b.score - a.score) || (a.order - b.order));
        return fallbackCandidates[0].url;
    }

    function getVideoResultCardLocalSearchText(card, videoUrl) {
        const values = [];
        const seen = new Set();
        const addValue = value => addUniqueSearchValue(values, seen, value);

        // Only persistent card metadata belongs in the identity hash. XVideos creates and rewrites
        // hover-preview nodes inside the same .thumb-block; including every anchor or preview label
        // made a previously clean card look "new" every time the mouse crossed it.
        const stableTitleSelectors = [
            '.thumb-title a', 'a.thumb-title', '.thumb-title', '.video-title'
        ].join(', ');
        const stablePeopleSelectors = [
            '.username', '.user-profile-name', '.uploader', '.main-uploader',
            '.uploader-tag .name', '.model', '.models', '.model-name',
            '[data-title]', '[data-video-title]', '[data-uploader]',
            '[data-username]', '[data-model]', '[data-models]',
            '[data-performer]', '[data-performers]'
        ].join(', ');

        card.querySelectorAll(stableTitleSelectors + ', ' + stablePeopleSelectors).forEach(element => {
            if (element.closest && element.closest('.video-overlay-title, .videoad-title, .sheer-sponsor')) return;
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

        card.querySelectorAll(
            'a[href^="/profiles/"], a[href^="/channels/"], a[href^="/model-channels/"]'
        ).forEach(link => {
            if (link.closest && link.closest(
                '.video-overlay-title, .videoad-title, .sheer-sponsor, video, ' +
                '[class*="preview"], [class*="hover"]'
            )) return;

            addValue(link.textContent || '');
            try {
                const parsed = new URL(link.getAttribute('href') || '', window.location.origin);
                const slug = parsed.pathname.split('/').filter(Boolean).pop() || '';
                addValue(decodeURIComponent(slug).replace(/[-_]+/g, ' '));
            } catch (e) {}
        });

        const normalizedUrl = normalizeVideoWatchUrl(videoUrl);
        if (normalizedUrl) {
            try {
                const parsed = new URL(normalizedUrl, window.location.origin);
                addValue(decodeURIComponent(parsed.pathname).replace(/[-_./]+/g, ' '));
            } catch (e) {}
        }

        return values.join(' ');
    }

    function hasVideoResultCardStableEvidence(card) {
        if (!card || !card.querySelectorAll) return false;

        const evidenceSelectors = [
            '.thumb-title a', 'a.thumb-title', '.thumb-title', 'a.video-title',
            '.username', '.user-profile-name', '.uploader', '.main-uploader',
            '.uploader-tag .name', '.model', '.models', '.model-name',
            '[data-title]', '[data-video-title]', '[data-uploader]',
            '[data-username]', '[data-model]', '[data-models]',
            '[data-performer]', '[data-performers]'
        ].join(', ');

        for (const element of card.querySelectorAll(evidenceSelectors)) {
            if (element.closest && element.closest(
                '.video-overlay-title, .videoad-title, .sheer-sponsor, video, ' +
                '[class*="preview"], [class*="hover"]'
            )) continue;

            const values = [
                element.innerText || element.textContent || '',
                element.getAttribute && element.getAttribute('title'),
                element.getAttribute && element.getAttribute('aria-label'),
                element.getAttribute && element.getAttribute('data-title'),
                element.getAttribute && element.getAttribute('data-video-title'),
                element.getAttribute && element.getAttribute('data-uploader'),
                element.getAttribute && element.getAttribute('data-username'),
                element.getAttribute && element.getAttribute('data-model'),
                element.getAttribute && element.getAttribute('data-models'),
                element.getAttribute && element.getAttribute('data-performer'),
                element.getAttribute && element.getAttribute('data-performers')
            ];

            if (values.some(value => String(value || '').replace(/\s+/g, ' ').trim().length >= 2)) {
                return true;
            }
        }

        // Stable profile/model links can carry useful slugs even if the visible label is mounted late.
        for (const link of card.querySelectorAll(
            'a[href^="/profiles/"], a[href^="/channels/"], a[href^="/model-channels/"]'
        )) {
            if (link.closest && link.closest('[class*="preview"], [class*="hover"], .video-overlay-title')) continue;
            const href = link.getAttribute('href') || '';
            if (href.split('/').filter(Boolean).length >= 2) return true;
        }

        return false;
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

    function getVideoFetchJobPriority(source) {
        if (source === 'active') {
            return videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_URGENT ? 0 : 1;
        }
        return 3;
    }

    function pickNextVideoPageFetchJob() {
        if (videoPageFetchQueue.length === 0) return null;

        videoPageFetchQueue.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.sequence - b.sequence;
        });

        // At the actual committed edge, Batch A owns every newly available slot. Batch B remains
        // queued rather than competing for bandwidth until the urgent active work has drained.
        if (videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_URGENT && activeVideoBatchCards) {
            const activeIndex = videoPageFetchQueue.findIndex(job => job.source === 'active');
            if (activeIndex >= 0) return videoPageFetchQueue.splice(activeIndex, 1)[0];
            const activeUnresolved = activeVideoBatchCards.some(card => {
                if (!card || !card.isConnected) return false;
                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                return state !== 'prepared-clean' && state !== 'prepared-blocked';
            });
            if (activeUnresolved) return null;
        }

        return videoPageFetchQueue.shift() || null;
    }

    function pumpVideoPageFetchQueue() {
        const concurrencyLimit = getVideoFetchConcurrencyLimit();
        while (activeVideoPageFetches < concurrencyLimit && videoPageFetchQueue.length > 0) {
            const job = pickNextVideoPageFetchJob();
            if (!job) break;
            videoPageFetchJobsByUrl.delete(job.url);
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

    function getVideoPageMetadata(url, source) {
        const cached = videoPageMetadataCache.get(url);
        if (cached) {
            const ttl = cached.failed
                ? VIDEO_PAGE_METADATA_FAILURE_CACHE_TTL_MS
                : VIDEO_PAGE_METADATA_CACHE_TTL_MS;

            if (Date.now() - cached.fetchedAt < ttl) {
                return Promise.resolve(cached.metadata || '');
            }
        }

        if (videoPageMetadataPending.has(url)) {
            const queuedJob = videoPageFetchJobsByUrl.get(url);
            if (queuedJob && source === 'active') {
                queuedJob.source = 'active';
                queuedJob.priority = getVideoFetchJobPriority('active');
                pumpVideoPageFetchQueue();
            }
            return videoPageMetadataPending.get(url);
        }

        const normalizedSource = source === 'lookahead' ? 'lookahead' : 'active';
        const promise = new Promise(resolve => {
            const job = {
                url,
                resolve,
                source: normalizedSource,
                priority: getVideoFetchJobPriority(normalizedSource),
                sequence: ++videoPageFetchSequence
            };
            videoPageFetchQueue.push(job);
            videoPageFetchJobsByUrl.set(url, job);
            pumpVideoPageFetchQueue();
        });
        videoPageMetadataPending.set(url, promise);
        return promise;
    }

    function setVideoResultCardState(card, state, logText) {
        if (!card || !card.setAttribute) return;

        const previousState = card.getAttribute(VIDEO_RESULT_STATE_ATTR);
        const wasCommittedClean = previousState === 'clean' &&
            card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) === 'true';
        card.setAttribute(VIDEO_RESULT_STATE_ATTR, state);
        card.setAttribute(VIDEO_RESULT_REVISION_ATTR, String(videoFilterRevision));

        if (state === 'blocked') {
            unobserveVideoCardMedia(card);
            card.setAttribute('aria-hidden', 'true');
            card.removeAttribute(VIDEO_RESULT_COMMITTED_ATTR);
            card.removeAttribute(VIDEO_RESULT_PENDING_RETRY_ATTR);
            queuedVideoResultCards.delete(card);
            deferredVideoTailCards.delete(card);
            if (previousState !== 'blocked') {
                console.log(`No-glimpse blocked video result: ${String(logText || '').trim()}`);
            }
            if (wasCommittedClean) scheduleCommittedVideoRowRepair('late-committed-block');
        } else if (state === 'clean') {
            card.setAttribute(VIDEO_RESULT_COMMITTED_ATTR, 'true');
            card.removeAttribute('aria-hidden');
            card.removeAttribute(VIDEO_RESULT_PENDING_RETRY_ATTR);
            queuedVideoResultCards.delete(card);
            observeVideoCardMedia(card);
        } else {
            // A previously committed card may be revalidated in place after a dynamic blocklist
            // refresh. Keep that already-approved row visible; genuinely new/recycled cards do not
            // carry the committed marker and therefore remain hidden behind the batch gate.
            if (card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) === 'true') {
                card.removeAttribute('aria-hidden');
            } else {
                card.setAttribute('aria-hidden', 'true');
            }
            if (state === 'prepared-clean') scheduleCommittedVideoRowRepair('prepared-replacement-ready');
        }
    }

    function scheduleVideoResultCardRetry(card) {
        if (!card || !card.isConnected) return;
        const retries = Number.parseInt(card.getAttribute(VIDEO_RESULT_PENDING_RETRY_ATTR) || '0', 10) || 0;
        if (retries >= VIDEO_RESULT_MAX_PENDING_RETRIES) {
            // A malformed card with no canonical video identity must not hold an entire batch open.
            // Fail closed: keep it hidden and allow the remaining approved cards to commit together.
            setVideoResultCardState(card, 'prepared-blocked', 'Missing stable video identity');
            queuedVideoResultCards.add(card);
            scheduleVideoBatchPass(0);
            return;
        }

        card.setAttribute(VIDEO_RESULT_PENDING_RETRY_ATTR, String(retries + 1));
        setTimeout(() => {
            if (!card.isConnected) return;
            queueVideoResultCard(card, 'identity-retry');
        }, VIDEO_RESULT_PENDING_RETRY_MS * Math.min(retries + 1, 6));
    }

    function queueVideoResultCard(card, source) {
        if (!card || !card.isConnected || isInsideSearchAutocomplete(card)) return;

        // Full-document SPA follow-up scans must not demote cards owned by the active atomic batch.
        // The batch promise is the sole authority until commit; ordinary hydration/hover mutations
        // cannot change checking/prepared cards back to queued.
        if (Array.isArray(activeVideoBatchCards) && activeVideoBatchCards.includes(card)) {
            const ownedUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
            const currentOwnedUrl = getVideoResultCardVideoUrl(card, ownedUrl);
            if (!currentOwnedUrl || !ownedUrl || currentOwnedUrl === ownedUrl) return;
        }

        const previousUrl = card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '';
        const previousHash = card.getAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR) || '';
        const previousRevision = card.getAttribute(VIDEO_RESULT_REVISION_ATTR) || '';
        const previousState = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
        const videoUrl = getVideoResultCardVideoUrl(card, previousUrl);
        // A deliberately deferred clean tail stays dormant until genuinely new cards arrive.
        // Harmless SPA maintenance and thumbnail mutations must not reactivate it by themselves.
        if (previousState === 'deferred-clean' && (!videoUrl || previousUrl === videoUrl)) return;
        if (previousState === 'deferred-clean') deferredVideoTailCards.delete(card);
        const localText = getVideoResultCardLocalSearchText(card, videoUrl);
        const localHash = simpleTextHash(localText);
        const sameVideo = !!videoUrl && previousUrl === videoUrl;
        const sameRevision = previousRevision === String(videoFilterRevision);

        // A committed verdict is monotonic for the same canonical URL. This also covers dynamic
        // wrestler/blocklist revisions: revalidate the existing card in place, but never demote it
        // to queued/checking and blank every row. The previous cached title includes linked-page
        // metadata, so newly added filters can still upgrade an old clean verdict to blocked.
        const wasCommitted = card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) === 'true';
        if (sameVideo && (['clean', 'blocked'].includes(previousState) || wasCommitted)) {
            const existingRecord = videoVerdictCache.get(videoUrl);
            const revisionEvidence = `${localText} ${existingRecord && existingRecord.title || ''}`.trim();
            const mustBlock = previousState === 'blocked' || containsBlockedContent(revisionEvidence);

            card.setAttribute(VIDEO_RESULT_SOURCE_ATTR, videoUrl);
            card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, localHash);
            card.setAttribute(VIDEO_RESULT_REVISION_ATTR, String(videoFilterRevision));
            routeCommittedVideoUrls.add(videoUrl);

            if (mustBlock) {
                setVideoResultCardState(card, 'blocked', revisionEvidence || localText);
                rememberVideoVerdict(videoUrl, 'blocked', localHash, revisionEvidence || localText);
            } else {
                setVideoResultCardState(card, 'clean');
                if (!sameRevision || previousHash !== localHash || !existingRecord) {
                    rememberVideoVerdict(videoUrl, 'clean', localHash, revisionEvidence || localText);
                }
            }
            return;
        }

        // A truly recycled card with a different durable URL is new content. Remove the row-commit
        // marker before queuing it so the replacement cannot flash while its verdict is prepared.
        if (previousUrl && videoUrl && previousUrl !== videoUrl) {
            unobserveVideoCardMedia(card);
            card.removeAttribute(VIDEO_RESULT_COMMITTED_ATTR);
        }

        card.setAttribute(VIDEO_RESULT_SOURCE_ATTR, videoUrl);
        card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, localHash);

        // Cached URLs skip all network work, but a clean result still respects the current route's
        // row gate. Only a URL already committed on this route is restored immediately after a DOM
        // node replacement; newly mounted lower rows remain invisible until their authorized atomic batch.
        const cached = getCachedVideoVerdict(videoUrl, localHash, localText);
        if (cached) {
            // A repeated URL lower in the feed is still a new slot. Restoring it immediately merely
            // because the same URL appeared earlier leaked individual cards outside atomic commits.
            // Existing committed DOM nodes are already handled by the monotonic branch above.
            setVideoResultCardState(
                card,
                cached.state === 'blocked' ? 'prepared-blocked' : 'prepared-clean',
                cached.title || localText
            );
            queuedVideoResultCards.add(card);
            reviveDeferredVideoTail('cached-card-mounted');
            syncVideoBatchPendingPageState();
            scheduleVideoBatchPass(VIDEO_BATCH_SETTLE_MS);
            return;
        }

        setVideoResultCardState(card, 'queued', source || 'queued');
        queuedVideoResultCards.add(card);
        reviveDeferredVideoTail('new-card-mounted');
        syncVideoBatchPendingPageState();
        scheduleVideoBatchPass(VIDEO_BATCH_SETTLE_MS);
    }

    function prepareVideoResultCard(card) {
        if (!card || !card.isConnected || isInsideSearchAutocomplete(card)) return;

        const previousUrl = card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '';
        const videoUrl = getVideoResultCardVideoUrl(card, previousUrl);
        const localText = getVideoResultCardLocalSearchText(card, videoUrl);
        const localHash = simpleTextHash(localText);
        card.setAttribute(VIDEO_RESULT_SOURCE_ATTR, videoUrl);
        card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, localHash);

        // Active-batch candidates are uncommitted by definition. A DOM node recycled from an
        // earlier row must stay hidden until this new canonical identity is committed.
        unobserveVideoCardMedia(card);
        card.removeAttribute(VIDEO_RESULT_COMMITTED_ATTR);

        const cached = getCachedVideoVerdict(videoUrl, localHash, localText);
        if (cached) {
            setVideoResultCardState(card, cached.state === 'blocked' ? 'prepared-blocked' : 'prepared-clean', cached.title || localText);
            return;
        }

        if (containsBlockedContent(localText)) {
            setVideoResultCardState(card, 'prepared-blocked', localText);
            rememberVideoVerdict(videoUrl, 'blocked', localHash, localText);
            return;
        }

        if (!videoUrl) {
            setVideoResultCardState(card, 'checking', localText);
            scheduleVideoResultCardRetry(card);
            return;
        }

        // Every uncached URL receives one deduplicated linked-page inspection. This is the strict
        // path: no row is exposed merely because its local thumbnail markup looked harmless.
        setVideoResultCardState(card, 'checking', localText);
        const requestRevision = getVideoVerdictRevisionKey();
        getVideoPageMetadata(videoUrl, 'active').then(remoteMetadata => {
            if (!card.isConnected) return;
            if ((card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '') !== videoUrl) return;
            if (requestRevision !== getVideoVerdictRevisionKey()) {
                queueVideoResultCard(card, 'blocklist-revision');
                return;
            }

            const latestText = getVideoResultCardLocalSearchText(card, videoUrl);
            const latestHash = simpleTextHash(latestText);
            const combinedText = `${latestText} ${remoteMetadata || ''}`.trim();
            const state = containsBlockedContent(combinedText) ? 'blocked' : 'clean';
            card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, latestHash);
            setVideoResultCardState(card, state === 'blocked' ? 'prepared-blocked' : 'prepared-clean', combinedText);
            rememberVideoVerdict(videoUrl, state, latestHash, combinedText);
            queuedVideoResultCards.add(card);
            scheduleVideoBatchPass(0);
        }).catch(() => {
            // Network failure does not reveal an unclassified card. It stays invisible and can
            // be retried after a later DOM or route event without blocking neighbouring rows.
            if (card.isConnected) setVideoResultCardState(card, 'checking', localText);
        });
    }


    function resetVideoLookaheadPipeline(reason) {
        videoLookaheadGeneration++;
        videoLookaheadWindows = [];
        videoLookaheadReservedUrls.clear();
        if (reason) {
            try { console.debug('BraveFox: Reset video lookahead pipeline:', reason); } catch (e) {}
        }
    }

    function getActiveVideoBatchUrlSet() {
        const urls = new Set();
        (Array.isArray(activeVideoBatchCards) ? activeVideoBatchCards : []).forEach(card => {
            if (!card || !card.isConnected) return;
            const url = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '') ||
                getVideoResultCardVideoUrl(card, '');
            if (url) urls.add(url);
        });
        return urls;
    }

    function collectVideoLookaheadCandidates(limit) {
        const candidates = [];
        const seenUrls = new Set();
        const activeUrls = getActiveVideoBatchUrlSet();

        try {
            document.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(card => {
                if (candidates.length >= limit) return;
                if (!card || !card.isConnected || isInsideSearchAutocomplete(card)) return;

                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                if (state === 'clean' || state === 'blocked') return;

                const previousUrl = card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '';
                const videoUrl = getVideoResultCardVideoUrl(card, previousUrl);
                if (!videoUrl || activeUrls.has(videoUrl) || videoLookaheadReservedUrls.has(videoUrl) || seenUrls.has(videoUrl)) return;

                seenUrls.add(videoUrl);
                candidates.push({ card, videoUrl });
            });
        } catch (e) {}

        return candidates;
    }

    function markVideoLookaheadSettled(windowState, videoUrl) {
        if (!windowState || windowState.generation !== videoLookaheadGeneration) return;
        windowState.settledUrls.add(videoUrl);
        scheduleVideoBatchPass(0);

        // Batch N+1 starts once batch N has reached its clean halfway point. Only one future
        // window is allowed, keeping the pipeline warm without processing several screens ahead.
        if (windowState.settledUrls.size >= VIDEO_BATCH_PIPELINE_HALF_CARDS) {
            ensureVideoLookaheadPipeline('future-halfway');
        }
    }

    function prefetchVideoLookaheadCandidate(windowState, card, videoUrl) {
        if (!windowState || windowState.generation !== videoLookaheadGeneration) return;

        const localText = getVideoResultCardLocalSearchText(card, videoUrl);
        const localHash = simpleTextHash(localText);
        const cached = getCachedVideoVerdict(videoUrl, localHash, localText);

        if (cached) {
            markVideoLookaheadSettled(windowState, videoUrl);
            return;
        }

        if (containsBlockedContent(localText)) {
            rememberVideoVerdict(videoUrl, 'blocked', localHash, localText);
            markVideoLookaheadSettled(windowState, videoUrl);
            return;
        }

        const generation = videoLookaheadGeneration;
        const requestRevision = getVideoVerdictRevisionKey();
        getVideoPageMetadata(videoUrl, 'lookahead').then(remoteMetadata => {
            if (generation !== videoLookaheadGeneration || windowState.generation !== generation) return;
            if (requestRevision !== getVideoVerdictRevisionKey()) return;

            const latestText = card && card.isConnected
                ? getVideoResultCardLocalSearchText(card, videoUrl)
                : localText;
            const latestHash = simpleTextHash(latestText);
            const combinedText = `${latestText} ${remoteMetadata || ''}`.trim();
            const state = containsBlockedContent(combinedText) ? 'blocked' : 'clean';
            rememberVideoVerdict(videoUrl, state, latestHash, combinedText);
            markVideoLookaheadSettled(windowState, videoUrl);
        }).catch(() => {
            // Leave the URL un-settled. A later normal batch pass may retry it without exposing it.
        });
    }

    function startVideoLookaheadWindow(source) {
        if (videoLookaheadWindows.length >= VIDEO_BATCH_PIPELINE_MAX_FUTURE) return false;

        const candidates = collectVideoLookaheadCandidates(VIDEO_BATCH_LOOKAHEAD_CARDS);
        if (candidates.length === 0) return false;

        const windowState = {
            id: ++videoLookaheadWindowSequence,
            generation: videoLookaheadGeneration,
            source: source || 'pipeline',
            startedAt: Date.now(),
            urls: new Set(),
            cardsByUrl: new Map(),
            settledUrls: new Set()
        };

        candidates.forEach(({ card, videoUrl }) => {
            windowState.urls.add(videoUrl);
            windowState.cardsByUrl.set(videoUrl, card);
            videoLookaheadReservedUrls.add(videoUrl);
        });
        videoLookaheadWindows.push(windowState);

        candidates.forEach(({ card, videoUrl }) => {
            prefetchVideoLookaheadCandidate(windowState, card, videoUrl);
        });

        try {
            console.debug(`BraveFox: Started lookahead batch ${windowState.id} with ${windowState.urls.size} URLs (${windowState.source}).`);
        } catch (e) {}
        return true;
    }

    function ensureVideoLookaheadPipeline(source) {
        if (isFiniteProfileVideoTabRoute()) return;
        if (!activeVideoBatchCards || activeVideoBatchTargetCleanCount <= 0) return;

        const activeStates = activeVideoBatchCards.map(card => card && card.isConnected
            ? (card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '')
            : 'prepared-blocked');
        const activeSettled = activeStates.reduce((count, state) => {
            return count + ((state === 'prepared-clean' || state === 'prepared-blocked') ? 1 : 0);
        }, 0);
        if (activeSettled < VIDEO_BATCH_PIPELINE_HALF_CARDS) return;

        while (videoLookaheadWindows.length < VIDEO_BATCH_PIPELINE_MAX_FUTURE) {
            const previous = videoLookaheadWindows[videoLookaheadWindows.length - 1];
            if (previous && previous.settledUrls.size < Math.min(VIDEO_BATCH_PIPELINE_HALF_CARDS, previous.urls.size)) break;
            if (!startVideoLookaheadWindow(source || 'active-halfway')) break;
        }
    }

    function consumeVideoLookaheadForActiveBatch(cards) {
        const activeUrls = new Set();
        (Array.isArray(cards) ? cards : []).forEach(card => {
            if (!card || !card.isConnected) return;
            const url = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '') ||
                getVideoResultCardVideoUrl(card, '');
            if (url) activeUrls.add(url);
        });
        if (activeUrls.size === 0) return 0;

        let inheritedStartedAt = 0;
        videoLookaheadWindows.forEach(windowState => {
            let overlap = false;
            activeUrls.forEach(url => {
                if (!windowState.urls.has(url)) return;
                overlap = true;
                windowState.urls.delete(url);
                windowState.cardsByUrl.delete(url);
                windowState.settledUrls.delete(url);
                videoLookaheadReservedUrls.delete(url);
            });
            if (overlap && (!inheritedStartedAt || windowState.startedAt < inheritedStartedAt)) {
                inheritedStartedAt = windowState.startedAt;
            }
        });

        videoLookaheadWindows = videoLookaheadWindows.filter(windowState => windowState.urls.size > 0);
        return inheritedStartedAt;
    }

    function pruneVideoLookaheadPipeline() {
        const committedUrls = routeCommittedVideoUrls;
        videoLookaheadWindows.forEach(windowState => {
            Array.from(windowState.urls).forEach(url => {
                if (!committedUrls.has(url)) return;
                windowState.urls.delete(url);
                windowState.cardsByUrl.delete(url);
                windowState.settledUrls.delete(url);
                videoLookaheadReservedUrls.delete(url);
            });
        });
        videoLookaheadWindows = videoLookaheadWindows.filter(windowState => windowState.urls.size > 0);
    }

    function collectQueuedVideoCardsInDomOrder() {
        const active = new Set(Array.isArray(activeVideoBatchCards) ? activeVideoBatchCards : []);
        const ordered = [];

        try {
            document.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(card => {
                if (!card || !card.isConnected || active.has(card) || isInsideSearchAutocomplete(card)) return;
                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                if (state === 'clean' || state === 'blocked') {
                    queuedVideoResultCards.delete(card);
                    return;
                }
                if (queuedVideoResultCards.has(card)) ordered.push(card);
            });
        } catch (e) {}

        // Catch a rare detached/reinserted ordering edge case without losing queued work.
        queuedVideoResultCards.forEach(card => {
            if (!card || !card.isConnected || active.has(card) || ordered.includes(card)) return;
            const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
            if (state !== 'clean' && state !== 'blocked') ordered.push(card);
        });

        return ordered;
    }

    function getCommittedCleanVideoCardsInDomOrder() {
        try {
            return Array.from(document.querySelectorAll(
                `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"][${VIDEO_RESULT_COMMITTED_ATTR}="true"]`
            )).filter(card => card && card.isConnected && !isInsideSearchAutocomplete(card));
        } catch (e) {
            return [];
        }
    }

    function getPreparedRepairCardsInDomOrder(limit) {
        const afterBoundary = [];
        const fallback = [];
        const committedCards = getCommittedCleanVideoCardsInDomOrder();
        const boundaryCard = committedCards.length > 0 ? committedCards[committedCards.length - 1] : null;
        try {
            document.querySelectorAll(
                `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="prepared-clean"], ` +
                `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="deferred-clean"]`
            ).forEach(card => {
                if (!card || !card.isConnected || isInsideSearchAutocomplete(card)) return;
                if (card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) === 'true') return;
                if (boundaryCard && boundaryCard.compareDocumentPosition) {
                    const position = boundaryCard.compareDocumentPosition(card);
                    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                        afterBoundary.push(card);
                        return;
                    }
                }
                fallback.push(card);
            });
        } catch (e) {}
        return afterBoundary.concat(fallback).slice(0, Math.max(0, limit));
    }

    function scheduleCommittedVideoRowRepair(reason) {
        if (!videoBatchInitialCommitted || videoBatchRowRepairScheduled || videoBatchRowRepairInProgress) return;
        videoBatchRowRepairScheduled = true;
        const run = () => {
            videoBatchRowRepairScheduled = false;
            repairCommittedVideoRows(reason || 'scheduled-repair');
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function repairCommittedVideoRows(reason) {
        if (!videoBatchInitialCommitted || videoBatchRowRepairInProgress) return false;
        videoBatchRowRepairInProgress = true;
        try {
            const committedCards = getCommittedCleanVideoCardsInDomOrder();
            const actualCount = committedCards.length;
            const deficit = Math.max(0, videoBatchExpectedCommittedCleanCount - actualCount);
            if (deficit <= 0) return false;

            const replacements = getPreparedRepairCardsInDomOrder(deficit);
            if (replacements.length === 0) {
                updateVideoBatchFetchUrgency('row-repair-waiting');
                scheduleVideoBatchPass(0);
                return false;
            }

            const replacementSet = new Set(replacements);
            if (Array.isArray(activeVideoBatchCards)) {
                activeVideoBatchCards = activeVideoBatchCards.filter(card => !replacementSet.has(card));
            }

            replacements.forEach(card => {
                queuedVideoResultCards.delete(card);
                deferredVideoTailCards.delete(card);
                const videoUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
                if (videoUrl) routeCommittedVideoUrls.add(videoUrl);
                setVideoResultCardState(card, 'clean');
            });

            refreshVideoBatchBottomObserver();
            syncVideoBatchPendingPageState();
            scheduleVideoBatchPass(0);
            if (replacements.length < deficit) scheduleCommittedVideoRowRepair('repair-still-short');
            if (reason) {
                try { console.debug(`BraveFox: Repaired ${replacements.length}/${deficit} committed card slots:`, reason); } catch (e) {}
            }
            return true;
        } finally {
            videoBatchRowRepairInProgress = false;
        }
    }

    function reviveDeferredVideoTail(reason) {
        if (deferredVideoTailCards.size === 0) return 0;
        let revived = 0;
        deferredVideoTailCards.forEach(card => {
            if (!card || !card.isConnected) return;
            if ((card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '') !== 'deferred-clean') return;
            setVideoResultCardState(card, 'prepared-clean', reason || 'deferred-tail-revived');
            queuedVideoResultCards.add(card);
            revived++;
        });
        deferredVideoTailCards.clear();
        return revived;
    }

    function deferIncompleteActiveVideoTail(reason) {
        if (!Array.isArray(activeVideoBatchCards)) return false;
        activeVideoBatchCards.forEach(card => {
            if (!card || !card.isConnected) return;
            const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
            const videoUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
            if (state === 'prepared-blocked') {
                if (videoUrl) routeCommittedVideoUrls.add(videoUrl);
                setVideoResultCardState(card, 'blocked', getVideoResultCardLocalSearchText(card, videoUrl));
                return;
            }
            if (state === 'prepared-clean') {
                card.setAttribute(VIDEO_RESULT_STATE_ATTR, 'deferred-clean');
                card.setAttribute(VIDEO_RESULT_REVISION_ATTR, String(videoFilterRevision));
                card.setAttribute('aria-hidden', 'true');
                card.removeAttribute(VIDEO_RESULT_COMMITTED_ATTR);
                queuedVideoResultCards.delete(card);
                deferredVideoTailCards.add(card);
            }
        });

        activeVideoBatchCards = null;
        activeVideoBatchTargetCleanCount = 0;
        activeVideoBatchReleaseInitialGuard = false;
        activeVideoBatchLastCandidateAt = 0;
        activeVideoBatchStartedAt = 0;
        videoBatchProcessing = false;
        videoBatchNextBatchRequested = false;
        videoBatchCommitScheduled = false;
        syncVideoBatchPendingPageState();
        refreshVideoBatchBottomObserver();
        pruneVideoLookaheadPipeline();
        if (reason) {
            try { console.debug('BraveFox: Deferred incomplete clean tail:', reason); } catch (e) {}
        }
        return true;
    }

    function syncVideoBatchPendingPageState() {
        let hasPending = !!activeVideoBatchCards;
        if (!hasPending) {
            for (const card of queuedVideoResultCards) {
                if (!card || !card.isConnected) continue;
                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                if (state !== 'clean' && state !== 'blocked') {
                    hasPending = true;
                    break;
                }
            }
        }

        try {
            if (hasPending) document.documentElement.setAttribute('data-bravefox-video-batch-pending', 'true');
            else document.documentElement.removeAttribute('data-bravefox-video-batch-pending');
        } catch (e) {}
    }

    function addCandidatesToActiveVideoBatch(count) {
        if (!activeVideoBatchCards || count <= 0) return 0;
        const candidates = collectQueuedVideoCardsInDomOrder().slice(0, count);
        if (candidates.length === 0) return 0;

        candidates.forEach(card => {
            activeVideoBatchCards.push(card);
            prepareVideoResultCard(card);
        });
        activeVideoBatchLastCandidateAt = Date.now();
        syncVideoBatchPendingPageState();
        return candidates.length;
    }

    function commitPreparedVideoCards(cards, releaseInitialGuard, cleanCommitCount, markInitialCommitted) {
        if (videoBatchCommitScheduled) return false;

        // Preserve DOM order. A later clean candidate may not leapfrog an unresolved earlier
        // card, otherwise that earlier card could appear above the committed rows after settling.
        const selectedCleanCards = [];
        let prefixReady = true;
        for (const card of cards) {
            if (!card || !card.isConnected) continue;
            const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
            if (state === 'prepared-blocked') continue;
            if (state === 'prepared-clean') {
                selectedCleanCards.push(card);
                if (selectedCleanCards.length >= cleanCommitCount) break;
                continue;
            }
            prefixReady = false;
            break;
        }

        if (!prefixReady || selectedCleanCards.length !== cleanCommitCount) {
            scheduleVideoBatchPass(VIDEO_BATCH_COMMIT_RETRY_MS);
            return false;
        }

        const selectedSources = new Map();
        selectedCleanCards.forEach(card => {
            selectedSources.set(card, normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || ''));
        });
        const selectedCleanSet = new Set(selectedCleanCards);
        videoBatchCommitScheduled = true;

        const commit = () => {
            // XVideos can recycle or detach cards between the promise callback and the paint frame.
            // Never perform a short/partial reveal: cancel the transaction and refill the batch.
            const transactionStillValid = selectedCleanCards.every(card => {
                if (!card || !card.isConnected) return false;
                if (card.getAttribute(VIDEO_RESULT_STATE_ATTR) !== 'prepared-clean') return false;
                const currentSource = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
                return currentSource === selectedSources.get(card);
            });

            if (!transactionStillValid) {
                videoBatchCommitScheduled = false;
                scheduleVideoBatchPass(VIDEO_BATCH_COMMIT_RETRY_MS);
                return;
            }

            cards.forEach(card => {
                if (!card || !card.isConnected) return;
                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                const videoUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');

                if (state === 'prepared-blocked') {
                    if (videoUrl) routeCommittedVideoUrls.add(videoUrl);
                    setVideoResultCardState(card, 'blocked', getVideoResultCardLocalSearchText(card, videoUrl));
                    return;
                }

                if (selectedCleanSet.has(card)) {
                    if (videoUrl) routeCommittedVideoUrls.add(videoUrl);
                    setVideoResultCardState(card, 'clean');
                    return;
                }

                // Anything outside this exact reveal transaction remains invisible and becomes part
                // of the next background batch. No card can leak into the page one-by-one.
                if (state !== 'blocked' && state !== 'clean') {
                    queuedVideoResultCards.add(card);
                    if (state !== 'prepared-clean' && state !== 'checking') {
                        setVideoResultCardState(card, 'queued', 'deferred-to-next-batch');
                    }
                }
            });

            if (markInitialCommitted) videoBatchInitialCommitted = true;
            videoBatchExpectedCommittedCleanCount += cleanCommitCount;
            if (releaseInitialGuard) hideInitialVideoGuard('initial-batch-committed');
            activeVideoBatchCards = null;
            activeVideoBatchTargetCleanCount = 0;
            activeVideoBatchReleaseInitialGuard = false;
            activeVideoBatchLastCandidateAt = 0;
            activeVideoBatchStartedAt = 0;
            videoBatchProcessing = false;
            videoBatchNextBatchRequested = false;
            videoBatchCommitScheduled = false;
            syncVideoBatchPendingPageState();
            refreshVideoBatchBottomObserver();
            pruneVideoLookaheadPipeline();

            // Keep the two-stage pipeline warm. The next active batch starts immediately while one
            // future batch may populate the canonical URL verdict cache.
            updateVideoBatchFetchUrgency('post-commit');
            scheduleVideoBatchPass(0);
            scheduleVideoBatchViewportCheck('post-commit');
        };

        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(commit);
        else setTimeout(commit, 0);
        return true;
    }

    function tryCommitActiveVideoBatch() {
        if (!activeVideoBatchCards) return false;
        if (videoBatchCommitScheduled) return true;

        activeVideoBatchCards = activeVideoBatchCards.filter(card => card && card.isConnected);
        const states = activeVideoBatchCards.map(card => card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '');
        const cleanCount = states.reduce((count, state) => count + (state === 'prepared-clean' ? 1 : 0), 0);
        const unresolved = states.some(state => state !== 'prepared-clean' && state !== 'prepared-blocked');
        const isInitialBatch = !!activeVideoBatchReleaseInitialGuard || !videoBatchInitialCommitted;
        const finiteProfileTab = isFiniteProfileVideoTabRoute();
        const elapsed = Date.now() - activeVideoBatchStartedAt;
        const finiteRouteQuiet = Date.now() - videoBatchLastCardDiscoveryAt >= VIDEO_PROFILE_TAB_DOM_QUIET_MS;
        const queuedOutsideActive = finiteProfileTab ? collectQueuedVideoCardsInDomOrder().length : 0;
        ensureVideoLookaheadPipeline(isInitialBatch ? 'initial-halfway' : 'active-halfway');

        // Normal listings keep eight-row preferred commits and four-row slow fallbacks. Profile,
        // pornstar, channel and model #_tabVideos routes are finite grids: after hydration settles,
        // commit every approved mounted card together, even when the page contains fewer than a row.
        let commitCleanCount = null;
        if (finiteProfileTab) {
            if (!unresolved && queuedOutsideActive === 0 && finiteRouteQuiet) {
                commitCleanCount = cleanCount;
            }
        } else if (isInitialBatch) {
            if (cleanCount >= activeVideoBatchTargetCleanCount) {
                commitCleanCount = activeVideoBatchTargetCleanCount;
            }
        } else if (videoBatchNextBatchRequested) {
            if (cleanCount >= VIDEO_BATCH_PREFERRED_CARDS) {
                commitCleanCount = VIDEO_BATCH_PREFERRED_CARDS;
            } else if (
                cleanCount >= VIDEO_BATCH_SLOW_FALLBACK_CARDS &&
                (videoBatchFetchUrgency === VIDEO_BATCH_FETCH_URGENCY_URGENT ||
                    elapsed >= VIDEO_BATCH_SLOW_THRESHOLD_MS)
            ) {
                // A fast scroll to the actual edge should never wait for the forty-card preference.
                // Reveal the first complete twenty-card fallback immediately and carry the rest on.
                commitCleanCount = VIDEO_BATCH_SLOW_FALLBACK_CARDS;
            }
        }

        if (commitCleanCount !== null) {
            const releaseInitialGuard = activeVideoBatchReleaseInitialGuard;
            if (commitPreparedVideoCards(
                activeVideoBatchCards,
                releaseInitialGuard,
                commitCleanCount,
                isInitialBatch
            )) {
                return true;
            }
        }

        // Refill before every current request settles. As blocked verdicts reduce the maximum
        // possible clean count, pull replacements immediately rather than waiting for a serial wave.
        const unresolvedCount = states.reduce((count, state) => {
            return count + ((state !== 'prepared-clean' && state !== 'prepared-blocked') ? 1 : 0);
        }, 0);
        const maximumPossibleClean = cleanCount + unresolvedCount;
        if (cleanCount < activeVideoBatchTargetCleanCount && maximumPossibleClean < activeVideoBatchTargetCleanCount) {
            const guaranteedDeficit = activeVideoBatchTargetCleanCount - maximumPossibleClean;
            const refillCount = finiteProfileTab
                ? guaranteedDeficit
                : guaranteedDeficit + Math.min(2 * VIDEO_BATCH_CARDS_PER_ROW, VIDEO_BATCH_ACTIVE_OVERBOOK_CARDS);
            if (addCandidatesToActiveVideoBatch(refillCount) > 0) {
                scheduleVideoBatchPass(0);
                return true;
            }
        }

        // Once all mounted candidates settle, finite profiles commit their remainder. Ordinary
        // listings with fewer than one complete fallback batch defer the clean tail and expose the
        // site's own pagination/footer instead of remaining stuck forever at a dead bottom edge.
        if (!unresolved && cleanCount < activeVideoBatchTargetCleanCount) {
            if (finiteProfileTab) {
                if (!finiteRouteQuiet) {
                    scheduleVideoBatchPass(120);
                    return true;
                }
                scheduleVideoBatchPass(0);
                return true;
            }

            if (Date.now() - activeVideoBatchLastCandidateAt < VIDEO_BATCH_FILL_WAIT_MS) {
                scheduleVideoBatchPass(120);
                return true;
            }

            if (videoBatchNextBatchRequested && cleanCount < VIDEO_BATCH_MIN_ATOMIC_REVEAL_CARDS) {
                deferIncompleteActiveVideoTail('mounted-grid-exhausted-before-full-row-batch');
                return true;
            }
        }

        if (
            unresolved ||
            (finiteProfileTab && !finiteRouteQuiet) ||
            (!finiteProfileTab && videoBatchNextBatchRequested && cleanCount < VIDEO_BATCH_PREFERRED_CARDS)
        ) {
            scheduleVideoBatchPass(120);
        }
        return true;
    }

    function processVideoCardBatch(targetCleanCount, releaseInitialGuard, source) {
        if (targetCleanCount <= 0) return;

        videoBatchProcessing = true;
        activeVideoBatchCards = [];
        activeVideoBatchTargetCleanCount = targetCleanCount;
        activeVideoBatchReleaseInitialGuard = !!releaseInitialGuard;
        activeVideoBatchLastCandidateAt = Date.now();
        activeVideoBatchStartedAt = Date.now();

        const finiteProfileTab = isFiniteProfileVideoTabRoute();
        const candidateTarget = finiteProfileTab
            ? targetCleanCount
            : targetCleanCount + VIDEO_BATCH_ACTIVE_OVERBOOK_CARDS;
        const added = addCandidatesToActiveVideoBatch(candidateTarget);
        const inheritedPrefetchStartedAt = consumeVideoLookaheadForActiveBatch(activeVideoBatchCards);
        if (inheritedPrefetchStartedAt > 0) {
            activeVideoBatchStartedAt = Math.min(activeVideoBatchStartedAt, inheritedPrefetchStartedAt);
        }
        if (added === 0) {
            activeVideoBatchCards = null;
            activeVideoBatchTargetCleanCount = 0;
            activeVideoBatchReleaseInitialGuard = false;
            activeVideoBatchStartedAt = 0;
            videoBatchProcessing = false;
            videoBatchNextBatchRequested = false;
            syncVideoBatchPendingPageState();
            refreshVideoBatchBottomObserver();
            return;
        }

        tryCommitActiveVideoBatch();
    }

    function runVideoBatchPass() {
        videoBatchPassTimer = null;
        syncVideoBatchPendingPageState();

        if (activeVideoBatchCards) {
            tryCommitActiveVideoBatch();
            return;
        }
        if (videoBatchProcessing) {
            scheduleVideoBatchPass(60);
            return;
        }

        const queuedCards = collectQueuedVideoCardsInDomOrder();
        const onWatchPage = isLikelyVideoWatchPage();
        const finiteProfileTab = isFiniteProfileVideoTabRoute();
        const now = Date.now();
        const routeAge = now - videoBatchRouteStartedAt;
        const quietFor = now - videoBatchLastCardDiscoveryAt;

        if (!videoBatchInitialCommitted) {
            const targetCards = onWatchPage
                ? VIDEO_BATCH_INITIAL_WATCH_CARDS
                : VIDEO_BATCH_INITIAL_LISTING_CARDS;
            const listingGuardTimedOut = !onWatchPage && initialVideoGuardTimedOutRouteUrl === window.location.href;

            if (queuedCards.length === 0) {
                const survivingCleanCards = Array.from(document.querySelectorAll(
                    `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"][${VIDEO_RESULT_COMMITTED_ATTR}="true"]`
                ));
                if (survivingCleanCards.length > 0) {
                    survivingCleanCards.forEach(card => {
                        const url = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
                        if (url) routeCommittedVideoUrls.add(url);
                    });
                    videoBatchInitialCommitted = true;
                    videoBatchExpectedCommittedCleanCount = survivingCleanCards.length;
                    hideInitialVideoGuard('surviving-committed-rows');
                    syncVideoBatchPendingPageState();
                    refreshVideoBatchBottomObserver();
                    return;
                }

                if (finiteProfileTab) {
                    // Keep checking while the tab's AJAX grid hydrates. There is no white full-page
                    // guard on these routes, so the profile header remains usable throughout.
                    if (routeAge < VIDEO_PROFILE_TAB_EMPTY_WATCH_MS) {
                        scheduleVideoBatchPass(250);
                        return;
                    }
                    // A genuinely empty/fully blocked page must not remain in an eternal initial state.
                    videoBatchInitialCommitted = true;
                    hideInitialVideoGuard('finite-profile-empty');
                    syncVideoBatchPendingPageState();
                    return;
                }

                scheduleVideoBatchPass(listingGuardTimedOut ? 250 : 120);
                return;
            }

            if (finiteProfileTab) {
                // Do not snapshot the grid on the first card. Wait until the route has had time to
                // hydrate and no new .thumb-block has appeared for a short quiet interval.
                if (routeAge < VIDEO_PROFILE_TAB_HYDRATION_GRACE_MS || quietFor < VIDEO_PROFILE_TAB_DOM_QUIET_MS) {
                    scheduleVideoBatchPass(120);
                    return;
                }
                processVideoCardBatch(
                    Math.min(VIDEO_BATCH_INITIAL_LISTING_CARDS, queuedCards.length),
                    false,
                    'finite-profile-initial'
                );
                return;
            }

            if (queuedCards.length < targetCards && !listingGuardTimedOut) {
                scheduleVideoBatchPass(120);
                return;
            }

            processVideoCardBatch(targetCards, !onWatchPage, 'initial-batch');
            return;
        }

        if (queuedCards.length === 0) {
            syncVideoBatchPendingPageState();
            return;
        }

        if (finiteProfileTab) {
            if (quietFor < VIDEO_PROFILE_TAB_DOM_QUIET_MS) {
                scheduleVideoBatchPass(120);
                return;
            }
            processVideoCardBatch(
                Math.min(VIDEO_BATCH_PREFERRED_CARDS, queuedCards.length),
                false,
                'finite-profile-followup'
            );
            return;
        }

        processVideoCardBatch(VIDEO_BATCH_PREFERRED_CARDS, false, 'background-prefetch');
    }

    function scheduleVideoBatchPass(delay) {
        const wait = Number.isFinite(delay) ? Math.max(0, delay) : VIDEO_BATCH_SETTLE_MS;
        if (videoBatchPassTimer !== null) clearTimeout(videoBatchPassTimer);
        videoBatchPassTimer = setTimeout(runVideoBatchPass, wait);
    }

    function resetVideoBatchForRoute(source) {
        if (videoBatchPassTimer !== null) {
            clearTimeout(videoBatchPassTimer);
            videoBatchPassTimer = null;
        }

        disconnectVideoBatchBottomObserver();
        disconnectVideoCardMediaObserver();
        resetVideoLookaheadPipeline(source || 'route-change');
        queuedVideoResultCards.clear();
        deferredVideoTailCards.clear();
        routeCommittedVideoUrls.clear();
        activeVideoBatchCards = null;
        activeVideoBatchTargetCleanCount = 0;
        activeVideoBatchReleaseInitialGuard = false;
        activeVideoBatchLastCandidateAt = 0;
        activeVideoBatchStartedAt = 0;
        videoBatchFetchUrgency = VIDEO_BATCH_FETCH_URGENCY_NORMAL;
        videoPageFetchQueue.forEach(job => {
            job.source = job.source === 'lookahead' ? 'lookahead' : 'active';
            job.priority = getVideoFetchJobPriority(job.source);
        });
        videoBatchProcessing = false;
        videoBatchInitialCommitted = false;
        videoBatchRouteStartedAt = Date.now();
        videoBatchLastCardDiscoveryAt = videoBatchRouteStartedAt;
        videoBatchNextBatchRequested = false;
        videoBatchBottomIntersecting = false;
        videoBatchCommitScheduled = false;
        videoBatchExpectedCommittedCleanCount = 0;
        videoBatchRowRepairScheduled = false;
        videoBatchRowRepairInProgress = false;
        initialVideoGuardTimedOutRouteUrl = '';

        if (shouldUseFullInitialVideoGuard()) showInitialVideoGuard(source || 'route-change');
        else hideInitialVideoGuard('watch-route');

        document.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(card => {
            queueVideoResultCard(card, source || 'route-change');
        });
        syncVideoBatchPendingPageState();
        scheduleVideoBatchPass(VIDEO_BATCH_SETTLE_MS);
    }

    function installVideoBatchViewportHooks() {
        if (videoBatchViewportHooksInstalled) return;
        videoBatchViewportHooksInstalled = true;

        if (typeof IntersectionObserver === 'function') {
            videoBatchBottomObserver = new IntersectionObserver(entries => {
                videoBatchBottomIntersecting = entries.some(entry => {
                    return entry && entry.target === videoBatchObservedCard && entry.isIntersecting;
                });

                if (videoBatchBottomIntersecting) {
                    requestNextVideoBatch('three-viewport-sentinel');
                }
            }, {
                root: null,
                rootMargin: `0px 0px ${VIDEO_BATCH_SENTINEL_ROOT_MARGIN_PX}px 0px`,
                threshold: 0
            });
        }

        // Always keep a passive rAF-throttled fallback. It never cancels or clamps scrolling; it
        // merely catches scrollbar jumps or frames in which IntersectionObserver delivery is late.
        window.addEventListener('scroll', () => {
            scheduleVideoBatchViewportCheck('passive-scroll');
        }, { passive: true });
        window.addEventListener('resize', () => {
            scheduleVideoBatchViewportCheck('resize');
        }, { passive: true });
        window.addEventListener('pageshow', () => {
            scheduleVideoBatchViewportCheck('pageshow');
        }, { passive: true });

        ensureVideoBatchViewportPoll();
    }

    function filterVideoResultCard(card) {
        queueVideoResultCard(card, 'filter-pass');
    }

    function filterVideoResultCards() {
        try {
            document.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(card => {
                const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
                const committed = card.getAttribute(VIDEO_RESULT_COMMITTED_ATTR) === 'true';
                const currentRevision = card.getAttribute(VIDEO_RESULT_REVISION_ATTR) === String(videoFilterRevision);

                // Broad SPA maintenance passes used to rebuild local search text for every historical
                // card. Settled cards are already watched for durable identity/metadata mutations, so
                // leave them alone unless the blocklist revision or canonical URL genuinely changed.
                if ((state === 'clean' || state === 'blocked' || state === 'deferred-clean') && currentRevision) {
                    if (state === 'clean' && committed) observeVideoCardMedia(card);
                    return;
                }

                queueVideoResultCard(card, 'document-scan');
            });
        } catch (e) {
            console.log('Error filtering video result cards: ' + e.message);
        }
    }

    // Remove unwanted top-level menu buttons everywhere, including menus injected after
    // initial load or rebuilt during XVideos SPA-style navigation.
    function removeUnwantedXVideosMenuButtons() {
        try {
            document.querySelectorAll(XVVIDEOS_MAIN_CATEGORY_BUTTON_SELECTOR).forEach(button => {
                if (!button || !button.isConnected) return;

                const replacement = document.createElement('span');
                replacement.className = button.className || 'head__choice head__choice--main-cat init-ok';
                replacement.setAttribute('data-bravefox-static-main-cat', 'true');
                replacement.setAttribute('aria-label', (button.textContent || '').replace(/\s+/g, ' ').trim());
                replacement.style.setProperty('pointer-events', 'none', 'important');
                replacement.style.setProperty('cursor', 'default', 'important');
                while (button.firstChild) replacement.appendChild(button.firstChild);
                button.replaceWith(replacement);
            });

            document.querySelectorAll(UNWANTED_XVIDEOS_MENU_BUTTON_SELECTOR).forEach(link => {
                if (!link || !link.isConnected) return;

                const listItem = link.closest && link.closest('li');
                if (listItem) {
                    const matchingButtons = listItem.querySelectorAll(UNWANTED_XVIDEOS_MENU_BUTTON_SELECTOR);
                    const allTopLevelButtons = listItem.querySelectorAll('a.head__menu-line__main-menu__lvl1');
                    if (matchingButtons.length === 1 && allTopLevelButtons.length === 1) {
                        listItem.remove();
                        return;
                    }
                }

                link.remove();
            });
        } catch (e) {
            console.log('Error removing unwanted XVideos menu buttons: ' + e.message);
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
                    removeUnwantedXVideosMenuButtons();
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

    // --- RESILIENT XVideos SPA AWARENESS ---
    // Keep the proven filtering engine above. This layer only makes navigation and DOM lifecycle
    // detection durable across pushState/replaceState, body replacement, BFCache restoration,
    // infinite-scroll mounts, and content recycling.

    function runCompleteFilterPass() {
        injectNoGlimpseCSS();
        syncTagsPageNoGlimpseState();
        removeUnwantedXVideosMenuButtons();
        removeExternalVideoOverlayLinks();
        filterSearchAutocompleteEntries();
        filterVideoResultCards();
        checkAndRedirectVideoPageBlockedContent();
        checkAndRedirectUrlBlockedContent();
        removeBlockedCategoryEntries();
        filterTagsPageLinks();
        hideBlockedContent();
        deleteContent();
        handleHomePage();
    }

    function clearSpaFollowUpTimers() {
        spaFollowUpTimers.forEach(timerId => clearTimeout(timerId));
        spaFollowUpTimers.clear();
    }

    function scheduleSpaFollowUp(delay, generation) {
        const timerId = setTimeout(() => {
            spaFollowUpTimers.delete(timerId);
            if (generation !== spaRouteGeneration) return;
            runCompleteFilterPass();
        }, delay);
        spaFollowUpTimers.add(timerId);
    }

    function invalidateRouteScopedState() {
        // Route changes invalidate broad DOM bookkeeping, but not video verdicts. A card's URL and
        // stable metadata already identify recycled results; bumping the blocklist revision here made
        // every clean card disappear and refetch on each SPA transition.
        resetProcessedCaches();
        isRedirectingNow = false;
    }

    function handleSpaLocationChange(source) {
        const nextUrl = window.location.href;
        if (__lastKnownUrl === nextUrl) return false;

        __lastKnownUrl = nextUrl;
        spaRouteGeneration++;
        const generation = spaRouteGeneration;
        clearSpaFollowUpTimers();
        invalidateRouteScopedState();
        resetVideoBatchForRoute(source || 'route-change');

        // Profile/channel video tabs can hydrate substantially later than ordinary listings.
        runCompleteFilterPass();
        const hydrationDelays = isFiniteProfileVideoTabRoute()
            ? [0, 60, 180, 500, 1200, 2200, 4000, 7000]
            : [0, 60, 180, 500, 1200];
        hydrationDelays.forEach(delay => scheduleSpaFollowUp(delay, generation));
        return true;
    }

    function detectSpaLocationChange(source) {
        if (__lastKnownUrl !== window.location.href) {
            handleSpaLocationChange(source || 'detector');
            return true;
        }
        return false;
    }

    function addNewCardsFromNode(node, cards) {
        if (!node) return;
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element) return;

        let discovered = false;
        const addCard = card => {
            if (!card || cards.has(card)) return;
            cards.add(card);
            discovered = true;
        };

        if (element.matches && element.matches(VIDEO_RESULT_CARD_SELECTOR)) addCard(element);
        if (element.querySelectorAll) {
            element.querySelectorAll(VIDEO_RESULT_CARD_SELECTOR).forEach(addCard);
        }
        if (discovered) videoBatchLastCardDiscoveryAt = Date.now();
    }

    function isSettledVideoCard(card) {
        return !!card && VIDEO_RESULT_SETTLED_STATES.has(card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '');
    }

    function hasDurableVideoIdentityChanged(card) {
        if (!card || !card.isConnected) return false;
        const previousUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
        const currentUrl = getVideoResultCardVideoUrl(card, previousUrl);
        return !!currentUrl && currentUrl !== previousUrl;
    }

    function refreshSettledVideoVerdict(card) {
        if (!card || !card.isConnected) return;
        const state = card.getAttribute(VIDEO_RESULT_STATE_ATTR) || '';
        if (!VIDEO_RESULT_SETTLED_STATES.has(state) || state === 'blocked') return;

        const videoUrl = normalizeVideoWatchUrl(card.getAttribute(VIDEO_RESULT_SOURCE_ATTR) || '');
        if (!videoUrl) return;
        const localText = getVideoResultCardLocalSearchText(card, videoUrl);
        const localHash = simpleTextHash(localText);
        card.setAttribute(VIDEO_RESULT_LOCAL_HASH_ATTR, localHash);

        // Late durable metadata may upgrade clean -> blocked, but never demotes or temporarily hides
        // the card. This preserves full filtering without the clean -> queued -> clean flash cycle.
        if (containsBlockedContent(localText)) {
            rememberVideoVerdict(videoUrl, 'blocked', localHash, localText);
            setVideoResultCardState(card, 'blocked', localText);
        } else {
            rememberVideoVerdict(videoUrl, 'clean', localHash, localText);
        }
    }

    function isPersistentVideoCardMutationTarget(element) {
        if (!element || !element.closest) return false;
        return !!element.closest(
            '.thumb-title, a.thumb-title, .video-title, .username, .user-profile-name, ' +
            '.uploader, .main-uploader, .uploader-tag, .model, .models, .model-name, ' +
            '[data-title], [data-video-title], [data-uploader], [data-username], ' +
            '[data-model], [data-models], [data-performer], [data-performers]'
        );
    }

    function removedNodeContainsCommittedVideoCard(node) {
        const element = node && node.nodeType === Node.ELEMENT_NODE ? node : null;
        if (!element) return false;
        const selector = `${VIDEO_RESULT_CARD_SELECTOR}[${VIDEO_RESULT_STATE_ATTR}="clean"][${VIDEO_RESULT_COMMITTED_ATTR}="true"]`;
        if (element.matches && element.matches(selector)) return true;
        return !!(element.querySelector && element.querySelector(selector));
    }

    function processSpaMutations(records) {
        // DOM activity doubles as an isolated-world route detector.
        detectSpaLocationChange('dom');
        injectNoGlimpseCSS();
        syncTagsPageNoGlimpseState();

        const cards = new Set();
        let needsBroadPass = false;

        records.forEach(record => {
            const targetElement = record.target && record.target.nodeType === Node.ELEMENT_NODE
                ? record.target
                : record.target && record.target.parentElement;
            const targetCard = targetElement && targetElement.closest
                ? targetElement.closest(VIDEO_RESULT_CARD_SELECTOR)
                : null;

            if (record.type === 'childList') {
                if (record.removedNodes && Array.from(record.removedNodes).some(removedNodeContainsCommittedVideoCard)) {
                    scheduleCommittedVideoRowRepair('committed-node-removed');
                }
                // Newly mounted/replaced cards are always inspected. Ordinary descendants inserted
                // into an existing settled card (preview video, badge, tracker, hover overlay, image)
                // are deliberately ignored unless the durable canonical title URL truly changed.
                record.addedNodes.forEach(node => addNewCardsFromNode(node, cards));

                if (targetCard) {
                    if (!isSettledVideoCard(targetCard) || hasDurableVideoIdentityChanged(targetCard)) {
                        cards.add(targetCard);
                    } else if (isPersistentVideoCardMutationTarget(targetElement)) {
                        refreshSettledVideoVerdict(targetCard);
                    }
                } else if (record.addedNodes.length || record.removedNodes.length) {
                    needsBroadPass = true;
                }
                return;
            }

            if (record.type === 'attributes') {
                if (targetCard) {
                    if (isSettledVideoCard(targetCard)) {
                        // A different canonical identity is queued. Stable title/uploader/model
                        // changes only perform an in-place blocked upgrade; they never hide a clean card.
                        if (hasDurableVideoIdentityChanged(targetCard)) {
                            cards.add(targetCard);
                        } else if (
                            record.attributeName !== 'class' &&
                            record.attributeName !== 'src' &&
                            record.attributeName !== 'poster' &&
                            isPersistentVideoCardMutationTarget(targetElement)
                        ) {
                            refreshSettledVideoVerdict(targetCard);
                        }
                    } else if (
                        record.attributeName !== 'class' &&
                        record.attributeName !== 'src' &&
                        record.attributeName !== 'poster' &&
                        (
                            record.attributeName === 'href' ||
                            record.attributeName === 'title' ||
                            record.attributeName === 'aria-label' ||
                            String(record.attributeName || '').startsWith('data-') ||
                            isPersistentVideoCardMutationTarget(targetElement)
                        )
                    ) {
                        cards.add(targetCard);
                    }
                } else {
                    needsBroadPass = true;
                }
                return;
            }

            if (record.type === 'characterData') {
                if (targetCard) {
                    if (isPersistentVideoCardMutationTarget(targetElement)) {
                        if (isSettledVideoCard(targetCard)) refreshSettledVideoVerdict(targetCard);
                        else cards.add(targetCard);
                    }
                } else {
                    needsBroadPass = true;
                }
            }
        });

        // Newly mounted or genuinely recycled cards are classified before the browser's next paint.
        cards.forEach(filterVideoResultCard);

        if (needsBroadPass) {
            removeUnwantedXVideosMenuButtons();
            removeExternalVideoOverlayLinks();
            filterSearchAutocompleteEntries();
            filterTagsPageLinks();

            if (spaBroadMutationTimer === null) {
                spaBroadMutationTimer = setTimeout(() => {
                    spaBroadMutationTimer = null;
                    runCompleteFilterPass();
                }, 120);
            }
        }
    }

    function ensureSpaRootObserver() {
        const root = document.documentElement;
        if (!root) {
            setTimeout(ensureSpaRootObserver, 50);
            return;
        }

        if (!spaRootObserver) {
            spaRootObserver = new MutationObserver(processSpaMutations);
            observerInstances.add(spaRootObserver);
        }

        // observe() is idempotent for the same observer/target/options and reconnects after BFCache.
        spaRootObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'href', 'class', 'title', 'aria-label', 'data-category',
                'data-title', 'data-video-title', 'data-uploader', 'data-username',
                'data-model', 'data-models', 'data-performer', 'data-performers',
                'data-href', 'data-url', 'data-video-url', 'data-video-id', 'data-id'
            ],
            characterData: true
        });
    }

    function installHistoryHooks() {
        if (window.__braveFoxFilteringSpaHooksInstalled) return;
        window.__braveFoxFilteringSpaHooksInstalled = true;

        ['pushState', 'replaceState'].forEach(type => {
            try {
                const original = history[type];
                if (typeof original !== 'function') return;
                history[type] = function() {
                    const result = original.apply(this, arguments);
                    queueMicrotask(() => detectSpaLocationChange(type));
                    return result;
                };
            } catch (e) {}
        });

        window.addEventListener('popstate', () => queueMicrotask(() => detectSpaLocationChange('popstate')));
        window.addEventListener('hashchange', () => queueMicrotask(() => detectSpaLocationChange('hashchange')));

        // Navigation API support where Chromium exposes it. The URL may update after `navigate`,
        // hence the zero-delay task rather than an immediate read.
        try {
            if (window.navigation && typeof window.navigation.addEventListener === 'function') {
                window.navigation.addEventListener('navigate', () => {
                    setTimeout(() => detectSpaLocationChange('navigation-api'), 0);
                });
            }
        } catch (e) {}

        // Route hints cover routers that update state in a task after click/submit handling.
        document.addEventListener('click', event => {
            const target = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!target) return;
            try {
                const url = new URL(target.href, window.location.href);
                if (url.origin !== window.location.origin) return;
                setTimeout(() => detectSpaLocationChange('internal-link'), 0);
                setTimeout(() => detectSpaLocationChange('internal-link-late'), 80);
            } catch (e) {}
        }, true);

        document.addEventListener('submit', () => {
            setTimeout(() => detectSpaLocationChange('form-submit'), 0);
            setTimeout(() => detectSpaLocationChange('form-submit-late'), 100);
        }, true);
    }

    function startSpaRuntime() {
        ensureSpaRootObserver();
        installVideoBatchViewportHooks();

        if (!spaRuntimeStarted) {
            spaRuntimeStarted = true;
            installHistoryHooks();

            // A conservative fallback for page-world route changes invisible to an isolated
            // content-script history wrapper. 250 ms is responsive without the old 70 ms churn.
            spaRoutePollInterval = setInterval(() => detectSpaLocationChange('url-poll'), 250);
        }
    }

    window.addEventListener('pageshow', event => {
        startSpaRuntime();
        if (__lastKnownUrl !== window.location.href) {
            handleSpaLocationChange('pageshow-route');
            return;
        }
        if (event.persisted) {
            // Same-URL BFCache restoration reattaches and rescans without rearming the route guard
            // or demoting settled cards.
            setTimeout(() => {
                ensureSpaRootObserver();
                runCompleteFilterPass();
                scheduleVideoBatchPass(0);
            }, 0);
        }
    });

    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startSpaRuntime();
            detectSpaLocationChange('visibilitychange');
            runCompleteFilterPass();
            scheduleVideoBatchPass(0);
        }
    });

    // Initial activation. The document-start guard was already armed above; do not treat startup
    // as a second route transition and rearm it. Run one pass plus bounded hydration follow-ups.
    startSpaRuntime();
    spaRouteGeneration++;
    const startupGeneration = spaRouteGeneration;
    runCompleteFilterPass();
    const startupHydrationDelays = isFiniteProfileVideoTabRoute()
        ? [0, 60, 180, 500, 1200, 2200, 4000, 7000]
        : [0, 60, 180, 500, 1200];
    startupHydrationDelays.forEach(delay => scheduleSpaFollowUp(delay, startupGeneration));

})();