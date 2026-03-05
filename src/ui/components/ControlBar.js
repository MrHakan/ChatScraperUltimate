"use strict";

const blessed = require('blessed');

/**
 * Horizontal control bar with action buttons and status indicators.
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
        content: '',
    });
}

/**
 * Generates the control bar content string with current states.
 * @param {string} twitchState
 * @param {string} kickState
 * @returns {string}
 */
function formatControlBar(twitchState, kickState) {
    const tIcon = twitchState === 'running' ? '{green-fg}●{/green-fg}' : '{red-fg}○{/red-fg}';
    const kIcon = kickState === 'running' ? '{green-fg}●{/green-fg}' : '{red-fg}○{/red-fg}';

    return [
        `{cyan-fg}[S]{/cyan-fg}tart  {cyan-fg}[X]{/cyan-fg}Stop  {cyan-fg}[P]{/cyan-fg}ause  {cyan-fg}[R]{/cyan-fg}esume  {cyan-fg}[Ctrl+R]{/cyan-fg}estart`,
        `Twitch: ${tIcon} ${twitchState.toUpperCase().padEnd(8)}   Kick: ${kIcon} ${kickState.toUpperCase().padEnd(8)}   {cyan-fg}[Tab]{/cyan-fg} Switch  {cyan-fg}[Q]{/cyan-fg} Quit`,
    ].join('  │  ');
}

module.exports = { createControlBar, formatControlBar };
