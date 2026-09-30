"use strict";

const fs = require('fs');
const path = require('path');
const { extractAddresses } = require('../utils/domains');
const { plain } = require('../utils/display');

class DiscoveryManager {
    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.filePath = options.filePath || path.resolve(__dirname, '../../data/discoveries.json');
        this.maxEntries = options.maxEntries || 2000;
        this.targetDomains = options.targetDomains || ['aternos.me', 'exaroton.me'];
        this.records = new Map();
        this._handler = this.ingest.bind(this);
        this._timer = null;
    }

    start() {
        try {
            if (fs.existsSync(this.filePath)) {
                const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                if (saved.version !== 1 || !Array.isArray(saved.records)) throw new Error('Unsupported discovery file');
                for (const r of saved.records.slice(-this.maxEntries)) {
                    if (typeof r.address !== 'string' || !Array.isArray(r.sightings) || !Number.isInteger(r.count) || r.count < 1 || !Number.isFinite(Date.parse(r.firstSeen)) || !Number.isFinite(Date.parse(r.lastSeen))) continue;
                    r.favorite = Boolean(r.favorite);
                    r.archived = Boolean(r.archived);
                    r.sightings = r.sightings.filter(s => s && ['twitch', 'kick'].includes(s.source) && typeof s.streamer === 'string' && typeof s.message === 'string' && typeof s.location === 'string').slice(0, 20);
                    if (!r.sightings.length) continue;
                    this.records.set(r.address, r);
                }
            }
        } catch (error) {
            // Preserve an unreadable file before allowing new discoveries to save.
            try { fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`); } catch { /* log below */ }
            this.eventBus.publish('log', { source: 'app', level: 'warn', message: `Discovery history could not be loaded: ${error.message}`, timestamp: new Date() });
        }
        this.eventBus.subscribe('match', this._handler);
    }

    ingest(event) {
        const d = event.data || {};
        const addresses = extractAddresses(d.message || d.content, this.targetDomains);
        const now = new Date().toISOString();
        for (const address of addresses) {
            let record = this.records.get(address);
            const isNew = !record;
            if (!record) {
                record = { address, firstSeen: now, lastSeen: now, count: 0, favorite: false, archived: false, sightings: [] };
                this.records.set(address, record);
            }
            record.count++;
            record.lastSeen = now;
            const streamer = plain(d.streamer || d.channelName || '?').slice(0, 100);
            const location = plain(d.location || d.source || (d.vodId ? 'VOD' : 'CHAT')).slice(0, 20);
            const evidence = {
                source: event.source, streamer, location,
                viewers: Number.isFinite(d.viewers) ? d.viewers : null,
                vodId: d.vodId || null, offset: Number.isFinite(d.offset) ? d.offset : null,
                message: plain(d.message || d.content).slice(0, 1024), lastSeen: now,
            };
            record.sightings = record.sightings.filter(s => !(s.source === evidence.source && s.streamer === streamer && s.location === location));
            record.sightings.unshift(evidence);
            record.sightings = record.sightings.slice(0, 20);
            // Maintain recency even when several events share one millisecond.
            this.records.delete(address);
            this.records.set(address, record);
            this.eventBus.publish('discovery', { record, isNew });
        }
        if (addresses.length) {
            this._trim();
            this._scheduleSave();
        }
    }

    _trim() {
        if (this.records.size <= this.maxEntries) return;
        // Keep favorites first, then the most recently observed entries.
        const ordered = this.query({ includeArchived: true, sort: 'recent' }).sort((a, b) => Number(b.favorite) - Number(a.favorite));
        this.records = new Map(ordered.slice(0, this.maxEntries).map(r => [r.address, r]));
    }

    query({ search = '', source = 'all', status = 'active', sort = 'recent', includeArchived = false } = {}) {
        const needle = search.trim().toLowerCase();
        return [...this.records.values()].reverse().filter(r => {
            if (!includeArchived && status !== 'archived' && r.archived) return false;
            if (status === 'archived' && !r.archived) return false;
            if (status === 'favorites' && !r.favorite) return false;
            if (source !== 'all' && !r.sightings.some(s => s.source === source)) return false;
            return !needle || [r.address, ...r.sightings.map(s => `${s.streamer} ${s.message}`)].join(' ').toLowerCase().includes(needle);
        }).sort((a, b) => sort === 'count' ? b.count - a.count || b.lastSeen.localeCompare(a.lastSeen)
            : sort === 'address' ? a.address.localeCompare(b.address) : b.lastSeen.localeCompare(a.lastSeen));
    }

    toggle(address, field) {
        if (!['favorite', 'archived'].includes(field)) return;
        const record = this.records.get(address);
        if (!record) return;
        record[field] = !record[field];
        this._scheduleSave();
        this.eventBus.publish('discovery', { record, isNew: false });
        return record[field];
    }

    _scheduleSave() {
        if (this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            try { this.save(); } catch (error) {
                this.eventBus.publish('log', { source: 'app', level: 'error', message: `Discovery save failed: ${error.message}`, timestamp: new Date() });
            }
        }, 500);
        this._timer.unref();
    }

    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const temp = `${this.filePath}.tmp`;
        fs.writeFileSync(temp, JSON.stringify({ version: 1, records: [...this.records.values()] }, null, 2));
        fs.renameSync(temp, this.filePath);
    }

    export(format = 'json', filters = {}, dir = path.resolve(__dirname, '../../logs')) {
        const rows = this.query(filters);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, `discoveries-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`);
        const csv = value => {
            let text = String(value ?? '');
            if (/^[=+@-]/.test(text)) text = "'" + text;
            return `"${text.replace(/"/g, '""')}"`;
        };
        const content = format === 'csv'
            ? ['address,favorite,archived,sightings,sources,streamers,first_seen,last_seen', ...rows.map(r => [r.address, r.favorite, r.archived, r.count, [...new Set(r.sightings.map(s => s.source))].join(';'), [...new Set(r.sightings.map(s => s.streamer))].join(';'), r.firstSeen, r.lastSeen].map(csv).join(','))].join('\n') + '\n'
            : JSON.stringify({ version: 1, records: rows }, null, 2);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    stop() {
        this.eventBus.unsubscribe('match', this._handler);
        clearTimeout(this._timer);
        this._timer = null;
        this.save();
    }
}

module.exports = DiscoveryManager;
