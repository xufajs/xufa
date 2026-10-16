// rimraf(path, cb): a folder removed with what it has.
const fs = require('fs');

module.exports = (target, cb) => fs.rm(target, { recursive: true, force: true }, cb);

module.exports.sync = (target) => fs.rmSync(target, { recursive: true, force: true });
