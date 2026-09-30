"use strict";

const fs = require('fs');
const path = require('path');
const BaseScraper = require('./BaseScraper');
const { requestJson } = require('../utils/http');
const { matchText } = require('../utils/domains');

class TwitchScraper extends BaseScraper {
    constructor(config, eventBus) {
        super('twitch', config, eventBus);
        this.cacheDir = config.cacheDir || path.resolve(__dirname, '../../cache/twitch');
        this._token = null;
        this._tokenExpiry = 0;
        this._streams = new Map();
    }

    async initialize() {
        for (const key of ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET']) {
            if (!this.config[key] || this.config[key].startsWith('your_')) throw new Error(`Set ${key} in config/twitch.env before starting Twitch`);
        }
        fs.mkdirSync(this.cacheDir, { recursive: true });
        const files = fs.readdirSync(this.cacheDir).filter(f => /^\d+\.json$/.test(f)).map(name => ({ name, mtime: fs.statSync(path.join(this.cacheDir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
        for (const file of files.slice(this.config.maxCachedVODs ?? 2000)) fs.unlinkSync(path.join(this.cacheDir, file.name));
        this.log('info', 'Twitch ready');
    }

    async _helix(reqPath) {
        const signal = this._abortController.signal;
        if (!this._token || this._tokenExpiry < Date.now() + 60000) {
            const token = await requestJson('https://id.twitch.tv/oauth2/token', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ client_id: this.config.TWITCH_CLIENT_ID, client_secret: this.config.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }).toString(),
            }, { signal });
            if (!token?.access_token) throw new Error('Twitch did not issue an access token');
            this._token = token.access_token;
            this._tokenExpiry = Date.now() + token.expires_in * 1000;
        }
        try {
            return await requestJson(`https://api.twitch.tv${reqPath}`, { headers: { 'Client-ID': this.config.TWITCH_CLIENT_ID, Authorization: `Bearer ${this._token}` } }, { signal });
        } catch (error) {
            if (error.message === 'HTTP 401') { this._token = null; this._tokenExpiry = 0; }
            throw error;
        }
    }

    async _gql(payload, signal) {
        const response = await requestJson('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }, body: JSON.stringify(payload) }, { signal });
        const parts = Array.isArray(response) ? response : [response];
        if (parts.some(part => part?.errors?.length)) throw new Error('Twitch chat API returned GraphQL errors');
        return response;
    }

    _reportText(message, details) {
        const match = matchText(message, this.config);
        if (match.matched) this.reportMatch({ ...details, ...match, message, time: new Date() });
    }

    async _getMinecraftStreamers(clientId, clientSecret, signal, maxViewers) {
        const collected = new Set();
        const cursors = new Set();
        this._streams.clear();
        let cursor = null;
        let page = 0;
        do {
            if (!this._running || signal.aborted) break;
            const data = await this._helix(`/helix/streams?game_id=27471&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
            if (!Array.isArray(data?.data)) throw new Error('Unexpected Twitch stream response');
            for (const stream of data.data) {
                if (stream.viewer_count > maxViewers || !stream.user_login) continue;
                collected.add(stream.user_login);
                this._streams.set(stream.user_login, stream);
                this._reportText(stream.title, { streamer: stream.user_login, viewers: stream.viewer_count, location: 'TITLE' });
            }
            cursor = data.pagination?.cursor;
            if (cursor && cursors.has(cursor)) throw new Error('Twitch stream pagination stalled');
            if (cursor) cursors.add(cursor);
        } while (cursor && ++page < 1000);
        return [...collected];
    }

    async _getRecentVODs(channel, limit, signal) {
        const raw = await this._gql({
            query: 'query($limit:Int!,$login:String!){user(login:$login){videos(first:$limit,type:ARCHIVE,sort:TIME){edges{node{id}}}}}',
            variables: { limit, login: channel },
        }, signal);
        return (raw?.data?.user?.videos?.edges || []).map(e => e.node.id);
    }

    async _performScan() {
        const signal = this._abortController.signal;
        const streamers = await this._getMinecraftStreamers(this.config.TWITCH_CLIENT_ID, this.config.TWITCH_CLIENT_SECRET, signal, this.config.maxViewers ?? 10);
        this.log('info', `Discovered ${streamers.length} eligible streams`);
        const jobs = new Map();
        for (const streamer of streamers) {
            if (!this._running) return;
            try {
                const vods = await this._getRecentVODs(streamer, this.config.maxVODs ?? 1, signal);
                for (const vod of vods) if (/^\d+$/.test(vod)) jobs.set(vod, streamer);
            } catch (error) {
                if (signal.aborted) return;
                this.log('warn', `VOD list unavailable for ${streamer}: ${error.message}`);
                this.reportStats({ errors: 1 });
            }
        }
        const queue = [...jobs];
        let next = 0;
        const concurrency = this.config.maxDownloads ?? 3;
        await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (this._running && next < queue.length) {
                const [vodId, streamer] = queue[next++];
                try {
                    let messages = this._readCache(vodId);
                    if (messages) this.reportStats({ cacheHits: 1 });
                    else messages = await this._downloadChat(vodId, signal);
                    if (!this._running) return;
                    const viewers = this._streams.get(streamer)?.viewer_count;
                    for (const msg of messages) {
                        if (typeof msg.message !== 'string') continue;
                        this._reportText(msg.message, { vodId, streamer, viewers, user: msg.user, offset: msg.offset, location: 'VOD' });
                    }
                    this.reportStats({ scanned: 1 });
                } catch (error) {
                    if (signal.aborted) return;
                    this.log('warn', `VOD ${vodId} failed: ${error.message}`);
                    this.reportStats({ errors: 1 });
                }
            }
        }));
    }

    _readCache(vodId) {
        try {
            const cached = JSON.parse(fs.readFileSync(path.join(this.cacheDir, `${vodId}.json`), 'utf8'));
            const age = Date.now() - cached.savedAt;
            if (cached.version === 1 && age >= 0 && age < (this.config.cacheTTLMinutes ?? 360) * 60000 && Array.isArray(cached.messages)) return cached.messages;
        } catch { /* absent, legacy or damaged cache: redownload */ }
        return null;
    }

    async _getChatReplayPart(videoID, offset, cursor, signal) {
        return this._gql([{
            operationName: 'VideoCommentsByOffsetOrCursor',
            variables: { videoID: String(videoID), ...(cursor ? { cursor } : { contentOffsetSeconds: offset }) },
            extensions: { persistedQuery: { version: 1, sha256Hash: 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a' } },
        }], signal);
    }

    async _downloadChat(videoID, signal) {
        const messages = [];
        const ids = new Set();
        const cursors = new Set();
        let cursor;
        let page = 0;
        do {
            signal.throwIfAborted();
            const raw = await this._getChatReplayPart(videoID, 0, cursor, signal);
            const parts = Array.isArray(raw) ? raw : [raw];
            let comments;
            for (const part of parts) {
                if (part?.errors?.length) throw new Error('Twitch chat API returned GraphQL errors');
                comments = part?.data?.video?.comments;
                if (comments === null) break;
                if (!Array.isArray(comments?.edges)) throw new Error('Unexpected Twitch chat response; cache was not updated');
                for (const edge of comments.edges) {
                    const node = edge?.node;
                    if (!node?.id || ids.has(node.id)) continue;
                    ids.add(node.id);
                    messages.push({ created: node.createdAt, offset: node.contentOffsetSeconds ?? 0, user: node.commenter?.login || node.commenter?.displayName || '?', message: (node.message?.fragments || []).map(f => f.text || '').join('') });
                }
            }
            cursor = comments?.pageInfo?.hasNextPage === false ? null : comments?.edges?.at(-1)?.cursor;
            if (cursor && cursors.has(cursor)) throw new Error('Twitch chat pagination stalled; cache was not updated');
            if (cursor) cursors.add(cursor);
            if (++page >= 10000 || messages.length > 500000) throw new Error('Chat replay exceeds safety limit; cache was not updated');
        } while (cursor);
        signal.throwIfAborted();
        const cachePath = path.join(this.cacheDir, `${videoID}.json`);
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            fs.writeFileSync(cachePath + '.tmp', JSON.stringify({ version: 1, savedAt: Date.now(), messages }));
            fs.renameSync(cachePath + '.tmp', cachePath);
        } catch (error) { this.log('warn', `Cache write failed: ${error.message}`); }
        return messages;
    }
}

module.exports = TwitchScraper;
