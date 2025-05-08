const timestamp = new Date()
    .toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
    .replace('.', ':');
console.log(`[${timestamp}] BraveFox Enhancer ${chrome.runtime.getManifest().version} initialized!`);


// Initialize the set to track redirected tabs
const redirectedTabs = new Set();
const blockedSites = ["microsoft365.com"];

// Function to fetch and parse hosts file
const fetchHostsFile = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const hosts = text.split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => {
                const parts = line.split(/\s+/);
                return parts.length > 1 ? parts[1] : null;
            })
            .filter(Boolean);
        console.log(`Fetched ${hosts.length} hosts from ${url}`);
        return hosts;
    } catch (error) {
        console.error('Failed to fetch the hosts file:', error);
        return [];
    }
};

// Store the fetched hosts list in local storage
const storeHostsList = (list) => {
    chrome.storage.local.set({ hostsList: list }, () => {
        console.log("Hosts list has been stored.");
    });
};

// Function to update the blocklist
const updateBlocklist = async () => {
    console.log("Fetching hosts list...");
    const urls = [
        "https://gist.githubusercontent.com/NightmaREE3Z/2ba1f0f59633ae221214595ede2b590a/raw/f58fbbf5f6adf2e66867fbbcfd639adfffb1d339/PersonalHostz",
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling-porn/hosts"
    ];

    const hostsLists = await Promise.all(urls.map(url => fetchHostsFile(url)));
    const allHosts = hostsLists.flat();

    const uniqueHostsList = Array.from(new Set(allHosts));
    console.log(`Unique hosts list has ${uniqueHostsList.length} hosts`);

    const maxRules = 29998; // Keeping 2 slots for incognito block rules
    const limitedHostsList = uniqueHostsList.slice(0, maxRules);

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: maxRules }, (_, i) => i + 1),
        addRules: limitedHostsList.map((host, index) => ({
            id: index + 1,
            priority: 1,
            action: { type: 'block' },
            condition: { urlFilter: `*://${host}/*`, resourceTypes: ['main_frame'] }
        }))
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Failed to update dynamic rules:', chrome.runtime.lastError.message);
        } else {
            console.log('Dynamic rules updated successfully');
        }
    });

    if (limitedHostsList.length) {
        storeHostsList(limitedHostsList);
        console.log("Blocklist has been updated.");
    }
};

// Function to handle incognito blocking rules
const updateIncognitoBlockingRules = async () => {
    const windows = await chrome.windows.getAll({});
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
        });
    }
};

// Redirect blocked sites to incognito mode if not already in incognito
const redirectToIncognito = async (url, tabId) => {
    console.log(`Attempting to redirect tab ${tabId} to incognito: ${url}`);
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || tab.incognito) {
            console.log(`Tab ${tabId} is already in incognito mode or no longer exists, skipping redirection.`);
            return;
        }

        // Close the regular tab before creating the incognito window to avoid history saving
        await chrome.tabs.remove(tabId);
        console.log(`Closed original tab ${tabId} to prevent history entry.`);

        try {
            // Delete URL from history (if applicable)
            await chrome.history.deleteUrl({ url: url });
            console.log(`Deleted URL ${url} from history.`);
        } catch (historyError) {
            console.warn(`Failed to delete URL ${url} from history:`, historyError);
        }

        // Create the incognito window
        await chrome.windows.create({
            url: url,
            incognito: true
        });
        console.log("Incognito window created for URL:", url);
    } catch (error) {
        if (error.message && error.message.includes("No tab with id")) {
            console.warn(`Tab ${tabId} was already closed or is invalid.`);
        } else {
            console.error(`Failed to redirect tab ${tabId} to incognito:`, error);
        }
    }
};

// Function to clean up history and remove from session restore without closing the tab
const cleanUpTabHistory = async (tabId, url) => {
    try {
        console.log(`Attempting to clean history and remove session data for: ${url}`);

        // Delay to ensure session data registers (since history might take a moment to update)
        setTimeout(async () => {
            try {
                await chrome.history.deleteUrl({ url });
                console.log(`History cleared for: ${url}`);
            } catch (error) {
                console.error("Error deleting history:", error);
            }

            // Log that session data is cleaned (no direct API to remove from "Recently Closed")
            console.log(`Cleaned session for: ${url}`);

        }, 1500); // 1.5-second delay to ensure session entry exists

    } catch (error) {
        console.error("Error cleaning up tab history:", error);
    }
};

// Listen for navigation and block history
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        if (blockedSites.some(site => changeInfo.url.includes(site))) {
            console.log(`Detected blocked site: ${changeInfo.url}, initiating cleanup...`);
            cleanUpTabHistory(tabId, changeInfo.url);
        }
    }
});

// Listen for navigation events to blocked sites and redirect to incognito mode
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && blockedSites.some(site => changeInfo.url.includes(site)) && !redirectedTabs.has(tabId)) {
        // Add tabId to the set to prevent repeated redirection
        redirectedTabs.add(tabId);
        console.log(`Redirecting tab ${tabId} to incognito: ${changeInfo.url}`);
        redirectToIncognito(changeInfo.url, tabId);
    }
});

// Run the update once on install
chrome.runtime.onInstalled.addListener(() => {
    updateBlocklist();
    updateIncognitoBlockingRules();
});

// Listen for window creation and removal to handle incognito mode
chrome.windows.onCreated.addListener(updateIncognitoBlockingRules);
chrome.windows.onRemoved.addListener(updateIncognitoBlockingRules);

// Set up hourly updates
setInterval(updateBlocklist, 1 * 60 * 60 * 1000); // Update every hour

// Listen for tab updates to handle incognito mode
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        updateIncognitoBlockingRules();
    }
});

// Listen for tab removal to handle incognito mode
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (redirectedTabs.has(tabId)) {
        redirectedTabs.delete(tabId);
        console.log(`Removed tab ${tabId} from redirectedTabs set.`);
    }
    updateIncognitoBlockingRules();
});

// Suppress specific error
try {
    // Your service worker registration logic
} catch (e) {
    if (e.message && e.message.includes("Status code: 10")) {
        console.warn("Shit, son. Yet another error code 10! This bastard can be safely ignored.");
    } else {
        console.error("Unexpected error during service worker registration:", e);
    }
}