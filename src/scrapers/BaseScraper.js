"use strict";

const EventEmitter = require('events');
const STATES = Object.freeze({ STOPPED: 'stopped', STARTING: 'starting', RUNNING: 'running', PAUSED: 'paused', STOPPING: 'stopping', ERROR: 'error' });

class BaseScraper extends EventEmitter {
    constructor(name, config, eventBus) {
        super();
        this.name = name;
        this.config = config;
        this.eventBus = eventBus;
        this.state = STATES.STOPPED;
        this._running = false;
        this._abortController = null;
        this._loopPromise = null;
        this._sleeps = new Set();
    }

    setState(state) {
        if (this.state === state) return;
        const payload = { source: this.name, state, previousState: this.state };
        this.state = state;
        this.emit('state', payload);
        this.eventBus.publish('state', payload);
    }

    log(level, message) { this.eventBus.publish('log', { source: this.name, level, message, timestamp: new Date() }); }
    reportMatch(data) {
        if (!this._running) return;
        const payload = { source: this.name, data };
        this.emit('match', payload);
        this.eventBus.publish('match', payload);
    }
    reportStats(metrics) { this.eventBus.publish('stats', { source: this.name, metrics }); }

    sleep(ms) {
        if (!this._running) return Promise.resolve();
        return new Promise(resolve => {
            const wake = () => { clearTimeout(timer); this._sleeps.delete(wake); resolve(); };
            const timer = setTimeout(wake, ms);
            this._sleeps.add(wake);
        });
    }
    _wakeUp() { for (const wake of [...this._sleeps]) wake(); }
    _cancel() {
        this._running = false;
        this._abortController?.abort();
        this._wakeUp();
    }

    async initialize() { throw new Error('initialize() must be implemented'); }
    async prepareResume() {}

    async start() {
        if (![STATES.STOPPED, STATES.ERROR].includes(this.state)) return;
        this._running = true;
        this._abortController = new AbortController();
        this.setState(STATES.STARTING);
        try {
            await this.initialize();
            if (!this._running) return;
            this.setState(STATES.RUNNING);
            this._launchLoop();
        } catch (error) {
            if (!this._running && [STATES.STOPPED, STATES.STOPPING].includes(this.state)) return;
            this._cancel();
            this.setState(STATES.ERROR);
            throw error;
        }
    }

    _launchLoop() {
        this._loopPromise = this._scanLoop().catch(error => {
            this._cancel();
            this.log('error', `Loop crashed: ${error.message}`);
            this.setState(STATES.ERROR);
        });
    }

    async _scanLoop() {
        const interval = (this.config.scanIntervalMinutes ?? this.config.waitTimeMinutes ?? 10) * 60000;
        while (this._running) {
            try {
                this.log('info', 'Scan cycle starting');
                await this._performScan();
                if (this._running) {
                    this.reportStats({ lastScanTime: new Date() });
                    this.log('info', `Scan complete; next cycle in ${interval / 60000}m`);
                }
            } catch (error) {
                if (!this._running) break;
                this.log('error', `Scan failed: ${error.message}`);
                this.reportStats({ errors: 1 });
                await this.recover?.();
            }
            if (this._running) await this.sleep(interval);
        }
    }

    async pause() {
        if (this.state !== STATES.RUNNING) return;
        this._cancel();
        await this._loopPromise;
        this.setState(STATES.PAUSED);
    }

    async resume() {
        if (this.state !== STATES.PAUSED) return;
        // pause joins the previous cycle before this creates another one.
        this._running = true;
        this._abortController = new AbortController();
        try {
            await this.prepareResume();
            this.setState(STATES.RUNNING);
            this._launchLoop();
        } catch (error) {
            this._cancel();
            this.setState(STATES.ERROR);
            throw error;
        }
    }

    async stop() {
        if (this.state === STATES.STOPPED) return;
        this.setState(STATES.STOPPING);
        this._cancel();
        await this._loopPromise;
        this._loopPromise = null;
        this.setState(STATES.STOPPED);
    }
}

BaseScraper.STATES = STATES;
module.exports = BaseScraper;
