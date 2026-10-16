// Ported from form-data's test/integration/test-get-boundary.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;

var FormData = require('../../../../form-data.js');

(function testOneBoundaryPerForm() {
  var form = new FormData();
  var boundary = form.getBoundary();

  assert.equal(boundary, form.getBoundary());
  assert.equal(boundary.length, 50);
}());

(function testUniqueBoundaryPerForm() {
  var formA = new FormData();
  var formB = new FormData();
  assert.notEqual(formA.getBoundary(), formB.getBoundary());
}());
