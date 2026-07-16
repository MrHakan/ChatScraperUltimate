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
        /**
         * Ring buffers of periodic {t, scanned, matches} snapshots per source.
         * Why: Lets the UI derive scans/min rates and render activity sparklines.
         */
        this._history = { twitch: [], kick: [] };
        this._historyLimit = 120; // ~2 minutes at 1 sample/sec
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
        this._sample(source);
        return {
            ...s,
            uptime,
            scansPerMin: this._ratePerMin(source, 'scanned'),
            activity: this._activityDeltas(source),
        };
    }

    /**
     * Records a timestamped snapshot for rate/sparkline computation.
     * Throttled to at most one sample per second.
     * @param {'twitch'|'kick'} source
     */
    _sample(source) {
        const hist = this._history[source];
        const now = Date.now();
        const last = hist[hist.length - 1];
        if (last && now - last.t < 1000) return;
        const s = this._stats[source];
        hist.push({ t: now, scanned: s.scanned, matches: s.matches });
        if (hist.length > this._historyLimit) hist.splice(0, hist.length - this._historyLimit);
    }

    /**
     * Computes the per-minute rate of a counter over the last 60 seconds.
     * @param {'twitch'|'kick'} source
     * @param {'scanned'|'matches'} field
     * @returns {number}
     */
    _ratePerMin(source, field) {
        const hist = this._history[source];
        if (hist.length < 2) return 0;
        const now = hist[hist.length - 1];
        const cutoff = now.t - 60000;
        let oldest = hist[0];
        for (const snap of hist) {
            if (snap.t >= cutoff) { oldest = snap; break; }
        }
        const dt = (now.t - oldest.t) / 1000;
        if (dt <= 0) return 0;
        return Math.round(((now[field] - oldest[field]) / dt) * 60);
    }

    /**
     * Returns recent per-sample scan deltas for sparkline rendering.
     * @param {'twitch'|'kick'} source
     * @param {number} [count=16]
     * @returns {number[]}
     */
    _activityDeltas(source, count = 16) {
        const hist = this._history[source];
        const deltas = [];
        for (let i = Math.max(1, hist.length - count); i < hist.length; i++) {
            deltas.push(Math.max(0, hist[i].scanned - hist[i - 1].scanned));
        }
        return deltas;
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
        if (this._stats[source]) {
            this._stats[source] = this._defaultStats();
            this._history[source] = [];
        }
    }
}

module.exports = StatsManager;
