"use strict";

const blessed = require('blessed');
const { stateBadge } = require('../../utils/colors');

/**
 * One-line application header: branding on the left, panel tabs in the
 * middle, live scraper badges + clock on the right.
 * Why: Gives the TMUX-like layout a persistent status line so the most
 * important signals (states, matches, time) are visible from any panel.
 * @module HeaderBar
 * @param {blessed.Widgets.Screen} screen
 * @returns {blessed.Widgets.BoxElement}
 */
function createHeaderBar(screen) {
    return blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        tags: true,
        style: { fg: 'white', bg: 'black' },
        content: '',
    });
}

/**
 * Builds the header content string.
 * @param {object} opts
 * @param {number} opts.focusedPanel - 0=main, 1=twitch, 2=kick
 * @param {string} opts.twitchState
 * @param {string} opts.kickState
 * @param {string} opts.spinner - Current spinner frame
 * @param {number} opts.totalMatches
 * @param {boolean} opts.zoomed
 * @returns {string}
 */
function formatHeaderBar({ focusedPanel, twitchState, kickState, spinner, totalMatches, zoomed }) {
    const tabs = ['1:MAIN', '2:TWITCH', '3:KICK'].map((name, i) => {
        return i === focusedPanel
            ? `{black-fg}{cyan-bg} ${name} {/cyan-bg}{/black-fg}`
            : `{gray-fg} ${name} {/gray-fg}`;
    }).join('');

    const zoom = zoomed ? ' {black-fg}{yellow-bg} ZOOM {/yellow-bg}{/black-fg}' : '';
    const clock = new Date().toLocaleTimeString();

    return [
        `{bold}{cyan-fg} ⚡ ChatScraperUltimate {/cyan-fg}{/bold}`,
        tabs,
        zoom,
        `{|}`,
        `{#9146FF-fg}TW{/#9146FF-fg} ${stateBadge(twitchState, spinner)} `,
        `{#53FC18-fg}KI{/#53FC18-fg} ${stateBadge(kickState, spinner)} `,
        `{yellow-fg}★ ${totalMatches}{/yellow-fg}  {gray-fg}${clock}{/gray-fg} `,
    ].join(' ');
}

module.exports = { createHeaderBar, formatHeaderBar };
