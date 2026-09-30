"use strict";
const blessed = require('blessed');
const { stateBadge } = require('../../utils/colors');

function createHeaderBar(screen) {
    return blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, tags: true, style: { fg: 'white', bg: 'black' } });
}
function formatHeaderBar({ focusedPanel, twitchState, kickState, spinner, serverCount, zoomed, compact, demo }) {
    const tabs = ['1 Inbox', '2 Twitch', '3 Kick'].map((name, i) => i === focusedPanel ? `{black-fg}{cyan-bg} ${name} {/cyan-bg}{/black-fg}` : `{gray-fg} ${name} {/gray-fg}`).join('');
    const brand = compact ? 'CSU' : 'ChatScraperUltimate';
    const status = compact ? '' : ` {#9146FF-fg}TW{/#9146FF-fg} ${stateBadge(twitchState, spinner)}  {#53FC18-fg}KI{/#53FC18-fg} ${stateBadge(kickState, spinner)}`;
    return `{bold}{cyan-fg} ${brand}${demo ? ' [DEMO]' : ''} {/cyan-fg}{/bold} ${tabs}${zoomed ? ' ZOOM' : ''} {|}${serverCount} servers${status} `;
}
module.exports = { createHeaderBar, formatHeaderBar };
