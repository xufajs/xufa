// Ported from form-data's test/integration/test-options-override.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;
var FormData = require('../../../../form-data.js');

var form = new FormData({ maxDataSize: 20 * 1024 * 1024 });
assert.strictEqual(form.maxDataSize, 20 * 1024 * 1024);
