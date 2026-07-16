"use strict";

const fs = require('fs');
const path = require('path');
const { LEVEL_COLORS, SOURCE_COLORS } = require('../utils/colors');

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
     * Formats a log entry into a single display string with blessed color
     * tags — timestamps dimmed, sources brand-colored, levels severity-colored.
     * @param {object} entry
     * @returns {string}
     */
    formatEntry(entry) {
        const ts = entry.timestamp instanceof Date
            ? entry.timestamp.toLocaleTimeString()
            : new Date(entry.timestamp).toLocaleTimeString();
        const level = (entry.level || 'info').toLowerCase();
        const lvlColor = LEVEL_COLORS[level] || 'white';
        const srcColor = SOURCE_COLORS[(entry.source || '').toLowerCase()] || 'white';
        const lvl = level.toUpperCase().padEnd(5);
        const src = (entry.source || '?').toUpperCase().padEnd(6);
        const msg = level === 'error'
            ? `{red-fg}${entry.message}{/red-fg}`
            : entry.message;
        return `{gray-fg}${ts}{/gray-fg} {${srcColor}-fg}${src}{/${srcColor}-fg} {${lvlColor}-fg}${lvl}{/${lvlColor}-fg} ${msg}`;
    }

    /**
     * Formats a log entry as plain text (no color tags) for file export.
     * @param {object} entry
     * @returns {string}
     */
    formatEntryPlain(entry) {
        const ts = entry.timestamp instanceof Date
            ? entry.timestamp.toISOString()
            : new Date(entry.timestamp).toISOString();
        const lvl = (entry.level || 'info').toUpperCase().padEnd(5);
        const src = (entry.source || '?').toUpperCase().padEnd(6);
        return `[${ts}] [${src}] [${lvl}] ${entry.message}`;
    }

    /**
     * Writes the current buffer to a timestamped file under logs/.
     * @param {string} [dir] - Target directory (defaults to <project>/logs)
     * @returns {string} Absolute path of the written file
     */
    exportToFile(dir) {
        const targetDir = dir || path.resolve(__dirname, '../../logs');
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(targetDir, `export-${stamp}.log`);
        const lines = this.buffer.map((e) => this.formatEntryPlain(e));
        fs.writeFileSync(filePath, lines.join('\n') + '\n');
        return filePath;
    }

    /** Empties the scrollback buffer. */
    clear() {
        this.buffer = [];
    }
}

module.exports = LogManager;
