const { Database } = require('..');
const { defineSuite } = require('./suite');

defineSuite('memory', () => new Database({ backend: 'memory' }));
