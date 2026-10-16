// Ported from form-data's test/integration/test-to-string.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;
var FormData = require('../../../../form-data.js');

assert(String(new FormData()) === '[object FormData]');
assert(Object.prototype.toString.call(new FormData()) === '[object FormData]');
