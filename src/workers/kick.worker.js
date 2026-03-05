"use strict";

const { parentPort, workerData } = require('worker_threads');

/**
 * Worker thread entry point for KickScraper.
 * Runs the Puppeteer-based scraper in an isolated thread.
 *
 * Why worker_threads for Kick: Puppeteer consumes significant memory
 * and CPU for Cloudflare bypass renders. Isolating it prevents the
 * main thread's blessed UI from stuttering during page loads.
 *
 * Protocol: Same as twitch.worker.js
 *   Main → Worker: { type: 'command', command: 'start'|'stop'|'pause'|'resume' }
 *   Worker → Main: { type: 'log'|'stats'|'state'|'match', data: {...} }
 */

const EventBus = require('../core/EventBus');
const KickScraper = require('../scrapers/KickScraper');

// Create a local EventBus that forwards events to main thread via postMessage
const eventBus = new EventBus();

// Forward all events from local bus to main thread
for (const event of ['log', 'stats', 'state', 'match']) {
    eventBus.subscribe(event, (data) => {
        parentPort.postMessage({ type: event, data });
    });
}

// Create scraper with config passed from main thread
const scraper = new KickScraper(workerData.config, eventBus);

// Listen for commands from main thread
parentPort.on('message', async (msg) => {
    if (msg.type !== 'command') return;
    try {
        switch (msg.command) {
            case 'start': await scraper.start(); break;
            case 'stop': await scraper.stop(); break;
            case 'pause': await scraper.pause(); break;
            case 'resume': await scraper.resume(); break;
            case 'restart':
                if (scraper.state !== 'stopped') await scraper.stop();
                await scraper.start();
                break;
        }
    } catch (err) {
        parentPort.postMessage({
            type: 'log',
            data: { source: 'kick', level: 'error', message: `Command '${msg.command}' failed: ${err.message}`, timestamp: new Date() },
        });
    }
});

// Report that the worker is ready
parentPort.postMessage({
    type: 'log',
    data: { source: 'kick', level: 'info', message: 'Kick worker thread started.', timestamp: new Date() },
});
