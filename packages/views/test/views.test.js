// The views of classes (Django's generic views) over the books of a library: lists in pages, details (404 when not
// there), forms that create and update (with the model's checks), deletes, redirects, templates, and the guards of
// the accounts of @xufa/auth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import * as template from '@xufa/template';
import { sessionPlugin } from '@xufa/session';
import * as auth from '@xufa/auth';
import { View, TemplateView, RedirectView, ListView, DetailView, FormView, CreateView, UpdateView, DeleteView, Http404, getObjectOr404 } from '../index.js';
import { Form, fields as formFields } from '@xufa/forms';
import httpModule from '@xufa/http';
import * as indexModule from '../index.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-views-'));
const write = (name, text) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
};
write('about.html', 'About {{ params.topic }} {{ title }} {{ view.templateName }}');
write('catalog/viewbook_list.html', '{{ viewBookList.map(String).join(",") }}|{{ page?.number }}/{{ page?.numPages }}|{{ isPaginated }}');
write('catalog/keyset.html', '{{ viewBookList.map(String).join(",") }}|{{ page.previousCursor || "" }}|{{ page.nextCursor || "" }}');
write('catalog/viewbook_detail.html', '{{ viewBook.title }}={{ object.title }} {{ copies }}');
write('catalog/viewbook_form.html', '{{ object ? "update" : "create" }}|{{{ form.asP() }}}');
write('catalog/viewbook_confirm_delete.html', 'Delete {{ object.title }}?');
write('contact.html', '{{{ form.asP() }}}');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

class ViewBook extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    isbn: fields.string({ maxLength: 13, unique: true, label: 'ISBN' }),
    pages: fields.integer({ null: true }),
  };

  static options = { ordering: ['title'] };

  get absoluteUrl() {
    return `/books/${this.pk}`;
  }

  toString() {
    return this.title;
  }
}

class Contact extends Form {
  static fields = { email: formFields.email() };
}

const PASSWORDS = { ln: 4 };
let app;
let db;

async function makeApp(register) {
  const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
  const users = [
    { id: 1, email: 'ada@example.com', password: hash, role: 'librarian', permissions: [] },
    { id: 2, email: 'bob@example.com', password: hash, role: null, permissions: [] },
  ];
  const made = xufa();
  made.register(httpModule.formBody);
  made.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
  made.register(auth.accounts, {
    secret: 'a secret of the accounts, 32 chars or more',
    users: {
      findByEmail: (email) => users.find((user) => user.email === email) || null,
      findById: (id) => users.find((user) => String(user.id) === String(id)) || null,
    },
    passwordOptions: PASSWORDS,
    lockout: false,
    loginUrl: '/login/',
    rbac: { roles: { librarian: ['ViewBook.*'] } },
  });
  made.register(template.plugin, { root });
  register(made);
  await made.ready();
  return made;
}

const browser = (target) => {
  let cookie = '';
  const send = async (options) => {
    const res = await target.inject({ ...options, headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
    if (res.headers['set-cookie']) cookie = [].concat(res.headers['set-cookie'])[0].split(';')[0];
    return res;
  };
  send.login = (email) =>
    send({ method: 'POST', url: '/account/login', payload: { email, password: 'right-horse-battery' } });
  return send;
};

beforeAll(async () => {
  db = new Database({ backend: 'memory' }).register(ViewBook);
  await db.sync();
  for (const [title, isbn] of [
    ['Dune', '1'],
    ['Emma', '2'],
    ['Beloved', '3'],
    ['Ulysses', '4'],
    ['Walden', '5'],
  ]) {
    await ViewBook.objects.create({ title, isbn });
  }
  app = await makeApp((target) => {
    class BookList extends ListView {
      static model = ViewBook;
      static templateDir = 'catalog';
      static paginateBy = 2;
    }
    class BookDetail extends DetailView {
      static model = ViewBook;
      static templateDir = 'catalog';

      async getContextData(context) {
        return super.getContextData({ ...context, copies: 0 });
      }
    }
    class BookCreate extends CreateView {
      static model = ViewBook;
      static templateDir = 'catalog';
      static fields = ['title', 'isbn', 'pages'];
      static permissionRequired = 'ViewBook.add';
    }
    class BookUpdate extends UpdateView {
      static model = ViewBook;
      static templateDir = 'catalog';
      static fields = ['title', 'pages'];
      static successUrl = '/books/{id}/updated';
      static loginRequired = true;
    }
    class BookDelete extends DeleteView {
      static model = ViewBook;
      static templateDir = 'catalog';
      static permissionRequired = 'ViewBook.delete';

      successUrl() {
        return this.reverse('books');
      }
    }
    target.route(BookList.asRoute('/books/', { name: 'books' }));
    target.route(BookList.asRoute('/books/all/', {}, { paginateBy: null, ordering: '-title' }));
    target.route(BookList.asRoute('/books/keyset/', {}, { pagination: 'keyset', templateName: 'catalog/keyset' }));
    target.route(BookDetail.asRoute('/books/:pk', { name: 'book-detail' }));
    target.route(BookCreate.asRoute('/books/create/'));
    target.route(BookUpdate.asRoute('/books/:pk/update/'));
    target.route(BookDelete.asRoute('/books/:pk/delete/'));
    target.get('/about/:topic', TemplateView.asView({ templateName: 'about', extraContext: { title: 'us' } }));
    target.route(
      FormView.asRoute('/contact/', {}, { formClass: Contact, templateName: 'contact', successUrl: '/thanks/' })
    );
    target.all('/old/:pk', RedirectView.asView({ url: '/books/{pk}', queryString: true }));
    target.get('/gone', RedirectView.asView());
    target.get('/first', RedirectView.asView({ patternName: 'books', permanent: true }));
  });
});

afterAll(async () => {
  await app.close();
});

describe('ListView', () => {
  it('a page of the objects (ordered by the model), the page and the paginator; ?page=last; 404 for no page', async () => {
    expect((await app.inject('/books/')).body).toBe('Beloved,Dune|1/3|true');
    expect((await app.inject('/books/?page=2')).body).toBe('Emma,Ulysses|2/3|true');
    expect((await app.inject('/books/?page=last')).body).toBe('Walden|3/3|true');
    expect((await app.inject('/books/?page=9')).statusCode).toBe(404);
    expect((await app.inject('/books/?page=x')).statusCode).toBe(404);
  });

  it("pagination: 'keyset': pages by cursors (?cursor=), next and back; 404 for a cursor that is not one", async () => {
    const pageOf = async (cursor) => {
      const res = await app.inject(`/books/keyset/${cursor ? `?cursor=${cursor}` : ''}`);
      const [names, previous, next] = res.body.split('|');
      return { names, previous, next };
    };
    const first = await pageOf();
    expect([first.names, first.previous]).toEqual(['Beloved,Dune', '']);
    const second = await pageOf(first.next);
    const third = await pageOf(second.next);
    expect([second.names, third.names, third.next]).toEqual(['Emma,Ulysses', 'Walden', '']);
    expect((await pageOf(third.previous)).names).toBe('Emma,Ulysses');
    expect((await app.inject('/books/keyset/?cursor=nope')).statusCode).toBe(404);
  });

  it('options of asView for one route: no pages, another order', async () => {
    expect((await app.inject('/books/all/')).body).toBe('Walden,Ulysses,Emma,Dune,Beloved|/|false');
  });
});

describe('DetailView', () => {
  it('the object as object and by the name of its model, with the context added; 404 when it is not there', async () => {
    const dune = await ViewBook.objects.get({ title: 'Dune' });
    expect((await app.inject(`/books/${dune.pk}`)).body).toBe('Dune=Dune 0');
    expect((await app.inject('/books/999')).statusCode).toBe(404);
  });

  it('getObjectOr404: a key the model cannot have is not there', async () => {
    class Uuid extends Model {
      static fields = { id: fields.uuid({ primaryKey: true }) };
    }
    db.register(Uuid);
    await db.sync();
    await expect(getObjectOr404(Uuid, { pk: 'not-a-uuid' })).rejects.toBeInstanceOf(Http404);
    await expect(getObjectOr404(ViewBook.objects.filter({ title: 'Emma' }), { pk: 1 })).rejects.toThrow(
      'No ViewBook matches the given query.'
    );
  });
});

describe('CreateView, UpdateView and DeleteView', () => {
  it('the permission of the view: to the login without a user, 403 without it', async () => {
    const anonymous = await app.inject('/books/create/');
    expect([anonymous.statusCode, anonymous.headers.location]).toEqual([302, '/login/?next=%2Fbooks%2Fcreate%2F']);
    const bob = browser(app);
    await bob.login('bob@example.com');
    expect((await bob({ url: '/books/create/' })).statusCode).toBe(403);
  });

  it('create: the form of its fields; its errors (the unique ISBN); saved, to the address of the object', async () => {
    const ada = browser(app);
    await ada.login('ada@example.com');
    const empty = await ada({ url: '/books/create/' });
    expect(empty.body).toMatch(/^create\|<p><label for="id_title">Title:<\/label>/);
    const taken = await ada({ method: 'POST', url: '/books/create/', payload: { title: 'Copy', isbn: '1' } });
    expect([taken.statusCode, taken.body]).toEqual([200, expect.stringContaining('View book with this ISBN already exists.')]);
    const made = await ada({ method: 'POST', url: '/books/create/', payload: { title: 'Middlemarch', isbn: '6' } });
    const book = await ViewBook.objects.get({ isbn: '6' });
    expect([made.statusCode, made.headers.location]).toEqual([302, `/books/${book.pk}`]);
  });

  it('update: the form of the object (404 when it is not there), successUrl with its fields', async () => {
    const ada = browser(app);
    await ada.login('ada@example.com');
    const emma = await ViewBook.objects.get({ title: 'Emma' });
    expect((await ada({ url: `/books/${emma.pk}/update/` })).body).toContain('value="Emma"');
    expect((await ada({ url: '/books/999/update/' })).statusCode).toBe(404);
    const bad = await ada({ method: 'POST', url: `/books/${emma.pk}/update/`, payload: { title: 'Emma', pages: 'many' } });
    expect(bad.body).toContain('Enter a whole number.');
    const res = await ada({ method: 'POST', url: `/books/${emma.pk}/update/`, payload: { title: 'Emma', pages: '400' } });
    expect([res.statusCode, res.headers.location]).toEqual([302, `/books/${emma.pk}/updated`]);
    expect((await ViewBook.objects.get({ pk: emma.pk })).pages).toBe(400);
  });

  it('delete: GET asks, POST deletes and goes to successUrl', async () => {
    const ada = browser(app);
    await ada.login('ada@example.com');
    const walden = await ViewBook.objects.get({ title: 'Walden' });
    expect((await ada({ url: `/books/${walden.pk}/delete/` })).body).toBe('Delete Walden?');
    const res = await ada({ method: 'POST', url: `/books/${walden.pk}/delete/` });
    expect([res.statusCode, res.headers.location]).toEqual([302, '/books/']);
    expect(await ViewBook.objects.filter({ pk: walden.pk }).exists()).toBe(false);
  });
});

describe('View, TemplateView, FormView and RedirectView', () => {
  it('TemplateView: its template with the parameters and extraContext; the methods it answers', async () => {
    expect((await app.inject('/about/us')).body).toBe('About us us about');
    expect(TemplateView.methods).toEqual(['GET']);
    expect(CreateView.methods).toEqual(['GET', 'POST', 'PUT']);
    expect(DeleteView.methods).toEqual(['GET', 'POST', 'DELETE']);
  });

  it('FormView: the form again with its errors, or to successUrl', async () => {
    const bad = await app.inject({ method: 'POST', url: '/contact/', payload: { email: 'nope' } });
    expect(bad.body).toContain('Enter a valid email address.');
    const res = await app.inject({ method: 'POST', url: '/contact/', payload: { email: 'ada@example.com' } });
    expect([res.statusCode, res.headers.location]).toEqual([302, '/thanks/']);
  });

  it('RedirectView: url with parameters and the query, a named route (permanent), 410 without an address', async () => {
    const old = await app.inject({ method: 'POST', url: '/old/7?x=1' });
    expect([old.statusCode, old.headers.location]).toEqual([302, '/books/7?x=1']);
    const first = await app.inject('/first');
    expect([first.statusCode, first.headers.location]).toEqual([301, '/books/']);
    expect((await app.inject('/gone')).statusCode).toBe(410);
  });

  it('a View answers its methods, 405 for the others; options checked when the route is made', async () => {
    class Ping extends View {
      static greeting = 'pong';

      get() {
        return this.reply.send(this.greeting);
      }
    }
    const target = xufa();
    target.all('/ping', Ping.asView({ greeting: 'hi' }));
    expect((await target.inject('/ping')).body).toBe('hi');
    const post = await target.inject({ method: 'POST', url: '/ping' });
    expect([post.statusCode, post.headers.allow]).toEqual([405, 'GET']);
    expect(() => Ping.asView({ colour: 'red' })).toThrow('Ping has no setting colour');
    expect(() => Ping.asView({ get: () => 1 })).toThrow('get is a method of HTTP');
  });
});

describe('crud and the built-in templates', () => {
  class CrudAuthor extends Model {
    static fields = { name: fields.string({ maxLength: 100 }) };

    toString() {
      return this.name;
    }
  }
  class CrudBook extends Model {
    static fields = {
      title: fields.string({ maxLength: 100, label: 'Title of the book' }),
      author: fields.foreignKey(() => CrudAuthor, { onDelete: 'protect', relatedName: 'books' }),
      status: fields.string({ maxLength: 1, choices: [['a', 'Available'], ['o', 'On loan']], default: 'a' }),
    };

    static options = { ordering: ['title'], label: 'volume' };

    toString() {
      return this.title;
    }
  }
  const { crud, plugin: viewsPlugin, templates } = indexModule;
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-crud-'));
  fs.writeFileSync(path.join(own, 'layout.html'), '<main>{{#block content}}{{/block}}</main>');
  let site;

  beforeAll(async () => {
    const crudDb = new Database({ backend: 'memory' }).register(CrudAuthor, CrudBook);
    await crudDb.sync();
    const ada = await CrudAuthor.objects.create({ name: 'Ada' });
    await CrudAuthor.objects.create({ name: 'Alan' });
    await CrudBook.objects.create({ title: 'Notes', author: ada });
    site = xufa();
    site.register(httpModule.formBody);
    site.register(template.plugin, { root: [own, templates] });
    site.register(viewsPlugin, { baseTemplate: 'layout', paginateBy: 1 });
    for (const route of crud(CrudAuthor, { prefix: '/c', fields: ['name'], permissions: false })) site.route(route);
    for (const route of crud(CrudBook, {
      prefix: '/c',
      fields: ['title', 'author', 'status'],
      permissions: false,
      list: { paginateBy: false, selectRelated: 'author' },
      detail: { selectRelated: ['author'] },
    })) {
      site.route(route);
    }
    await site.ready();
  });

  afterAll(async () => {
    await site.close();
    fs.rmSync(own, { recursive: true, force: true });
  });

  it('names and paths of the five pages, with the converter of the key', () => {
    const routes = crud(CrudBook, { only: ['list', 'detail'], prefix: '/catalog/' });
    expect(routes.map((route) => [route.name, route.url])).toEqual([
      ['crudbooks', '/catalog/crudbooks/'],
      ['crudbook-detail', '/catalog/crudbook/<int:pk>'],
    ]);
    const guarded = crud(CrudBook, { permissions: { update: 'CrudBook.edit', delete: false } });
    expect(guarded.map((route) => route.handler.viewOptions.permissionRequired)).toEqual([
      undefined,
      undefined,
      'CrudBook.add',
      'CrudBook.edit',
      undefined,
    ]);
    expect(() => crud(CrudBook, { lists: {} })).toThrow('lists is no option');
  });

  it('lists in pages of the app (paginateBy), or all; titles and links of the built-in template', async () => {
    const authors = await site.inject('/c/crudauthors/');
    expect(authors.body).toMatch(/^<main>\s*<h1>Crud author List<\/h1>/);
    expect(authors.body).toContain('<li>Ada</li>');
    expect(authors.body).not.toContain('Alan');
    expect((await site.inject('/c/crudauthors/?page=2')).body).toContain('<li>Alan</li>');
    expect((await site.inject('/c/crudbooks/')).body).toContain('<h1>Volume List</h1>');
  });

  it('details: the fields by their labels, choices by theirs; 404 for none', async () => {
    const book = await CrudBook.objects.first();
    const page = (await site.inject(`/c/crudbook/${book.pk}`)).body;
    expect(page).toContain('<h1>Volume: Notes</h1>');
    expect(page).toMatch(/<dt>Title of the book<\/dt>\s*<dd>Notes<\/dd>/);
    expect(page).toMatch(/<dt>Author<\/dt>\s*<dd>Ada<\/dd>/);
    expect(page).toMatch(/<dt>Status<\/dt>\s*<dd>Available<\/dd>/);
    expect((await site.inject('/c/crudbook/999')).statusCode).toBe(404);
  });

  it('create and update: the built-in form; saved, to the page of the object', async () => {
    const form = (await site.inject('/c/crudauthor/create/')).body;
    expect(form).toContain('<h1>Create crud author</h1>');
    expect(form).toContain('name="name"');
    const res = await site.inject({ method: 'POST', url: '/c/crudauthor/create/', payload: { name: 'Grace' } });
    const grace = await CrudAuthor.objects.get({ name: 'Grace' });
    expect(res.headers.location).toBe(`/c/crudauthor/${grace.pk}`);
    expect((await site.inject(`/c/crudauthor/${grace.pk}/update/`)).body).toContain(
      '<h1>Update crud author: Grace</h1>'
    );
  });

  it('delete: what protects the object instead of the button; POST comes back; then deleted, to the list', async () => {
    const ada = await CrudAuthor.objects.get({ name: 'Ada' });
    const page = (await site.inject(`/c/crudauthor/${ada.pk}/delete/`)).body;
    expect(page).toMatch(/You can(&#39;|&#x27;)t delete this crud author until all its volumes have been deleted:/);
    expect(page).toContain('<a href="/c/crudbook/');
    expect(page).not.toContain('Yes, delete.');
    const kept = await site.inject({ method: 'POST', url: `/c/crudauthor/${ada.pk}/delete/` });
    expect(kept.headers.location).toBe(`/c/crudauthor/${ada.pk}/delete/`);
    await CrudBook.objects.delete();
    const asked = (await site.inject(`/c/crudauthor/${ada.pk}/delete/`)).body;
    expect(asked).toContain('Are you sure you want to delete the crud author: Ada?');
    const gone = await site.inject({ method: 'POST', url: `/c/crudauthor/${ada.pk}/delete/` });
    expect(gone.headers.location).toBe('/c/crudauthors/');
    expect(await CrudAuthor.objects.filter({ name: 'Ada' }).exists()).toBe(false);
  });
});
