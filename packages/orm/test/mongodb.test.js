const { Database } = require('..');
const { defineSuite } = require('./suite');
const { url, available } = require('../../mongo/test/server');

describe.skipIf(!available)('mongodb', () => {
  defineSuite('mongodb', () => new Database({ backend: 'mongodb', url }));
});
