"use strict";

const blessed = require('blessed');
const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');
const { BRAND, stateBadge } = require('../utils/colors');

/**
 * Twitch scraper panel (Purple #9146FF).
 * Displays the Twitch scraper's real-time output and match results,
 * with a live status line (state badge, spinner, match counter).
 * @module TwitchPanel
 */
class TwitchPanel {
    /**
     * @param {blessed.Widgets.Screen} screen
     * @param {import('../core/EventBus')} eventBus
     */
    constructor(screen, eventBus) {
        this.screen = screen;
        this.eventBus = eventBus;
        this._state = 'stopped';
        this._matches = 0;

        // Container
        this.container = createGridBox(screen, {
            label: 'TWITCH SCRAPER',
            color: BRAND.TWITCH,
            top: '40%',
            left: 0,
            width: '50%',
            height: '60%',
        });

        // Status line
        this.statusBox = blessed.box({
            parent: this.container,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            padding: { left: 1 },
            style: { fg: BRAND.TWITCH },
        });
        this._renderStatus();

        // Output log
        this.outputLog = createLogBox(this.container, {
            color: BRAND.TWITCH,
            top: 1,
            left: 0,
            width: '100%',
            height: '100%-1',
        });

        // Listen for twitch-only log events
        this.eventBus.subscribe('log', (entry) => {
            if (entry.source !== 'twitch') return;
            const ts = entry.timestamp instanceof Date
                ? entry.timestamp.toLocaleTimeString()
                : new Date(entry.timestamp).toLocaleTimeString();
            const msg = entry.level === 'error'
                ? `{red-fg}${entry.message}{/red-fg}`
                : entry.message;
            this.outputLog.log(`{gray-fg}${ts}{/gray-fg} ${msg}`);
        });

        // Listen for twitch match events
        this.eventBus.subscribe('match', (data) => {
            if (data.source !== 'twitch') return;
            this._matches++;
            const d = data.data;
            const badge = d.isDomain
                ? '{black-fg}{green-bg} DOMAIN {/green-bg}{/black-fg}'
                : '{black-fg}{yellow-bg} MATCH {/yellow-bg}{/black-fg}';
            this.outputLog.log(`${badge} {bold}${d.streamer || '?'}{/bold} · ${d.user || '?'}: ${(d.message || '').slice(0, 120)}`);
            this._renderStatus();
        });
    }

    /**
     * Updates the status line.
     * @param {string} state
     * @param {{spinner?: string}} [opts]
     */
    updateStatus(state, opts = {}) {
        this._state = state;
        this._spinner = opts.spinner;
        this._renderStatus();
    }

    /** Renders the composed status line content. */
    _renderStatus() {
        const matches = this._matches > 0
            ? `{yellow-fg}★ ${this._matches} matches{/yellow-fg}`
            : '{gray-fg}★ 0 matches{/gray-fg}';
        this.statusBox.setContent(`${stateBadge(this._state, this._spinner)}  ${matches}`);
    }

    /** Makes this panel focusable. */
    focus() {
        this.outputLog.focus();
    }
}

module.exports = TwitchPanel;
