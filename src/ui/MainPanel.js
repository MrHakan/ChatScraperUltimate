"use strict";

const blessed = require('blessed');
const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');
const { createStatsBox, formatStats } = require('./components/StatsBox');
const { createControlBar, formatControlBar } = require('./components/ControlBar');
const { BRAND } = require('../utils/colors');

/**
 * Main Manager panel (Aqua).
 * Contains the combined log viewer, stats summary, and control bar.
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

        // Container
        this.container = createGridBox(screen, {
            label: 'MAIN MANAGER',
            color: 'cyan',
            top: 0,
            left: 0,
            width: '100%',
            height: '40%',
        });

        // Stats boxes (left side)
        this.twitchStats = createStatsBox(this.container, {
            label: 'Twitch Stats',
            color: '#9146FF',
            top: 0,
            left: 0,
            width: '25%',
            height: '100%-3',
        });

        this.kickStats = createStatsBox(this.container, {
            label: 'Kick Stats',
            color: '#53FC18',
            top: 0,
            left: '25%',
            width: '25%',
            height: '100%-3',
        });

        // Log viewer (right side)
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

        // Listen for log events
        this.eventBus.subscribe('log', (entry) => {
            const formatted = this.logManager.formatEntry(entry);
            this.logBox.log(formatted);
        });
    }

    /**
     * Refreshes the stats display and control bar.
     * @param {string} twitchState
     * @param {string} kickState
     */
    update(twitchState, kickState) {
        const ts = this.statsManager.getStats('twitch');
        const ks = this.statsManager.getStats('kick');
        this.twitchStats.setContent(formatStats(ts, '#9146FF'));
        this.kickStats.setContent(formatStats(ks, '#53FC18'));
        this.controlBar.setContent(formatControlBar(twitchState, kickState));
    }

    /** Makes this panel focusable. */
    focus() {
        this.logBox.focus();
    }
}

module.exports = MainPanel;
