"use strict";

/**
 * ChatScraperUltimate — Entry Point
 * Launches the unified terminal UI that combines TwitchChatScraper
 * and KickChatScraper into a single management interface.
 */

const App = require('./src/core/App');

const app = new App();

app.start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
