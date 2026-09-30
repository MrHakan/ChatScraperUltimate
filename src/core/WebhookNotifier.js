"use strict";

const { requestJson } = require('../utils/http');

// Notifications consume normalized discoveries, so repeated chat text, multiple
// keywords, cross-platform sightings and later runs share the same dedup key.
class WebhookNotifier {
    constructor(eventBus, configs, options = {}) {
        this.eventBus = eventBus;
        this.configs = configs;
        this.request = options.request || requestJson;
        this.queue = [];
        this._abort = new AbortController();
        this._handler = event => {
            if (!event.isNew || this.queue.length >= 100) return;
            this.queue.push(structuredClone(event.record));
            this._drain();
        };
    }

    start() { this.eventBus.subscribe('discovery', this._handler); }

    async _drain() {
        if (this._busy) return;
        this._busy = true;
        try {
            while (this.queue.length && !this._abort.signal.aborted) {
                const record = this.queue.shift();
                const sighting = record.sightings[0];
                const config = this.configs[sighting.source] || {};
                const url = config.DISCORD_WEBHOOK || config.DISCORD_WEBHOOK_URL;
                if (!url) continue;
                const streamerUrl = sighting.source === 'twitch' ? `https://twitch.tv/${encodeURIComponent(sighting.streamer)}` : `https://kick.com/${encodeURIComponent(sighting.streamer.replace(/_/g, '-'))}`;
                try {
                    await this.request(url, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{
                            title: `Discovered: ${record.address}`, url: streamerUrl,
                            description: `${sighting.source.toUpperCase()} / ${sighting.location}`,
                            color: sighting.source === 'twitch' ? 9520895 : 5504024,
                            fields: [{ name: 'Evidence', value: sighting.message.slice(0, 1024) || record.address }],
                            timestamp: record.firstSeen,
                        }] }),
                    }, { signal: this._abort.signal });
                    this._log('info', `Webhook delivered for ${record.address}`);
                } catch (error) {
                    if (!this._abort.signal.aborted) this._log('warn', `Webhook failed for ${record.address}: ${error.message}`);
                }
            }
        } finally { this._busy = false; }
    }

    _log(level, message) { this.eventBus.publish('log', { source: 'app', level, message, timestamp: new Date() }); }
    stop() {
        this.eventBus.unsubscribe('discovery', this._handler);
        this._abort.abort();
        this.queue = [];
    }
}

module.exports = WebhookNotifier;
