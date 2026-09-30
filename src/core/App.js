"use strict";

const path = require('path');
const EventBus = require('./EventBus');
const ConfigManager = require('./ConfigManager');
const LogManager = require('./LogManager');
const StatsManager = require('./StatsManager');
const ControlManager = require('./ControlManager');
const DiscoveryManager = require('./DiscoveryManager');
const WebhookNotifier = require('./WebhookNotifier');
const DemoScraper = require('./DemoScraper');
const ScraperProxy = require('../workers/ScraperProxy');
const TerminalUI = require('../ui/TerminalUI');

class App {
    constructor(options = {}) {
        this.demo = options.demo || false;
        this.eventBus = new EventBus();
        this.configManager = new ConfigManager(this.eventBus);
        this.logManager = new LogManager(this.eventBus);
        this.statsManager = new StatsManager(this.eventBus);
        this.scrapers = {};
    }

    async start() {
        this.configManager.loadAll();
        this.logManager.start();
        this.statsManager.start();
        const configs = {};
        for (const source of ['twitch', 'kick']) {
            configs[source] = { ...this.configManager.get('app', source), ...this.configManager.get(source) };
            this.scrapers[source] = this.demo ? new DemoScraper(source, this.eventBus) : new ScraperProxy(source, configs[source], this.eventBus);
        }
        this.discoveries = new DiscoveryManager(this.eventBus, {
            targetDomains: [...new Set(Object.values(configs).flatMap(cfg => cfg.targetDomains))],
            ...(this.demo ? { filePath: path.resolve(__dirname, '../../data/demo-discoveries.json') } : {}),
        });
        this.discoveries.start();
        if (!this.demo) {
            this.notifier = new WebhookNotifier(this.eventBus, configs);
            this.notifier.start();
        }
        this.controlManager = new ControlManager(this.eventBus, this.scrapers, this.statsManager);
        this.ui = new TerminalUI(this.eventBus, this.logManager, this.statsManager, this.controlManager, this.discoveries, { demo: this.demo });
        this.ui.initialize();
        this.eventBus.subscribe('app:quit', () => this.shutdown());
        this._signalHandler = () => this.shutdown();
        process.on('SIGINT', this._signalHandler);
        process.on('SIGTERM', this._signalHandler);
        this.eventBus.publish('log', { source: 'app', level: 'info', message: this.demo ? 'Offline demo started. Press ? for controls.' : 'Ready. Press S to start, / to search the inbox, ? for controls.', timestamp: new Date() });
        for (const source of ['twitch', 'kick']) {
            if (this.demo || configs[source].autoStart) await this.controlManager.execute(source, 'start');
        }
    }

    shutdown() {
        if (this._shutdownPromise) return this._shutdownPromise;
        this._shutdownPromise = (async () => {
            this.notifier?.stop();
            await Promise.allSettled(Object.values(this.scrapers).map(scraper => scraper.stop()));
            try { this.discoveries?.stop(); }
            catch (error) { process.stderr.write(`Cannot save discovery history: ${error.message}\n`); process.exitCode = 1; }
            this.logManager.stop();
            this.statsManager.stop();
            this.ui?.destroy();
            if (this._signalHandler) {
                process.off('SIGINT', this._signalHandler);
                process.off('SIGTERM', this._signalHandler);
            }
            this.eventBus.clear();
        })();
        return this._shutdownPromise;
    }
}

module.exports = App;
