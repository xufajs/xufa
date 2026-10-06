// openapi.operations of @xufa/openapi: a list of 20 books, serialized by the document.
const { build, LIST } = require('../lib/openapi-app');

module.exports = {
  description: 'OpenAPI route: a list of 20 books',
  request: { method: 'GET', path: '/books' },
  expect: { status: 200, body: LIST },
  build: (Framework) => build(Framework),
};
