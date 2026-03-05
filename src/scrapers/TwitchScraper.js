"use strict";

const https = require('https');
const fs = require('fs');
const path = require('path');
const BaseScraper = require('./BaseScraper');

/**
 * Twitch chat scraper module — ported from TwitchChatScraper.
 * Discovers Minecraft streams via Helix API, fetches VOD chat replays via
 * Twitch GQL, searches for keywords, and sends Discord webhook alerts.
 * Includes continuous mode for repeated scanning on a timer.
 *
 * Why it works like the original:
 * - Uses the SAME semaphore-based concurrency pattern (maxDownloads=3)
 * - Uses the SAME cursor-based pagination termination logic
 * - Uses the SAME GQL persisted queries and sha256 hashes
 * @module TwitchScraper
 */

// ---------- GQL / HELIX HTTP Clients (ported from internal/common.js) ----------

const GQL_OPTIONS = {
    hostname: 'gql.twitch.tv',
    path: '/gql',
    method: 'POST',
    headers: {
        Accept: '*/*',
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    },
};

/**
 * Low-level GQL request with one retry (matches original requestPromiseHandler).
 * @param {object|object[]} sendData
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
function gqlRequest(sendData, signal) {
    return new Promise((resolve, reject) => {
        const attempt = (tryCount) => {
            const retry = (reason) => {
                if (tryCount === 0) attempt(1);
                else reject(reason);
            };

            const req = https.request(GQL_OPTIONS, (res) => {
                let data = '';
                res.setEncoding('utf-8');
                res.on('data', (d) => { if (!signal?.aborted) data += d; });
                res.on('error', retry);
                res.on('end', () => {
                    if (signal?.aborted) return reject(-1);
                    try { resolve(JSON.parse(data)); }
                    catch (e) { retry(e); }
                });
            });
            req.setTimeout(15000, () => req.destroy(new Error('GQL request timed out')));
            req.on('error', retry);
            req.write(JSON.stringify(sendData));
            req.end();
        };
        attempt(0);
    });
}

/**
 * Fetches a portion of the chat replay for a VOD.
 * Matches original common.getChatReplayPart exactly.
 * @param {string} videoID
 * @param {number} offset - contentOffsetSeconds
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function getChatReplayPart(videoID, offset, signal) {
    const payload = {
        operationName: 'VideoCommentsByOffsetOrCursor',
        variables: { videoID: `${videoID}`, contentOffsetSeconds: offset },
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a',
            },
        },
    };
    return gqlRequest([payload], signal);
}

/**
 * Fetches VOD IDs for a channel via GQL.
 * @param {string} username
 * @param {number} limit
 * @param {AbortSignal} signal
 * @returns {Promise<any>}
 */
async function getVODListGQL(username, limit, signal) {
    const query = `
    query FilterableVideoTower_Videos($limit: Int!, $channelOwnerLogin: String!, $broadcastType: BroadcastType, $videoSort: VideoSort) {
        user(login: $channelOwnerLogin) {
            videos(first: $limit, type: $broadcastType, sort: $videoSort) {
                edges { node { id publishedAt broadcastType } }
            }
        }
    }`;
    return gqlRequest({
        query,
        variables: { limit, channelOwnerLogin: username, broadcastType: 'ARCHIVE', videoSort: 'TIME' },
    }, signal);
}

// ---------- Helix API (OAuth) ----------

let _helixToken = null;
let _helixExpiry = 0;

/**
 * Gets an OAuth app access token from Twitch, caching it until expiry.
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<string>}
 */
function getAppAccessToken(clientId, clientSecret) {
    const now = Date.now();
    if (_helixToken && _helixExpiry > now + 60000) return Promise.resolve(_helixToken);

    return new Promise((resolve, reject) => {
        const postData = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
        const opts = {
            hostname: 'id.twitch.tv',
            path: '/oauth2/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try {
                    const p = JSON.parse(data);
                    if (p.access_token) { _helixToken = p.access_token; _helixExpiry = now + p.expires_in * 1000; resolve(_helixToken); }
                    else reject(new Error('Token error: ' + data));
                } catch (e) { reject(e); }
            });
        });
        req.setTimeout(15000, () => req.destroy(new Error('Token request timed out')));
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Makes a Helix API GET request with retry on 429.
 * @param {string} reqPath
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {AbortSignal} signal
 * @param {number} [tryCount]
 * @returns {Promise<any>}
 */
async function helixRequest(reqPath, clientId, clientSecret, signal, tryCount = 0) {
    const token = await getAppAccessToken(clientId, clientSecret);
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.twitch.tv', path: reqPath, method: 'GET',
            headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 429 && tryCount < 3) {
                        const ra = res.headers['retry-after'] ? parseInt(res.headers['retry-after'], 10) : 1;
                        setTimeout(() => resolve(helixRequest(reqPath, clientId, clientSecret, signal, tryCount + 1)), ra * 1000);
                    } else if (res.statusCode !== 200) reject(new Error(`Helix ${res.statusCode}: ${data}`));
                    else resolve(parsed);
                } catch (e) { reject(e); }
            });
        });
        req.setTimeout(15000, () => req.destroy(new Error('Helix request timed out')));
        req.on('error', reject);
        req.end();
    });
}

// ---------- Chat Message Transform ----------

/** @param {object} msg - Raw GQL edge */
function transformMessage(msg) {
    let ret = {
        created: msg.node.createdAt ?? '1970-01-01T00:00:00.000Z',
        offset: msg.node.contentOffsetSeconds ?? 0,
        user: (msg.node.commenter?.login ?? msg.node.commenter?.displayName ?? 'null').toLowerCase(),
        message: '',
    };
    for (const frag of msg.node.message.fragments) {
        if ((!frag.type || frag.type === 'text') && typeof frag.text === 'string') ret.message += frag.text;
    }
    return ret;
}

// ---------- Discord Webhook ----------

/**
 * Sends a match alert to Discord.
 * @param {string} webhookUrl
 * @param {string} streamerName
 * @param {string} user
 * @param {string} text
 */
function sendDiscordWebhook(webhookUrl, streamerName, user, text) {
    if (!webhookUrl) return;
    try {
        const payload = {
            content: null,
            embeds: [{
                title: 'Found on Twitch',
                description: `Twitch Streamer:\nhttps://twitch.tv/${streamerName}`,
                color: 12790527,
                fields: [{ name: 'Message Content:', value: `**${user}**: ${text}` }],
                footer: { text: 'Scanned at', icon_url: 'https://cdn.discordapp.com/emojis/1474423498398236683.webp?size=96' },
                timestamp: new Date().toISOString(),
                thumbnail: { url: 'https://cdn.discordapp.com/emojis/1474423498398236683.webp?size=96' },
            }],
            attachments: [],
        };
        const u = new URL(webhookUrl);
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { res.on('data', () => { }); });
        req.on('error', () => { });
        req.write(JSON.stringify(payload));
        req.end();
    } catch { /* noop */ }
}

// ---------- Semaphore (matches original ChatDownloader pattern) ----------

/**
 * A counting semaphore for limiting concurrent async operations.
 * Why: The original ChatDownloader uses acquire/release to cap downloads
 * at maxDownloads=3. We replicate that exact pattern here.
 */
class Semaphore {
    constructor(maxConcurrent) {
        this.max = maxConcurrent;
        this.active = 0;
        this._queue = [];
    }
    async acquire() {
        if (this.active < this.max) { this.active++; return; }
        return new Promise((resolve) => this._queue.push(resolve));
    }
    release() {
        if (this._queue.length > 0) { this._queue.shift()(); }
        else { this.active--; }
    }
}

// ================================================================
// TwitchScraper Class
// ================================================================

class TwitchScraper extends BaseScraper {
    constructor(config, eventBus) {
        super('twitch', config, eventBus);
        this.cacheDir = path.resolve(__dirname, '../../cache/twitch');
        this._abortController = null;
    }

    /** @override */
    async initialize() {
        if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
        this.log('info', 'TwitchScraper initialized.');
    }

    /** @override – starts the continuous scan loop */
    async start() {
        await super.start();
        this._abortController = new AbortController();
        await this.initialize();
        this.setState(BaseScraper.STATES.RUNNING);

        // Run scan loop in background (non-blocking)
        this._loopPromise = this._scanLoop().catch((err) => {
            this.log('error', `Loop crashed: ${err.message}`);
            this.setState(BaseScraper.STATES.ERROR);
        });
    }

    /** @override */
    async stop() {
        this._running = false;
        if (this._abortController) this._abortController.abort();
        this._wakeUp();
        this.setState(BaseScraper.STATES.STOPPING);
        if (this._loopPromise) await this._loopPromise.catch(() => { });
        this.setState(BaseScraper.STATES.STOPPED);
    }

    /** @override */
    async resume() {
        if (this.state !== BaseScraper.STATES.PAUSED) return;
        this._running = true;
        this._abortController = new AbortController();
        this.setState(BaseScraper.STATES.RUNNING);
        this._loopPromise = this._scanLoop().catch((err) => {
            this.log('error', `Loop crashed: ${err.message}`);
            this.setState(BaseScraper.STATES.ERROR);
        });
    }

    // ---------- Internal Scan Loop ----------

    async _scanLoop() {
        const interval = (this.config.scanIntervalMinutes || 10) * 60000;

        while (this._running) {
            try {
                this.log('info', '--- Scan cycle starting ---');
                await this._performScan();
                this.log('info', `--- Scan complete. Waiting ${interval / 60000}m ---`);
            } catch (err) {
                if (!this._running) break;
                this.log('error', `Scan error: ${err.message}`);
                this.reportStats({ errors: 1 });
            }

            if (!this._running) break;
            await this.sleep(interval);
        }
    }

    /** Executes one full scan cycle: discover streams → get VODs → download & search chat. */
    async _performScan() {
        const signal = this._abortController.signal;
        const clientId = this.config.TWITCH_CLIENT_ID;
        const clientSecret = this.config.TWITCH_CLIENT_SECRET;
        const webhookUrl = this.config.DISCORD_WEBHOOK || '';
        const keywords = this.config.keywords || ['aternos', 'exaroton'];
        const targetDomains = this.config.targetDomains || ['aternos.me', 'exaroton.me'];
        const maxViewers = this.config.maxViewers ?? 10;
        const maxVODs = this.config.maxVODs || 1;

        // Generate random 5-char instance ID (letters + digits)
        const instanceId = Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
        // Per-instance domain dedup: skip webhook if same domain string already sent this cycle
        const sentDomains = new Set();

        // 1) Discover Minecraft streams via Helix
        this.log('info', `[${instanceId}] Discovering Minecraft streams (max viewers: ${maxViewers})...`);
        const streamers = await this._getMinecraftStreamers(clientId, clientSecret, signal, maxViewers);
        this.log('info', `[${instanceId}] Found ${streamers.length} streamers.`);
        if (streamers.length === 0) return;

        // 2) Get latest VOD for each streamer
        const vodMap = {}; // vodId → streamerName
        for (const streamer of streamers) {
            if (!this._running) return;
            try {
                const vodIds = await this._getRecentVODs(streamer, maxVODs, signal);
                for (const id of vodIds) vodMap[id] = streamer;
            } catch (err) {
                this.log('warn', `VOD fetch failed for ${streamer}: ${err.message}`);
            }
        }

        const vodIds = Object.keys(vodMap);
        this.log('info', `[${instanceId}] Scanning ${vodIds.length} VODs (semaphore=3, matching original)...`);

        // 3) Download & search using semaphore-based concurrency (matches original ChatDownloader exactly)
        const sem = new Semaphore(3);
        let completed = 0;

        /**
         * Processes a single VOD: acquire semaphore → download chat → search → release.
         * This matches the original ChatDownloader.getChatReplays pattern where
         * ALL vodIds are launched as promises simultaneously, with the semaphore
         * limiting active downloads to 3.
         */
        const processVod = async (vodId) => {
            const cachePath = path.join(this.cacheDir, `${vodId}.json`);
            let isCacheHit = false;

            try {
                let messages;
                if (fs.existsSync(cachePath)) {
                    // Cache hit — no semaphore needed (matches original: only acquire for downloads)
                    messages = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    isCacheHit = true;
                    this.reportStats({ cacheHits: 1 });
                } else {
                    // Cache miss — acquire semaphore, download, release (matches original pattern)
                    await sem.acquire();
                    try {
                        messages = await this._downloadChat(vodId, signal);
                    } finally {
                        sem.release();
                    }
                }

                this.reportStats({ scanned: 1 });
                completed++;
                let matchCount = 0;

                for (const msg of messages) {
                    const lower = msg.message.toLowerCase();
                    for (const kw of keywords) {
                        if (lower.includes(kw)) {
                            matchCount++;
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
                                vodId,
                                streamer: vodMap[vodId],
                                user: msg.user,
                                message: msg.message,
                                keyword: kw,
                                isDomain,
                                instanceId,
                                time: new Date(),
                            });
                            // Only send webhook if domain not already sent this instance
                            if (isDomain && foundDomain && !sentDomains.has(foundDomain)) {
                                sentDomains.add(foundDomain);
                                sendDiscordWebhook(webhookUrl, vodMap[vodId], msg.user, msg.message);
                                this.log('info', `[${instanceId}] Webhook sent for: ${foundDomain}`);
                            } else if (isDomain && foundDomain) {
                                this.log('debug', `[${instanceId}] Skipped duplicate domain: ${foundDomain}`);
                            }
                            break;
                        }
                    }
                }
                if (matchCount > 0) this.log('info', `[${instanceId}] VOD ${vodId} (${vodMap[vodId]}): ${matchCount} matches`);
                if (completed % 50 === 0) this.log('info', `[${instanceId}] Progress: ${completed}/${vodIds.length} VODs scanned`);
            } catch (err) {
                if (err === -1) return; // Quiet abort (matches original)
                completed++;
                this.log('warn', `Chat download failed for VOD ${vodId}: ${err.message}`);
                this.reportStats({ errors: 1 });
            }
        };

        // Launch ALL VODs as concurrent promises (semaphore throttles to 3 active)
        // This exactly matches: let workers = videoIDs.map(retrieveData) from original
        await Promise.all(vodIds.map(processVod));

        this.log('info', `[${instanceId}] Finished: ${completed}/${vodIds.length} VODs scanned (${sentDomains.size} unique domains sent)`);
        this.reportStats({ lastScanTime: new Date() });
    }

    // ---------- Helix: Stream Discovery ----------

    /**
     * Gets Minecraft streamer login names filtered by viewer count.
     * @param {string} clientId
     * @param {string} clientSecret
     * @param {AbortSignal} signal
     * @param {number} maxViewers
     * @returns {Promise<string[]>}
     */
    async _getMinecraftStreamers(clientId, clientSecret, signal, maxViewers) {
        const gameId = '27471'; // Minecraft
        const collected = [];
        let cursor = null;
        let totalScanned = 0;
        const safetyLimit = 100000;

        while (collected.length < Infinity && totalScanned < safetyLimit) {
            if (!this._running) break;
            let reqPath = `/helix/streams?game_id=${gameId}&first=100`;
            if (cursor) reqPath += `&after=${cursor}`;

            const data = await helixRequest(reqPath, clientId, clientSecret, signal);
            if (!data?.data || data.data.length === 0) break;

            for (const s of data.data) {
                if (s.viewer_count <= maxViewers) collected.push(s.user_login);
            }
            totalScanned += data.data.length;

            if (totalScanned % 500 === 0) this.log('debug', `Scanned ${totalScanned} streams so far...`);
            if (data.pagination?.cursor) cursor = data.pagination.cursor;
            else break;
        }
        return collected;
    }

    // ---------- GQL: VOD List ----------

    /**
     * Gets recent VOD IDs for a streamer.
     * @param {string} channel
     * @param {number} limit
     * @param {AbortSignal} signal
     * @returns {Promise<string[]>}
     */
    async _getRecentVODs(channel, limit, signal) {
        const raw = await getVODListGQL(channel, limit, signal);
        if (!raw?.data?.user?.videos?.edges) return [];
        return raw.data.user.videos.edges.map((e) => e.node.id);
    }

    // ---------- GQL: Chat Download (cursor-based, matches original cacheChat) ----------

    /**
     * Downloads full chat replay for a VOD.
     * Uses cursor-based loop termination matching original chat_downloader.cacheChat.
     *
     * Why cursor-based: The original code uses `do { ... } while (cursor)`
     * where cursor is extracted from `backEdges.last?.cursor`. This properly
     * terminates when no more pages exist. The previous port used offset-only
     * comparison which could infinite-loop if offset didn't change.
     *
     * @param {string} videoID
     * @param {AbortSignal} signal
     * @returns {Promise<Array<{created:string, offset:number, user:string, message:string}>>}
     */
    async _downloadChat(videoID, signal) {
        const messages = [];
        let offset = 0;
        let cursor = undefined;
        const lastIDSet = new Set();
        let prevOffset = -1;

        do {
            if (signal.aborted) throw -1; // Quiet abort matching original

            const part = await getChatReplayPart(videoID, offset, signal);
            const isArr = Array.isArray(part);

            // End-of-VOD detection (matches original exactly)
            if (isArr && part[0]?.data?.video?.comments === null) break;
            if (!isArr && !Array.isArray(part[0]?.data?.video?.comments?.edges)) break;

            const last = isArr ? part[part.length - 1] : part;
            if (last?.data?.video?.comments == null) break;

            const backEdges = last.data.video.comments.edges;
            if (!backEdges || backEdges.length === 0) break;

            const newOffset = backEdges[backEdges.length - 1]?.node?.contentOffsetSeconds;
            if (newOffset === undefined || newOffset === null) break;

            // Safety: if offset hasn't changed, we're stuck in a loop
            if (newOffset === prevOffset) break;
            prevOffset = newOffset;

            // Filter duplicate messages using ID set (matches original)
            part[0].data.video.comments.edges = part[0].data.video.comments.edges.filter((m) => !lastIDSet.has(m.node.id));
            lastIDSet.clear();
            backEdges.forEach((m) => lastIDSet.add(m.node.id));

            // Collect messages from all parts (matches original concat pattern)
            for (let i = 0; i < (isArr ? part.length : 1); i++) {
                const edges = i === 0 ? part[0].data.video.comments.edges : part[i].data.video.comments.edges;
                for (const edge of edges) {
                    try { messages.push(transformMessage(edge)); } catch { /* malformed msg, skip */ }
                }
            }

            offset = newOffset;
            // Cursor-based termination (matches original: `while (cursor)`)
            cursor = backEdges[backEdges.length - 1]?.cursor ?? undefined;
        } while (cursor);

        // Cache to disk (matches original cacheChat)
        const cachePath = path.join(this.cacheDir, `${videoID}.json`);
        try { fs.writeFileSync(cachePath, JSON.stringify(messages)); } catch { /* non-fatal */ }
        return messages;
    }
}

module.exports = TwitchScraper;
