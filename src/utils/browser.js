"use strict";

async function launchBrowser(options, signal) {
    const native = require('puppeteer');
    const { addExtra } = require('puppeteer-extra');
    // Extra deep-clones launch options, which turns an AbortSignal into a plain
    // object. Attach the original signal at the native launch boundary instead.
    const backend = { ...native, launch: merged => native.launch({ ...merged, signal }) };
    const launcher = addExtra(backend);
    launcher.use(require('puppeteer-extra-plugin-stealth')());
    return launcher.launch(options);
}

module.exports = { launchBrowser };
