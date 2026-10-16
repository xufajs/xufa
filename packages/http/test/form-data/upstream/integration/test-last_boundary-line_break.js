// Ported from form-data's test/integration/test-last_boundary-line_break.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var http = require('http');
var common = require('../common');
var assert = common.assert;
var FormData = require('../../../../form-data.js');
var server;

/**
 * Test submission of proper line ending
 */
function submitForm() {
  var form = new FormData();

  form.append('field', 'value');

  common.actions.submit(form, server);
}

// create https server
server = http.createServer(function (req, res) {
  var body = '';

  req.setEncoding('utf8');

  // old and simple
  req.on('data', function (data) {
    body += data;
  });

  req.on('end', function () {
    // last character(s) sequence equals predefined line break
    assert.strictEqual(body.substr(-1 * FormData.LINE_BREAK.length), FormData.LINE_BREAK);

    res.writeHead(200);
    res.end();
  });
});

// when https server ready submit form
server.listen(common.port, submitForm);
