"use strict";

/**
 * Maps UI commands to scraper lifecycle methods and validates state transitions.
 * Why: Prevents invalid operations (e.g., pausing a stopped scraper) and
 * provides a single point of control for the UI layer.
 * @module ControlManager
 */

/** Valid state transitions: current state → allowed commands */
const VALID_TRANSITIONS = {
    stopped: ['start'],
    starting: [],
    running: ['stop', 'pause'],
    paused: ['stop', 'resume'],
    stopping: [],
    error: ['stop', 'start'],
};

class ControlManager {
    /**
     * @param {import('./EventBus')} eventBus
     * @param {Object<string, import('../scrapers/BaseScraper')>} scrapers - { twitch, kick }
     * @param {import('./StatsManager')} statsManager
     */
    constructor(eventBus, scrapers, statsManager) {
        this.eventBus = eventBus;
        this.scrapers = scrapers;
        this.statsManager = statsManager;
    }

    /**
     * Checks whether a command is valid for the scraper's current state.
     * @param {string} name - Scraper key ('twitch' or 'kick')
     * @param {string} command - 'start', 'stop', 'pause', 'resume'
     * @returns {boolean}
     */
    canExecute(name, command) {
        const scraper = this.scrapers[name];
        if (!scraper) return false;
        const allowed = VALID_TRANSITIONS[scraper.state] || [];
        return allowed.includes(command);
    }

    /**
     * Executes a lifecycle command on a scraper.
     * @param {string} name - 'twitch' or 'kick'
     * @param {'start'|'stop'|'pause'|'resume'|'restart'} command
     * @returns {Promise<boolean>} Whether the command was accepted
     */
    async execute(name, command) {
        const scraper = this.scrapers[name];
        if (!scraper) return false;

        if (command === 'restart') {
            if (scraper.state !== 'stopped') await scraper.stop();
            await scraper.start();
            this.statsManager.markStarted(name);
            return true;
        }

        if (!this.canExecute(name, command)) return false;

        switch (command) {
            case 'start':
                this.statsManager.markStarted(name);
                await scraper.start();
                break;
            case 'stop':
                await scraper.stop();
                break;
            case 'pause':
                await scraper.pause();
                break;
            case 'resume':
                await scraper.resume();
                break;
            default:
                return false;
        }
        return true;
    }

    /**
     * Gets the current state of a scraper.
     * @param {string} name
     * @returns {string}
     */
    getState(name) {
        return this.scrapers[name]?.state || 'unknown';
    }
}

module.exports = ControlManager;
