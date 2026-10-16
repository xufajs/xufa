// Ported from form-data's test/integration/test-set-nonstring.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;

var FormData = require('../../../../form-data.js');

(function testSetUndefined() {
  var form = new FormData();

  assert.doesNotThrow(function () {
    form.append('key', undefined);
  });

  var buffer = form.getBuffer();

  assert.deepEqual(buffer.toString().split(form.getBoundary()), [
    '--',
    '\r\nContent-Disposition: form-data; name="key"\r\n\r\nundefined\r\n--',
    '--\r\n'
  ]);
}());
