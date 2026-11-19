// BraveFox Enhancer - BlockSite Word Import/Export Assembly Line & UI Control Center

(function() {
    'use strict';

    console.log('BraveFox: Word Import/Export Assembly Line initialized.');

    // Global variable to track the currently selected batch size.
    let currentBatchSize = 4;
    
    // Global flag to temporarily disable trashcan interceptor when running automated batch deletes
    let skipIntercept = false;

    // --- HELPER UTILITIES ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Query strings such as ?source=...&groupId=... are page state, not a different route.
    // Match the Block Sites page by origin + pathname so every query/hash variation works.
    function isBlockSitesRoute(urlValue = window.location.href) {
        try {
            const url = new URL(urlValue, window.location.origin);
            const hostMatches = url.hostname.toLowerCase() === 'user.blocksite.co';
            const normalizedPath = url.pathname.replace(/\/+$/, '').toUpperCase();
            return hostMatches && (
                normalizedPath === '/OPTIONS/BLOCK_SITES' ||
                normalizedPath.startsWith('/OPTIONS/BLOCK_SITES/')
            );
        } catch (error) {
            return false;
        }
    }

    let lastKnownRouteUrl = window.location.href;
    let reinjectTimer = null;

    function scheduleControlCenterInjection(delay = 0) {
        if (reinjectTimer) clearTimeout(reinjectTimer);
        reinjectTimer = setTimeout(() => {
            reinjectTimer = null;
            injectControlCenter();
        }, delay);
    }

    // Ucey Coder React Bypass: Forces the Virtual DOM to recognize input changes
    function setNativeValue(element, value) {
        if (!element) return;
        try {
            let prototype = Object.getPrototypeOf(element);
            let prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
            
            while (!prototypeValueSetter && prototype !== null) {
                prototype = Object.getPrototypeOf(prototype);
                if (prototype) {
                    prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
                }
            }

            if (prototypeValueSetter) {
                prototypeValueSetter.call(element, value);
            } else {
                element.value = value;
            }
            
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (error) {
            console.warn("BraveFox: Native setter failed, trying fallback.", error);
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`BraveFox: Timeout waiting for ${selector}`));
            }, timeout);
        });
    }

    async function waitForElementToDisappear(selector, timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (!document.querySelector(selector)) {
                return resolve();
            }

            const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) {
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`BraveFox: Timeout waiting for ${selector} to close`));
            }, timeout);
        });
    }

    async function waitForDropdownItem(word, timeout = 3000) {
        return new Promise((resolve) => {
            const exactSelector = `[data-automation="item-${word}"]`;
            
            if (document.querySelector(exactSelector)) {
                return resolve(document.querySelector(exactSelector));
            }

            const checkText = () => {
                const allItemTexts = document.querySelectorAll('[data-automation="item"]');
                for (let el of allItemTexts) {
                    if (el.textContent && el.textContent.trim().toLowerCase() === word.toLowerCase()) {
                        return el.closest('[data-automation^="item-"]');
                    }
                }
                return null;
            };

            let found = checkText();
            if (found) return resolve(found);

            const observer = new MutationObserver(() => {
                let el = document.querySelector(exactSelector) || checkText();
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // --- BRAVEFOX CUSTOM UI MODAL ---
    function showBraveFoxConfirm(messageHtml, onYesCallback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2147483647; 
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #fff; padding: 24px 32px; border-radius: 12px; width: 400px; 
            max-width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center;
        `;

        const text = document.createElement('div');
        text.style.cssText = `font-size: 16px; color: #333; margin-bottom: 24px; line-height: 1.5;`;
        const messageParts = String(messageHtml || '').split(/(\*\*.*?\*\*)/g);
        for (const part of messageParts) {
            if (!part) continue;
            if (part.startsWith('**') && part.endsWith('**')) {
                const strong = document.createElement('strong');
                strong.textContent = part.slice(2, -2);
                strong.style.cssText = 'color: #dc2626; font-size: 18px;';
                text.appendChild(strong);
            } else {
                text.appendChild(document.createTextNode(part));
            }
        }

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `display: flex; justify-content: center; gap: 16px;`;

        const btnStyle = `padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; border: none; transition: opacity 0.2s;`;

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Cancel';
        btnCancel.style.cssText = btnStyle + `background: #e5e7eb; color: #374151;`;
        btnCancel.onmouseover = () => btnCancel.style.opacity = '0.8';
        btnCancel.onmouseout = () => btnCancel.style.opacity = '1';

        const btnYes = document.createElement('button');
        btnYes.textContent = 'Yes, Delete';
        btnYes.style.cssText = btnStyle + `background: #dc2626; color: #ffffff;`;
        btnYes.onmouseover = () => btnYes.style.opacity = '0.8';
        btnYes.onmouseout = () => btnYes.style.opacity = '1';

        btnCancel.onclick = () => document.body.removeChild(overlay);
        btnYes.onclick = () => {
            document.body.removeChild(overlay);
            if (onYesCallback) onYesCallback();
        };

        btnContainer.appendChild(btnCancel);
        btnContainer.appendChild(btnYes);
        box.appendChild(text);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // --- DOM SCRAPERS FOR INTERCEPTOR ---
    function getTermFromTrashBtn(btn) {
        let current = btn.parentElement;
        let attempts = 0;
        while (current && attempts < 6) {
            const termEl = current.querySelector('[data-automation="item"]');
            if (termEl) return termEl.textContent.trim();
            current = current.parentElement;
            attempts++;
        }
        return "this item";
    }

    function isWordItem(element) {
        let current = element.parentElement;
        let attempts = 0;
        
        while (current && attempts < 6) {
            const descEl = current.querySelector('[data-automation="item-description"]');
            if (descEl) {
                const desc = descEl.textContent.trim().toLowerCase();
                if (desc.includes('avainsana') || desc.includes('keyword') || desc.includes('word')) return true;
                if (desc.includes('verkkosivusto') || desc.includes('website') || desc.includes('link')) return false;
            }
            current = current.parentElement;
            attempts++;
        }
        
        current = element.parentElement;
        attempts = 0;
        while (current && attempts < 6) {
            const textEl = current.querySelector('[data-automation="item"]');
            if (textEl) {
                const text = textEl.textContent.trim();
                const isUrl = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/.*)?$/.test(text);
                return !isUrl;
            }
            current = current.parentElement;
            attempts++;
        }
        
        return false;
    }

    // --- GLOBAL TRASHCAN INTERCEPTOR ---
    document.addEventListener('click', (e) => {
        if (skipIntercept) return; 

        const trashBtn = e.target.closest('[data-automation="item-icon"]');
        if (trashBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const termName = getTermFromTrashBtn(trashBtn);

            showBraveFoxConfirm(`Are you sure you want to delete **${termName}**?`, () => {
                skipIntercept = true;
                
                if (trashBtn && typeof trashBtn.click === 'function') {
                    trashBtn.click();
                }
                
                setTimeout(() => { skipIntercept = false; }, 100);
            });
        }
    }, true); 

    // --- THE EXPORT HEIST (STRICT TERMS ONLY) ---
    function exportWords() {
        console.log('BraveFox: Initiating Strictly-Terms Word Export...');
        const wordElements = document.querySelectorAll('[data-automation="item"]');
        
        if (wordElements.length === 0) {
            alert('BraveFox: No items found on screen to export!');
            return;
        }

        let wordsList = [];
        wordElements.forEach(el => {
            if (isWordItem(el)) {
                if (el.textContent && el.textContent.trim() !== '') {
                    wordsList.push(el.textContent.trim());
                }
            }
        });

        if (wordsList.length === 0) {
            alert('BraveFox: No pure "Terms" or "Keywords" found in the list! (URLs are successfully ignored)');
            return;
        }

        const blob = new Blob([wordsList.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BraveFox-Blocksite-Terms.csv';
        document.body.appendChild(a);
        
        if (typeof a.click === 'function') a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        
        console.log(`BraveFox: Successfully exported ${wordsList.length} pure terms.`);
    }

    // --- BATCH REMOVAL UTILITY ---
    function batchRemoveWords() {
        let initialTrashCans = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);

        if (initialTrashCans.length === 0) {
            alert('BraveFox: No words found on screen to remove!');
            return;
        }

        showBraveFoxConfirm(`Are you sure you want to batch remove all **${initialTrashCans.length}** words?`, async () => {
            console.log(`BraveFox: Commencing tactical nuke of ${initialTrashCans.length} words...`);
            
            skipIntercept = true; 
            let remaining = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);
            
            while (remaining.length > 0) {
                let btn = remaining[0];
                let termName = getTermFromTrashBtn(btn);
                console.log(`BraveFox: Nuking -> ${termName}`);

                if (btn && typeof btn.click === 'function') btn.click();
                
                let waitLoops = 0;
                while (document.contains(btn) && waitLoops < 20) {
                    await sleep(50);
                    waitLoops++;
                }

                await sleep(500); 
                remaining = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);
            }
            
            skipIntercept = false; 
            console.log('BraveFox: Batch removal sequence complete.');
        });
    }

    // --- THE BATCH PROCESSOR (ASSEMBLY LINE) ---
    async function processInBatches(words, batchSize = 4) {
        let currentIndex = 0;

        while (currentIndex < words.length) {
            const currentBatch = words.slice(currentIndex, currentIndex + batchSize);
            console.log(`\nBraveFox: Starting batch ${currentIndex + 1} to ${currentIndex + currentBatch.length} of ${words.length}...`);

            try {
                // Step 1: Open the modal safely
                const addItemsBtn = await waitForElement('[data-automation="add-items-button"]');
                console.log('BraveFox: Opening modal...');
                if (addItemsBtn && typeof addItemsBtn.click === 'function') {
                    addItemsBtn.click();
                }

                // Step 2: Wait for search input
                let targetInput = await waitForElement('[data-automation="add-items-search-input"]');

                // Step 3: Find and click the "Avainsanat" (Keywords) tab instantly
                const tabs = document.querySelectorAll('button[data-automation="tab"]');
                for (let tab of tabs) {
                    const txt = tab.textContent.trim().toLowerCase();
                    if (txt.includes('avainsana') || txt.includes('keyword')) {
                        if (typeof tab.click === 'function') tab.click();
                        console.log('BraveFox: Switched to Keywords tab.');
                        
                        // Give React time to destroy the website input and mount the keyword input
                        await sleep(600); 
                        break;
                    }
                }

                // Step 4: Inject words for this specific batch
                for (let i = 0; i < currentBatch.length; i++) {
                    const word = currentBatch[i];
                    
                    let activeInput = document.querySelector('[data-automation="add-items-search-input"]');
                    if (!activeInput) {
                        activeInput = await waitForElement('[data-automation="add-items-search-input"]', 3000);
                    }

                    setNativeValue(activeInput, word);

                    let listItem = await waitForDropdownItem(word, 2000);

                    if (listItem && typeof listItem.click === 'function') {
                        listItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        listItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        try { listItem.click(); } catch(e) {}
                    }

                    if (activeInput) {
                        try {
                            activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            await sleep(50);
                            activeInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            activeInput.dispatchEvent(new Event('blur', { bubbles: true }));
                        } catch(e) {}
                    }

                    console.log(`BraveFox: Injected -> ${word}`);
                    await sleep(1500); 
                }

                // Step 5: Save the batch safely (UPGRADED)
                console.log('BraveFox: Batch injected. Waiting for React to serialize...');
                await sleep(1000);

                const doneBtn = document.querySelector('[data-automation="add-items-done-btn"]');
                if (doneBtn) {
                    console.log('BraveFox: Smashing the Tehty button...');
                    // Full synthetic human interaction to bypass React's event trap
                    doneBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    doneBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    try { doneBtn.click(); } catch(e) {}
                } else {
                    console.warn('BraveFox: Could not find TEHTY button!');
                }

                // Step 6: Smart transition (UPGRADED)
                console.log('BraveFox: Waiting for modal to close...');
                
                // Wait up to 3 seconds naturally
                let closed = false;
                for (let w = 0; w < 6; w++) {
                    if (!document.querySelector('[data-automation="add-items-search-input"]')) {
                        closed = true;
                        break;
                    }
                    await sleep(500);
                }

                // If React is being stubborn and left it open, forcefully smash the Escape key
                if (!closed) {
                    console.warn('BraveFox: Modal hung up! Smashing Escape key backup...');
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
                    await sleep(1000); // Wait for the animation to die
                }

                // Final check before moving on to prevent the timeout crash
                if (document.querySelector('[data-automation="add-items-search-input"]')) {
                    throw new Error("BraveFox: Modal absolutely refused to close. UI might be completely frozen.");
                }
                
                console.log('BraveFox: Waiting for BlockSite background sync API...');
                await sleep(2500); 

                await waitForElement('[data-automation="add-items-button"]');
                
                currentIndex += batchSize;

            } catch (error) {
                console.error('BraveFox: Batch process error:', error);
                alert('BraveFox: The assembly line hit a snag. Check the console.');
                return;
            }
        }

        alert(`BraveFox: Assembly line finished! Successfully imported all ${words.length} terms.`);
    }

    // --- THE FILE HANDLER ---
    async function handleFileUpload(file) {
        if (!file) return;

        const text = await file.text();
        let words = text.split(/[\r\n,]+/).map(w => w.replace(/^"|"$/g, '').trim()).filter(w => w.length > 0);
        words = [...new Set(words)]; 

        if (words.length === 0) {
            alert('BraveFox: The file was empty or unreadable!');
            return;
        }

        console.log(`BraveFox: Preparing to batch import ${words.length} terms using a batch size of ${currentBatchSize}...`);
        processInBatches(words, currentBatchSize);
    }

    // --- THE COMMAND CENTER INJECTOR ---
    function injectControlCenter() {
        const existingGroup = document.getElementById('bravefox-control-center');

        // Keep the script dormant outside /options/BLOCK_SITES and clean up stale SPA UI.
        if (!isBlockSitesRoute()) {
            if (existingGroup && existingGroup.isConnected) existingGroup.remove();
            return;
        }

        const addBtn = document.querySelector('[data-automation="add-items-button"]');
        if (!addBtn || !addBtn.isConnected) return;

        // BlockSite remounts this toolbar when query parameters/group state change.
        // Work out the current live insertion point every time instead of trusting the old one.
        const addItemsWrapper = addBtn.closest('.add-items-btn-wrapper') || addBtn.parentElement;
        const parentFlex = (addItemsWrapper && addItemsWrapper.parentElement) || addBtn.parentElement;
        if (!parentFlex) return;

        if (existingGroup && existingGroup.isConnected) {
            if (existingGroup.parentElement !== parentFlex) parentFlex.appendChild(existingGroup);
            return;
        }

        console.log(`BraveFox: Building Central UI Command Center for ${window.location.pathname}${window.location.search}`);

        if (!document.getElementById('bravefox-styles')) {
            const style = document.createElement('style');
            style.id = 'bravefox-styles';
            style.textContent = `
                [data-automation="export-button"],
                [data-automation="import-button"] {
                    display: none !important;
                }
                [data-automation="item-icon"] * {
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        const btnGroup = document.createElement('div');
        btnGroup.id = 'bravefox-control-center';
        btnGroup.style.cssText = 'display: flex; gap: 12px; margin-left: 20px; align-items: center;';

        const btnStyle = 'padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; border: 2px solid; display: flex; align-items: center; justify-content: center; background: transparent; transition: opacity 0.2s;';

        const batchSelect = document.createElement('select');
        batchSelect.style.cssText = btnStyle + 'background: transparent; color: #333; cursor: pointer; border-color: #ccc; appearance: auto; padding-right: 10px; margin-right: 4px;';
        for (const [value, label] of [['4', 'Small (4)'], ['7', 'Medium (7)'], ['10', 'Large (10)']]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            batchSelect.appendChild(option);
        }
        batchSelect.value = currentBatchSize.toString(); 
        batchSelect.onchange = (e) => {
            currentBatchSize = parseInt(e.target.value, 10);
            console.log(`BraveFox: Batch size dynamically set to ${currentBatchSize}`);
        };

        const impLinks = document.createElement('div');
        impLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161; position: relative;';
        impLinks.textContent = 'Import Links';
        impLinks.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nativeImp = document.querySelector(
                '[data-automation="import-file-input"], input[type="file"][data-automation*="import"]'
            );
            if (nativeImp && typeof nativeImp.click === 'function') nativeImp.click();
            else alert('BraveFox: Native Link Import input not found in DOM!');
        };

        const expLinks = document.createElement('div');
        expLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161;';
        expLinks.textContent = 'Export Links';
        expLinks.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nativeExp = document.querySelector(
                '[data-automation="export-button"], button[data-automation*="export"]'
            );
            if (nativeExp && typeof nativeExp.click === 'function') nativeExp.click();
            else alert('BraveFox: Native Link Export button not found in DOM!');
        };

        const impTerms = document.createElement('div');
        impTerms.style.cssText = btnStyle + 'color: #16a34a; border-color: #16a34a; position: relative;';
        const impTermsLabel = document.createElement('div');
        impTermsLabel.textContent = 'Import Terms';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.csv';
        fileInput.style.cssText = 'position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;';
        impTerms.appendChild(impTermsLabel);
        impTerms.appendChild(fileInput);
        fileInput.addEventListener('click', e => { e.stopPropagation(); e.stopImmediatePropagation(); });
        fileInput.addEventListener('mousedown', e => { e.stopPropagation(); e.stopImmediatePropagation(); });
        fileInput.addEventListener('change', (e) => {
            e.stopPropagation();
            if (e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
                e.target.value = ''; 
            }
        });

        const expTerms = document.createElement('div');
        expTerms.style.cssText = btnStyle + 'color: #2563eb; border-color: #2563eb;';
        expTerms.textContent = 'Export Terms';
        expTerms.onclick = exportWords;

        const batchRemove = document.createElement('div');
        batchRemove.style.cssText = btnStyle + 'color: #dc2626; border-color: #dc2626; margin-left: 12px;';
        batchRemove.textContent = 'Batch Remove';
        batchRemove.onclick = batchRemoveWords;

        btnGroup.appendChild(batchSelect);
        btnGroup.appendChild(impLinks);
        btnGroup.appendChild(expLinks);
        btnGroup.appendChild(impTerms);
        btnGroup.appendChild(expTerms);
        btnGroup.appendChild(batchRemove);

        parentFlex.style.display = 'flex';
        parentFlex.style.alignItems = 'center';
        parentFlex.appendChild(btnGroup);
    }

    // React can replace the toolbar without performing a traditional page load.
    // A throttled observer catches remounts without rebuilding the controls repeatedly.
    const domObserver = new MutationObserver(() => {
        scheduleControlCenterInjection(25);
    });

    domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    function handleRouteChange() {
        const currentUrl = window.location.href;
        if (currentUrl === lastKnownRouteUrl) {
            scheduleControlCenterInjection(25);
            return;
        }

        lastKnownRouteUrl = currentUrl;
        console.log(`BraveFox: BlockSite route changed to ${currentUrl}`);

        // Let React finish the immediate route update, then retry through its common remount window.
        scheduleControlCenterInjection(0);
        setTimeout(injectControlCenter, 100);
        setTimeout(injectControlCenter, 350);
        setTimeout(injectControlCenter, 1000);
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
        const result = originalPushState.apply(this, arguments);
        handleRouteChange();
        return result;
    };

    history.replaceState = function() {
        const result = originalReplaceState.apply(this, arguments);
        handleRouteChange();
        return result;
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    // Backup polling covers BlockSite builds that mutate location or UI in unusual ways.
    setInterval(() => {
        if (window.location.href !== lastKnownRouteUrl) handleRouteChange();
        else injectControlCenter();
    }, 500);

    injectControlCenter();

})();
