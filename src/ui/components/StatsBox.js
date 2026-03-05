"use strict";

const blessed = require('blessed');

/**
 * Key-value stats display widget.
 * Renders a simple table of metric names and values.
 * @module StatsBox
 * @param {blessed.Widgets.BoxElement} parent
 * @param {object} opts
 * @returns {blessed.Widgets.BoxElement}
 */
function createStatsBox(parent, { label, color, top, left, width, height }) {
    return blessed.box({
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
        },
        tags: true,
        content: '',
    });
}

/**
 * Formats stats object into display string.
 * @param {object} stats
 * @param {string} color - Blessed color tag name
 * @returns {string}
 */
function formatStats(stats, color) {
    const c = color || 'white';
    const lines = [];
    const uptime = stats.uptime ? formatUptime(stats.uptime) : '—';
    const lastScan = stats.lastScanTime
        ? new Date(stats.lastScanTime).toLocaleTimeString()
        : '—';

    lines.push(`{${c}-fg}Scanned:{/${c}-fg}  ${stats.scanned || 0}`);
    lines.push(`{${c}-fg}Matches:{/${c}-fg}  ${stats.matches || 0}`);
    lines.push(`{${c}-fg}Cache:{/${c}-fg}    ${stats.cacheHits || 0}`);
    lines.push(`{${c}-fg}Errors:{/${c}-fg}   ${stats.errors || 0}`);
    lines.push(`{${c}-fg}Uptime:{/${c}-fg}   ${uptime}`);
    lines.push(`{${c}-fg}Last:{/${c}-fg}     ${lastScan}`);
    return lines.join('\n');
}

/** @param {number} seconds */
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

module.exports = { createStatsBox, formatStats };
