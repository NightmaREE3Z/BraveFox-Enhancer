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

    // Ucey Coder React Bypass: Forces the Virtual DOM to recognize input changes (BULLETPROOFED)
    function setNativeValue(element, value) {
        if (!element) return;
        try {
            let prototype = Object.getPrototypeOf(element);
            let prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
            
            // Walk up the prototype chain if we don't find it immediately
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

    // Smart Waiter: Waits for an element to appear in the DOM
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

            // Ucey Fix: Using documentElement to prevent 'Node' errors before body loads
            observer.observe(document.documentElement, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`BraveFox: Timeout waiting for ${selector}`));
            }, timeout);
        });
    }

    // Smart Waiter: Waits for an element to be completely removed from the DOM
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

            // Ucey Fix: Using documentElement
            observer.observe(document.documentElement, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`BraveFox: Timeout waiting for ${selector} to close`));
            }, timeout);
        });
    }

    // Smart Waiter: Hyper-specific observer to snipe the React dropdown item
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

            // Ucey Fix: Using documentElement
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
        text.innerHTML = messageHtml.replace(/\*\*(.*?)\*\*/g, '<b style="color: #dc2626; font-size: 18px;">$1</b>');

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
                    
                    // Re-query input dynamically to prevent clicking an undefined React ghost node
                    let activeInput = document.querySelector('[data-automation="add-items-search-input"]');
                    if (!activeInput) {
                        activeInput = await waitForElement('[data-automation="add-items-search-input"]', 3000);
                    }

                    // Ucey Fix: Replaced standard setter with native React Bypass
                    setNativeValue(activeInput, word);

                    let listItem = await waitForDropdownItem(word, 2000);

                    // Safely click the dropdown if it appears
                    if (listItem && typeof listItem.click === 'function') {
                        listItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        listItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        try { listItem.click(); } catch(e) {}
                    }

                    // Always send native Enter events as fallback
                    if (activeInput) {
                        try {
                            activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            await sleep(50);
                            activeInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            
                            // UCEY FIX: Force React to commit the input state! 
                            activeInput.dispatchEvent(new Event('blur', { bubbles: true }));
                        } catch(e) {}
                    }

                    console.log(`BraveFox: Injected -> ${word}`);
                    await sleep(1500); 
                }

                // Step 5: Save the batch safely
                // UCEY FIX: Give BlockSite's Redux state a moment to serialize the payload before we click save!
                console.log('BraveFox: Batch injected. Waiting for React to serialize...');
                await sleep(1000);

                const doneBtn = document.querySelector('[data-automation="add-items-done-btn"]');
                if (doneBtn && typeof doneBtn.click === 'function') {
                    doneBtn.click();
                } else {
                    console.error('BraveFox: Could not find TEHTY button! Firing Escape key backup.');
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
                }

                // Step 6: Smart transition
                console.log('BraveFox: Waiting for modal to close...');
                await waitForElementToDisappear('[data-automation="add-items-search-input"]');
                
                // UCEY FIX: Give their Background Script/API time to sync the payload to their cloud!
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
        const addBtn = document.querySelector('[data-automation="add-items-button"]');
        if (!addBtn) return;

        const existingGroup = document.getElementById('bravefox-control-center');
        if (existingGroup && document.body.contains(existingGroup)) return;

        console.log('BraveFox: Building Central UI Command Center...');

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
        batchSelect.innerHTML = `
            <option value="4">Small (4)</option>
            <option value="7">Medium (7)</option>
            <option value="10">Large (10) </option>
        `;
        batchSelect.value = currentBatchSize.toString(); 
        batchSelect.onchange = (e) => {
            currentBatchSize = parseInt(e.target.value, 10);
            console.log(`BraveFox: Batch size dynamically set to ${currentBatchSize}`);
        };

        const impLinks = document.createElement('div');
        impLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161; position: relative;';
        impLinks.innerHTML = `<div>Import Links</div>`;
        impLinks.onclick = () => {
            const nativeImp = document.querySelector('[data-automation="import-file-input"]');
            if (nativeImp && typeof nativeImp.click === 'function') nativeImp.click();
            else alert('BraveFox: Native Link Import input not found in DOM!');
        };

        const expLinks = document.createElement('div');
        expLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161;';
        expLinks.textContent = 'Export Links';
        expLinks.onclick = () => {
            const nativeExp = document.querySelector('[data-automation="export-button"]');
            if (nativeExp && typeof nativeExp.click === 'function') nativeExp.click();
            else alert('BraveFox: Native Link Export button not found in DOM!');
        };

        const impTerms = document.createElement('div');
        impTerms.style.cssText = btnStyle + 'color: #16a34a; border-color: #16a34a; position: relative;';
        impTerms.innerHTML = `
            <div>Import Terms</div>
            <input type="file" accept=".txt,.csv" style="position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;">
        `;
        const fileInput = impTerms.querySelector('input');
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

        const addItemsWrapper = addBtn.closest('.add-items-btn-wrapper');
        if (addItemsWrapper && addItemsWrapper.parentElement) {
            const parentFlex = addItemsWrapper.parentElement;
            parentFlex.style.display = 'flex';
            parentFlex.style.alignItems = 'center';
            parentFlex.appendChild(btnGroup);
        }
    }

    const domObserver = new MutationObserver(() => {
        injectControlCenter();
    });

    domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(injectControlCenter, 500);

})();