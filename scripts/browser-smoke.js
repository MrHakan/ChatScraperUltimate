"use strict";

const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-extra');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

(async () => {
    const controller = new AbortController();
    const browser = await puppeteer.launch({ headless: true, signal: controller.signal, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
        await page.goto('data:text/html,<title>CSU browser test</title><main id="ready">local only</main>', { waitUntil: 'load', timeout: 10000 });
        assert.equal(await page.title(), 'CSU browser test');
        assert.equal(await page.evaluate(() => document.querySelector('#ready').textContent), 'local only');
        // Kick uses this page-context controller to interrupt a pending fetch.
        await page.evaluate(() => { window.__csuRequest = new AbortController(); window.__csuRequest.abort(); });
        assert.equal(await page.evaluate(() => window.__csuRequest.signal.aborted), true);
        await browser.close();
        assert.equal(browser.isConnected(), false);
        console.log('Chromium + Puppeteer Extra/Stealth: launch, page APIs, evaluation and cleanup passed (local data URL only).');
    } finally {
        controller.abort();
        await browser.close().catch(() => {});
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
