// Loaded by mocha (-r ./resolve.js) before the tests: `sequelize` is the shim, which gives @xufa/sequelize, and the
// modules of sequelize/lib the shim does not give (dialect internals of other databases) come from the real package,
// so the test files that require them load (their tests are skipped for other dialects anyway).
// With SEQ_REAL=1, `sequelize` is the real Sequelize 6 (node_modules/real-sequelize): a test that fails there too is a
// problem of the test or of the environment, not of @xufa/sequelize.
const Module = require('module');
const fs = require('fs');
const path = require('path');
const layer = require('./layer');

const shim = path.join(__dirname, 'shim', 'sequelize');
const real = process.env.SEQ_REAL === '1';
// The snapshot is outside packages/sequelize: what it requires (@xufa/orm...) resolves from there.
const layerParent = {
  id: layer.dir,
  filename: path.join(layer.dir, 'index.js'),
  paths: Module._nodeModulePaths(path.join(__dirname, '..', '..', 'packages', 'sequelize')),
};

const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  if (request === 'sequelize' || request.startsWith('sequelize/')) {
    if (real) return resolve.call(this, `real-${request}`, parent, ...rest);
    if (request === 'sequelize') return resolve.call(this, shim, parent, ...rest);
    const local = path.join(shim, request.slice('sequelize/'.length));
    if (fs.existsSync(`${local}.js`) || fs.existsSync(path.join(local, 'index.js'))) {
      return resolve.call(this, local, parent, ...rest);
    }
    return resolve.call(this, `real-${request}`, parent, ...rest);
  }
  if (request.startsWith('@xufa/') && parent && parent.filename && parent.filename.startsWith(layer.dir)) {
    return resolve.call(this, request, layerParent, ...rest);
  }
  return resolve.call(this, request, parent, ...rest);
};

// mocha's JSON reporter cannot write bigints (in the values of failed assertions): they are written as text.
if (!BigInt.prototype.toJSON) {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function toJSON() {
    return this.toString();
  };
}
