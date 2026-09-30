"use strict";

const { parentPort, workerData } = require('worker_threads');
const EventBus = require('../core/EventBus');

module.exports = function runWorker(Scraper) {
    const bus = new EventBus();
    for (const type of ['log', 'stats', 'state', 'match']) bus.subscribe(type, data => parentPort.postMessage({ type, data }));
    const scraper = new Scraper(workerData.config, bus);
    let commands = Promise.resolve();
    let generation = 0;
    const failed = (command, error) => {
        scraper.setState('error');
        scraper.log('error', `Cannot ${command}: ${error.message}`);
    };
    parentPort.on('message', msg => {
        if (msg.type !== 'command' || !['start', 'stop', 'pause', 'resume'].includes(msg.command)) return;
        if (msg.command === 'stop') {
            generation++;
            // Interrupt pending HTTP/browser initialization now; the queue still
            // joins it before acknowledging a completely stopped generation.
            const stopping = scraper.stop().catch(error => failed('stop', error));
            commands = commands.then(() => stopping).then(async () => {
                await scraper.stop();
                parentPort.postMessage({ type: 'state', data: { source: scraper.name, state: 'stopped' } });
            }).catch(error => failed('stop', error));
            return;
        }
        const acceptedGeneration = generation;
        commands = commands.then(() => {
            if (acceptedGeneration === generation) return scraper[msg.command]();
        }).catch(error => failed(msg.command, error));
    });
    scraper.log('info', `${scraper.name} worker ready`);
};
