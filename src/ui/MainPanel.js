"use strict";

const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');
const { createStatsBox, formatStats } = require('./components/StatsBox');
const { createControlBar, formatControlBar } = require('./components/ControlBar');
const { BRAND } = require('../utils/colors');

/**
 * Main Manager panel (Aqua).
 * Contains the combined log viewer (switchable to a match feed),
 * stats summaries, and the control bar.
 *
 * Functionality:
 *  - Log level filter (all → info → warn → error), replayed from buffer
 *  - Logs / Matches view toggle
 * @module MainPanel
 */
class MainPanel {
    /**
     * @param {blessed.Widgets.Screen} screen
     * @param {import('../core/EventBus')} eventBus
     * @param {import('../core/LogManager')} logManager
     * @param {import('../core/StatsManager')} statsManager
     */
    constructor(screen, eventBus, logManager, statsManager) {
        this.screen = screen;
        this.eventBus = eventBus;
        this.logManager = logManager;
        this.statsManager = statsManager;

        /** @type {'all'|'info'|'warn'|'error'} Active log level filter */
        this.levelFilter = 'all';
        /** @type {'logs'|'matches'} Active right-side view */
        this.view = 'logs';
        /** @type {string[]} Rolling feed of formatted match lines */
        this._matchFeed = [];
        this._matchFeedLimit = 200;

        // Container (below the 1-line header bar)
        this.container = createGridBox(screen, {
            label: 'MAIN MANAGER',
            color: 'cyan',
            top: 1,
            left: 0,
            width: '100%',
            height: '40%-1',
        });

        // Stats boxes (left side)
        this.twitchStats = createStatsBox(this.container, {
            label: 'Twitch Stats',
            color: BRAND.TWITCH,
            top: 0,
            left: 0,
            width: '25%',
            height: '100%-3',
        });

        this.kickStats = createStatsBox(this.container, {
            label: 'Kick Stats',
            color: BRAND.KICK,
            top: 0,
            left: '25%',
            width: '25%',
            height: '100%-3',
        });

        // Log / match viewer (right side)
        this.logBox = createLogBox(this.container, {
            label: 'Logs',
            color: 'cyan',
            top: 0,
            left: '50%',
            width: '50%',
            height: '100%-3',
        });

        // Control bar (bottom)
        this.controlBar = createControlBar(this.container, {
            top: '100%-3',
            left: 0,
            width: '100%',
            height: 3,
            color: 'cyan',
        });

        // Listen for log events — respect view and filter
        this.eventBus.subscribe('log', (entry) => {
            if (this.view !== 'logs') return;
            if (!this._passesFilter(entry)) return;
            this.logBox.log(this.logManager.formatEntry(entry));
        });

        // Collect matches from both scrapers into a unified feed
        this.eventBus.subscribe('match', (data) => {
            const line = this._formatMatch(data);
            this._matchFeed.push(line);
            if (this._matchFeed.length > this._matchFeedLimit) {
                this._matchFeed.splice(0, this._matchFeed.length - this._matchFeedLimit);
            }
            if (this.view === 'matches') this.logBox.log(line);
        });
    }

    /**
     * Formats a match event into a single feed line.
     * @param {{source: string, data: object}} data
     */
    _formatMatch(data) {
        const d = data.data || {};
        const ts = new Date().toLocaleTimeString();
        const srcColor = data.source === 'twitch' ? BRAND.TWITCH : BRAND.KICK;
        const src = (data.source || '?').toUpperCase().padEnd(6);
        const badge = d.isDomain
            ? '{black-fg}{green-bg} DOMAIN {/green-bg}{/black-fg}'
            : '{black-fg}{yellow-bg} MATCH {/yellow-bg}{/black-fg}';
        const who = d.streamer || d.channelName || '?';
        const text = (d.message || d.content || '').slice(0, 140);
        return `{gray-fg}${ts}{/gray-fg} {${srcColor}-fg}${src}{/${srcColor}-fg} ${badge} {bold}${who}{/bold}: ${text}`;
    }

    /**
     * @param {object} entry
     * @returns {boolean} Whether the entry passes the active level filter
     */
    _passesFilter(entry) {
        if (this.levelFilter === 'all') return true;
        return (entry.level || 'info').toLowerCase() === this.levelFilter;
    }

    /** Cycles the log level filter and re-renders the log view. */
    cycleFilter() {
        const order = ['all', 'info', 'warn', 'error'];
        this.levelFilter = order[(order.indexOf(this.levelFilter) + 1) % order.length];
        if (this.view === 'logs') this._replay();
        this._updateLabel();
    }

    /** Toggles between the unified log stream and the match feed. */
    toggleView() {
        this.view = this.view === 'logs' ? 'matches' : 'logs';
        this._replay();
        this._updateLabel();
    }

    /** Clears the visible viewer and (for logs view) the backing buffer. */
    clear() {
        if (this.view === 'matches') {
            this._matchFeed = [];
        } else {
            this.logManager.clear();
        }
        this.logBox.setContent('');
    }

    /** Re-renders the viewer content from the appropriate backing buffer. */
    _replay() {
        let lines;
        if (this.view === 'matches') {
            lines = this._matchFeed;
        } else {
            lines = this.logManager
                .getLogs(this.levelFilter === 'all' ? {} : { level: this.levelFilter })
                .map((e) => this.logManager.formatEntry(e));
        }
        this.logBox.setContent(lines.join('\n'));
        this.logBox.setScrollPerc(100);
    }

    /** Updates the viewer's border label to reflect view + filter. */
    _updateLabel() {
        const base = this.view === 'matches' ? 'Matches ★' : 'Logs';
        const filter = this.view === 'logs' && this.levelFilter !== 'all'
            ? ` · ${this.levelFilter.toUpperCase()}`
            : '';
        this.logBox.setLabel(` ${base}${filter} `);
    }

    /**
     * Refreshes the stats display and control bar.
     * @param {string} twitchState
     * @param {string} kickState
     * @param {object} [opts] - { spinner, notice }
     */
    update(twitchState, kickState, opts = {}) {
        const ts = this.statsManager.getStats('twitch');
        const ks = this.statsManager.getStats('kick');
        this.twitchStats.setContent(formatStats(ts, BRAND.TWITCH));
        this.kickStats.setContent(formatStats(ks, BRAND.KICK));
        this.controlBar.setContent(formatControlBar(twitchState, kickState, {
            spinner: opts.spinner,
            notice: opts.notice,
            filter: this.levelFilter,
            view: this.view,
        }));
    }

    /** Makes this panel focusable. */
    focus() {
        this.logBox.focus();
    }
}

module.exports = MainPanel;
