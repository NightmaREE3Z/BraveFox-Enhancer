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

            observer.observe(document.body, { childList: true, subtree: true });

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

            observer.observe(document.body, { childList: true, subtree: true });

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

            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // --- BRAVEFOX CUSTOM UI MODAL ---
    function showBraveFoxConfirm(messageHtml, onYesCallback) {
        const overlay = document.createElement('div');
        // Z-Index pushed to absolute maximum to ensure it appears above BlockSite's React App
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

    function isWordItem(btn) {
        let current = btn.parentElement;
        let attempts = 0;
        while (current && attempts < 6) {
            const descEl = current.querySelector('[data-automation="item-description"]');
            if (descEl && descEl.textContent.trim().toLowerCase() === 'avainsana') return true;
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
            // Hijack the click immediately
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const termName = getTermFromTrashBtn(trashBtn);

            showBraveFoxConfirm(`Are you sure you want to delete **${termName}**?`, () => {
                // Drop shields and manually force the click so React accepts it
                skipIntercept = true;
                
                trashBtn.click();
                
                // Keep shields down just long enough for React's event loop
                setTimeout(() => { skipIntercept = false; }, 100);
            });
        }
    }, true); 

    // --- THE EXPORT HEIST ---
    function exportWords() {
        console.log('BraveFox: Initiating Word Export...');
        const wordElements = document.querySelectorAll('[data-automation="item"]');
        
        if (wordElements.length === 0) {
            alert('BraveFox: No blocked terms found on screen to export!');
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

        const blob = new Blob([wordsList.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BraveFox-Blocksite-Terms.csv';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        
        console.log(`BraveFox: Successfully exported ${wordsList.length} terms.`);
    }

    // --- BATCH REMOVAL UTILITY (REWRITTEN FOR REACT STABILITY) ---
    function batchRemoveWords() {
        // Initial check to see how many words exist
        let initialTrashCans = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);

        if (initialTrashCans.length === 0) {
            alert('BraveFox: No words found on screen to remove!');
            return;
        }

        showBraveFoxConfirm(`Are you sure you want to batch remove all **${initialTrashCans.length}** words?`, async () => {
            console.log(`BraveFox: Commencing tactical nuke of ${initialTrashCans.length} words...`);
            
            skipIntercept = true; // Drop interceptor shields 
            
            // Re-query dynamically to avoid "Ghost Nodes"
            let remaining = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);
            
            while (remaining.length > 0) {
                let btn = remaining[0];
                let termName = getTermFromTrashBtn(btn);
                console.log(`BraveFox: Nuking -> ${termName}`);

                // Click the button
                btn.click();
                
                // Wait for React to physically detach the button from the page before continuing
                let waitLoops = 0;
                while (document.contains(btn) && waitLoops < 20) {
                    await sleep(50);
                    waitLoops++;
                }

                // Wait your requested 500ms delay to keep the Extension/React from crashing
                await sleep(500); 

                // Re-scan the DOM for the next live target
                remaining = Array.from(document.querySelectorAll('[data-automation="item-icon"]')).filter(isWordItem);
            }
            
            skipIntercept = false; // Shields up
            console.log('BraveFox: Batch removal sequence complete.');
        });
    }

    // --- THE BATCH PROCESSOR (ASSEMBLY LINE) ---
    async function processInBatches(words, batchSize = 4) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        let currentIndex = 0;

        while (currentIndex < words.length) {
            const currentBatch = words.slice(currentIndex, currentIndex + batchSize);
            console.log(`\nBraveFox: Starting batch ${currentIndex + 1} to ${currentIndex + currentBatch.length} of ${words.length}...`);

            try {
                // Step 1: Open the modal
                const addItemsBtn = await waitForElement('[data-automation="add-items-button"]');
                console.log('BraveFox: Opening modal...');
                addItemsBtn.click();

                // Step 2: Wait for search input
                const targetInput = await waitForElement('[data-automation="add-items-search-input"]');

                // Step 3: Find and click the "Avainsanat" (Keywords) tab instantly
                const tabs = document.querySelectorAll('button[data-automation="tab"]');
                for (let tab of tabs) {
                    if (tab.textContent.trim().toLowerCase().includes('avainsanat') || tab.textContent.trim().toLowerCase().includes('keyword')) {
                        tab.click();
                        console.log('BraveFox: Switched to Keywords tab.');
                        break;
                    }
                }

                // Step 4: Inject words for this specific batch
                for (let i = 0; i < currentBatch.length; i++) {
                    const word = currentBatch[i];
                    
                    nativeInputValueSetter.call(targetInput, word);
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));

                    let listItem = await waitForDropdownItem(word);

                    if (listItem) {
                        listItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        listItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        listItem.click();
                    }

                    targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                    targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

                    console.log(`BraveFox: Injected -> ${word}`);

                    await sleep(1500); 
                }

                // Step 5: Save the batch
                console.log('BraveFox: Batch injected. Saving...');
                const doneBtn = document.querySelector('[data-automation="add-items-done-btn"]');
                if (doneBtn) {
                    doneBtn.click();
                } else {
                    console.error('BraveFox: Could not find TEHTY button!');
                    alert('BraveFox: Fatal Error. Could not find the save button. Stopping script.');
                    return;
                }

                // Step 6: Smart transition
                console.log('BraveFox: Waiting for modal to close...');
                await waitForElementToDisappear('[data-automation="add-items-search-input"]');
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

        // 1. Hide the native bottom buttons and FIX pointer events on trashcans
        if (!document.getElementById('bravefox-styles')) {
            const style = document.createElement('style');
            style.id = 'bravefox-styles';
            style.textContent = `
                [data-automation="export-button"],
                [data-automation="import-button"] {
                    display: none !important;
                }
                /* FORCE-FIELD FIX: Ensures clicks hit the wrapper, not the inner image */
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

        // Menu E: Dynamic Batch Size Selector
        const batchSelect = document.createElement('select');
        batchSelect.style.cssText = btnStyle + 'background: transparent; color: #333; cursor: pointer; border-color: #ccc; appearance: auto; padding-right: 10px; margin-right: 4px;';
        batchSelect.innerHTML = `
            <option value="4">Small (4)</option>
            <option value="7">Medium (7)</option>
            <option value="10">Large (10) </option>
        `;
        batchSelect.value = currentBatchSize.toString(); 
        batchSelect.onchange = (e) => {
            currentBatchSize = parseInt(e.target.value, 10); // Fixed Math Base!
            console.log(`BraveFox: Batch size dynamically set to ${currentBatchSize}`);
        };

        const impLinks = document.createElement('div');
        impLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161; position: relative;';
        impLinks.innerHTML = `<div>Import Links</div>`;
        impLinks.onclick = () => {
            const nativeImp = document.querySelector('[data-automation="import-file-input"]');
            if (nativeImp) nativeImp.click();
            else alert('BraveFox: Native Link Import input not found in DOM!');
        };

        const expLinks = document.createElement('div');
        expLinks.style.cssText = btnStyle + 'color: #616161; border-color: #616161;';
        expLinks.textContent = 'Export Links';
        expLinks.onclick = () => {
            const nativeExp = document.querySelector('[data-automation="export-button"]');
            if (nativeExp) nativeExp.click();
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