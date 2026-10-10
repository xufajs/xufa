// The tests every backend passes: the same models and queries give the same results on all of them. Each test file
// of a backend calls defineSuite with a function that makes a Database of it.
import {
  Model,
  fields,
  Q,
  or,
  not,
  F,
  Raw,
  Count,
  Sum,
  Avg,
  Min,
  Max,
  ValidationError,
  NotFoundError,
} from '../index.js';
import { MultipleObjectsError, ProtectedError, QueryError, FieldError, LookupError, UniqueError } from '../index.js';
import {
  setEncryptionKeys,
  generateEncryptionKey,
  reencrypt,
  jsonPath,
  maintenance,
  QuerySet,
  CombinedQuerySet,
} from '../index.js';
import { Extract, Trunc } from '../index.js';

function defineModels() {
  class Publisher extends Model {
    static fields = {
      name: fields.string({ maxLength: 100, unique: true }),
    };
  }

  class Author extends Model {
    static fields = {
      name: fields.string({ maxLength: 100 }),
      email: fields.string({ null: true }),
      active: fields.boolean({ default: true }),
      publisher: fields.foreignKey(() => Publisher, { null: true, onDelete: 'setNull', relatedName: 'authors' }),
      createdAt: fields.datetime({ autoNowAdd: true }),
      friends: fields.manyToMany('self', { relatedName: 'friendOf' }),
    };

    static options = { ordering: ['name'] };
  }

  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 200 }),
      pages: fields.integer({ null: true, min: 1 }),
      rating: fields.float({ null: true }),
      author: fields.foreignKey(() => Author, { relatedName: 'books' }),
      tags: fields.json({ default: () => [] }),
      updatedAt: fields.datetime({ autoNow: true }),
      labels: fields.manyToMany(() => Tag, { relatedName: 'books' }),
    };
  }

  class Tag extends Model {
    static fields = {
      name: fields.string({ unique: true }),
    };

    static options = { ordering: ['name'] };
  }

  class Review extends Model {
    static fields = {
      book: fields.foreignKey(Book, { relatedName: 'reviews', onDelete: 'protect' }),
      stars: fields.integer({ choices: [1, 2, 3, 4, 5] }),
    };
  }

  class Category extends Model {
    static fields = {
      name: fields.string(),
      parent: fields.foreignKey('self', { null: true, relatedName: 'children' }),
    };
  }

  // The types of numbers, dates and bytes beyond the basic ones, and a key with its own attname.
  class Ledger extends Model {
    static fields = {
      big: fields.bigint({ null: true }),
      amount: fields.decimal({ precision: 12, scale: 2, null: true }),
      day: fields.date({ null: true }),
      blob: fields.bytes({ null: true }),
      owner: fields.foreignKey(() => Author, { null: true, attname: 'owner_id', relatedName: 'ledgers' }),
    };
  }

  // A key that points to a unique field other than the primary key.
  class Country extends Model {
    static fields = { code: fields.string({ maxLength: 2, unique: true }), name: fields.string() };
  }

  class City extends Model {
    static fields = {
      name: fields.string(),
      country: fields.foreignKey(() => Country, { toField: 'code', relatedName: 'cities' }),
    };
  }

  class Document extends Model {
    static fields = { name: fields.string(), data: fields.json({ null: true }) };
  }

  // Integers of 64 bits in each mode.
  class Tally extends Model {
    static fields = {
      auto: fields.bigint({ null: true }),
      big: fields.bigint({ mode: 'bigint', null: true }),
      text: fields.bigint({ mode: 'string', null: true }),
    };
  }

  // Names with the separator of paths (a__b), next to a json field whose path could read the same.
  class Spaced extends Model {
    static fields = {
      a__b: fields.string({ null: true }),
      a: fields.json({ null: true }),
      n__count: fields.integer({ default: 0 }),
    };
  }

  return { Publisher, Author, Book, Review, Category, Tag, Ledger, Country, City, Document, Tally, Spaced };
}

// options.bulkTimeout: the timeout of the test that writes thousands of rows (for backends whose writes are slow by
// nature: a file for each object, on Windows, takes about 1 ms each).
function defineSuite(name, makeDatabase, options = {}) {
  describe(`${name} backend`, () => {
    let db;
    let models;

    beforeAll(async () => {
      models = defineModels();
      db = makeDatabase();
      db.register(...Object.values(models));
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
    });

    beforeEach(async () => {
      const { Review, Book, Author, Publisher, Category, Tag, Ledger, Country, City, Document } = models;
      await Document.objects.delete();
      await City.objects.delete();
      await Country.objects.delete();
      await Ledger.objects.delete();
      await Review.objects.delete();
      await Tag.objects.delete();
      await Book.objects.delete();
      await Author.objects.delete();
      await Publisher.objects.delete();
      await Category.objects.filter({ parent__isnull: false }).delete();
      await Category.objects.delete();
    });

    async function seed() {
      const { Publisher, Author, Book } = models;
      const penguin = await Publisher.objects.create({ name: 'Penguin' });
      const ada = await Author.objects.create({ name: 'Ada', email: 'ada@example.com', publisher: penguin });
      const grace = await Author.objects.create({ name: 'Grace', email: null, active: false });
      const alan = await Author.objects.create({ name: 'Alan', email: 'alan@EXAMPLE.com', publisherId: penguin.pk });
      const books = await Book.objects.bulkCreate([
        { title: 'Notes on the Engine', pages: 120, rating: 4.5, author: ada, tags: ['math'] },
        { title: 'The Analytical Engine', pages: 300, rating: 3.5, author: ada },
        { title: 'Compilers', pages: 250, rating: null, author: grace, tags: ['code', 'cobol'] },
        { title: 'Computing Machinery', pages: null, rating: 5, author: alan },
      ]);
      return { penguin, ada, grace, alan, books };
    }

    const titles = (books) => books.map((book) => book.title);

    describe('objects', () => {
      it('creates objects with defaults and keys', async () => {
        const { Author } = models;
        const { ada, penguin } = await seed();
        expect(ada.pk).not.toBeNull();
        expect(ada.id).toBe(ada.pk);
        expect(ada.active).toBe(true);
        expect(ada.createdAt).toBeInstanceOf(Date);
        expect(ada.publisherId).toBe(penguin.pk);
        expect(ada.publisher).toBe(penguin);
        const loaded = await Author.objects.get({ pk: ada.pk });
        expect(loaded).toBeInstanceOf(Author);
        expect(loaded.name).toBe('Ada');
        expect(loaded.active).toBe(true);
        expect(loaded.createdAt.getTime()).toBe(ada.createdAt.getTime());
        expect(loaded.publisherId).toBe(penguin.pk);
        expect(loaded.publisher).toBeUndefined();
      });

      it('updates saved objects', async () => {
        const { Author } = models;
        const { grace } = await seed();
        grace.email = 'grace@example.com';
        grace.active = true;
        await grace.save();
        const loaded = await Author.objects.get({ name: 'Grace' });
        expect(loaded.email).toBe('grace@example.com');
        expect(loaded.active).toBe(true);
        expect(await Author.objects.count()).toBe(3);
      });

      it('saves only the fields named', async () => {
        const { Author } = models;
        const { grace } = await seed();
        grace.email = 'grace@example.com';
        grace.name = 'Not saved';
        await grace.save({ fields: ['email'] });
        await grace.refresh();
        expect(grace.name).toBe('Grace');
        expect(grace.email).toBe('grace@example.com');
        expect(await Author.objects.filter({ name: 'Not saved' }).exists()).toBe(false);
      });

      it('keeps json, floats and nulls', async () => {
        const { Book } = models;
        await seed();
        const book = await Book.objects.get({ title: 'Compilers' });
        expect(book.tags).toEqual(['code', 'cobol']);
        expect(book.rating).toBeNull();
        const notes = await Book.objects.get({ title: 'Notes on the Engine' });
        expect(notes.rating).toBe(4.5);
        expect(notes.updatedAt).toBeInstanceOf(Date);
        const machinery = await Book.objects.get({ title__startswith: 'Computing' });
        expect(machinery.pages).toBeNull();
        expect(machinery.tags).toEqual([]);
        // Json values that are strings or numbers.
        machinery.tags = 'none';
        await machinery.save();
        expect((await Book.objects.get({ pk: machinery.pk })).tags).toBe('none');
        await Book.objects.filter({ pk: machinery.pk }).update({ tags: 42 });
        expect((await Book.objects.get({ pk: machinery.pk })).tags).toBe(42);
      });

      it('validates before saving', async () => {
        const { Author, Book, Review } = models;
        const { ada, books } = await seed();
        let error;
        try {
          await Book.objects.create({ title: 'x'.repeat(201), pages: 0, author: ada });
        } catch (err) {
          error = err;
        }
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.statusCode).toBe(400);
        expect(Object.keys(error.errors).sort()).toEqual(['pages', 'title']);
        await expect(Author.objects.create({})).rejects.toThrow('This field is required');
        await expect(Review.objects.create({ book: books[0], stars: 6 })).rejects.toThrow('not a valid choice');
        await expect(Book.objects.create({ title: 'x', pages: 'many', author: ada })).rejects.toThrow('integer');
        expect(await Book.objects.count()).toBe(4);
      });

      it('coerces values', async () => {
        const { Book } = models;
        const { ada } = await seed();
        const book = await Book.objects.create({ title: 12, pages: '42', author: ada.pk });
        expect(book.title).toBe('12');
        expect(book.pages).toBe(42);
        expect((await Book.objects.get({ pages: '42' })).pk).toBe(book.pk);
      });

      it('rejects fields the model does not have', async () => {
        const { Author } = models;
        expect(() => new Author({ name: 'x', age: 3 })).toThrow(FieldError);
      });

      it('enforces unique fields', async () => {
        const { Publisher } = models;
        const first = await Publisher.objects.create({ name: 'Unique' });
        const err = await Publisher.objects.create({ name: 'Unique' }).catch((e) => e);
        expect(err).toBeInstanceOf(UniqueError);
        expect(err).toMatchObject({ statusCode: 409, model: 'Publisher', fields: ['name'] });
        expect(err.message).toBe('There is already a Publisher with this name');
        expect(await Publisher.objects.filter({ name: 'Unique' }).count()).toBe(1);
        // Updates and saves too, and duplicate primary keys.
        const other = await Publisher.objects.create({ name: 'Other' });
        const updated = await Publisher.objects
          .filter({ pk: other.pk })
          .update({ name: 'Unique' })
          .catch((e) => e);
        expect(updated).toMatchObject({ code: 'XUFA_ORM_ERR_UNIQUE', fields: ['name'] });
        other.name = 'Unique';
        expect((await other.save().catch((e) => e)).fields).toEqual(['name']);
        const twin = await Publisher.objects.bulkCreate([{ id: first.pk, name: 'Twin' }]).catch((e) => e);
        expect(twin).toBeInstanceOf(UniqueError);
      });

      it('deletes objects', async () => {
        const { Book } = models;
        const { books } = await seed();
        const [first] = books;
        const id = first.pk;
        expect(await first.delete()).toBe(1);
        expect(first.pk).toBeNull();
        expect(await Book.objects.filter({ pk: id }).exists()).toBe(false);
        expect(await Book.objects.count()).toBe(3);
      });

      it('calls hooks', async () => {
        const { Publisher } = models;
        const calls = [];
        Publisher.on('beforeSave', (publisher, { created }) => {
          calls.push(['beforeSave', publisher.name, created]);
          publisher.name = publisher.name.trim();
        });
        Publisher.on('afterSave', (publisher, { created }) => calls.push(['afterSave', publisher.name, created]));
        Publisher.on('afterDelete', (publisher) => calls.push(['afterDelete', publisher.name]));
        const publisher = await Publisher.objects.create({ name: ' Hooked ' });
        await publisher.save();
        await publisher.delete();
        Publisher.meta.hooks.clear();
        expect(calls).toEqual([
          ['beforeSave', ' Hooked ', true],
          ['afterSave', 'Hooked', true],
          ['beforeSave', 'Hooked', false],
          ['afterSave', 'Hooked', false],
          ['afterDelete', 'Hooked'],
        ]);
      });

      it('serializes to JSON with the relations loaded', async () => {
        const { Book } = models;
        await seed();
        const book = await Book.objects.selectRelated('author').get({ title: 'Compilers' });
        const json = JSON.parse(JSON.stringify(book));
        expect(json.title).toBe('Compilers');
        expect(json.authorId).toBe(book.authorId);
        expect(json.author.name).toBe('Grace');
        expect(typeof json.updatedAt).toBe('string');
      });
    });

    describe('fragments of SQL', () => {
      it('takes fragments in conditions, orders and values (SQL databases)', async () => {
        const { Book } = models;
        await seed();
        if (!db.backend.dialect) {
          await expect(Book.objects.filter(Raw('1 = 1')).count()).rejects.toThrow('not supported');
          return;
        }
        expect(await Book.objects.filter(Raw('pages > ?', [200])).count()).toBe(2);
        expect(
          await Book.objects.filter(Raw(`${Raw.TABLE}."pages" BETWEEN ? AND ?`, [100, 260]), { rating__gt: 4 }).count()
        ).toBe(1);
        const titles = await Book.objects.filter({ pages__isnull: false }).orderBy(Raw('pages * -1'));
        expect(titles.map((book) => book.pages)).toEqual([300, 250, 120]);
        const values = await Book.objects
          .filter({ pages__isnull: false })
          .orderBy('pages')
          .values('title', { double: Raw('pages * 2') });
        expect(values.map((row) => Number(row.double))).toEqual([240, 500, 600]);
        const [first] = await Book.objects.filter({ pages: 120 }).extra({ half: Raw('pages / 2') });
        expect(first.title).toBe('Notes on the Engine');
        expect(Number(first.half)).toBe(60);
      });
    });

    describe('json paths', () => {
      it('filters by values inside json values', async () => {
        const { Document } = models;
        await Document.objects.bulkCreate([
          { name: 'a', data: { owner: { name: 'Ada', age: 36 }, tags: ['x', 'y'], active: true } },
          { name: 'b', data: { owner: { name: 'Alan', age: 41 }, tags: ['y'], active: false } },
          { name: 'c', data: { owner: { name: 'Grace' } } },
          { name: 'd', data: null },
        ]);
        const names = async (where) => (await Document.objects.filter(where).orderBy('name')).map((doc) => doc.name);
        expect(await names({ data__owner__name: 'Ada' })).toEqual(['a']);
        expect(await names({ data__owner__age__gt: 40 })).toEqual(['b']);
        expect(await names({ data__owner__age__lte: 41 })).toEqual(['a', 'b']);
        expect(await names({ data__owner__age__in: [36, 50] })).toEqual(['a']);
        expect(await names({ data__owner__age__isnull: true })).toEqual(['c', 'd']);
        expect(await names({ data__owner__age: null })).toEqual(['c', 'd']);
        expect(await names({ data__active: true })).toEqual(['a']);
        expect(await names({ data__active: false })).toEqual(['b']);
        expect(await names({ data__tags__0: 'x' })).toEqual(['a']);
        expect(await names({ data__owner__name__startswith: 'A' })).toEqual(['a', 'b']);
        expect(await names({ data__owner__name__icontains: 'RAC' })).toEqual(['c']);
        expect(await names({ data__owner__name__like: 'A%n' })).toEqual(['b']);
        expect(await Document.objects.exclude({ data__owner__name: 'Ada' }).count()).toBe(3);
        // Orders and values by paths.
        const ordered = await Document.objects
          .filter({ data__owner__name__isnull: false })
          .orderBy('-data__owner__name');
        expect(ordered.map((doc) => doc.name)).toEqual(['c', 'b', 'a']);
        const values = await Document.objects
          .filter({ name__in: ['a', 'c'] })
          .orderBy('name')
          .values('name', 'data__owner', 'data__owner__age', 'data__tags');
        expect(values).toEqual([
          { name: 'a', data__owner: { name: 'Ada', age: 36 }, data__owner__age: 36, data__tags: ['x', 'y'] },
          { name: 'c', data__owner: { name: 'Grace' }, data__owner__age: null, data__tags: null },
        ]);
      });

      it('reads paths by the longest names of fields (a__b)', async () => {
        const { Spaced } = models;
        await Spaced.objects.bulkCreate([
          { a__b: 'v', a: { b: 'json' }, n__count: 3 },
          { a__b: 'w', a: { b: 'v' }, n__count: 5 },
        ]);
        const names = async (where) => (await Spaced.objects.filter(where).orderBy('a__b')).map((row) => row.a__b);
        expect(await names({ a__b: 'v' })).toEqual(['v']);
        expect(await names({ a__b__startswith: 'w' })).toEqual(['w']);
        expect(await names({ n__count__gt: 4 })).toEqual(['w']);
        expect(await names(jsonPath('a', ['b'], 'v'))).toEqual(['w']);
        expect((await Spaced.objects.orderBy('-n__count')).map((row) => row.a__b)).toEqual(['w', 'v']);
        expect(await Spaced.objects.orderBy('a__b').values('a__b', 'n__count')).toEqual([
          { a__b: 'v', n__count: 3 },
          { a__b: 'w', n__count: 5 },
        ]);
        const [made, created] = await Spaced.objects.getOrCreate({ a__b: 'x' }, { n__count: 1 });
        expect([made.a__b, made.n__count, created]).toEqual(['x', 1, true]);
        expect(await Spaced.objects.filter({ a__b: 'w' }).update({ n__count: 9 })).toBe(1);
      });

      it('gives bigints in the mode of their field', async () => {
        const { Tally } = models;
        const huge = '9007199254740993';
        await Tally.objects.bulkCreate([
          { auto: 5, big: 5, text: 5 },
          { auto: huge, big: huge, text: huge },
        ]);
        const rows = await Tally.objects.orderBy('pk');
        expect(rows.map((row) => [row.auto, row.big, row.text])).toEqual([
          [5, 5n, '5'],
          [BigInt(huge), BigInt(huge), huge],
        ]);
        expect(await Tally.objects.filter({ text: huge, big__gt: 6 }).count()).toBe(1);
        expect(await Tally.objects.orderBy('pk').values('big', 'text')).toEqual([
          { big: 5n, text: '5' },
          { big: BigInt(huge), text: huge },
        ]);
        expect(() => fields.bigint({ mode: 'text' })).toThrow('The mode of a bigint is one of');
        expect(() => fields.id({ mode: 'text' })).toThrow('The mode of a key is one of');
      });

      it('filters by paths given as lists of keys (jsonPath)', async () => {
        const { Document } = models;
        await Document.objects.bulkCreate([
          { name: 'a', data: { in: 1, a__b: 2, gt: { x: 'y' }, list: [10, 20], "it's": true } },
          { name: 'b', data: { a: { b: 2 }, in: 5, list: [30] } },
        ]);
        const names = async (where) => (await Document.objects.filter(where).orderBy('name')).map((doc) => doc.name);
        expect(await names(jsonPath('data', ['in'], 1))).toEqual(['a']);
        expect(await names(jsonPath('data', ['in'], 2, 'gte'))).toEqual(['b']);
        expect(await names(jsonPath('data', ['a__b'], 2))).toEqual(['a']);
        expect(await names({ data__a__b: 2 })).toEqual(['b']);
        expect(await names(jsonPath('data', ['gt', 'x'], 'y'))).toEqual(['a']);
        expect(await names(jsonPath('data', ['list', 1], 20))).toEqual(['a']);
        expect(await names(jsonPath('data', ["it's"], true))).toEqual(['a']);
        expect(await names(jsonPath('data', ['gt'], true, 'isnull'))).toEqual(['b']);
        expect(
          await Document.objects
            .exclude(jsonPath('data', ['in'], 1))
            .filter({ name__in: ['a', 'b'] })
            .count()
        ).toBe(1);
        expect(() => jsonPath('data', ['list', 2 ** 31], 1)).toThrow(QueryError);
        expect(() => jsonPath('data', [], 1)).toThrow(QueryError);
        expect(() => Document.objects.filter(jsonPath('name', ['x'], 1))).toThrow('is not a json field');
        const dotted = Document.objects.filter(jsonPath('data', ['x.y'], 1)).count();
        if (name === 'mongodb') await expect(dotted).rejects.toThrow(QueryError);
        else expect(await dotted).toBe(0);
      });
    });

    describe('keys to other fields', () => {
      it('points to a unique field with toField', async () => {
        const { Country, City } = models;
        const spain = await Country.objects.create({ code: 'ES', name: 'Spain' });
        await Country.objects.create({ code: 'FR', name: 'France' });
        const madrid = await City.objects.create({ name: 'Madrid', country: spain });
        await City.objects.create({ name: 'Paris', countryId: 'FR' });
        expect(madrid.countryId).toBe('ES');
        expect(madrid.country).toBe(spain);
        expect((await City.objects.filter({ country__name: 'France' }).first()).name).toBe('Paris');
        const [city] = await City.objects.selectRelated('country').filter({ name: 'Madrid' });
        expect(city.country.name).toBe('Spain');
        const [prefetched] = await City.objects.prefetchRelated('country').filter({ name: 'Paris' });
        expect(prefetched.country.code).toBe('FR');
        expect((await Country.objects.filter({ cities__name: 'Madrid' })).map((item) => item.code)).toEqual(['ES']);
        expect((await city.load('country')).code).toBe('ES');
      });
    });

    describe('types', () => {
      it('stores big integers, decimals, dates and bytes, and keys with their own attname', async () => {
        const { Ledger, Author } = models;
        const owner = await Author.objects.create({ name: 'Owner' });
        const big = 2n ** 60n;
        await Ledger.objects.create({
          big,
          amount: '1234.50',
          day: '2024-02-29',
          blob: Buffer.from([0, 1, 255]),
          owner,
        });
        await Ledger.objects.create({ big: 7, amount: 3, day: new Date(2024, 0, 5) });
        const [first, second] = await Ledger.objects.orderBy('pk');
        expect(first.big).toBe(big);
        expect(Number(first.amount)).toBe(1234.5);
        expect(first.day).toBe('2024-02-29');
        expect([...first.blob]).toEqual([0, 1, 255]);
        expect(first.owner_id).toBe(owner.pk);
        expect(second.big).toBe(7);
        expect(second.day).toBe('2024-01-05');
        expect(await Ledger.objects.filter({ day__gte: '2024-02-01' }).count()).toBe(1);
        expect(await Ledger.objects.filter({ owner__name: 'Owner' }).count()).toBe(1);
        expect(await Ledger.objects.filter({ owner_id: owner.pk }).count()).toBe(1);
        expect((await Ledger.objects.selectRelated('owner').get({ pk: first.pk })).owner.name).toBe('Owner');
        await Ledger.objects.all().delete();
      });
    });

    describe('lookups', () => {
      it('filters by equality and comparisons', async () => {
        const { Book } = models;
        await seed();
        expect(titles(await Book.objects.filter({ pages__gt: 200 }).orderBy('pages'))).toEqual([
          'Compilers',
          'The Analytical Engine',
        ]);
        expect(await Book.objects.filter({ pages__gte: 120, pages__lte: 250 }).count()).toBe(2);
        expect(await Book.objects.filter({ pages__lt: 250 }).count()).toBe(1);
        expect(await Book.objects.filter({ pages__range: [100, 260] }).count()).toBe(2);
        expect(await Book.objects.filter({ pages__in: [120, 300, 7] }).count()).toBe(2);
        expect(await Book.objects.filter({ pages__in: [] }).count()).toBe(0);
        expect(await Book.objects.filter({ rating: 5 }).count()).toBe(1);
      });

      it('filters with LIKE patterns', async () => {
        const { Book, Author } = models;
        await seed();
        expect(await Book.objects.filter({ title__like: 'Comp%' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__like: 'comp%' }).count()).toBe(0);
        expect(await Book.objects.filter({ title__ilike: 'comp%' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__like: '%Engine' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__like: 'C%s' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: 'Compiler_' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: 'Compiler' }).count()).toBe(0);
        expect(await Book.objects.filter({ title__like: '%' }).count()).toBe(4);
        // Escaped wildcards and the characters of GLOB and regular expressions are plain characters.
        await Book.objects.create({ title: '100% [a.b]*_?', author: (await Author.objects.first()).pk });
        expect(await Book.objects.filter({ title__like: String.raw`100\% [a.b]*\_?` }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: String.raw`%\%%` }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: String.raw`1_0\%%` }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: '%[a.b]%' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__like: '%a*b%' }).count()).toBe(0);
        expect(await Book.objects.exclude({ title__ilike: '%ENGINE%' }).count()).toBe(3);
        expect(await Book.objects.filter({ title__regex: '^Comp.*s$' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__regex: 'engine' }).count()).toBe(0);
        expect(await Book.objects.filter({ title__iregex: 'ENGINE$' }).count()).toBe(2);
      });

      it('filters nulls', async () => {
        const { Book, Author } = models;
        await seed();
        expect(titles(await Book.objects.filter({ pages: null }))).toEqual(['Computing Machinery']);
        expect(await Book.objects.filter({ pages__isnull: true }).count()).toBe(1);
        expect(await Book.objects.filter({ pages__isnull: false }).count()).toBe(3);
        expect(await Author.objects.filter({ publisher: null }).count()).toBe(1);
      });

      it('filters strings, with and without case', async () => {
        const { Book, Author } = models;
        await seed();
        expect(await Book.objects.filter({ title__contains: 'Engine' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__contains: 'engine' }).count()).toBe(0);
        expect(await Book.objects.filter({ title__icontains: 'ENGINE' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__startswith: 'Comp' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__startswith: 'comp' }).count()).toBe(0);
        expect(await Book.objects.filter({ title__istartswith: 'comp' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__endswith: 'Engine' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__iendswith: 'ENGINE' }).count()).toBe(2);
        expect(await Book.objects.filter({ title__contains: '' }).count()).toBe(4);
        expect(await Author.objects.filter({ email__iexact: 'ALAN@example.com' }).count()).toBe(1);
        expect(await Author.objects.filter({ email: 'alan@example.com' }).count()).toBe(0);
        // Characters special in LIKE patterns and regular expressions are plain characters.
        await Book.objects.create({ title: '100% (a.b)*_', author: (await Author.objects.first()).pk });
        expect(await Book.objects.filter({ title__contains: '% (a.b)*_' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__icontains: '_' }).count()).toBe(1);
        expect(await Book.objects.filter({ title__startswith: '100%' }).count()).toBe(1);
      });

      it('filters booleans, dates and json', async () => {
        const { Author, Book } = models;
        const { ada } = await seed();
        expect(await Author.objects.filter({ active: false }).count()).toBe(1);
        expect(await Author.objects.filter({ active: 'true' }).count()).toBe(2);
        expect(await Author.objects.filter({ createdAt__gte: ada.createdAt }).count()).toBe(3);
        expect(await Author.objects.filter({ createdAt__lt: new Date(0) }).count()).toBe(0);
        expect(await Author.objects.filter({ createdAt__gt: '2000-01-01T00:00:00Z' }).count()).toBe(3);
        expect(await Book.objects.filter({ tags: ['math'] }).count()).toBe(1);
      });

      it('combines conditions with Q, or and not', async () => {
        const { Book } = models;
        await seed();
        expect(titles(await Book.objects.filter(or({ pages__lt: 150 }, { rating: 5 })).orderBy('title'))).toEqual([
          'Computing Machinery',
          'Notes on the Engine',
        ]);
        expect(await Book.objects.filter(new Q({ pages__gt: 100 }).and({ rating__gt: 4 })).count()).toBe(1);
        expect(await Book.objects.filter(not({ title__contains: 'Engine' })).count()).toBe(2);
        expect(await Book.objects.filter(new Q({ title__contains: 'Engine' }).not()).count()).toBe(2);
      });

      it('excludes rows with nulls as Django does', async () => {
        const { Book } = models;
        await seed();
        // A null is not greater than 200, so the book without pages is not excluded.
        expect(titles(await Book.objects.exclude({ pages__gt: 200 }).orderBy('title'))).toEqual([
          'Computing Machinery',
          'Notes on the Engine',
        ]);
        expect(await Book.objects.exclude({ rating: 3.5 }).count()).toBe(3);
        expect(await Book.objects.exclude({ pages: null }).count()).toBe(3);
        expect(await Book.objects.exclude({ pages__in: [120] }).count()).toBe(3);
      });

      it('filters across relations', async () => {
        const { Book, Author } = models;
        await seed();
        expect(titles(await Book.objects.filter({ author__name: 'Ada' }).orderBy('title'))).toEqual([
          'Notes on the Engine',
          'The Analytical Engine',
        ]);
        expect(await Book.objects.filter({ author__publisher__name: 'Penguin' }).count()).toBe(3);
        expect(await Book.objects.filter({ author__publisher__isnull: true }).count()).toBe(1);
        expect(await Book.objects.exclude({ author__publisher__name: 'Penguin' }).count()).toBe(1);
        const ada = await Author.objects.get({ name: 'Ada' });
        expect(await Book.objects.filter({ author: ada }).count()).toBe(2);
        expect(await Book.objects.filter({ author__id: ada.pk }).count()).toBe(2);
        expect(await Book.objects.filter({ authorId: ada.pk }).count()).toBe(2);
        expect(await Book.objects.filter({ author__in: [ada] }).count()).toBe(2);
      });

      it('filters across reverse relations, without duplicates', async () => {
        const { Author, Book, Publisher } = models;
        const { ada, books } = await seed();
        const names = (authors) => authors.map((author) => author.name);
        expect(names(await Author.objects.filter({ books__title__contains: 'Engine' }))).toEqual(['Ada']);
        expect(await Author.objects.filter({ books__pages__gte: 100 }).count()).toBe(2);
        // Conditions of one filter() are of the same book; those of chained filters, of any book.
        expect(await Author.objects.filter({ books__title__contains: 'Notes', books__pages__gt: 200 }).count()).toBe(0);
        expect(
          names(await Author.objects.filter({ books__title__contains: 'Notes' }).filter({ books__pages__gt: 200 }))
        ).toEqual(['Ada']);
        expect(names(await Author.objects.exclude({ books__pages__gt: 200 }))).toEqual(['Alan']);
        expect(names(await Author.objects.filter({ books: books[2] }))).toEqual(['Grace']);
        expect(names(await Author.objects.filter({ books__in: [books[2], books[3]] }))).toEqual(['Alan', 'Grace']);
        expect(names(await Author.objects.filter(or({ books__rating: 5 }, { name: 'Grace' })))).toEqual([
          'Alan',
          'Grace',
        ]);
        await Author.objects.create({ name: 'Bookless' });
        expect(names(await Author.objects.filter({ books__isnull: true }))).toEqual(['Bookless']);
        expect(await Author.objects.filter({ books__isnull: false }).count()).toBe(3);
        // Forward then reverse, and reverse of reverse.
        expect(await Book.objects.filter({ author__books__pages: 300 }).count()).toBe(2);
        expect((await Publisher.objects.filter({ authors__books__rating__gte: 5 })).map((p) => p.name)).toEqual([
          'Penguin',
        ]);
        expect(await Publisher.objects.filter({ authors__books__rating__gte: 6 }).count()).toBe(0);
        // Writes with them.
        expect(await Author.objects.filter({ books__pages__gt: 250 }).update({ active: false })).toBe(1);
        expect((await Author.objects.get({ pk: ada.pk })).active).toBe(false);
        expect(await Book.objects.filter({ author__books__title: 'Compilers' }).delete()).toBe(1);
        expect(() => Author.objects.orderBy('books__title')).not.toThrow();
        await expect(Author.objects.orderBy('books__title').fetch()).rejects.toThrow(
          'can only be followed in conditions'
        );
      });

      it('compares fields with F', async () => {
        const { Book } = models;
        await seed();
        await Book.objects.filter({ title: 'Compilers' }).update({ rating: 250 });
        expect(titles(await Book.objects.filter({ rating: F('pages') }))).toEqual(['Compilers']);
        expect(await Book.objects.filter({ pages__gt: F('rating').mul(20) }).count()).toBe(2);
        expect(await Book.objects.exclude({ rating: F('pages') }).count()).toBe(3);
      });

      it('rejects unknown fields and lookups', async () => {
        const { Book } = models;
        expect(() => Book.objects.filter({ name: 'x' })).toThrow(FieldError);
        expect(() => Book.objects.filter({ pages__icontains: 'x' })).toThrow(LookupError);
        expect(() => Book.objects.filter({ pages__whatever: 1 })).toThrow(LookupError);
        expect(() => Book.objects.filter({ pages__gt: null })).toThrow(QueryError);
        expect(() => Book.objects.filter({ pages: 'many' })).toThrow(QueryError);
      });
    });

    describe('querysets', () => {
      it('orders, limits and slices', async () => {
        const { Book, Author } = models;
        await seed();
        expect(titles(await Book.objects.orderBy('-pages'))).toEqual([
          'The Analytical Engine',
          'Compilers',
          'Notes on the Engine',
          'Computing Machinery',
        ]);
        expect(titles(await Book.objects.orderBy('pages').limit(2))).toEqual([
          'Computing Machinery',
          'Notes on the Engine',
        ]);
        expect(titles(await Book.objects.orderBy('pages').offset(3))).toEqual(['The Analytical Engine']);
        expect(titles(await Book.objects.orderBy('pages').slice(1, 3))).toEqual(['Notes on the Engine', 'Compilers']);
        expect((await Author.objects).map((author) => author.name)).toEqual(['Ada', 'Alan', 'Grace']);
        expect(titles(await Book.objects.orderBy('author__name', '-pages'))).toEqual([
          'The Analytical Engine',
          'Notes on the Engine',
          'Computing Machinery',
          'Compilers',
        ]);
        expect(await Book.objects.orderBy('pages').limit(2).count()).toBe(2);
        expect(await Book.objects.offset(3).count()).toBe(1);
      });

      it('orders NULLs first going up and last going down; columns that cannot be NULL alike', async () => {
        const { Book, Author } = models;
        const author = await Author.objects.create({ name: 'Ada' });
        for (const [title, rating] of [
          ['b', 2],
          ['d', null],
          ['a', 1],
          ['c', null],
        ]) {
          await Book.objects.create({ title, rating, author });
        }
        expect(titles(await Book.objects.orderBy('rating', 'title'))).toEqual(['c', 'd', 'a', 'b']);
        expect(titles(await Book.objects.orderBy('-rating', '-title'))).toEqual(['b', 'a', 'd', 'c']);
        expect(titles(await Book.objects.orderBy('title'))).toEqual(['a', 'b', 'c', 'd']);
        expect(titles(await Book.objects.orderBy('-title').limit(2))).toEqual(['d', 'c']);
      });

      it('pages by keys (KeysetPaginator): every object once, forwards and back, ties and NULLs by their order', async () => {
        const { Book, Author } = models;
        const { KeysetPaginator } = await import('../index.js');
        const author = await Author.objects.create({ name: 'Ada' });
        // Titles repeated (ties end by the key) and ratings that may be NULL.
        for (let i = 0; i < 23; i += 1) {
          await Book.objects.create({ title: `t${i % 7}`, rating: i % 4 === 0 ? null : i % 5, author });
        }
        const walk = async (queryset, perPage) => {
          const all = (await queryset.orderBy(...queryset.state.orderBy, 'pk')).map((book) => book.pk);
          const paginator = new KeysetPaginator(queryset, perPage);
          const pages = [];
          let page = await paginator.page();
          pages.push(page);
          while (page.hasNext) {
            page = await paginator.page(page.nextCursor);
            pages.push(page);
          }
          expect(pages.flatMap((p) => p.objectList.map((book) => book.pk))).toEqual(all);
          expect(pages.every((p) => p.objectList.length === perPage || p === pages[pages.length - 1])).toBe(true);
          // Back from the last page: the same pages, in reverse.
          const back = [page.objectList.map((book) => book.pk)];
          while (page.hasPrevious) {
            page = await paginator.page(page.previousCursor);
            back.unshift(page.objectList.map((book) => book.pk));
          }
          expect(back).toEqual(pages.map((p) => p.objectList.map((book) => book.pk)));
          return pages.length;
        };
        expect(await walk(Book.objects.orderBy('title'), 5)).toBe(5);
        expect(await walk(Book.objects.orderBy('-title'), 4)).toBe(6);
        expect(await walk(Book.objects.orderBy('rating', '-title'), 6)).toBe(4);
        expect(await walk(Book.objects.orderBy('-rating'), 7)).toBe(4);
        expect(await walk(Book.objects.filter({ title: 't3' }).orderBy('title'), 10)).toBe(1);
        const paginator = new KeysetPaginator(Book.objects.orderBy('title'), 5);
        await expect(paginator.page('not-a-cursor')).rejects.toMatchObject({ statusCode: 404 });
        expect(() => new KeysetPaginator(Book.objects.orderBy('author__name'), 5)).toThrow(/no relations/);
      });

      it('pages far into the rows (OFFSET of 100 and more) as the near ones, relations loaded', async () => {
        const { Book, Author } = models;
        const authors = [await Author.objects.create({ name: 'Ada' }), await Author.objects.create({ name: 'Alan' })];
        await Book.objects.bulkCreate(
          Array.from({ length: 140 }, (_, i) => ({
            title: `t${String(i % 37).padStart(2, '0')}`,
            author: authors[i % 2],
          }))
        );
        const all = (await Book.objects.selectRelated('author').orderBy('title', 'pk')).map((b) => [
          b.pk,
          b.author.name,
        ]);
        for (const from of [0, 99, 100, 125, 135]) {
          const page = await Book.objects
            .selectRelated('author')
            .orderBy('title', 'pk')
            .slice(from, from + 10);
          expect(page.map((b) => [b.pk, b.author.name])).toEqual(all.slice(from, from + 10));
        }
        const filtered = await Book.objects.filter({ author: authors[1] }).orderBy('-title', 'pk').slice(100, 110);
        expect(filtered.length).toBe(0);
        const descending = await Book.objects.orderBy('-title', '-pk').slice(110, 115);
        expect(descending.map((b) => b.pk)).toEqual(
          [...all]
            .reverse()
            .slice(110, 115)
            .map(([pk]) => pk)
        );
      });

      it('limits every group (limitPer)', async () => {
        const { Book } = models;
        await seed();
        // The longest book of each author, in the order of the query.
        expect(titles(await Book.objects.orderBy('-pages').limitPer('author', 1))).toEqual([
          'The Analytical Engine',
          'Compilers',
          'Computing Machinery',
        ]);
        expect(titles(await Book.objects.orderBy('-pages').limitPer('author', 1, 1))).toEqual(['Notes on the Engine']);
        expect(titles(await Book.objects.orderBy('-pages').limitPer('author', 2).limit(2))).toEqual([
          'The Analytical Engine',
          'Compilers',
        ]);
        expect(
          titles(await Book.objects.filter({ title__contains: 'Engine' }).orderBy('pages').limitPer('author', 1))
        ).toEqual(['Notes on the Engine']);
        expect(await Book.objects.orderBy('-pages').limitPer('author', 1).count()).toBe(3);
        expect(await Book.objects.limitPer('author', 0).exists()).toBe(false);
        expect(() => Book.objects.limitPer('author', -1)).toThrow(QueryError);
        await expect(Book.objects.limitPer('author', 1).delete()).rejects.toThrow(QueryError);
      });

      it('gets one object', async () => {
        const { Book } = models;
        await seed();
        expect((await Book.objects.get({ pages: 300 })).title).toBe('The Analytical Engine');
        await expect(Book.objects.get({ pages: 1 })).rejects.toBeInstanceOf(NotFoundError);
        await expect(Book.objects.get({ title__contains: 'Engine' })).rejects.toBeInstanceOf(MultipleObjectsError);
        expect((await Book.objects.orderBy('pages').first()).title).toBe('Computing Machinery');
        expect((await Book.objects.orderBy('pages').last()).title).toBe('The Analytical Engine');
        expect(await Book.objects.filter({ pages: 1 }).first()).toBeNull();
        expect(await Book.objects.filter({ pages: 300 }).exists()).toBe(true);
      });

      it('iterates', async () => {
        const { Book } = models;
        await seed();
        const seen = [];
        for await (const book of Book.objects.orderBy('title')) seen.push(book.title);
        expect(seen).toHaveLength(4);
        expect(seen[0]).toBe('Compilers');
      });

      it('gives values and lists of values', async () => {
        const { Book } = models;
        await seed();
        expect(await Book.objects.filter({ pages: 300 }).values('title', 'author__name')).toEqual([
          { title: 'The Analytical Engine', author__name: 'Ada' },
        ]);
        expect(await Book.objects.orderBy('title').valuesList('pages', { flat: true })).toEqual([250, null, 120, 300]);
        expect(await Book.objects.filter({ pages: 120 }).valuesList('title', 'rating')).toEqual([
          ['Notes on the Engine', 4.5],
        ]);
        const [all] = await Book.objects.filter({ pages: 120 }).values();
        expect(Object.keys(all).sort()).toEqual(['authorId', 'id', 'pages', 'rating', 'tags', 'title', 'updatedAt']);
      });

      it('loads only some fields', async () => {
        const { Book } = models;
        await seed();
        const [book] = await Book.objects.filter({ pages: 120 }).only('title');
        expect(book.title).toBe('Notes on the Engine');
        expect(book.pk).not.toBeNull();
        expect(book.pages).toBeUndefined();
      });

      it('selects related objects', async () => {
        const { Book } = models;
        await seed();
        const books = await Book.objects.selectRelated('author__publisher').orderBy('title');
        expect(books[0].author.name).toBe('Grace');
        expect(books[0].author.publisher).toBeNull();
        expect(books[1].author.name).toBe('Alan');
        expect(books[1].author.publisher.name).toBe('Penguin');
        expect(books[1].author.publisher).toBeInstanceOf(models.Publisher);
      });

      it('prefetches related objects', async () => {
        const { Author, Book } = models;
        await seed();
        const authors = await Author.objects.prefetchRelated('books', 'publisher');
        expect(authors.map((author) => author.name)).toEqual(['Ada', 'Alan', 'Grace']);
        expect(titles(await authors[0].books).sort()).toEqual(['Notes on the Engine', 'The Analytical Engine']);
        expect(authors[0].publisher.name).toBe('Penguin');
        expect(authors[2].publisher).toBeNull();
        const books = await Book.objects.prefetchRelated('author');
        expect(books.every((book) => book.author instanceof Author)).toBe(true);
        // Loaded relations are read without waiting (templates: {{#each author.books as book}}); others say how.
        expect(titles([...authors[0].books]).sort()).toEqual(['Notes on the Engine', 'The Analytical Engine']);
        expect(() => [...books[0].author.books]).toThrow('await it, or load the relation (prefetchRelated)');
        // Paths: the books of each author, then the author of each of those books (once each).
        const nested = await Book.objects.orderBy('title').prefetchRelated('author__books', 'author');
        const loaded = nested.find((book) => book.author && book.author.name === 'Ada');
        expect(titles([...loaded.author.books]).sort()).toEqual(['Notes on the Engine', 'The Analytical Engine']);
      });

      it('follows reverse relations', async () => {
        const { Author, Publisher } = models;
        const { ada, penguin } = await seed();
        expect(await ada.books.count()).toBe(2);
        expect(titles(await ada.books.filter({ pages__gt: 200 }))).toEqual(['The Analytical Engine']);
        const created = await ada.books.create({ title: 'Sketch' });
        expect(created.authorId).toBe(ada.pk);
        expect(await ada.books.count()).toBe(3);
        expect((await penguin.authors).map((author) => author.name)).toEqual(['Ada', 'Alan']);
        const loaded = await Publisher.objects.get({ pk: penguin.pk });
        expect(await loaded.load('authors')).toHaveLength(2);
        const book = await created.load('author');
        expect(book).toBeInstanceOf(Author);
        expect(created.author.name).toBe('Ada');
      });

      it('gets or creates', async () => {
        const { Publisher } = models;
        const [first, created] = await Publisher.objects.getOrCreate({ name: 'Orbit' });
        expect(created).toBe(true);
        const [second, again] = await Publisher.objects.getOrCreate({ name: 'Orbit' });
        expect(again).toBe(false);
        expect(second.pk).toBe(first.pk);
        const [, updated] = await Publisher.objects.updateOrCreate({ name: 'Orbit' }, { name: 'Orbit Books' });
        expect(updated).toBe(false);
        expect(await Publisher.objects.filter({ name: 'Orbit Books' }).count()).toBe(1);
      });
    });

    describe('many-to-many relations', () => {
      it('links, unlinks and follows them both ways', async () => {
        const { Book, Tag } = models;
        const { books } = await seed();
        const [math, code, history] = await Tag.objects.bulkCreate([
          { name: 'math' },
          { name: 'code' },
          { name: 'history' },
        ]);
        const [notes, engine, compilers] = books;
        await notes.labels.add(math, history);
        await notes.labels.add(math.pk);
        await engine.labels.add([math, code]);
        await compilers.labels.set([code]);
        const names = (items) => items.map((item) => item.name);
        expect(names(await notes.labels)).toEqual(['history', 'math']);
        expect(await notes.labels.count()).toBe(2);
        expect(names(await notes.labels.filter({ name__startswith: 'm' }))).toEqual(['math']);
        expect((await math.books.orderBy('title')).map((book) => book.title)).toEqual([
          'Notes on the Engine',
          'The Analytical Engine',
        ]);
        // Conditions through them, both ways, without duplicates.
        expect(await Book.objects.filter({ labels__name: 'math' }).count()).toBe(2);
        expect(await Book.objects.filter({ labels: code }).count()).toBe(2);
        expect(await Book.objects.filter({ labels__in: [math, code] }).count()).toBe(3);
        expect(await Book.objects.filter({ labels__isnull: true }).count()).toBe(1);
        expect(await Book.objects.exclude({ labels__name: 'code' }).count()).toBe(2);
        expect(names(await Tag.objects.filter({ books__author__name: 'Ada' }))).toEqual(['code', 'history', 'math']);
        expect(names(await Tag.objects.filter({ books__pages__gt: 200 }))).toEqual(['code', 'math']);
        // set() keeps the links given and removes the rest.
        await notes.labels.set([history, code]);
        expect(names(await notes.labels)).toEqual(['code', 'history']);
        await notes.labels.remove(history);
        expect(names(await notes.labels)).toEqual(['code']);
        await notes.labels.clear();
        expect(await notes.labels.count()).toBe(0);
        expect(await math.books.count()).toBe(1);
      });

      it('prefetches them, and gives them in JSON', async () => {
        const { Book, Tag } = models;
        const { books } = await seed();
        const [math, code] = await Tag.objects.bulkCreate([{ name: 'math' }, { name: 'code' }]);
        await books[0].labels.add(math, code);
        await books[1].labels.add(math);
        const loaded = await Book.objects.orderBy('title').prefetchRelated('labels');
        const byTitle = Object.fromEntries(loaded.map((book) => [book.title, book]));
        expect((await byTitle['Notes on the Engine'].labels).map((tag) => tag.name).sort()).toEqual(['code', 'math']);
        expect(await byTitle.Compilers.labels).toEqual([]);
        expect([...byTitle['Notes on the Engine'].labels].map((tag) => tag.name).sort()).toEqual(['code', 'math']);
        expect(JSON.parse(JSON.stringify(byTitle['The Analytical Engine'])).labels).toEqual([
          { id: math.pk, name: 'math' },
        ]);
        const tags = await Tag.objects.prefetchRelated('books');
        expect(tags.find((tag) => tag.name === 'math').books.cache).toHaveLength(2);
      });

      it('relates a model to itself, and removes the links of deleted objects', async () => {
        const { Author, Book, Tag } = models;
        const { ada, grace, alan, books } = await seed();
        await ada.friends.add(grace, alan);
        await grace.friends.add(alan);
        expect((await ada.friends).map((author) => author.name)).toEqual(['Alan', 'Grace']);
        expect((await alan.friendOf).map((author) => author.name)).toEqual(['Ada', 'Grace']);
        expect(await Author.objects.filter({ friends__name: 'Alan' }).count()).toBe(2);
        const tag = await Tag.objects.create({ name: 'gone' });
        await books[0].labels.add(tag);
        await tag.delete();
        expect(await books[0].labels.count()).toBe(0);
        await alan.delete();
        expect((await ada.friends).map((author) => author.name)).toEqual(['Grace']);
        await Book.objects.filter({ author: ada }).delete();
        expect(() => new Author({ name: 'x', friends: [] })).toThrow('many-to-many');
      });
    });

    describe('conflicts', () => {
      it('ignores or updates the rows that break unique keys (SQL databases)', async () => {
        const { Publisher } = models;
        if (!db.backend.dialect) {
          await expect(Publisher.objects.bulkCreate([{ name: 'X' }], { ignoreConflicts: true })).rejects.toThrow(
            'not supported'
          );
          return;
        }
        const [penguin] = await Publisher.objects.bulkCreate([{ name: 'Penguin' }, { name: 'Orbit' }]);
        const ignored = await Publisher.objects.bulkCreate([{ name: 'Penguin' }, { name: 'Tor' }], {
          ignoreConflicts: true,
        });
        expect(await Publisher.objects.count()).toBe(3);
        expect(ignored[1].pk === null || typeof ignored[1].pk === 'number' || typeof ignored[1].pk === 'string').toBe(
          true
        );
        // Upsert by the primary key: the row there is updated, the new one inserted.
        const updated = await Publisher.objects.bulkCreate(
          [{ id: penguin.pk, name: 'Penguin Books' }, { name: 'Ace' }],
          {
            updateConflicts: true,
            updateFields: ['name'],
          }
        );
        expect(updated[0].pk).toBe(penguin.pk);
        expect((await Publisher.objects.get({ pk: penguin.pk })).name).toBe('Penguin Books');
        expect(await Publisher.objects.count()).toBe(4);
        // On another unique field.
        await Publisher.objects.bulkCreate([{ name: 'Ace' }], {
          updateConflicts: true,
          uniqueFields: ['name'],
          updateFields: ['name'],
        });
        expect(await Publisher.objects.count()).toBe(4);
      });
    });

    describe('writes', () => {
      it('updates many objects, with F expressions', async () => {
        const { Book } = models;
        await seed();
        expect(await Book.objects.filter({ author__name: 'Ada' }).update({ pages: F('pages').add(10) })).toBe(2);
        expect(await Book.objects.orderBy('title').valuesList('pages', { flat: true })).toEqual([250, null, 130, 310]);
        expect(await Book.objects.filter({ pages: null }).update({ pages: 1, rating: 1.5 })).toBe(1);
        expect(await Book.objects.filter({ rating: 1.5 }).count()).toBe(1);
        await expect(Book.objects.update({ pages: -3 })).rejects.toBeInstanceOf(ValidationError);
        expect(() => Book.objects.limit(1).update({ pages: 3 })).rejects.toBeInstanceOf(QueryError);
      });

      it('deletes many objects, across relations', async () => {
        const { Book } = models;
        await seed();
        expect(await Book.objects.filter({ author__name: 'Ada' }).delete()).toBe(2);
        expect(await Book.objects.count()).toBe(2);
      });

      it('cascades, sets null and protects on delete', async () => {
        const { Author, Book, Review, Publisher } = models;
        const { ada, penguin, books } = await seed();
        await ada.delete();
        expect(await Book.objects.count()).toBe(2);
        await penguin.delete();
        expect(await Publisher.objects.count()).toBe(0);
        expect(await Author.objects.filter({ publisher__isnull: true }).count()).toBe(2);
        const review = await Review.objects.create({ book: books[2], stars: 4 });
        const protectedErr = await books[2].delete().catch((err) => err);
        expect(protectedErr).toBeInstanceOf(ProtectedError);
        // As Django's protected_objects: what keeps it.
        expect(protectedErr.relation).toBe('Review.book');
        expect((await protectedErr.protectedObjects).map((item) => item.pk)).toEqual([review.pk]);
        expect(await Book.objects.count()).toBe(2);
        await review.delete();
        await books[2].delete();
        expect(await Book.objects.count()).toBe(1);
      });

      it('cascades on relations to the same model', async () => {
        const { Category } = models;
        const root = await Category.objects.create({ name: 'root' });
        const child = await Category.objects.create({ name: 'child', parent: root });
        await Category.objects.create({ name: 'grandchild', parent: child });
        await Category.objects.create({ name: 'other' });
        expect(await root.children.count()).toBe(1);
        expect(await Category.objects.filter({ parent__parent__name: 'root' }).count()).toBe(1);
        await root.delete();
        expect(await Category.objects.valuesList('name', { flat: true })).toEqual(['other']);
      });

      it(
        'creates many in bulk, with every type (COPY in PostgreSQL)',
        async () => {
          const { Author, Book, Publisher } = models;
          const publisher = await Publisher.objects.create({ name: 'Bulk' });
          const authors = await Author.objects.bulkCreate(
            Array.from({ length: 1200 }, (_, i) => ({
              name: `Author ${i}`,
              email: i % 3 ? `a${i}@x.com` : null,
              publisher: i % 2 ? publisher : null,
            }))
          );
          expect(new Set(authors.map((author) => author.pk)).size).toBe(1200);
          const books = await Book.objects.bulkCreate(
            authors.map((author, i) => ({
              title: `Book ${i}`,
              pages: i + 1,
              rating: i / 2,
              author,
              tags: [`t${i}`, { n: i }],
            }))
          );
          expect(books).toHaveLength(1200);
          const loaded = await Book.objects.selectRelated('author').get({ pk: books[777].pk });
          expect(loaded.title).toBe('Book 777');
          expect(loaded.pages).toBe(778);
          expect(loaded.rating).toBe(388.5);
          expect(loaded.tags).toEqual(['t777', { n: 777 }]);
          expect(loaded.updatedAt).toBeInstanceOf(Date);
          expect(loaded.author.name).toBe('Author 777');
          expect(loaded.author.publisherId).toBe(publisher.pk);
          expect(await Author.objects.filter({ email: null }).count()).toBe(400);
          // Objects created after a bulk insert get keys of their own.
          const next = await Author.objects.create({ name: 'After' });
          expect(authors.some((author) => author.pk === next.pk)).toBe(false);
        },
        options.bulkTimeout
      );

      it('creates in bulk', async () => {
        const { Publisher } = models;
        const items = Array.from({ length: 250 }, (_, i) => ({ name: `P${i}` }));
        const created = await Publisher.objects.bulkCreate(items);
        expect(created).toHaveLength(250);
        expect(new Set(created.map((item) => item.pk)).size).toBe(250);
        const loaded = await Publisher.objects.get({ name: 'P123' });
        expect(loaded.pk).toBe(created[123].pk);
      });
    });

    describe('aggregates', () => {
      it('aggregates a query', async () => {
        const { Book } = models;
        await seed();
        const result = await Book.objects.aggregate({
          books: Count(),
          withPages: Count('pages'),
          pages: Sum('pages'),
          average: Avg('rating'),
          shortest: Min('pages'),
          longest: Max('pages'),
          authors: Count('author', { distinct: true }),
        });
        expect(result).toEqual({
          books: 4,
          withPages: 3,
          pages: 670,
          average: 13 / 3,
          shortest: 120,
          longest: 300,
          authors: 3,
        });
        expect(await Book.objects.filter({ pages: 1 }).aggregate({ n: Count(), pages: Sum('pages') })).toEqual({
          n: 0,
          pages: null,
        });
      });

      it('aggregates across reverse relations (in SQL; computed by the ORM in the other backends)', async () => {
        const { Author, Publisher } = models;
        await seed();
        const counted = Author.objects
          .values('name')
          .annotate({ books: Count('books'), pages: Sum('books__pages') })
          .orderBy('name');
        expect(await counted).toEqual([
          { name: 'Ada', books: 2, pages: 420 },
          { name: 'Alan', books: 1, pages: null },
          { name: 'Grace', books: 1, pages: 250 },
        ]);
        // Two reverse relations deep, and authors without books.
        await Author.objects.create({ name: 'Zoe' });
        const byPublisher = await Publisher.objects.values('name').annotate({ books: Count('authors__books') });
        expect(byPublisher).toEqual([{ name: 'Penguin', books: 3 }]);
        const zoe = await Author.objects
          .filter({ name: 'Zoe' })
          .values('name')
          .annotate({ books: Count('books') });
        expect(zoe).toEqual([{ name: 'Zoe', books: 0 }]);
        expect(await Author.objects.aggregate({ books: Count('books'), longest: Max('books__pages') })).toEqual({
          books: 4,
          longest: 300,
        });
      });

      it('annotate() of objects: each with its aggregates, ordered and sliced by them', async () => {
        const { Author } = models;
        await seed();
        await Author.objects.create({ name: 'Zoe' });
        const authors = await Author.objects
          .annotate({ numBooks: Count('books'), pages: Sum('books__pages') })
          .orderBy('name');
        expect(authors.every((author) => author instanceof Author)).toBe(true);
        expect(authors.map((author) => [author.name, author.numBooks, author.pages])).toEqual([
          ['Ada', 2, 420],
          ['Alan', 1, null],
          ['Grace', 1, 250],
          ['Zoe', 0, null],
        ]);
        const top = await Author.objects
          .annotate({ numBooks: Count('books') })
          .orderBy('-numBooks', 'name')
          .limit(2);
        expect(top.map((author) => [author.name, author.numBooks])).toEqual([
          ['Ada', 2],
          ['Alan', 1],
        ]);
        const filtered = await Author.objects.filter({ name__startswith: 'G' }).annotate({ numBooks: Count('books') });
        expect(filtered.map((author) => [author.name, author.numBooks])).toEqual([['Grace', 1]]);
        await expect(Author.objects.annotate({ books: Count('books') })).rejects.toThrow('conflicts with a field');
      });

      it('groups with values and annotate', async () => {
        const { Book } = models;
        await seed();
        const rows = await Book.objects
          .values('author__name')
          .annotate({ books: Count(), pages: Sum('pages') })
          .orderBy('-books', 'author__name');
        expect(rows).toEqual([
          { author__name: 'Ada', books: 2, pages: 420 },
          { author__name: 'Alan', books: 1, pages: null },
          { author__name: 'Grace', books: 1, pages: 250 },
        ]);
        const latest = await Book.objects.values('author__name').annotate({ last: Max('updatedAt') });
        expect(latest.every((row) => row.last instanceof Date)).toBe(true);
      });
    });

    describe('transactions', () => {
      it('commits and rolls back', async ({ skip }) => {
        // MongoDB has transactions on replica sets and sharded clusters only.
        if (db.backend.supportsTransactions === false) skip();
        const { Publisher } = models;
        await db.transaction(async () => {
          await Publisher.objects.create({ name: 'Committed' });
        });
        await expect(
          db.transaction(async () => {
            await Publisher.objects.create({ name: 'Rolled back' });
            throw new Error('boom');
          })
        ).rejects.toThrow('boom');
        expect(await Publisher.objects.valuesList('name', { flat: true })).toEqual(['Committed']);
      });

      it('nests transactions as savepoints', async ({ skip }) => {
        // MongoDB has transactions on replica sets and sharded clusters only.
        if (db.backend.supportsTransactions === false) skip();
        const { Publisher } = models;
        const outer = db.transaction(async () => {
          await Publisher.objects.create({ name: 'Outer' });
          await db
            .transaction(async () => {
              await Publisher.objects.create({ name: 'Inner' });
              throw new Error('inner');
            })
            .catch(() => {});
        });
        if (db.backend.supportsSavepoints === false) {
          // Without savepoints, the failure inside rolls back the whole transaction.
          await expect(outer).rejects.toThrow('a transaction inside it failed');
          expect(await Publisher.objects.count()).toBe(0);
          return;
        }
        await outer;
        expect(await Publisher.objects.valuesList('name', { flat: true })).toEqual(['Outer']);
      });

      it('runs savepoints made at the same time one after another', async ({ skip }) => {
        if (db.backend.supportsTransactions === false || db.backend.supportsSavepoints === false) skip();
        const { Publisher } = models;
        await db.transaction(async () => {
          const results = await Promise.allSettled(
            ['A', 'B', 'A', 'C'].map((name) =>
              db.transaction(async () => {
                if (await Publisher.objects.filter({ name }).exists()) throw new Error('taken');
                await Publisher.objects.create({ name });
                // A savepoint inside one.
                await db.transaction(() => Publisher.objects.filter({ name }).count());
              })
            )
          );
          expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
        });
        expect(await Publisher.objects.orderBy('name').valuesList('name', { flat: true })).toEqual(['A', 'B', 'C']);
      });

      it('keeps queries from outside out of a transaction', async ({ skip }) => {
        // MongoDB has transactions on replica sets and sharded clusters only.
        if (db.backend.supportsTransactions === false) skip();
        const { Publisher } = models;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const transaction = db
          .transaction(async () => {
            await Publisher.objects.create({ name: 'Inside' });
            await gate;
            throw new Error('rollback');
          })
          .catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 10));
        const outside = Publisher.objects.count();
        release();
        await transaction;
        expect(await outside).toBe(0);
      });
    });

    describe('schemas', () => {
      it('gives the JSON Schema of a model', () => {
        const { Book } = models;
        expect(Book.jsonSchema({ exclude: ['id', 'updatedAt'] })).toEqual({
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 200 },
            pages: { type: 'integer', minimum: 1, nullable: true },
            rating: { type: 'number', nullable: true },
            authorId: { type: ['integer', 'string'] },
            tags: {},
          },
          required: ['title', 'authorId'],
        });
      });
    });
  });

  // Composite primary keys: a model of its own database (MongoDB does not have them).
  describe(`${name} backend: composite primary keys`, () => {
    let db;
    let Student;
    let Enrollment;
    let Pair;
    let supported = true;

    beforeAll(async () => {
      Student = class Student extends Model {
        static fields = { name: fields.string() };

        static options = { table: 'cpk_student' };
      };
      // A key of a foreign key and a field (options.primaryKey).
      Enrollment = class Enrollment extends Model {
        static fields = {
          student: fields.foreignKey(() => Student, { relatedName: 'enrollments' }),
          course: fields.string({ maxLength: 20 }),
          grade: fields.integer({ null: true }),
        };

        static options = { table: 'cpk_enrollment', primaryKey: ['student', 'course'] };
      };
      // A key of two fields with primaryKey: true.
      Pair = class Pair extends Model {
        static fields = {
          left: fields.integer({ primaryKey: true }),
          right: fields.integer({ primaryKey: true }),
          label: fields.string({ null: true }),
        };

        static options = { table: 'cpk_pair' };
      };
      db = makeDatabase();
      db.register(Student, Enrollment, Pair);
      await db.connect();
      try {
        await db.drop();
        await db.sync();
      } catch (err) {
        if (!/not supported/.test(err.message)) throw err;
        supported = false;
      }
    });

    afterAll(async () => {
      if (!db) return;
      if (supported) await db.drop();
      await db.close();
    });

    it('has the key of several fields', async () => {
      expect(Enrollment.meta.pk.composite).toBe(true);
      expect(Enrollment.meta.pkFields.map((field) => field.name)).toEqual(['student', 'course']);
      expect(Pair.meta.pk.fields.map((field) => field.name)).toEqual(['left', 'right']);
      // No foreign key can point to it (but to a unique field).
      class Wrong extends Model {
        static fields = { pair: fields.foreignKey(() => Pair) };
      }
      expect(() => Wrong.meta.fields.find((field) => field.name === 'pair').targetField).toThrow('composite');
      if (!supported) {
        await expect(Pair.objects.create({ left: 1, right: 2 })).rejects.toThrow('not supported');
      }
    });

    it('creates, finds, updates and deletes by its key', async () => {
      if (!supported) return;
      await Enrollment.objects.delete();
      await Pair.objects.delete();
      await Student.objects.delete();
      const ada = await Student.objects.create({ name: 'Ada' });
      const alan = await Student.objects.create({ name: 'Alan' });
      const math = await Enrollment.objects.create({ student: ada, course: 'math', grade: 9 });
      expect(math.pk).toEqual([ada.pk, 'math']);
      await Enrollment.objects.bulkCreate([
        { student: ada, course: 'logic', grade: 7 },
        { student: alan, course: 'math', grade: 8 },
      ]);
      // The same course for two students: the key is both.
      expect(await Enrollment.objects.filter({ course: 'math' }).count()).toBe(2);
      expect((await Enrollment.objects.get({ pk: [alan.pk, 'math'] })).grade).toBe(8);
      expect((await Enrollment.objects.get({ pk: { student: ada.pk, course: 'logic' } })).grade).toBe(7);
      const some = await Enrollment.objects
        .filter({
          pk__in: [
            [ada.pk, 'math'],
            [alan.pk, 'math'],
          ],
        })
        .orderBy('pk');
      expect(some.map((item) => item.grade)).toEqual([9, 8]);
      expect(await Enrollment.objects.filter({ pk__in: [] }).count()).toBe(0);
      // Saves update the row of its key.
      math.grade = 10;
      await math.save();
      expect((await Enrollment.objects.get({ pk: math.pk })).grade).toBe(10);
      await math.refresh();
      expect(math.grade).toBe(10);
      // Writes through relations, and the objects of the relations.
      expect(await Enrollment.objects.filter({ student__name: 'Ada' }).update({ grade: 5 })).toBe(2);
      const joined = await Enrollment.objects.selectRelated('student').orderBy('-pk').first();
      expect(joined.student.name).toBe('Alan');
      expect(await ada.enrollments.count()).toBe(2);
      expect(await Student.objects.filter({ enrollments__course: 'logic' }).count()).toBe(1);
      // A key taken.
      await expect(Enrollment.objects.create({ student: ada, course: 'math' })).rejects.toThrow();
      await math.delete();
      expect(await Enrollment.objects.count()).toBe(2);
      expect(await Enrollment.objects.filter({ student__name: 'Ada' }).delete()).toBe(1);
      expect(await Enrollment.objects.count()).toBe(1);
      // Deleting the student deletes its enrollments (onDelete cascade of the ORM).
      await alan.delete();
      expect(await Enrollment.objects.count()).toBe(0);
    });

    it('keeps keys of plain fields', async () => {
      if (!supported) return;
      await Pair.objects.bulkCreate([
        { left: 1, right: 1, label: 'a' },
        { left: 1, right: 2, label: 'b' },
        { left: 2, right: 1, label: 'c' },
      ]);
      expect((await Pair.objects.orderBy('-pk').first()).label).toBe('c');
      expect((await Pair.objects.last()).label).toBe('c');
      const pair = await Pair.objects.get({ pk: [1, 2] });
      pair.pk = [3, 3];
      expect(pair.left).toBe(3);
      expect(await Pair.objects.filter({ left: 1 }).values('label').orderBy('pk')).toEqual([
        { label: 'a' },
        { label: 'b' },
      ]);
      expect(await Pair.objects.filter({ pk: [2, 1] }).exists()).toBe(true);
      await Pair.objects.delete();
    });
  });

  // Maps of strings (fields.hstore): HSTORE in PostgreSQL (the extension hstore), json in SQLite, documents in MongoDB.
  describe(`${name} backend: hstore`, () => {
    let db;
    let Setting;
    let ready = true;

    beforeAll(async () => {
      Setting = class Setting extends Model {
        static fields = {
          owner: fields.string(),
          values: fields.hstore({ null: true }),
          history: fields.array(fields.hstore(), { null: true }),
        };

        static options = { table: 'hs_setting' };
      };
      db = makeDatabase();
      db.register(Setting);
      await db.connect();
      if (name === 'postgres') {
        ready = (await db.backend.raw("SELECT 1 AS ok FROM pg_extension WHERE extname = 'hstore'")).length > 0;
      }
      if (!ready) return;
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (!db) return;
      if (ready) await db.drop();
      await db.close();
    });

    it('stores maps of strings, and arrays of them', async () => {
      if (!ready) return;
      // MongoDB keeps no arrays of maps apart from arrays of documents: the same.
      const values = { theme: 'dark', 'a "quoted" key': 'back\\slash', empty: null, count: 3 };
      await Setting.objects.create({ owner: 'ada', values, history: [{ step: '1' }, { step: '2', note: null }] });
      const found = await Setting.objects.get({ owner: 'ada' });
      expect(found.values).toEqual({ theme: 'dark', 'a "quoted" key': 'back\\slash', empty: null, count: '3' });
      expect(found.history).toEqual([{ step: '1' }, { step: '2', note: null }]);
      expect(
        await Setting.objects
          .filter({ values: { theme: 'dark', 'a "quoted" key': 'back\\slash', empty: null, count: '3' } })
          .count()
      ).toBe(1);
      await expect(Setting.objects.create({ owner: 'bad', values: { nested: { a: 1 } } })).rejects.toThrow('strings');
      await Setting.objects.delete();
    });
  });

  // Geometries (GeoJSON): GEOMETRY and GEOGRAPHY columns of PostGIS, json in SQLite, documents in MongoDB.
  describe(`${name} backend: geometries`, () => {
    let db;
    let Place;
    let ready = true;

    beforeAll(async () => {
      Place = class Place extends Model {
        static fields = {
          label: fields.string(),
          location: fields.geometry({ null: true }),
          spot: fields.geometry({ shape: 'POINT', srid: 4326, null: true }),
          area: fields.geography({ shape: 'POLYGON', null: true }),
        };

        static options = { table: 'geo_place' };
      };
      db = makeDatabase();
      db.register(Place);
      await db.connect();
      // PostgreSQL needs the extension postgis.
      if (name === 'postgres') {
        const rows = await db.backend.raw("SELECT 1 AS ok FROM pg_extension WHERE extname = 'postgis'");
        ready = rows.length > 0;
      }
      if (!ready) return;
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (!db) return;
      if (ready) await db.drop();
      await db.close();
    });

    it('stores and reads GeoJSON values, with their SRID as crs', async () => {
      if (!ready) return;
      const crs = { type: 'name', properties: { name: 'EPSG:4326' } };
      const point = { type: 'Point', coordinates: [39.807222, -76.984722] };
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [100, 0],
            [101, 0],
            [101, 1],
            [100, 1],
            [100, 0],
          ],
        ],
      };
      const line = {
        type: 'LineString',
        coordinates: [
          [100, 0],
          [101, 1],
        ],
      };
      await Place.objects.create({ label: 'a', location: point, spot: { ...point, crs }, area: { ...polygon, crs } });
      await Place.objects.create({ label: 'b', location: line });
      const a = await Place.objects.get({ label: 'a' });
      expect(a.location).toEqual(point);
      expect(a.spot).toEqual({ ...point, crs });
      expect(a.area).toEqual({ ...polygon, crs });
      expect((await Place.objects.get({ label: 'b' })).location).toEqual(line);
      expect(await Place.objects.filter({ spot__isnull: true }).count()).toBe(1);
      expect(await Place.objects.filter({ label: 'b' }).update({ location: point })).toBe(1);
      expect((await Place.objects.get({ label: 'b' })).location).toEqual(point);
      await expect(Place.objects.create({ label: 'bad', location: { type: 'Circle' } })).rejects.toThrow('GeoJSON');
      await expect(
        Place.objects.create({ label: 'bad', location: { type: 'Point', coordinates: [1, "'); DROP TABLE x; --"] } })
      ).rejects.toThrow('must be numbers');
      if (name === 'postgres') {
        const [row] = await db.backend.raw(
          "SELECT ST_AsText(location) AS text, ST_SRID(spot) AS srid, GeometryType(area::geometry) AS kind FROM geo_place WHERE label = 'a'"
        );
        expect(row).toEqual({ text: 'POINT(39.807222 -76.984722)', srid: 4326, kind: 'POLYGON' });
      }
      await Place.objects.delete();
    });
  });

  // Arrays of the values of a field (fields.array): native arrays in PostgreSQL, json text in SQLite.
  describe(`${name} backend: arrays`, () => {
    let db;
    let Post;

    beforeAll(async () => {
      Post = class Post extends Model {
        static fields = {
          title: fields.string(),
          tags: fields.array(fields.string({ maxLength: 20 }), { default: () => [] }),
          scores: fields.array(fields.integer(), { null: true }),
          seen: fields.array(fields.datetime(), { null: true }),
        };

        static options = { table: 'arr_post' };
      };
      db = makeDatabase();
      db.register(Post);
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (!db) return;
      await db.drop();
      await db.close();
    });

    it('stores, reads and filters arrays, with the values of their field', async () => {
      const day = new Date('2024-05-01T10:00:00Z');
      const post = await Post.objects.create({
        title: 'a',
        tags: ['x', 'y z', 'q"uote'],
        scores: [1, null, 3],
        seen: [day],
      });
      await Post.objects.bulkCreate([{ title: 'b', tags: ['x'] }, { title: 'c' }]);
      const found = await Post.objects.get({ title: 'a' });
      expect(found.tags).toEqual(['x', 'y z', 'q"uote']);
      expect(found.scores).toEqual([1, null, 3]);
      expect(found.seen[0]).toBeInstanceOf(Date);
      expect(found.seen[0].getTime()).toBe(day.getTime());
      expect((await Post.objects.get({ title: 'c' })).tags).toEqual([]);
      expect(await Post.objects.filter({ tags: ['x'] }).count()).toBe(1);
      expect(await Post.objects.filter({ scores__isnull: true }).count()).toBe(2);
      post.tags = ['w'];
      await post.save();
      await post.refresh();
      expect(post.tags).toEqual(['w']);
      expect(await Post.objects.filter({ title: 'b' }).update({ scores: [7] })).toBe(1);
      expect((await Post.objects.get({ title: 'b' })).scores).toEqual([7]);
      // The values are checked by the field of the items.
      await expect(Post.objects.create({ title: 'bad', tags: 'x' })).rejects.toThrow('must be an array');
      await expect(Post.objects.create({ title: 'bad', scores: ['many'] })).rejects.toThrow();
      expect(() => fields.array(fields.array(fields.integer()))).toThrow(TypeError);
      if (name === 'postgres') {
        const [row] = await db.backend.raw(
          "SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = 'arr_post' AND column_name = 'tags'"
        );
        expect(row).toEqual({ data_type: 'ARRAY', udt_name: '_varchar' });
      }
      await Post.objects.delete();
    });
  });

  // Models without a primary key (options.primaryKey: false): rows of tables that have none, as logs.
  describe(`${name} backend: models without a primary key`, () => {
    let db;
    let Owner;
    let Entry;

    beforeAll(async () => {
      Owner = class Owner extends Model {
        static fields = { name: fields.string() };

        static options = { table: 'nokey_owner' };
      };
      Entry = class Entry extends Model {
        static fields = {
          level: fields.string(),
          hits: fields.integer({ default: 0 }),
          owner: fields.foreignKey(() => Owner, { relatedName: 'entries', null: true }),
        };

        static options = { table: 'nokey_entry', primaryKey: false };
      };
      db = makeDatabase();
      db.register(Owner, Entry);
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (!db) return;
      await db.drop();
      await db.close();
    });

    it('has no primary key, nor an id', () => {
      expect(Entry.meta.pk).toBeNull();
      expect(Entry.meta.pkFields).toEqual([]);
      expect(Entry.meta.fields.map((field) => field.name)).toEqual(['level', 'hits', 'owner']);
      class Wrong extends Model {
        static fields = { entry: fields.foreignKey(() => Entry) };
      }
      expect(() => Wrong.meta.fields[1].targetField).toThrow('has no primary key');
      class Both extends Model {
        static fields = { code: fields.string({ primaryKey: true }) };

        static options = { primaryKey: false };
      }
      expect(() => Both.meta).toThrow('primaryKey: false');
    });

    it('inserts, finds, updates and deletes its rows with querysets', async () => {
      const ada = await Owner.objects.create({ name: 'Ada' });
      const entry = await Entry.objects.create({ level: 'info', owner: ada });
      expect(entry.pk).toBeUndefined();
      await Entry.objects.bulkCreate([{ level: 'error', owner: ada }, { level: 'debug' }, { level: 'error', hits: 3 }]);
      expect(await Entry.objects.count()).toBe(4);
      expect(await Entry.objects.filter({ level: 'error' }).count()).toBe(2);
      expect((await Entry.objects.orderBy('-hits').first()).hits).toBe(3);
      expect((await Entry.objects.orderBy('hits', 'level').last()).hits).toBe(3);
      await expect(Entry.objects.last()).rejects.toThrow('needs an order');
      expect(await Entry.objects.filter({ owner__name: 'Ada' }).count()).toBe(2);
      expect(await Owner.objects.filter({ entries__level: 'error' }).count()).toBe(1);
      expect(await Entry.objects.filter({ level: 'debug' }).exists()).toBe(true);
      expect(await Entry.objects.values('level').filter({ hits: 3 })).toEqual([{ level: 'error' }]);
      expect(await Entry.objects.filter({ level: 'error' }).update({ hits: 5 })).toBe(2);
      expect(await Entry.objects.filter({ hits: 5 }).count()).toBe(2);
      // An object of it is only inserted.
      entry.hits = 9;
      await expect(entry.save()).rejects.toThrow('cannot be saved again');
      await expect(entry.delete()).rejects.toThrow('cannot be deleted');
      await expect(entry.refresh()).rejects.toThrow('cannot be refreshed');
      expect(await Entry.objects.filter({ level: 'debug' }).delete()).toBe(1);
      expect(await Entry.objects.count()).toBe(3);
      // Deleting the owner deletes its entries (onDelete cascade).
      await ada.delete();
      expect(await Entry.objects.count()).toBe(1);
      await Entry.objects.delete();
      expect(await Entry.objects.count()).toBe(0);
    });
  });

  // Infinite dates (PostgreSQL's 'infinity' and '-infinity'): Infinity and -Infinity, after and before every date.
  // MongoDB has none.
  describe(`${name} backend: infinite dates`, () => {
    let db;
    let Period;

    beforeAll(async () => {
      Period = class Period extends Model {
        static fields = {
          label: fields.string(),
          endsAt: fields.datetime({ null: true }),
          day: fields.date({ null: true }),
          ratio: fields.float({ null: true }),
        };

        static options = { table: 'inf_period' };
      };
      db = makeDatabase();
      db.register(Period);
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (!db) return;
      await db.drop();
      await db.close();
    });

    it('stores, reads, filters and orders them', async () => {
      if (name === 'mongodb') {
        await expect(Period.objects.create({ label: 'forever', endsAt: Infinity })).rejects.toThrow('infinite dates');
        return;
      }
      await Period.objects.bulkCreate([
        { label: 'forever', endsAt: Infinity, day: 'infinity' },
        { label: 'always', endsAt: '-Infinity', day: -Infinity },
        { label: 'now', endsAt: new Date('2024-05-01T10:00:00Z'), day: '2024-05-01' },
      ]);
      const forever = await Period.objects.get({ label: 'forever' });
      expect(forever.endsAt).toBe(Infinity);
      expect(forever.day).toBe(Infinity);
      expect((await Period.objects.get({ label: 'always' })).endsAt).toBe(-Infinity);
      expect((await Period.objects.orderBy('endsAt')).map((item) => item.label)).toEqual(['always', 'now', 'forever']);
      expect((await Period.objects.orderBy('-day')).map((item) => item.label)).toEqual(['forever', 'now', 'always']);
      expect(await Period.objects.filter({ endsAt: Infinity }).count()).toBe(1);
      expect(await Period.objects.filter({ endsAt__gt: new Date('2030-01-01T00:00:00Z') }).count()).toBe(1);
      expect(await Period.objects.filter({ day__lt: '2024-01-01' }).count()).toBe(1);
      // Saved and updated (in prepared runs too).
      for (let i = 0; i < 3; i += 1) {
        expect(await Period.objects.filter({ label: 'now' }).update({ endsAt: Infinity })).toBe(1);
      }
      expect(await Period.objects.filter({ endsAt: Infinity }).count()).toBe(2);
      forever.endsAt = new Date('2025-01-01T00:00:00Z');
      await forever.save();
      await forever.refresh();
      expect(forever.endsAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect(() => Period.objects.filter({ endsAt: 'someday' })).toThrow();
    });

    it('stores the IEEE values of floats (NaN, Infinity, -Infinity)', async () => {
      await Period.objects.delete();
      await Period.objects.bulkCreate([
        { label: 'nan', ratio: NaN },
        { label: 'up', ratio: Infinity },
      ]);
      await Period.objects.create({ label: 'down', ratio: '-Infinity' });
      const ratios = Object.fromEntries((await Period.objects.all()).map((item) => [item.label, item.ratio]));
      expect(ratios.nan).toBeNaN();
      expect(ratios.up).toBe(Infinity);
      expect(ratios.down).toBe(-Infinity);
      // (How NaN compares is the database's: PostgreSQL and SQLite put it after every number, MongoDB before them.)
      expect(await Period.objects.filter({ ratio: Infinity }).count()).toBe(1);
      expect(await Period.objects.filter({ ratio: -Infinity }).count()).toBe(1);
      // A text that is no number is still refused.
      await expect(Period.objects.create({ label: 'bad', ratio: 'abc' })).rejects.toThrow('must be a number');
      await Period.objects.delete();
    });
  });

  // TTL indexes: objects that expire some time after the date of a field (native in MongoDB; db.expire() deletes them
  // in every backend).
  describe(`${name} backend: TTL indexes`, () => {
    let db;
    let Log;
    let Session;
    let Visit;

    beforeAll(async () => {
      Log = class Log extends Model {
        static fields = { message: fields.string(), createdAt: fields.datetime() };

        static options = { table: 'ttl_log', indexes: [{ fields: ['createdAt'], expireAfter: '1h' }] };
      };
      // expireAfter 0: the date of the field is the date it expires at.
      Session = class Session extends Model {
        static fields = { token: fields.string(), expiresAt: fields.datetime({ null: true }) };

        static options = { table: 'ttl_session', indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] };
      };
      Visit = class Visit extends Model {
        static fields = { session: fields.foreignKey(() => Session, { onDelete: 'cascade' }), path: fields.string() };

        static options = { table: 'ttl_visit' };
      };
      db = makeDatabase();
      db.register(Log, Session, Visit);
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
    });

    beforeEach(async () => {
      await Visit.objects.delete();
      await Session.objects.delete();
      await Log.objects.delete();
    });

    const at = (iso) => new Date(iso);

    it('deletes the objects that expired', async () => {
      await Log.objects.bulkCreate([
        { message: 'old', createdAt: at('2026-10-04T08:00:00Z') },
        { message: 'recent', createdAt: at('2026-10-04T09:30:00Z') },
      ]);
      const gone = await Session.objects.create({ token: 'a', expiresAt: at('2026-10-04T09:59:00Z') });
      await Session.objects.create({ token: 'b', expiresAt: at('2026-10-04T10:01:00Z') });
      await Session.objects.create({ token: 'forever', expiresAt: null });
      await Visit.objects.create({ session: gone, path: '/' });
      const deleted = await db.expire({ now: at('2026-10-04T10:00:00Z') });
      expect(deleted).toEqual({ Log: 1, Session: 1 });
      expect((await Log.objects.values('message')).map((row) => row.message)).toEqual(['recent']);
      expect((await Session.objects.orderBy('token').values('token')).map((row) => row.token)).toEqual([
        'b',
        'forever',
      ]);
      // Deleted as QuerySets delete: their relations as onDelete says.
      expect(await Visit.objects.count()).toBe(0);
    });

    it('deletes them every interval', async () => {
      await Log.objects.create({ message: 'old', createdAt: new Date(Date.now() - 2 * 3600 * 1000) });
      await Log.objects.create({ message: 'new', createdAt: new Date() });
      const errors = [];
      db.startExpiry({ interval: 0.05, onError: (err) => errors.push(err) });
      try {
        for (let i = 0; i < 40 && (await Log.objects.count()) > 1; i += 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, 25);
          });
        }
      } finally {
        db.stopExpiry();
      }
      expect(errors).toEqual([]);
      expect((await Log.objects.values('message')).map((row) => row.message)).toEqual(['new']);
    });

    it('are TTL indexes of MongoDB', async () => {
      if (name !== 'mongodb') return;
      const indexes = await db.backend.collection(Log.meta).indexes();
      expect(indexes.find((index) => index.key.createdAt)).toMatchObject({ expireAfterSeconds: 3600 });
    });

    it('refuse indexes that cannot expire', () => {
      class Wrong extends Model {
        static fields = { a: fields.datetime(), b: fields.string() };

        static options = { indexes: [{ fields: ['b'], expireAfter: 10 }] };
      }
      expect(() => Wrong.meta).toThrow('one datetime field');
      class Two extends Model {
        static fields = { a: fields.datetime(), b: fields.datetime() };

        static options = { indexes: [{ fields: ['a', 'b'], expireAfter: 10 }] };
      }
      expect(() => Two.meta).toThrow('one datetime field');
      class Bad extends Model {
        static fields = { a: fields.datetime() };

        static options = { indexes: [{ fields: ['a'], expireAfter: 'soon' }] };
      }
      expect(() => Bad.meta).toThrow('expireAfter must be');
    });
  });

  // Encrypted fields: the database keeps their text ($xenc$...), the objects their values. A model of the same table
  // with text fields reads what is stored. The memory backend keeps the values as they are.
  describe(`${name} backend: encrypted fields`, () => {
    const KEY1 = generateEncryptionKey();
    const KEY2 = generateEncryptionKey();
    let db;
    let Secret;
    let Stored;

    beforeAll(async () => {
      setEncryptionKeys({ keys: { k1: KEY1 } });
      Secret = class Secret extends Model {
        static fields = {
          name: fields.string(),
          ssn: fields.encrypted(fields.string({ maxLength: 11 }), { null: true }),
          email: fields.encrypted(fields.string(), { deterministic: true, unique: true, null: true }),
          profile: fields.encrypted(fields.json(), { null: true }),
          born: fields.encrypted(fields.datetime(), { null: true }),
          score: fields.encrypted(fields.bigint(), { null: true }),
          photo: fields.encrypted(fields.bytes(), { null: true }),
          notes: fields.encrypted(fields.text(), { null: true, acceptPlaintext: true }),
        };

        static options = { table: 'enc_secret' };
      };
      Stored = class Stored extends Model {
        static fields = {
          name: fields.string(),
          ssn: fields.text({ null: true }),
          email: fields.text({ null: true }),
          notes: fields.text({ null: true }),
        };

        static options = { table: 'enc_secret' };
      };
      db = makeDatabase();
      db.register(Secret);
      await db.connect();
      await db.drop();
      await db.sync();
      // The model of the stored text, of the same table (registered after sync, which made it).
      db.register(Stored);
    });

    afterAll(async () => {
      setEncryptionKeys({ keys: { k1: KEY1 } });
      if (db) {
        await db.drop();
        await db.close();
      }
      setEncryptionKeys(null);
    });

    beforeEach(async () => {
      setEncryptionKeys({ keys: { k1: KEY1 } });
      await Secret.objects.delete();
    });

    // The memory backend keeps the values as they are (not encrypted): by the backend, not the name of the suite.
    const plainMemory = () => db.backend.name === 'memory';
    const storedOf = async (id) => (plainMemory() ? null : Stored.objects.get({ pk: id }));

    it('keeps the values encrypted, and gives them back', async () => {
      const born = new Date('1815-12-10T08:00:00.000Z');
      const ada = await Secret.objects.create({
        name: 'Ada',
        ssn: '123-45-6789',
        email: 'ada@example.com',
        profile: { languages: ['en', 'fr'], engine: true },
        born,
        score: 9007199254740993n,
        photo: Buffer.from([0, 1, 2, 255]),
      });
      const found = await Secret.objects.get({ pk: ada.pk });
      expect(found.ssn).toBe('123-45-6789');
      expect(found.email).toBe('ada@example.com');
      expect(found.profile).toEqual({ languages: ['en', 'fr'], engine: true });
      expect(found.born).toEqual(born);
      expect(found.score).toBe(9007199254740993n);
      expect(found.photo).toEqual(Buffer.from([0, 1, 2, 255]));
      expect(found.notes).toBe(null);
      const stored = await storedOf(ada.pk);
      if (stored) {
        expect(stored.ssn).toMatch(/^\$xenc\$1\$k1\$[\w-]{16}\$[\w-]+$/);
        expect(stored.ssn).not.toContain('6789');
        expect(stored.notes).toBe(null);
      }
      // values() and bulkCreate() and update() of querysets too.
      await Secret.objects.bulkCreate([{ name: 'Grace', ssn: '987-65-4321' }]);
      await Secret.objects.filter({ name: 'Grace' }).update({ email: 'grace@example.com' });
      const values = await Secret.objects.orderBy('name').values('name', 'ssn', 'email');
      expect(values).toEqual([
        { name: 'Ada', ssn: '123-45-6789', email: 'ada@example.com' },
        { name: 'Grace', ssn: '987-65-4321', email: 'grace@example.com' },
      ]);
      // The base field still validates.
      await expect(Secret.objects.create({ name: 'Bad', ssn: '123-45-67890' })).rejects.toThrow('at most 11');
    });

    it('finds deterministic values by equality, and nothing else by their values', async () => {
      await Secret.objects.create({ name: 'Ada', ssn: '1', email: 'ada@example.com' });
      await Secret.objects.create({ name: 'Grace', ssn: '2', email: 'grace@example.com' });
      await Secret.objects.create({ name: 'Alan' });
      expect((await Secret.objects.get({ email: 'grace@example.com' })).name).toBe('Grace');
      expect(await Secret.objects.filter({ email__in: ['ada@example.com', 'x@example.com'] }).count()).toBe(1);
      expect(await Secret.objects.exclude({ email: 'ada@example.com' }).count()).toBe(2);
      expect(await Secret.objects.filter({ ssn__isnull: true }).count()).toBe(1);
      expect(await Secret.objects.filter({ ssn: null }).count()).toBe(1);
      expect(() => Secret.objects.filter({ ssn: '1' })).toThrow('is encrypted');
      expect(() => Secret.objects.filter({ email__startswith: 'ada' })).toThrow('is encrypted');
      await expect(Secret.objects.orderBy('ssn')).rejects.toThrow('is encrypted');
      await expect(Secret.objects.aggregate({ max: Max('ssn') })).rejects.toThrow('is encrypted');
      expect(await Secret.objects.aggregate({ n: Count('ssn') })).toEqual({ n: 2 });
      // Groups of deterministic values are their values.
      const groups = await Secret.objects.filter({ email__isnull: false }).values('email').annotate({ n: Count() });
      expect(groups.map((group) => group.email).sort()).toEqual(['ada@example.com', 'grace@example.com']);
      // Unique: the same value is the same text.
      await expect(Secret.objects.create({ name: 'Copy', email: 'ada@example.com' })).rejects.toThrow();
    });

    it('refuses values that were changed or moved to another column', async () => {
      if (plainMemory()) return;
      const ada = await Secret.objects.create({ name: 'Ada', ssn: '123-45-6789', notes: 'x' });
      const stored = await storedOf(ada.pk);
      // The text of the ssn in the column of the email: bound to its column, it is refused there.
      await Stored.objects.filter({ pk: ada.pk }).update({ email: stored.ssn });
      await expect(Secret.objects.get({ pk: ada.pk })).rejects.toThrow('of another field');
      const changed = `${stored.ssn.slice(0, -2)}${stored.ssn.endsWith('A') ? 'BA' : 'AA'}`;
      await Stored.objects.filter({ pk: ada.pk }).update({ email: null, ssn: changed });
      await expect(Secret.objects.get({ pk: ada.pk })).rejects.toThrow('was changed');
      // A value that is not encrypted is refused too (unless the field accepts plaintext).
      await Stored.objects.filter({ pk: ada.pk }).update({ ssn: '123-45-6789' });
      await expect(Secret.objects.get({ pk: ada.pk })).rejects.toThrow('is not encrypted');
    });

    it('rotates keys, and encrypts the values written before', async () => {
      const ada = await Secret.objects.create({ name: 'Ada', ssn: '123-45-6789', email: 'ada@example.com' });
      if (!plainMemory()) {
        await Stored.objects.filter({ pk: ada.pk }).update({ notes: 'written before the field was encrypted' });
      }
      // A new key encrypts; the old one still decrypts.
      setEncryptionKeys({ current: 'k2', keys: { k2: KEY2, k1: KEY1 } });
      expect((await Secret.objects.get({ pk: ada.pk })).ssn).toBe('123-45-6789');
      if (!plainMemory()) {
        // Deterministic values of the old key are not found by the new one until they are written again.
        expect(await Secret.objects.filter({ email: 'ada@example.com' }).count()).toBe(0);
        expect((await Secret.objects.get({ pk: ada.pk })).notes).toBe('written before the field was encrypted');
      }
      expect(await reencrypt(Secret, { batchSize: 1 })).toBe(1);
      expect(await Secret.objects.filter({ email: 'ada@example.com' }).count()).toBe(1);
      const stored = await storedOf(ada.pk);
      if (stored) {
        expect(stored.ssn.startsWith('$xenc$1$k2$')).toBe(true);
        expect(stored.notes.startsWith('$xenc$1$k2$')).toBe(true);
      }
      // Without the old key, everything is still read.
      setEncryptionKeys({ keys: { k2: KEY2 } });
      const found = await Secret.objects.get({ pk: ada.pk });
      expect([found.ssn, found.notes]).toEqual([
        '123-45-6789',
        plainMemory() ? null : 'written before the field was encrypted',
      ]);
      if (!plainMemory()) {
        setEncryptionKeys({ keys: { k1: KEY1 } });
        await expect(Secret.objects.get({ pk: ada.pk })).rejects.toThrow('not in the keyring');
      }
    });
  });

  describe(`${name} backend: decimals with their scale`, () => {
    let ddb;
    let Price;

    beforeAll(async () => {
      Price = class extends Model {
        static options = { table: 'scaled_price' };

        static fields = { amount: fields.decimal({ precision: 6, scale: 2 }) };
      };
      Object.defineProperty(Price, 'name', { value: 'ScaledPrice' });
      ddb = makeDatabase();
      ddb.register(Price);
      await ddb.connect();
      await ddb.drop();
      await ddb.sync();
    });

    afterAll(async () => {
      if (ddb) {
        await ddb.drop();
        await ddb.close();
      }
    });

    it("are given with the places of their scale, written and read, as Django's", async () => {
      const objects = Price.objects.using(ddb);
      const price = await objects.create({ amount: '3' });
      expect(price.amount).toBe('3.00');
      expect((await objects.get({ pk: price.pk })).amount).toBe('3.00');
      await objects.filter({ pk: price.pk }).update({ amount: '2.5' });
      expect((await objects.get({ pk: price.pk })).amount).toBe('2.50');
      expect((await objects.get({ pk: price.pk })).amount).toBe(
        (await objects.valuesList('amount', { flat: true }))[0]
      );
      await expect(objects.create({ amount: '1.005' })).rejects.toMatchObject({
        errors: { amount: ['Ensure that there are no more than 2 decimal places.'] },
      });
      await expect(objects.create({ amount: '12345.6' })).rejects.toMatchObject({
        errors: { amount: ['Ensure that there are no more than 6 digits in total.'] },
      });
    });
  });

  describe(`${name} backend: soft deletes and scopes`, () => {
    let sdb;
    let Post;
    let Comment;

    beforeAll(async () => {
      Post = class extends Model {
        static options = { table: 'soft_post', softDelete: true, ordering: ['title'] };

        static fields = {
          title: fields.string(),
          status: fields.string({ default: 'draft' }),
          views: fields.integer({ default: 0 }),
        };

        static scopes = {
          published: (qs) => qs.filter({ status: 'published' }),
          popular: (qs, min = 10) => qs.filter({ views__gte: min }),
        };
      };
      Object.defineProperty(Post, 'name', { value: 'SoftPost' });
      Comment = class extends Model {
        static options = { table: 'soft_comment', softDelete: 'removedAt' };

        static fields = { text: fields.string(), post: fields.foreignKey(() => Post, { onDelete: 'cascade' }) };
      };
      Object.defineProperty(Comment, 'name', { value: 'SoftComment' });
      sdb = makeDatabase();
      sdb.register(Post, Comment);
      await sdb.connect();
      await sdb.drop();
      await sdb.sync();
    });

    afterAll(async () => {
      if (sdb) {
        await sdb.drop();
        await sdb.close();
      }
    });

    it('scopes: methods of the querysets of the model, chained with the rest', async () => {
      const objects = Post.objects.using(sdb);
      await objects.bulkCreate([
        { title: 'a', status: 'published', views: 50 },
        { title: 'b', status: 'published', views: 5 },
        { title: 'c', views: 100 },
      ]);
      expect(await objects.published().valuesList('title', { flat: true })).toEqual(['a', 'b']);
      expect(await objects.published().popular().valuesList('title', { flat: true })).toEqual(['a']);
      expect(await objects.popular(60).count()).toBe(1);
      expect(
        await objects
          .filter({ title__in: ['a', 'c'] })
          .published()
          .count()
      ).toBe(1);
      await objects.all().forceDelete();
    });

    it('soft deletes: delete() sets the date, querysets leave them out; withDeleted, onlyDeleted, restore, forceDelete', async () => {
      const objects = Post.objects.using(sdb);
      const [a, b] = await objects.bulkCreate([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
      expect(Post.meta.field('deletedAt').type).toBe('datetime');
      await a.delete();
      expect(a.isDeleted).toBe(true);
      expect(a.pk).not.toBe(null);
      expect(await objects.valuesList('title', { flat: true })).toEqual(['b', 'c']);
      expect(await objects.count()).toBe(2);
      await expect(objects.get({ pk: a.pk })).rejects.toThrow(/matches the query/);
      expect(await objects.withDeleted().count()).toBe(3);
      expect(await objects.onlyDeleted().valuesList('title', { flat: true })).toEqual(['a']);
      expect(await objects.filter({ title: 'c' }).delete()).toBe(1);
      expect(await objects.onlyDeleted().count()).toBe(2);
      expect(await objects.filter({ title: 'c' }).restore()).toBe(1);
      await a.restore();
      expect(a.isDeleted).toBe(false);
      expect(await objects.count()).toBe(3);
      await b.forceDelete();
      expect(await objects.withDeleted().count()).toBe(2);
      await objects.all().delete();
      expect(await objects.count()).toBe(0);
      expect(await objects.withDeleted().forceDelete()).toBe(2);
      expect(await objects.withDeleted().count()).toBe(0);
    });

    it('a delete for good takes the related objects deleted softly too (cascade), and the field can be named', async () => {
      const posts = Post.objects.using(sdb);
      const comments = Comment.objects.using(sdb);
      const post = await posts.create({ title: 'p' });
      const [kept, removed] = await comments.bulkCreate([
        { text: 'kept', postId: post.pk },
        { text: 'removed', postId: post.pk },
      ]);
      await removed.delete();
      expect(removed.removedAt).toBeInstanceOf(Date);
      expect(await comments.count()).toBe(1);
      // A soft delete of the post leaves its comments as they are.
      await post.delete();
      expect(await comments.filter({ pk: kept.pk }).count()).toBe(1);
      await posts.withDeleted().filter({ pk: post.pk }).forceDelete();
      expect(await comments.withDeleted().count()).toBe(0);
      await expect(Comment.objects.using(sdb).all().restore()).resolves.toBe(0);
    });
  });

  describe(`${name} backend: parts of dates, defer() and inBulk()`, () => {
    let edb;
    let Event;

    beforeAll(async () => {
      Event = class extends Model {
        static options = { table: 'dated_event' };

        static fields = {
          title: fields.string(),
          at: fields.datetime(),
          day: fields.date({ null: true }),
          date: fields.string({ null: true }),
          code: fields.string({ unique: true, null: true }),
        };
      };
      Object.defineProperty(Event, 'name', { value: 'DatedEvent' });
      edb = makeDatabase();
      edb.register(Event);
      await edb.connect();
      await edb.drop();
      await edb.sync();
      await Event.objects.using(edb).bulkCreate([
        { title: 'a', at: new Date('2025-12-31T23:59:59Z'), day: '2025-12-31', code: 'A' },
        { title: 'b', at: new Date('2026-01-01T00:00:00Z'), day: '2026-01-01', date: 'x', code: 'B' },
        { title: 'c', at: new Date('2026-10-07T12:00:00Z'), day: '2026-10-07' },
      ]);
    });

    afterAll(async () => {
      if (edb) {
        await edb.drop();
        await edb.close();
      }
    });

    const titles = async (conditions) =>
      (await Event.objects.using(edb).filter(conditions).orderBy('title').valuesList('title', { flat: true })).join('');

    it('__year and __date, with comparisons, in and range (as ranges of the field, in UTC)', async () => {
      expect(await titles({ at__year: 2026 })).toBe('bc');
      expect(await titles({ at__year__gt: 2025 })).toBe('bc');
      expect(await titles({ at__year__lte: 2025 })).toBe('a');
      expect(await titles({ at__year__in: [2025, 2027] })).toBe('a');
      expect(await titles({ at__date: '2026-10-07' })).toBe('c');
      expect(await titles({ at__date: new Date('2026-01-01T15:00:00Z') })).toBe('b');
      expect(await titles({ at__date__lt: '2026-01-01' })).toBe('a');
      expect(await titles({ at__date__range: ['2026-01-01', '2026-10-07'] })).toBe('bc');
      expect(await titles({ day__year: 2026 })).toBe('bc');
      expect(await titles({ day__date__gte: '2026-01-01' })).toBe('bc');
      // A field named date is a field.
      expect(await titles({ date: 'x' })).toBe('b');
      expect(() => Event.objects.filter({ title__year: 2026 })).toThrow(/Unsupported lookup "year"/);
    });

    it('defer() leaves fields unread; inBulk() gives a Map by key or unique field', async () => {
      const objects = Event.objects.using(edb);
      const [first] = await objects.orderBy('title').defer('title', 'day').limit(1);
      expect([first.title, first.day, first.code]).toEqual([undefined, undefined, 'A']);
      const byCode = await objects.inBulk(['A', 'B', 'Z'], { field: 'code' });
      expect([...byCode.keys()].sort()).toEqual(['A', 'B']);
      expect(byCode.get('B').title).toBe('b');
      const all = await objects.inBulk();
      expect(all.size).toBe(3);
      expect(all.get(first.pk).code).toBe('A');
      await expect(objects.inBulk(['a'], { field: 'title' })).rejects.toThrow(/not the key nor a unique field/);
    });
  });

  describe(`${name} backend: decimals`, () => {
    let db;
    let Price;

    beforeAll(async () => {
      Price = class Price extends Model {
        static fields = { amount: fields.decimal({ precision: 12, scale: 2 }) };

        static options = { table: 'dec_price' };
      };
      db = makeDatabase();
      db.register(Price);
      await db.connect();
      await db.drop();
      await db.sync();
      await Price.objects.bulkCreate(['6', '100.5', '20', '-3.25', '0.75'].map((amount) => ({ amount })));
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
    });

    it('compares, orders and sums them as numbers', async () => {
      const amounts = async (query) => (await query).map((price) => Number(price.amount));
      expect(await amounts(Price.objects.filter({ amount__gt: '10' }).orderBy('amount'))).toEqual([20, 100.5]);
      expect(await amounts(Price.objects.filter({ amount__range: ['0.5', '20'] }).orderBy('amount'))).toEqual([
        0.75, 6, 20,
      ]);
      expect(await amounts(Price.objects.orderBy('-amount'))).toEqual([100.5, 20, 6, 0.75, -3.25]);
      expect(await amounts(Price.objects.filter({ amount: '20.00' }))).toEqual([20]);
      const totals = await Price.objects.aggregate({ sum: Sum('amount'), min: Min('amount'), max: Max('amount') });
      expect([Number(totals.sum), Number(totals.min), Number(totals.max)]).toEqual([124, -3.25, 100.5]);
    });
  });

  describe(`${name} backend: computed fields`, () => {
    let db;
    let Line;
    let RawLine;

    beforeAll(async () => {
      Line = class Line extends Model {
        static fields = {
          product: fields.string({ maxLength: 50 }),
          price: fields.decimal({ precision: 10, scale: 2 }),
          quantity: fields.integer(),
          discount: fields.integer({ default: 0 }),
          // Stored: a column, set by the ORM.
          total: fields.decimal({
            precision: 12,
            scale: 2,
            computed: 'price * quantity * (100 - discount) / 100',
            stored: true,
          }),
          // Stored, from a function: what it reads is given.
          code: fields.string({
            maxLength: 60,
            computed: (line) => `${line.product.toUpperCase()}-${line.quantity}`,
            uses: ['product', 'quantity'],
            stored: true,
          }),
          // Not stored: computed when read, from a stored one too.
          label: fields.string({ computed: '`${quantity} x ${product} = ${total}`' }),
          big: fields.boolean({ computed: 'Number(total) >= 100' }),
        };

        static options = { table: 'computed_line' };
      };
      RawLine = class RawLine extends Model {
        static fields = {
          product: fields.string({ maxLength: 50 }),
          price: fields.decimal({ precision: 10, scale: 2 }),
          quantity: fields.integer(),
          discount: fields.integer({ default: 0 }),
          total: fields.decimal({ precision: 12, scale: 2 }),
          code: fields.string({ maxLength: 60 }),
        };

        static options = { table: 'computed_line' };
      };
      db = makeDatabase();
      db.register(Line);
      await db.connect();
      await db.drop();
      await db.sync();
      db.register(RawLine);
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
    });

    beforeEach(async () => {
      await Line.objects.delete();
    });

    // Decimals as numbers: SQLite gives them back without their zeros (6 for 6.00).
    const num = (value) => (value === null ? null : Number(value));

    it('sets stored fields on create, bulkCreate and save, from the values cleaned', async () => {
      const pen = await Line.objects.create({ product: 'pen', price: '2.50', quantity: '4' });
      expect([pen.total, pen.code, pen.label, pen.big]).toEqual(['10.00', 'PEN-4', '4 x pen = 10.00', false]);
      await Line.objects.bulkCreate([
        { product: 'desk', price: '120', quantity: 1, discount: 10 },
        { product: 'cup', price: '0.10', quantity: 3 },
      ]);
      const saved = await Line.objects.orderBy('product');
      expect(saved.map((line) => [line.product, num(line.total), line.code])).toEqual([
        ['cup', 0.3, 'CUP-3'],
        ['desk', 108, 'DESK-1'],
        ['pen', 10, 'PEN-4'],
      ]);
      pen.quantity = 50;
      await pen.save({ fields: ['quantity'] });
      const again = await Line.objects.get({ pk: pen.pk });
      expect([num(again.total), again.code, again.big]).toEqual([125, 'PEN-50', true]);
      expect(again.toJSON()).toMatchObject({ code: 'PEN-50', big: true });
      expect(num(again.toJSON().total)).toBe(125);
    });

    it('filters, orders and aggregates by stored fields', async () => {
      await Line.objects.bulkCreate([
        { product: 'desk', price: '120', quantity: 1 },
        { product: 'cup', price: '3', quantity: 2 },
        { product: 'pen', price: '2.5', quantity: 4 },
      ]);
      const products = (lines) => lines.map((line) => line.product);
      expect(products(await Line.objects.filter({ code: 'CUP-2' }))).toEqual(['cup']);
      expect(products(await Line.objects.filter({ total__gt: '9' }).orderBy('-total'))).toEqual(['desk', 'pen']);
      expect(Number((await Line.objects.aggregate({ sum: Sum('total') })).sum)).toBe(136);
    });

    it('sets stored fields again when an update changes what they read', async () => {
      await Line.objects.bulkCreate([
        { product: 'desk', price: '120', quantity: 1 },
        { product: 'cup', price: '3', quantity: 2 },
        { product: 'pen', price: '2.5', quantity: 4 },
      ]);
      // The update moves the objects out of what its conditions select: they are still computed again.
      expect(await Line.objects.filter({ quantity__gt: 1 }).update({ quantity: 1 })).toBe(2);
      let lines = await Line.objects.orderBy('product');
      expect(lines.map((line) => [line.product, num(line.total), line.code])).toEqual([
        ['cup', 3, 'CUP-1'],
        ['desk', 120, 'DESK-1'],
        ['pen', 2.5, 'PEN-1'],
      ]);
      // F expressions too.
      await Line.objects.filter({ product: 'desk' }).update({ discount: F('discount').add(50) });
      expect(num((await Line.objects.get({ product: 'desk' })).total)).toBe(60);
      // A field read by the code only.
      await Line.objects.filter({ product: 'cup' }).update({ product: 'mug' });
      lines = await Line.objects.orderBy('product');
      expect(lines.map((line) => line.code)).toEqual(['DESK-1', 'MUG-1', 'PEN-1']);
    });

    it('computes again what was changed outside the ORM (recompute)', async () => {
      await Line.objects.bulkCreate([
        { product: 'desk', price: '120', quantity: 1 },
        { product: 'cup', price: '3', quantity: 2 },
      ]);
      await RawLine.objects.filter({ product: 'cup' }).update({ quantity: 7 });
      expect(num((await Line.objects.get({ product: 'cup' })).total)).toBe(6);
      expect(await Line.objects.recompute()).toBe(1);
      const cup = await Line.objects.get({ product: 'cup' });
      expect([num(cup.total), cup.code]).toEqual([21, 'CUP-7']);
      expect(await Line.objects.recompute()).toBe(0);
    });

    it('refuses to set computed fields or to query those not stored', async () => {
      expect(() => new Line({ product: 'x', price: '1', quantity: 1, total: '5' })).toThrow(QueryError);
      const line = await Line.objects.create({ product: 'x', price: '1', quantity: 1 });
      expect(() => {
        line.label = 'other';
      }).toThrow(TypeError);
      await expect(Line.objects.update({ total: '1' })).rejects.toThrow(QueryError);
      expect(() => Line.objects.filter({ label: 'x' }).toQuery()).toThrow(QueryError);
      expect(() => Line.objects.orderBy('big').toQuery()).toThrow(QueryError);
      const schema = Line.jsonSchema();
      expect(schema.properties.total.readOnly).toBe(true);
      expect(schema.properties.label.readOnly).toBe(true);
      expect(schema.required).toEqual(['product', 'price', 'quantity']);
    });
  });

  describe(`${name} backend: ping() and the store of the maintenance mode`, () => {
    let mdb;

    afterAll(async () => {
      if (mdb) {
        await mdb.drop();
        await mdb.close();
      }
    });

    it('ping() gives the milliseconds of a round trip; the store keeps the state of the maintenance mode', async () => {
      mdb = makeDatabase();
      const store = maintenance(mdb, { table: 'xufa_test_maintenance' });
      await mdb.connect();
      await mdb.drop();
      await mdb.sync();
      const took = await mdb.ping();
      expect(typeof took).toBe('number');
      expect(took).toBeGreaterThanOrEqual(0);
      // health(): a check of xufa.health, critical; degraded when slower than slow; down when ping throws.
      const health = mdb.health();
      expect(health.critical).toBe(true);
      expect(await health.check()).toMatchObject({ status: 'up', latency: expect.any(Number) });
      expect((await mdb.health({ slow: -1 }).check()).status).toBe('degraded');
      expect(mdb.health({ critical: false, timeout: '1s' })).toMatchObject({ critical: false, timeout: '1s' });
      const { ping } = mdb.backend;
      mdb.backend.ping = async () => {
        throw new Error('the database is gone');
      };
      await expect(health.check()).rejects.toThrow('the database is gone');
      mdb.backend.ping = ping;
      expect(() => mdb.health({ slow: 'soon' })).toThrow(/not a duration/);
      expect(await store.get()).toBe(null);
      const state = await store.set({ message: 'Back soon', retryAfter: 60 });
      expect(state).toMatchObject({ message: 'Back soon', retryAfter: 60, since: expect.any(String) });
      expect(await store.get()).toEqual(state);
      // Set again: one row, the new state.
      await store.set({ message: 'Later' });
      expect((await store.get()).message).toBe('Later');
      expect(await store.model.objects.using(mdb).count()).toBe(1);
      // Another app on the same database has its own.
      expect(await maintenance(mdb, { key: 'admin', model: 'XufaMaintenance' }).get()).toBe(null);
      expect(await store.clear()).toBe(true);
      expect(await store.clear()).toBe(false);
      expect(await store.get()).toBe(null);
    });
  });

  describe(`${name} backend: parts of dates, distinct() and union()`, () => {
    let pdb;
    let Event;
    let Book;

    beforeAll(async () => {
      Event = class extends Model {
        static options = { table: 'parted_event' };

        static fields = {
          title: fields.string(),
          at: fields.datetime({ null: true }),
          day: fields.date({ null: true }),
        };
      };
      Object.defineProperty(Event, 'name', { value: 'PartedEvent' });
      Book = class extends Model {
        static options = { table: 'unioned_book', ordering: ['title'] };

        static fields = {
          title: fields.string(),
          genre: fields.string({ null: true }),
          pages: fields.integer(),
          year: fields.integer(),
        };
      };
      Object.defineProperty(Book, 'name', { value: 'UnionedBook' });
      pdb = makeDatabase();
      pdb.register(Event, Book);
      await pdb.connect();
      await pdb.drop();
      await pdb.sync();
      await Event.objects.using(pdb).bulkCreate([
        // A Wednesday of ISO week 1 of 2026; a Thursday; a Sunday; a Sunday of ISO week 53 of 2020; no date.
        { title: 'a', at: new Date('2025-12-31T23:59:59Z'), day: '2025-12-31' },
        { title: 'b', at: new Date('2026-01-01T00:00:30Z'), day: '2026-01-01' },
        { title: 'c', at: new Date('2026-10-04T12:00:45Z'), day: '2026-10-04' },
        { title: 'd', at: new Date('2021-01-03T08:30:00Z'), day: '2021-01-03' },
        { title: 'e', at: null, day: null },
      ]);
      await Book.objects.using(pdb).bulkCreate([
        { title: 'A', genre: 'sf', pages: 300, year: 2001 },
        { title: 'B', genre: 'sf', pages: 500, year: 2003 },
        { title: 'C', genre: 'crime', pages: 200, year: 2001 },
        { title: 'D', genre: null, pages: 900, year: 2003 },
        { title: 'E', genre: 'crime', pages: 250, year: 2005 },
      ]);
    });

    afterAll(async () => {
      if (pdb) {
        await pdb.drop();
        await pdb.close();
      }
    });

    const titles = async (qs) => (await qs.orderBy('title').valuesList('title', { flat: true }).using(pdb)).join('');

    it('month, day, week_day, iso_week_day, week, quarter, hour, minute and second, in UTC', async () => {
      const E = Event.objects;
      expect(await titles(E.filter({ at__month: 1 }))).toBe('bd');
      expect(await titles(E.filter({ at__month__in: [10, 12] }))).toBe('ac');
      expect(await titles(E.filter({ at__day: 31 }))).toBe('a');
      expect(await titles(E.filter({ at__week_day: 1 }))).toBe('cd');
      expect(await titles(E.filter({ at__iso_week_day__gte: 6 }))).toBe('cd');
      expect(await titles(E.filter({ at__week: 53 }))).toBe('d');
      expect(await titles(E.filter({ at__week: 1 }))).toBe('ab');
      expect(await titles(E.filter({ at__quarter: 4 }))).toBe('ac');
      expect(await titles(E.filter({ at__hour__lt: 12 }))).toBe('bd');
      expect(await titles(E.filter({ at__minute: 59 }))).toBe('a');
      expect(await titles(E.filter({ at__second__range: [30, 59] }))).toBe('abc');
      // Of dates too, and with the other conditions.
      expect(await titles(E.filter({ day__month: 12 }))).toBe('a');
      expect(await titles(E.filter({ day__week_day: 5, at__year: 2026 }))).toBe('b');
      expect(await titles(E.filter({ day__quarter__lte: 1 }).exclude({ day__day: 3 }))).toBe('b');
      expect(await titles(E.exclude({ at__month: 1 }))).toBe('ace');
      expect(await titles(E.filter(or({ at__month: 10 }, { at__hour: 8 })))).toBe('cd');
      expect(await E.filter({ at__month: '12' }).using(pdb).count()).toBe(1);
      // Times are of datetimes; the values are integers.
      expect(() => E.filter({ day__hour: 1 })).toThrow(LookupError);
      expect(() => E.filter({ at__month: 'May' })).toThrow(QueryError);
      expect(() => E.filter({ title__month: 1 })).toThrow(LookupError);
    });

    it('Extract and Trunc in values() and the groups of annotate(): reports by year, month, week...', async () => {
      const E = Event.objects.using(pdb);
      expect(
        await E.values({ year: Extract('at', 'year') })
          .annotate({ n: Count() })
          .orderBy('year')
      ).toEqual([
        { year: null, n: 1 },
        { year: 2021, n: 1 },
        { year: 2025, n: 1 },
        { year: 2026, n: 2 },
      ]);
      const months = await E.filter({ at__year: 2026 })
        .values({ month: Trunc('at', 'month') })
        .annotate({ n: Count() })
        .orderBy('-month');
      expect(months.map((row) => [row.month instanceof Date, row.month.toISOString(), row.n])).toEqual([
        [true, '2026-10-01T00:00:00.000Z', 1],
        [true, '2026-01-01T00:00:00.000Z', 1],
      ]);
      // Of dates: texts of dates. The week starts on Monday (2026-10-04 is a Sunday).
      expect(
        await E.filter({ title: 'c' }).values({
          w: Trunc('day', 'week'),
          q: Trunc('day', 'quarter'),
          y: Trunc('day', 'year'),
        })
      ).toEqual([{ w: '2026-09-28', q: '2026-10-01', y: '2026-01-01' }]);
      const [a] = await E.filter({ title: 'a' }).values({ h: Trunc('at', 'hour'), s: Trunc('at', 'second') });
      expect([a.h.toISOString(), a.s.toISOString()]).toEqual(['2025-12-31T23:00:00.000Z', '2025-12-31T23:59:59.000Z']);
      // Plain values and lists, with the fields; nothing for no date.
      expect(
        await E.orderBy('title').valuesList('title', { wd: Extract('at', 'week_day'), h: Extract('at', 'hour') })
      ).toEqual([
        ['a', 4, 23],
        ['b', 5, 0],
        ['c', 1, 12],
        ['d', 1, 8],
        ['e', null, null],
      ]);
      expect(
        await E.valuesList({ m: Extract('day', 'month') }, { flat: true })
          .distinct()
          .orderBy('m')
      ).toEqual([null, 1, 10, 12]);
      expect(() => E.values({ h: Trunc('day', 'hour') }).toQuery()).toThrow(QueryError);
      expect(() => E.values({ m: Extract('title', 'month') }).toQuery()).toThrow(QueryError);
      expect(() => Extract('at', 'decade')).toThrow(QueryError);
      expect(new Trunc('at', 'week')).toBeInstanceOf(Trunc);
    });

    it('plain values() ordered by their Extract and Trunc keys (nulls first going up, last going down), sliced', async () => {
      const E = Event.objects.using(pdb);
      const hours = (qs) => qs.then((rows) => rows.map((row) => `${row.title}:${row.h}`).join(' '));
      expect(await hours(E.values('title', { h: Extract('at', 'hour') }).orderBy('h'))).toBe(
        'e:null b:0 d:8 c:12 a:23'
      );
      expect(await hours(E.values('title', { h: Extract('at', 'hour') }).orderBy('-h'))).toBe(
        'a:23 c:12 d:8 b:0 e:null'
      );
      expect(
        await hours(
          E.values('title', { h: Extract('at', 'hour') })
            .orderBy('-h')
            .slice(1, 3)
        )
      ).toBe('c:12 d:8');
      const years = await E.exclude({ at: null })
        .values('title', { y: Trunc('at', 'year') })
        .orderBy('-y', 'title')
        .limit(3);
      expect(years.map((row) => [row.title, row.y.toISOString().slice(0, 4)])).toEqual([
        ['b', '2026'],
        ['c', '2026'],
        ['a', '2025'],
      ]);
      expect(
        await E.exclude({ day: null })
          .valuesList({ m: Extract('day', 'month') }, { flat: true })
          .orderBy('-m')
      ).toEqual(
        (await E.exclude({ day: null }).valuesList({ m: Extract('day', 'month') }, { flat: true })).sort(
          (x, y) => y - x
        )
      );
      // A name that is not a key of values() is a field, as before.
      expect(() =>
        E.values({ h: Extract('at', 'hour') })
          .orderBy('hour')
          .toQuery()
      ).toThrow('Cannot resolve "hour"');
    });

    it('distinct(): the rows of values once, ordered and sliced; with names, the first object of each group', async () => {
      const B = Book.objects;
      expect(await B.values('genre').distinct().orderBy('genre').using(pdb)).toEqual([
        { genre: null },
        { genre: 'crime' },
        { genre: 'sf' },
      ]);
      expect(await B.valuesList('genre', 'year').distinct().orderBy('year', 'genre').using(pdb)).toEqual([
        ['crime', 2001],
        ['sf', 2001],
        [null, 2003],
        ['sf', 2003],
        ['crime', 2005],
      ]);
      const years = B.valuesList('year', { flat: true }).distinct();
      expect(await years.using(pdb).count()).toBe(3);
      expect(await years.orderBy('-year').limit(2).using(pdb)).toEqual([2005, 2003]);
      // Objects are distinct already.
      expect((await B.distinct().using(pdb)).length).toBe(5);
      // The longest book of each genre.
      expect((await B.orderBy('genre', '-pages').distinct('genre').using(pdb)).map((book) => book.title)).toEqual([
        'D',
        'E',
        'B',
      ]);
    });

    it('union(): one query of one model, or queries merged; each once, or all', async () => {
      const B = Book.objects.using(pdb);
      const one = B.filter({ pages__gt: 400 }).union(B.filter({ year: 2001 }));
      expect(one).toBeInstanceOf(QuerySet);
      expect((await one.orderBy('title')).map((book) => book.title)).toEqual(['A', 'B', 'C', 'D']);
      expect(await one.filter({ genre: 'sf' }).count()).toBe(2);
      expect(await B.filter({ year: 2001 }).union(B.all()).count()).toBe(5);
      const sliced = B.orderBy('-pages').limit(2).union(B.orderBy('pages').limit(2));
      expect(sliced).toBeInstanceOf(CombinedQuerySet);
      expect((await sliced.orderBy('title')).map((book) => book.title)).toEqual(['B', 'C', 'D', 'E']);
      expect(await sliced.count()).toBe(4);
      expect((await sliced.orderBy('-title').first()).title).toBe('E');
      expect((await sliced.orderBy('title').slice(1, 3)).map((book) => book.title)).toEqual(['C', 'D']);
      const all = B.filter({ genre: 'sf' }).union(B.filter({ year: 2003 }), { all: true });
      expect((await all.orderBy('-pages', 'title')).map((book) => book.title)).toEqual(['D', 'B', 'B', 'A']);
      expect(await all.count()).toBe(4);
      expect(await all.exists()).toBe(true);
      expect(
        await B.filter({ pages: 1 })
          .union(B.filter({ pages: 2 }), { all: true })
          .exists()
      ).toBe(false);
      // Values: each row once.
      const genres = B.values('genre')
        .filter({ year: 2001 })
        .union(B.values('genre').filter({ year: 2005 }));
      expect(await genres.orderBy('genre')).toEqual([{ genre: 'crime' }, { genre: 'sf' }]);
      const lists = B.valuesList('year', { flat: true })
        .limit(1)
        .union(B.valuesList('year', { flat: true }).orderBy('-year').limit(1));
      expect(await lists.orderBy('year')).toEqual([2001, 2005]);
      expect(() => B.union('nope')).toThrow(QueryError);
    });

    it('intersection() and difference(): one query of objects, or the rows compared (values by their values)', async () => {
      const B = Book.objects.using(pdb);
      const ids = async (qs) => (await qs.orderBy('title')).map((book) => book.title);
      const both = B.filter({ year: 2001 }).intersection(B.filter({ genre: 'sf' }));
      expect(both).toBeInstanceOf(QuerySet);
      expect(await ids(both)).toEqual(['A']);
      // A row whose condition is unknown (genre null) is not in the other query: the difference keeps it.
      const rest = B.filter({ year__lte: 2003 }).difference(B.filter({ genre: 'sf' }));
      expect(rest).toBeInstanceOf(QuerySet);
      expect(await ids(rest)).toEqual(['C', 'D']);
      expect(await rest.filter({ pages__gt: 500 }).count()).toBe(1);
      expect(await ids(B.all().difference(B.filter({ genre: 'sf' }), B.filter({ year: 2005 })))).toEqual(['C', 'D']);
      expect(await ids(B.all().intersection(B.filter({ year: 2005 })))).toEqual(['E']);
      expect(await B.filter({ year: 2001 }).difference(B.all()).count()).toBe(0);
      // Slices: the rows of each, compared.
      const top = B.orderBy('-pages').limit(3);
      const kept = top.intersection(B.filter({ year: 2003 }));
      expect(kept).toBeInstanceOf(CombinedQuerySet);
      expect(await ids(kept)).toEqual(['B', 'D']);
      expect(await ids(top.difference(B.filter({ genre: 'sf' })))).toEqual(['D']);
      expect(await top.difference(B.all()).exists()).toBe(false);
      // Values are compared by their values: crime is in the genres of 2005, so it is not in the difference.
      const of2001 = B.values('genre').filter({ year: 2001 });
      const of2005 = B.values('genre').filter({ year: 2005 });
      expect(await of2001.intersection(of2005)).toEqual([{ genre: 'crime' }]);
      expect(await of2001.difference(of2005)).toEqual([{ genre: 'sf' }]);
      // Combined with each other.
      expect(
        await ids(
          B.filter({ genre: 'sf' })
            .union(B.filter({ year: 2005 }))
            .difference(B.filter({ pages__gt: 400 }))
        )
      ).toEqual(['A', 'E']);
      expect(() => B.intersection()).toThrow(QueryError);
    });
  });
}

export { defineSuite, defineModels };
