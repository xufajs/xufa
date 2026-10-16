// Ported from multer's test/issue-232.js (MIT License) by tools/port-multer/port.js: do not edit, change the tool.
/* eslint-env mocha */

var assert = require('assert')

var util = require('./_util')
var multer = require('../../../multer.js')
var temp = require('../support/fs-temp.js')
var rimraf = require('../support/rimraf.js')
var FormData = require('../../../form-data.js')

describe('Issue #232', function () {
  var uploadDir, upload

  beforeAll(function (done) {
    temp.mkdir(function (err, path) {
      if (err) return done(err)

      uploadDir = path
      upload = multer({ dest: path, limits: { fileSize: 100 } })
      done()
    })
  })

  afterAll(function (done) {
    rimraf(uploadDir, done)
  })

  it('should report limit errors', function (done) {
    var form = new FormData()
    var parser = upload.single('file')

    form.append('file', util.file('large.jpg'))

    util.submitForm(parser, form, function (err, req) {
      assert.ok(err, 'an error was given')

      assert.strictEqual(err.code, 'LIMIT_FILE_SIZE')
      assert.strictEqual(err.field, 'file')

      done()
    })
  })
})
