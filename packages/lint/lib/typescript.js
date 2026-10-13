'use strict';

// TypeScript, whose parser reads the code: the project's, else the one installed with @xufa/lint.
const path = require('node:path');
const { createRequire } = require('node:module');

function load() {
  for (const from of [path.join(process.cwd(), 'package.json'), __filename]) {
    try {
      return createRequire(from)('typescript');
    } catch {
      // the next one
    }
  }
  throw new Error('@xufa/lint reads code with TypeScript: npm install --save-dev typescript');
}

module.exports = load();
