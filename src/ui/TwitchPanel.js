"use strict";

const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');

/**
 * Twitch scraper panel (Purple #9146FF).
 * Displays the Twitch scraper's real-time output and match results.
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

        // Container
        this.container = createGridBox(screen, {
            label: 'TWITCH SCRAPER',
            color: '#9146FF',
            top: '40%',
            left: 0,
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
            style: { fg: '#9146FF' },
            content: '{#9146FF-fg}Status:{/#9146FF-fg} STOPPED',
        });

        // Output log
        this.outputLog = createLogBox(this.container, {
            color: '#9146FF',
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
            this.outputLog.log(`[${ts}] ${entry.message}`);
        });

        // Listen for twitch match events
        this.eventBus.subscribe('match', (data) => {
            if (data.source !== 'twitch') return;
            const d = data.data;
            const prefix = d.isDomain ? '{green-fg}[DOMAIN]{/green-fg}' : '{yellow-fg}[MATCH]{/yellow-fg}';
            this.outputLog.log(`${prefix} ${d.streamer || '?'}: ${d.user || '?'}: ${(d.message || '').slice(0, 120)}`);
        });
    }

    /**
     * Updates the status line.
     * @param {string} state
     */
    updateStatus(state) {
        const color = state === 'running' ? 'green' : state === 'error' ? 'red' : '#9146FF';
        this.statusBox.setContent(`{${color}-fg}Status:{/${color}-fg} ${state.toUpperCase()}`);
    }

    /** Makes this panel focusable. */
    focus() {
        this.outputLog.focus();
    }
}

module.exports = TwitchPanel;
