"use strict";

const blessed = require('blessed');
const { stateBadge } = require('../../utils/colors');

/**
 * Horizontal control bar with action hotkeys and live status indicators.
 * @module ControlBar
 * @param {blessed.Widgets.BoxElement} parent
 * @param {object} opts
 * @returns {blessed.Widgets.BoxElement}
 */
function createControlBar(parent, { top, left, width, height, color }) {
    return blessed.box({
        parent,
        top: top || 0,
        left: left || 0,
        width: width || '100%',
        height: height || 3,
        border: { type: 'line' },
        style: {
            border: { fg: color || 'cyan' },
            fg: 'white',
        },
        tags: true,
        wrap: false,
        padding: { left: 1 },
        content: '',
    });
}

/**
 * Generates the control bar content string with current states and modes.
 * @param {string} twitchState
 * @param {string} kickState
 * @param {object} [opts]
 * @param {string} [opts.spinner] - Current spinner animation frame
 * @param {string} [opts.filter] - Active log level filter ('all', 'info', ...)
 * @param {string} [opts.view] - Active main view ('logs' | 'matches')
 * @param {string} [opts.notice] - Transient message (e.g. quit confirmation)
 * @returns {string}
 */
function formatControlBar(twitchState, kickState, opts = {}) {
    if (opts.notice) {
        return `{yellow-fg}{bold}${opts.notice}{/bold}{/yellow-fg}`;
    }

    const key = (k, label) => `{black-fg}{cyan-bg} ${k} {/cyan-bg}{/black-fg}${label}`;
    const filter = (opts.filter || 'all').toUpperCase();
    const view = (opts.view || 'logs').toUpperCase();
    const filterTag = filter === 'ALL'
        ? `{gray-fg}${filter}{/gray-fg}`
        : `{yellow-fg}{bold}${filter}{/bold}{/yellow-fg}`;

    return [
        key('S', 'tart'),
        key('X', ' Stop'),
        key('P', 'ause'),
        key('R', 'esume'),
        key('F', ` ${filterTag}`),
        key('M', ` ${view}`),
        key('?', ' Help'),
        `{|}Twitch ${stateBadge(twitchState, opts.spinner)}  Kick ${stateBadge(kickState, opts.spinner)} `,
    ].join('  ');
}

module.exports = { createControlBar, formatControlBar };
