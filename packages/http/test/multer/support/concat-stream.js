// concat-stream as multer's tests use it: a writable that gives everything written, as one Buffer, when it ends.
const { Writable } = require('stream');

module.exports = function concat(options, cb) {
  const chunks = [];
  return new Writable({
    write(chunk, encoding, next) {
      chunks.push(chunk);
      next();
    },
    final(next) {
      cb(Buffer.concat(chunks));
      next();
    },
  });
};
