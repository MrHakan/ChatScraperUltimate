"use strict";

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_APP = {
    twitch: { keywords: ['aternos', 'exaroton'], targetDomains: ['aternos.me', 'exaroton.me'], maxViewers: 10, maxVODs: 1, maxDownloads: 3, cacheTTLMinutes: 360, maxCachedVODs: 2000, scanIntervalMinutes: 10, autoStart: false },
    kick: { keywords: ['aternos', 'exaroton'], targetDomains: ['aternos.me', 'exaroton.me'], waitTimeMinutes: 10, categoryId: 10, headless: true, autoStart: false },
};

function validate(app) {
    if (!app || typeof app !== 'object' || Array.isArray(app)) throw new Error('app.json must contain an object');
    const result = {};
    for (const source of ['twitch', 'kick']) {
        if (app[source] != null && (typeof app[source] !== 'object' || Array.isArray(app[source]))) throw new Error(`${source} must contain an object`);
        const cfg = { ...DEFAULT_APP[source], ...app[source] };
        for (const key of ['keywords', 'targetDomains']) {
            if (!Array.isArray(cfg[key]) || !cfg[key].length || cfg[key].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${source}.${key} must contain nonempty strings`);
            cfg[key] = cfg[key].map(v => v.trim().toLowerCase());
        }
        if (cfg.targetDomains.some(v => !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(v))) throw new Error(`${source}.targetDomains must contain DNS suffixes`);
        for (const key of ['autoStart', 'headless']) {
            if (cfg[key] != null && typeof cfg[key] !== 'boolean') throw new Error(`${source}.${key} must be true or false`);
        }
        const limits = { maxViewers: [0, 10000000], maxVODs: [1, 100], maxDownloads: [1, 10], maxCachedVODs: [1, 10000], categoryId: [1, 1000000], scanIntervalMinutes: [0.1, 1440], waitTimeMinutes: [0.1, 1440], cacheTTLMinutes: [1, 43200] };
        for (const [key, [min, max]] of Object.entries(limits)) {
            if (cfg[key] == null) continue;
            if (typeof cfg[key] !== 'number' || !Number.isFinite(cfg[key]) || cfg[key] < min || cfg[key] > max || (!key.endsWith('Minutes') && !Number.isInteger(cfg[key]))) throw new Error(`${source}.${key} must be a number between ${min} and ${max}`);
        }
        result[source] = cfg;
    }
    return result;
}

class ConfigManager {
    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.configDir = options.configDir || path.resolve(__dirname, '../../config');
        this._configs = { twitch: {}, kick: {}, app: {} };
        fs.mkdirSync(this.configDir, { recursive: true });
        const templates = {
            'twitch.env': 'TWITCH_CLIENT_ID=your_client_id_here\nTWITCH_CLIENT_SECRET=your_client_secret_here\nDISCORD_WEBHOOK=\n',
            'kick.env': 'DISCORD_WEBHOOK_URL=\n',
            'app.json': JSON.stringify(DEFAULT_APP, null, 2) + '\n',
        };
        for (const [name, content] of Object.entries(templates)) {
            const file = path.join(this.configDir, name);
            if (!fs.existsSync(file)) fs.writeFileSync(file, content, { mode: name.endsWith('.env') ? 0o600 : 0o644 });
        }
    }

    loadAll() {
        this._configs.twitch = dotenv.parse(fs.readFileSync(path.join(this.configDir, 'twitch.env')));
        this._configs.kick = dotenv.parse(fs.readFileSync(path.join(this.configDir, 'kick.env')));
        try { this._configs.app = validate(JSON.parse(fs.readFileSync(path.join(this.configDir, 'app.json'), 'utf8'))); }
        catch (error) { throw new Error(`Invalid config/app.json: ${error.message}`); }
    }

    get(target, key) {
        const cfg = this._configs[target] || {};
        const value = key ? key.split('.').reduce((o, k) => o?.[k], cfg) : cfg;
        return value === undefined ? undefined : structuredClone(value);
    }

    set(target, key, value) {
        if (!['app', 'twitch', 'kick'].includes(target)) throw new Error('Unknown configuration target');
        const next = this.get(target);
        let cfg = next;
        const keys = target === 'app' ? key.split('.') : [key];
        if (keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Invalid configuration key');
        for (const k of keys.slice(0, -1)) cfg = cfg[k] ||= {};
        cfg[keys.at(-1)] = value;
        const checked = target === 'app' ? validate(next) : next;
        const name = target === 'app' ? 'app.json' : `${target}.env`;
        const content = target === 'app' ? JSON.stringify(checked, null, 2) + '\n' : Object.entries(checked).map(([k, v]) => `${k}=${JSON.stringify(String(v))}`).join('\n') + '\n';
        fs.writeFileSync(path.join(this.configDir, name), content, { mode: target === 'app' ? 0o644 : 0o600 });
        this._configs[target] = checked;
        this.eventBus.publish('config', { target, key, value });
    }
}

ConfigManager.validate = validate;
ConfigManager.DEFAULT_APP = DEFAULT_APP;
module.exports = ConfigManager;
