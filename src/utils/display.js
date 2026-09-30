"use strict";

function plain(value) {
    return String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

function safe(value) {
    return plain(value).replace(/[{}]/g, c => c === '{' ? '{open}' : '{close}');
}

module.exports = { plain, safe };
