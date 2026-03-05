"use strict";

const EventEmitter = require('events');

/**
 * Central pub/sub event system for cross-module communication.
 * Acts as a singleton mediator between scrapers, managers, and UI.
 * Why: Decouples producers (scrapers) from consumers (UI panels, log manager)
 * so modules can be developed and tested independently.
 * @module EventBus
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
    }

    /**
     * Publishes an event with source metadata.
     * @param {string} event - Event name: 'log', 'stats', 'state', 'match', 'config'
     * @param {object} data - Event payload
     */
    publish(event, data) {
        this.emit(event, data);
    }

    /**
     * Subscribes a callback to an event channel.
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {this}
     */
    subscribe(event, callback) {
        this.on(event, callback);
        return this;
    }

    /**
     * Unsubscribes a callback from an event channel.
     * @param {string} event
     * @param {Function} callback
     * @returns {this}
     */
    unsubscribe(event, callback) {
        this.off(event, callback);
        return this;
    }

    /** Removes all listeners from all event channels. */
    clear() {
        this.removeAllListeners();
    }
}

module.exports = EventBus;
