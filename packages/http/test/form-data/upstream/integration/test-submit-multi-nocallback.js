// Ported from form-data's test/integration/test-submit-multi-nocallback.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;
var http = require('http');
var FormData = require('../../../../form-data.js');
var IncomingForm = require('../../support/formidable.js').IncomingForm;

var times = 10;

var server = http.createServer(function (req, res) {
  // no need to have tmp dir here, since no files being uploaded
  // but formidable would fail in 0.6 otherwise
  var form = new IncomingForm({ uploadDir: common.dir.tmp });

  form.parse(req);

  form
    .on('field', common.actions.basicFormOnField)
    .on('end', function () {
      res.writeHead(200);
      res.end('done');

      times -= 1;

      if (times === 0) {
        server.close();
      }
    });
});

server.listen(common.port, function () {
  for (var i = 0; i < times; i++) {
    var form = new FormData();

    form.append('my_field', 'my_value');

    form.submit('http://localhost:' + common.port + '/');
  }
});

process.on('exit', function () {
  assert.strictEqual(times, 0);
});
