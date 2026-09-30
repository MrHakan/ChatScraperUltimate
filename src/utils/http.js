"use strict";

const { setTimeout: delay } = require('node:timers/promises');

async function requestJson(url, options = {}, { signal, retries = 2, timeoutMs = 15000, fetchImpl = fetch } = {}) {
    for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        const timedSignal = AbortSignal.timeout(timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, timedSignal]) : timedSignal;
        try {
            const response = await fetchImpl(url, { ...options, signal: requestSignal });
            if (response.ok) return response.status === 204 ? null : await response.json();
            if ((response.status === 429 || response.status >= 500) && attempt < retries) {
                const retryHeader = response.headers.get('retry-after');
                const seconds = Number(retryHeader);
                const retryDate = Date.parse(retryHeader);
                const waitMs = retryHeader && Number.isFinite(seconds) ? seconds * 1000
                    : Number.isFinite(retryDate) ? retryDate - Date.now() : 500 * 2 ** attempt;
                await response.body?.cancel();
                await delay(Math.max(100, Math.min(waitMs, 30000)), undefined, { signal });
                continue;
            }
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            if (signal?.aborted || error.message?.startsWith('HTTP ') || attempt >= retries) throw error;
            await delay(500 * 2 ** attempt, undefined, { signal });
        }
    }
}

module.exports = { requestJson };
