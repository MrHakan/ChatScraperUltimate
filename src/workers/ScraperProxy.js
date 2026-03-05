"use strict";

const { Worker } = require('worker_threads');
const path = require('path');

/**
 * Proxy class that the main thread uses in place of actual Scraper instances.
 * Implements the same interface (state, start, stop, pause, resume) so
 * the ControlManager and UI work without any changes.
 *
 * Why: The ControlManager calls scraper.start(), checks scraper.state, etc.
 * This proxy translates those calls into postMessage commands sent to the
 * worker thread, and translates incoming worker messages back into EventBus
 * events on the main thread.
 *
 * @module ScraperProxy
 */
class ScraperProxy {
    /**
     * @param {string} name - 'twitch' or 'kick'
     * @param {object} config - Merged config for the scraper
     * @param {import('../core/EventBus')} eventBus - Main thread EventBus
     */
    constructor(name, config, eventBus) {
        this.name = name;
        this.config = config;
        this.eventBus = eventBus;
        this.state = 'stopped';
        /** @type {Worker|null} */
        this._worker = null;
    }

    /** Spawns the worker thread and wires message handlers. */
    _spawnWorker() {
        const workerFile = this.name === 'twitch'
            ? path.join(__dirname, '../workers/twitch.worker.js')
            : path.join(__dirname, '../workers/kick.worker.js');

        this._worker = new Worker(workerFile, {
            workerData: { config: this.config },
        });

        // Forward worker events to main thread EventBus
        this._worker.on('message', (msg) => {
            // Update local state mirror when worker reports state changes
            if (msg.type === 'state' && msg.data) {
                this.state = msg.data.state;
            }
            // Republish to main EventBus so UI picks it up
            if (msg.type && msg.data) {
                this.eventBus.publish(msg.type, msg.data);
            }
        });

        this._worker.on('error', (err) => {
            this.state = 'error';
            this.eventBus.publish('log', {
                source: this.name,
                level: 'error',
                message: `Worker error: ${err.message}`,
                timestamp: new Date(),
            });
            this.eventBus.publish('state', {
                source: this.name,
                state: 'error',
                previousState: this.state,
            });
        });

        this._worker.on('exit', (code) => {
            if (code !== 0 && this.state !== 'stopped') {
                this.state = 'error';
                this.eventBus.publish('log', {
                    source: this.name,
                    level: 'error',
                    message: `Worker exited with code ${code}`,
                    timestamp: new Date(),
                });
            }
        });
    }

    /** Sends a command to the worker */
    _send(command) {
        if (this._worker) {
            this._worker.postMessage({ type: 'command', command });
        }
    }

    /**
     * Starts the scraper — spawns a worker thread if not running.
     * @returns {Promise<void>}
     */
    async start() {
        if (!this._worker) this._spawnWorker();
        this._send('start');
    }

    /**
     * Stops the scraper and terminates the worker.
     * @returns {Promise<void>}
     */
    async stop() {
        this._send('stop');
        // Give the worker a moment to clean up, then force-terminate
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (this._worker) {
            await this._worker.terminate();
            this._worker = null;
        }
        this.state = 'stopped';
    }

    /**
     * Pauses the scraper.
     * @returns {Promise<void>}
     */
    async pause() {
        this._send('pause');
    }

    /**
     * Resumes the scraper.
     * @returns {Promise<void>}
     */
    async resume() {
        this._send('resume');
    }
}

module.exports = ScraperProxy;
