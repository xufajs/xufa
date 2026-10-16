// Ported from multer's test/_util.js (MIT License) by tools/port-multer/port.js: do not edit, change the tool.
var fs = require('fs')
var path = require('path')
var stream = require('stream')

exports.file = function file (name) {
  return fs.createReadStream(path.join(__dirname, 'files', name))
}

exports.fileSize = function fileSize (path) {
  return fs.statSync(path).size
}

exports.submitForm = function submitForm (multer, form, cb) {
  form.getLength(function (err, length) {
    if (err) return cb(err)

    var req = new stream.PassThrough()

    form.pipe(req)
    req.headers = {
      'content-type': 'multipart/form-data; boundary=' + form.getBoundary(),
      'content-length': length
    }

    multer(req, null, function (err) {
      cb(err, req)
    })
  })
}
