import { expectType, expectError } from 'tsd';
import {
  Database,
  Model,
  fields,
  Field,
  Fields,
  QuerySet,
  RelatedSet,
  Q,
  JsonPath,
  jsonPath,
  or,
  F,
  Count,
  Sum,
  plugin,
  ValidationError,
  Keyring,
  setEncryptionKeys,
  generateEncryptionKey,
  reencrypt,
  resource,
  UniqueError,
} from '../..';

const tagFields = { name: fields.string({ unique: true }) };
class Tag extends Model {
  static fields = tagFields;
}
interface Tag extends Fields<typeof tagFields> {}

const authorFields = {
  name: fields.string({ maxLength: 100 }),
  email: fields.string({ null: true }),
  age: fields.integer({ null: true }),
  active: fields.boolean({ default: true }),
  createdAt: fields.datetime({ autoNowAdd: true }),
};
class Author extends Model {
  static fields = authorFields;
}
interface Author extends Fields<typeof authorFields> {}

const bookFields = {
  title: fields.string(),
  data: fields.json<{ pages: number }>(),
  author: fields.foreignKey(() => Author, { relatedName: 'books' }),
  editor: fields.foreignKey(() => Author, { null: true }),
  tags: fields.manyToMany(() => Tag, { relatedName: 'books' }),
};
class Book extends Model {
  static fields = bookFields;

  static options = { fillfactor: 80 };
}
interface Book extends Fields<typeof bookFields> {}

async function main() {
  const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Author, Book, Tag);
  expectType<Database>(await db.connect());

  const authors = await Author.query().filter({ age__gte: 18 }).orderBy('-name').limit(10);
  expectType<Author[]>(authors);
  expectType<string>(authors[0].name);
  expectType<string | null>(authors[0].email);
  expectType<number | null>(authors[0].age);
  expectType<boolean>(authors[0].active);
  expectType<Date>(authors[0].createdAt);

  const book = await Book.query().selectRelated('author').get({ pk: 1 });
  expectType<Book>(book);
  expectType<string>(book.title);
  expectType<{ pages: number }>(book.data);
  expectType<number | string>(book.authorId);
  expectType<Author | undefined>(book.author);
  expectType<number | string | null>(book.editorId);
  expectType<Author | null | undefined>(book.editor);
  expectType<RelatedSet<Tag>>(book.tags);
  expectType<void>(await book.tags.add(1, 2));
  expectType<Tag[]>(await book.tags);

  expectType<QuerySet<Author>>(Author.query().filter(or({ name: 'a' }, new Q({ age: 1 }).not())));
  expectType<number>(
    await Book.query()
      .filter({ author__name: 'Ada' })
      .update({ title: F('title') })
  );
  expectType<{ n: number; total: number | null }>(await Book.query().aggregate({ n: Count(), total: Sum('pages') }));
  expectType<[Author, boolean]>(await Author.query().getOrCreate({ name: 'Ada' }));
  for await (const item of Author.query()) expectType<Author>(item);
  expectType<Author>(await Author.create({ name: 'Ada' }));
  expectType<Promise<string[]>>(db.migrate({ dir: 'migrations' }));
  expectType<number>(await db.transaction(async () => 1));
  expectError(Author.query().limit('ten'));
  expectType<Record<string, string[]>>(new ValidationError('x', {}).errors);
  expectType<Promise<void>>(plugin({}, { database: db }));
}

void main;

// A model without a primary key.
class Keyless extends Model {
  static fields = { level: fields.string() };

  static options = { primaryKey: false as const };
}
expectType<typeof Keyless>(Keyless);

// Encrypted fields: the values of their base field.
const secretFields = {
  ssn: fields.encrypted(fields.string({ maxLength: 11 })),
  email: fields.encrypted(fields.string(), { deterministic: true, unique: true, null: true }),
  profile: fields.encrypted(fields.json<{ languages: string[] }>()),
  legacy: fields.encrypted(fields.text(), { acceptPlaintext: true, context: 'old_table.notes' }),
};
class Secret extends Model {
  static fields = secretFields;
}
interface Secret extends Fields<typeof secretFields> {}
declare const secret: Secret;
expectType<string>(secret.ssn);
expectType<string | null>(secret.email);
expectType<{ languages: string[] }>(secret.profile);
expectError(fields.encrypted(fields.string(), { primaryKey: true }));
expectType<Keyring | null>(setEncryptionKeys({ current: 'k2', keys: { k2: generateEncryptionKey(), k1: Buffer.alloc(32) } }));
expectType<Promise<number>>(reencrypt(Secret, { batchSize: 100 }));

// TTL indexes.
class Event extends Model {
  static fields = { at: fields.datetime() };

  static options = { indexes: [{ fields: ['at'], expireAfter: '30d' }] };
}
declare const eventsDb: Database;
expectType<Promise<Record<string, number>>>(eventsDb.expire({ now: new Date() }));
expectType<Database>(eventsDb.startExpiry({ interval: '5m', onError: (err) => console.error(err.message) }));
expectType<Promise<void>>(plugin({}, { database: eventsDb, expire: { interval: 60 } }));
expectError(eventsDb.startExpiry({ interval: true }));
void Event;

// Resources.
expectType<(app: any) => Promise<void>>(
  resource(Author, {
    actions: ['list', 'get', 'create'],
    queryset: () => Author.query().filter({ active: true }),
    filters: { age: ['gte', 'lte'], name: 'icontains' },
    ordering: ['name'],
    search: ['name'],
    auth: { create: 'admin' },
    hooks: { beforeCreate: (values) => ({ ...values, active: true }) },
    serialize: (author) => ({ name: author.name }),
  })
);
expectError(resource(Author, { actions: ['destroy'] }));
expectType<string[]>(new UniqueError('x').fields);

// Paths inside json fields as lists of keys and indexes.
expectType<JsonPath>(jsonPath('data', ['in', 0], 1));
expectType<JsonPath>(jsonPath('data', ['a__b'], 2, 'gte'));
expectError(jsonPath('data', [true], 1));

// The modes of bigints.
expectType<Field<number | bigint, false>>(fields.bigint());
expectType<Field<bigint, false>>(fields.bigint({ mode: 'bigint' }));
expectType<Field<string, true>>(fields.bigint({ mode: 'string', null: true }));
