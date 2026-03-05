"use strict";

/**
 * Tracks real-time metrics for each scraper.
 * Why: Provides the data that powers the StatsBox UI widget,
 * and maintains historical counters across scan cycles.
 * @module StatsManager
 */
class StatsManager {
    /**
     * @param {import('./EventBus')} eventBus
     */
    constructor(eventBus) {
        this.eventBus = eventBus;
        this._stats = {
            twitch: this._defaultStats(),
            kick: this._defaultStats(),
        };
        this._handler = this._onStats.bind(this);
        this._matchHandler = this._onMatch.bind(this);
    }

    /** Returns a zeroed stats object. */
    _defaultStats() {
        return {
            scanned: 0,
            matches: 0,
            cacheHits: 0,
            errors: 0,
            lastScanTime: null,
            startedAt: null,
        };
    }

    /** Starts listening for stats and match events. */
    start() {
        this.eventBus.subscribe('stats', this._handler);
        this.eventBus.subscribe('match', this._matchHandler);
    }

    /** Stops listening. */
    stop() {
        this.eventBus.unsubscribe('stats', this._handler);
        this.eventBus.unsubscribe('match', this._matchHandler);
    }

    /**
     * Merges incoming stats update into the running totals.
     * @param {object} data - { source, metrics }
     */
    _onStats(data) {
        if (!data.source || !this._stats[data.source]) return;
        const s = this._stats[data.source];
        const m = data.metrics || {};
        if (m.scanned !== undefined) s.scanned += m.scanned;
        if (m.cacheHits !== undefined) s.cacheHits += m.cacheHits;
        if (m.errors !== undefined) s.errors += m.errors;
        if (m.lastScanTime) s.lastScanTime = m.lastScanTime;
    }

    /**
     * Increments the match counter for the source scraper.
     * @param {object} data
     */
    _onMatch(data) {
        if (data.source && this._stats[data.source]) {
            this._stats[data.source].matches++;
        }
    }

    /**
     * Gets the stats snapshot for a given scraper.
     * @param {'twitch'|'kick'} source
     * @returns {object}
     */
    getStats(source) {
        const s = this._stats[source];
        if (!s) return {};
        const uptime = s.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0;
        return { ...s, uptime };
    }

    /**
     * Marks when a scraper starts running.
     * @param {'twitch'|'kick'} source
     */
    markStarted(source) {
        if (this._stats[source]) this._stats[source].startedAt = Date.now();
    }

    /**
     * Resets stats for a given scraper.
     * @param {'twitch'|'kick'} source
     */
    reset(source) {
        if (this._stats[source]) this._stats[source] = this._defaultStats();
    }
}

module.exports = StatsManager;
