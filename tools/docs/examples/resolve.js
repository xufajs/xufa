// Preloaded (node -r) by the examples of the docs: `require('@xufa/<name>/...')` and `require('xufa/...')` resolve to
// the packages of this repository, as an app that installed them would get them.
const Module = require('node:module');
const path = require('node:path');

const PACKAGES = path.join(__dirname, '../../../packages');
const original = Module._resolveFilename;

Module._resolveFilename = function resolve(request, parent, ...rest) {
  const scoped = /^@xufa\/([^/]+)(\/.*)?$/.exec(request);
  if (scoped) {
    // From the folder of the package itself: its name refers to it (and its exports apply).
    return original.call(
      this,
      request,
      {
        ...parent,
        paths: [path.join(PACKAGES, scoped[1], 'node_modules')],
        filename: path.join(PACKAGES, scoped[1], 'index.js'),
        id: request,
      },
      ...rest
    );
  }
  if (request === 'xufa' || request.startsWith('xufa/')) {
    return original.call(
      this,
      request,
      {
        ...parent,
        paths: [path.join(PACKAGES, 'xufa', 'node_modules')],
        filename: path.join(PACKAGES, 'xufa', 'index.js'),
        id: request,
      },
      ...rest
    );
  }
  return original.call(this, request, parent, ...rest);
};
