// The module: Sequelize as its default export (and what require() gives), and the named exports of the ES module of
// Sequelize 6.
import { createRequire } from 'node:module';
import Sequelize from '../index.js';
import * as esm from '../index.js';

const require = createRequire(import.meta.url);

describe('ES module', () => {
  it('exports the parts of Sequelize by their names', () => {
    expect(esm.default).toBe(Sequelize);
    const names = Object.keys(esm).filter((name) => name !== 'default' && name !== 'module.exports');
    expect(names.length).toBeGreaterThan(90);
    for (const name of names) expect(esm[name]).toBe(Sequelize[name]);
    for (const name of ['Sequelize', 'Model', 'DataTypes', 'Op', 'QueryTypes', 'Transaction', 'ValidationError']) {
      expect(esm[name]).toBeDefined();
    }
  });

  it('gives Sequelize to require()', () => {
    // (The runner gives this file its own copy of the modules it imports, not of those it requires: the same class,
    // of another copy.)
    const required = require('../index.js');
    expect([typeof required, required.name, required.Sequelize === required]).toEqual(['function', 'Sequelize', true]);
    expect(Object.keys(required).sort()).toEqual(Object.keys(Sequelize).sort());
  });
});
