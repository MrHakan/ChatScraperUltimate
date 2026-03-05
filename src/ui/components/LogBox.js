"use strict";

const blessed = require('blessed');

/**
 * Scrollable log text area with automatic scroll-to-bottom.
 * @module LogBox
 * @param {blessed.Widgets.BoxElement} parent
 * @param {object} opts
 * @returns {blessed.Widgets.Log}
 */
function createLogBox(parent, { label, color, top, left, width, height }) {
    return blessed.log({
        parent,
        label: label ? ` ${label} ` : undefined,
        top: top || 0,
        left: left || 0,
        width: width || '100%',
        height: height || '100%',
        border: label ? { type: 'line' } : undefined,
        style: {
            border: { fg: color || 'white' },
            label: { fg: color || 'white' },
            fg: 'white',
            bg: 'default',
        },
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            style: { bg: color || 'white' },
        },
        mouse: true,
        keys: true,
        vi: true,
    });
}

module.exports = { createLogBox };
