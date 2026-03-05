"use strict";

const { parentPort, workerData } = require('worker_threads');

/**
 * Worker thread entry point for TwitchScraper.
 * Runs the scraper in an isolated thread and communicates with the
 * main thread via message passing.
 *
 * Why worker_threads: The main thread runs the blessed UI exclusively.
 * Any CPU-bound work (message parsing, keyword matching across 1000+ VODs)
 * in the main thread would freeze the UI. Isolating scrapers into workers
 * ensures the terminal UI stays responsive.
 *
 * Protocol:
 *   Main → Worker: { type: 'command', command: 'start'|'stop'|'pause'|'resume' }
 *   Worker → Main: { type: 'log'|'stats'|'state'|'match', data: {...} }
 */

const EventBus = require('../core/EventBus');
const TwitchScraper = require('../scrapers/TwitchScraper');

// Create a local EventBus that forwards events to main thread via postMessage
const eventBus = new EventBus();

// Forward all events from local bus to main thread
for (const event of ['log', 'stats', 'state', 'match']) {
    eventBus.subscribe(event, (data) => {
        parentPort.postMessage({ type: event, data });
    });
}

// Create scraper with config passed from main thread
const scraper = new TwitchScraper(workerData.config, eventBus);

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
            data: { source: 'twitch', level: 'error', message: `Command '${msg.command}' failed: ${err.message}`, timestamp: new Date() },
        });
    }
});

// Report that the worker is ready
parentPort.postMessage({
    type: 'log',
    data: { source: 'twitch', level: 'info', message: 'Twitch worker thread started.', timestamp: new Date() },
});
