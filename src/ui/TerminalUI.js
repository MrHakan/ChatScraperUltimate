"use strict";

const blessed = require('blessed');
const MainPanel = require('./MainPanel');
const TwitchPanel = require('./TwitchPanel');
const KickPanel = require('./KickPanel');

/**
 * Main terminal UI manager.
 * Initializes the blessed screen, creates all 3 panels, wires keyboard shortcuts.
 * @module TerminalUI
 */
class TerminalUI {
    /**
     * @param {import('../core/EventBus')} eventBus
     * @param {import('../core/LogManager')} logManager
     * @param {import('../core/StatsManager')} statsManager
     * @param {import('../core/ControlManager')} controlManager
     */
    constructor(eventBus, logManager, statsManager, controlManager) {
        this.eventBus = eventBus;
        this.logManager = logManager;
        this.statsManager = statsManager;
        this.controlManager = controlManager;

        this.screen = null;
        this.mainPanel = null;
        this.twitchPanel = null;
        this.kickPanel = null;
        this._focusedPanel = 0; // 0=main, 1=twitch, 2=kick
        this._refreshInterval = null;
    }

    /** Initializes the blessed screen and creates all panels. */
    initialize() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'ChatScraperUltimate',
            fullUnicode: true,
        });

        // Create panels
        this.mainPanel = new MainPanel(this.screen, this.eventBus, this.logManager, this.statsManager);
        this.twitchPanel = new TwitchPanel(this.screen, this.eventBus);
        this.kickPanel = new KickPanel(this.screen, this.eventBus);

        // Wire keyboard shortcuts
        this._setupKeys();

        // Wire state change events to update panel status lines
        this.eventBus.subscribe('state', (data) => {
            if (data.source === 'twitch') this.twitchPanel.updateStatus(data.state);
            if (data.source === 'kick') this.kickPanel.updateStatus(data.state);
            this._refresh();
        });

        // Periodic refresh for stats/uptime
        this._refreshInterval = setInterval(() => this._refresh(), 1000);

        // Initial render
        this._refresh();
        this.screen.render();
    }

    /** Registers all keyboard shortcuts on the screen. */
    _setupKeys() {
        const s = this.screen;

        // Quit
        s.key(['q', 'C-c'], () => { this.eventBus.publish('app:quit'); });

        // Panel switching
        s.key(['tab'], () => {
            this._focusedPanel = (this._focusedPanel + 1) % 3;
            this._focusCurrentPanel();
        });
        s.key(['1'], () => { this._focusedPanel = 0; this._focusCurrentPanel(); });
        s.key(['2'], () => { this._focusedPanel = 1; this._focusCurrentPanel(); });
        s.key(['3'], () => { this._focusedPanel = 2; this._focusCurrentPanel(); });

        // Scraper controls — target = currently focused panel's scraper
        s.key(['s'], () => this._controlFocused('start'));
        s.key(['x'], () => this._controlFocused('stop'));
        s.key(['p'], () => this._controlFocused('pause'));
        s.key(['r'], () => this._controlFocused('resume'));
        s.key(['C-r'], () => this._controlFocused('restart'));
    }

    /** Focuses the currently selected panel. */
    _focusCurrentPanel() {
        switch (this._focusedPanel) {
            case 0: this.mainPanel.focus(); break;
            case 1: this.twitchPanel.focus(); break;
            case 2: this.kickPanel.focus(); break;
        }
        this._refresh();
    }

    /**
     * Runs a control command on the scraper that corresponds to the focused panel.
     * If main panel is focused, the command targets both scrapers.
     * @param {string} command
     */
    async _controlFocused(command) {
        if (this._focusedPanel === 1 || this._focusedPanel === 0) {
            await this.controlManager.execute('twitch', command);
        }
        if (this._focusedPanel === 2 || this._focusedPanel === 0) {
            await this.controlManager.execute('kick', command);
        }
    }

    /** Refreshes all dynamic content on the screen. */
    _refresh() {
        if (!this.screen) return;
        const tState = this.controlManager.getState('twitch');
        const kState = this.controlManager.getState('kick');
        this.mainPanel.update(tState, kState);
        this.screen.render();
    }

    /** Tears down the screen and clears intervals. */
    destroy() {
        if (this._refreshInterval) clearInterval(this._refreshInterval);
        if (this.screen) {
            this.screen.destroy();
            this.screen = null;
        }
    }
}

module.exports = TerminalUI;
