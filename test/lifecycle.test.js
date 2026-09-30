"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const BaseScraper = require('../src/scrapers/BaseScraper');
const ScraperProxy = require('../src/workers/ScraperProxy');
const EventBus = require('../src/core/EventBus');
const ControlManager = require('../src/core/ControlManager');

class SlowScraper extends BaseScraper {
    constructor(bus) { super('twitch', { scanIntervalMinutes: 10 }, bus); this.active = 0; this.maxActive = 0; this.cycles = 0; }
    async initialize() {}
    async _performScan() {
        this.active++;
        this.maxActive = Math.max(this.active, this.maxActive);
        this.cycles++;
        await this.sleep(60000);
        this.active--;
    }
}
class FakeWorker extends EventEmitter {
    constructor() { super(); this.commands = []; this.terminated = false; }
    postMessage(msg) {
        this.commands.push(msg.command);
        if (msg.command === 'stop') queueMicrotask(() => this.emit('message', { type: 'state', data: { state: 'stopped' } }));
    }
    async terminate() { this.terminated = true; this.emit('exit', 1); }
}

test('pause joins the active scan before resume, without overlapping loops', async () => {
    const scraper = new SlowScraper(new EventBus());
    await scraper.start();
    for (let i = 0; i < 4; i++) { await scraper.pause(); assert.equal(scraper.active, 0); await scraper.resume(); }
    await scraper.stop();
    assert.equal(scraper.maxActive, 1);
    assert.equal(scraper.cycles, 5);
    assert.equal(scraper.state, 'stopped');
});
test('stop wakes every concurrent scraper sleep immediately', async () => {
    const scraper = new SlowScraper(new EventBus());
    await scraper.start();
    const sleepers = [scraper.sleep(60000), scraper.sleep(60000)];
    await scraper.stop();
    await Promise.all(sleepers);
    assert.equal(scraper._sleeps.size, 0);
});
test('command queue serializes rapid pause, resume and restart', async () => {
    const bus = new EventBus();
    const scraper = new SlowScraper(bus);
    const manager = new ControlManager(bus, { twitch: scraper }, { markStarted() {} });
    await manager.execute('twitch', 'start');
    await Promise.all(['pause', 'resume', 'restart', 'pause', 'resume'].map(command => manager.execute('twitch', command)));
    assert.equal(scraper.maxActive, 1);
    assert.equal(scraper.state, 'running');
    await manager.execute('twitch', 'stop');
});
test('failed initialization reports error instead of remaining starting', async () => {
    const scraper = new SlowScraper(new EventBus());
    scraper.initialize = async () => { throw new Error('failed setup'); };
    await assert.rejects(scraper.start(), /failed setup/);
    assert.equal(scraper.state, 'error');
    assert.equal(scraper._running, false);
    await scraper.stop();
});
test('worker crash clears stale reference and allows a fresh worker', async () => {
    const bus = new EventBus();
    const states = [];
    bus.subscribe('state', e => states.push(e));
    const workers = [];
    const proxy = new ScraperProxy('twitch', {}, bus, { workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w; }, stopTimeoutMs: 30 });
    await proxy.start();
    assert.equal(proxy.state, 'starting');
    workers[0].emit('message', { type: 'state', data: { state: 'running' } });
    workers[0].emit('exit', 1);
    assert.equal(proxy.state, 'error');
    assert.equal(proxy._worker, null);
    assert.equal(states.at(-1).previousState, 'running');
    await proxy.start();
    workers[0].emit('message', { type: 'state', data: { state: 'error' } });
    assert.equal(proxy.state, 'starting');
    await proxy.stop();
    assert.equal(proxy.state, 'stopped');
    assert.ok(workers[1].terminated);
});
test('duplicate start does not send overlapping initialization commands', async () => {
    const worker = new FakeWorker();
    const proxy = new ScraperProxy('kick', {}, new EventBus(), { workerFactory: () => worker });
    await Promise.all([proxy.start(), proxy.start()]);
    assert.deepEqual(worker.commands, ['start']);
    await proxy.stop();
});
test('worker stop is idempotent and bounded when acknowledgements never arrive', async () => {
    const worker = new FakeWorker();
    worker.postMessage = () => {};
    const proxy = new ScraperProxy('twitch', {}, new EventBus(), { workerFactory: () => worker, stopTimeoutMs: 10 });
    await proxy.start();
    const first = proxy.stop();
    assert.equal(proxy.stop(), first);
    await first;
    assert.equal(proxy.state, 'stopped');
    assert.ok(worker.terminated);
});

test('stop during initialization cancels setup without returning to running', async () => {
    const scraper = new SlowScraper(new EventBus());
    let entered;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    scraper.initialize = async () => {
        entered();
        await new Promise(resolve => scraper._abortController.signal.addEventListener('abort', resolve, { once: true }));
    };
    const starting = scraper.start();
    await enteredPromise;
    await scraper.stop();
    await starting;
    assert.equal(scraper.state, 'stopped');
    assert.equal(scraper.cycles, 0);
});

test('real worker stop interrupts setup and acknowledges cleanup without timeout', async () => {
    const { Worker } = require('node:worker_threads');
    const path = require('node:path');
    const bus = new EventBus();
    const initEntered = new Promise(resolve => bus.subscribe('log', entry => { if (entry.message === 'init entered') resolve(); }));
    const warnings = [];
    bus.subscribe('log', entry => { if (entry.level === 'warn') warnings.push(entry.message); });
    const script = `
        const Base = require(${JSON.stringify(path.resolve(__dirname, '../src/scrapers/BaseScraper'))});
        class Slow extends Base {
            constructor(config, bus) { super('twitch', config, bus); }
            async initialize() {
                this.log('info', 'init entered');
                await new Promise(resolve => this._abortController.signal.addEventListener('abort', resolve, { once: true }));
            }
            async _performScan() {}
        }
        require(${JSON.stringify(path.resolve(__dirname, '../src/workers/runWorker'))})(Slow);
    `;
    const proxy = new ScraperProxy('twitch', {}, bus, { workerFactory: (_, options) => new Worker(script, { ...options, eval: true }), stopTimeoutMs: 1000 });
    await proxy.start();
    await initEntered;
    await proxy.stop();
    assert.equal(proxy.state, 'stopped');
    assert.deepEqual(warnings, []);
});
