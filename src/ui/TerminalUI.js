"use strict";

const blessed = require('blessed');
const MainPanel = require('./MainPanel');
const TwitchPanel = require('./TwitchPanel');
const KickPanel = require('./KickPanel');
const { createHeaderBar, formatHeaderBar } = require('./components/HeaderBar');
const { createHelpOverlay } = require('./components/HelpOverlay');
const { SPINNER_FRAMES } = require('../utils/colors');

/** Default grid geometry per panel index (0=main, 1=twitch, 2=kick). */
const PANEL_GEOMETRY = [
    { top: 1, left: 0, width: '100%', height: '40%-1' },
    { top: '40%', left: 0, width: '50%', height: '60%' },
    { top: '40%', left: '50%', width: '50%', height: '60%' },
];

/** Geometry used when a panel is zoomed to fill the screen (below header). */
const ZOOM_GEOMETRY = { top: 1, left: 0, width: '100%', height: '100%-1' };

/**
 * Main terminal UI manager.
 * Initializes the blessed screen, creates the header bar, all 3 panels and
 * the help overlay, wires keyboard shortcuts, and drives the refresh loop
 * (spinner animation, clock, stats).
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
        this.headerBar = null;
        this.helpOverlay = null;
        this.mainPanel = null;
        this.twitchPanel = null;
        this.kickPanel = null;
        this._focusedPanel = 0; // 0=main, 1=twitch, 2=kick
        this._zoomed = false;
        this._spinnerIndex = 0;
        this._notice = null; // { text, until } transient control-bar message
        this._quitArmed = false;
        this._refreshInterval = null;
    }

    /** Initializes the blessed screen and creates all panels. */
    initialize() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'ChatScraperUltimate',
            fullUnicode: true,
        });

        // Header bar (1 line, full width)
        this.headerBar = createHeaderBar(this.screen);

        // Create panels
        this.mainPanel = new MainPanel(this.screen, this.eventBus, this.logManager, this.statsManager);
        this.twitchPanel = new TwitchPanel(this.screen, this.eventBus);
        this.kickPanel = new KickPanel(this.screen, this.eventBus);

        // Help overlay (hidden until toggled)
        this.helpOverlay = createHelpOverlay(this.screen);

        // Wire keyboard shortcuts
        this._setupKeys();

        // Wire state change events to update panel status lines
        this.eventBus.subscribe('state', (data) => {
            if (data.source === 'twitch') this.twitchPanel.updateStatus(data.state, { spinner: this._spinner() });
            if (data.source === 'kick') this.kickPanel.updateStatus(data.state, { spinner: this._spinner() });
            this._refresh();
        });

        // Periodic refresh for stats/uptime/spinner/clock
        this._refreshInterval = setInterval(() => {
            this._spinnerIndex = (this._spinnerIndex + 1) % SPINNER_FRAMES.length;
            this._refresh();
        }, 250);

        // Initial render
        this._refresh();
        this.screen.render();
    }

    /** @returns {string} Current spinner animation frame */
    _spinner() {
        return SPINNER_FRAMES[this._spinnerIndex];
    }

    /** Registers all keyboard shortcuts on the screen. */
    _setupKeys() {
        const s = this.screen;

        // Quit — double-press safety on 'q', Ctrl+C is immediate
        s.key(['q'], () => this._requestQuit());
        s.key(['C-c'], () => { this.eventBus.publish('app:quit'); });

        // Panel switching
        s.key(['tab'], () => {
            this._focusedPanel = (this._focusedPanel + 1) % 3;
            this._focusCurrentPanel();
        });
        s.key(['1'], () => { this._focusedPanel = 0; this._focusCurrentPanel(); });
        s.key(['2'], () => { this._focusedPanel = 1; this._focusCurrentPanel(); });
        s.key(['3'], () => { this._focusedPanel = 2; this._focusCurrentPanel(); });

        // Zoom focused panel (tmux-style)
        s.key(['z'], () => {
            this._zoomed = !this._zoomed;
            this._applyLayout();
        });

        // Scraper controls — target = currently focused panel's scraper
        s.key(['s'], () => this._controlFocused('start'));
        s.key(['x'], () => this._controlFocused('stop'));
        s.key(['p'], () => this._controlFocused('pause'));
        s.key(['r'], () => this._controlFocused('resume'));
        s.key(['C-r'], () => this._controlFocused('restart'));

        // Log tools
        s.key(['f'], () => { this.mainPanel.cycleFilter(); this._refresh(); });
        s.key(['m'], () => { this.mainPanel.toggleView(); this._refresh(); });
        s.key(['e'], () => this._exportLogs());
        s.key(['c'], () => {
            this.mainPanel.clear();
            this._showNotice('Log buffer cleared', 2000);
        });

        // Help overlay
        s.key(['?', 'h'], () => this._toggleHelp());
        s.key(['escape'], () => {
            if (this.helpOverlay && !this.helpOverlay.hidden) this._toggleHelp();
        });
    }

    /** Toggles the help overlay's visibility. */
    _toggleHelp() {
        if (!this.helpOverlay) return;
        this.helpOverlay.toggle();
        this.screen.render();
    }

    /** Arms the quit confirmation; quits on the second press within 3s. */
    _requestQuit() {
        if (this._quitArmed) {
            this.eventBus.publish('app:quit');
            return;
        }
        this._quitArmed = true;
        this._showNotice('Press Q again to quit', 3000);
        setTimeout(() => { this._quitArmed = false; }, 3000);
    }

    /** Exports the log buffer to a file and reports the path. */
    _exportLogs() {
        try {
            const filePath = this.logManager.exportToFile();
            this.eventBus.publish('log', {
                source: 'app',
                level: 'info',
                message: `Logs exported → ${filePath}`,
                timestamp: new Date(),
            });
        } catch (err) {
            this.eventBus.publish('log', {
                source: 'app',
                level: 'error',
                message: `Log export failed: ${err.message}`,
                timestamp: new Date(),
            });
        }
        this._refresh();
    }

    /**
     * Shows a transient message in the control bar.
     * @param {string} text
     * @param {number} durationMs
     */
    _showNotice(text, durationMs) {
        this._notice = { text, until: Date.now() + durationMs };
        this._refresh();
    }

    /** Repositions panels according to focus + zoom state. */
    _applyLayout() {
        const panels = [this.mainPanel, this.twitchPanel, this.kickPanel];
        panels.forEach((panel, i) => {
            const el = panel.container;
            if (this._zoomed && i !== this._focusedPanel) {
                el.hide();
                return;
            }
            const geo = this._zoomed ? ZOOM_GEOMETRY : PANEL_GEOMETRY[i];
            el.top = geo.top;
            el.left = geo.left;
            el.width = geo.width;
            el.height = geo.height;
            el.show();
        });
        this._refresh();
    }

    /** Focuses the currently selected panel. */
    _focusCurrentPanel() {
        switch (this._focusedPanel) {
            case 0: this.mainPanel.focus(); break;
            case 1: this.twitchPanel.focus(); break;
            case 2: this.kickPanel.focus(); break;
        }
        // If zoomed, zoom follows focus
        if (this._zoomed) {
            this._applyLayout();
        } else {
            this._refresh();
        }
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
        const spinner = this._spinner();

        if (this._notice && Date.now() > this._notice.until) this._notice = null;

        const tStats = this.statsManager.getStats('twitch');
        const kStats = this.statsManager.getStats('kick');
        this.headerBar.setContent(formatHeaderBar({
            focusedPanel: this._focusedPanel,
            twitchState: tState,
            kickState: kState,
            spinner,
            totalMatches: (tStats.matches || 0) + (kStats.matches || 0),
            zoomed: this._zoomed,
        }));

        this.mainPanel.update(tState, kState, {
            spinner,
            notice: this._notice ? this._notice.text : null,
        });
        this.twitchPanel.updateStatus(tState, { spinner });
        this.kickPanel.updateStatus(kState, { spinner });
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
