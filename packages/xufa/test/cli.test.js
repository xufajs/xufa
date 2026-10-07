// The command line (bin/xufa.js): the files of generate, and an app made by xufa new in a folder of its own, with a
// model and a resource generated, its migrations made and applied, its routes and its test.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('../lib/cli');
const { modelFile, resourceFile, parseField, plural } = require('../lib/cli/generate');

describe('xufa generate: the files', () => {
  it('a model: types, modifiers, references (to itself too), timestamps', () => {
    const code = modelFile('Book', ['title:string', 'pages:integer:null', 'isbn:string:unique', 'author:references', 'parent:references:Book', 'price:decimal:index']);
    expect(code).toContain("const { Author } = require('./author');");
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
  const BIN = path.join(__dirname, '..', 'bin', 'xufa.js');
  // The command, in a process of its own (as it is run), in the folder of the app.
  const xufaCommand = (...args) => execFileSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('new, generate, makemigrations, migrate, showmigrations, seed, routes; and the test of the app passes', () => {
    execFileSync(process.execPath, [BIN, 'new', root], { encoding: 'utf8' });
    expect(fs.existsSync(path.join(root, 'app.js'))).toBe(true);
    // The app requires xufa: this package.
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(path.join(__dirname, '..'), path.join(root, 'node_modules', 'xufa'), 'junction');
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
        "const { factory } = require('xufa/orm');",
        "module.exports = async (db, { Author }) => { await factory(Author, { name: (n) => 'A' + n }).createMany(2); };",
        '',
      ].join('\n')
    );
    expect(xufaCommand('seed')).toContain('  seeded 01-authors.js');
    expect(xufaCommand('routes')).toMatch(/books \(GET, HEAD, POST\)/);
    expect(() => xufaCommand('generate', 'model', 'Author')).toThrow(/is there already/);
    expect(() => xufaCommand('nope')).toThrow();
    expect(xufaCommand('help')).toContain('xufa generate resource');
    // The test of the app (node --test), with its migrations applied to a database in memory. TAP, as Node 24 reports
    // with spec even when the output is not a terminal.
    const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8' });
    expect(output).toMatch(/# pass 1/);
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
