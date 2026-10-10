// Apps (Django's INSTALLED_APPS): each with its models (their tables named by the app), routes (under a prefix),
// templates and static folders, admin entries, migrations and ready(); and the commands of migrations of a project
// of apps, app after app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { Apps, defineApp } from '../apps.js';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-apps-'));
  for (const folder of ['accounts', 'catalog/templates/catalog', 'catalog/static/css']) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'catalog', 'templates', 'catalog', 'list.html'), 'list');
  fs.writeFileSync(path.join(root, 'catalog', 'static', 'css', 'site.css'), 'body {}');
  return root;
}

describe('apps', () => {
  let root;
  beforeAll(() => {
    root = project();
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  function apps() {
    class Member extends Model {
      static fields = { username: fields.string({ maxLength: 150 }) };
    }
    class BookInstance extends Model {
      static fields = { imprint: fields.string(), member: fields.foreignKey(() => Member, { null: true }) };
    }
    class Genre extends Model {
      static fields = { name: fields.string() };

      static options = { table: 'genres', ordering: ['name'] };
    }
    const seen = [];
    const accounts = defineApp({ name: 'accounts', dir: path.join(root, 'accounts'), models: [Member] });
    const catalog = defineApp({
      name: 'catalog',
      dir: path.join(root, 'catalog'),
      models: () => ({ BookInstance, Genre, NOT_A_MODEL: 7 }),
      prefix: '/catalog',
      routes: async (app) => {
        app.get('/books', { name: 'books' }, async () => 'books');
      },
      admin: () => [[BookInstance, { list: ['imprint'] }]],
      ready: (app) => seen.push(typeof app.reverse),
    });
    return { list: new Apps([accounts, catalog]), Member, BookInstance, Genre, seen };
  }

  it('their models, tables named by them (as Django), folders, admin entries; their routes and ready()', async () => {
    const { list, Member, BookInstance, Genre, seen } = apps();
    expect(list.models).toEqual([Member, BookInstance, Genre]);
    // Its meta read before it is registered (an Rbac of the model made when a module loads): renamed too.
    expect(Member.meta.table).toBe('member');
    const db = list.register(new Database({ backend: 'memory' }));
    expect([Member.meta.table, BookInstance.meta.table, Genre.meta.table]).toEqual([
      'accounts_member',
      'catalog_bookinstance',
      'genres',
    ]);
    expect(Genre.meta.ordering).toEqual(['name']);
    expect(list.templates).toEqual([path.join(root, 'catalog', 'templates')]);
    expect(list.static).toEqual([path.join(root, 'catalog', 'static')]);
    expect(list.admin).toEqual([[BookInstance, { list: ['imprint'] }]]);
    expect(list.appOf(Genre).label).toBe('catalog');
    expect(list.get('accounts').verboseName).toBe('Accounts');
    await db.sync();

    const app = xufa();
    app.register(list.plugin);
    await app.ready();
    expect((await app.inject('/catalog/books')).body).toBe('books');
    expect(app.reverse('books')).toBe('/catalog/books');
    expect(seen).toEqual(['function']);
    await app.close();
  });

  it('mistakes of a project: names, folders, two apps of one name, no such app', () => {
    expect(() => defineApp({ name: 'Catalog', dir: root })).toThrow('An app has a name of lower case letters');
    expect(() => defineApp({ name: 'catalog' })).toThrow('The app catalog has its folder');
    expect(() => new Apps([{ name: 'a', dir: root }, { name: 'a', dir: root }])).toThrow('Two apps are named a');
    expect(() => new Apps([{ name: 'a', dir: root }]).get('b')).toThrow('No app b (a)');
  });
});

describe('xufa makemigrations, migrate and showmigrations: a project of apps', () => {
  const BIN = path.join(import.meta.dirname, '..', 'bin', 'xufa.js');
  let root;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-apps-cli-'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(path.join(import.meta.dirname, '..'), path.join(root, 'node_modules', 'xufa'), 'junction');
    fs.writeFileSync(path.join(root, 'package.json'), '{ "name": "library", "private": true }\n');
    for (const name of ['accounts', 'catalog']) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(
      path.join(root, 'accounts', 'app.js'),
      [
        "const { defineApp } = require('xufa/apps');",
        "const { Model, fields } = require('xufa/orm');",
        'class Member extends Model { static fields = { username: fields.string() }; }',
        "module.exports = defineApp({ name: 'accounts', dir: __dirname, models: [Member] });",
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(root, 'catalog', 'app.js'),
      [
        "const { defineApp } = require('xufa/apps');",
        "const { Model, fields } = require('xufa/orm');",
        "const accounts = require('../accounts/app');",
        'class Loan extends Model {',
        '  static fields = { title: fields.string(), member: fields.foreignKey(() => accounts.models[0]) };',
        '}',
        "module.exports = defineApp({ name: 'catalog', dir: __dirname, models: [Loan] });",
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(root, 'app.js'),
      [
        "const path = require('node:path');",
        "const xufa = require('xufa');",
        "const { Database } = require('xufa/orm');",
        "const { Apps } = require('xufa/apps');",
        "const APPS = new Apps([require('./accounts/app'), require('./catalog/app')], { migrations: path.join(__dirname, 'migrations') });",
        "const { Model, fields } = require('xufa/orm');",
        '// A model of no app (as the sessions of @xufa/session): in the migrations of the project.',
        "class Note extends Model { static fields = { text: fields.string() }; static options = { table: 'notes' }; }",
        'const database = () => {',
        "  const db = APPS.register(new Database({ backend: 'sqlite', filename: path.join(__dirname, 'db.sqlite') }));",
        '  db.register(Note);',
        '  return db;',
        '};',
        'const build = () => { const app = xufa({ logger: false }); app.register(APPS.plugin); return app; };',
        'module.exports = { build, database, APPS };',
        '',
      ].join('\n')
    );
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const run = (...args) => execFileSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

  it('a migration in the folder of each app that changed; applied app after app; listed by app', () => {
    const made = run('makemigrations');
    expect(made).toContain(`project: wrote ${path.join('migrations', '0001_initial.js')}`);
    expect(made).toContain(`accounts: wrote ${path.join('accounts', 'migrations', '0001_initial.js')}`);
    expect(made).toContain(`catalog: wrote ${path.join('catalog', 'migrations', '0001_initial.js')}`);
    expect(run('makemigrations')).toContain('No changes in the models.');
    expect(run('showmigrations', 'catalog')).toBe('catalog\n  [ ] 0001_initial\n');
    // The models of no app first (as Django's contrib apps), then the apps in their order.
    expect(run('migrate')).toBe(
      '  applied project.0001_initial\n  applied accounts.0001_initial\n  applied catalog.0001_initial\n'
    );
    expect(run('migrate')).toContain('Nothing to apply.');
    expect(run('showmigrations')).toBe(
      'project\n  [X] 0001_initial\naccounts\n  [X] 0001_initial\ncatalog\n  [X] 0001_initial\n'
    );
  });
});
