const { Sequelize } = require('..');
const { defineSuite } = require('./suite');

defineSuite('sqlite', () => new Sequelize('sqlite::memory:', { logging: false }));
