"use strict";

const blessed = require('blessed');
const MainPanel = require('./MainPanel');
const TwitchPanel = require('./TwitchPanel');
const KickPanel = require('./KickPanel');
const { createHeaderBar, formatHeaderBar } = require('./components/HeaderBar');
const { createHelpOverlay } = require('./components/HelpOverlay');
const { SPINNER_FRAMES } = require('../utils/colors');

class TerminalUI {
    constructor(eventBus, logManager, statsManager, controlManager, discoveries, options = {}) {
        Object.assign(this, { eventBus, logManager, statsManager, controlManager, discoveries });
        this.demo = options.demo || false;
        this.screenOptions = options.screenOptions || {};
        this.screen = null;
        this._focusedPanel = 0;
        this._zoomed = false;
        this._spinnerIndex = 0;
        this._notice = null;
        this._modal = null;
        this._quitArmed = false;
    }

    initialize() {
        this.screen = blessed.screen({ smartCSR: true, title: 'ChatScraperUltimate', fullUnicode: true, ...this.screenOptions });
        this.headerBar = createHeaderBar(this.screen);
        this.mainPanel = new MainPanel(this.screen, this.eventBus, this.logManager, this.statsManager, this.discoveries);
        this.twitchPanel = new TwitchPanel(this.screen, this.eventBus);
        this.kickPanel = new KickPanel(this.screen, this.eventBus);
        this.helpOverlay = createHelpOverlay(this.screen);
        this.prompt = blessed.prompt({ parent: this.screen, top: 'center', left: 'center', width: '80%', height: 9, border: 'line', label: ' Search inbox ', style: { border: { fg: 'cyan' }, bg: 'black' } });
        this._setupKeys();
        this._stateHandler = () => this._refresh();
        this.eventBus.subscribe('state', this._stateHandler);
        this.screen.on('resize', () => this._applyLayout());
        [this.mainPanel.inbox.list, this.mainPanel.logBox, this.twitchPanel.outputLog, this.kickPanel.outputLog].forEach((widget, i) => {
            widget.on('focus', () => {
                const panel = i < 2 ? 0 : i - 1;
                if (this._focusedPanel === panel) return;
                this._focusedPanel = panel;
                this._applyLayout();
            });
        });
        this._refreshInterval = setInterval(() => {
            this._spinnerIndex = (this._spinnerIndex + 1) % SPINNER_FRAMES.length;
            this._refresh();
        }, 250);
        this._applyLayout();
        this.mainPanel.focus();
    }

    _setupKeys() {
        const key = (keys, handler) => this.screen.key(keys, () => { if (!this._modal) handler(); });
        key(['q'], () => this._requestQuit());
        this.screen.key(['C-c'], () => this.eventBus.publish('app:quit'));
        key(['tab'], () => this._focus((this._focusedPanel + 1) % 3));
        key(['S-tab'], () => this._focus((this._focusedPanel + 2) % 3));
        ['1', '2', '3'].forEach((n, i) => key([n], () => this._focus(i)));
        key(['z'], () => { this._zoomed = !this._zoomed; this._applyLayout(); });
        for (const [keys, command] of [[['s'], 'start'], [['x'], 'stop'], [['p'], 'pause'], [['r'], 'resume'], [['C-r'], 'restart']]) key(keys, () => this._controlFocused(command));
        key(['f'], () => { this.mainPanel.cycleFilter(); this._refresh(); });
        key(['m'], () => { this._focus(0); this.mainPanel.toggleView(); this._refresh(); });
        key(['i'], () => { this._focus(0); this.mainPanel.setView('inbox'); this._refresh(); });
        key(['/'], () => this._search());
        for (const [keys, field] of [[['v'], 'source'], [['t'], 'status'], [['o'], 'sort']]) key(keys, () => this._inboxAction(() => this.mainPanel.inbox.cycle(field)));
        key(['b'], () => this._inboxAction(() => this.mainPanel.inbox.toggle('favorite')));
        key(['a'], () => this._inboxAction(() => this.mainPanel.inbox.toggle('archived')));
        key(['y'], () => this._inboxAction(() => this._copyAddress()));
        key(['e'], () => this._export('json'));
        key(['C-e'], () => this._export('csv'));
        key(['c'], () => { this.mainPanel.clear(); this._showNotice(this.mainPanel.view === 'inbox' ? 'Search cleared' : 'Feed cleared'); });
        this.screen.key(['?', 'h'], () => { if (this._modal !== 'search') this._toggleHelp(); });
        this.screen.key(['escape'], () => {
            if (this._modal === 'help') this._toggleHelp();
        });
    }

    _focus(index) {
        this._focusedPanel = index;
        this._applyLayout();
        [this.mainPanel, this.twitchPanel, this.kickPanel][index].focus();
    }
    _inboxAction(action) {
        if (this._focusedPanel !== 0 || this.mainPanel.view !== 'inbox') return;
        action();
        this._refresh();
    }
    _search() {
        this._focus(0);
        this.mainPanel.setView('inbox');
        this._modal = 'search';
        this.prompt.setFront();
        this.prompt.readInput('Find server address, streamer or evidence (empty clears)', this.mainPanel.inbox.filters.search, (error, text) => {
            this._modal = null;
            if (!error && text !== null && text !== undefined) this.mainPanel.inbox.search(text);
            this.mainPanel.focus();
            this._refresh();
        });
    }
    _toggleHelp() {
        if (this._modal === 'help') {
            this.helpOverlay.hide();
            this._modal = null;
            this.screen.restoreFocus();
        } else {
            this._modal = 'help';
            this.screen.saveFocus();
            this.helpOverlay.show();
            this.helpOverlay.setFront();
            this.helpOverlay.focus();
        }
        this.screen.render();
    }
    _requestQuit() {
        if (this._quitArmed) { this.eventBus.publish('app:quit'); return; }
        this._quitArmed = true;
        this._showNotice('Press Q again to quit');
        clearTimeout(this._quitTimer);
        this._quitTimer = setTimeout(() => { this._quitArmed = false; }, 3000);
    }
    _showNotice(text) { this._notice = { text, until: Date.now() + 3000 }; this._refresh(); }
    _copyAddress() {
        const address = this.mainPanel.inbox.selectedAddress;
        if (!address) { this._showNotice('Select a server first'); return; }
        // OSC 52 is supported by many SSH terminals. Always display the address
        // too, so terminals that disable clipboard integration remain usable.
        this.screen.program.write(`\x1b]52;c;${Buffer.from(address).toString('base64')}\x07`);
        this._showNotice(`Copy requested: ${address}`);
    }
    _export(format) {
        try {
            const file = this.mainPanel.view === 'inbox'
                ? this.discoveries.export(format, this.mainPanel.inbox.filters)
                : this.logManager.exportToFile();
            this.eventBus.publish('log', { source: 'app', level: 'info', message: `Exported: ${file}`, timestamp: new Date() });
            this._showNotice(`Exported: ${file}`);
        } catch (error) { this._showNotice(`Export failed: ${error.message}`); }
    }
    _applyLayout() {
        if (!this.screen) return;
        const compact = this.screen.width < 110 || this.screen.height < 36;
        const solo = this._zoomed || compact;
        const mainHeight = Math.max(18, Math.floor(this.screen.height * 0.62));
        const panels = [this.mainPanel, this.twitchPanel, this.kickPanel];
        panels.forEach((panel, i) => {
            const el = panel.container;
            if (solo && i !== this._focusedPanel) { el.hide(); return; }
            el.top = solo || i === 0 ? 1 : mainHeight + 1;
            el.left = solo || i !== 2 ? 0 : '50%';
            el.width = solo || i === 0 ? '100%' : '50%';
            el.height = solo ? this.screen.height - 1 : i === 0 ? mainHeight : this.screen.height - mainHeight - 1;
            el.style.border.fg = i === this._focusedPanel ? 'white' : i === 1 ? '#9146FF' : i === 2 ? '#53FC18' : 'cyan';
            el.show();
        });
        this.mainPanel.resize();
        this.twitchPanel.resize();
        this.kickPanel.resize();
        this.mainPanel.inbox.refresh(true);
        this._compact = compact;
        this._refresh();
    }
    async _controlFocused(command) {
        const targets = this._focusedPanel === 0 ? ['twitch', 'kick'] : [this._focusedPanel === 1 ? 'twitch' : 'kick'];
        await Promise.all(targets.map(source => this.controlManager.execute(source, command)));
        this._refresh();
    }
    _refresh() {
        if (!this.screen) return;
        const twitchState = this.controlManager.getState('twitch');
        const kickState = this.controlManager.getState('kick');
        const spinner = SPINNER_FRAMES[this._spinnerIndex];
        if (this._notice && this._notice.until < Date.now()) this._notice = null;
        this.headerBar.setContent(formatHeaderBar({ focusedPanel: this._focusedPanel, twitchState, kickState, spinner, zoomed: this._zoomed, compact: this._compact, demo: this.demo, serverCount: this.discoveries.records.size }));
        this.mainPanel.update(twitchState, kickState, { spinner, notice: this._notice?.text });
        this.twitchPanel.updateStatus(twitchState, { spinner });
        this.kickPanel.updateStatus(kickState, { spinner });
        this.screen.render();
    }
    destroy() {
        clearInterval(this._refreshInterval);
        clearTimeout(this._quitTimer);
        this.eventBus.unsubscribe('state', this._stateHandler);
        this.mainPanel?.destroy();
        this.twitchPanel?.destroy();
        this.kickPanel?.destroy();
        this.screen?.destroy();
        this.screen = null;
    }
}
module.exports = TerminalUI;
