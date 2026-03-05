"use strict";

const EventEmitter = require('events');

/**
 * Abstract base class for all scrapers.
 * Implements a state machine and event emission contract.
 * Why: Enforces a consistent lifecycle (start/stop/pause/resume) and
 * event interface so the ControlManager and UI can treat all scrapers uniformly.
 * @module BaseScraper
 */

/** @readonly @enum {string} */
const STATES = {
    STOPPED: 'stopped',
    STARTING: 'starting',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping',
    ERROR: 'error',
};

class BaseScraper extends EventEmitter {
    /**
     * @param {string} name - Scraper identifier ('twitch' or 'kick')
     * @param {object} config - Merged configuration object
     * @param {import('../core/EventBus')} eventBus
     */
    constructor(name, config, eventBus) {
        super();
        this.name = name;
        this.config = config;
        this.eventBus = eventBus;
        this.state = STATES.STOPPED;
        /** @type {boolean} Flag checked by the scan loop to know when to exit */
        this._running = false;
        /** @type {Function|null} Resolver function to break out of a sleep early */
        this._sleepResolve = null;
    }

    /**
     * Transitions state and publishes a state event.
     * @param {string} newState
     * @param {string} [errorMsg]
     */
    setState(newState) {
        const prev = this.state;
        this.state = newState;
        const payload = { source: this.name, state: newState, previousState: prev };
        this.emit('state', payload);
        this.eventBus.publish('state', payload);
    }

    /**
     * Emits a structured log event.
     * @param {'info'|'warn'|'error'|'debug'} level
     * @param {string} message
     */
    log(level, message) {
        const payload = { source: this.name, level, message, timestamp: new Date() };
        this.eventBus.publish('log', payload);
    }

    /**
     * Emits a match event when a keyword is found.
     * @param {object} data - Match details
     */
    reportMatch(data) {
        const payload = { source: this.name, data };
        this.emit('match', payload);
        this.eventBus.publish('match', payload);
    }

    /**
     * Emits a stats update event.
     * @param {object} metrics
     */
    reportStats(metrics) {
        this.eventBus.publish('stats', { source: this.name, metrics });
    }

    /**
     * Sleeps for a given duration but can be interrupted by stop().
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise((resolve) => {
            this._sleepResolve = resolve;
            this._sleepTimer = setTimeout(() => {
                this._sleepResolve = null;
                resolve();
            }, ms);
        });
    }

    /** Wakes up from a sleep() call early, used by stop(). */
    _wakeUp() {
        if (this._sleepTimer) clearTimeout(this._sleepTimer);
        if (this._sleepResolve) {
            this._sleepResolve();
            this._sleepResolve = null;
        }
    }

    /**
     * Override in subclass: one-time resource allocation.
     * @abstract
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Starts the scraper's continuous scan loop.
     * @returns {Promise<void>}
     */
    async start() {
        if (this.state !== STATES.STOPPED && this.state !== STATES.ERROR) return;
        this._running = true;
        this.setState(STATES.STARTING);
    }

    /**
     * Gracefully stops the scraper and releases resources.
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.state === STATES.STOPPED) return;
        this._running = false;
        this._wakeUp();
        this.setState(STATES.STOPPING);
        this.setState(STATES.STOPPED);
    }

    /**
     * Pauses the scraper (resources held).
     * @returns {Promise<void>}
     */
    async pause() {
        if (this.state !== STATES.RUNNING) return;
        this._running = false;
        this._wakeUp();
        this.setState(STATES.PAUSED);
    }

    /**
     * Resumes a paused scraper.
     * @returns {Promise<void>}
     */
    async resume() {
        if (this.state !== STATES.PAUSED) return;
        this._running = true;
        this.setState(STATES.RUNNING);
    }
}

BaseScraper.STATES = STATES;
module.exports = BaseScraper;
