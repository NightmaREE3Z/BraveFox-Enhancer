// ==UserScript==
// @name         BloggerProfileRedirect
// @version      1.7
// @description  Redirects Blogger profile URLs to google.com and removes specific images and their descriptions.
// @match        *://*.blogger.com/profile/*
// @match        *://www.blogger.com/profile/*
// @match        *://www.blogger.com/*
// @match        *://draft.blogger.com/profile/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const currentURL = window.location.href;

    // Function to check if the URL matches a Blogger profile or specific blog post
    const shouldRedirect = (url) => {
        return url.includes('blogger.com/profile/') || url.includes('draft.blogger.com/profile/') || url.includes('2013/05/') || url.includes('perttas') || url.includes('jiujau') || url.includes('ira-amanda') || url.includes('irpp4')
               url.includes('irpp4.blogspot.com/2013/06/kesakesakesa-2013.html');
    };

    // Function to redirect to google.com
    const redirect = () => {
        console.log('Redirecting Blogger profile or specific post to google.com.');
        location.replace('https://www.google.com'); // Redirect to google.com
    };

    // Early return if the current URL should be redirected
    if (shouldRedirect(currentURL)) {
        redirect(); // Call the redirect function
        return; // Ensure no further code is executed
    }

    // List of image URLs to delete
    const imageUrlsToDelete = [
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiW-sTv8md6XYcxw0AIZ_YWqeEcYOl5nxFvPqTVKihwIFBeJ6IiQzV-Cu065I5NpFuj4e98TGVZc_2a8vL2f_hocEKPwrvzpI-3jR-hS0ET5ajNeH1dqoPJBiC2sRwfVBoyw-1zoygfPdP0/s400/IMG_0473.JPG',
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhibphayeR8s3mGvC2nOErPe9nP0otTSyoN3o9vIwupxGck0Hg3PDZZLFnw7xCu4mxkyNv6ZOk2czsIHpnyMrayi4YqYqRdvYyXS1sXBZE6-WYuVl42zlGtursrR3iZm2cD4xaNaW32XeCm/s400/IMG_0489.JPG',
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhYilJQIoC6naFJcb75XSMd5VR2AnC2SFdP8rap7y0iwUHLrlY0AhC4PXCCoj_5KMpGx4a3DHecAEdKca6hVaBz4Ry5N_0VdNiQg6iq6XiMwjcKSWv_NVUGaInxE5MSkQTiwp2XzXSU0Us0/s400/IMG_0492.JPG',
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEik5NPIssvydMIwzADpMO49Gq74sIYVSYni_miOsEghN7sHm2y5bkQKti_1MRzkYwr2gJyLMoDfkl6AGnbmLU6B1P12xtNtMV93uKPU0L7tQi12zkUevupxTzlns-fdAx45Pynt9Cora2HX/s400/irppajapirppa.jpg',
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiqIr-PNbY05Erj_mhI7EJ1twQYpF6ZsoCOGmsJQ215NY040rrjt8ZK0epJ8ao4oFC0GxNTtwNNk2fq9_3a_0dULq5V2XyewLmo8GuVlLAkwbhKaof2DaJmlB4PSvQqyP-6RTJQKxAQHVik/s400/IMG_0407.JPG',
        'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiQ1BvTuqBVGWOn7-zXTaAoFKuelMx4_xgEyjjI1JhhMaIQZcmxcM4jvv7Qn7PgTDd47cUwYe5tfKMQ64e0SszyDth9jesiHAhkzaR5I1L-gWe9U5eUlLW66IAt5eJXpI1Mk2TH9sHJz_gQ/s400/IMG_0423.JPG',
        'data.whicdn.com/images/63270511/large.jpg',
        'data.whicdn.com/images/63274050/large.jpg',
        'data.whicdn.com/images/63225603/large.jpg',
        'data.whicdn.com/images/63273926/large.jpg',
        'data.whicdn.com/images/63273666/large.jpg',
        'data.whicdn.com/images/63273639/large.jpg',
        'data.whicdn.com/images/63273520/large.jpg',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_uHLpFg8oqTPEHoE45lHln67f6U9WqSnfBUP63dC1U5NbmTkxQVMpF_KI1lzf6mmBy38IArmgq_-lVRbhQweXO3_39Z8bAwYNwC58sjO0vUwuB8tQ=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_ukev5UgziTr0_L-khqKxZ8NJAKdOQGslqS73IznhLSnvsbmHe5l9WX3kPllnpUGpe_Pi2gmmVGzYh5PkxYWxsA86M9s5IWi4u7FJwI5kgZbuEmMg=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_ulqwHD1_0EWk9vSaaWD-l1_anUm5Klk21AVHDqWPgrsZJmCmg5zOnP162KYcWd4nD5xg7H298DZJlqpAcHf0O4zbnYExOtNNrreZ7ddE2Qs249lg=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_tWoJQnVa6vg6Avfo1A_0shIGN8uFW21-DNdXwnxe9Q-kCpB2SP-HLnKy2JB6kxKZcpd5uMLmhrA-vIII5_YKsohDBVUcjJm5WlaXbEhvhOx51Qng=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_sUAG1pKa6OSp15aiSeHMqfa3jYWzLZzayK_NJ0WAHRhW2QDCP2z79Lo-HpwjuQFIvmOrEh_01-VoDNDmSLyZazbLc3mylvhc6iXv7oXZwu7IvLrw=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_uVZLtv8Unsc3VMFzi824erX9qZiNbr7lwKzw56NjyaW4veN_rgX2LPNm4iPHASnF0k2wpu4nc7JE5Ke6Ms8dOuZoqjBwvun7120AfDkL1TPLyFpg=s0-d',
        'lh3.googleusercontent.com/blogger_img_proxy/AEn0k_u7vtN2Y22G2H_mRguBa0rU7ZuYnHjtCDJnhbIN3rlnuFGrSqXTELNQLptnXlRt82de0TJax5cS9sGgzOVmrEoh1YoV9wveSxiHm8vorZkiyqX9=s0-d',
	'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEindEXUbPjSRMsYbIJ3Bq2sTXgbNUorS_3aTTHbOeJyF_q3_MgQXN6MFUiiJpjvU1P1HokxTNaDvuM5cHRLpc6qtSX8EH7NJnoe6LfjHBFTVbf-ubG0tJJ7UJTUCQek8Bdu22ueqpxmKVpQ/s640/IMG_0473.JPG',
	'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhlToUdF_dq10Vm4Yt6So9E09cmP7X_zw7MEgbhrvoY_dz7jRueYJ73GCqT25IEz91XWzeLS-o4i5EIk96R2d1AVY2gww5I3rv8KvPkcH_Zj8uREIOBj5j-__b5B2uaNylt11RG8n6im9pi/s640/IMG_0492.JPG',
	'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgczkRVxi0hu3Y3We5UIQkMQPa4miQA34qjnasiyYa0W8G_MiYFSOj15OxwR4ikjygWQEstvoGStY9CkPVEuxeMsja28pVPkDI1T213macXvc6tcP4zrjyG1sR-qgqsiR117AJyW7v9Ibou/s1600/IMG_7327.JPG',
	'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgGT3k2JgQdphSyrTBdrYHadqjtWvtk-o31yijJe1RE_2g8S8cjVwPCyYuc6JOWnLRBN3TvU8jRs3jxgLqVkr5M89DLl5wMWM6XFe6QUodwvQM7xrkz-rNfb4DXYAs8swYODXeu-3h5-o6E/s400/IMG_4132.jpg',
	'blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiafgWfvIwi7CjMtXj7ane6JjR-hUtBxW6eawz0WIG2qmJB42n7apCzn68VT0yjfESn-YdTC3DVJOSlYfIsplnTVGmtBWWmG0D1mUiZ9Fxye9csSr_1YpT0zUsk_0xQQwj1-eq754qXNj5C/s1600-r/kes%25C3%25A4banneritekstill%25C3%25A4.jpeg',
    ];

    // Function to delete specified images
    const deleteImages = () => {
        imageUrlsToDelete.forEach(url => {
            const images = document.querySelectorAll(`img[src*="${url}"]`);
            images.forEach(img => {
                img.remove();
                console.log(`Removed image: ${img.src}`);
            });
        });
    };

    // Function to delete descriptions of specified images
    const deleteImageDescriptions = () => {
        const captions = document.querySelectorAll('.tr-caption');
        captions.forEach(caption => {
            // Check if the caption contains the specific text
            if (caption.textContent.includes('')) {
                caption.remove();
                console.log('Removed specific text caption');
            }
        });
    };

    // Function to delete invalid selectors
    const deleteInvalidSelectors = () => {
        const selectorsToDelete = [
            'a[href="https://irpp4.blogspot.com/2013/06/kesakesakesa-2013.html"]',
            '#post-body-6692901737649197500',
            '.post-header',
            '.post-header-line-1',
            '.post-footer'
        ];
        selectorsToDelete.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.remove(); // Delete element instead of hiding it
                console.log(`Deleted element: ${selector}`);
            });
        });

        // Special handling for span with specific text
        document.querySelectorAll('span').forEach(span => {
            if (span.textContent.includes('lauantai 1. kesäkuuta 2013')) {
                span.remove(); // Delete element instead of hiding it
                console.log('Deleted span element with specific text: lauantai 1. kesäkuuta 2013');
            }
        });

        // Specific handling for elements related to "Kesäkuu 2013"
        document.querySelectorAll('a.post-count-link[href="https://irpp4.blogspot.com/2013/06/"]').forEach(link => {
            const parentLi = link.closest('li.archivedate.expanded');
            if (parentLi) {
                parentLi.remove(); // Delete element instead of hiding it
                console.log('Deleted elements related to "Kesäkuu 2013"');
            }
        });
    };

    // Function to delete specific selectors related to followers and profile links
    const deleteSelectors = () => {
        const selectorsToDelete = [
            'h2.title',
            '#Profile1',
            '#Profile1 > h2:nth-child(1)',
            '#Profile1 > div:nth-child(2)',
            '.profile-datablock',
            '.profile-name-link',
            '.profile-link',
            '#Followers1 > div:nth-child(2)',
            '#Followers1-wrapper',
            '#Followers1-wrapper > div:nth-child(1)',
            '#Followers1-wrapper > div:nth-child(1) > div:nth-child(1)',
            '#followers-iframe-container',
            '#I0_1738668561462',
            '#yDmH0d',
            '.SSPGKf',
            '.T4LgNb',
            '.kFwPee',
            '.kFwPee > div:nth-child(1)',
            'div.ngOPAd:nth-child(1)',
            '.mODBC',
            '.VUoKZ',
	    '#post-body-7627997676987597124',
	    '#post-body-196438253603317459',
	    '#post-body-7743031932978651204 > table:nth-child(51) > tbody > tr:nth-child(2) > td',
            '#post-body-7743031932978651204 > table:nth-child(51) > tbody > tr:nth-child(1) > td > a > img',
            '#Blog1 > div.blog-posts.hfeed > div:nth-child(2) > div > div:nth-child(2) > div > h3 > a',
            '#Blog1 > div.blog-posts.hfeed > div:nth-child(3) > div > div > div > h3 > a',
            '#Blog1 > div.blog-posts.hfeed > div:nth-child(3) > h2 > span',
            '#Blog1_blog-pager-older-link',
            '#PopularPosts1 > div > ul > li:nth-child(2) > div.item-content',
            '#PopularPosts1 > div > ul > li:nth-child(6) > div.item-content',
            '#post-body-196438253603317459',
            'table.tr-caption-container:nth-child(20) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > a:nth-child(1) > img:nth-child(1)',
            'table.tr-caption-container:nth-child(20) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1)',
            '#post-body-9080094212910440436 > div:nth-child(24) > a:nth-child(1) > img:nth-child(1)',
            '##.Followers.widget',
        ];

        selectorsToDelete.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.remove(); // Delete element instead of hiding it
                console.log(`Deleted element: ${selector}`);
            });
        });
    };

    // Set up a MutationObserver to monitor the DOM for changes and delete images and descriptions as soon as they are added
    const observer = new MutationObserver(() => {
        deleteImages();
        deleteImageDescriptions();
        deleteInvalidSelectors();
        deleteSelectors();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Also run the functions immediately to catch any images and descriptions already in the DOM
    deleteImages();
    deleteImageDescriptions();
    deleteInvalidSelectors();
    deleteSelectors();
})();