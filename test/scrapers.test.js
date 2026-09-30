"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventBus = require('../src/core/EventBus');
const TwitchScraper = require('../src/scrapers/TwitchScraper');
const KickScraper = require('../src/scrapers/KickScraper');
const ConfigManager = require('../src/core/ConfigManager');
const { requestJson } = require('../src/utils/http');

function twitch(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-vod-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return new TwitchScraper({ cacheDir: dir }, new EventBus());
}
const node = (id, text = 'play.aternos.me') => ({ id, createdAt: '2026-01-01', contentOffsetSeconds: 1, commenter: { login: 'test' }, message: { fragments: [{ text }] } });
const page = (nodes, cursor, hasNextPage) => ({ data: { video: { comments: { edges: nodes.map(n => ({ node: n, cursor })), pageInfo: { hasNextPage } } } } });

test('Twitch chat accepts object and array pages, cursor advances, duplicate IDs collapse', async t => {
    const scraper = twitch(t);
    const cursors = [];
    scraper._getChatReplayPart = async (id, offset, cursor) => {
        cursors.push(cursor);
        return cursor ? [page([node('1'), node('2')], 'second', false)] : page([node('1')], 'first', true);
    };
    const messages = await scraper._downloadChat('123', new AbortController().signal);
    assert.equal(messages.length, 2);
    assert.deepEqual(cursors, [undefined, 'first']);
    assert.equal(scraper._readCache('123').length, 2);
});
test('stalled pagination and API errors never produce a partial cache', async t => {
    const scraper = twitch(t);
    scraper._getChatReplayPart = async () => [page([node('1')], 'repeat', true)];
    await assert.rejects(scraper._downloadChat('123', new AbortController().signal), /stalled/);
    assert.equal(scraper._readCache('123'), null);
    scraper._getChatReplayPart = async () => ({ errors: [{ message: 'unavailable' }] });
    await assert.rejects(scraper._downloadChat('124', new AbortController().signal), /GraphQL/);
    assert.equal(scraper._readCache('124'), null);
});
test('aborted chat downloads do not cache empty or incomplete replays', async t => {
    const scraper = twitch(t);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(scraper._downloadChat('123', controller.signal));
    assert.equal(fs.existsSync(path.join(scraper.cacheDir, '123.json')), false);
});
test('expired, legacy and malformed VOD caches are redownloaded', t => {
    const scraper = twitch(t);
    for (const cached of [[], { version: 1, savedAt: 0, messages: [] }, { version: 1, savedAt: Date.now(), messages: null }]) {
        fs.writeFileSync(path.join(scraper.cacheDir, '123.json'), JSON.stringify(cached));
        assert.equal(scraper._readCache('123'), null);
    }
});
test('Twitch missing credentials fail before making network requests', async t => {
    const scraper = twitch(t);
    await assert.rejects(scraper.start(), /TWITCH_CLIENT_ID/);
    assert.equal(scraper.state, 'error');
});
test('Kick title, chat and pinned matches keep viewers and canonical domains', async () => {
    const bus = new EventBus();
    const matches = [];
    bus.subscribe('match', e => matches.push(e.data));
    const scraper = new KickScraper({}, bus);
    scraper._running = true;
    scraper.sleep = async () => {};
    scraper._safeFetch = async url => url.includes('/livestreams')
        ? { data: { livestreams: [{ channel: { username: 'streamer', id: 1 }, title: 'play.aternos.me', viewer_count: 7 }], pagination: {} } }
        : { data: { messages: [{ content: 'other.exaroton.me:25566' }], pinned_message: { message: { content: 'pinned.aternos.me' } } } };
    await scraper._performScan();
    assert.deepEqual(matches.map(m => m.location), ['TITLE', 'CHAT', 'PINNED']);
    assert.ok(matches.every(m => m.viewers === 7));
    assert.deepEqual(matches[1].addresses, ['other.exaroton.me:25566']);
});
test('JSON HTTP retries transient failures and stops during retry delay', async () => {
    let attempts = 0;
    const fetchImpl = async () => (++attempts === 1 ? new Response('', { status: 503, headers: { 'Retry-After': '0' } }) : new Response('{"ok":true}', { status: 200 }));
    assert.deepEqual(await requestJson('https://example.invalid', {}, { fetchImpl }), { ok: true });
    assert.equal(attempts, 2);
    const controller = new AbortController();
    const pending = requestJson('https://example.invalid', {}, { signal: controller.signal, fetchImpl: async () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }) });
    controller.abort();
    await assert.rejects(pending);
});
test('non-retryable HTTP failures do not leak response bodies', async () => {
    await assert.rejects(requestJson('https://example.invalid', {}, { fetchImpl: async () => new Response('client_secret=private', { status: 400 }) }), error => error.message === 'HTTP 400');
});
test('configuration defaults merge and invalid values fail without overwriting file', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-config-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const manager = new ConfigManager(new EventBus(), { configDir: dir });
    manager.loadAll();
    assert.equal(manager.get('app', 'twitch.maxDownloads'), 3);
    const before = fs.readFileSync(path.join(dir, 'app.json'), 'utf8');
    assert.throws(() => manager.set('app', 'twitch.maxDownloads', 0), /between/);
    assert.equal(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'), before);
    fs.writeFileSync(path.join(dir, 'app.json'), '{broken');
    assert.throws(() => manager.loadAll(), /Invalid config/);
});
