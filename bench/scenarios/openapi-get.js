// openapi.operations of @xufa/openapi: a book by id, its id and query validated by the document.
const { build } = require('../lib/openapi-app');

module.exports = {
  description: 'OpenAPI route: a book by id (path and query validated)',
  request: { method: 'GET', path: '/books/42?limit=10' },
  expect: { status: 200, body: '{"id":42,"title":"Book 42","pages":10}' },
  build: (Framework) => build(Framework),
};
