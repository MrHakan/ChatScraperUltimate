"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventBus = require('../src/core/EventBus');
const DiscoveryManager = require('../src/core/DiscoveryManager');
const WebhookNotifier = require('../src/core/WebhookNotifier');
const { extractAddresses } = require('../src/utils/domains');
const { safe, plain } = require('../src/utils/display');

function setup(t, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-discovery-'));
    const bus = new EventBus();
    const store = new DiscoveryManager(bus, { filePath: path.join(dir, 'discoveries.json'), ...options });
    store.start();
    t.after(() => { store.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
    return { dir, bus, store };
}
const sighting = (source, text, streamer = 'sample') => ({ source, data: { message: text, streamer, viewers: 5, location: 'CHAT' } });

test('extracts complete addresses, punctuation, case and distinct ports', () => {
    assert.deepEqual(extractAddresses('IP: (Play.Aternos.me:25565), play.aternos.me:25566! https://second.exaroton.me/path'), ['play.aternos.me', 'play.aternos.me:25566', 'second.exaroton.me']);
});
test('rejects bare domains, suffix lookalikes, invalid labels and invalid ports', () => {
    assert.deepEqual(extractAddresses('aternos.me evilaternos.me play.aternos.me.evil.com -play.aternos.me play.aternos.me:0 play.aternos.me:65536 play.aternos.me:123456'), []);
});
test('supports configured suffixes and multiple addresses', () => {
    assert.deepEqual(extractAddresses('one.example.net TWO.example.net', ['example.net']), ['one.example.net', 'two.example.net']);
});
test('deduplicates across sources and preserves metadata after restart', t => {
    const { bus, store } = setup(t);
    const fresh = [];
    bus.subscribe('discovery', e => fresh.push(e.isNew));
    bus.publish('match', sighting('twitch', 'PLAY.aternos.me:25565', 'alice'));
    bus.publish('match', sighting('kick', 'play.aternos.me', 'bob'));
    bus.publish('match', sighting('kick', 'play.aternos.me', 'bob'));
    assert.deepEqual(fresh, [true, false, false]);
    assert.equal(store.records.size, 1);
    assert.equal(store.query()[0].count, 3);
    assert.equal(store.query()[0].sightings.length, 2);
    store.toggle('play.aternos.me', 'favorite');
    store.save();
    const reopened = new DiscoveryManager(new EventBus(), { filePath: store.filePath });
    reopened.start();
    assert.equal(reopened.query({ status: 'favorites' }).length, 1);
    reopened.stop();
});
test('search, source filters, favorites, archive and restore compose', t => {
    const { bus, store } = setup(t);
    bus.publish('match', sighting('twitch', 'build.aternos.me', 'alice'));
    bus.publish('match', sighting('kick', 'join play.exaroton.me', 'bob'));
    assert.equal(store.query({ search: 'bob', source: 'kick' }).length, 1);
    store.toggle('play.exaroton.me', 'archived');
    assert.equal(store.query().length, 1);
    assert.equal(store.query({ status: 'archived' }).length, 1);
    store.toggle('play.exaroton.me', 'archived');
    assert.equal(store.query().length, 2);
});
test('bounded history retains favorites before older unstarred records', t => {
    const { bus, store } = setup(t, { maxEntries: 2 });
    bus.publish('match', sighting('twitch', 'one.aternos.me'));
    store.toggle('one.aternos.me', 'favorite');
    bus.publish('match', sighting('twitch', 'two.aternos.me'));
    bus.publish('match', sighting('twitch', 'three.aternos.me'));
    assert.equal(store.records.size, 2);
    assert.ok(store.records.has('one.aternos.me'));
});
test('exports current filter and protects CSV formula fields', t => {
    const { bus, store, dir } = setup(t);
    bus.publish('match', sighting('twitch', 'one.aternos.me', '=1+1'));
    bus.publish('match', sighting('kick', 'two.aternos.me'));
    const exported = store.export('json', { source: 'twitch' }, dir);
    assert.equal(JSON.parse(fs.readFileSync(exported)).records.length, 1);
    const csv = fs.readFileSync(store.export('csv', { source: 'twitch' }, dir), 'utf8');
    assert.ok(csv.includes('"\'=1+1"'));
    assert.ok(!csv.includes('two.aternos.me'));
});
test('corrupt discovery file is backed up before saving new history', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-corrupt-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'discoveries.json');
    fs.writeFileSync(file, '{broken');
    const store = new DiscoveryManager(new EventBus(), { filePath: file });
    store.start();
    store.stop();
    assert.ok(fs.readdirSync(dir).some(f => f.startsWith('discoveries.json.corrupt-')));
});
test('only a new canonical server produces a webhook, mentions disabled', async t => {
    const { bus } = setup(t);
    const requests = [];
    const notifier = new WebhookNotifier(bus, { twitch: { DISCORD_WEBHOOK: 'https://example.invalid' } }, { request: async (...args) => requests.push(args) });
    notifier.start();
    bus.publish('match', sighting('twitch', 'one.aternos.me'));
    bus.publish('match', sighting('twitch', 'one.aternos.me:25565'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0][1].body).allowed_mentions.parse, []);
    notifier.stop();
});
test('external terminal content cannot inject ANSI or blessed formatting', () => {
    assert.equal(plain('\x1b[31mhello\x07'), 'hello ');
    assert.equal(safe('{red-fg}boom{/red-fg}'), '{open}red-fg{close}boom{open}/red-fg{close}');
});
