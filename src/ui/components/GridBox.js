"use strict";

const blessed = require('blessed');

/**
 * Reusable colored-border container for the TMUX-like grid layout.
 * Why: Encapsulates blessed box creation so panels only specify color + label.
 * @module GridBox
 * @param {blessed.Widgets.Screen} parent
 * @param {object} opts
 * @returns {blessed.Widgets.BoxElement}
 */
function createGridBox(parent, { label, color, top, left, width, height }) {
    return blessed.box({
        parent,
        label: ` ${label} `,
        top,
        left,
        width,
        height,
        border: { type: 'line' },
        style: {
            border: { fg: color },
            label: { fg: color, bold: true },
            focus: { border: { fg: 'white' } },
        },
        scrollable: false,
        tags: true,
    });
}

module.exports = { createGridBox };
