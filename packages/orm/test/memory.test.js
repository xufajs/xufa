const { Database } = require('..');
const { defineSuite } = require('./suite');

defineSuite('memory', () => new Database({ backend: 'memory' }));

describe('Database.fromUrl', () => {
  const { Database: Db } = require('..'); // eslint-disable-line global-require

  it('the backend and options of a URL, as DATABASE_URL', async () => {
    expect(Db.optionsFromUrl('postgres://u:p@h:5432/app')).toEqual({ backend: 'postgres', url: 'postgres://u:p@h:5432/app' });
    expect(Db.optionsFromUrl('mongodb+srv://c.example.com/app')).toEqual({ backend: 'mongodb', url: 'mongodb+srv://c.example.com/app' });
    expect(Db.optionsFromUrl('sqlite:data/app.db')).toEqual({ backend: 'sqlite', filename: 'data/app.db' });
    expect(Db.optionsFromUrl('sqlite::memory:', { name: 'x' })).toEqual({ backend: 'sqlite', filename: ':memory:', name: 'x' });
    expect(Db.optionsFromUrl('fs:data')).toEqual({ backend: 'fs', dir: 'data' });
    expect(() => Db.optionsFromUrl('mysql://user:secret@h/db')).toThrow(/mysql:\/\/\*\*\*@h\/db/);
    const db = Db.fromUrl('memory:');
    expect(db.backend.name).toBe('memory');
  });
});
