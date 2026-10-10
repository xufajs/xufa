// The models kept in the database (designer: database): a version published from the admin migrates the project's
// database and is kept in xufa_schema; the process that runs is told (onNewModels), and a process started then runs
// it (its models, its migrations after those of the files); a draft of an older version is refused (409); and the
// command line migrates and lists with it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadProject } from '../project.js';

const root = path.join(import.meta.dirname, `.tmp-designer-db-${process.pid}`);
const BIN = path.join(import.meta.dirname, '..', 'bin', 'xufa.js');
const put = (name, content) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const HEADERS = { 'x-xufa-admin': '1' };
const AUTHOR = { fields: { name: { type: 'string', maxLength: 100 } } };
const BOOK = {
  fields: {
    title: { type: 'string', maxLength: 200 },
    author: { type: 'foreignKey', to: 'Author', null: true, onDelete: 'setNull' },
  },
};

beforeAll(() => {
  put(
    'xufa.yaml',
    [
      'name: Shelf',
      'apps: [catalog]',
      "database: { url: 'sqlite:data/shelf.db' }",
      'admin: { authorize: development }',
      'designer: { store: database, poll: 50 }',
      '',
    ].join('\n')
  );
  put('catalog/models.yaml', 'Author:\n  fields:\n    name: { type: string, maxLength: 100 }\n');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const environment = { SECRET_KEY: 'a secret of thirty two characters!' };

describe('the models kept in the database', () => {
  it('a version published: migrated, kept, told to the process; a new process runs it', async () => {
    const seen = [];
    const first = await (
      await loadProject(root, { environment })
    ).build({
      logger: false,
      migrate: true,
      onNewModels: (version) => seen.push(version),
    });
    await first.ready();
    expect(first.project.version).toBe(0);
    const schema = (await first.inject('/admin/api/_schema')).json();
    expect(schema.design.store).toBe('database');
    expect(schema.design.apps).toEqual([{ app: 'catalog', file: null, spec: { Author: AUTHOR }, models: ['Author'] }]);

    const draft = { apps: { catalog: { Author: AUTHOR, Book: BOOK } }, name: 'books' };
    const preview = (
      await first.inject({ method: 'POST', url: '/admin/api/_schema/preview', headers: HEADERS, payload: draft })
    ).json();
    expect(preview.apps[0].migration.file).toBe(null);
    expect(preview.apps[0].migration.operations.map((op) => op.op)).toEqual(['createTable', 'createTable']);
    const published = await first.inject({
      method: 'POST',
      url: '/admin/api/_schema/publish',
      headers: HEADERS,
      payload: draft,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().version).toBe(1);
    // The files are as they were; the tables are there.
    expect(fs.readFileSync(path.join(root, 'catalog/models.yaml'), 'utf8')).toContain('Author:');
    expect(fs.existsSync(path.join(root, 'catalog/migrations'))).toBe(false);
    const tables = await first.db.backend.tables();
    expect(tables).toEqual(expect.arrayContaining(['catalog_author', 'catalog_book', 'xufa_schema']));
    // The process is told; the page says it is pending.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(seen).toEqual([1]);
    expect((await first.inject('/admin/api/_schema')).json().design.pending.version).toBe(1);
    // A draft of the version it runs (0), when 1 is there: refused.
    const stale = await first.inject({
      method: 'POST',
      url: '/admin/api/_schema/publish',
      headers: HEADERS,
      payload: { apps: { catalog: { Author: AUTHOR } } },
    });
    expect([stale.statusCode, stale.json().error]).toEqual([
      409,
      'The models changed meanwhile (version 1, not 0): review them again',
    ]);
    await first.close();

    // A process started now: version 1, its models, its migrations.
    const second = await (await loadProject(root, { environment })).build({ logger: false, migrate: true });
    await second.ready();
    expect(second.project.version).toBe(1);
    const Book = second.project.model('catalog.Book');
    const ursula = await second.project.model('Author').objects.create({ name: 'Ursula' });
    await Book.objects.create({ title: 'Earthsea', author: ursula });
    expect((await Book.objects.selectRelated('author').get({ title: 'Earthsea' })).author.name).toBe('Ursula');
    expect(second.project.APPS.get('catalog').stored.map((migration) => migration.name)).toEqual(['0001_books']);
    // Its own draft: a field more, a migration after the stored one.
    const next = (
      await second.inject({
        method: 'POST',
        url: '/admin/api/_schema/preview',
        headers: HEADERS,
        payload: {
          apps: {
            catalog: { Author: AUTHOR, Book: { fields: { ...BOOK.fields, pages: { type: 'integer', null: true } } } },
          },
        },
      })
    ).json();
    expect(next.apps[0].migration.name).toBe('0002_auto');
    expect(next.apps[0].migration.operations.map((op) => op.op)).toEqual(['addColumn']);
    await second.close();
  }, 60000);

  it('the command line migrates and lists with the version of the database', () => {
    const run = (...args) =>
      execFileSync(process.execPath, [BIN, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...environment },
      });
    expect(run('showmigrations')).toContain('[X] 0001_books');
    expect(run('migrate')).toContain('Nothing to apply.');
    expect(run('makemigrations')).toContain('catalog: its models are kept in the database');
  });

  it('eject: the models and migrations of the database as files, and a version with none', async () => {
    const run = (...args) =>
      execFileSync(process.execPath, [BIN, ...args], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...environment },
      });
    const out = run('eject');
    expect(out).toContain('catalog/models.yaml'.replace('/', path.sep));
    expect(out).toContain('Version 2:');
    expect(fs.readFileSync(path.join(root, 'catalog/models.yaml'), 'utf8')).toContain(
      'author: { type: foreignKey, to: Author, null: true, onDelete: setNull }'
    );
    expect(fs.readFileSync(path.join(root, 'catalog/migrations/0001_books.js'), 'utf8')).toContain('"createTable"');
    // The project runs the files now: no stored migrations, the same models, nothing to migrate.
    const app = await (await loadProject(root, { environment })).build({ logger: false, migrate: true });
    await app.ready();
    expect(app.project.version).toBe(2);
    const catalog = app.project.APPS.get('catalog');
    expect(catalog.stored).toEqual([]);
    expect(catalog.models.map((model) => model.name)).toEqual(['Author', 'Book']);
    expect(await app.project.model('Book').objects.count()).toBe(1);
    await app.close();
    expect(run('showmigrations')).toContain('[X] 0001_books');
    expect(run('migrate')).toContain('Nothing to apply.');
    // Again: nothing more to eject.
    expect(run('eject')).toContain('Nothing to eject');
  }, 60000);

  it('with tenants: the models of a tenants app migrate each tenant when it is opened', async () => {
    const site = path.join(import.meta.dirname, `.tmp-designer-tenants-${process.pid}`);
    const write = (name, content) => {
      const file = path.join(site, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    try {
      write(
        'xufa.yaml',
        [
          'name: Desk',
          'apps: [notes]',
          "database: { url: 'sqlite:data/desk.db' }",
          'admin: { authorize: development }',
          'designer: { store: database, poll: 60000 }',
          "tenants: { apps: [notes], database: { url: 'sqlite:data/tenants/{id}.db' }, list: [acme] }",
          '',
        ].join('\n')
      );
      fs.mkdirSync(path.join(site, 'notes'), { recursive: true });
      const NOTE = { fields: { text: { type: 'text' } } };
      const publish = async (spec) => {
        const app = await (await loadProject(site, { environment })).build({ logger: false, migrate: true });
        await app.ready();
        const res = await app.inject({
          method: 'POST',
          url: '/admin/api/_schema/publish',
          headers: HEADERS,
          payload: { apps: { notes: spec } },
        });
        await app.close();
        return res.json();
      };
      expect((await publish({ Note: NOTE })).version).toBe(1);
      // Not in the project's database: in each tenant's, migrated when it is opened.
      let app = await (await loadProject(site, { environment })).build({ logger: false, migrate: true });
      await app.ready();
      expect(await app.db.backend.tables()).not.toContain('notes_note');
      const tenants = app.project.tenants();
      const Note = app.project.model('Note');
      await tenants.run('acme', () => Note.objects.create({ text: 'First' }));
      await app.close();

      expect(
        (await publish({ Note: { fields: { ...NOTE.fields, done: { type: 'boolean', default: false } } } })).version
      ).toBe(2);
      app = await (await loadProject(site, { environment })).build({ logger: false, migrate: true });
      await app.ready();
      const notes = await app.project
        .tenants()
        .run('acme', () => app.project.model('Note').objects.values('text', 'done'));
      expect(notes).toEqual([{ text: 'First', done: false }]);
      await app.close();
    } finally {
      // (Windows may keep a SQLite file busy a moment after it is closed.)
      fs.rmSync(site, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 60000);
});
