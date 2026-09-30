"use strict";

const BaseScraper = require('./BaseScraper');
const { matchText } = require('../utils/domains');

class KickScraper extends BaseScraper {
    constructor(config, eventBus) {
        super('kick', config, eventBus);
        this.browser = null;
        this.page = null;
        this._browserAbort = null;
    }

    async initialize() {
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        if (!this._stealthInstalled) { puppeteer.use(StealthPlugin()); this._stealthInstalled = true; }
        await this._closeBrowser();
        this._browserAbort = new AbortController();
        this.log('info', 'Launching Kick browser');
        try {
            this.browser = await puppeteer.launch({ signal: this._browserAbort.signal, headless: this.config.headless !== false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'] });
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 720 });
            await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
            await this.page.goto('https://kick.com/category/minecraft?sort=viewers_low_to_high', { waitUntil: 'networkidle2', timeout: 60000 });
            this.log('info', 'Kick browser ready');
        } catch (error) {
            await this._closeBrowser();
            throw error;
        }
    }

    async prepareResume() {
        if (!this.browser?.isConnected() || this.page?.isClosed()) await this.initialize();
    }
    async recover() { if (this._running) await this.initialize(); }

    async pause() {
        // Cancel page-context fetches before joining the current scan.
        this._cancel();
        try { await this.page?.evaluate(() => window.__csuRequest?.abort()); } catch { /* page closed */ }
        await super.pause();
    }

    async stop() {
        this._cancel();
        // Closing the browser also releases an in-flight evaluate() request.
        await this._closeBrowser();
        await super.stop();
    }

    async _closeBrowser() {
        this._browserAbort?.abort();
        const browser = this.browser;
        this.browser = null;
        this.page = null;
        try { await browser?.close(); } catch { /* already closed */ }
    }

    async _safeFetch(url) {
        const result = await this.page.evaluate(async fetchUrl => {
            const controller = new AbortController();
            window.__csuRequest = controller;
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(fetchUrl, { credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal });
                if (!response.ok) return { error: `HTTP ${response.status}` };
                return { value: await response.json() };
            } catch (error) { return { error: error.message }; }
            finally { clearTimeout(timer); window.__csuRequest = null; }
        }, url);
        if (result.error) throw new Error(result.error);
        return result.value;
    }

    _handleMatch(channelName, content, location, viewers) {
        const match = matchText(content, this.config);
        if (match.matched) this.reportMatch({ channelName, content: content.slice(0, 4096), location, viewers, ...match, time: new Date() });
    }

    async _performScan() {
        const cursors = new Set();
        const channels = new Set();
        let cursor = null;
        let page = 0;
        do {
            if (!this._running) return;
            const data = await this._safeFetch(`https://web.kick.com/api/v1/livestreams?limit=100&sort=viewer_count_asc&category_id=${this.config.categoryId ?? 10}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
            const streams = data?.data?.livestreams;
            if (!Array.isArray(streams)) throw new Error('Unexpected Kick stream response');
            if (!streams.length) break;
            for (const stream of streams) {
                if (!this._running) return;
                const username = stream.channel?.username;
                const channelId = stream.channel?.id;
                if (!username || !channelId || channels.has(channelId)) continue;
                channels.add(channelId);
                const viewers = stream.viewer_count;
                if (this.config.maxViewers != null && viewers > this.config.maxViewers) continue;
                this.reportStats({ scanned: 1 });
                this._handleMatch(username, stream.title || '', 'TITLE', viewers);
                try {
                    const chat = await this._safeFetch(`https://web.kick.com/api/v1/chat/${channelId}/history`);
                    for (const msg of chat?.data?.messages || []) {
                        if (!this._running) return;
                        if (msg.content) this._handleMatch(username, msg.content, 'CHAT', viewers);
                    }
                    const pinned = chat?.data?.pinned_message?.message?.content;
                    if (pinned) this._handleMatch(username, pinned, 'PINNED', viewers);
                } catch (error) {
                    if (!this._running) return;
                    this.log('warn', `Chat unavailable for ${username}: ${error.message}`);
                    this.reportStats({ errors: 1 });
                }
                await this.sleep(300);
            }
            cursor = data.data.pagination?.next_cursor;
            if (cursor && cursors.has(cursor)) throw new Error('Kick pagination stalled');
            if (cursor) cursors.add(cursor);
            if (cursor) await this.sleep(1000);
        } while (cursor && ++page < 1000);
    }
}

module.exports = KickScraper;
