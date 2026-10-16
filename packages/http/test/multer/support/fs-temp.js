// The part of fs-temp that multer's tests use: folders made in the temporary folder (mkdir(cb), mkdirSync(), and
// template('name-%s') of them).
const fs = require('fs');
const os = require('os');
const path = require('path');

const prefixOf = (template) => path.join(os.tmpdir(), template.replace('%s', ''));

function templated(template) {
  return {
    mkdir(cb) {
      fs.mkdtemp(prefixOf(template), cb);
    },
    mkdirSync() {
      return fs.mkdtempSync(prefixOf(template));
    },
  };
}

module.exports = { ...templated('fs-temp-%s'), template: templated };
