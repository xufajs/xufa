// The command line (bin/xufa.js): the files of generate, and an app made by xufa new in a folder of its own, with a
// model and a resource generated, its migrations made and applied, its routes and its test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from '../lib/cli/index.js';
import { modelFile, resourceFile, parseField, plural } from '../lib/cli/generate.js';

describe('xufa generate: the files', () => {
  it('a model: types, modifiers, references (to itself too), timestamps', () => {
    const code = modelFile('Book', ['title:string', 'pages:integer:null', 'isbn:string:unique', 'author:references', 'parent:references:Book', 'price:decimal:index']);
    expect(code).toContain("import { Author } from './author.js';");
    expect(code).toContain('export class Book extends Model {');
    expect(code).toContain('    title: fields.string({ maxLength: 200 }),');
    expect(code).toContain('    pages: fields.integer({ null: true }),');
    expect(code).toContain('    isbn: fields.string({ maxLength: 200, unique: true }),');
    expect(code).toContain("    author: fields.foreignKey(() => Author, { onDelete: 'cascade' }),");
    expect(code).toContain("    parent: fields.foreignKey('self', { onDelete: 'cascade' }),");
    expect(code).toContain('    price: fields.decimal({ precision: 12, scale: 2, index: true }),');
    expect(code).toContain('createdAt: fields.datetime({ autoNowAdd: true })');
    expect(modelFile('Tag', ['name'], { timestamps: false })).not.toContain('createdAt');
    expect(() => parseField('x:color')).toThrow(/Not a type of field: color/);
    expect(() => parseField('x:string:big')).toThrow(/Not a modifier/);
  });

  it('a resource: filters, search and ordering of the fields; plurals and arguments', () => {
    const code = resourceFile('Category', ['name:string', 'notes:text', 'parent:references:Category']);
    expect(code).toContain("filters: ['name', 'parentId'],");
    expect(code).toContain("search: ['name', 'notes'],");
    expect(code).toContain('(at /categories)');
    expect([plural('box'), plural('city'), plural('day'), plural('book')]).toEqual(['boxes', 'cities', 'days', 'books']);
    expect(parseArgs(['a', '--force', '--queues', 'x,y', '--no-timestamps', '--concurrency=4'])).toEqual({
      rest: ['a'],
      options: { force: true, queues: 'x,y', timestamps: false, concurrency: '4' },
    });
  });
});

describe('xufa: an app from new to its routes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-cli-'));
  const root = path.join(dir, 'shop');
  const BIN = path.join(import.meta.dirname, '..', 'bin', 'xufa.js');
  // The command, in a process of its own (as it is run), in the folder of the app.
  const xufaCommand = (...args) => execFileSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('new, generate, makemigrations, migrate, showmigrations, seed, routes; and the test of the app passes', () => {
    execFileSync(process.execPath, [BIN, 'new', root, '--api'], { encoding: 'utf8' });
    expect(fs.existsSync(path.join(root, 'app.js'))).toBe(true);
    // The app requires xufa: this package.
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(path.join(import.meta.dirname, '..'), path.join(root, 'node_modules', 'xufa'), 'junction');
    expect(xufaCommand('generate', 'model', 'Author', 'name:string')).toContain('0001_create_author.js');
    expect(xufaCommand('g', 'resource', 'Book', 'title:string', 'author:references')).toContain('routes');
    expect(fs.readdirSync(path.join(root, 'migrations')).filter((file) => file.endsWith('.js'))).toEqual([
      '0001_create_author.js',
      '0002_create_book.js',
    ]);
    expect(xufaCommand('makemigrations')).toContain('No changes in the models.');
    expect(xufaCommand('migrate')).toContain('  applied 0002_create_book');
    expect(xufaCommand('showmigrations')).toContain('  [X] 0001_create_author');
    fs.writeFileSync(
      path.join(root, 'seeds', '01-authors.js'),
      [
        "import { factory } from 'xufa/orm';",
        "export default async (db, { Author }) => { await factory(Author, { name: (n) => 'A' + n }).createMany(2); };",
        '',
      ].join('\n')
    );
    expect(xufaCommand('seed')).toContain('  seeded 01-authors.js');
    // createsuperuser: of the model of users (AbstractUser), with --noinput and XUFA_SUPERUSER_PASSWORD.
    fs.writeFileSync(
      path.join(root, 'models', 'user.js'),
      [
        "import { Model, fields } from 'xufa/orm';",
        "import { AbstractUser } from 'xufa/auth';",
        'export class User extends AbstractUser(Model, fields) {}',
        '',
      ].join('\n')
    );
    fs.appendFileSync(path.join(root, 'models', 'index.js'), "export * from './user.js';\n");
    expect(xufaCommand('makemigrations', 'users')).toContain('0003_users.js');
    xufaCommand('migrate');
    const created = execFileSync(process.execPath, [BIN, 'createsuperuser', '--username', 'admin', '--noinput'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, XUFA_SUPERUSER_PASSWORD: 'a long password' },
    });
    expect(created).toContain('Superuser admin created.');
    expect(() => xufaCommand('createsuperuser', '--username', 'nobody', '--noinput')).toThrow();
    expect(xufaCommand('routes')).toMatch(/books \(GET, HEAD, POST\)/);
    expect(() => xufaCommand('generate', 'model', 'Author')).toThrow(/is there already/);
    expect(() => xufaCommand('nope')).toThrow();
    expect(xufaCommand('help')).toContain('xufa generate resource');
    // The test of the app (node --test), with its migrations applied to a database in memory. TAP, as Node 24 reports
    // with spec even when the output is not a terminal.
    const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8' });
    expect(output).toMatch(/# pass 1/);
    // xufa test: the same, by its command (NODE_ENV=test; node --test, the app has no vyntra).
    // (No --runner: the app does not depend on vyntra, even when one is installed above it, as in this repository.)
    const tested = xufaCommand('test');
    expect(tested).toContain('xufa test: node --test');
    expect(tested).toMatch(/pass 1/);
  }, 120000);

  it('health; down and up, on this machine (a file) and on every one (the database)', () => {
    // GET /books of the app, and GET /health/ready: the status codes (and the cookie of the secret path, when asked).
    const probe = (cookie) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            '-e',
            [
              "require('./app').build({ logger: false }).then(async (app) => {",
              `  const headers = ${JSON.stringify(cookie ? { cookie } : {})};`,
              "  const books = await app.inject({ url: '/books', headers });",
              "  const ready = await app.inject('/health/ready');",
              "  const opened = await app.inject('/let-me-in');",
              "  console.log(JSON.stringify({ books: books.statusCode, ready: ready.statusCode, retry: books.headers['retry-after'] || null, cookie: (opened.headers['set-cookie'] || '').split(';')[0] }));",
              '  await app.close();',
              '});',
            ].join('\n'),
          ],
          { cwd: root, encoding: 'utf8' }
        )
      );
    const health = xufaCommand('health');
    expect(health).toContain('The app is up.');
    expect(health).toMatch(/up\s+database \(/);
    expect(health).toMatch(/up\s+queue \(.*\(not critical\)/);
    expect(probe()).toMatchObject({ books: 200, ready: 200 });

    expect(xufaCommand('down', '--message', 'Back soon', '--retry', '60', '--secret', 'let-me-in')).toContain(
      'Open /let-me-in in a browser'
    );
    expect(JSON.parse(fs.readFileSync(path.join(root, '.xufa', 'down.json'), 'utf8'))).toMatchObject({
      message: 'Back soon',
      retryAfter: 60,
      secret: 'let-me-in',
    });
    const down = probe();
    expect(down).toMatchObject({ books: 503, ready: 200, retry: '60' });
    // The cookie of the secret path goes through.
    expect(probe(down.cookie).books).toBe(200);
    expect(xufaCommand('up')).toContain('The app is up on this machine.');
    expect(probe().books).toBe(200);

    expect(xufaCommand('down', '--everywhere')).toContain('down on every machine');
    expect(fs.existsSync(path.join(root, '.xufa', 'down.json'))).toBe(false);
    expect(probe().books).toBe(503);
    expect(xufaCommand('up', '--everywhere')).toContain('The app is up on every machine.');
    expect(probe().books).toBe(200);
    expect(xufaCommand('up')).toContain('The app was not down on this machine');
  }, 120000);
});

describe('xufa: a project from new to its apps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-project-'));
  const root = path.join(dir, 'book-shop');
  const BIN = path.join(import.meta.dirname, '..', 'bin', 'xufa.js');
  const xufaCommand = (...args) => execFileSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('new, startapp, a model with crud, makemigrations, migrate, routes; and the test of the project passes', () => {
    const made = execFileSync(process.execPath, [BIN, 'new', root], { encoding: 'utf8' });
    expect(made).toContain('A new project in');
    for (const file of ['xufa.yaml', 'templates/base.html', 'home/urls.yaml', 'home/templates/home/index.html', 'test/home.test.js']) {
      expect(fs.existsSync(path.join(root, file))).toBe(true);
    }
    expect(fs.readFileSync(path.join(root, 'xufa.yaml'), 'utf8')).toContain('name: Book Shop\napps: [home]');
    // Sessions written without waiting for the disk (PostgreSQL), said in the file.
    expect(fs.readFileSync(path.join(root, 'xufa.yaml'), 'utf8')).toContain('sessions: { asyncCommit: true }');
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(path.join(import.meta.dirname, '..'), path.join(root, 'node_modules', 'xufa'), 'junction');

    expect(xufaCommand('startapp', 'catalog')).toContain('added catalog to the apps of xufa.yaml');
    expect(fs.readFileSync(path.join(root, 'xufa.yaml'), 'utf8')).toContain('apps: [home, catalog]');
    expect(() => xufaCommand('startapp', 'catalog')).toThrow(/is there already/);
    expect(() => xufaCommand('startapp', 'Bad-Name')).toThrow();
    fs.writeFileSync(
      path.join(root, 'catalog', 'models.js'),
      [
        "import { Model, fields } from 'xufa/orm';",
        'export class Book extends Model {',
        '  static fields = { title: fields.string({ maxLength: 100 }) };',
        "  static options = { display: '{title}' };",
        '}',
        '',
      ].join('\n')
    );
    fs.appendFileSync(path.join(root, 'catalog', 'urls.yaml'), '  - { crud: Book, fields: [title], permissions: false }\n');
    expect(xufaCommand('makemigrations')).toMatch(/catalog: wrote catalog[\\/]migrations[\\/]0001_initial\.js/);
    expect(xufaCommand('migrate')).toContain('applied catalog.0001_initial');
    expect(xufaCommand('routes')).toMatch(/book-create/);
    fs.writeFileSync(
      path.join(root, 'test', 'books.test.js'),
      [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { useTestApp } from 'xufa/testing';",
        'const app = useTestApp();',
        "test('a book made by its form', async () => {",
        '  const client = app.client();',
        "  const res = await client.post(app.reverse('book-create'), { title: 'Dune' });",
        '  assert.equal(res.statusCode, 302);',
        "  assert.match((await client.get(res.headers.location)).textContent, /Book: Dune/);",
        '});',
        '',
      ].join('\n')
    );
    const tested = xufaCommand('test');
    expect(tested).toMatch(/pass 2/);
  }, 120000);
});
