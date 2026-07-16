"use strict";

const blessed = require('blessed');

/**
 * Centered modal listing every keyboard shortcut.
 * Why: The app has grown enough hotkeys that discoverability matters;
 * a toggleable cheat-sheet beats memorizing the README.
 * @module HelpOverlay
 * @param {blessed.Widgets.Screen} screen
 * @returns {blessed.Widgets.BoxElement}
 */
function createHelpOverlay(screen) {
    const box = blessed.box({
        parent: screen,
        label: ' Keyboard Shortcuts ',
        top: 'center',
        left: 'center',
        width: 62,
        height: 22,
        border: { type: 'line' },
        style: {
            border: { fg: 'cyan' },
            label: { fg: 'cyan', bold: true },
            fg: 'white',
            bg: 'black',
        },
        tags: true,
        hidden: true,
        content: buildHelpContent(),
    });
    box.setIndex(100); // always on top
    return box;
}

/** @returns {string} Formatted help text */
function buildHelpContent() {
    const key = (k) => `{cyan-fg}${k.padEnd(8)}{/cyan-fg}`;
    const section = (t) => `\n{bold}{yellow-fg}${t}{/yellow-fg}{/bold}`;
    return [
        section('Panels'),
        ` ${key('Tab')} Cycle panel focus`,
        ` ${key('1 / 2 / 3')} Focus Main / Twitch / Kick`,
        ` ${key('Z')} Zoom focused panel (tmux-style)`,
        section('Scraper control  (targets focused panel)'),
        ` ${key('S')} Start    ${key('X')} Stop`,
        ` ${key('P')} Pause    ${key('R')} Resume`,
        ` ${key('Ctrl+R')} Restart`,
        section('Logs'),
        ` ${key('F')} Cycle level filter (ALL→INFO→WARN→ERROR)`,
        ` ${key('M')} Toggle Logs / Matches view`,
        ` ${key('E')} Export log buffer to file`,
        ` ${key('C')} Clear log buffer`,
        section('General'),
        ` ${key('?  or H')} Toggle this help`,
        ` ${key('Q')} Quit (press twice)   ${key('Ctrl+C')} Force quit`,
        '',
        '{gray-fg}          Press ?, H or Esc to close{/gray-fg}',
    ].join('\n');
}

module.exports = { createHelpOverlay };
