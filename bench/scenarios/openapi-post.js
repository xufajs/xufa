// openapi.operations of @xufa/openapi: a create, its body validated by the document.
const { build } = require('../lib/openapi-app');

const body = JSON.stringify({ title: 'Dune', pages: 412 });

module.exports = {
  description: 'OpenAPI route: a create (its body validated)',
  request: { method: 'POST', path: '/books', headers: { 'content-type': 'application/json' }, body },
  expect: { status: 201, body: '{"id":21,"title":"Dune","pages":412}' },
  build: (Framework) => build(Framework),
};
