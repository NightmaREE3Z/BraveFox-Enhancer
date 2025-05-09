// ==UserScript==
// @name         ExtraRedirect
// @version      1.6.23-no-filtered-text
// @description  Extra redirects and hides unwanted elements on Instagram and TikTok (no "Filtered" text, prevents flicker/whiteout).
// @match        *://irc-galleria.net/user/*
// @match        *://www.instagram.com/*
// @match        *://www.instagram.com/?next=%2F/*
// @match        *://www.instagram.com/accounts/onetap/?next=%2F/*
// @match        *://www.threads.net/*
// @match        *://www.tiktok.com/*
// @match        *://github.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const bannedKeywords = [
        "Alexa", "Bliss", "Alexa Bliss", "Tiffany", "Tiffy", "Stratton", "Chelsea Green", "Bayley", "Blackheart", "Mercedes", "Alba Fyre", "sensuel", "Maryse",
        "Becky Lynch", "Michin", "Mia Yim", "#satan666", "julmakira", "Stephanie", "Liv Morgan", "Piper Niven", "sensuel", "queer", "Pride", "NXT Womens", "model",
        "Jordynne", "Woman", "Women", "@tiffanywwe", "@yaonlylivvonce", "@alexa_bliss_wwe_", "@alexa_bliss", "@samanthathebomb", "Women's", "Woman's", "Summer Rae", "Mia Yim",
        "Naomi", "Bianca Belair", "Charlotte", "Jessika Carr", "Carr WWE", "Jessica Karr", "bikini", "Kristen Stewart", "Sydney Sweeney", "Piper Niven", "Nia Jax",
        "Young Bucks", "Jackson", "Lash Legend", "Jordynne Grace", "generated", "DeepSeek", "TOR-Browser", "TOR-selain", "Opera GX", "prostitute", "AI-generated", "AI generated",
        "deepnude", "undress", "nudify", "nude", "nudifier", "faceswap", "facemorph", "AI app", "Sweeney", "Alexis", "Sydney", "Zelina Vega", "Mandy Rose", "playboy",
        "Nikki", "Brie", "Bella", "Opera Browser", "by AI", "AI edited", "Safari", "OperaGX", "MS Edge", "Microsoft Edge", "clothes", "Lola Vice", "Vice WWE", "Candice LeRae",
        "crotch", "dress", "dreamtime", "Velvet Sky", "LGBTQ", "panties", "panty", "cloth", "AI art", "cleavage", "deviantart", "All Elite Wrestling", "Trish", "Stratus",
        "Tiffy Time", "Steward", "Roxanne", "cameltoe", "dreamtime AI", "Joanie", "bra", "Stewart", "Isla Dawn", "inpaint", "photopea", "onlyfans", "fantime", "Tämä tili on yksityinen",
        "upscale", "upscaling", "upscaled", "sexy", "Alexa WWE", "AJ Lee", "deepfake", "ring gear", "Lexi", "Trans", "Transvestite", "Aleksa", "Giulia", "Rodriguez",
        "booty", "Paige", "Chyna", "lingerie", "AI model", "deep fake", "nudifying", "nudifier", "undressing", "undressed", "undressifying", "undressify", "Kristen",
        "Vladimir Putin", "Toni Storm", "Skye Blue", "Carmella", "Mariah May", "Harley Cameron", "Hayter", "trunks", "pants", "Ripley", "manyvids", "Del Ray", "Sinulle ehdotettua",
        "five feet of fury", "5 feet of fury", "selain", "browser", "DeepSeek", "DeepSeek AI", "fansly", "justforfans", "patreon", "Vince Russo", "Tay Conti", "CJ WWE",
        "Valhalla", "IYO SKY", "Shirai", "Io Sky", "Iyo Shirai", "Dakota Kai", "wiikmaaan", "Asuka", "Kairi Sane", "Meiko Satomura", "NXT Women", "Russo", "underwear", "Rule 34",
        "Miko Satomura", "Sarray", "Xia Li", "Shayna Baszler", "Ronda Rousey", "Dana Brooke", "Izzi Dame", "Tamina", "Alicia Fox", "Madison Rayne", "Saraya", "attire", "only fans",
        "Layla", "Michelle McCool", "Eve Torres", "Kelly", "Melina WWE", "Jillian Hall", "Mickie James", "Su Yung", "Britt", "Nick Jackson", "Matt Jackson", "fan time",
        "Maria Kanellis", "Beth Phoenix", "Victoria WWE", "Molly Holly", "Gail Kim", "Awesome Kong", "Deonna Purrazzo", "Anna Jay", "Riho", "Britney", "Nyla Rose", 
        "Angelina Love", "Tessmacher", "Havok", "Taya Valkyrie", "Valkyria", "Tay Melo", "Willow Nightingale", "Statlander", "Hikaru Shida", "rule34", "Sasha", "AEW",
        "Penelope Ford", "Shotzi", "Tegan", "Nox", "Stephanie", "Sasha Banks", "Sakura", "Tessa", "Brooke", "Jakara", "Alba Fyre", "Isla Dawn", "Scarlett Bordeaux",
        "B-Fab", "Kayden Carter", "Katana Chance", "Lyra Valkyria", "Indi Hartwell", "Blair Davenport", "Maxxine Dupri", "China", "Russia", "Natalya", "Sakazaki",
        "Karmen Petrovic", "Ava Raine", "Cora Jade", "Jacy Jayne", "Gigi Dolin", "Thea Hail", "Tatum WWE", "Paxley", "Fallon Henley", "Nattie", "escort", "Sol Ruca",
        "Kelani Jordan", "Electra Lopez", "Wendy Choo", "Yulisa Leon", "Valentina Feroz", "Amari Miller", "Arianna Grace", "Lana", "CJ Perry", "Perry", "Del Rey"
    ];

    // Regex array for case-insensitive matches, e.g. "AI"
    const bannedRegexes = [
        /\bAI\b/i, /\bMLM\b/i, 
    ];

    const allowedWords = [
        "Lähetä", "Viesti", "Lähetä viesti", "Send a message", "Send message", "Send", "message",
    ];

    const instagramBannedPaths = [
        'karabrannbacka',
        'piia_oksanen',
        'wiikmaaan',
        'p/Cpz9H4UtG1Q',
        'p/Cu6cV9zN-CH',
        'p/CyA6BJpNzgu',
        'instagram.com/julmakira',
        'instagram.com/wiikmaaan',
        'julmakira',
        'p/B3RXztzhj6E',
    ];

    const excludedPaths = [
        'direct/t/',
        'inbox',
        'reels',
        'reel',
        'direct/t',
        'stories/nightmaree3z/',
        'stories/m1mmuska/'
    ];

    const protectedElements = [
        'div[aria-describedby="Viesti"][aria-label="Viesti"].xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x1iyjqo2.x1gh3ibb.xisnujt.xeuugli.x1odjw0f.notranslate',
        'div[aria-describedby="Viesti"][aria-label="Viesti"].xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x1iyjqo2.x1gh3ibb.xisnujt.xeuugli.x1odjw0f.notranslate[role="textbox"][spellcheck="true"]',
        'textarea[placeholder="Message..."]',
        'button[type="submit"]',
        'div.x1qjc9v5.x1yvgwvq.x1dqoszc.x1ixjvfu.xhk4uv.x1ke7ulo.x3jqge.x1i7howy.x4y8mfe.x13fuv20.xu3j5b3.x1q0q8m5.x26u7qi.x178xt8z.xm81vs4.xso031l.xy80clv.x78zum5.xdt5ytf.xw7yly9.xktsk01.x1yztbdb.x1d52u69',
        'div.x6s0dn4.x78zum5.x1gg8mnh.x1pi30zi.xlu9dua',
        'div.x9f619.xjbqb8w.x78zum5.x168nmei.x13lgxp2.x5pf9jr.xo71vjh.x1uhb9sk.x1plvlek.xryxfnj.x1c4vz4f.x2lah0s.xdt5ytf.xqjyukv.x1qjc9v5.x1nhvcw1.xpvyfi4.xzueoph',
        'div.x1i10hfl.x972fbf.xcfux6l.x1qhh985.xm0m39n.x9f619.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.x6s0dn4.xjbqb8w.x1ejq31n.xd10rxx.x1sy0etr.x17r0tee.x1ypdohk.x78zum5.xl56j7k.xcdnw81.x1iorvi4.x150jy0e.xjkvuk6.x1e558r4',
        'svg[aria-label="Valitse emoji"]',
        'div[aria-describedby="Viesti"][aria-label="Viesti"].xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x1iyjqo2.x1gh3ibb.xisnujt.xeuugli.x1odjw0f.notranslate',
        'div.x1i10hfl.xjqpnuy.xa49m3k.xqeqjp1.x2hbi6w.xdl72j9.x2lah0s.xe8uvvx.xdj266r.x1mh8g0r.x2lwn1j.xeuugli.x1hl2dhg.xggy1nq.x1ja2u2z.x1t137rt.x1q0g3np.x1lku1pv.x1a2a7pz.x6s0dn4.xjyslct.x1ejq31n.xd10rxx.x1sy0etr.x17r0tee.x1ypdohk.x1f6kntn.xwhw2v2.xl56j7k.x17ydfre.x2b8uid.xlyipyv.x87ps6o.x14atkfc.xcdnw81.x1i0vuye.xjbqb8w.xm3z3ea.x1x8b98j.x131883w.x16mih1h.x972fbf.xcfux6l.x1qhh985.xm0m39n.xt7dq6l.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x1n2onr6.x1n5bzlp.x173jzuc.x1yc6y37.x1s85apg.x7fd4wk.x1sfzahb.xfs2ol5',
        'svg[aria-label="Äänileike"]',
        'input[accept="audio/*,.mp4,.mov,.png,.jpg,.jpeg"]',
        'svg[aria-label="Lisää kuva tai video"]',
        'svg[aria-label="Valitse GIF-animaatio tai tarra"]',
        'svg[aria-label="Tykkää"]',
        'div[aria-label="Viesti"]',
        'div[role="textbox"]',
        'div.x1qjc9v5.x1yvgwvq.x1dqoszc.x1ixjvfu.xhk4uv.x1ke7ulo.x3jqge.x1i7howy.x4y8mfe.x13fuv20.xu3j5b3.x1q0q8m5.x26u7qi.x178xt8z.xm81vs4.xso031l.xy80clv.x78zum5.xdt5ytf.xw7yly9.xktsk01.x1yztbdb',
        'div.x1n2onr6 > div[aria-describedby="Viesti"][aria-label="Viesti"].xzsf02u.x1a2a7pz.x1n2onr6.x14wi4xw.x1iyjqo2.x1gh3ibb.xisnujt.xeuugli.x1odjw0f.notranslate',
        'div[aria-hidden="true"] > div.xi81zsa.x17qophe.x6ikm8r.x10wlt62.x47corl.x10l6tqk.xlyipyv.x13vifvy.x87ps6o.xuxw1ft.xh8yej3',
        'div.x1i10hfl.xjqpnuy.xa49m3k.xqeqjp1.x2hbi6w.xdl72j9.x2lah0s.xe8uvvx.xdj266r.x1mh8g0r.x2lwn1j.xeuugli.x1hl2dhg.xggy1nq.x1ja2u2z.x1t137rt.x1q0g3np.x1lku1pv.x1a2a7pz.x6s0dn4.xjyslct.x1ejq31n.xd10rxx',
        'svg[aria-label="Äänileike"]',
        'div.x6s0dn4.x78zum5 > div.x1i10hfl.x972fbf.xcfux6l.x1qhh985.xm0m39n.x9f619.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz.x6s0dn4.xjbqb8w.xd10rxx.x1sy0etr.x17r0tee.x1ypdohk.x78zum5.xl56j7k.x1y1aw1k.xurb0ha',
        'div.x6s0dn4.x78zum5.x1r8uery.xdt5ytf.x1iyjqo2.x6ikm8r.x10wlt62',
        'div[aria-label="Viesti"], textarea[placeholder="Message..."], svg[aria-label="Valitse emoji"]'
    ];

    const selectorsToHide = [
        '.x1azxncr > .x1qrby5j.x7ja8zs.x1t2pt76.x1lytzrv.xedcshv.xarpa2k.x3igimt.x12ejxvf.xaigb6o.x1beo9mf.xv2umb2.x1jfb8zj.x1h9r5lt.x1h91t0o.x4k7w5x > .x1n2onr6 > ._a6hd.x1a2a7pz.xggy1nq.x1hl2dhg.x16tdsg8.xkhd6sd.x18d9i69.x4uap5.xexx8yu.x1mh8g0r.xat24cr.x11i5rnm.xdj266r.xe8uvvx.xt0psk2.x1ypdohk.x9f619.xm0m39n.x1qhh985.xcfux6l.x972fbf.x17r0tee.x1sy0etr.x1ejq31n.xjbqb8w.x1i10hfl',
        '.xvbhtw8.x1j7kr1c.x169t7cy.xod5an3.x11i5rnm.xdj266r.xdt5ytf.x78zum5',
        '.wbloks_79.wbloks_1 > .wbloks_1 > .wbloks_1 > .wbloks_1 > div.wbloks_1',
        '.x1ye3gou.x1l90r2v.xn6708d.x1y1aw1k.xl56j7k.x1qx5ct2.x78zum5.x6s0dn4',
        '.x1nhvcw1.x1oa3qoh.x1qjc9v5.xqjyukv.xdt5ytf.x2lah0s.x1c4vz4f.xryxfnj.x1plvlek.xo71vjh.x5pf9jr.x13lgxp2.x168nmei.x78zum5.xjbqb8w.x9f619 > div > div > .xnc8uc2.x11aubdm.xso031l.x1q0q8m5.x1bs97v6',
        '.x2qib4z.xcu9agk.xd7y6wv.x78zum5.xg6i1s1.x1rp6h8o.x1fglp.xdxvlk3.x1hmx34t.x6s0dn4.x1a2a7pz.x1lku1pv.x87ps6o.x1q0g3np.x1t137rt.x1ja2u2z.xggy1nq.x1hl2dhg.x16tdsg8.x1n2onr6.x18d9i69.xexx8yu.xeuugli.x2lah0s.x1mh8g0r.xat24cr.x11i5rnm.xdj266r.xe8uvvx.x2lah0s.xdl72j9.x9f619.xm0m39n.x1qhh985.xcfux6l.x972fbf.x26u7qi.x1q0g3np.xu3j5b3.x13fuv20.x2hbi6w.xqeqjp1.xa49m3k.xjqpnuy.x1i10hfl',
        'div.x1nhvcw1.x1oa3qoh.x1qjc9v5.xqjyukv.xdt5ytf.x2lah0s.x1c4vz4f.xryxfnj.x1plvlek.x1n2onr6.x1emribx.x1i64zmx.xod5an3.xo71vjh.x5pf9jr.x13lgxp2.x168nmei.x78zum5.xjbqb8w.x9f619:nth-of-type(11)',
        '.x1azxncr > .x1qrby5j.x7ja8zs.x1t2pt76.x1lytzrv.xedcshv.xarpa2k.x3igimt.x12ejxvf.xaigb6o.x1beo9mf.xv2umb2.x1jfb8zj.x1h9r5lt.x1h91t0o.x4k7w5x > .x78zum5.x6s0dn4.x1n2onr6 > ._a6hd.x1a2a7pz.xggy1nq.x1hl2dhg.x16tdsg8.xkhd6sd.x18d9i69.x4uap5.xexx8yu.x1mh8g0r.xat24cr.x11i5rnm.xdj266r.xe8uvvx.xt0psk2.x1ypdohk.x9f619.xm0m39n.x1qhh985.xcfux6l.x972fbf.x17r0tee.x1sy0etr.x1ejq31n.xjbqb8w.x1i10hfl',
        '.xfex06f > div:nth-child(3)',
        'div.x1i10hfl:nth-child(8)',
        'mount_0_0_Ie > div > div > div.x9f619.x1n2onr6.x1ja2u2z > div > div > div.x78zum5.xdt5ytf.x1t2pt76.x1n2onr6.x1ja2u2z.x10cihs4 > div:nth-child(2) > div > div.x1gryazu.xh8yej3.x10o80wk.x14k21rp.x17snn68.x6osk4m.x1porb0y.x8vgawa > section > main > div > header > section.x1xdureb.x1agbcgv.x1lhsz42.xieb3on.xr1yuqi.x6ikm8r.x10wlt62.xs5motx > div > div > div.x9f619.xjbqb8w.x78zum5.x168nmei.x13lgxp2.x5pf9jr.xo71vjh.x1n2onr6.x1plvlek.xryxfnj.x1c4vz4f.x2lah0s.x1q0g3np.xqjyukv.x1qjc9v5.x1oa3qoh.x1nhvcw1',
        'div.x6bk1ks:nth-child(3) > div:nth-child(4) > a:nth-child(1)',
        'div.x6bk1ks:nth-child(3) > div:nth-child(3)',
        '.x1xgvd2v > div:nth-child(2) > div:nth-child(4) > span:nth-child(1)',
        '.x1xgvd2v > div:nth-child(2) > div:nth-child(3) > span:nth-child(1) > a:nth-child(1) > div:nth-child(1)',
        'svg[aria-label="Tutki"]',
        'div[aria-label="Käyttäjän julmakira tarina"]',
        'div[aria-label="Käyttäjän julmakira tarina, nähty"]',
        'img[alt="Käyttäjän julmakira profiilikuva"]',
        'div[class^="x9f619 xjbqb8w x78zum5 x168nmei x13lgxp2 x5pf9jr xo71vjh"][style*="height: 250px;"]',
        'div.x9f619.xjbqb8w.x78zum5.x168nmei.x13lgxp2.x5pf9jr.xo71vjh.xdj266r.x1yztbdb.x4uap5.xkhd6sd.x1uhb9sk.x1plvlek.xryxfnj.x1c4vz4f.x2lah0s.x1q0g3np.xqjyukv.x1qjc9v5.x1oa3qoh.x1nhvcw1',
        'div.x9f619.xjbqb8w.x78zum5.x168nmei.x13lgxp2.x5pf9jr.xo71vjh.x1uhb9sk.x1plvlek.xryxfnj.x1iyjqo2.x2lwn1j.xeuugli.xdt5ytf.xqjyukv.x1qjc9v5.x1oa3qoh.x1nhvcw1',
        'h4.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.x1ji0vk5.x18bv5gf.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.xvs91rp.x1s688f.x173jzuc.x10wh9bi.x1wdrske.x8viiok.x18hxmgj',
        'a.x1i10hfl.xjbqb8w.x1ejq31n.xd10rxx.x1sy0etr.x17r0tee.x972fbf.xcfux6l.x1qhh985.xm0m39n.x9f619.x1ypdohk.xt0psk2.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz._ac5x._a6hd',
        'span.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.x1ji0vk5.x18bv5gf.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.xvs91rp.x1s688f.x173jzuc.x10wh9bi.x1wdrske.x8viiok.x18hxmgj',
        'div[role="button"][tabindex][aria-label="Reels"]',
        'div[role="button"][tabindex][aria-label="Threads"]',
        'div[role="button"][tabindex][aria-label="Tutki"]',
        'div > span.html-span > div.x1n2onr6 > a.x1i10hfl._a6hd[href="/explore/"]'
    ];

    const selectorsToMonitor = [
        'div.x78zum5.xdt5ytf.x5yr21d.xa1mljc.xh8yej3.x1bs97v6.x1q0q3np.xso031l.x11aubdm.xnc8uc2',
        'div.xsag5q8.x1e558r4',
        'div.x6s0dn4.xyzq4qe.x78zum5.xdt5ytf.x2lah0s.xl56j7k.x6ikm8r.x10wlt62.x1n2onr6.x5ur3kl.xopu45v.x1bs97v6.xmo9t06',
        'div.x1lliihq.x1n2onr6',
        'section.x6s0dn4.xrvj5dj.x1o61qjw.x12nagc.x1gslohp',
        'p',
        'a',
        'div.xq8finb',
        'div._aagu',
        'div._aagv',
        'span.html-span',
        'div.x1n2onr6',
        'a.x1i10hfl',
        'div.x9f619',
        'li._acaz',
        'div[aria-label*="tarina, nähty"]',
        'canvas.x1upo8f9.xpdipgo.x87ps6o',
        'img[alt*="profiilikuva"]',
        'div[role="button"][tabindex][aria-label="Reels"]',
        'div[role="button"][tabindex][aria-label="Threads"]',
        'div[role="button"][tabindex][aria-label="Tutki"]',
        'div[class*="x1nhvcw1"][class*="xqjyukv"][class*="xdt5ytf"]'
    ];

    const selectorsForExcludedPaths = [
        'div[role="button"][tabindex][aria-label="Reels"]',
        'div[role="button"][tabindex][aria-label="Threads"]',
        'div[role="button"][tabindex][aria-label="Tutki"]',
        'div > span.html-span > div.x1n2onr6 > a.x1i10hfl._a6hd[href="/explore/"]',
        'div > span.html-span > div.x1n2onr6 > a.x1i10hfl._a6hd[href="/reels/"]',
        '.x1azxncr > .x1qrby5j.x7ja8zs.x1t2pt76.x1lytzrv.xedcshv.xarpa2k.x3igimt.x12ejxvf.xaigb6o.x1beo9mf.xv2umb2.x1jfb8zj.x1h9r5lt.x1h91t0o.x4k7w5x > .x1n2onr6 > ._a6hd.x1a2a7pz.xggy1nq.x1hl2dhg.x16tdsg8.xkhd6sd.x18d9i69.x4uap5.xexx8yu.x1mh8g0r.xat24cr.x11i5rnm.xdj266r.xe8uvvx.xt0psk2.x1ypdohk.x9f619.xm0m39n.x1qhh985.xcfux6l.x972fbf.x17r0tee.x1sy0etr.x1ejq31n.xjbqb8w.x1i10hfl'
    ];

    const bannedPhrases = [
        "Sinulle Ehdotettua"
    ];

    let currentURL = window.location.href;
    const hiddenElements = new WeakSet();
    const bannedKeywordsLower = bannedKeywords.map(k => k.toLowerCase());
    const instagramBannedPathsLower = instagramBannedPaths.map(p => p.toLowerCase());
    const allowedWordsLower = allowedWords.map(w => w.toLowerCase());

    function collapseElement(element) {
        if (!hiddenElements.has(element)) {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('max-height', '0', 'important');
            element.style.setProperty('height', '0', 'important');
            element.style.setProperty('min-height', '0', 'important');
            element.style.setProperty('overflow', 'hidden', 'important');
            element.style.setProperty('padding', '0', 'important');
            element.style.setProperty('margin', '0', 'important');
            element.style.setProperty('border', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('flex', '0 0 0px', 'important');
            element.style.setProperty('grid', 'none', 'important');
            element.style.setProperty('transition', 'none', 'important');
            hiddenElements.add(element);
        }
    }

    function collapseElementsBySelectors(selectors) {
        const allSelectors = selectors.join(',');
        document.querySelectorAll(allSelectors).forEach(element => {
            if (hiddenElements.has(element)) return;
            const isProtected = protectedElements.some(protectedSelector => {
                try { return element.matches(protectedSelector); } catch { return false; }
            });
            const containsAllowedWords = allowedWordsLower.some(word =>
                element.textContent && element.textContent.toLowerCase().includes(word)
            );
            if (!isProtected && !containsAllowedWords && !isExcludedPath()) {
                collapseElement(element);
            }
        });
    }

    function collapseElementsByKeywordsOrPaths(keywords, paths, selectors) {
        const allSelectors = selectors.join(',');
        document.querySelectorAll(allSelectors).forEach(element => {
            if (hiddenElements.has(element)) return;
            const isProtected = protectedElements.some(protectedSelector => {
                try { return element.matches(protectedSelector); } catch { return false; }
            });
            if (isProtected) return;
            const textContent = element.textContent ? element.textContent.toLowerCase() : "";
            let matched = false;
            for (let i = 0; i < bannedKeywordsLower.length; ++i) {
                if (textContent.includes(bannedKeywordsLower[i])) {
                    matched = true;
                    break;
                }
            }
            for (let i = 0; i < instagramBannedPathsLower.length; ++i) {
                if (textContent.includes(instagramBannedPathsLower[i])) {
                    matched = true;
                    break;
                }
            }
            // Regex matching (case-insensitive)
            if (!matched) {
                for (let i = 0; i < bannedRegexes.length; ++i) {
                    if (bannedRegexes[i].test(element.textContent)) {
                        matched = true;
                        break;
                    }
                }
            }
            if (matched) {
                const parentArticle = element.closest('article');
                if (parentArticle && !hiddenElements.has(parentArticle)) {
                    const containsAllowedWords = allowedWordsLower.some(word =>
                        parentArticle.textContent && parentArticle.textContent.toLowerCase().includes(word)
                    );
                    if (!containsAllowedWords && !isExcludedPath()) {
                        Array.from(parentArticle.children).forEach(child => {
                            child.style.setProperty('display', 'none', 'important');
                        });
                        hiddenElements.add(parentArticle);
                    }
                }
            }
        });
    }

    function collapseElementsOnExcludedPaths() {
        if (!isExcludedPath()) return;
        const allSelectors = selectorsForExcludedPaths.join(',');
        document.querySelectorAll(allSelectors).forEach(element => {
            collapseElement(element);
        });
    }

    function isExcludedPath() {
        return excludedPaths.some(path => currentURL.indexOf(path) !== -1);
    }

    const ircGalleriaBannedPatterns = [
        'Irpp4/album?page=1',
        'picture/129640994', 'picture/129640992', 'picture/129262368', 'picture/129580627',
        'picture/129640995', 'picture/129559690', 'picture/129640997', 'picture/129640991',
        'picture/130016541', 'picture/129804009', 'picture/129684375', 'picture/128593982'
    ];

    if (currentURL.includes('irc-galleria.net')) {
        for (let pattern of ircGalleriaBannedPatterns) {
            if (currentURL.includes(pattern)) {
                window.stop();
                window.location.replace('https://irc-galleria.net');
                return;
            }
        }
    }

    function handleIRCGalleriaThumbDeletion() {
        if (!currentURL.includes('irc-galleria.net')) return;
        const selectorsToDelete = [
            '#thumb_div_129640995',
            '#thumb_div_129640994',
            '#thumb_div_129640992',
            '#thumb_div_129580627',
            '#thumb_div_129640995',
            '#thumb_div_129559690',
            '#thumb_div_129640997',
            '#thumb_div_129640991',
            '#thumb_div_129684375',
            '#thumb_div_130016541',
            '#thumb_div_129804009',
            '#thumb_div_129262368',
            '#thumb_div_128593982',
            '#image-129684375-image',
            '#image-129640994-image',
            '#image-129640992-image',
            '#image-129580627-image',
            '#image-129640995-image',
            '#image-129262368-image',
            '#image-129559690-image',
            '#image-128593982-image',
        ];
        selectorsToDelete.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => element.remove());
        });
    }

    let githubRedirected = false;
    function handleGitHubRedirect() {
        if (githubRedirected) return;
        const currentURL = window.location.href;
        const blockedRepos = [
            'Firefox-Enhancer',
            'BraveFox-Enhancer',
            'MV3-Download-Manager',
            'DownloadsMV2FF'
        ];

        const isProfileRoot = /^https:\/\/github\.com\/NightmaREE3Z\/?$/.test(currentURL);
        const repoMatch = currentURL.match(/^https:\/\/github\.com\/NightmaREE3Z\/([^\/#?]+)/);

        if (isProfileRoot) {
            githubRedirected = true;
            window.location.replace('https://github.com');
            return;
        }
        if (repoMatch && blockedRepos.includes(repoMatch[1])) {
            githubRedirected = true;
            window.location.replace('https://github.com');
            return;
        }
    }

    function handleRedirectionsAndContentHiding() {
        currentURL = window.location.href;

        handleIRCGalleriaThumbDeletion();

        if (currentURL.includes('www.threads.net')) {
            window.stop();
            window.location.replace('https://www.instagram.com');
            return;
        }

        if (currentURL.includes('github.com')) {
            handleGitHubRedirect();
        }

        if (instagramBannedPaths.some(path => currentURL.includes(path))) {
            window.stop();
            window.location.replace('https://www.instagram.com');
            return;
        }

        if (currentURL.includes('@karabrannbacka')) {
            window.stop();
            window.location.replace('https://www.tiktok.com');
            return;
        }

        if (isExcludedPath()) {
            collapseElementsOnExcludedPaths();
            return;
        }

        collapseElementsBySelectors(selectorsToHide);
        collapseElementsByKeywordsOrPaths(bannedKeywords, instagramBannedPaths, selectorsToMonitor);
    }

    let observerScheduled = false;
    function observerCallback(mutationsList) {
        if (observerScheduled) return;
        observerScheduled = true;
        setTimeout(() => {
            observerScheduled = false;
            if (isExcludedPath()) {
                collapseElementsOnExcludedPaths();
                return;
            }
            collapseElementsBySelectors(selectorsToHide);
            collapseElementsByKeywordsOrPaths(bannedKeywords, instagramBannedPaths, selectorsToMonitor);
        }, 80);
    }

    function initObserver() {
        const observer = new MutationObserver(observerCallback);

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
    }

    handleRedirectionsAndContentHiding();
    initObserver();

    setInterval(handleRedirectionsAndContentHiding, 80);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) handleRedirectionsAndContentHiding();
    });

})();