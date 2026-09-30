"use strict";

const { createGridBox } = require('./components/GridBox');
const { createLogBox } = require('./components/LogBox');
const { createStatsBox } = require('./components/StatsBox');
const { createControlBar } = require('./components/ControlBar');
const DiscoveryInbox = require('./DiscoveryInbox');
const { BRAND, stateBadge } = require('../utils/colors');
const { safe } = require('../utils/display');

class MainPanel {
    constructor(screen, eventBus, logManager, statsManager, discoveries) {
        this.screen = screen;
        this.eventBus = eventBus;
        this.logManager = logManager;
        this.statsManager = statsManager;
        this.levelFilter = 'all';
        this.view = 'inbox';
        this._matchFeed = [];
        this.container = createGridBox(screen, { label: 'DISCOVERY WORKSPACE', color: 'cyan', top: 1, left: 0, width: '100%', height: '60%-1' });
        this.twitchStats = createStatsBox(this.container, { label: 'Twitch', color: BRAND.TWITCH, top: 0, left: 0, width: '50%', height: 5 });
        this.kickStats = createStatsBox(this.container, { label: 'Kick', color: BRAND.KICK, top: 0, left: '50%', width: '50%', height: 5 });
        this.logBox = createLogBox(this.container, { label: 'Logs', color: 'cyan', top: 5, left: 0, width: '100%', height: '100%-8' });
        this.logBox.hide();
        this.inbox = new DiscoveryInbox(this.container, discoveries);
        this.controlBar = createControlBar(this.container, { top: '100%-3', left: 0, width: '100%', height: 3, color: 'cyan' });
        this._logHandler = entry => {
            if (this.view === 'logs' && this._passesFilter(entry)) this.logBox.log(this.logManager.formatEntry(entry));
        };
        this._matchHandler = event => {
            const d = event.data || {};
            const line = `{cyan-fg}${safe(event.source.toUpperCase())}{/cyan-fg} ${d.isDomain ? '{green-fg}SERVER{/green-fg}' : 'KEYWORD'} {bold}${safe(d.streamer || d.channelName || '?')}{/bold}: ${safe((d.message || d.content || '').slice(0, 200))}`;
            this._matchFeed.push(line);
            if (this._matchFeed.length > 200) this._matchFeed.shift();
            if (this.view === 'matches') this.logBox.log(line);
        };
        eventBus.subscribe('log', this._logHandler);
        eventBus.subscribe('match', this._matchHandler);
    }

    _passesFilter(entry) { return this.levelFilter === 'all' || (entry.level || 'info').toLowerCase() === this.levelFilter; }
    cycleFilter() {
        if (this.view === 'inbox') { this.inbox.cycle('source'); return; }
        const levels = ['all', 'info', 'warn', 'error'];
        this.levelFilter = levels[(levels.indexOf(this.levelFilter) + 1) % levels.length];
        if (this.view === 'logs') this._replay();
        this._updateLabel();
    }
    toggleView() {
        const views = ['inbox', 'logs', 'matches'];
        this.setView(views[(views.indexOf(this.view) + 1) % views.length]);
    }
    setView(view) {
        this.view = view;
        if (view === 'inbox') { this.logBox.hide(); this.inbox.container.show(); this.inbox.refresh(true); }
        else { this.inbox.container.hide(); this.logBox.show(); this._replay(); }
        this._updateLabel();
        this.focus();
    }
    clear() {
        if (this.view === 'inbox') { this.inbox.search(''); return; }
        if (this.view === 'matches') this._matchFeed = [];
        else this.logManager.clear();
        this.logBox.setContent('');
    }
    _replay() {
        const lines = this.view === 'matches' ? this._matchFeed : this.logManager.getLogs().filter(e => this._passesFilter(e)).map(e => this.logManager.formatEntry(e));
        this.logBox.setContent(lines.join('\n'));
        this.logBox.setScrollPerc(100);
    }
    _updateLabel() { this.logBox.setLabel(` ${this.view === 'matches' ? 'Matches' : `Logs / ${this.levelFilter.toUpperCase()}`} `); }

    resize() {
        const width = Math.max(1, this.container.width - this.container.iwidth);
        const height = Math.max(1, this.container.height - this.container.iheight);
        this._small = width < 76;
        const summaryHeight = this._small ? 4 : 5;
        const half = Math.floor(width / 2);
        this.twitchStats.width = half;
        this.kickStats.left = half;
        this.kickStats.width = width - half;
        this.twitchStats.height = this.kickStats.height = summaryHeight;
        for (const viewer of [this.inbox.container, this.logBox]) {
            viewer.top = summaryHeight;
            viewer.width = width;
            viewer.height = Math.max(3, height - summaryHeight - 3);
        }
        this.controlBar.top = height - 3;
        this.controlBar.width = width;
        this.inbox.resize();
    }

    update(twitchState, kickState, { spinner, notice } = {}) {
        const format = (source, state) => {
            const s = this.statsManager.getStats(source);
            if (this._small) return `${stateBadge(state, spinner)}  ${s.scanned} scanned\n${s.matches} matches | ${s.errors} errors`;
            return `${stateBadge(state, spinner)}  ${s.scanned} scanned | ${s.matches} matches\n${s.scansPerMin}/min | ${s.cacheHits} cached | ${s.errors} errors\n${s.lastScanTime ? `Last cycle ${new Date(s.lastScanTime).toLocaleTimeString()}` : 'Ready for first scan'}`;
        };
        this.twitchStats.setContent(format('twitch', twitchState));
        this.kickStats.setContent(format('kick', kickState));
        this.inbox.refresh();
        const compact = this.screen.width < 110;
        const controls = this.view === 'inbox'
            ? compact ? '/ Find  B Star  A Archive  Y Copy  M Views  ? Help' : '/ Search  V Source  T Status  O Sort  B Favorite  A Archive  Y Copy  E Export  M Views'
            : `F ${this.levelFilter.toUpperCase()}  E Export  C Clear  M Views  S Start  P Pause  R Resume  X Stop  ? Help`;
        this.controlBar.setContent(notice ? `{yellow-fg}${safe(notice)}{/yellow-fg}` : `{cyan-fg}${controls}{/cyan-fg}`);
    }
    focus() { if (this.view === 'inbox') this.inbox.focus(); else this.logBox.focus(); }
    destroy() {
        this.eventBus.unsubscribe('log', this._logHandler);
        this.eventBus.unsubscribe('match', this._matchHandler);
        this.inbox.destroy();
    }
}
module.exports = MainPanel;
