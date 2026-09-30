"use strict";
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) check(file);
        else if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    }
}
for (const dir of ['src', 'scripts', 'test']) check(dir);
execFileSync(process.execPath, ['--check', 'index.js'], { stdio: 'inherit' });
console.log('JavaScript syntax checks passed');
