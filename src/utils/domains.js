"use strict";

// Match complete DNS names, including an optional Minecraft port. A configured
// suffix must be an exact DNS boundary, never part of another site's hostname.
function extractAddresses(text, targetDomains = ['aternos.me', 'exaroton.me']) {
    const suffixes = targetDomains.map(d => String(d).toLowerCase().replace(/^\./, ''));
    const tokens = String(text || '').toLowerCase().matchAll(/(?<![a-z0-9_.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::([0-9]+))?(?![a-z0-9_-])/g);
    const found = new Set();
    for (const match of tokens) {
        const host = match[1];
        if (host.length > 253 || !suffixes.some(s => host.endsWith('.' + s))) continue;
        const port = match[2] ? Number(match[2]) : 25565;
        if (port < 1 || port > 65535) continue;
        found.add(port === 25565 ? host : `${host}:${port}`);
    }
    return [...found];
}

function matchText(text, config) {
    const lower = String(text || '').toLowerCase();
    const addresses = extractAddresses(text, config.targetDomains);
    const keyword = (config.keywords || ['aternos', 'exaroton']).find(k => lower.includes(k.toLowerCase()));
    return { matched: addresses.length > 0 || Boolean(keyword), addresses, keyword, isDomain: addresses.length > 0 };
}

module.exports = { extractAddresses, matchText };
