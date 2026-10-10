import { Sequelize } from '../index.js';
import { defineSuite } from './suite.js';

defineSuite('sqlite', (options) => new Sequelize('sqlite::memory:', { logging: false, ...options }));
