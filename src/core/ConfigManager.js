"use strict";

const fs = require('fs');
const path = require('path');

/**
 * Reads and writes per-scraper .env configuration files and the global app.json.
 * Why: Centralizes all config I/O so scrapers never touch the filesystem directly.
 * @module ConfigManager
 */
class ConfigManager {
    /**
     * @param {import('./EventBus')} eventBus
     */
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.configDir = path.resolve(__dirname, '../../config');
        this._configs = { twitch: {}, kick: {}, app: {} };
        this._ensureConfigDir();
    }

    /** Creates config directory and template files if they don't exist. */
    _ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir, { recursive: true });

        const twitchEnv = path.join(this.configDir, 'twitch.env');
        if (!fs.existsSync(twitchEnv)) {
            fs.writeFileSync(twitchEnv, [
                'TWITCH_CLIENT_ID=your_client_id_here',
                'TWITCH_CLIENT_SECRET=your_client_secret_here',
                'DISCORD_WEBHOOK=',
            ].join('\n'));
        }

        const kickEnv = path.join(this.configDir, 'kick.env');
        if (!fs.existsSync(kickEnv)) {
            fs.writeFileSync(kickEnv, 'DISCORD_WEBHOOK_URL=\n');
        }

        const appJson = path.join(this.configDir, 'app.json');
        if (!fs.existsSync(appJson)) {
            fs.writeFileSync(appJson, JSON.stringify({
                twitch: {
                    keywords: ['aternos', 'exaroton'],
                    targetDomains: ['aternos.me', 'exaroton.me'],
                    maxViewers: 10,
                    maxVODs: 1,
                    scanIntervalMinutes: 10,
                    autoStart: false,
                },
                kick: {
                    keywords: ['aternos', 'exaroton'],
                    targetDomains: ['aternos.me', 'exaroton.me'],
                    waitTimeMinutes: 10,
                    categoryId: 10,
                    headless: true,
                    autoStart: false,
                },
            }, null, 2));
        }
    }

    /**
     * Parses a .env file into a key-value object.
     * @param {string} filePath
     * @returns {Object<string, string>}
     */
    _parseEnv(filePath) {
        const result = {};
        if (!fs.existsSync(filePath)) return result;
        const content = fs.readFileSync(filePath, 'utf8');
        for (const line of content.split('\n')) {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
            if (match) {
                result[match[1]] = (match[2] || '').replace(/(^['"]|['"]$)/g, '').trim();
            }
        }
        return result;
    }

    /**
     * Writes a key-value object back to a .env file.
     * @param {string} filePath
     * @param {Object<string, string>} data
     */
    _writeEnv(filePath, data) {
        const lines = Object.entries(data).map(([k, v]) => `${k}=${v}`);
        fs.writeFileSync(filePath, lines.join('\n') + '\n');
    }

    /** Loads all configuration files into memory. */
    loadAll() {
        this._configs.twitch = this._parseEnv(path.join(this.configDir, 'twitch.env'));
        this._configs.kick = this._parseEnv(path.join(this.configDir, 'kick.env'));
        try {
            this._configs.app = JSON.parse(fs.readFileSync(path.join(this.configDir, 'app.json'), 'utf8'));
        } catch {
            this._configs.app = {};
        }
    }

    /**
     * Gets a config value for a scraper.
     * @param {'twitch'|'kick'|'app'} target
     * @param {string} [key] - Dot-notation key. If omitted, returns entire config.
     * @returns {*}
     */
    get(target, key) {
        const cfg = this._configs[target] || {};
        if (!key) return { ...cfg };
        return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), cfg);
    }

    /**
     * Sets a config value and persists it.
     * @param {'twitch'|'kick'|'app'} target
     * @param {string} key
     * @param {*} value
     */
    set(target, key, value) {
        if (!this._configs[target]) this._configs[target] = {};
        if (target === 'app') {
            const keys = key.split('.');
            let obj = this._configs.app;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) obj[keys[i]] = {};
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = value;
            fs.writeFileSync(path.join(this.configDir, 'app.json'), JSON.stringify(this._configs.app, null, 2));
        } else {
            this._configs[target][key] = value;
            const envFile = target === 'twitch' ? 'twitch.env' : 'kick.env';
            this._writeEnv(path.join(this.configDir, envFile), this._configs[target]);
        }
        this.eventBus.publish('config', { target, key, value });
    }
}

module.exports = ConfigManager;
