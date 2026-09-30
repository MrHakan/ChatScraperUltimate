"use strict";

/**
 * ChatScraperUltimate — Entry Point
 * Launches the unified terminal UI that combines TwitchChatScraper
 * and KickChatScraper into a single management interface.
 */

const App = require('./src/core/App');

if (process.argv.includes('--help')) {
    console.log('ChatScraperUltimate\n  npm start     Start the terminal\n  npm run demo  Offline sample data, no credentials or network\n  npm test      Run regression tests');
    process.exit(0);
}
if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error('An interactive terminal is required. Use npm test for headless validation.');
    process.exit(1);
}

const app = new App({ demo: process.argv.includes('--demo') });

app.start().catch(async (err) => {
    await app.shutdown();
    console.error('Fatal startup error:', err);
    process.exitCode = 1;
});
