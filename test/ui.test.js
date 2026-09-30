"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const EventBus = require('../src/core/EventBus');
const DiscoveryManager = require('../src/core/DiscoveryManager');
const LogManager = require('../src/core/LogManager');
const StatsManager = require('../src/core/StatsManager');
const ControlManager = require('../src/core/ControlManager');
const TerminalUI = require('../src/ui/TerminalUI');

function setup(t, columns, rows) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-ui-'));
    const bus = new EventBus();
    const store = new DiscoveryManager(bus, { filePath: path.join(dir, 'history.json') });
    store.start();
    const log = new LogManager(bus); log.start();
    const stats = new StatsManager(bus); stats.start();
    const control = new ControlManager(bus, { twitch: { state: 'stopped' }, kick: { state: 'stopped' } }, stats);
    const input = new PassThrough(); input.isTTY = true; input.setRawMode = () => {};
    const output = new PassThrough(); output.isTTY = true; output.columns = columns; output.rows = rows; output.on('data', () => {});
    const ui = new TerminalUI(bus, log, stats, control, store, { demo: true, screenOptions: { input, output, terminal: 'xterm-256color' } });
    ui.initialize();
    t.after(() => { ui.destroy(); store.stop(); stats.stop(); log.stop(); input.destroy(); output.destroy(); fs.rmSync(dir, { recursive: true, force: true }); });
    return { ui, bus, store, log, input };
}

for (const [columns, rows] of [[160, 50], [80, 24], [60, 20]]) {
    test(`terminal ${columns}x${rows} shows inbox and adaptive panel layout`, t => {
        const { ui, bus } = setup(t, columns, rows);
        bus.publish('match', { source: 'twitch', data: { streamer: 'test', message: 'play.aternos.me', viewers: 3 } });
        ui._refresh();
        assert.equal(ui.mainPanel.inbox.records.length, 1);
        const text = ui.screen.lines.map(row => row.map(cell => cell[1]).join('')).join('\n');
        assert.ok(text.includes('play.aternos.me'));
        assert.ok(text.includes('DEMO'));
        assert.equal(ui.twitchPanel.container.hidden, columns < 110 || rows < 36);
        ui._focus(1);
        assert.equal(ui.twitchPanel.container.hidden, false);
        assert.equal(ui.mainPanel.container.hidden, columns < 110 || rows < 36);
        ui._focus(0);
        if (process.env.CSU_UI_SNAPSHOT_DIR) {
            fs.mkdirSync(process.env.CSU_UI_SNAPSHOT_DIR, { recursive: true });
            fs.writeFileSync(path.join(process.env.CSU_UI_SNAPSHOT_DIR, `${columns}x${rows}.json`), JSON.stringify(ui.screen.lines));
        }
    });
}
test('inbox selection, archive and source filters update details without deleting history', t => {
    const { ui, bus, store } = setup(t, 160, 50);
    bus.publish('match', { source: 'twitch', data: { streamer: 'alice', message: 'one.aternos.me' } });
    bus.publish('match', { source: 'kick', data: { streamer: 'bob', content: 'two.exaroton.me' } });
    ui._refresh();
    const inbox = ui.mainPanel.inbox;
    inbox.search('bob');
    assert.equal(inbox.selectedAddress, 'two.exaroton.me');
    assert.ok(inbox.details.getContent().includes('bob'));
    inbox.toggle('archived');
    assert.equal(inbox.records.length, 0);
    inbox.cycle('status'); inbox.cycle('status');
    assert.equal(inbox.records.length, 1);
    assert.equal(store.records.size, 2);
});
test('switching views preserves server history and clears only the relevant feed', t => {
    const { ui, bus, store, log } = setup(t, 80, 24);
    bus.publish('match', { source: 'twitch', data: { message: 'one.aternos.me' } });
    bus.publish('log', { source: 'app', message: 'test', level: 'info', timestamp: new Date() });
    ui.mainPanel.toggleView();
    assert.equal(ui.mainPanel.view, 'logs');
    assert.ok(ui.mainPanel.logBox.getContent().includes('test'));
    ui.mainPanel.clear();
    assert.equal(log.buffer.length, 0);
    assert.equal(store.records.size, 1);
    ui.mainPanel.toggleView();
    assert.equal(ui.mainPanel.view, 'matches');
    ui.mainPanel.clear();
    assert.equal(ui.mainPanel._matchFeed.length, 0);
    ui.mainPanel.toggleView();
    assert.equal(ui.mainPanel.view, 'inbox');
    assert.equal(ui.mainPanel.inbox.records.length, 1);
});
test('search typing does not trigger global scraper, view or quit shortcuts', async t => {
    const { ui, input } = setup(t, 80, 24);
    ui._search();
    await new Promise(resolve => setImmediate(resolve));
    input.write('sparrow');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(ui._modal, 'search');
    assert.equal(ui.mainPanel.view, 'inbox');
    assert.equal(ui._quitArmed, false);
    input.write('\r');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(ui._modal, null);
    assert.equal(ui.mainPanel.inbox.filters.search, 'sparrow');
});

test('Ctrl+C remains available while the search prompt captures other keys', async t => {
    const { ui, bus, input } = setup(t, 80, 24);
    let quits = 0;
    bus.subscribe('app:quit', () => { quits++; });
    ui._search();
    await new Promise(resolve => setImmediate(resolve));
    input.write('\x03');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(quits, 1);
    input.write('\x1b');
});
