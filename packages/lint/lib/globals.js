'use strict';

// The globals of environments, as the package globals gives them (lib/globals.json, by tools/port-lint):
// languageOptions: { globals: { ...globals.node, ...globals.browser } }. Each is { name: false (read only) or true }.
module.exports = require('./globals.json');
