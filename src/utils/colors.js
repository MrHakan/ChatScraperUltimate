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

module.exports = { BRAND, hexToRgb, colorize, getBrandColor };
