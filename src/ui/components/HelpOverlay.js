"use strict";
const blessed = require('blessed');

function createHelpOverlay(screen) {
    return blessed.box({ parent: screen, label: ' Keyboard shortcuts ', top: 'center', left: 'center', width: '90%', height: '90%', border: 'line', tags: true, hidden: true, scrollable: true, keys: true, mouse: true, scrollbar: { bg: 'cyan' }, style: { border: { fg: 'cyan' }, bg: 'black', fg: 'white' }, content: [
        '{cyan-fg}{bold}DISCOVERY INBOX{/bold}{/cyan-fg}',
        'I          Show inbox',
        '/          Search addresses, streamers and evidence',
        'Up/Down    Select server   Enter: focus evidence',
        'PgUp/PgDn  Move by ten servers',
        'V / F      Filter source: all / Twitch / Kick',
        'T          Active / favorites / archived',
        'O          Sort: recent / most seen / address',
        'B          Toggle favorite   A: archive / restore',
        'Y          Copy address (OSC 52; terminal support required)',
        'E / Ctrl+E Export visible records as JSON / CSV',
        'C          Clear search (history is retained)',
        '',
        '{cyan-fg}{bold}WORKSPACE{/bold}{/cyan-fg}',
        'Tab / Shift+Tab   Cycle panel focus',
        '1 / 2 / 3        Focus workspace / Twitch / Kick',
        'Z                Zoom focused panel',
        'M                Cycle inbox / logs / matches',
        '',
        '{cyan-fg}{bold}SCRAPERS (focused source; workspace targets both){/bold}{/cyan-fg}',
        'S Start   X Stop   P Pause   R Resume   Ctrl+R Restart',
        '',
        '{cyan-fg}{bold}LOGS / MATCHES{/bold}{/cyan-fg}',
        'F          Filter log level: all / info / warn / error',
        'E          Export log buffer   C: clear visible feed',
        '',
        'Q twice: quit   Ctrl+C: quit   ? / H / Esc: close help',
        '{gray-fg}Small terminals show one panel at a time. Tab switches it.{/gray-fg}',
    ].join('\n') });
}
module.exports = { createHelpOverlay };
