"use strict";

const blessed = require('blessed');
const { sparkline } = require('../../utils/colors');

/**
 * Key-value stats display widget.
 * Renders metric names, colored values, a scans/min rate, and an
 * activity sparkline of recent scan throughput.
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
        padding: { left: 1 },
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
    const uptime = stats.uptime ? formatUptime(stats.uptime) : '{gray-fg}—{/gray-fg}';
    const lastScan = stats.lastScanTime
        ? new Date(stats.lastScanTime).toLocaleTimeString()
        : '{gray-fg}—{/gray-fg}';
    const matches = stats.matches > 0
        ? `{yellow-fg}{bold}${stats.matches}{/bold}{/yellow-fg}`
        : `${stats.matches || 0}`;
    const errors = stats.errors > 0
        ? `{red-fg}{bold}${stats.errors}{/bold}{/red-fg}`
        : `${stats.errors || 0}`;
    const rate = stats.scansPerMin !== undefined ? `${stats.scansPerMin}/min` : '—';

    lines.push(`{${c}-fg}Scanned{/${c}-fg}  ${stats.scanned || 0}  {gray-fg}(${rate}){/gray-fg}`);
    lines.push(`{${c}-fg}Matches{/${c}-fg}  ${matches}`);
    lines.push(`{${c}-fg}Cache{/${c}-fg}    ${stats.cacheHits || 0}`);
    lines.push(`{${c}-fg}Errors{/${c}-fg}   ${errors}`);
    lines.push(`{${c}-fg}Uptime{/${c}-fg}   ${uptime}`);
    lines.push(`{${c}-fg}Last{/${c}-fg}     ${lastScan}`);
    lines.push(`{${c}-fg}${sparkline(stats.activity || [], 16)}{/${c}-fg}`);
    return lines.join('\n');
}

/** @param {number} seconds */
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

module.exports = { createStatsBox, formatStats };
