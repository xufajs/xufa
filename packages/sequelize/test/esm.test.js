// The ES module: the CommonJS module as its default export, and the named exports of the ES module of Sequelize 6.
const Sequelize = require('..');

describe('ES module', () => {
  it('exports the parts of the CommonJS module by their names', async () => {
    const esm = await import('../index.mjs');
    expect(esm.default).toBe(Sequelize);
    const names = Object.keys(esm).filter((name) => name !== 'default');
    expect(names.length).toBeGreaterThan(90);
    for (const name of names) expect(esm[name]).toBe(Sequelize[name]);
    for (const name of ['Sequelize', 'Model', 'DataTypes', 'Op', 'QueryTypes', 'Transaction', 'ValidationError']) {
      expect(esm[name]).toBeDefined();
    }
  });
});
