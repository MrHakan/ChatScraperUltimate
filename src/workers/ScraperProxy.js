"use strict";

const { Worker } = require('worker_threads');
const path = require('path');

class ScraperProxy {
    constructor(name, config, eventBus, options = {}) {
        this.name = name;
        this.config = config;
        this.eventBus = eventBus;
        this.state = 'stopped';
        this._worker = null;
        this._stopPromise = null;
        this._stopTimeoutMs = options.stopTimeoutMs ?? 5000;
        this._workerFactory = options.workerFactory || ((file, options) => new Worker(file, options));
    }

    _setState(state) {
        if (this.state === state) return;
        const previousState = this.state;
        this.state = state;
        this.eventBus.publish('state', { source: this.name, state, previousState });
    }

    _log(level, message) { this.eventBus.publish('log', { source: this.name, level, message, timestamp: new Date() }); }

    _spawnWorker() {
        const worker = this._workerFactory(path.join(__dirname, `${this.name}.worker.js`), { workerData: { config: this.config } });
        this._worker = worker;
        worker.on('message', msg => {
            if (this._worker !== worker || !msg.data) return;
            if (msg.type === 'state') {
                // Stop wins over late startup/pause acknowledgements.
                if (this.state === 'stopping' && msg.data.state !== 'stopped') return;
                this._setState(msg.data.state);
                if (msg.data.state === 'stopped') this._finishStop?.();
            } else if (['log', 'stats', 'match'].includes(msg.type)) {
                this.eventBus.publish(msg.type, msg.data);
            }
        });
        worker.on('error', error => {
            if (this._worker !== worker) return;
            this._log('error', `Worker failed: ${error.message}`);
            if (this.state === 'stopping') this._finishStop?.();
            else this._setState('error');
        });
        worker.on('exit', code => {
            if (this._worker !== worker) return;
            this._worker = null;
            if (this.state === 'stopping' || this.state === 'stopped') {
                this._setState('stopped');
                this._finishStop?.();
            } else {
                this._log('error', `Worker exited unexpectedly (${code}); press S to retry`);
                this._setState('error');
            }
        });
    }

    _send(command) { this._worker?.postMessage({ type: 'command', command }); }

    async start() {
        if (!['stopped', 'error'].includes(this.state)) return;
        if (this._stopPromise) await this._stopPromise;
        if (this._worker) await this.stop();
        this._setState('starting');
        try { this._spawnWorker(); this._send('start'); }
        catch (error) { this._setState('error'); throw error; }
    }

    stop() {
        if (this._stopPromise) return this._stopPromise;
        const worker = this._worker;
        if (!worker) { this._setState('stopped'); return Promise.resolve(); }
        this._setState('stopping');
        this._stopPromise = (async () => {
            await new Promise(resolve => {
                const timer = setTimeout(() => { this._log('warn', 'Cleanup timed out; terminating worker'); finish(); }, this._stopTimeoutMs);
                const finish = () => { clearTimeout(timer); this._finishStop = null; resolve(); };
                this._finishStop = finish;
                try { this._send('stop'); } catch { finish(); }
            });
            // Detach before terminating: an old worker's exit cannot mark a new
            // generation as failed or overwrite its state.
            if (this._worker === worker) this._worker = null;
            await worker.terminate();
            this._setState('stopped');
        })().finally(() => { this._stopPromise = null; });
        return this._stopPromise;
    }

    async pause() {
        if (this.state !== 'running') return;
        this._setState('paused');
        this._send('pause');
    }
    async resume() {
        if (this.state !== 'paused') return;
        this._setState('running');
        this._send('resume');
    }
}

module.exports = ScraperProxy;
