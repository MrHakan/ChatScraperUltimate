"use strict";

const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');

/**
 * Kick scraper panel (Green #53FC18).
 * Displays the Kick scraper's real-time output and match results.
 * @module KickPanel
 */
class KickPanel {
    /**
     * @param {blessed.Widgets.Screen} screen
     * @param {import('../core/EventBus')} eventBus
     */
    constructor(screen, eventBus) {
        this.screen = screen;
        this.eventBus = eventBus;

        // Container
        this.container = createGridBox(screen, {
            label: 'KICK SCRAPER',
            color: '#53FC18',
            top: '40%',
            left: '50%',
            width: '50%',
            height: '60%',
        });

        // Status line
        this.statusBox = require('blessed').box({
            parent: this.container,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            style: { fg: '#53FC18' },
            content: '{#53FC18-fg}Status:{/#53FC18-fg} STOPPED',
        });

        // Output log
        this.outputLog = createLogBox(this.container, {
            color: '#53FC18',
            top: 1,
            left: 0,
            width: '100%',
            height: '100%-1',
        });

        // Listen for kick-only log events
        this.eventBus.subscribe('log', (entry) => {
            if (entry.source !== 'kick') return;
            const ts = entry.timestamp instanceof Date
                ? entry.timestamp.toLocaleTimeString()
                : new Date(entry.timestamp).toLocaleTimeString();
            this.outputLog.log(`[${ts}] ${entry.message}`);
        });

        // Listen for kick match events
        this.eventBus.subscribe('match', (data) => {
            if (data.source !== 'kick') return;
            const d = data.data;
            const prefix = d.isDomain ? '{green-fg}[DOMAIN]{/green-fg}' : '{yellow-fg}[MATCH]{/yellow-fg}';
            this.outputLog.log(`${prefix} [${d.source}] ${d.channelName || '?'}: ${(d.content || '').slice(0, 120)}`);
        });
    }

    /**
     * Updates the status line.
     * @param {string} state
     */
    updateStatus(state) {
        const color = state === 'running' ? 'green' : state === 'error' ? 'red' : '#53FC18';
        this.statusBox.setContent(`{${color}-fg}Status:{/${color}-fg} ${state.toUpperCase()}`);
    }

    /** Makes this panel focusable. */
    focus() {
        this.outputLog.focus();
    }
}

module.exports = KickPanel;
