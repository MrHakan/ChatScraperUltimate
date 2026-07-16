"use strict";

/**
 * Brand color constants and ANSI helper utilities for the terminal UI.
 * Why: Centralized color definitions ensure visual consistency across all panels.
 * @module colors
 */

/** @enum {string} Brand hex colors for each panel */
const BRAND = {
  MAIN: '#00FFFF',
  TWITCH: '#9146FF',
  KICK: '#53FC18',
  SUCCESS: '#00FF00',
  ERROR: '#FF0000',
  WARNING: '#FFA500',
  INFO: '#FFFFFF',
  DIM: '#666666',
};

/** @enum {string} Foreground colors for log levels (blessed tag names) */
const LEVEL_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'white',
  debug: 'gray',
  success: 'green',
};

/** @enum {string} Foreground colors for log sources */
const SOURCE_COLORS = {
  twitch: BRAND.TWITCH,
  kick: BRAND.KICK,
  app: 'cyan',
};

/** Braille spinner frames used to animate "running" states. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Renders a scraper state as a colored badge with a status dot.
 * @param {string} state - 'running' | 'paused' | 'stopped' | 'starting' | 'stopping' | 'error'
 * @param {string} [spinner] - Current spinner frame, appended when running
 * @returns {string} Blessed tag markup
 */
function stateBadge(state, spinner) {
  const s = (state || 'unknown').toLowerCase();
  const styles = {
    running: { bg: 'green', fg: 'black', dot: '●' },
    paused: { bg: 'yellow', fg: 'black', dot: '◐' },
    starting: { bg: 'blue', fg: 'white', dot: '◌' },
    stopping: { bg: 'blue', fg: 'white', dot: '◌' },
    stopped: { bg: 'gray', fg: 'white', dot: '○' },
    error: { bg: 'red', fg: 'white', dot: '✖' },
  };
  const st = styles[s] || styles.stopped;
  const anim = s === 'running' && spinner ? ` ${spinner}` : '';
  return `{${st.fg}-fg}{${st.bg}-bg} ${st.dot} ${s.toUpperCase()}${anim} {/${st.bg}-bg}{/${st.fg}-fg}`;
}

/**
 * Renders numeric samples as a unicode block sparkline.
 * @param {number[]} values - Raw samples (any non-negative range)
 * @param {number} [width=16] - Maximum number of characters
 * @returns {string}
 */
function sparkline(values, width = 16) {
  const blocks = '▁▂▃▄▅▆▇█';
  if (!values || values.length === 0) return '▁'.repeat(width);
  const slice = values.slice(-width);
  const max = Math.max(...slice, 1);
  let out = slice
    .map((v) => blocks[Math.min(blocks.length - 1, Math.floor((v / max) * (blocks.length - 1)))])
    .join('');
  if (out.length < width) out = '▁'.repeat(width - out.length) + out;
  return out;
}

/**
 * Converts a hex color string to an RGB object.
 * @param {string} hex - Hex color string (e.g. '#FF00AA')
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/**
 * Wraps text with ANSI 24-bit foreground color escape codes.
 * @param {string} text - Text to colorize
 * @param {string} hex - Hex color string
 * @returns {string}
 */
function colorize(text, hex) {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

/**
 * Returns the blessed-compatible color name or hex for a brand key.
 * @param {keyof typeof BRAND} key
 * @returns {string}
 */
function getBrandColor(key) {
  return BRAND[key] || BRAND.INFO;
}

module.exports = {
  BRAND,
  LEVEL_COLORS,
  SOURCE_COLORS,
  SPINNER_FRAMES,
  stateBadge,
  sparkline,
  hexToRgb,
  colorize,
  getBrandColor,
};
