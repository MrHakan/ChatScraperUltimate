"use strict";

const BaseScraper = require('../scrapers/BaseScraper');

const SAMPLES = [
    { streamer: 'northbound', viewers: 8, message: 'Join the survival world: spruce.aternos.me', location: 'TITLE' },
    { streamer: 'redstone_lab', viewers: 4, message: 'Build night at lantern.exaroton.me:25566', location: 'CHAT' },
    { streamer: 'coastline', viewers: 6, message: 'Same server tonight: spruce.aternos.me', location: 'PINNED' },
    { streamer: 'tinycraft', viewers: 2, message: 'New world: meadow.aternos.me', location: 'CHAT' },
];

class DemoScraper extends BaseScraper {
    constructor(name, eventBus) {
        super(name, { scanIntervalMinutes: 0.1 }, eventBus);
        this.index = name === 'twitch' ? 0 : 1;
    }
    async initialize() { this.log('info', 'Offline demo; no network requests or webhooks'); }
    async _performScan() {
        for (let i = 0; i < SAMPLES.length && this._running; i++) {
            const sample = SAMPLES[(this.index++) % SAMPLES.length];
            this.reportMatch({ ...sample, ...(this.name === 'kick' ? { channelName: sample.streamer, content: sample.message } : {}), isDomain: true });
            this.reportStats({ scanned: 1 });
            await this.sleep(750);
        }
    }
}
module.exports = DemoScraper;
