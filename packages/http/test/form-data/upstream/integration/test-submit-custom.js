// Ported from form-data's test/integration/test-submit-custom.js (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.
'use strict';

var common = require('../common');
var assert = common.assert;
var mime = require('../../support/mime-types.js');
var request = require('../../support/request.js');
var fs = require('fs');
var FormData = require('../../../../form-data.js');

var remoteFile = 'http://localhost:' + common.staticPort + '/unicycle.jpg';

/*
 * wrap non simple values into function
 * just to deal with ReadStream "autostart"
 */
var FIELDS = {
  my_field: {
    value: 'my_value'
  },
  my_buffer: {
    type: FormData.DEFAULT_CONTENT_TYPE,
    value: common.defaultTypeValue
  },
  my_file: {
    type: mime.lookup(common.dir.fixture + '/unicycle.jpg'),
    value: function () { return fs.createReadStream(common.dir.fixture + '/unicycle.jpg'); }
  },
  remote_file: {
    type: mime.lookup(common.dir.fixture + '/unicycle.jpg'),
    value: function () { return request(remoteFile); }
  }
};

// count total
var fieldsPassed = Object.keys(FIELDS).length;

// prepare form-receiving http server
var server = common.testFields(FIELDS, function (fields) {
  fieldsPassed = fields;
});

server.listen(common.port, function () {
  var form = new FormData();

  common.actions.populateFields(form, FIELDS);

  // custom params object passed to submit
  form.submit({
    port: common.port,
    path: '/'
  }, function (err, res) {
    if (err) {
      throw err;
    }

    assert.strictEqual(res.statusCode, 200);

    res.resume();
    server.close();
  });

});

process.on('exit', function () {
  assert.strictEqual(fieldsPassed, 0);
});
