// The forms and lists of the admin as Django's ModelAdmin has them: many-to-many fields (chosen from the objects of
// their models, required unless they may be blank), columns that are not fields (methods, paths across foreign keys,
// many-to-many, and columns of their own), and the fields of a form in groups (fields, fieldsets).
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { admin, describeModel } from '../index.js';

function models() {
  class Genre extends Model {
    static fields = { name: fields.string({ maxLength: 100 }) };

    toString() {
      return this.name;
    }
  }
  class Author extends Model {
    static fields = { lastName: fields.string({ maxLength: 100 }), firstName: fields.string({ maxLength: 100 }) };

    toString() {
      return `${this.lastName}, ${this.firstName}`;
    }
  }
  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 200 }),
      author: fields.foreignKey(() => Author, { null: true }),
      genre: fields.manyToMany(() => Genre, { help: 'Select a genre for this book' }),
      tags: fields.manyToMany(() => Genre, { blank: true, relatedName: 'taggedBooks' }),
    };

    // Django's display_genre (short_description: 'Genre').
    async displayGenre() {
      return (await this.genre.all())
        .slice(0, 3)
        .map((genre) => genre.name)
        .join(', ');
    }

    get shout() {
      return this.title.toUpperCase();
    }

    toString() {
      return this.title;
    }
  }
  Book.prototype.displayGenre.label = 'Genre';
  return { Genre, Author, Book };
}

async function setUp(bookOptions) {
  const { Genre, Author, Book } = models();
  const db = new Database({ backend: 'memory' }).register(Genre, Author, Book);
  await db.sync();
  const [fantasy, poetry, drama] = await Promise.all(
    ['Fantasy', 'Poetry', 'Drama'].map((name) => Genre.objects.create({ name }))
  );
  const ursula = await Author.objects.create({ lastName: 'Le Guin', firstName: 'Ursula' });
  const book = await Book.objects.create({ title: 'Earthsea', authorId: ursula.pk });
  await book.genre.set([fantasy.pk, poetry.pk]);
  const app = xufa();
  app.register(admin, { prefix: '/admin', models: [[Book, bookOptions || {}], Genre, Author], authorize: () => true });
  await app.ready();
  return { app, Genre, Author, Book, fantasy, poetry, drama, ursula, book };
}

const WRITE = { 'x-xufa-admin': '1' };

describe('many-to-many fields', () => {
  it('are fields of the form: their objects in the object, set by creates and updates', async () => {
    const { app, Book, fantasy, poetry, drama, book } = await setUp();
    const meta = (await app.inject('/admin/api/models')).json();
    const genre = meta.models.find((item) => item.name === 'Book').fields.find((field) => field.name === 'genre');
    expect(genre).toMatchObject({
      type: 'manyToMany',
      input: 'multiselect',
      target: 'Genre',
      required: true,
      help: 'Select a genre for this book',
    });
    const one = (await app.inject(`/admin/api/Book/${book.pk}`)).json();
    expect([one.values.genre, one.related.genre]).toEqual([
      [fantasy.pk, poetry.pk],
      ['Fantasy', 'Poetry'],
    ]);
    // Required: none is an error of its field; tags may be blank.
    const none = await app.inject({ method: 'POST', url: '/admin/api/Book', headers: WRITE, payload: { title: 'X' } });
    expect([none.statusCode, none.json().errors]).toEqual([400, { genre: ['This field is required.'] }]);
    const made = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'Odes', genre: [String(poetry.pk), drama.pk] },
    });
    expect(made.statusCode).toBe(201);
    expect(made.json().related.genre).toEqual(['Poetry', 'Drama']);
    const odes = await Book.objects.get({ title: 'Odes' });
    expect((await odes.genre.all()).map(String)).toEqual(['Poetry', 'Drama']);
    // An update sets them; one without them leaves them.
    await app.inject({ method: 'PATCH', url: `/admin/api/Book/${book.pk}`, headers: WRITE, payload: { genre: [drama.pk] } });
    await app.inject({ method: 'PATCH', url: `/admin/api/Book/${book.pk}`, headers: WRITE, payload: { title: 'Earthsea I' } });
    expect((await book.genre.all()).map(String)).toEqual(['Drama']);
    const empty = await app.inject({ method: 'PATCH', url: `/admin/api/Book/${book.pk}`, headers: WRITE, payload: { genre: [] } });
    expect(empty.statusCode).toBe(400);
    const bad = await app.inject({ method: 'PATCH', url: `/admin/api/Book/${book.pk}`, headers: WRITE, payload: { genre: ['x'] } });
    expect(bad.statusCode).toBe(400);
    // The choices of their models.
    expect((await app.inject('/admin/api/Genre/choices')).json().map((item) => item.label)).toEqual([
      'Fantasy',
      'Poetry',
      'Drama',
    ]);
  });
});

describe('columns of lists', () => {
  it('methods (async too, with their labels), getters, paths across foreign keys, many-to-many, columns of their own', async () => {
    const { app } = await setUp({
      list: [
        'title',
        'author__lastName',
        'displayGenre',
        'shout',
        'genre',
        { name: 'size', label: 'Size', value: (book) => book.title.length },
      ],
    });
    const meta = (await app.inject('/admin/api/models')).json();
    const book = meta.models.find((item) => item.name === 'Book');
    expect(book.columns).toEqual([
      { name: 'title', label: null, computed: false, sortable: true },
      { name: 'author__lastName', label: null, computed: true, sortable: true },
      { name: 'displayGenre', label: 'Genre', computed: true, sortable: false },
      { name: 'shout', label: null, computed: true, sortable: false },
      { name: 'genre', label: null, computed: true, sortable: false },
      { name: 'size', label: 'Size', computed: true, sortable: false },
    ]);
    const list = (await app.inject('/admin/api/Book')).json();
    expect(list.results[0].columns).toEqual({
      author__lastName: 'Le Guin',
      displayGenre: 'Fantasy, Poetry',
      shout: 'EARTHSEA',
      genre: 'Fantasy, Poetry',
      size: 8,
    });
    // Ordered by a path; not by a method.
    expect((await app.inject('/admin/api/Book?order=-author__lastName')).statusCode).toBe(200);
    expect((await app.inject('/admin/api/Book?order=displayGenre')).statusCode).toBe(400);
  });

  it('a name that is no field, path, method nor column is an error when the admin starts', () => {
    const { Book } = models();
    expect(() => describeModel(Book, { list: ['nope'] })).toThrow('admin: Book has no field nope');
    expect(() => describeModel(Book, { list: ['title__x'] })).toThrow('title is not a foreign key');
    expect(() => describeModel(Book, { list: ['author__nope'] })).toThrow('admin: Book has no field author__nope');
  });
});

describe('fields and fieldsets', () => {
  it('the fields of a form in groups, some on one line; only those are taken', async () => {
    const { app, book } = await setUp({
      fieldsets: [
        [null, { fields: ['title', 'author'] }],
        ['Classification', { fields: [['genre', 'tags']], description: 'Where it is shelved', collapse: true }],
      ],
    });
    const meta = (await app.inject('/admin/api/models')).json();
    expect(meta.models.find((item) => item.name === 'Book').layout).toEqual([
      { title: null, description: null, collapse: false, rows: [['title'], ['author']] },
      { title: 'Classification', description: 'Where it is shelved', collapse: true, rows: [['genre', 'tags']] },
    ]);
    const { Author } = models();
    expect(describeModel(Author, { fields: ['lastName', ['firstName']] }).layout).toEqual([
      { title: null, description: null, collapse: false, rows: [['lastName'], ['firstName']] },
    ]);
    expect(() => describeModel(Author, { fields: ['nope'] })).toThrow('admin: Author has no field nope');
    // A field out of the layout is not changed by the form.
    const limited = await setUp({ fields: ['title'] });
    await limited.app.inject({
      method: 'PATCH',
      url: `/admin/api/Book/${limited.book.pk}`,
      headers: WRITE,
      payload: { title: 'Tehanu', authorId: null },
    });
    const changed = await limited.Book.objects.get({ pk: limited.book.pk });
    expect([changed.title, changed.authorId]).toEqual(['Tehanu', limited.ursula.pk]);
    expect(book.pk).toBeDefined();
  });
});

describe('inlines edited in rows (TabularInline)', () => {
  async function setUpInline(inline) {
    const { Genre, Author, Book } = models();
    const db = new Database({ backend: 'memory' }).register(Genre, Author, Book);
    await db.sync();
    const fantasy = await Genre.objects.create({ name: 'Fantasy' });
    const ursula = await Author.objects.create({ lastName: 'Le Guin', firstName: 'Ursula' });
    const other = await Author.objects.create({ lastName: 'Woolf', firstName: 'Virginia' });
    const earthsea = await Book.objects.create({ title: 'Earthsea', authorId: ursula.pk });
    const waves = await Book.objects.create({ title: 'The Waves', authorId: other.pk });
    const app = xufa();
    app.register(admin, {
      prefix: '/admin',
      models: [[Author, { inlines: [inline] }], Book, Genre],
      authorize: () => true,
    });
    await app.ready();
    return { app, Book, fantasy, ursula, earthsea, waves };
  }

  it('the relation says it is editable, with its fields and extra rows; mistakes when the admin starts', async () => {
    const { app } = await setUpInline({ relation: 'bookSet', fields: ['title'], extra: 2 });
    const meta = (await app.inject('/admin/api/models')).json();
    expect(meta.models.find((item) => item.name === 'Author').related).toEqual([
      expect.objectContaining({ name: 'bookSet', model: 'Book', field: 'author', editable: true, fields: ['title'], extra: 2 }),
    ]);
    await expect(setUpInline({ relation: 'bookSet', fields: ['author'] })).rejects.toThrow('cannot edit author');
    await expect(setUpInline({ relation: 'nope' })).rejects.toThrow('has no relation nope');
  });

  it('rows created, changed and deleted at once; errors by row and nothing saved; rows of others are not found', async () => {
    const { app, Book, ursula, earthsea, waves } = await setUpInline({ relation: 'bookSet', fields: ['title'] });
    const url = `/admin/api/Author/${ursula.pk}/related/bookSet`;
    const send = (rows) => app.inject({ method: 'POST', url, headers: WRITE, payload: { rows } });
    const bad = await send([{ pk: earthsea.pk, values: { title: 'Earthsea I' } }, { values: { title: null } }]);
    expect([bad.statusCode, Object.keys(bad.json().errors)]).toEqual([400, ['1']]);
    expect((await Book.objects.get({ pk: earthsea.pk })).title).toBe('Earthsea');
    const good = await send([
      { pk: earthsea.pk, values: { title: 'Earthsea I' } },
      { values: { title: 'Tehanu' } },
      { values: { title: 'Not this one' }, delete: true },
    ]);
    expect(good.json()).toEqual({ saved: 2, deleted: 0 });
    expect((await Book.objects.filter({ authorId: ursula.pk }).orderBy('title')).map(String)).toEqual([
      'Earthsea I',
      'Tehanu',
    ]);
    const tehanu = await Book.objects.get({ title: 'Tehanu' });
    expect((await send([{ pk: tehanu.pk, delete: true }])).json()).toEqual({ saved: 0, deleted: 1 });
    // A row of another author is not one of these.
    expect((await send([{ pk: waves.pk, values: { title: 'x' } }])).statusCode).toBe(404);
    // A relation that is not editable takes no rows.
    const plain = await setUpInline('bookSet');
    const refused = await plain.app.inject({
      method: 'POST',
      url: `/admin/api/Author/${plain.ursula.pk}/related/bookSet`,
      headers: WRITE,
      payload: { rows: [] },
    });
    expect(refused.statusCode).toBe(404);
  });
});

describe('a new object with its inlines (the add page of Django with TabularInlines)', () => {
  it('created with its rows in one transaction; any error of a row (or of the object) and nothing is saved', async () => {
    const { Genre, Author, Book } = models();
    const db = new Database({ backend: 'memory' }).register(Genre, Author, Book);
    await db.sync();
    const app = xufa();
    app.register(admin, {
      prefix: '/admin',
      models: [[Author, { inlines: [{ relation: 'bookSet', fields: ['title'] }] }], Book, Genre],
      authorize: () => true,
    });
    await app.ready();
    const create = (payload) => app.inject({ method: 'POST', url: '/admin/api/Author', headers: WRITE, payload });
    const bad = await create({ lastName: 'Le Guin', inlines: { bookSet: [{ values: { title: 'Earthsea' } }, { values: { title: null } }] } });
    expect([bad.statusCode, Object.keys(bad.json().inlines.bookSet), bad.json().errors]).toEqual([400, ['1'], { firstName: expect.any(Array) }]);
    expect([await Author.objects.count(), await Book.objects.count()]).toEqual([0, 0]);
    const good = await create({
      lastName: 'Le Guin',
      firstName: 'Ursula',
      inlines: { bookSet: [{ values: { title: 'Earthsea' } }, { values: { title: 'Tehanu' } }] },
    });
    expect(good.statusCode).toBe(201);
    const ursula = await Author.objects.get({ pk: good.json().pk });
    expect((await ursula.bookSet.orderBy('title')).map(String)).toEqual(['Earthsea', 'Tehanu']);
    expect((await create({ lastName: 'x', firstName: 'y', inlines: { nope: [] } })).statusCode).toBe(404);
  });
});

describe('list_editable', () => {
  it('booleans and choices of the list; other fields are mistakes when the admin starts', () => {
    class Item extends Model {
      static fields = {
        name: fields.string(),
        done: fields.boolean({ default: false }),
        status: fields.string({ choices: ['a', 'b'], default: 'a' }),
        notes: fields.text({ null: true }),
      };
    }
    expect(describeModel(Item, { list: ['name', 'done', 'status'], editable: ['done', 'status'] }).editable).toEqual([
      'done',
      'status',
    ]);
    expect(() => describeModel(Item, { list: ['name'], editable: ['done'] })).toThrow('cannot edit done in its list');
    expect(() => describeModel(Item, { list: ['name', 'notes'], editable: ['notes'] })).toThrow(
      'edits booleans and choices in its list, not notes'
    );
    expect(() =>
      describeModel(Item, { list: ['name', 'done'], editable: ['done'], fields: ['name'] })
    ).toThrow('its form has not that field');
  });
});
