"use strict";

const BaseScraper = require('./BaseScraper');

/**
 * Kick chat scraper module — ported from KickChatScraper.
 * Uses Puppeteer with Stealth plugin to bypass Cloudflare and scan
 * Kick.com Minecraft livestreams for keyword matches in titles,
 * chat history, and pinned messages. Sends alerts via Discord webhook.
 * @module KickScraper
 */
class KickScraper extends BaseScraper {
    constructor(config, eventBus) {
        super('kick', config, eventBus);
        /** @type {import('puppeteer').Browser|null} */
        this.browser = null;
        /** @type {import('puppeteer').Page|null} */
        this.page = null;
    }

    /** @override — launches Puppeteer and navigates to Kick for Cloudflare cookies. */
    async initialize() {
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());

        if (this.browser) {
            try { await this.browser.close(); } catch { /* noop */ }
        }

        this.log('info', 'Launching headless browser for Kick...');
        this.browser = await puppeteer.launch({
            headless: this.config.headless !== false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,720',
            ],
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 720 });
        await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        this.log('info', 'Navigating to Kick Minecraft category (Cloudflare bypass)...');
        await this.page.goto('https://kick.com/category/minecraft?sort=viewers_low_to_high', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });
        this.log('info', 'Browser ready.');
    }

    /** @override */
    async start() {
        await super.start();
        await this.initialize();
        this.setState(BaseScraper.STATES.RUNNING);

        this._loopPromise = this._scanLoop().catch((err) => {
            this.log('error', `Loop crashed: ${err.message}`);
            this.setState(BaseScraper.STATES.ERROR);
        });
    }

    /** @override */
    async stop() {
        this._running = false;
        this._wakeUp();
        this.setState(BaseScraper.STATES.STOPPING);
        if (this._loopPromise) await this._loopPromise.catch(() => { });
        await this._closeBrowser();
        this.setState(BaseScraper.STATES.STOPPED);
    }

    /** @override */
    async resume() {
        if (this.state !== BaseScraper.STATES.PAUSED) return;
        this._running = true;
        this.setState(BaseScraper.STATES.RUNNING);
        // Re-initialize browser if it was closed
        if (!this.browser || !this.browser.isConnected()) {
            await this.initialize();
        }
        this._loopPromise = this._scanLoop().catch((err) => {
            this.log('error', `Loop crashed: ${err.message}`);
            this.setState(BaseScraper.STATES.ERROR);
        });
    }

    /** Closes the Puppeteer browser safely. */
    async _closeBrowser() {
        try {
            if (this.browser) { await this.browser.close(); this.browser = null; this.page = null; }
        } catch { /* noop */ }
    }

    // ---------- Internal Scan Loop ----------

    async _scanLoop() {
        const waitTime = (this.config.waitTimeMinutes || 10) * 60000;

        while (this._running) {
            try {
                this.log('info', '--- Kick scan cycle starting ---');
                await this._performScan();
                this.log('info', `--- Kick scan complete. Waiting ${waitTime / 60000}m ---`);
            } catch (err) {
                if (!this._running) break;
                this.log('error', `Scan error: ${err.message}. Reinitializing browser...`);
                this.reportStats({ errors: 1 });
                try { await this.initialize(); } catch (e) {
                    this.log('error', `Browser reinit failed: ${e.message}`);
                }
            }

            if (!this._running) break;
            await this.sleep(waitTime);
        }
    }

    /**
     * Fetch JSON from Kick's API using the page context (inherits Cloudflare cookies).
     * @param {string} url
     * @returns {Promise<object|null>}
     */
    async _safeFetch(url) {
        try {
            const result = await this.page.evaluate(async (fetchUrl) => {
                try {
                    const res = await fetch(fetchUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
                    if (!res.ok) return { error: `${res.status} ${res.statusText}` };
                    return { text: await res.text() };
                } catch (e) {
                    return { error: e.message };
                }
            }, url);
            if (result.error) { this.log('warn', `Request failed: ${result.error} → ${url}`); return null; }
            return JSON.parse(result.text);
        } catch (err) {
            this.log('error', `safeFetch error: ${err.message}`);
            return null;
        }
    }

    /** Executes one full scan cycle across all Kick Minecraft livestreams. */
    async _performScan() {
        const keywords = this.config.keywords || ['aternos', 'exaroton'];
        const targetDomains = this.config.targetDomains || ['aternos.me', 'exaroton.me'];
        const categoryId = this.config.categoryId || 10;

        // Generate random 5-char instance ID (letters + digits)
        const instanceId = Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
        // Per-instance domain dedup: skip webhook if same domain string already sent this cycle
        const sentDomains = new Set();

        this.log('info', `[${instanceId}] Kick scan instance started`);
        let cursor = null;
        let pageNum = 1;

        while (this._running) {
            let apiUrl = `https://web.kick.com/api/v1/livestreams?limit=100&sort=viewer_count_asc&category_id=${categoryId}`;
            if (cursor) apiUrl += `&after=${cursor}`;

            this.log('info', `Page ${pageNum} requested...`);
            const data = await this._safeFetch(apiUrl);

            if (!data?.data?.livestreams || data.data.livestreams.length === 0) {
                this.log('info', 'End of stream list reached.');
                break;
            }

            for (const stream of data.data.livestreams) {
                if (!this._running) return;
                const username = stream.channel?.username;
                const channelId = stream.channel?.id;
                const title = stream.title || '';
                if (!username || !channelId) continue;

                this.reportStats({ scanned: 1 });

                // Title scan
                if (keywords.some((k) => title.toLowerCase().includes(k))) {
                    this._handleMatch(username, title, 'TITLE', targetDomains, instanceId, sentDomains);
                }

                // Chat history scan
                const chatData = await this._safeFetch(`https://web.kick.com/api/v1/chat/${channelId}/history`);
                if (chatData?.data?.messages) {
                    for (const msg of chatData.data.messages) {
                        if (msg.content && keywords.some((k) => msg.content.toLowerCase().includes(k))) {
                            this._handleMatch(username, msg.content, 'CHAT', targetDomains, instanceId, sentDomains);
                        }
                    }
                    // Pinned message
                    const pinned = chatData.data?.pinned_message?.message?.content;
                    if (pinned && keywords.some((k) => pinned.toLowerCase().includes(k))) {
                        this._handleMatch(username, pinned, 'PINNED', targetDomains, instanceId, sentDomains);
                    }
                }

                await new Promise((r) => setTimeout(r, 300)); // Rate limit between streams
            }

            cursor = data.data.pagination?.next_cursor;
            if (!cursor) break;
            pageNum++;
            await new Promise((r) => setTimeout(r, 1000)); // Rate limit between pages
        }

        this.log('info', `[${instanceId}] Kick scan complete (${sentDomains.size} unique domains sent)`);
        this.reportStats({ lastScanTime: new Date() });
    }

    /**
     * Processes a keyword match: reports it and optionally sends a Discord webhook.
     * @param {string} channelName
     * @param {string} content
     * @param {'TITLE'|'CHAT'|'PINNED'} source
     * @param {string[]} targetDomains
     * @param {string} instanceId
     * @param {Set<string>} sentDomains - Dedup set for this scan instance
     */
    _handleMatch(channelName, content, source, targetDomains, instanceId, sentDomains) {
        const lower = content.toLowerCase();
        const isDomain = targetDomains.some((d) => lower.includes(d));

        // Extract the actual domain string for dedup
        let foundDomain = null;
        if (isDomain) {
            for (const d of targetDomains) {
                const dIdx = lower.indexOf(d);
                if (dIdx !== -1) {
                    const before = lower.lastIndexOf(' ', dIdx) + 1;
                    const after = lower.indexOf(' ', dIdx);
                    foundDomain = lower.substring(before, after === -1 ? lower.length : after).trim();
                    break;
                }
            }
        }

        this.reportMatch({
            channelName,
            content: content.slice(0, 1024),
            source,
            isDomain,
            instanceId,
            time: new Date(),
        });

        // Only send to Discord if domain found AND not already sent this instance
        if (isDomain && foundDomain && !sentDomains.has(foundDomain)) {
            sentDomains.add(foundDomain);
            this._sendDiscordWebhook(channelName, content, source);
            this.log('info', `[${instanceId}] Webhook sent for: ${foundDomain}`);
        } else if (isDomain && foundDomain) {
            this.log('debug', `[${instanceId}] Skipped duplicate domain: ${foundDomain}`);
        }
    }

    /**
     * Sends match data to Discord via webhook.
     * @param {string} channelName
     * @param {string} content
     * @param {string} source
     */
    _sendDiscordWebhook(channelName, content, source) {
        const webhookUrl = this.config.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) return;

        const formattedUrlName = channelName.replace(/_/g, '-');
        const payload = {
            content: null,
            embeds: [{
                title: 'Found on Kick',
                description: `**Kick Streamer:** https://kick.com/${formattedUrlName}\n**Source:** ${source}`,
                color: 5830933,
                fields: [{ name: 'Message Content:', value: content.slice(0, 1024) }],
                footer: { text: 'Scanned at', icon_url: 'https://cdn.discordapp.com/emojis/1474423522540523674.webp?size=96' },
                timestamp: new Date().toISOString(),
                thumbnail: { url: 'https://cdn.discordapp.com/emojis/1474423522540523674.webp?size=96' },
            }],
            attachments: [],
        };

        try {
            const res = fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            res.catch(() => { });
        } catch { /* noop */ }
    }
}

module.exports = KickScraper;
