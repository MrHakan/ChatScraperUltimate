"use strict";

/**
 * Aggregates log events from all sources into a scrollback buffer.
 * Why: Provides a unified log stream that the UI's LogBox can render,
 * regardless of which scraper produced the message.
 * @module LogManager
 */
class LogManager {
    /**
     * @param {import('./EventBus')} eventBus
     * @param {{ maxBuffer?: number }} [options]
     */
    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.maxBuffer = options.maxBuffer || 500;
        /** @type {Array<{source: string, level: string, message: string, timestamp: Date}>} */
        this.buffer = [];
        this._handler = this._onLog.bind(this);
    }

    /** Starts listening for log events. */
    start() {
        this.eventBus.subscribe('log', this._handler);
    }

    /** Stops listening for log events. */
    stop() {
        this.eventBus.unsubscribe('log', this._handler);
    }

    /**
     * Handles incoming log events; trims buffer if over capacity.
     * @param {object} entry
     */
    _onLog(entry) {
        this.buffer.push(entry);
        if (this.buffer.length > this.maxBuffer) {
            this.buffer.splice(0, this.buffer.length - this.maxBuffer);
        }
    }

    /**
     * Returns filtered log entries.
     * @param {{ source?: string, level?: string, last?: number }} [filters]
     * @returns {Array<object>}
     */
    getLogs(filters = {}) {
        let logs = this.buffer;
        if (filters.source) logs = logs.filter(l => l.source === filters.source);
        if (filters.level) logs = logs.filter(l => l.level === filters.level);
        if (filters.last) logs = logs.slice(-filters.last);
        return logs;
    }

    /**
     * Formats a log entry into a single display string.
     * @param {object} entry
     * @returns {string}
     */
    formatEntry(entry) {
        const ts = entry.timestamp instanceof Date
            ? entry.timestamp.toLocaleTimeString()
            : new Date(entry.timestamp).toLocaleTimeString();
        const lvl = entry.level.toUpperCase().padEnd(5);
        const src = entry.source.toUpperCase().padEnd(6);
        return `[${ts}] [${src}] [${lvl}] ${entry.message}`;
    }
}

module.exports = LogManager;
