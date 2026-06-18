(function() {
// BraveFox Enhancer "background.js" on Chromium platform

// You can change this path if your internal page lives elsewhere:
const EXT_PAGE = 'html/password-protected.html'; 

const timestamp = new Date()
    .toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
    .replace('.', ':');
console.log(`[${timestamp}] BraveFox Enhancer ${chrome.runtime.getManifest().version} initialized!`);

// === ENHANCED MEMORY MANAGEMENT SYSTEM ===
class ResourceTracker {
    constructor() {
        this.intervals = new Set();
        this.timeouts = new Set();
        this.observers = new Set();
        this.eventCleanupFunctions = new Set();
        this.isShuttingDown = false;
        this.lastMemoryCheck = 0;
        this.memoryCheckInterval = 30000; // 30 seconds
        this.maxMemoryMB = 150; // 150MB limit for background script
    }

    addInterval(id) {
        this.intervals.add(id);
        return id;
    }

    addTimeout(id) {
        this.timeouts.add(id);
        return id;
    }

    addObserver(observer) {
        this.observers.add(observer);
        return observer;
    }

    addEventCleanup(cleanupFn) {
        this.eventCleanupFunctions.add(cleanupFn);
        return cleanupFn;
    }

    getMemoryUsage() {
        if (performance.memory) {
            return Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
        }
        return 0;
    }

    checkMemoryPressure() {
        const now = Date.now();
        if (now - this.lastMemoryCheck < this.memoryCheckInterval) return false;
        
        this.lastMemoryCheck = now;
        const memoryMB = this.getMemoryUsage();
        
        if (memoryMB > this.maxMemoryMB) {
            console.warn(`🚨 Memory pressure detected: ${memoryMB}MB > ${this.maxMemoryMB}MB`);
            return true;
        }
        
        if (memoryMB > this.maxMemoryMB * 0.8) {
            console.log(`⚠️ Memory warning: ${memoryMB}MB (${Math.round((memoryMB/this.maxMemoryMB)*100)}%)`);
        }
        
        return false;
    }

    cleanup() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        
        console.log('🧹 ResourceTracker: Starting complete cleanup...');
        
        // Clear all intervals
        for (const id of this.intervals) {
            try {
                clearInterval(id);
            } catch (e) {}
        }
        this.intervals.clear();
        
        // Clear all timeouts
        for (const id of this.timeouts) {
            try {
                clearTimeout(id);
            } catch (e) {}
        }
        this.timeouts.clear();
        
        // Disconnect all observers
        for (const observer of this.observers) {
            try {
                if (observer && typeof observer.disconnect === 'function') {
                    observer.disconnect();
                }
            } catch (e) {}
        }
        this.observers.clear();
        
        // Execute cleanup functions
        for (const cleanupFn of this.eventCleanupFunctions) {
            try {
                cleanupFn();
            } catch (e) {}
        }
        this.eventCleanupFunctions.clear();
        
        const memoryMB = this.getMemoryUsage();
        console.log(`🧹 ResourceTracker cleanup completed. Memory: ${memoryMB}MB`);
    }
}

// Global resource tracker
const resourceTracker = new ResourceTracker();

// Initialize the set to track closed tabs
const closedTabs = new Set();

// Service worker keep-alive mechanism for force-installed extensions
let keepAliveInterval;

const startKeepAlive = () => {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        resourceTracker.intervals.delete(keepAliveInterval);
    }
    keepAliveInterval = setInterval(() => {
        // Simple operation to keep service worker alive
        chrome.storage.local.get(['keepAlive'], () => {
            // This callback keeps the service worker active
        });
    }, 25000); // Every 25 seconds
    resourceTracker.addInterval(keepAliveInterval);
};

// Start keep-alive immediately
startKeepAlive();

// Regex to match any Microsoft Edge URL (any locale, subpath, or query)
const edgeRegex = /^https?:\/\/([a-z0-9-]+\.)*microsoft\.com(\/[a-z]{2}-[a-z]{2})?\/edge(\/|$|[?#])|^https?:\/\/([a-z0-9-]+\.)*microsoft\.com\/.*\/edge(\/|$|[?#])/i;

// Add msedge.net (also used by Microsoft Edge marketing/redirects sometimes)
const msedgeRegex = /^https?:\/\/([a-z0-9-]+\.)*msedge\.net(\/|$|[?#])/i;

// Blocklist for other domains if needed
const blockedSites = [
   "microsoft365.com",
   "microsoft.com/fi-fi/edge/business/download", 
   "microsoft.com/fi-fi/edge/business", 
   "microsoft.com/fi-fi/edge/", 
   "microsoft.com/fi-fi/edge/business/download?cs=3457492030&form=MA13FJ",
   "uptodown.com/windows/browsing",
   "uptodown.com/windows/internet",
   "uptodown.com/windows/web-browsers",
   "en.uptodown.com/windows/web-browsers",
   "uptodown.com/windows/browsers",
   "uptodown.com/windows/internet-browsers",
   "uptodown.com/windows/browser",
   "uptodown.com/windows/web-navigators",
   "uptodown.com/windows/navigators",
   "uptodown.com/windows/networking",
   "uptodown.com/windows/networking/browsers",
   "uptodown.com/windows/google-chrome",
   "google-chrome.uptodown.com",
   "google-chrome.en.uptodown.com",
   "google-chrome.en.uptodown.com/windows",
   "google-chrome-portable.uptodown.com",
   "google-chrome-portable.en.uptodown.com",
   "uptodown.com/windows/mozilla-firefox",
   "mozilla-firefox.uptodown.com",
   "mozilla-firefox.en.uptodown.com",
   "mozilla-firefox.en.uptodown.com/windows",
   "firefox.com/fi/",
   "mozilla.fi",
   "mozilla.org/fi/",
   "brave.com/",
   "brave.com",
   "download.fi/verkko",
   "uptodown.com/windows/microsoft-edge",
   "microsoft-edge.uptodown.com",
   "microsoft-edge.en.uptodown.com",
   "microsoft-edge.en.uptodown.com/windows",
   "uptodown.com/windows/opera",
   "opera.uptodown.com",
   "opera.en.uptodown.com",
   "opera.en.uptodown.com/windows",
   "uptodown.com/windows/brave",
   "brave-browser.uptodown.com",
   "brave-browser.en.uptodown.com",
   "brave-browser-nightly.uptodown.com",
   "brave-browser-nightly.en.uptodown.com",
   "uptodown.com/windows/tor-browser",
   "github.com/mozilla-firefox",
   "softonic.com",
   "en.softonic.com",
   "download.it",
   "taplink.cc",
   "tor.uptodown.com",
   "tor.en.uptodown.com",
   "tor.uptodown.com/windows",
   "tor.en.uptodown.com/windows",
   "safari.uptodown.com",
   "safari.en.uptodown.com",
   "safari.en.uptodown.com/windows",
   "uptodown.com/windows/cent-browser",
   "cent-browser.uptodown.com",
   "cent-browser.en.uptodown.com",
   "uptodown.com/windows/librewolf",
   "apps.microsoft.com/detail/9nzvdkpmr9rd",
   "librewolf.uptodown.com",
   "librewolf.en.uptodown.com",
   "uptodown.com/windows/internet-explorer",
   "internet-explorer.uptodown.com",
   "internet-explorer.en.uptodown.com",
   "uptodown.com/windows/ccleaner-browser",
   "ccleaner-browser.uptodown.com",
   "ccleaner-browser.en.uptodown.com",
   "uptodown.com/windows/chromium",
   "chromium.uptodown.com",
   "instagram.com/explore",
   "chromium.en.uptodown.com",
   "chromium.uptodown.com/windows",
   "chromium.en.uptodown.com/windows",
   "uptodown.com/windows/epic-browser",
   "epic-browser.uptodown.com",
   "epic-browser.en.uptodown.com",
   "uptodown.com/windows/theworld-browser",
   "theworld-browser.uptodown.com",
   "theworld-browser.en.uptodown.com",
   "uptodown.com/windows/avant-browser",
   "avant-browser.uptodown.com",
   "avant-browser.en.uptodown.com",
   "uptodown.com/windows/thorium-browser",
   "thorium-browser.uptodown.com",
   "thorium-browser.en.uptodown.com",
   "uptodown.com/windows/square-1-web-browser",
   "square-1-web-browser.uptodown.com",
   "square-1-web-browser.en.uptodown.com",
   "uptodown.com/windows/netscape-navigator",
   "netscape-navigator.uptodown.com",
   "netscape-navigator.en.uptodown.com",
   "uptodown.com/windows/vivaldi",
   "vivaldi.uptodown.com",
   "vivaldi.en.uptodown.com",
   "vivaldi.en.uptodown.com/windows",
   "uptodown.com/windows/waterfox",
   "waterfox.uptodown.com",
   "github.com/Lateralus138",
   "waterfox.en.uptodown.com",
   "m365.cloud.microsoft",
   "m365.cloud",
   "m365.microsoft",
   "?origindomain=microsoft365",
   "m365.cloud.microsoft/?origindomain=microsoft365",
   "waterfox.en.uptodown.com/windows",
   "uptodown.com/windows/uc-browser",
   "uc-browser-pc.uptodown.com",
   "uc-browser-pc.en.uptodown.com",
   "uc-browser-pc.en.uptodown.com/windows",
   "uptodown.com/windows/yandex-browser",
   "yandex-browser.uptodown.com",
   "yandex-browser.en.uptodown.com",
   "apps.microsoft.com/detail/9mxbp1fb84cq",
   "apps.microsoft.com/detail/9nh2gph4jzs4",
   "apps.microsoft.com/detail/9nrtvfllggtv",
   "viamaker.uptodown.com",
   "viamaker.en.uptodown.com",
   "capcut.uptodown.com",
   "capcut.en.uptodown.com",
   "catcut-video-editor-and-maker.uptodown.com",
   "catcut-video-editor-and-maker.en.uptodown.com",
   "reddit.com/answers",
   "fantopia.mystrikingly.com",
   "www.softorbits.net",
   "softorbits.net",
   "virtualbox.com",
   "virtualbox.net",
   "vmware.com",
   "oracle.com",
   "oracle.org",
   "oracle.net",
   "waterfox.net",
   "download.fi",
   "vsco.co",
   "pinterest.com",
   "instagram.com/m1mmuska",
   "tiktok.com/@karabr",
   "tiktok.com/@kara",
   "tiktok.com/@karts",
   "tiktok.com/@just.se.mimmi",
   "tiktok.com/@m1mmuska",
   "instagram.com/karabr",
   "instagram.com/piia_barlund",
   "tiktok.com/@bulgaru",
   "tiktok.com/@laur",
   "instagram.com/julmakira",
   "lite.irc-galleria.net",
   "irc-galleria.fi",
   "irc.fi",
   "reddit.com/r/comfyui",
   "comfy.org",
   "runcomfy.com",
   "facebook.com/prowrestlingworld",
   "stable-diffusion-art.com",
   "comfyui.org",
   "thinkdiffusion.com",
   "threads.com",
   "threads.net",
   "grok.com",
   "grok.ai",
   "pwpix.net",
   "instagram.com/miskaawaa/followers",
   "instagram.com/miskaawaa/following",
   "instagram.com/m1mmuska/followers",
   "instagram.com/m1mmuska/following",
   "reveddit.com/v/jumalattaretPro",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2F418s0mmtpve81.jpg",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2F5sj5dp809wg71.jpg",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2Fqc3dwb3zpmm81.jpg",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2Fkwfiq6v52dp81.jpg",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2Fmh3mrxsf4cg91.jpg",
   "reddit.com/media?url=https%3A%2F%2Fi.redd.it%2Fcl2le6iawhk71.jpg",
   "reddit.com/u/birppis",
   "reveddit.com/y/birppis",
   "jiujau.blogspot.com",
   "jiujau.blogspot.fi",
   "perttas.blogspot.com",
   "perttas.blogspot.fi",
   "instagram.com/nickiminaj",
   "instagram.com/ninnuliin11",
   "instagram.com/n1nnul11n11.real",
   "instagram.com/n1nnul11n11_reels",
   "facebook.com/profile.php?id=100000639309471",
   "irc-galleria.net/user/irpp4/album?page=0",
   "irc-galleria.net/user/irpp4/album?page=1",
   "instagram.com/accounts/hide_story_and_live",
   "www.reddit.com/user/birppis/comments/",
   "www.reddit.com/user/birppis/submitted/",
   "www.reddit.com/user/birppis/posts/",
   "www.reddit.com/user/birppis/comments",
   "www.reddit.com/user/birppis/submitted",
   "www.reddit.com/user/birppis/posts",
   "studio.creativefabrica.com",
   "www.creativefabrica.com",
   "tiktok.com/@juliana.rasikannas",
   "reddit.com/user/JulianaRasikannas",
   "reddit.com/r/snappijuorut",
   "reddit.com/r/snappisensuroimat0n",
   "snapchat.com/@",
   "pinterest.com",
   "snapchat.com/spotlight",
   "instagram.com/misk33waaa",
   "instagram.com/mafiaprinsessa",
   "dashboard.g2a.com/support/conversations/view/M-VJYS-724654",
   "dashboard.g2a.com/support/conversations/view/M-LSMI-906369",
   "tiktok.com/search?q=katarii",
   "tiktok.com/search?q=kara",
   "tiktok.com/search?q=kart",
   "tiktok.com/search?q=bränn",
   "tiktok.com/search?q=brann",
   "tiktok.com/search?q=br4nn",
   "tiktok.com/search?q=just",
   "tiktok.com/search?q=m1mm",
   "tiktok.com/search?q=mimm",
   "tiktok.com/search?q=ira",
   "tiktok.com/search?q=alexa",
   "tiktok.com/search?q=blis",
   "tiktok.com/@katarii",
   "instagram.com/katarii"
];

// Blocked TLDs for auto-closure
const blockedTLDs = [
    '.ai', '.art', '.makeup', '.off', '.club', '.id', '.it', '.best', '.cc', '.cn', '.click', '.exposed',
    '.you','.top', '.me', '.us', '.ru', '.vip', '.online', '.hot', '.her', '.sex', '.xxx', '.nsfw', '.fyi', 
    '.porn', '.show', '.work', '.fit', '.tool', '.tools', '.system', '.systems', '.surf', '.review', '.asia',
    '.tokyo', '.monster', '.info', '.机构', '.xn--nqv7f', '.one', '.ee', '.in', '.gf', '.fox', '.fun', '.fr', 
    '.life', '.now', '.today', '.world', '.xyz', '.zone', '.nude', '.cat', '.bot', '.moe',
];

// Memory-optimized cache with size limit and TTL
class MemoryManagedCache {
    constructor(maxSize = 1000, ttlMs = 300000) {
        this.cache = new Map();
        this.timers = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.lastCleanup = Date.now();
        this.cleanupInterval = Math.min(ttlMs / 4, 60000); // Cleanup every 60s max
    }

    set(key, value) {
        // Periodic cleanup
        const now = Date.now();
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.cleanup();
            this.lastCleanup = now;
        }

        // Clear existing timer if key exists
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            resourceTracker.timeouts.delete(this.timers.get(key));
        }

        // Enforce size limit
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }

        // Set with TTL
        this.cache.set(key, value);
        const timer = setTimeout(() => {
            this.delete(key);
        }, this.ttlMs);
        this.timers.set(key, timer);
        resourceTracker.addTimeout(timer);

        return this;
    }

    get(key) {
        return this.cache.get(key);
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            resourceTracker.timeouts.delete(this.timers.get(key));
            this.timers.delete(key);
        }
        return this.cache.delete(key);
    }

    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
            resourceTracker.timeouts.delete(timer);
        }
        this.timers.clear();
        this.cache.clear();
    }

    cleanup() {
        // Force cleanup of expired entries
        const now = Date.now();
        for (const [key, timer] of this.timers.entries()) {
            // Check if timer has expired (approximate)
            if (timer._idleStart && now - timer._idleStart > this.ttlMs) {
                this.delete(key);
            }
        }
    }

    size() {
        return this.cache.size;
    }
}

// Memory-optimized caches with automatic cleanup
const hostsCache = new MemoryManagedCache(1000);

// In-memory hosts list for immediate tab closure checking
let hostsListForClosure = new Set();

// Enhanced fetch with retry mechanism for force-installed extensions
const fetchHostsFileWithRetry = async (url, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Fetching hosts file (attempt ${attempt}/${maxRetries}): ${url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout
            resourceTracker.addTimeout(timeoutId);
            
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store', // FORCE Chrome to bypass disk cache entirely
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'User-Agent': 'Mozilla/5.0 (Chrome Extension)'
                }
            });
            
            clearTimeout(timeoutId);
            resourceTracker.timeouts.delete(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            
            // Split lines, filter comments/empty, get host field
            const hosts = text.split('\n').reduce((acc, line) => {
                if (line.trim() && !line.trim().startsWith('#')) {
                    const parts = line.split(/\s+/);
                    if (parts.length > 1 && parts[1]) {
                        // Handle both "0.0.0.0 domain.com" and "127.0.0.1 domain.com" formats
                        if (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1') {
                            acc.push(parts[1]);
                        } else {
                            // Fallback for other formats
                            acc.push(parts[1]);
                        }
                    }
                }
                return acc;
            }, []);
            
            console.log(`Successfully fetched ${hosts.length} hosts from ${url}`);
            return hosts;
            
        } catch (error) {
            console.error(`Attempt ${attempt} failed for ${url}:`, error);
            
            if (attempt === maxRetries) {
                console.error('All retry attempts failed, returning empty array');
                return [];
            }
            
            // Wait before retry (exponential backoff)
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => {
                const timeoutId = setTimeout(resolve, delay);
                resourceTracker.addTimeout(timeoutId);
            });
        }
    }
    return [];
};

// Function to fetch and parse hosts file (handles both 0.0.0.0 and regular formats)
const fetchHostsFile = async (url) => {
    return await fetchHostsFileWithRetry(url);
};

// Store the fetched hosts list in local storage (CHUNKED to avoid quota exceeded!)
const storeHostsList = (list) => {
    // Chunk size chosen to stay well below Chrome's per-item quota
    const chunkSize = 25000;
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
        chunks.push(list.slice(i, i + chunkSize));
    }

    const storageObj = {
        hostsChunks: chunks.length,
        hostsTotal: list.length,
        lastUpdate: Date.now()
    };
    // Store each chunk as hostsChunk_0, hostsChunk_1, ...
    chunks.forEach((chunk, idx) => {
        storageObj[`hostsChunk_${idx}`] = chunk;
    });

    chrome.storage.local.set(storageObj, () => {
        if (chrome.runtime.lastError) {
            console.error('Error storing hosts list:', chrome.runtime.lastError);
        } else {
            console.log(`Hosts list stored: ${list.length} hosts in ${chunks.length} chunks`);
        }
    });
};

// Helper to retrieve all hosts from storage (re-assembles from chunks)
const getAllHostsList = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['hostsChunks', 'hostsTotal'], (meta) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting hosts metadata:', chrome.runtime.lastError);
                return resolve([]);
            }
            
            const totalChunks = meta.hostsChunks || 0;
            if (!totalChunks) return resolve([]);
            
            const chunkKeys = [];
            for (let i = 0; i < totalChunks; i++) {
                chunkKeys.push(`hostsChunk_${i}`);
            }
            
            chrome.storage.local.get(chunkKeys, (chunksObj) => {
                if (chrome.runtime.lastError) {
                    console.error('Error getting hosts chunks:', chrome.runtime.lastError);
                    return resolve([]);
                }
                
                let hosts = [];
                for (let i = 0; i < totalChunks; i++) {
                    if (Array.isArray(chunksObj[`hostsChunk_${i}`])) {
                        hosts = hosts.concat(chunksObj[`hostsChunk_${i}`]);
                    }
                }
                resolve(hosts);
            });
        });
    });
};

// Helper function for garbage collection
const tryGarbageCollection = () => {
    try {
        if (typeof self !== 'undefined' && self.gc) {
            self.gc();
        } else if (typeof window !== 'undefined' && window.gc) {
            window.gc();
        }
    } catch (error) {
        // Garbage collection not available, ignore
    }
};

// COMPLETELY REWRITTEN: Nuclear-level rule cleanup and smart ID assignment
const manageDynamicRules = async (hostsList) => {
    return new Promise(async (resolve) => {
        try {
            console.log('🚀 Starting NUCLEAR-level dynamic rule management...');
            
            // Step 1: NUCLEAR cleanup - Clear everything possible
            console.log('☢️ Step 1: NUCLEAR rule cleanup (multiple passes)...');
            
            let cleanupPasses = 0;
            const maxCleanupPasses = 5;
            let totalRulesCleared = 0;
            
            while (cleanupPasses < maxCleanupPasses) {
                cleanupPasses++;
                console.log(`☢️ Cleanup pass ${cleanupPasses}/${maxCleanupPasses}`);
                
                // Get current rules
                const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
                console.log(`   Found ${currentRules.length} existing rules`);
                
                if (currentRules.length === 0) {
                    console.log('✅ No more rules found, cleanup complete');
                    break;
                }
                
                // Build comprehensive removal list
                const existingIds = currentRules.map(rule => rule.id);
                const suspiciousIds = [];
                
                // Add potential orphan IDs in common ranges (expanded)
                for (let i = 1; i <= 60000; i++) {
                    if (!existingIds.includes(i)) {
                        suspiciousIds.push(i);
                    }
                }
                
                // Combine all IDs for removal (existing + potential orphans)
                const allIdsToRemove = [...new Set([...existingIds, ...suspiciousIds])];
                
                console.log(`   Attempting to remove ${allIdsToRemove.length} IDs (${existingIds.length} confirmed + ${suspiciousIds.length} potential orphans)`);
                
                // Perform removal in chunks to avoid overwhelming Chrome
                const removalChunkSize = 5000;
                for (let chunkStart = 0; chunkStart < allIdsToRemove.length; chunkStart += removalChunkSize) {
                    const chunkEnd = Math.min(chunkStart + removalChunkSize, allIdsToRemove.length);
                    const chunk = allIdsToRemove.slice(chunkStart, chunkEnd);
                    
                    await new Promise((chunkResolve) => {
                        chrome.declarativeNetRequest.updateDynamicRules({
                            removeRuleIds: chunk
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.warn(`   ⚠️ Removal chunk ${Math.floor(chunkStart/removalChunkSize) + 1} warning: ${chrome.runtime.lastError.message}`);
                            } else {
                                console.log(`   ✅ Removal chunk ${Math.floor(chunkStart/removalChunkSize) + 1} completed`);
                            }
                            chunkResolve();
                        });
                    });
                    
                    // Small delay between removal chunks
                    await new Promise(resolve => {
                        const timeoutId = setTimeout(resolve, 100);
                        resourceTracker.addTimeout(timeoutId);
                    });
                }
                
                // Wait longer for Chrome to process the removals
                await new Promise(resolve => {
                    const timeoutId = setTimeout(resolve, 2000);
                    resourceTracker.addTimeout(timeoutId);
                });
                
                // Verify removal
                const postRemovalRules = await chrome.declarativeNetRequest.getDynamicRules();
                const rulesRemoved = currentRules.length - postRemovalRules.length;
                totalRulesCleared += rulesRemoved;
                
                console.log(`   📊 Pass ${cleanupPasses} result: ${rulesRemoved} rules removed, ${postRemovalRules.length} remaining`);
                
                if (postRemovalRules.length === 0) {
                    console.log('✅ All rules successfully removed');
                    break;
                }
                
                // If we're stuck with the same number of rules, try a different approach
                if (rulesRemoved === 0 && cleanupPasses > 2) {
                    console.warn('⚠️ No progress made, attempting alternative cleanup...');
                    
                    // Try removing in smaller chunks
                    const remainingIds = postRemovalRules.map(rule => rule.id);
                    for (let i = 0; i < remainingIds.length; i += 10) {
                        const smallChunk = remainingIds.slice(i, i + 10);
                        await new Promise((smallResolve) => {
                            chrome.declarativeNetRequest.updateDynamicRules({
                                removeRuleIds: smallChunk
                            }, () => {
                                smallResolve();
                            });
                        });
                        await new Promise(resolve => {
                            const timeoutId = setTimeout(resolve, 50);
                            resourceTracker.addTimeout(timeoutId);
                        });
                    }
                    await new Promise(resolve => {
                        const timeoutId = setTimeout(resolve, 1000);
                        resourceTracker.addTimeout(timeoutId);
                    });
                }
            }
            
            console.log(`☢️ Cleanup completed: ${totalRulesCleared} total rules cleared across ${cleanupPasses} passes`);
            
            // Step 2: Final state verification and available ID detection (SHIFTED RANGE)
            console.log('🔍 Step 2: Detecting available rule ID slots (higher range)...');
            
            const finalExistingRules = await chrome.declarativeNetRequest.getDynamicRules();
            const occupiedIds = new Set(finalExistingRules.map(rule => rule.id));
            
            console.log(`   Current state: ${finalExistingRules.length} rules still exist`);
            if (finalExistingRules.length > 0) {
                console.log(`   Occupied IDs: ${Array.from(occupiedIds).slice(0, 20).join(', ')}${occupiedIds.size > 20 ? '...' : ''}`);
            }
            
            // Find available ID slots starting from 50000 (HIGHER RANGE to avoid conflicts)
            const availableIds = [];
            for (let i = 50000; i <= 60000; i++) {
                if (!occupiedIds.has(i)) {
                    availableIds.push(i);
                }
            }
            
            // Reserve space for incognito rules (29999, 30000 - keep as-is for compatibility)
            const reservedIds = new Set([29999, 30000]);
            const usableIds = availableIds.filter(id => !reservedIds.has(id));
            
            console.log(`   Available ID slots: ${usableIds.length} (range 50000-60000)`);
            console.log(`   Reserved slots: ${Array.from(reservedIds).join(', ')}`);
            
            // Step 3: Calculate how many rules we can actually add
            const rulesToAdd = Math.min(hostsList.length, usableIds.length);
            const limitedHostsList = hostsList.slice(0, rulesToAdd);
            
            console.log(`📊 Rule planning:`);
            console.log(`   - Total hosts available: ${hostsList.length}`);
            console.log(`   - Available ID slots: ${usableIds.length}`);
            console.log(`   - Rules we will attempt to add: ${rulesToAdd}`);
            
            if (rulesToAdd === 0) {
                console.log('❌ No available ID slots for new rules');
                resolve();
                return;
            }
            
            // Step 4: Create rules using available IDs
            console.log('🏗️ Step 4: Creating rules with available IDs...');
            
            const rulesToCreate = [];
            for (let i = 0; i < rulesToAdd; i++) {
                const host = limitedHostsList[i];
                const ruleId = usableIds[i]; // Use available ID slots
                
                rulesToCreate.push({
                    id: ruleId,
                    priority: 1,
                    action: { type: 'block' },
                    condition: { urlFilter: `*://${host}/*`, resourceTypes: ['main_frame'] }
                });
            }
            
            console.log(`✅ Created ${rulesToCreate.length} rule definitions`);
            console.log(`   ID range: ${rulesToCreate[0]?.id} to ${rulesToCreate[rulesToCreate.length-1]?.id}`);
            
            // Step 5: Add rules using multiple strategies
            console.log('🚀 Step 5: Adding rules to Chrome...');
            
            let additionSuccess = false;
            let successfulRulesAdded = 0;
            
            // Strategy 1: Single batch for smaller rule sets
            if (!additionSuccess && rulesToCreate.length <= 5000) {
                console.log('🎯 Strategy 1: Single batch addition...');
                
                additionSuccess = await new Promise((addResolve) => {
                    chrome.declarativeNetRequest.updateDynamicRules({
                        addRules: rulesToCreate
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn(`⚠️ Single batch failed: ${chrome.runtime.lastError.message}`);
                            addResolve(false);
                        } else {
                            console.log(`✅ Single batch success: ${rulesToCreate.length} rules added`);
                            successfulRulesAdded = rulesToCreate.length;
                            addResolve(true);
                        }
                    });
                });
            }
            
            // Strategy 2: Medium batches
            if (!additionSuccess) {
                console.log('🎯 Strategy 2: Medium batch addition...');
                
                const batchSize = 1000;
                let batchesSuccessful = 0;
                
                for (let start = 0; start < rulesToCreate.length; start += batchSize) {
                    const end = Math.min(start + batchSize, rulesToCreate.length);
                    const batch = rulesToCreate.slice(start, end);
                    
                    const batchNum = Math.floor(start / batchSize) + 1;
                    const totalBatches = Math.ceil(rulesToCreate.length / batchSize);
                    
                    console.log(`📦 Batch ${batchNum}/${totalBatches}: IDs ${batch[0].id}-${batch[batch.length-1].id} (${batch.length} rules)`);
                    
                    const batchSuccess = await new Promise((batchResolve) => {
                        chrome.declarativeNetRequest.updateDynamicRules({
                            addRules: batch
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.error(`❌ Batch ${batchNum} fucking failed, lmao: ${chrome.runtime.lastError.message}`);
                                batchResolve(false);
                            } else {
                                console.log(`✅ Batch ${batchNum} success: ${batch.length} rules`);
                                batchResolve(true);
                            }
                        });
                    });
                    
                    if (batchSuccess) {
                        batchesSuccessful++;
                        successfulRulesAdded += batch.length;
                        // Delay between successful batches
                        if (start + batchSize < rulesToCreate.length) {
                            await new Promise(resolve => {
                                const timeoutId = setTimeout(resolve, 300);
                                resourceTracker.addTimeout(timeoutId);
                            });
                        }
                    } else {
                        console.warn(`🛑 Stopping at batch ${batchNum} due to failure`);
                        break;
                    }
                }
                
                if (batchesSuccessful > 0) {
                    additionSuccess = true;
                    console.log(`✅ Medium batch strategy: ${batchesSuccessful} batches succeeded`);
                }
            }
            
            // Strategy 3: Small batches (last resort)
            if (!additionSuccess) {
                console.log('🎯 Strategy 3: Small batch addition (last resort)...');
                
                const smallBatchSize = 100;
                
                for (let start = 0; start < Math.min(rulesToCreate.length, 5000); start += smallBatchSize) {
                    const end = Math.min(start + smallBatchSize, rulesToCreate.length);
                    const batch = rulesToCreate.slice(start, end);
                    
                    const batchNum = Math.floor(start / smallBatchSize) + 1;
                    
                    console.log(`📦 Small batch ${batchNum}: IDs ${batch[0].id}-${batch[batch.length-1].id} (${batch.length} rules)`);
                    
                    const batchSuccess = await new Promise((batchResolve) => {
                        chrome.declarativeNetRequest.updateDynamicRules({
                            addRules: batch
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.error(`❌ Small batch ${batchNum} failed: ${chrome.runtime.lastError.message}`);
                                batchResolve(false);
                            } else {
                                console.log(`✅ Small batch ${batchNum} success: ${batch.length} rules`);
                                batchResolve(true);
                            }
                        });
                    });
                    
                    if (batchSuccess) {
                        successfulRulesAdded += batch.length;
                        await new Promise(resolve => {
                            const timeoutId = setTimeout(resolve, 100);
                            resourceTracker.addTimeout(timeoutId);
                        });
                    } else {
                        console.warn(`🛑 Stopping small batch addition at batch ${batchNum}`);
                        break;
                    }
                }
                
                if (successfulRulesAdded > 0) {
                    additionSuccess = true;
                }
            }
            
            // Step 6: Final verification and reporting
            console.log('📊 Step 6: Final verification...');
            
            const finalRules = await chrome.declarativeNetRequest.getDynamicRules();
            const newRulesAdded = finalRules.length - finalExistingRules.length;
            
            console.log(`🎉 FINAL RESULTS:`);
            console.log(`   - Rules before operation: ${finalExistingRules.length}`);
            console.log(`   - Rules after operation: ${finalRules.length}`);
            console.log(`   - Net new rules added: ${newRulesAdded}`);
            console.log(`   - Target rules attempted: ${rulesToCreate.length}`);
            console.log(`   - Success rate: ${((newRulesAdded / rulesToCreate.length) * 100).toFixed(1)}%`);
            console.log(`   - Hosts available for tab closure: ${hostsList.length} (ALL HOSTS)`);
            
            if (newRulesAdded > 0) {
                console.log(`✅ Dynamic rule management completed with ${newRulesAdded} rules added`);
            } else {
                console.warn(`⚠️ No new rules added, but tab closure still works for ALL ${hostsList.length} hosts`);
            }
            
            resolve();
            
        } catch (error) {
            console.error('💥 CRITICAL ERROR in manageDynamicRules:', error);
            resolve();
        }
    });
};

// Enhanced initialization function for force-installed extensions
const initializeExtension = async () => {
    console.log('Initializing extension...');
    
    // Check if we have cached hosts first
    const cachedHosts = await getAllHostsList();
    if (cachedHosts.length > 0) {
        hostsListForClosure = new Set(cachedHosts);
        console.log(`Loaded ${cachedHosts.length} cached hosts for immediate blocking`);
    }
    
    // Update blocklist and background data
    await updateBlocklist();
    await updateIncognitoBlockingRules();
    updateWrestlingRoster();
    
    console.log('Extension initialization completed');

    // Scan any existing tabs and redirect protected system pages to the lock page
    await scanAndRedirectProtectedTabs();
};

// Memory-optimized blocklist update (fetch all, dedupe, limit for rules, store full list in chunks)
const updateBlocklist = async () => {
    console.log("Fetching hosts list...");
    const urls = [
        "https://raw.githubusercontent.com/NightmaREE3Z/BraveFox-Enhancer/refs/heads/main/hosts/BraveFoxHosts",
        "https://raw.githubusercontent.com/NightmaREE3Z/BraveFox-Enhancer/refs/heads/main/hosts/Legacy/legacyFox",
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-porn/hosts"
    ];

    // Fetch and concat all hosts files
    let allHosts = [];
    
    // NEW: Cache buster to force a true fetch from GitHub/CDN on every extension refresh
    const cacheBuster = `?force_refresh=${Date.now()}`;
    for (const url of urls) {
        const fetchUrl = url + cacheBuster;
        const hosts = await fetchHostsFile(fetchUrl);
        allHosts = allHosts.concat(hosts);
    }
    tryGarbageCollection();

    // Deduplicate
    const uniqueHostsList = Array.from(new Set(allHosts));
    console.log(`Unique hosts list has ${uniqueHostsList.length} hosts`);

    // Update in-memory hosts list for immediate tab closure checking (ALL hosts)
    hostsListForClosure = new Set(uniqueHostsList);
    console.log(`Updated in-memory hosts list for tab closure: ${hostsListForClosure.size} hosts`);

    // Use new dynamic rule management system
    await manageDynamicRules(uniqueHostsList);
    
    // Store full list regardless of DNR limits
    storeHostsList(uniqueHostsList);
    console.log("Blocklist has been updated.");

    allHosts = null;
    tryGarbageCollection();
};

// Function to handle incognito blocking rules
const updateIncognitoBlockingRules = async () => {
    return new Promise((resolve) => {
        chrome.windows.getAll({}, (windows) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting windows:', chrome.runtime.lastError);
                resolve();
                return;
            }
            
            const isIncognitoWindowActive = windows.some(window => window.incognito);

            if (isIncognitoWindowActive) {
                const incognitoRules = [
                    {
                        id: 29999,
                        priority: 1,
                        action: { type: 'block' },
                        condition: {
                            urlFilter: '*://user.blocksite.co/*',
                            resourceTypes: ['main_frame'],
                            isUrlFilterCaseSensitive: false
                        }
                    },
                    {
                        id: 30000,
                        priority: 1,
                        action: { type: 'block' },
                        condition: {
                            urlFilter: '*://user.blocksite.co/options*',
                            resourceTypes: ['main_frame'],
                            isUrlFilterCaseSensitive: false
                        }
                    }
                ];

                chrome.declarativeNetRequest.updateDynamicRules({
                    addRules: incognitoRules,
                    removeRuleIds: [29999, 30000]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Failed to add incognito blocking rules:', chrome.runtime.lastError.message);
                    } else {
                        console.log('Incognito blocking rules added successfully');
                    }
                    resolve();
                });
            } else {
                chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: [29999, 30000]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Failed to remove incognito blocking rules:', chrome.runtime.lastError.message);
                    } else {
                        console.log('Incognito blocking rules removed successfully');
                    }
                    resolve();
                });
            }
        });
    });
};

// Extract hostname from URL
const getHostnameFromUrl = (url) => {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        return null;
    }
};

// Check if URL should be blocked (for immediate tab closure)
const isBlockedUrl = (url) => {
    if (!url) return false;
    
    // Check against regex patterns
    if (edgeRegex.test(url) || msedgeRegex.test(url)) {
        return true;
    }
    
    // Check against blockedSites array
    if (blockedSites.some(site => url.includes(site))) {
        return true;
    }

    // Check against hosts list from fetched files
    const hostname = getHostnameFromUrl(url);
    if (hostname) {
        if (hostsListForClosure.has(hostname)) {
            return true;
        }
        
        // TLD Checking implementation
        const lowerHostname = hostname.toLowerCase();
        if (blockedTLDs.some(tld => lowerHostname.endsWith(tld))) {
            return true;
        }
    }

    return false;
};

// === NEW: BraveFox System/Extensions page redirect helpers ===
const EXT_PROTOCOLS = ['chrome', 'edge', 'brave', 'opera', 'vivaldi'];

// Strategy: 'ttl' to tie bypass to 5-minute auth window, or 'window' for a tiny stabilization window
const EXT_BYPASS_STRATEGY = 'ttl'; // 'ttl' | 'window'

// One-shot stabilization window (used when EXT_BYPASS_STRATEGY === 'window')
const BYPASS_WINDOW_MS = 1500;

// 5-minute TTL for extension bypass when using 'ttl' strategy
const BYPASS_TTL_MS = 300000;

// Per-tab bypass map (tabId -> expiration timestamp)
const UNLOCK_BYPASS_TABS = new Map();

// NEW: Track the intercepted URL so we can seamlessly bounce them back after unlock
const ORIGINAL_URLS = new Map(); 

function isBypassed(tabId) {
  if (tabId == null) return false;
  const exp = UNLOCK_BYPASS_TABS.get(tabId);
  if (!exp) return false;
  const ok = Date.now() <= exp;
  if (!ok) {
    UNLOCK_BYPASS_TABS.delete(tabId);
  }
  return ok;
}

function grantBypass(tabId) {
  try {
    const duration = (EXT_BYPASS_STRATEGY === 'ttl') ? BYPASS_TTL_MS : BYPASS_WINDOW_MS;
    const expiresAt = Date.now() + duration;
    UNLOCK_BYPASS_TABS.set(tabId, expiresAt);
    // Safety cleanup
    const cleanupId = setTimeout(() => {
      UNLOCK_BYPASS_TABS.delete(tabId);
    }, duration + 1000);
    resourceTracker.addTimeout(cleanupId);
    console.log(`🔓 Granted ${EXT_BYPASS_STRATEGY} bypass for tab ${tabId} (${duration}ms)`);
  } catch (e) {
    console.warn('Failed to grant bypass:', e?.message || e);
  }
}

// NEW: Detect browser extensions OR Dev Console pages we want to protect via redirection
function isProtectedSystemPageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const lower = url.toLowerCase();
        
        // 1. Chrome extensions pages
        const isExt = EXT_PROTOCOLS.some(proto =>
            lower.startsWith(`${proto}://extensions`) ||
            lower.startsWith(`${proto}://settings/extensions`)
        );
        
        // 2. Chrome Web Store Developer Console
        const isDevConsole = lower.startsWith('https://chrome.google.com/webstore/devconsole') ||
                             lower.startsWith('https://chromewebstore.google.com/developer');
                             
        return isExt || isDevConsole;
    } catch {
        return false;
    }
}

// Get the internal protected page URL
function getProtectedPageUrl() {
    try {
        return chrome.runtime.getURL(EXT_PAGE);
    } catch {
        return EXT_PAGE;
    }
}

// Attempt to redirect a tab to the protected internal page and remember where they wanted to go
async function redirectToProtectedSystemPage(tabId, originalUrl) {
    const target = getProtectedPageUrl();
    try {
        // Record the URL so we can send them back there if they authenticate
        if (originalUrl) {
            ORIGINAL_URLS.set(tabId, originalUrl);
        }
        
        await chrome.tabs.update(tabId, { url: target });
        console.log(`🔐 Redirected tab ${tabId} to protected page: ${target}`);
        return true;
    } catch (e) {
        console.warn(`⚠️ Failed to redirect tab ${tabId} to protected page:`, e?.message || e);
        return false;
    }
}

// Scan all tabs and redirect any open system/settings pages
async function scanAndRedirectProtectedTabs() {
    try {
        const tabs = await chrome.tabs.query({});
        for (const t of tabs) {
            if (t && t.id != null && t.url && isProtectedSystemPageUrl(t.url) && !isBypassed(t.id)) {
                await redirectToProtectedSystemPage(t.id, t.url);
            }
        }
    } catch (e) {
        console.warn('Failed to scan and redirect protected tabs:', e?.message || e);
    }
}
// === END NEW HELPERS ===

// Enhanced tab closure with retry mechanism and better error handling
const closeBlockedTabImmediately = async (url, tabId, maxRetries = 3) => {
    console.log(`Attempting to close blocked tab ${tabId}: ${url}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Verify tab still exists before trying to close
            const tab = await chrome.tabs.get(tabId).catch(() => null);
            if (!tab) {
                console.log(`Tab ${tabId} no longer exists`);
                return true; // Consider this a success
            }
            
            // Check if tab is in a valid state for manipulation
            if (tab.status === 'unloaded') {
                console.log(`Tab ${tabId} is unloaded, skipping close attempt`);
                return false;
            }
            
            // Close the tab immediately
            await chrome.tabs.remove(tabId);
            console.log(`Successfully closed blocked tab ${tabId} on attempt ${attempt}`);

            // Clean up history after a short delay
            const historyTimeoutId = setTimeout(async () => {
                try {
                    await chrome.history.deleteUrl({ url: url });
                    console.log(`Deleted URL ${url} from history.`);
                } catch (historyError) {
                    console.warn(`Failed to delete URL ${url} from history:`, historyError);
                }
            }, 100);
            resourceTracker.addTimeout(historyTimeoutId);
            
            return true;
            
        } catch (error) {
            const errorMessage = error.message || '';
            
            if (errorMessage.includes("No tab with id")) {
                console.warn(`Tab ${tabId} was already closed or is invalid.`);
                return true; // Consider this a success
            } else if (errorMessage.includes("user may be dragging")) {
                console.warn(`Tab ${tabId} cannot be closed (attempt ${attempt}/${maxRetries}): user may be dragging`);
                
                if (attempt < maxRetries) {
                    // Wait with exponential backoff before retry
                    const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
                    console.log(`Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => {
                        const timeoutId = setTimeout(resolve, delay);
                        resourceTracker.addTimeout(timeoutId);
                    });
                    continue;
                } else {
                    console.error(`Failed to close tab ${tabId} after ${maxRetries} attempts: ${errorMessage}`);
                    // Try alternative approach - navigate to about:blank
                    try {
                        await chrome.tabs.update(tabId, { url: 'about:blank' });
                        console.log(`Mapsd tab ${tabId} to about:blank as fallback`);
                        return true;
                    } catch (navError) {
                        console.error(`Failed to navigate tab ${tabId} to about:blank:`, navError);
                        return false;
                    }
                }
            } else {
                console.error(`Error closing tab ${tabId} (attempt ${attempt}/${maxRetries}):`, error);
                if (attempt === maxRetries) {
                    return false;
                }
                // Wait before retry for other errors too
                await new Promise(resolve => {
                    const timeoutId = setTimeout(resolve, 50);
                    resourceTracker.addTimeout(timeoutId);
                });
            }
        }
    }
    
    return false;
};

// Enhanced event listener registration with error handling and cleanup tracking
const registerEventListeners = () => {
    try {
        // Listen for tab creation and immediately close/redirect if matched (BEFORE any loading starts)
        if (chrome.tabs.onCreated) {
            const onCreatedHandler = (tab) => {
                try {
                    // Redirect protected system pages immediately on tab creation
                    if (tab.url && isProtectedSystemPageUrl(tab.url)) {
                        if (isBypassed(tab.id)) {
                            return; // allow during bypass
                        }
                        redirectToProtectedSystemPage(tab.id, tab.url);
                        return; // nothing else to do for this tab
                    }

                    if (tab.url && isBlockedUrl(tab.url) && !closedTabs.has(tab.id)) {
                        closedTabs.add(tab.id);
                        console.log(`New tab created with blocked URL, closing immediately: ${tab.url}`);
                        closeBlockedTabImmediately(tab.url, tab.id);
                    }
                } catch (error) {
                    console.error('Error in onCreated listener:', error);
                }
            };
            chrome.tabs.onCreated.addListener(onCreatedHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.tabs.onCreated.removeListener(onCreatedHandler);
            });
        }

        // Listen for navigation events and close/redirect immediately (BEFORE loading starts)
        if (chrome.tabs.onUpdated) {
            const onUpdatedHandler = (tabId, changeInfo, tab) => {
                try {
                    // Redirect when a tab navigates to a protected system page
                    const urlIsProtected = changeInfo.url ? isProtectedSystemPageUrl(changeInfo.url) : (tab && tab.url && isProtectedSystemPageUrl(tab.url));
                    if (urlIsProtected) {
                        if (isBypassed(tabId)) {
                            return; // allow during bypass
                        }
                        const urlToProtect = changeInfo.url || (tab && tab.url);
                        redirectToProtectedSystemPage(tabId, urlToProtect);
                        return;
                    }

                    // Existing blocking logic
                    if (changeInfo.url && isBlockedUrl(changeInfo.url) && !closedTabs.has(tabId)) {
                        closedTabs.add(tabId);
                        console.log(`Tab navigation to blocked URL detected, closing immediately: ${changeInfo.url}`);
                        closeBlockedTabImmediately(changeInfo.url, tabId);
                    }
                    
                    // Handle incognito mode updates
                    if (changeInfo.status === 'loading') {
                        updateIncognitoBlockingRules();
                    }
                    
                    // Handle history cleanup
                    if (changeInfo.url && isBlockedUrl(changeInfo.url)) {
                        console.log(`Detected blocked site: ${changeInfo.url}, initiating cleanup...`);
                        cleanUpTabHistory(tabId, changeInfo.url);
                    }
                } catch (error) {
                    console.error('Error in onUpdated listener:', error);
                }
            };
            chrome.tabs.onUpdated.addListener(onUpdatedHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.tabs.onUpdated.removeListener(onUpdatedHandler);
            });
        }

        // Fallback: Listen for navigation start (webNavigation API for even earlier interception)
        if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
            const onBeforeNavigateHandler = (details) => {
                try {
                    if (details.frameId === 0) {
                        // Redirect earliest possible for protected system pages
                        if (isProtectedSystemPageUrl(details.url)) {
                            if (isBypassed(details.tabId)) {
                                return; // allow during bypass
                            }
                            redirectToProtectedSystemPage(details.tabId, details.url);
                            return;
                        }
                        // Existing block
                        if (isBlockedUrl(details.url) && !closedTabs.has(details.tabId)) {
                            closedTabs.add(details.tabId);
                            console.log(`WebNavigation: Blocking navigation before it starts: ${details.url}`);
                            closeBlockedTabImmediately(details.url, details.tabId);
                        }
                    }
                } catch (error) {
                    console.error('Error in onBeforeNavigate listener:', error);
                }
            };
            chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigateHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.webNavigation.onBeforeNavigate.removeListener(onBeforeNavigateHandler);
            });
        }

        // Also log completion; TTL bypass will expire on its own
        if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
            const onCompletedHandler = (details) => {
                try {
                    if (details.frameId === 0 && isProtectedSystemPageUrl(details.url)) {
                        console.log(`Protected page completed for tab ${details.tabId}. Bypass active: ${isBypassed(details.tabId)}`);
                    }
                } catch (error) {
                    console.error('Error in onCompleted listener:', error);
                }
            };
            chrome.webNavigation.onCompleted.addListener(onCompletedHandler);
            resourceTracker.addEventCleanup(() => {
                chrome.webNavigation.onCompleted.removeListener(onCompletedHandler);
            });
        }

        // Listen for window creation and removal to handle incognito mode
        if (chrome.windows.onCreated) {
            const onWindowCreatedHandler = () => {
                try {
                    updateIncognitoBlockingRules();
                    // also scan visible tabs for protected pages when a window is created
                    scanAndRedirectProtectedTabs();
                } catch (error) {
                    console.error('Error in window onCreated listener:', error);
                }
            };
            chrome.windows.onCreated.addListener(onWindowCreatedHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.windows.onCreated.removeListener(onWindowCreatedHandler);
            });
        }
        
        if (chrome.windows.onRemoved) {
            const onWindowRemovedHandler = () => {
                try {
                    updateIncognitoBlockingRules();
                } catch (error) {
                    console.error('Error in window onRemoved listener:', error);
                }
            };
            chrome.windows.onRemoved.addListener(onWindowRemovedHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.windows.onRemoved.removeListener(onWindowRemovedHandler);
            });
        }

        // Listen for tab removal to handle cleanup
        if (chrome.tabs.onRemoved) {
            const onTabRemovedHandler = (tabId, removeInfo) => {
                try {
                    if (closedTabs.has(tabId)) {
                        closedTabs.delete(tabId);
                        console.log(`Removed tab ${tabId} from closedTabs set.`);
                    }
                    // Clear any bypass and original URLs for closed tabs
                    if (UNLOCK_BYPASS_TABS.has(tabId)) UNLOCK_BYPASS_TABS.delete(tabId);
                    if (ORIGINAL_URLS.has(tabId)) ORIGINAL_URLS.delete(tabId);
                    
                    updateIncognitoBlockingRules();
                } catch (error) {
                    console.error('Error in onRemoved listener:', error);
                }
            };
            chrome.tabs.onRemoved.addListener(onTabRemovedHandler);
            
            // Track cleanup function
            resourceTracker.addEventCleanup(() => {
                chrome.tabs.onRemoved.removeListener(onTabRemovedHandler);
            });
        }
        
        console.log('Event listeners registered successfully');
    } catch (error) {
        console.error('Error registering event listeners:', error);
    }
};

// Function to clean up history and remove from session restore without closing the tab
const cleanUpTabHistory = async (tabId, url) => {
    try {
        console.log(`Attempting to clean history and remove session data for: ${url}`);

        // Use Map for better memory management instead of WeakMap for simple timeout tracking
        const cleanupTimeouts = new Map();

        // Delay to ensure session data registers (since history might take a moment to update)
        const timeoutId = setTimeout(async () => {
            try {
                await chrome.history.deleteUrl({ url });
                console.log(`History cleared for: ${url}`);
            } catch (error) {
                console.error("Error deleting history:", error);
            }

            // Log that session data is cleaned (no direct API to remove from "Recently Closed")
            console.log(`Cleaned session for: ${url}`);
            
            // Clean up timeout reference
            cleanupTimeouts.delete(url);

        }, 1500); // 1.5-second delay to ensure session entry exists

        cleanupTimeouts.set(url, timeoutId);
        resourceTracker.addTimeout(timeoutId);

    } catch (error) {
        console.error("Error cleaning up tab history:", error);
    }
};

// NEW: messaging to handle unlock + auto-routing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'BRAVEFOX_EXT_UNLOCK') {
      const tabId = sender?.tab?.id;
      if (tabId != null) {
        // Grant bypass according to strategy: 'ttl' ties to 5-min window, 'window' is short
        grantBypass(tabId);
        sendResponse?.({ ok: true, strategy: EXT_BYPASS_STRATEGY, ttlMs: (EXT_BYPASS_STRATEGY === 'ttl' ? BYPASS_TTL_MS : BYPASS_WINDOW_MS) });
      } else {
        sendResponse?.({ ok: false, error: 'No sender tab id' });
      }
      return true;
    }

    if (message.type === 'BRAVEFOX_GO_TO_EXTENSIONS') {
      const tabId = sender?.tab?.id;
      
      // SMART ROUTING: Go to the originally blocked URL if we have one, otherwise default to extensions page.
      const targetUrl = (tabId != null && ORIGINAL_URLS.has(tabId)) ? ORIGINAL_URLS.get(tabId) : 'chrome://extensions/';
      if (tabId != null) ORIGINAL_URLS.delete(tabId); // Cleanup
      
      (async () => {
        try {
          if (tabId != null) {
            await chrome.tabs.update(tabId, { url: targetUrl });
            sendResponse?.({ ok: true });
          } else {
            await chrome.tabs.create({ url: targetUrl, active: true });
            sendResponse?.({ ok: true, openedNew: true });
          }
        } catch (e1) {
          // Fallback: try opening a new tab if update fails
          try {
            await chrome.tabs.create({ url: targetUrl, active: true });
            // Optional: close original tab to avoid confusion
            if (tabId != null) {
              try { await chrome.tabs.remove(tabId); } catch {}
            }
            sendResponse?.({ ok: true, openedNew: true });
          } catch (e2) {
            sendResponse?.({ ok: false, error: e2?.message || String(e2) });
          }
        }
      })();
      return true; // keep the channel open for async response
    }
  } catch (e) {
    try { sendResponse?.({ ok: false, error: e?.message || String(e) }); } catch {}
    return true;
  }
});


// === BraveFox Anti-WebP background fetch bridge ===
// Google Images preview overlays live on google.* while the actual image may live on
// another CDN. Drawing that cross-origin image directly to canvas taints it, so the
// content script can ask the extension background to fetch the bytes with extension
// host permissions, return a data URL, and let the content script convert that to PNG.
const BRAVEFOX_ANTIWEBP_MAX_FETCH_BYTES = 18 * 1024 * 1024;

function bravefoxArrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function bravefoxIsHttpImageFetchUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (e) {
        return false;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'BRAVEFOX_ANTIWEBP_FETCH_IMAGE_AS_DATA_URL') return false;

    (async () => {
        try {
            const url = String(message.url || '').trim();
            if (!bravefoxIsHttpImageFetchUrl(url)) {
                sendResponse({ ok: false, error: 'Invalid image URL' });
                return;
            }

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store',
                redirect: 'follow',
                headers: {
                    'Accept': 'image/png,image/jpeg,image/gif,image/bmp,image/*;q=0.8,*/*;q=0.1'
                }
            });

            if (!response || !response.ok) {
                sendResponse({ ok: false, error: 'Fetch failed', status: response ? response.status : 0 });
                return;
            }

            const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!/^image\//i.test(contentType)) {
                sendResponse({ ok: false, error: 'Response was not an image', contentType });
                return;
            }

            // Preserve GIF/SVG instead of flattening/rewriting them.
            if (/^image\/(?:gif|svg\+xml)$/i.test(contentType)) {
                sendResponse({ ok: false, error: 'Skipped animated/vector image', contentType });
                return;
            }

            const buffer = await response.arrayBuffer();
            if (!buffer || buffer.byteLength <= 0) {
                sendResponse({ ok: false, error: 'Empty image response', contentType });
                return;
            }
            if (buffer.byteLength > BRAVEFOX_ANTIWEBP_MAX_FETCH_BYTES) {
                sendResponse({ ok: false, error: 'Image too large', size: buffer.byteLength, contentType });
                return;
            }

            const base64 = bravefoxArrayBufferToBase64(buffer);
            sendResponse({
                ok: true,
                contentType,
                size: buffer.byteLength,
                dataUrl: `data:${contentType || 'image/png'};base64,${base64}`
            });
        } catch (e) {
            sendResponse({ ok: false, error: e && (e.message || String(e)) });
        }
    })();

    return true;
});

// Enhanced startup detection for force-installed extensions
const onStartupHandler = () => {
    console.log('Extension startup detected');
    startKeepAlive();
};
chrome.runtime.onStartup.addListener(onStartupHandler);

// Track cleanup
resourceTracker.addEventCleanup(() => {
    chrome.runtime.onStartup.removeListener(onStartupHandler);
});

// Run the update once on install and explicitly wipe the session so bootManager forces fetch
const onInstalledHandler = async (details) => {
    console.log('Extension installed/updated:', details.reason);
    startKeepAlive();
    
    if ((details.reason === 'install' || details.reason === 'update') && chrome.storage.session) {
        await chrome.storage.session.clear();
    }
};
chrome.runtime.onInstalled.addListener(onInstalledHandler);

// Track cleanup
resourceTracker.addEventCleanup(() => {
    chrome.runtime.onInstalled.removeListener(onInstalledHandler);
});

// Register event listeners
registerEventListeners();

// ===================================================================================
// === THE CHROME STORAGE LISTENER TRIPWIRE ===
// ===================================================================================
if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.hostsList) {
            __hostsCache = Array.isArray(changes.hostsList.newValue) ? changes.hostsList.newValue : [];
            __hostsCacheCount = __hostsCache.length;
            console.log(`📌 Hosts cache updated from storage.onChanged: ${__hostsCacheCount} entries`);
        }
        if (changes.lastUpdated && typeof changes.lastUpdated.newValue === 'number') {
            __hostsCacheLastUpdated = changes.lastUpdated.newValue;
        }

        // Detects ?force_refresh=true from wrestling.js
        if (changes.wrestling_women_urls && changes.wrestling_women_urls.newValue === undefined) {
            console.log('🚨 Background detected manual wrestling cache wipe! Fetching fresh roster instantly...');
            updateWrestlingRoster();
        }
    });
}

// ===================================================================================
// === WRESTLING DYNAMIC BACKGROUND FETCHER (THE GENDER-TAG SLICER V27) ===
// ===================================================================================
const WRESTLING_CACHE_TIME_KEY = 'wrestling_women_urls_time';
const WRESTLING_CACHE_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

const wrestlingManualBans = [
    '/wrestlers/lainey-reid', '/wrestlers/kellyanne', '/wrestlers/kellyanne-english',
    '/wrestlers/nikita-naridian', '/wrestlers/riho', '/wrestlers/thekla',
    '/wrestlers/dani-sekelsky', '/wrestlers/kelly-kelly', '/wrestlers/alba-fyre', 
    '/roster/wwe2k26/alundra-blayze', '/wrestlers/roxxi', '/wrestlers/zelina-vega', 
    '/wrestlers/rosita', '/wrestlers/lita', '/wrestlers/chyna', '/wrestlers/maryse', 
    '/wrestlers/aksana', '/wrestlers/kaitlyn', '/wrestlers/layla', '/wrestlers/tamina', 
    '/wrestlers/melina', '/wrestlers/jacqueline', '/wrestlers/odb', '/wrestlers/asya', 
    '/wrestlers/debra', '/wrestlers/lana', '/wrestlers/sable', '/wrestlers/tori', 
    '/wrestlers/carmella', '/wrestlers/raquel', '/wrestlers/kamille', '/wrestlers/maxine', 
    '/wrestlers/cherry', '/wrestlers/sarita', '/wrestlers/shaniqua', '/wrestlers/francine', 
    '/wrestlers/trinity', '/wrestlers/ivy-nile', '/wrestlers/aj-lee', '/wrestlers/mia-yim', 
    '/wrestlers/gail-kim', '/wrestlers/eve-torres', '/wrestlers/dawn-marie', '/wrestlers/joy-giovanni', 
    '/wrestlers/cora-jade', '/wrestlers/taya-valkyrie', '/wrestlers/brie-bella', '/wrestlers/su-yung'
];

const wrestlingDoNotBroadcast = [
    '/wrestlers/melina', '/wrestlers/melina-perez', '/wrestlers/aj-lee',
    '/wrestlers/aj', '/wrestlers/becky-lynch', '/wrestlers/becky', '/wrestlers/katarina'
];

async function updateWrestlingRoster() {
    try {
        const localApi = (typeof browser !== 'undefined' && browser.storage) ? browser.storage.local : chrome.storage.local;
        
        const data = await new Promise(resolve => {
            if (typeof browser !== 'undefined') {
                localApi.get([WRESTLING_CACHE_TIME_KEY, 'wrestling_women_urls', 'v27_chrome_bump']).then(resolve);
            } else {
                localApi.get([WRESTLING_CACHE_TIME_KEY, 'wrestling_women_urls', 'v27_chrome_bump'], resolve);
            }
        });

        const now = Date.now();
        const lastFetch = data[WRESTLING_CACHE_TIME_KEY] || 0;

        // V27 BUMP: Force-clear John Cena and the men globally!
        if (!data.v27_chrome_bump) {
            console.log('Force-clearing polluted cache via V27 bump...');
            await new Promise(resolve => {
                if (typeof browser !== 'undefined') {
                    localApi.remove([WRESTLING_CACHE_TIME_KEY, 'wrestling_women_urls']).then(resolve);
                } else {
                    localApi.remove([WRESTLING_CACHE_TIME_KEY, 'wrestling_women_urls'], resolve);
                }
            });
            await new Promise(resolve => {
                if (typeof browser !== 'undefined') {
                    localApi.set({ 'v27_chrome_bump': true }).then(resolve);
                } else {
                    localApi.set({ 'v27_chrome_bump': true }, resolve);
                }
            });
        } 
        else if (data.wrestling_women_urls && data.wrestling_women_urls.length > 0 && (now - lastFetch < WRESTLING_CACHE_LIFETIME_MS)) {
            console.log('Wrestling roster cache is fresh. Skipping background fetch.');
            return;
        }

        console.log('Fetching massive Roster pages using strict Gender-Tag Slicer...');
        
        const pagesToFetch = [
            'https://www.thesmackdownhotel.com/roster/?promotion=wwe&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=aew&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=tna&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=njpw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=wcw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=ecw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=aaa&date=all-time#women',  
            'https://www.thesmackdownhotel.com/roster/?promotion=roh&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=awa&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=nwa&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=lucha-underground&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=ovw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=ajpw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=noah&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=cmll&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=mlw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/?promotion=czw&date=all-time#women',
            'https://www.thesmackdownhotel.com/roster/hall-of-fame/#women'
        ];

        let combinedUrls = [...wrestlingManualBans];
        if (data.wrestling_women_urls) {
            combinedUrls = [...combinedUrls, ...data.wrestling_women_urls];
        }

        for (const url of pagesToFetch) {
            try {
                const cleanUrl = url.split('#')[0];
                const response = await fetch(cleanUrl, {
                    credentials: 'omit', 
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                    }
                });
                
                if (!response.ok) continue;
                const html = await response.text();

                // === THE GENDER-TAG SLICER ===
                const femaleChunks = html.split('gender-female');
                for (let i = 1; i < femaleChunks.length; i++) {
                    const chunk = femaleChunks[i];
                    const isolatedBox = chunk.substring(0, 1500);
                    
                    const match = /href="(\/wrestlers\/[^"]+)"/i.exec(isolatedBox);
                    if (match) {
                        try {
                            combinedUrls.push(new URL(match[1], 'https://www.thesmackdownhotel.com').pathname);
                        } catch(e) {
                            combinedUrls.push(match[1]);
                        }
                    }
                }
                
                // Fallback for Video Game / Specific Roster pages
                const panelChunks = html.split(/id=["']?(?:rlta-panel-women|rlta-women|roster-women)["']?/i);
                for (let i = 1; i < panelChunks.length; i++) {
                    let chunk = panelChunks[i];
                    let endIdx = chunk.search(/id=["']?(?:rlta|ja-sidebar|<footer)/i);
                    if (endIdx !== -1) chunk = chunk.substring(0, endIdx);
                    
                    const regex = /href="(\/wrestlers\/[^"]+)"/gi;
                    let match;
                    while ((match = regex.exec(chunk)) !== null) {
                        try {
                            combinedUrls.push(new URL(match[1], 'https://www.thesmackdownhotel.com').pathname);
                        } catch(e) {
                            combinedUrls.push(match[1]);
                        }
                    }
                }
            } catch(e) {}
            
            await new Promise(resolve => {
                const tid = setTimeout(resolve, 800);
                if (typeof resourceTracker !== 'undefined' && resourceTracker.addTimeout) {
                    resourceTracker.addTimeout(tid);
                }
            });
        }

        combinedUrls = [...new Set(combinedUrls)];

        const safeUrls = combinedUrls.filter(url => {
            const slug = url.toLowerCase();
            return !wrestlingDoNotBroadcast.some(blocked => slug.includes(blocked));
        });

        await new Promise(resolve => {
            const payload = {
                'wrestling_women_urls': safeUrls,
                [WRESTLING_CACHE_TIME_KEY]: now
            };
            if (typeof browser !== 'undefined') {
                localApi.set(payload).then(resolve);
            } else {
                localApi.set(payload, resolve);
            }
        });

        console.log(`✅ Background wrestling roster update complete: ${safeUrls.length} strictly female names cached.`);

    } catch (e) {
        console.error('Wrestling background fetch error:', e);
    }
}
// ===================================================================================

// Set up hourly updates with memory optimization and tracking
const hourlyUpdateId = setInterval(() => {
    console.log('Running scheduled update...');
    
    // Check memory pressure before running heavy operations
    if (resourceTracker.checkMemoryPressure()) {
        console.warn('⚠️ High memory usage detected, performing cleanup before update...');
        // Clean up caches before heavy operation
        hostsCache.cleanup();
        tryGarbageCollection();
    }
    
    updateBlocklist();
    updateWrestlingRoster();
    
    // Cleanup interval to prevent memory leaks - more aggressive cleanup
    if (closedTabs.size > 50) {  // Reduced threshold
        console.log('Cleaning up closedTabs set');
        closedTabs.clear();
    }
    tryGarbageCollection();
}, 1 * 60 * 60 * 1000); // Update every hour
resourceTracker.addInterval(hourlyUpdateId);

// Enhanced cleanup interval for memory management - more frequent and comprehensive
const memoryCleanupId = setInterval(() => {
    // Clean up closedTabs set if it grows too large - more frequent cleanup
    if (closedTabs.size > 25) { // Reduced threshold
        console.log('Cleaning up closedTabs set');
        closedTabs.clear();
    }

    // Clean up hostsCache
    hostsCache.cleanup();

    // Check memory pressure and perform GC if needed
    const memoryMB = resourceTracker.getMemoryUsage();
    if (memoryMB > 100) { // 100MB threshold
        console.log(`🧹 Memory cleanup triggered at ${memoryMB}MB`);
        tryGarbageCollection();
        
        if (memoryMB > 125) { // 125MB critical threshold
            console.warn(`🚨 Critical memory usage: ${memoryMB}MB - forcing aggressive cleanup`);
            hostsCache.clear();
            closedTabs.clear();
            tryGarbageCollection();
        }
    }
}, 2 * 60 * 1000); // Every 2 minutes (more frequent)
resourceTracker.addInterval(memoryCleanupId);

// Suppress specific error
try {
    // Your service worker registration logic
} catch (e) {
    if (e.message && e.message.includes("Status code: 10")) {
        console.warn("Shit, son. Yet another error code 10! This bastard can be safely ignored.");
    } else {
        console.error("Yeah, fuck this. Yet another registration error! Error code:", e);
    }
}

// Enhanced cleanup on extension shutdown/suspend
const handleExtensionSuspend = () => {
    console.log('🧹 Extension suspending - performing complete cleanup...');
    resourceTracker.cleanup();
};

// Listen for extension suspend events
if (chrome.runtime.onSuspend) {
    chrome.runtime.onSuspend.addListener(handleExtensionSuspend);
}

if (chrome.runtime.onSuspendCanceled) {
    chrome.runtime.onSuspendCanceled.addListener(() => {
        console.log('Extension suspend canceled - restarting keep-alive');
        startKeepAlive();
    });
}

// === SMART BOOT MANAGER ===
const bootManager = async () => {
    try {
        if (chrome.storage.session) {
            const sessionState = await chrome.storage.session.get(['is_sw_awake']);
            
            if (!sessionState.is_sw_awake) {
                console.log('🔄 Extension Manually Reloaded or Cold Started!');
                console.log('🧹 Wiping local cache to force a totally fresh network fetch...');
                
                await chrome.storage.session.set({ is_sw_awake: true });
                
                const keysToRemove = [
                    'hostsChunks', 'hostsTotal', 'lastUpdate', 
                    'wrestling_women_urls_time', 'wrestling_women_urls', 'v27_chrome_bump'
                ];
                for (let i = 0; i < 100; i++) keysToRemove.push(`hostsChunk_${i}`);
                
                await new Promise(resolve => chrome.storage.local.remove(keysToRemove, resolve));
                
                await initializeExtension();
            } else {
                console.log('💤 Service Worker woke up. Loading from local memory (skipping network spam)...');
                
                const cachedHosts = await getAllHostsList();
                if (cachedHosts.length > 0) {
                    hostsListForClosure = new Set(cachedHosts);
                    console.log(`Loaded ${hostsListForClosure.size} hosts for immediate blocking.`);
                } else {
                    await updateBlocklist();
                }
                
                await updateIncognitoBlockingRules();
                updateWrestlingRoster();
                await scanAndRedirectProtectedTabs();
            }
        } else {
            await initializeExtension();
        }
    } catch (error) {
        console.error("Boot manager error:", error);
        await initializeExtension();
    }
};

bootManager();
})();


// ---------------------------------------------------------------------------
// BraveFox BlockSite tab-control bridge
// ---------------------------------------------------------------------------
// Content scripts cannot reliably close normal browser tabs with window.close(),
// and they cannot navigate to chrome://newtab/. Do those privileged operations
// from the background instead. The preferred destination is Chrome's real New Tab
// page; about:blank is only the last-ditch fallback if Chrome rejects everything.
(() => {
  const NEW_TAB_URL = 'chrome://newtab/';
  const SAFE_BLANK_URL = 'about:blank';

  function getSenderTabId(sender) {
    try {
      const id = sender && sender.tab && sender.tab.id;
      return (typeof id === 'number') ? id : null;
    } catch (_) {
      return null;
    }
  }

  async function deleteHistoryUrl(url) {
    try {
      const value = String(url || '').trim();
      if (!value || !/^https?:\/\/user\.blocksite\.co\//i.test(value)) return;
      await chrome.history.deleteUrl({ url: value });
    } catch (_) {}
  }

  async function sendTabToNewTab(tabId, senderTab) {
    // Best case: replace the blocked page in the same tab with Chrome's New Tab page.
    try {
      await chrome.tabs.update(tabId, { url: NEW_TAB_URL, active: true });
      return { ok: true, newtab: true, method: 'update' };
    } catch (updateError) {
      // Some Chromium builds are picky about chrome:// pages through update(). In that
      // case, create a real new tab, then remove the blocked tab. Creating without a URL
      // opens the browser's configured New Tab page.
      try {
        const createOptions = { active: true };
        if (senderTab && typeof senderTab.windowId === 'number') createOptions.windowId = senderTab.windowId;
        if (senderTab && typeof senderTab.index === 'number') createOptions.index = senderTab.index;
        const created = await chrome.tabs.create(createOptions);
        try { await chrome.tabs.remove(tabId); } catch (_) {}
        return { ok: true, newtab: true, method: 'create-remove', createdTabId: created && created.id, updateError: (updateError && updateError.message) || String(updateError) };
      } catch (createError) {
        // Absolute emergency fallback. This should be rare, but avoids leaving the
        // BlockSite page visible if New Tab handling fails.
        try {
          await chrome.tabs.update(tabId, { url: SAFE_BLANK_URL, active: true });
          return { ok: true, blanked: true, method: 'about-blank', updateError: (updateError && updateError.message) || String(updateError), createError: (createError && createError.message) || String(createError) };
        } catch (blankError) {
          return { ok: false, error: (blankError && blankError.message) || String(blankError), updateError: (updateError && updateError.message) || String(updateError), createError: (createError && createError.message) || String(createError) };
        }
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    if (message.type === 'BRAVEFOX_CLEAN_BLOCKSITE_HISTORY') {
      (async () => {
        try {
          await deleteHistoryUrl(message.currentUrl);
          try { await deleteHistoryUrl(sender && sender.tab && sender.tab.url); } catch (_) {}
          sendResponse && sendResponse({ ok: true });
        } catch (e) {
          sendResponse && sendResponse({ ok: false, error: (e && e.message) || String(e) });
        }
      })();
      return true;
    }

    if (message.type === 'BRAVEFOX_GO_SAFE_HOME') {
      (async () => {
        const tabId = getSenderTabId(sender);
        if (tabId == null) {
          sendResponse && sendResponse({ ok: false, error: 'missing-sender-tab' });
          return;
        }

        try {
          const result = await sendTabToNewTab(tabId, sender && sender.tab);
          sendResponse && sendResponse(result);
        } catch (e) {
          sendResponse && sendResponse({ ok: false, error: (e && e.message) || String(e) });
        }
      })();
      return true;
    }

    if (message.type === 'BRAVEFOX_CLOSE_BLOCKSITE_PAGE') {
      (async () => {
        const tabId = getSenderTabId(sender);
        if (tabId == null) {
          sendResponse && sendResponse({ ok: false, error: 'missing-sender-tab' });
          return;
        }

        try { await deleteHistoryUrl(sender && sender.tab && sender.tab.url); } catch (_) {}

        try {
          const result = await sendTabToNewTab(tabId, sender && sender.tab);
          sendResponse && sendResponse(result);
        } catch (e) {
          sendResponse && sendResponse({ ok: false, error: (e && e.message) || String(e) });
        }
      })();
      return true;
    }

    return false;
  });
})();

// ---------------------------------------------------------------------------
// BraveFox Redirect Logger bridge
// ---------------------------------------------------------------------------
// Content scripts send only blocked Google redirects and BlockSite blocked-page hits here.
// The background forwards those entries to the optional native messaging host, which
// appends them to D:\Haukiraumojen Tiedostot\Tiedostoja\Scripts\Logs\BraveFoxRedirect.log.
(() => {
  const HOST_NAME = 'com.bravefox.redirect_logger';
  const LOG_TYPE = 'BRAVEFOX_REDIRECT_LOG';
  const GOOGLE_QUERY_CONTEXT_TYPE = 'BRAVEFOX_GOOGLE_QUERY_CONTEXT';
  const GET_GOOGLE_QUERY_CONTEXT_TYPE = 'BRAVEFOX_GET_LAST_GOOGLE_QUERY_CONTEXT';

  const recentGoogleQueryByTab = new Map();
  let recentGlobalGoogleQuery = null;
  const GOOGLE_QUERY_MAX_AGE_MS = 2 * 60 * 1000;

  function cleanShortText(value, maxLength = 1000) {
    return (value == null) ? '' : String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function parseGoogleSearchQueryFromUrl(inputUrl) {
    try {
      const url = new URL(String(inputUrl || ''));
      const host = (url.hostname || '').toLowerCase();
      if (!/^([a-z0-9-]+\.)?google\./i.test(host) && !/\.google\./i.test(host)) return '';
      const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('search') || '';
      return cleanShortText(q, 1000);
    } catch (_) {
      return '';
    }
  }

  function normalizeForCompare(value) {
    return cleanShortText(value, 1000).toLowerCase();
  }

  function rememberGoogleQueryContext(tabId, inputUrl, attemptedSearch, source) {
    try {
      const query = cleanShortText(attemptedSearch || parseGoogleSearchQueryFromUrl(inputUrl), 1000);
      if (!query) return null;

      const context = {
        query,
        pageUrl: cleanShortText(inputUrl || '', 1000),
        source: cleanShortText(source || 'google', 80),
        timestamp: Date.now()
      };

      if (typeof tabId === 'number' && tabId >= 0) {
        recentGoogleQueryByTab.set(tabId, context);
      }
      recentGlobalGoogleQuery = context;
      pruneOldGoogleQueryContexts();
      return context;
    } catch (_) {
      return null;
    }
  }

  function pruneOldGoogleQueryContexts() {
    try {
      const now = Date.now();
      for (const [tabId, context] of recentGoogleQueryByTab.entries()) {
        if (!context || now - (context.timestamp || 0) > GOOGLE_QUERY_MAX_AGE_MS) {
          recentGoogleQueryByTab.delete(tabId);
        }
      }
      if (recentGlobalGoogleQuery && now - (recentGlobalGoogleQuery.timestamp || 0) > GOOGLE_QUERY_MAX_AGE_MS) {
        recentGlobalGoogleQuery = null;
      }
    } catch (_) {}
  }

  function isGoogleQueryCandidateUseful(context, blockedWord) {
    try {
      if (!context || !context.query) return false;
      if (Date.now() - (context.timestamp || 0) > GOOGLE_QUERY_MAX_AGE_MS) return false;

      const term = normalizeForCompare(blockedWord);
      if (!term) return true;

      const query = normalizeForCompare(context.query);
      if (!query) return false;
      return query.includes(term);
    } catch (_) {
      return false;
    }
  }

  function getBestRecentGoogleQueryContext(sender, blockedWord) {
    pruneOldGoogleQueryContexts();

    try {
      const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : -1;
      const byTab = recentGoogleQueryByTab.get(tabId);
      if (isGoogleQueryCandidateUseful(byTab, blockedWord)) return byTab;
    } catch (_) {}

    if (isGoogleQueryCandidateUseful(recentGlobalGoogleQuery, blockedWord)) return recentGlobalGoogleQuery;
    return null;
  }

  function highlightSearchForPlainLog(value, trigger) {
    const text = cleanShortText(value, 1000);
    const term = cleanShortText(trigger, 240);
    if (!text || !term) return text;

    try {
      const alreadyMarked = new RegExp('\\*' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*', 'i');
      if (alreadyMarked.test(text)) return text;

      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      let hit = false;
      const highlighted = text.replace(re, (match) => {
        hit = true;
        return '*' + match + '*';
      });
      return hit ? highlighted : text;
    } catch (_) {
      return text;
    }
  }

  try {
    if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
      chrome.webNavigation.onBeforeNavigate.addListener((details) => {
        try {
          if (!details || details.frameId !== 0) return;
          const query = parseGoogleSearchQueryFromUrl(details.url);
          if (query) rememberGoogleQueryContext(details.tabId, details.url, query, 'webNavigation');
        } catch (_) {}
      });
    }
  } catch (_) {}

  try {
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        try {
          const url = (changeInfo && changeInfo.url) || (tab && tab.url) || '';
          const query = parseGoogleSearchQueryFromUrl(url);
          if (query) rememberGoogleQueryContext(tabId, url, query, 'tabs.onUpdated');
        } catch (_) {}
      });
    }
  } catch (_) {}

  function sanitizeLogPayload(payload) {
    const out = {};
    const fields = ['source', 'blockedWord', 'attemptedSearch', 'context', 'pageUrl', 'referrer', 'timestamp'];
    for (const key of fields) {
      const value = payload && payload[key];
      out[key] = (value == null) ? '' : String(value).slice(0, 1000);
    }
    out.type = LOG_TYPE;
    return out;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === GOOGLE_QUERY_CONTEXT_TYPE) {
      try {
        const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : -1;
        const context = rememberGoogleQueryContext(tabId, message.pageUrl || (sender && sender.tab && sender.tab.url) || '', message.attemptedSearch || message.query || '', 'content-script');
        sendResponse && sendResponse({ ok: !!context });
      } catch (_) {
        sendResponse && sendResponse({ ok: false });
      }
      return;
    }

    if (message.type === GET_GOOGLE_QUERY_CONTEXT_TYPE) {
      try {
        const blockedWord = message.blockedWord || '';
        const context = getBestRecentGoogleQueryContext(sender, blockedWord);
        sendResponse && sendResponse({
          ok: !!context,
          attemptedSearch: context ? context.query : '',
          query: context ? context.query : '',
          pageUrl: context ? context.pageUrl : '',
          source: context ? context.source : '',
          ageMs: context ? (Date.now() - (context.timestamp || 0)) : 0
        });
      } catch (_) {
        sendResponse && sendResponse({ ok: false, attemptedSearch: '', query: '' });
      }
      return;
    }

    if (message.type !== LOG_TYPE) return;

    const payload = sanitizeLogPayload(message);
    try {
      if (sender && sender.tab && sender.tab.url && !payload.pageUrl) payload.pageUrl = String(sender.tab.url).slice(0, 1000);
    } catch (_) {}

    try {
      const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : -1;
      if (payload.attemptedSearch) {
        rememberGoogleQueryContext(tabId, payload.pageUrl || (sender && sender.tab && sender.tab.url) || '', payload.attemptedSearch, 'redirect-log');
      }
      payload.attemptedSearch = highlightSearchForPlainLog(payload.attemptedSearch, payload.blockedWord);
    } catch (_) {}

    try {
      chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          // Silent by design. If the native logger is not installed, blocking still works.
          try { console.warn('[BraveFox Redirect Logger] Native host unavailable:', lastError.message); } catch (_) {}
          sendResponse && sendResponse({ ok: false, error: lastError.message || 'native-host-unavailable' });
          return;
        }
        sendResponse && sendResponse(response || { ok: true });
      });
      return true;
    } catch (e) {
      try { console.warn('[BraveFox Redirect Logger] Failed to send native log:', e); } catch (_) {}
      sendResponse && sendResponse({ ok: false, error: String(e && e.message || e) });
      return false;
    }
  });
})();
