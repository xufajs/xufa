import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import {
  Database,
  Databases,
  Tenants,
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
  MemoryCache,
  SharedCache,
  LocalCache,
  Cache,
  CacheBus,
  ModelOptions,
  withSignal,
  cached as keep,
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
  expectType<number>(await Book.query().recompute());
  // Computed fields: an expression or a function, stored or not.
  fields.decimal({ precision: 12, scale: 2, computed: 'price * quantity', stored: true });
  // Validation rules: expressions, functions, with messages.
  fields.integer({ validate: 'value >= 0' });
  fields.string({ validate: [{ rule: 'value.length >= 3', message: 'Too short.' }, (value: string) => value !== 'x'] });
  expectError(fields.integer({ validate: 3 }));
  const ruled: import('../../index').ModelOptions = {
    rules: ['end > start', { rule: 'seats <= 10', field: 'seats', message: 'Too many.' }, () => true],
  };
  expectType<number>(ruled.rules!.length);
  fields.string({ computed: (line: { product: string }) => line.product.toUpperCase(), uses: ['product'] });
  expectError(fields.integer({ computed: 1 }));
  for await (const item of Author.query()) expectType<Author>(item);
  expectType<Author>(await Author.create({ name: 'Ada' }));
  expectType<Promise<string[]>>(db.migrate({ dir: 'migrations' }));
  expectType<Promise<Record<string, number>>>(db.migrateDecimals());
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
expectType<Field<bigint, false, { mode: 'bigint' }>>(fields.bigint({ mode: 'bigint' }));
expectAssignable<Field<bigint, false>>(fields.bigint({ mode: 'bigint' }));
expectAssignable<Field<string, true>>(fields.bigint({ mode: 'string', null: true }));

// Tenants with several databases (a provider for each collection).
const tenants = new Tenants({
  models: [],
  routes: { Event: 'events' },
  config: (id) => ({ databases: { default: { backend: 'sqlite' }, events: { backend: 'memory' } }, routes: id === 'a' ? {} : { Event: 'default' } }),
});
expectType<Promise<number>>(tenants.run('acme', async () => 1));
expectType<Databases>(new Databases({ default: { backend: 'memory' } }, { routes: { Event: 'events' } }));

// The fs backend and its options.
expectType<Database>(new Database({ backend: 'fs', dir: 'data', layout: 'files', pretty: true, lock: false }));
expectError(new Database({ backend: 'fs', dir: 'data', layout: 'rows' }));
expectType<Database>(
  new Database({
    backend: 'fs',
    dir: 'content',
    watch: { delay: 100 },
    onChange: (tables) => expectType<string[]>(tables),
    onError: (err) => expectType<Error>(err),
  })
);
expectError(new Database({ backend: 'fs', dir: 'content', watch: 'yes' }));

// Caches: of a Database (`cache`, `name`), and of models (`cache`: true or { ttl, indexes }).
const memory = new MemoryCache({ max: 1000, ttl: 60000 });
expectAssignable<Cache>(memory);
expectType<number>(memory.size);
expectType<Promise<unknown>>(memory.get('key'));
expectType<unknown>(memory.getNow('key'));
expectType<Promise<void>>(memory.set('key', { a: 1 }, 1000));
expectType<Promise<void>>(memory.delete(['a', 'b']));
expectType<Promise<void>>(memory.clear('db1:'));
expectError(new MemoryCache({ max: '10' }));

declare const bus: CacheBus;
expectAssignable<Cache>(new SharedCache({ bus }));
expectAssignable<Cache>(new SharedCache({ bus, name: 'sessions', store: memory }));
expectAssignable<Cache>(new LocalCache({ bus, max: 100, ttl: 5000 }));
expectType<void>(new LocalCache({ bus }).deleteNow('key'));
expectError(new SharedCache({}));
expectError(new LocalCache());

// Any object of the four methods is a cache (the NetCache of @xufa/netcache: its own type tests).
const custom = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return undefined;
  },
  async set(key: string, value: unknown, ttl?: number) {},
  async delete(keys: string | string[]) {},
  async clear(prefix?: string) {},
};
expectAssignable<Cache>(custom);
expectNotAssignable<Cache>({ get: async (key: string) => undefined });

const cached = new Database({ backend: 'memory', name: 'main', cache: new SharedCache({ bus }) });
expectType<Cache | null>(cached.cache);
expectType<string>(cached.name);
expectError(new Database({ backend: 'memory', cache: 'memory' }));

expectAssignable<ModelOptions>({ cache: true });
expectAssignable<ModelOptions>({ cache: { ttl: 60000, indexes: ['email'] }, database: 'cache' });
expectNotAssignable<ModelOptions>({ cache: { indexes: 'email' } });
expectNotAssignable<ModelOptions>({ cache: 'yes' });
class CachedUser extends Model {
  static fields = { email: fields.string({ unique: true }) };
  static options: ModelOptions = { cache: { ttl: 30000, indexes: ['email'] } };
}
expectAssignable<ModelOptions>(CachedUser.options);

// The documentation of resources for @xufa/openapi.
resource(Tag, { openapi: { tag: 'Tags' } });
resource(Tag, { strict: true, readOnly: ['name'] });
expectError(resource(Tag, { strict: 'yes' }));
resource(Tag, { openapi: false });
expectError(resource(Tag, { openapi: 'yes' }));

// Reads that stop with a signal.
const controller = new AbortController();
expectType<QuerySet<Tag>>(Tag.query().signal(controller.signal));
expectType<QuerySet<Tag>>(Tag.query().filter({ name: 'a' }).signal(null));
expectType<Promise<number>>(withSignal(controller.signal, () => Tag.objects.count()));
expectError(Tag.objects.signal('abort'));
expectType<Promise<void>>(plugin({}, { database: new Database(), cancel: true }));
expectType<Promise<void>>(plugin({}, { tenants: { tenants, resolve: (request) => request.headers.tenant } }));
plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: async (request, id, reply) => id === 'x' } });
plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: false } });
expectError(plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: true } }));
expectError(plugin({}, { database: new Database(), cancel: 'yes' }));

// Results kept in caches.
expectType<QuerySet<Tag>>(Tag.query().filter({ name: 'a' }).cached({ ttl: 60000 }));
expectError(Tag.query().cached({ ttl: '1m' }));
const rates = keep(async (currency: string, day: Date) => ({ currency, rate: 1 }), { ttl: 1000, key: (currency) => currency });
expectType<Promise<{ currency: string; rate: number }>>(rates('EUR', new Date()));
expectType<Promise<void>>(rates.invalidate('EUR', new Date()));
expectType<Promise<void>>(rates.clear());
expectError(rates(1, new Date()));
keep(async () => 1, { cache: new MemoryCache(), name: "one" });

// Blob backends.
import { BlobValue as BlobValueType } from '../..';
class Upload extends Model {
  static fields = {
    key: fields.string({ primaryKey: true }),
    content: fields.blob(),
    size: fields.blobInfo('size'),
    updatedAt: fields.blobInfo('updatedAt'),
  };
}
declare const upload: Upload & { content: BlobValueType; size: number | null; updatedAt: Date | null };
expectType<Promise<Buffer>>(upload.content.buffer());
expectType<Promise<string>>(upload.content.url({ expiresIn: '10m' }));
new Database({ backend: 'disk', dir: 'files', url: (table, key) => `/files/${table}/${key}` });
new Database({ backend: 'memory-blob' });
expectError(fields.blobInfo('owner'));
new Database({ backend: 's3', bucket: 'uploads', region: 'eu-west-1', partSize: 16 * 1024 * 1024, publicUrl: 'https://cdn.example.com' });
new Database({ backend: 's3', bucket: 'b', endpoint: 'http://localhost:9000', credentials: { accessKeyId: 'k', secretAccessKey: 's' }, createBucket: true });

// Faults.
import { Faults as FaultsType, FaultRule, FaultError as FaultErrorType } from '../..';
declare const faultDb: Database;
expectType<FaultsType>(faultDb.faults);
const rule: FaultRule = faultDb.faults.fail({ operations: 'write', models: ['Order'], rate: 0.2, times: 3 });
expectType<number>(rule.hits);
faultDb.faults.delay({ operations: ['select', 'count'], ms: 200, jitter: 50 });
faultDb.faults.hang({ tenants: 'acme' }).release();
faultDb.faults.down().remove();
expectError(faultDb.faults.fail({ operations: 'drop' }));
expectError(faultDb.faults.delay({}));
expectType<503>({} as FaultErrorType['statusCode']);

// Faults of caches; onCacheError.
import { MemoryCache as MemoryCacheType } from '../..';
const faultyCache = new MemoryCacheType();
faultyCache.faults.fail({ operations: 'read', keys: 'db1:user:', rate: 0.1 });
new Database({ backend: 'memory', cache: faultyCache, onCacheError: (err, { operation }) => expectType<'get' | 'set'>(operation) });

// Model.schema(): typed from the fields, as JSON.
import { s, type Infer, type SchemaTypeProvider } from '@xufa/schema';
import xufaHttp from '@xufa/http';
const writerFields = { name: fields.string() };
class SchemaWriter extends Model {
  static fields = writerFields;
}
const schemaBookFields = {
  title: fields.string({ maxLength: 200 }),
  pages: fields.integer({ null: true }),
  status: fields.string({ choices: ['draft', 'published'] as const, default: 'draft' }),
  rating: fields.float({ default: 0 }),
  writer: fields.foreignKey(SchemaWriter),
  editor: fields.foreignKey(SchemaWriter, { null: true }),
  publishedAt: fields.datetime({ null: true }),
  createdAt: fields.datetime({ autoNowAdd: true }),
  cover: fields.bytes({ null: true }),
  total: fields.integer({ computed: 'pages * 2' }),
  tags: fields.manyToMany(SchemaWriter),
};
class SchemaBook extends Model {
  static fields = schemaBookFields;
}
const BookOut = SchemaBook.schema();
expectType<{
  title: string;
  writerId: number | string;
  id?: number | string;
  pages?: number | null;
  status?: 'draft' | 'published';
  rating?: number;
  editorId?: number | string | null;
  publishedAt?: string | null;
  createdAt?: string;
  cover?: string | null;
  total?: number;
}>({} as Infer<typeof BookOut>);
const NewBook = SchemaBook.schema({ input: true, additionalProperties: false });
expectNotAssignable<keyof Infer<typeof NewBook>>('total');
const BookPatch = s.partial(s.omit(NewBook, ['id', 'createdAt']));
expectType<string | undefined>(({} as Infer<typeof BookPatch>).title);
// A primary key of its own: no id.
class Isbn extends Model {
  static fields = { isbn: fields.string({ primaryKey: true }), uid: fields.uuid() };
}
const isbnSchema = Isbn.schema();
expectType<{ isbn: string; uid: string }>({} as Infer<typeof isbnSchema>);
class Keyed extends Model {
  static fields = { key: fields.uuid({ primaryKey: true }) };
}
const keyedSchema = Keyed.schema();
expectType<{ key?: string }>({} as Infer<typeof keyedSchema>);
// Routes typed by it.
xufaHttp()
  .withTypeProvider<SchemaTypeProvider>()
  .post('/books', { schema: { body: NewBook, response: { 201: BookOut } } }, async (request) => {
    expectType<string>(request.body.title);
    return { title: request.body.title, writerId: 1 };
  });

// fields.extend(): the fields of the parents, typed.
class Timestamped extends Model {
  static options = { abstract: true };
  static fields = { createdAt: fields.datetime({ autoNowAdd: true }), updatedAt: fields.datetime({ autoNow: true }) };
}
class Owned extends Timestamped {
  static options = { abstract: true };
  static fields = fields.extend(Timestamped, { owner: fields.foreignKey(SchemaWriter, { null: true }) });
}
const articleFields = fields.extend(Owned, { title: fields.string(), updatedAt: null });
// @ts-expect-error removing a field of a parent (null): the static side of the class is not that of its parent
class Article extends Owned {
  static fields = articleFields;
}
interface Article extends Fields<typeof articleFields> {}
class Post extends Owned {
  static fields = fields.extend(Owned, { title: fields.string({ maxLength: 80 }) });
}
const postSchema = Post.schema();
expectType<{ title: string; id?: number | string; createdAt?: string; updatedAt?: string; ownerId?: number | string | null }>(
  {} as Infer<typeof postSchema>
);
expectType<Date>(({} as Article).createdAt);
expectType<string>(({} as Article).title);
expectNotAssignable<keyof typeof articleFields>('updatedAt');
expectError(fields.extend({ fields: {} }, 1));
// Without fields.extend(), the fields of a child are not those of its parent (and its types would miss them).
// @ts-expect-error the static side of the child is not that of its parent
class PlainChild extends Timestamped {
  static fields = { title: fields.string() };
}

// Model.schema() and the options of the model: no automatic id without a primary key, or with a composite one.
class LogLine extends Model {
  static options = { primaryKey: false } as const;
  static fields = { line: fields.string() };
}
const logSchema = LogLine.schema();
expectType<{ line: string }>({} as Infer<typeof logSchema>);
class Pair extends Model {
  static options = { primaryKey: ['a', 'b'] } satisfies ModelOptions;
  static fields = { a: fields.integer(), b: fields.integer() };
}
const pairSchema = Pair.schema();
expectType<{ a: number; b: number }>({} as Infer<typeof pairSchema>);
class KeylessLine extends Model {
  static options = { primaryKey: false } satisfies ModelOptions;
  static fields = { line: fields.string() };
}
const keylessSchema = KeylessLine.schema();
expectType<{ line: string }>({} as Infer<typeof keylessSchema>);
// Written without as const, primaryKey is a boolean: the id stays (not required).
class Widened extends Model {
  static options = { primaryKey: false };
  static fields = { line: fields.string() };
}
const widenedSchema = Widened.schema();
expectType<{ line: string; id?: number | string }>({} as Infer<typeof widenedSchema>);
// Other options do not change it.
class Ordered extends Model {
  static options = { ordering: ['-at'], table: 'events' };
  static fields = { at: fields.datetime() };
}
const orderedSchema = Ordered.schema({ input: true });
expectType<{ at: string; id?: number | string }>({} as Infer<typeof orderedSchema>);
