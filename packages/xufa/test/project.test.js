// A project of one file (xufa.yaml): its apps by the names of their folders (models.js, views.js, admin.js,
// templates/), the environment over the file, and the app put together by xufa: sessions, templates, error pages,
// accounts and their pages, roles, the admin, redirects, reverse(); and the command line, which finds it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadProject, reverse } from '../project.js';
import { createRequire } from 'node:module';
import * as projectModule from '../lib/project.js';
import * as urlsModule from '../lib/urls.js';
import httpModule from '@xufa/http';

const require = createRequire(import.meta.url);

const root = path.join(import.meta.dirname, `.tmp-project-${process.pid}`);
const write = (name, content) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeAll(() => {
  write(
    'xufa.yaml',
    [
      'name: Shelf',
      'apps: [library]',
      "database: { url: 'memory:' }",
      'auth:',
      '  user: library.Member',
      '  loginBy: username',
      '  pages: /accounts',
      "  mails: { reset: { subject: Reset, text: 'Go to {{ link }}' } }",
      "rbac: { roles: { keeper: ['Book.*'] } }",
      'admin: true',
      'redirects: { /: books }',
      '',
    ].join('\n')
  );
  write(
    'library/models.js',
    `import { Model, fields } from '@xufa/orm';
import { AbstractUser } from '@xufa/auth';
export class Member extends AbstractUser(Model, fields) {}
export class Book extends Model {
  static fields = { title: fields.string({ maxLength: 100 }) };
}
`
  );
  write(
    'library/views.js',
    `import { Book } from './models.js';
export default async function views(app) {
  app.get('/books', { name: 'books' }, async (request, reply) => reply.view('library/books', { books: await Book.objects.all() }));
  app.get('/books/:pk', { name: 'book' }, async (request) => ({ pk: request.params.pk }));
}
`
  );
  // A CommonJS file of an app is read too.
  write('library/admin.cjs', "module.exports = [require('./models.js').Book];\n");
  write('library/templates/library/books.html', '{{#each books as book}}<li>{{ book.title }}</li>{{/each}}');
  write('templates/404.html', 'Not here');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a project of one file', () => {
  it('its apps by folders, its models by name; the environment over the file', async () => {
    const project = await loadProject(root, { environment: { PORT: '9001' } });
    expect(project.name).toBe('Shelf');
    expect(project.APPS.list.map((app) => app.label)).toEqual(['library']);
    expect(project.model('library.Book').name).toBe('Book');
    expect(project.model('Member').name).toBe('Member');
    expect(() => project.model('library.Nope')).toThrow('No model library.Nope');
    expect(project.config.server).toEqual({ port: 9001, host: '127.0.0.1' });
    // The templates of emails are not templates of the configuration.
    expect(project.config.auth.mails.reset.text).toBe('Go to {{ link }}');
    expect(project.APPS.admin.map((model) => model.name)).toEqual(['Book']);
  });

  it('the app put together: routes of the apps, templates, error pages, redirects, accounts, admin, reverse()', async () => {
    // Without debug: the 404 page of the project (with debug, that of xufa.devErrors, as Django's).
    const project = await loadProject(root, {
      environment: { DEBUG: 'false', SECRET_KEY: 'a secret of thirty two characters!' },
    });
    const app = await project.build({ logger: false, passwordOptions: { ln: 4 } });
    await app.ready();
    await app.db.sync();
    await project.model('Book').objects.create({ title: 'Dune' });
    expect((await app.inject('/books')).body).toBe('<li>Dune</li>');
    const home = await app.inject('/');
    expect([home.statusCode, home.headers.location]).toEqual([301, '/books']);
    expect(reverse('book', 7)).toBe('/books/7');
    expect((await app.inject({ url: '/nope', headers: { accept: 'text/html' } })).body).toBe('Not here');
    expect((await app.inject('/accounts/login/')).statusCode).toBe(200);
    expect((await app.inject('/admin/login')).statusCode).toBe(200);
    expect(typeof app.accounts.permissionRequired).toBe('function');
    expect(app.mailer).toBeTruthy();
    expect(project.rbac().allows({ superuser: false, grants: [{ role: 'keeper', tenant: '*' }] }, 'Book.add')).toBe(
      true
    );
    await app.close();
  });

  it('without debug, a secret key (SECRET_KEY) is needed', async () => {
    const project = await loadProject(root, { environment: { DEBUG: 'false' } });
    await expect(project.build({ logger: false })).rejects.toThrow('secretKey (SECRET_KEY)');
    await expect(loadProject(path.join(root, 'library'))).rejects.toThrow('No project in');
  });

  it('the command line finds it (xufa routes)', () => {
    const out = execFileSync(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'xufa.js'), 'routes'], {
      cwd: path.join(root, 'library'),
      env: { ...process.env, NODE_ENV: 'test' },
    }).toString();
    expect(out).toContain('Named routes:');
    expect(out).toMatch(/books\s+GET\s+\/books/);
  });

  it('xufa seed runs fixtures of seeds/ (YAML) as the seeds of JS', () => {
    write('seeds/books.yaml', 'Book:\n  - { title: Dune }\n  - { title: Emma }\n');
    const out = execFileSync(
      process.execPath,
      [path.join(import.meta.dirname, '..', 'bin', 'xufa.js'), 'seed', 'books'],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'test' },
      }
    ).toString();
    expect(out).toContain('seeded books.yaml');
  });
});

describe('urls.yaml: the routes of an app as data', () => {
  const site = path.join(import.meta.dirname, `.tmp-urls-${process.pid}`);
  const put = (name, content) => {
    const file = path.join(site, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  let app;

  beforeAll(async () => {
    put(
      'xufa.yaml',
      "name: Shelf\napps: [shelf]\ndatabase: { url: 'memory:' }\nviews: { baseTemplate: layout, paginateBy: 2 }\n"
    );
    put(
      'shelf/models.js',
      `import { Model, fields } from '@xufa/orm';
export class Writer extends Model {
  static fields = { name: fields.string({ maxLength: 100 }) };
  toString() { return this.name; }
}
export class Book extends Model {
  static fields = { title: fields.string({ maxLength: 100 }), writer: fields.foreignKey(() => Writer, { onDelete: 'protect' }) };
  toString() { return this.title; }
}
`
    );
    put(
      'shelf/views.js',
      `import { ListView } from '@xufa/views';
import { Book } from './models.js';
export async function home(request, reply) { return { books: await Book.objects.count() }; }
export class Latest extends ListView { static model = Book; static templateName = 'shelf/latest'; }
`
    );
    put(
      'shelf/urls.yaml',
      [
        'prefix: /shelf',
        'routes:',
        '  - { path: /, name: home, view: home }',
        '  - { path: latest/, name: latest, view: Latest, options: { paginateBy: 1 } }',
        '  - { path: about/, name: about, template: shelf/about }',
        '  - { path: start/, redirect: home }',
        '  - { crud: Writer, fields: [name], permissions: false }',
        '  - { crud: Book, fields: [title, writer], permissions: false, only: [list, detail], detail: { selectRelated: writer } }',
        '',
      ].join('\n')
    );
    put(
      'shelf/admin.yaml',
      'Writer:\nBook:\n  list: [title, writer]\n  fieldsets:\n    - [null, { fields: [title] }]\n'
    );
    put('templates/layout.html', '<main>{{#block content}}{{/block}}</main>');
    put('shelf/templates/shelf/about.html', 'About the shelf');
    put('shelf/templates/shelf/latest.html', '{{ objectList | join }} {{ page.number }}/{{ page.numPages }}');
    put(
      'shelf/templates/shelf/book_list.html',
      '{{#each bookList as book}}<a href="{{ book.absoluteUrl }}">{{ book }}</a>{{/each}}'
    );
    app = await (
      await loadProject(site, { environment: { DEBUG: 'false', SECRET_KEY: 'a secret of thirty two characters!' } })
    ).build({
      logger: false,
    });
    await app.ready();
    await app.db.sync();
    const ada = await app.project.model('Writer').objects.create({ name: 'Ada' });
    await app.project.model('Book').objects.create({ title: 'Notes', writer: ada });
    await app.project.model('Book').objects.create({ title: 'Engines', writer: ada });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(site, { recursive: true, force: true });
  });

  it('views of views.js (functions and classes), templates, redirects, under the prefix', async () => {
    expect((await app.inject('/shelf/')).json()).toEqual({ books: 2 });
    expect((await app.inject('/shelf/latest/')).body).toBe('Notes 1/2');
    expect((await app.inject('/shelf/about/')).body).toBe('About the shelf');
    expect((await app.inject('/shelf/start/')).headers.location).toBe('/shelf/');
  });

  it('crud: the pages of a model, built-in templates in the base of the project, absoluteUrl of <model>-detail', async () => {
    const Book = app.project.model('Book');
    const notes = await Book.objects.get({ title: 'Notes' });
    expect(notes.absoluteUrl).toBe(`/shelf/book/${notes.pk}`);
    expect((await app.inject('/shelf/books/')).body).toContain(`<a href="/shelf/book/${notes.pk}">Notes</a>`);
    expect((await app.inject(notes.absoluteUrl)).body).toMatch(
      /^<main>[\s\S]*<h1>Book: Notes<\/h1>[\s\S]*<dd><a href="\/shelf\/writer\/\d+">Ada<\/a><\/dd>/
    );
    expect((await app.inject('/shelf/writers/')).body).toContain('<h1>Writer List</h1>');
    const writer = notes.writerId;
    expect((await app.inject(`/shelf/writer/${writer}/delete/`)).body).toContain(
      'until all its books have been deleted'
    );
    expect(app.routeNames()).not.toHaveProperty('book-create');
  });

  it('admin.yaml: the models of the app in the admin, in order, with their options', () => {
    const [writer, book] = app.project.APPS.admin;
    expect(writer.name).toBe('Writer');
    expect(book[0].name).toBe('Book');
    expect(book[1]).toEqual({ list: ['title', 'writer'], fieldsets: [[null, { fields: ['title'] }]] });
    const { adminOf } = projectModule;
    expect(() => adminOf({ Nope: null }, [], 'shelf/admin.yaml')).toThrow(
      'shelf/admin.yaml: the app has no model Nope'
    );
    expect(() => adminOf({ Writer: [1] }, [writer], 'a.yaml')).toThrow('a.yaml: Writer takes options');
    expect(adminOf(null, [], 'a.yaml')).toEqual([]);
  });

  it('mistakes of a urls.yaml say where', () => {
    const { urlsPlugin } = urlsModule;
    const plugin = urlsPlugin({ routes: [{ path: '/', view: 'nope' }] }, { where: 'shelf/urls.yaml' });
    const xufa = httpModule;
    const target = xufa({ logger: false });
    target.register(plugin);
    return expect(target.ready()).rejects.toThrow('shelf/urls.yaml: route 1: views.js exports no nope');
  });
});

describe('models.yaml: the models of an app as data', () => {
  const site = path.join(import.meta.dirname, `.tmp-models-${process.pid}`);
  const put = (name, content) => {
    const file = path.join(site, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  let app;

  beforeAll(async () => {
    put(
      'xufa.yaml',
      "name: Stacks\napps: [people, catalog]\ndatabase: { url: 'memory:' }\nadmin: { authorize: development }\n"
    );
    put(
      'people/models.js',
      "import { Model, fields } from '@xufa/orm';\nexport class Person extends Model {\n  static fields = { name: fields.string({ maxLength: 100 }) };\n}\n"
    );
    // A model of code next to those of models.yaml, which point to it, to each other and to another app's.
    put(
      'catalog/models.js',
      "import { Model, fields } from '@xufa/orm';\nexport class Label extends Model {\n  static fields = { text: fields.string({ maxLength: 20 }) };\n}\n"
    );
    put(
      'catalog/models.yaml',
      [
        'Shelf:',
        "  display: 'Shelf {code}'",
        '  fields:',
        '    code: { type: string, maxLength: 10, unique: true }',
        'Volume:',
        '  ordering: [title]',
        '  fields:',
        '    title: { type: string, maxLength: 200 }',
        '    shelf: { type: foreignKey, to: Shelf, null: true }',
        '    label: { type: foreignKey, to: Label, null: true }',
        '    owner: { type: foreignKey, to: people.Person, null: true }',
        '    tags: { type: manyToMany, to: Label, blank: true, relatedName: tagged }',
        '',
      ].join('\n')
    );
    put('catalog/admin.yaml', 'Shelf:\nVolume:\n  list: [title, shelf]\n');
    app = await (
      await loadProject(site, { environment: { SECRET_KEY: 'a secret of thirty two characters!' } })
    ).build({
      logger: false,
    });
    await app.ready();
    await app.db.sync();
  });

  afterAll(async () => {
    if (app) await app.close();
    fs.rmSync(site, { recursive: true, force: true });
  });

  it('the models of models.js and models.yaml, with their relations, in tables of the app', async () => {
    const { project } = app;
    expect(project.APPS.get('catalog').models.map((model) => model.name)).toEqual(['Label', 'Shelf', 'Volume']);
    const Volume = project.model('catalog.Volume');
    expect(Volume.meta.table).toBe('catalog_volume');
    const ada = await project.model('Person').objects.create({ name: 'Ada' });
    const shelf = await project.model('Shelf').objects.create({ code: 'A1' });
    const label = await project.model('Label').objects.create({ text: 'new' });
    const volume = await Volume.objects.create({ title: 'Notes', shelf, label, owner: ada });
    await volume.tags.set([label]);
    const found = await Volume.objects.selectRelated('shelf', 'owner').get({ tags__text: 'new' });
    expect([String(found.shelf), found.owner.name]).toEqual(['Shelf A1', 'Ada']);
    // The admin of admin.yaml has them.
    const models = (await app.inject({ url: '/admin/api/models', headers: { 'x-xufa-admin': '1' } })).json().models;
    expect(models.map((model) => model.name)).toEqual(expect.arrayContaining(['Shelf', 'Volume']));
  });
});
