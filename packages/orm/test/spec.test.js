// Models as data: modelsFromSpec() makes classes that work as those of code (relations, many-to-many, rules, options),
// and specOf() gives back the spec of any model, so a spec makes the same models again.
import { Database, Model, fields, modelsFromSpec, specOf, SpecError } from '../index.js';

class Reader extends Model {
  static fields = { name: fields.string({ maxLength: 100 }) };

  static options = { table: 'spec_readers' };
}

const SPEC = {
  Genre: {
    table: 'spec_genres',
    display: '{name}',
    fields: { name: { type: 'string', maxLength: 100, unique: true } },
  },
  Author: {
    table: 'spec_authors',
    ordering: ['lastName'],
    fields: {
      firstName: { type: 'string', maxLength: 100 },
      lastName: { type: 'string', maxLength: 100, label: 'Last name' },
      born: { type: 'date', null: true },
    },
  },
  Book: {
    table: 'spec_books',
    permissions: { lend: 'Can lend a book' },
    fields: {
      title: { type: 'string', maxLength: 200 },
      isbn: { type: 'string', maxLength: 13, validate: [{ rule: 'value.length == 13', message: 'Thirteen digits' }] },
      notes: 'text',
      tags: { type: 'array', of: { type: 'string', maxLength: 20 }, default: [] },
      author: { type: 'foreignKey', to: 'Author', null: true, onDelete: 'setNull' },
      genre: { type: 'manyToMany', to: 'Genre', blank: true },
      sequel: { type: 'foreignKey', to: 'self', null: true },
      reader: { type: 'foreignKey', to: 'Reader', null: true },
    },
  },
};

describe('modelsFromSpec()', () => {
  it('classes that work as those of code', async () => {
    const [Genre, Author, Book] = modelsFromSpec(SPEC, { resolve: (name) => (name === 'Reader' ? Reader : undefined) });
    expect([Genre.name, Author.name, Book.name]).toEqual(['Genre', 'Author', 'Book']);
    const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Reader, Genre, Author, Book);
    await db.connect();
    await db.sync();
    const ada = await Author.objects.create({ firstName: 'Ursula', lastName: 'Le Guin' });
    const fantasy = await Genre.objects.create({ name: 'Fantasy' });
    const book = await Book.objects.create({
      title: 'Earthsea',
      isbn: '9780547773742',
      notes: 'The first of six',
      author: ada,
      tags: ['sea'],
    });
    await book.genre.set([fantasy]);
    const found = await Book.objects.selectRelated('author').get({ genre__name: 'Fantasy' });
    expect([found.title, found.author.lastName, found.tags]).toEqual(['Earthsea', 'Le Guin', ['sea']]);
    expect(String(fantasy)).toBe('Fantasy');
    expect(Book.meta.permissions.map((item) => item.name)).toContain('Book.lend');
    expect(Author.meta.field('lastName').label).toBe('Last name');
    // The rule of the spec (an expression).
    await expect(Book.objects.create({ title: 'Short', isbn: '123' })).rejects.toThrow('Thirteen digits');
    await db.close();
  });

  it('errors name the place in the spec', () => {
    const made = (spec) => () => modelsFromSpec(spec, { where: 'catalog/models.yaml' });
    expect(made({ book: { fields: {} } })).toThrow('catalog/models.yaml: book: a model');
    expect(made({ Book: { fields: { Title: 'string' } } })).toThrow('Book.Title: a field');
    expect(made({ Book: { fields: { title: 'strin' } } })).toThrow(SpecError);
    expect(made({ Book: { fields: { title: 'strin' } } })).toThrow('type strin is not one of');
    expect(made({ Book: { fields: { author: { type: 'foreignKey' } } } })).toThrow('names its model (to)');
    expect(made({ Book: { fields: { tags: { type: 'array' } } } })).toThrow('takes the field it holds (of)');
    expect(made({ Book: { fields: { title: { type: 'string', to: 'Author' } } } })).toThrow('to is an option');
    // A model that is not there: when the relation is used.
    const [Lost] = modelsFromSpec({ Lost: { fields: { owner: { type: 'foreignKey', to: 'Nobody' } } } });
    expect(() => Lost.meta.field('owner').target).toThrow('there is no model Nobody');
  });
});

describe('specOf()', () => {
  it('the spec of a model of code: its fields and options; code left out by name', () => {
    class Shelf extends Model {
      static fields = {
        code: fields.string({ maxLength: 10, unique: 'ci', help: 'As on the label' }),
        books: fields.json({ default: () => [] }),
        reader: fields.foreignKey(() => Reader, { null: true, relatedName: 'shelves' }),
      };

      static options = { table: 'spec_shelves', ordering: ['code'] };
    }
    expect(specOf(Shelf)).toEqual({
      table: 'spec_shelves',
      ordering: ['code'],
      fields: {
        code: { type: 'string', maxLength: 10, unique: 'ci', help: 'As on the label' },
        books: { type: 'json', code: ['default'] },
        reader: { type: 'foreignKey', to: 'Reader', null: true, relatedName: 'shelves' },
      },
    });
  });

  it('a spec makes the same models again (and its own spec)', () => {
    const first = modelsFromSpec(SPEC, { resolve: () => Reader });
    const specs = Object.fromEntries(first.map((model) => [model.name, specOf(model)]));
    expect(specs.Book.fields.tags).toEqual({ type: 'array', of: { type: 'string', maxLength: 20 }, default: [] });
    expect(specs.Book.fields.sequel).toEqual({ type: 'foreignKey', to: 'self', null: true });
    expect(specs.Book.fields.genre).toEqual({ type: 'manyToMany', to: 'Genre', blank: true });
    const again = modelsFromSpec(specs, { resolve: () => Reader });
    expect(Object.fromEntries(again.map((model) => [model.name, specOf(model)]))).toEqual(specs);
  });
});
