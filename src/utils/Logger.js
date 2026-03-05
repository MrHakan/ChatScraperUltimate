"use strict";

/**
 * Structured logger that routes all output through the EventBus
 * instead of using raw console.log in production code.
 * Why: Decouples log production from consumption, enabling UI and file sinks.
 * @module Logger
 */

class Logger {
    /**
     * @param {string} source - The source label (e.g. 'twitch', 'kick', 'app')
     * @param {import('../core/EventBus')} eventBus - The central event bus
     */
    constructor(source, eventBus) {
        this.source = source;
        this.eventBus = eventBus;
    }

    /**
     * Emits a log event at the specified level.
     * @param {'info'|'warn'|'error'|'debug'} level
     * @param {string} message
     */
    _emit(level, message) {
        this.eventBus.publish('log', {
            source: this.source,
            level,
            message,
            timestamp: new Date(),
        });
    }

    /** @param {string} message */
    info(message) { this._emit('info', message); }

    /** @param {string} message */
    warn(message) { this._emit('warn', message); }

    /** @param {string} message */
    error(message) { this._emit('error', message); }

    /** @param {string} message */
    debug(message) { this._emit('debug', message); }
}

module.exports = Logger;
