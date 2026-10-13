const Module = require('node:module');
const path = require('node:path');

// the runner's own hoisting of vi.mock calls (@xufa/test/src/modules/hoist.js), from the @xufa/test that runs.
let hoist = null;

function hoistMocks(source, options) {
  if (!hoist) {
    let manifest;
    try {
      manifest = Module.createRequire(path.join(process.cwd(), 'package.json')).resolve('@xufa/test/package.json');
    } catch {
      manifest = require.resolve('@xufa/test/package.json');
    }
    // eslint-disable-next-line global-require -- the runner's internals, by path
    hoist = require(path.join(path.dirname(manifest), 'src', 'modules', 'hoist.js')).hoistMocks;
  }
  return hoist(source, options);
}

module.exports = { hoistMocks };
