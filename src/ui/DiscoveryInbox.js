"use strict";

const blessed = require('blessed');
const { safe } = require('../utils/display');

class DiscoveryInbox {
    constructor(parent, store) {
        this.store = store;
        this.filters = { search: '', source: 'all', status: 'active', sort: 'recent' };
        this.records = [];
        this.selectedAddress = null;
        this.dirty = true;
        this.container = blessed.box({ parent, top: 5, left: 0, width: '100%', height: '100%-8', tags: true });
        this.toolbar = blessed.box({ parent: this.container, top: 0, height: 1, width: '100%', tags: true, style: { fg: 'cyan' } });
        this.list = blessed.list({ parent: this.container, label: ' Servers ', top: 1, left: 0, width: '58%', height: '100%-1', border: 'line', tags: true, keys: true, vi: false, mouse: true, scrollbar: { bg: 'cyan' }, style: { selected: { bg: 'cyan', fg: 'black' }, border: { fg: 'gray' } } });
        this.details = blessed.box({ parent: this.container, label: ' Evidence ', top: 1, left: '58%', width: '42%', height: '100%-1', border: 'line', tags: true, padding: { left: 1, right: 1 }, scrollable: true, keys: true, mouse: true, scrollbar: { bg: 'gray' }, style: { border: { fg: 'gray' } } });
        this.list.on('select item', (_, index) => {
            this.selectedAddress = this.records[index]?.address || null;
            this._renderDetails();
        });
        this.list.key(['pageup'], () => this.list.select(Math.max(0, this.list.selected - 10)));
        this.list.key(['pagedown'], () => this.list.select(Math.min(this.records.length - 1, this.list.selected + 10)));
        this.list.key(['enter'], () => { this.details.focus(); parent.screen.render(); });
        this.details.key(['escape', 'enter'], () => { this.list.focus(); parent.screen.render(); });
        this._handler = () => { this.dirty = true; };
        this.store.eventBus.subscribe('discovery', this._handler);
        this.refresh();
    }

    refresh(force = false) {
        if (!this.dirty && !force) return;
        this.dirty = false;
        this.records = this.store.query(this.filters);
        const rows = this.records.map(r => {
            const sources = [...new Set(r.sightings.map(s => s.source === 'twitch' ? 'TW' : 'KI'))].join('+');
            const width = Math.max(10, (this.list.width || 45) - 19);
            const address = r.address.length > width ? r.address.slice(0, width - 1) + '…' : r.address.padEnd(width);
            return safe(`${r.favorite ? '*' : ' '} ${address} ${sources.padEnd(5)} ${String(r.count).padStart(4)}`);
        });
        const selected = Math.max(0, this.records.findIndex(r => r.address === this.selectedAddress));
        this.list.setItems(rows.length ? rows : ['No servers found']);
        this.list.select(selected);
        this.selectedAddress = this.records[selected]?.address || null;
        this.toolbar.setContent(safe(` ${this.records.length} servers | ${this.filters.source.toUpperCase()} | ${this.filters.status} | ${this.filters.sort}${this.filters.search ? ` | /${this.filters.search}` : ''}`));
        this._renderDetails();
    }

    _renderDetails() {
        const r = this.store.records.get(this.selectedAddress);
        if (!r) {
            this.details.setContent('{cyan-fg}Your discovery inbox{/cyan-fg}\n\nStart a scraper with S. Complete server addresses appear here once and stay across restarts.\n\n/ Search   V Source   T Status\nB Favorite   A Archive\nY Copy   E JSON   Ctrl+E CSV\n\nEnter opens evidence; Esc returns.\nUse npm run demo to try sample data.');
            return;
        }
        const lines = [`{bold}{cyan-fg}${safe(r.address)}{/cyan-fg}{/bold}`, `${r.favorite ? '* Favorite   ' : ''}${r.archived ? 'Archived' : 'Active'} | ${r.count} sightings`, `First: ${safe(new Date(r.firstSeen).toLocaleString())}`, `Latest: ${safe(new Date(r.lastSeen).toLocaleString())}`, ''];
        for (const s of r.sightings) {
            lines.push(`{bold}${safe(s.source.toUpperCase())} / ${safe(s.streamer)}{/bold}`);
            lines.push(`${safe(s.location)}${s.viewers == null ? '' : ` | ${s.viewers} viewers`}`);
            const url = s.vodId ? `https://twitch.tv/videos/${encodeURIComponent(s.vodId)}${s.offset == null ? '' : `?t=${Math.floor(s.offset)}s`}` : s.source === 'twitch' ? `https://twitch.tv/${encodeURIComponent(s.streamer)}` : `https://kick.com/${encodeURIComponent(s.streamer.replace(/_/g, '-'))}`;
            lines.push(safe(url), safe(s.message), '');
        }
        this.details.setContent(lines.join('\n'));
    }

    resize() {
        const width = this.container.width;
        const height = this.container.height;
        const listWidth = Math.floor(width * 0.58);
        this.list.width = listWidth;
        this.details.left = listWidth;
        this.details.width = width - listWidth;
        this.list.height = this.details.height = Math.max(2, height - 1);
    }

    search(text) { this.filters.search = text; this.refresh(true); }
    cycle(field) {
        const values = { source: ['all', 'twitch', 'kick'], status: ['active', 'favorites', 'archived'], sort: ['recent', 'count', 'address'] }[field];
        this.filters[field] = values[(values.indexOf(this.filters[field]) + 1) % values.length];
        this.refresh(true);
    }
    toggle(field) {
        const value = this.store.toggle(this.selectedAddress, field);
        this.refresh(true);
        return value;
    }
    focus() { this.list.focus(); }
    destroy() { this.store.eventBus.unsubscribe('discovery', this._handler); }
}

module.exports = DiscoveryInbox;
