"use strict";

const EventBus = require('./EventBus');
const ConfigManager = require('./ConfigManager');
const LogManager = require('./LogManager');
const StatsManager = require('./StatsManager');
const ControlManager = require('./ControlManager');
const ScraperProxy = require('../workers/ScraperProxy');
const TerminalUI = require('../ui/TerminalUI');

/**
 * Main application orchestrator.
 * Wires all core systems, scraper worker threads, and UI together.
 *
 * Architecture:
 *   Main thread: blessed UI + EventBus + managers
 *   Worker thread 1: TwitchScraper (isolated)
 *   Worker thread 2: KickScraper + Puppeteer (isolated)
 *
 * ScraperProxy bridges the gap — it implements the same interface
 * as BaseScraper so ControlManager and TerminalUI work unchanged.
 *
 * @module App
 */
class App {
    constructor() {
        this.eventBus = new EventBus();
        this.configManager = new ConfigManager(this.eventBus);
        this.logManager = new LogManager(this.eventBus);
        this.statsManager = new StatsManager(this.eventBus);

        // Proxies are created after config is loaded
        this.scrapers = { twitch: null, kick: null };
        this.controlManager = null;
        this.ui = null;
    }

    /** Initializes all systems and starts the UI. */
    async start() {
        // 1) Load configuration
        this.configManager.loadAll();

        // 2) Merge env + app config for each scraper
        const twitchEnv = this.configManager.get('twitch');
        const twitchApp = this.configManager.get('app', 'twitch') || {};
        const twitchConfig = { ...twitchApp, ...twitchEnv };

        const kickEnv = this.configManager.get('kick');
        const kickApp = this.configManager.get('app', 'kick') || {};
        const kickConfig = { ...kickApp, ...kickEnv };

        // 3) Create scraper proxies (each will spawn a worker thread on start)
        this.scrapers.twitch = new ScraperProxy('twitch', twitchConfig, this.eventBus);
        this.scrapers.kick = new ScraperProxy('kick', kickConfig, this.eventBus);

        // 4) Create managers
        this.controlManager = new ControlManager(this.eventBus, this.scrapers, this.statsManager);
        this.logManager.start();
        this.statsManager.start();

        // 5) Create and initialize UI (runs exclusively on main thread)
        this.ui = new TerminalUI(this.eventBus, this.logManager, this.statsManager, this.controlManager);
        this.ui.initialize();

        // 6) Wire quit handler
        this.eventBus.subscribe('app:quit', () => this.shutdown());

        // 7) Log startup message
        this.eventBus.publish('log', {
            source: 'app',
            level: 'info',
            message: 'ChatScraperUltimate started (multithreaded). Press [S] to start scrapers, [Q] to quit.',
            timestamp: new Date(),
        });

        // 8) Auto-start scrapers if configured
        if (twitchConfig.autoStart) {
            this.eventBus.publish('log', { source: 'app', level: 'info', message: 'Auto-starting Twitch worker thread...', timestamp: new Date() });
            await this.controlManager.execute('twitch', 'start');
        }
        if (kickConfig.autoStart) {
            this.eventBus.publish('log', { source: 'app', level: 'info', message: 'Auto-starting Kick worker thread...', timestamp: new Date() });
            await this.controlManager.execute('kick', 'start');
        }
    }

    /** Gracefully shuts down all systems. */
    async shutdown() {
        this.eventBus.publish('log', { source: 'app', level: 'info', message: 'Shutting down workers...', timestamp: new Date() });

        // Stop scraper worker threads
        try { if (this.scrapers.twitch) await this.scrapers.twitch.stop(); } catch { /* noop */ }
        try { if (this.scrapers.kick) await this.scrapers.kick.stop(); } catch { /* noop */ }

        // Stop managers
        this.logManager.stop();
        this.statsManager.stop();

        // Destroy UI
        if (this.ui) this.ui.destroy();

        // Clean up event bus
        this.eventBus.clear();

        process.exit(0);
    }
}

module.exports = App;
