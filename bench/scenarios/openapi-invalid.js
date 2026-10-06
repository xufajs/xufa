// openapi.operations of @xufa/openapi: an id the document refuses (400).
const { build } = require('../lib/openapi-app');

module.exports = {
  description: 'OpenAPI route: an id the document refuses (400)',
  request: { method: 'GET', path: '/books/0' },
  expect: { status: 400 },
  build: (Framework) => build(Framework),
};
