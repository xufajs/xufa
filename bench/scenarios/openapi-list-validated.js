// openapi.operations of @xufa/openapi with validateResponses: the list of 20 books checked against the document too.
const { build, LIST } = require('../lib/openapi-app');

module.exports = {
  description: 'OpenAPI route: a list of 20 books, its reply validated',
  request: { method: 'GET', path: '/books' },
  expect: { status: 200, body: LIST },
  build: (Framework) => build(Framework, { validateResponses: true }),
};
