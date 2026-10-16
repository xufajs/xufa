'use strict';

// supertest as Express's tests use it (test/upstream requires it in place of the package): @xufa/test/supertest with
// the paths of supertest 6, the version Express tests with (dot segments kept: its tests of paths that climb past a
// root send them so).
const request = require('@xufa/test/supertest');

module.exports = Object.assign((app) => request(app, { legacyPaths: true }), request, {
  agent: (app) => request.agent(app, { legacyPaths: true }),
});
