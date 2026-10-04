const { Sequelize } = require('..');
const { defineSuite } = require('./suite');

defineSuite('sqlite', (options) => new Sequelize('sqlite::memory:', { logging: false, ...options }));
