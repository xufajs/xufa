// The SQL compiler keeps the queries it compiles by shape and then only makes their parameters: for queries of every
// kind, with other values, it gives the SQL and parameters of a new compile.
const { Database, Model, fields, or, F } = require('..');
const { SqlCompiler } = require('../lib/backends/sql/compiler');
const { sqlite, postgres } = require('../lib/backends/sql/dialects');

class Publisher extends Model {
  static fields = { name: fields.string() };

  static options = { table: 'cc_publisher' };
}

class Author extends Model {
  static fields = {
    name: fields.string(),
    active: fields.boolean({ default: true }),
    born: fields.datetime({ null: true }),
    publisher: fields.foreignKey(Publisher, { null: true, relatedName: 'authors' }),
  };

  static options = { table: 'cc_author' };
}

class Book extends Model {
  static fields = {
    title: fields.string(),
    pages: fields.integer(),
    rating: fields.float({ null: true }),
    data: fields.json({ null: true }),
    author: fields.foreignKey(Author, { relatedName: 'books' }),
  };

  static options = { table: 'cc_book', ordering: ['title'] };
}

class Edition extends Model {
  static fields = {
    book: fields.foreignKey(Book, { dbOnDelete: 'cascade', dbOnUpdate: 'cascade', relatedName: 'editions' }),
  };
}

new Database({ backend: 'memory' }).register(Publisher, Author, Book, Edition);

// Queries made with a value: each is compiled with two values, the second time from the kept compile.
const QUERIES = {
  all: () => Book.objects.all(),
  exact: (n) => Book.objects.filter({ pages: n }),
  comparisons: (n) => Book.objects.filter({ pages__gt: n, pages__lte: n * 2, rating__lt: n / 10 }),
  in: (n) => Book.objects.filter({ pages__in: [n, n + 1, n + 2] }),
  'in, other length': (n) => Book.objects.filter({ pages__in: Array.from({ length: n % 5 }, (_, i) => i + n) }),
  range: (n) => Book.objects.filter({ pages__range: [n, n + 10] }),
  isnull: (n) => Book.objects.filter({ rating__isnull: n % 2 === 0 }),
  'text lookups': (n) =>
    Book.objects.filter({
      title__contains: `t${n}`,
      title__istartswith: n % 2 ? '' : `A${n}`,
      title__endswith: `${n}`,
      title__iexact: `X${n}`,
    }),
  'like and ilike': (n) => Book.objects.filter({ title__like: `%a${n}_*`, title__ilike: `B[${n}]%` }),
  'datetime and boolean': (n) => Author.objects.filter({ born__gte: new Date(n * 1000), active: n % 2 === 0 }),
  'json field': (n) => Book.objects.filter({ data: { n } }),
  'json paths': (n) =>
    Book.objects.filter({
      data__owner__age__gte: n,
      data__tags__0: `t${n}`,
      data__active: n % 2 === 0,
      data__x__in: [n, n + 1],
    }),
  'or and not': (n) => Book.objects.filter(or({ pages: n }, { title: `t${n}` })).exclude({ rating__gt: n }),
  'across relations': (n) => Book.objects.filter({ author__name: `a${n}`, author__publisher__name: `p${n}` }),
  'reverse relations (exists)': (n) => Author.objects.filter({ books__pages__gte: n, books__title__contains: `${n}` }),
  'nested exists': (n) => Publisher.objects.filter({ authors__books__pages: n }),
  'order, limit and offset': (n) =>
    Book.objects
      .filter({ pages__gte: n })
      .orderBy('-rating', 'author__name')
      .slice(n, n + 5),
  'offset only': (n) => Book.objects.all().offset(n + 1),
  'limit only': (n) => Book.objects.all().limit(n + 1),
  only: (n) => Book.objects.only('title').filter({ pages: n }),
  values: (n) => Book.objects.values('title', 'author__name').filter({ pages: n }),
  valuesList: (n) => Book.objects.valuesList('pages', { flat: true }).filter({ pages__lt: n }),
  selectRelated: (n) => Book.objects.selectRelated('author__publisher').filter({ pages: n }).limit(n),
  'F expressions (not kept)': (n) => Book.objects.filter({ pages__gt: F('rating').add(n) }),
  'pk of an object': (n) => Book.objects.filter({ author: Object.assign(new Author({ name: 'x' }), { id: n }) }),
  'locked rows': (n) => Book.objects.filter({ pages: n }).selectForUpdate({ skipLocked: n % 2 === 0 }),
};

describe.each([
  ['sqlite', sqlite],
  ['postgres', postgres],
])('the compiled queries of %s', (name, dialect) => {
  Object.entries(QUERIES).forEach(([label, make]) => {
    it(`gives the SQL and parameters of a new compile: ${label}`, () => {
      const kept = new SqlCompiler(dialect);
      [3, 8, 12].forEach((n) => {
        const query = make(n).toQuery();
        const fresh = new SqlCompiler(dialect);
        const expected = fresh.select(query);
        const actual = kept.select(query);
        expect(actual.sql).toBe(expected.sql);
        expect(actual.params).toEqual(expected.params);
        const count = kept.count(query);
        const freshCount = fresh.count(query);
        expect(count.sql).toBe(freshCount.sql);
        expect(count.params).toEqual(freshCount.params);
      });
    });
  });

  it('locks the rows of the model (PostgreSQL)', () => {
    const { sql } = new SqlCompiler(dialect).select(
      Book.objects
        .selectRelated('author')
        .filter({ pages: 1 })
        .selectForUpdate({ skipLocked: true, of: 'self' })
        .toQuery()
    );
    if (dialect === postgres) expect(sql).toMatch(/ FOR UPDATE OF t0 SKIP LOCKED$/);
    else expect(sql).not.toMatch(/FOR UPDATE/);
  });

  it('writes ON DELETE and ON UPDATE of foreign keys', () => {
    const compiler = new SqlCompiler(dialect);
    const [table] = compiler.createTable(Edition.meta, new Set(['cc_book']));
    expect(table).toMatch(/REFERENCES "cc_book" \("id"\) ON DELETE CASCADE ON UPDATE CASCADE/);
  });

  it('writes partial indexes and the conflicts of their rows', () => {
    const compiler = new SqlCompiler(dialect);
    const index = { name: 'one_live', columns: ['author_id'], unique: true, condition: '"deleted" IS NULL' };
    expect(compiler.createIndex({ table: 'books' }, index)).toMatch(
      /ON "books" \("author_id"\) WHERE "deleted" IS NULL$/
    );
    const conflict = { fields: [Book.meta.field('title')], update: [Book.meta.field('pages')], where: '"pages" > 0' };
    expect(compiler.onConflict(Book.meta, conflict)).toBe(
      ' ON CONFLICT ("title") WHERE "pages" > 0 DO UPDATE SET "pages" = excluded."pages"'
    );
  });

  it('keeps one compile for every shape', () => {
    const compiler = new SqlCompiler(dialect);
    const first = compiler.select(Book.objects.filter({ pages: 1 }).toQuery());
    const second = compiler.select(Book.objects.filter({ pages: 2 }).toQuery());
    expect(second.make).toBe(first.make);
    expect(compiler.plans.get(Book.meta).size).toBe(1);
  });
});
