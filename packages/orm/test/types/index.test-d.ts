import { assertType, expectTypeOf } from '@xufa/test';
import {
  Lower,
  Paginator,
  Page,
  Database,
  maintenance,
  MaintenanceState,
  Extract,
  Trunc,
  Raw,
  RawSql,
  Databases,
  Tenants,
  Model,
  modelOptions,
  AuditEntry,
  AuditChange,
  fields,
  factory,
  sequence,
  Field,
  Fields,
  QuerySet,
  rollbackEach,
  ScopedQuerySet,
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
  expectTypeOf(await db.connect()).toEqualTypeOf<Database>();

  const authors = await Author.query().filter({ age__gte: 18 }).orderBy('-name').limit(10);
  expectTypeOf(authors).toEqualTypeOf<Author[]>();
  expectTypeOf(authors[0].name).toEqualTypeOf<string>();
  expectTypeOf(authors[0].email).toEqualTypeOf<string | null>();
  expectTypeOf(authors[0].age).toEqualTypeOf<number | null>();
  expectTypeOf(authors[0].active).toEqualTypeOf<boolean>();
  expectTypeOf(authors[0].createdAt).toEqualTypeOf<Date>();

  const book = await Book.query().selectRelated('author').get({ pk: 1 });
  expectTypeOf(book).toEqualTypeOf<Book>();
  expectTypeOf(book.title).toEqualTypeOf<string>();
  expectTypeOf(book.data).toEqualTypeOf<{ pages: number }>();
  expectTypeOf(book.authorId).toEqualTypeOf<number | string>();
  expectTypeOf(book.author).toEqualTypeOf<Author | undefined>();
  expectTypeOf(book.editorId).toEqualTypeOf<number | string | null>();
  expectTypeOf(book.editor).toEqualTypeOf<Author | null | undefined>();
  expectTypeOf(book.tags).toEqualTypeOf<RelatedSet<Tag>>();
  expectTypeOf(await book.tags.add(1, 2)).toEqualTypeOf<void>();
  expectTypeOf(await book.tags).toEqualTypeOf<Tag[]>();

  expectTypeOf(Author.query().filter(or({ name: 'a' }, new Q({ age: 1 }).not()))).toEqualTypeOf<QuerySet<Author>>();
  expectTypeOf(await Book.query()
      .filter({ author__name: 'Ada' })
      .update({ title: F('title') })).toEqualTypeOf<number>();
  expectTypeOf(await Book.query().aggregate({ n: Count(), total: Sum('pages') })).toEqualTypeOf<{ n: number; total: number | null }>();
  expectTypeOf(await Author.query().getOrCreate({ name: 'Ada' })).toEqualTypeOf<[Author, boolean]>();
  expectTypeOf(await Book.query().recompute()).toEqualTypeOf<number>();
  // Computed fields: an expression or a function, stored or not.
  fields.decimal({ precision: 12, scale: 2, computed: 'price * quantity', stored: true });
  // Validation rules: expressions, functions, with messages.
  fields.integer({ validate: 'value >= 0' });
  fields.string({ validate: [{ rule: 'value.length >= 3', message: 'Too short.' }, (value: string) => value !== 'x'] });
  // @ts-expect-error
  fields.integer({ validate: 3 });
  const ruled: import('../../index').ModelOptions = {
    rules: ['end > start', { rule: 'seats <= 10', field: 'seats', message: 'Too many.' }, () => true],
  };
  expectTypeOf(ruled.rules!.length).toEqualTypeOf<number>();
  fields.string({ computed: (line: { product: string }) => line.product.toUpperCase(), uses: ['product'] });
  // @ts-expect-error
  fields.integer({ computed: 1 });
  for await (const item of Author.query()) expectTypeOf(item).toEqualTypeOf<Author>();
  expectTypeOf(await Author.create({ name: 'Ada' })).toEqualTypeOf<Author>();
  expectTypeOf(db.migrate({ dir: 'migrations' })).toEqualTypeOf<Promise<string[]>>();
  expectTypeOf(db.migrateDecimals()).toEqualTypeOf<Promise<Record<string, number>>>();
  expectTypeOf(await db.transaction(async () => 1)).toEqualTypeOf<number>();
  // @ts-expect-error
  Author.query().limit('ten');
  expectTypeOf(new ValidationError('x', {}).errors).toEqualTypeOf<Record<string, string[]>>();
  expectTypeOf(plugin({}, { database: db })).toEqualTypeOf<Promise<void>>();
}

void main;

// A model without a primary key.
class Keyless extends Model {
  static fields = { level: fields.string() };

  static options = { primaryKey: false as const };
}
expectTypeOf(Keyless).toEqualTypeOf<typeof Keyless>();

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
expectTypeOf(secret.ssn).toEqualTypeOf<string>();
expectTypeOf(secret.email).toEqualTypeOf<string | null>();
expectTypeOf(secret.profile).toEqualTypeOf<{ languages: string[] }>();
// @ts-expect-error
fields.encrypted(fields.string(), { primaryKey: true });
expectTypeOf(setEncryptionKeys({ current: 'k2', keys: { k2: generateEncryptionKey(), k1: Buffer.alloc(32) } })).toEqualTypeOf<Keyring | null>();
expectTypeOf(reencrypt(Secret, { batchSize: 100 })).toEqualTypeOf<Promise<number>>();

// TTL indexes.
class Event extends Model {
  static fields = { at: fields.datetime() };

  static options = { indexes: [{ fields: ['at'], expireAfter: '30d' }] };
}
declare const eventsDb: Database;
expectTypeOf(eventsDb.expire({ now: new Date() })).toEqualTypeOf<Promise<Record<string, number>>>();
expectTypeOf(eventsDb.startExpiry({ interval: '5m', onError: (err) => console.error(err.message) })).toEqualTypeOf<Database>();
expectTypeOf(plugin({}, { database: eventsDb, expire: { interval: 60 } })).toEqualTypeOf<Promise<void>>();
// @ts-expect-error
eventsDb.startExpiry({ interval: true });
void Event;

// Resources.
expectTypeOf(resource(Author, {
    actions: ['list', 'get', 'create'],
    queryset: () => Author.query().filter({ active: true }),
    filters: { age: ['gte', 'lte'], name: 'icontains' },
    ordering: ['name'],
    search: ['name'],
    auth: { create: 'admin' },
    hooks: { beforeCreate: (values) => ({ ...values, active: true }) },
    serialize: (author) => ({ name: author.name }),
  })).toEqualTypeOf<(app: any) => Promise<void>>();
// @ts-expect-error
resource(Author, { actions: ['destroy'] });
resource(Author, { permissions: true, auth: { list: false } });
resource(Author, { permissions: 'authors' });
// @ts-expect-error
resource(Author, { permissions: 3 });
expectTypeOf(new UniqueError('x').fields).toEqualTypeOf<string[]>();

// Paths inside json fields as lists of keys and indexes.
expectTypeOf(jsonPath('data', ['in', 0], 1)).toEqualTypeOf<JsonPath>();
expectTypeOf(jsonPath('data', ['a__b'], 2, 'gte')).toEqualTypeOf<JsonPath>();
// @ts-expect-error
jsonPath('data', [true], 1);

// The modes of bigints.
expectTypeOf(fields.bigint()).toEqualTypeOf<
  Field<number | bigint, false, import('../..').FieldOptions<number | bigint> & { mode?: 'number' }>
>();
expectTypeOf(fields.bigint({ mode: 'bigint' })).toEqualTypeOf<Field<bigint, false, { mode: 'bigint' }>>();
assertType<Field<bigint, false>>(fields.bigint({ mode: 'bigint' }));
assertType<Field<string, true>>(fields.bigint({ mode: 'string', null: true }));

// Tenants with several databases (a provider for each collection).
const tenants = new Tenants({
  models: [],
  routes: { Event: 'events' },
  config: (id) => ({
    databases: { default: { backend: 'sqlite' }, events: { backend: 'memory' } },
    routes: id === 'a' ? {} : { Event: 'default' },
  }),
});
expectTypeOf(tenants.run('acme', async () => 1)).toEqualTypeOf<Promise<number>>();
expectTypeOf(new Databases({ default: { backend: 'memory' } }, { routes: { Event: 'events' } })).toEqualTypeOf<Databases>();

// The fs backend and its options.
expectTypeOf(new Database({ backend: 'fs', dir: 'data', layout: 'files', pretty: true, lock: false })).toEqualTypeOf<Database>();
// @ts-expect-error
new Database({ backend: 'fs', dir: 'data', layout: 'rows' });
expectTypeOf(new Database({
    backend: 'fs',
    dir: 'content',
    watch: { delay: 100 },
    onChange: (tables) => expectTypeOf(tables).toEqualTypeOf<string[]>(),
    onError: (err) => expectTypeOf(err).toEqualTypeOf<Error>(),
  })).toEqualTypeOf<Database>();
// @ts-expect-error
new Database({ backend: 'fs', dir: 'content', watch: 'yes' });

// Caches: of a Database (`cache`, `name`), and of models (`cache`: true or { ttl, indexes }).
const memory = new MemoryCache({ max: 1000, ttl: 60000 });
assertType<Cache>(memory);
expectTypeOf(memory.size).toEqualTypeOf<number>();
expectTypeOf(memory.get('key')).toEqualTypeOf<Promise<unknown>>();
expectTypeOf(memory.getNow('key')).toEqualTypeOf<unknown>();
expectTypeOf(memory.set('key', { a: 1 }, 1000)).toEqualTypeOf<Promise<void>>();
expectTypeOf(memory.delete(['a', 'b'])).toEqualTypeOf<Promise<void>>();
expectTypeOf(memory.clear('db1:')).toEqualTypeOf<Promise<void>>();
// @ts-expect-error
new MemoryCache({ max: '10' });

declare const bus: CacheBus;
assertType<Cache>(new SharedCache({ bus }));
assertType<Cache>(new SharedCache({ bus, name: 'sessions', store: memory }));
assertType<Cache>(new LocalCache({ bus, max: 100, ttl: 5000 }));
expectTypeOf(new LocalCache({ bus }).deleteNow('key')).toEqualTypeOf<void>();
// @ts-expect-error
new SharedCache({});
// @ts-expect-error
new LocalCache();

// Any object of the four methods is a cache (the NetCache of @xufa/netcache: its own type tests).
const custom = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return undefined;
  },
  async set(key: string, value: unknown, ttl?: number) {},
  async delete(keys: string | string[]) {},
  async clear(prefix?: string) {},
};
assertType<Cache>(custom);
// @ts-expect-error
assertType<Cache>({ get: async (key: string) => undefined });

const cached = new Database({ backend: 'memory', name: 'main', cache: new SharedCache({ bus }) });
expectTypeOf(cached.cache).toEqualTypeOf<Cache | null>();
expectTypeOf(cached.name).toEqualTypeOf<string>();
// @ts-expect-error
new Database({ backend: 'memory', cache: 'memory' });

assertType<ModelOptions>({ cache: true });
assertType<ModelOptions>({ cache: { ttl: 60000, indexes: ['email'] }, database: 'cache' });
// @ts-expect-error
assertType<ModelOptions>({ cache: { indexes: 'email' } });
// @ts-expect-error
assertType<ModelOptions>({ cache: 'yes' });
class CachedUser extends Model {
  static fields = { email: fields.string({ unique: true }) };
  static options: ModelOptions = { cache: { ttl: 30000, indexes: ['email'] } };
}
assertType<ModelOptions>(CachedUser.options);

// The documentation of resources for @xufa/openapi.
resource(Tag, { openapi: { tag: 'Tags' } });
resource(Tag, { strict: true, readOnly: ['name'] });
// @ts-expect-error
resource(Tag, { strict: 'yes' });
resource(Tag, { openapi: false });
// @ts-expect-error
resource(Tag, { openapi: 'yes' });

// Reads that stop with a signal.
const controller = new AbortController();
expectTypeOf(Tag.query().signal(controller.signal)).toEqualTypeOf<QuerySet<Tag>>();
expectTypeOf(Tag.query().filter({ name: 'a' }).signal(null)).toEqualTypeOf<QuerySet<Tag>>();
expectTypeOf(withSignal(controller.signal, () => Tag.objects.count())).toEqualTypeOf<Promise<number>>();
// @ts-expect-error
Tag.objects.signal('abort');
expectTypeOf(plugin({}, { database: new Database(), cancel: true })).toEqualTypeOf<Promise<void>>();
expectTypeOf(plugin({}, { tenants: { tenants, resolve: (request) => request.headers.tenant } })).toEqualTypeOf<Promise<void>>();
plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: async (request, id, reply) => id === 'x' } });
plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: false } });
// @ts-expect-error
plugin({}, { tenants: { tenants, resolve: () => 'x', authorize: true } });
// @ts-expect-error
plugin({}, { database: new Database(), cancel: 'yes' });

// Results kept in caches.
expectTypeOf(Tag.query().filter({ name: 'a' }).cached({ ttl: 60000 })).toEqualTypeOf<QuerySet<Tag>>();
// @ts-expect-error
Tag.query().cached({ ttl: '1m' });
const rates = keep(async (currency: string, day: Date) => ({ currency, rate: 1 }), {
  ttl: 1000,
  key: (currency) => currency,
});
expectTypeOf(rates('EUR', new Date())).toEqualTypeOf<Promise<{ currency: string; rate: number }>>();
expectTypeOf(rates.invalidate('EUR', new Date())).toEqualTypeOf<Promise<void>>();
expectTypeOf(rates.clear()).toEqualTypeOf<Promise<void>>();
// @ts-expect-error
rates(1, new Date());
keep(async () => 1, { cache: new MemoryCache(), name: 'one' });

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
expectTypeOf(upload.content.buffer()).toEqualTypeOf<Promise<Buffer>>();
expectTypeOf(upload.content.url({ expiresIn: '10m' })).toEqualTypeOf<Promise<string>>();
new Database({ backend: 'disk', dir: 'files', url: (table, key) => `/files/${table}/${key}` });
new Database({ backend: 'memory-blob' });
// @ts-expect-error
fields.blobInfo('owner');
new Database({
  backend: 's3',
  bucket: 'uploads',
  region: 'eu-west-1',
  partSize: 16 * 1024 * 1024,
  publicUrl: 'https://cdn.example.com',
});
new Database({
  backend: 's3',
  bucket: 'b',
  endpoint: 'http://localhost:9000',
  credentials: { accessKeyId: 'k', secretAccessKey: 's' },
  createBucket: true,
});

// Faults.
import { Faults as FaultsType, FaultRule, FaultError as FaultErrorType } from '../..';
declare const faultDb: Database;
expectTypeOf(faultDb.faults).toEqualTypeOf<FaultsType>();
const rule: FaultRule = faultDb.faults.fail({ operations: 'write', models: ['Order'], rate: 0.2, times: 3 });
expectTypeOf(rule.hits).toEqualTypeOf<number>();
faultDb.faults.delay({ operations: ['select', 'count'], ms: 200, jitter: 50 });
faultDb.faults.hang({ tenants: 'acme' }).release();
faultDb.faults.down().remove();
// @ts-expect-error
faultDb.faults.fail({ operations: 'drop' });
// @ts-expect-error
faultDb.faults.delay({});
expectTypeOf({} as FaultErrorType['statusCode']).toEqualTypeOf<503>();

// Faults of caches; onCacheError.
import { MemoryCache as MemoryCacheType } from '../..';
const faultyCache = new MemoryCacheType();
faultyCache.faults.fail({ operations: 'read', keys: 'db1:user:', rate: 0.1 });
new Database({
  backend: 'memory',
  cache: faultyCache,
  onCacheError: (err, { operation }) => expectTypeOf(operation).toEqualTypeOf<'get' | 'set'>(),
});

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
expectTypeOf({} as Infer<typeof BookOut>).toEqualTypeOf<{
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
}>();
const NewBook = SchemaBook.schema({ input: true, additionalProperties: false });
// @ts-expect-error
assertType<keyof Infer<typeof NewBook>>('total');
const BookPatch = s.partial(s.omit(NewBook, ['id', 'createdAt']));
expectTypeOf(({} as Infer<typeof BookPatch>).title).toEqualTypeOf<string | undefined>();
// A primary key of its own: no id.
class Isbn extends Model {
  static fields = { isbn: fields.string({ primaryKey: true }), uid: fields.uuid() };
}
const isbnSchema = Isbn.schema();
expectTypeOf({} as Infer<typeof isbnSchema>).toEqualTypeOf<{ isbn: string; uid: string }>();
class Keyed extends Model {
  static fields = { key: fields.uuid({ primaryKey: true }) };
}
const keyedSchema = Keyed.schema();
expectTypeOf({} as Infer<typeof keyedSchema>).toEqualTypeOf<{ key?: string }>();
// Routes typed by it.
xufaHttp()
  .withTypeProvider<SchemaTypeProvider>()
  .post('/books', { schema: { body: NewBook, response: { 201: BookOut } } }, async (request) => {
    expectTypeOf(request.body.title).toEqualTypeOf<string>();
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
expectTypeOf({} as Infer<typeof postSchema>).toEqualTypeOf<{
  title: string;
  id?: number | string;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: number | string | null;
}>();
expectTypeOf(({} as Article).createdAt).toEqualTypeOf<Date>();
expectTypeOf(({} as Article).title).toEqualTypeOf<string>();
// @ts-expect-error
assertType<keyof typeof articleFields>('updatedAt');
// @ts-expect-error
fields.extend({ fields: {} }, 1);
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
expectTypeOf({} as Infer<typeof logSchema>).toEqualTypeOf<{ line: string }>();
class Pair extends Model {
  static options = { primaryKey: ['a', 'b'] } satisfies ModelOptions;
  static fields = { a: fields.integer(), b: fields.integer() };
}
const pairSchema = Pair.schema();
expectTypeOf({} as Infer<typeof pairSchema>).toEqualTypeOf<{ a: number; b: number }>();
class KeylessLine extends Model {
  static options = { primaryKey: false } satisfies ModelOptions;
  static fields = { line: fields.string() };
}
const keylessSchema = KeylessLine.schema();
expectTypeOf({} as Infer<typeof keylessSchema>).toEqualTypeOf<{ line: string }>();
// Written without as const, primaryKey is a boolean: the id stays (not required).
class Widened extends Model {
  static options = { primaryKey: false };
  static fields = { line: fields.string() };
}
const widenedSchema = Widened.schema();
expectTypeOf({} as Infer<typeof widenedSchema>).toEqualTypeOf<{ line: string; id?: number | string }>();
// Other options do not change it.
class Ordered extends Model {
  static options = { ordering: ['-at'], table: 'events' };
  static fields = { at: fields.datetime() };
}
const orderedSchema = Ordered.schema({ input: true });
expectTypeOf({} as Infer<typeof orderedSchema>).toEqualTypeOf<{ at: string; id?: number | string }>();
// modelOptions(): the values kept without as const, the names checked.
class KeptPair extends Model {
  static options = modelOptions({ primaryKey: ['a', 'b'] });
  static fields = { a: fields.integer(), b: fields.integer() };
}
const keptPairSchema = KeptPair.schema();
expectTypeOf({} as Infer<typeof keptPairSchema>).toEqualTypeOf<{ a: number; b: number }>();
class KeptKeyless extends Model {
  static options = modelOptions({ primaryKey: false, table: 'log_lines', ordering: ['-line'] });
  static fields = { line: fields.string() };
}
const keptKeylessSchema = KeptKeyless.schema();
expectTypeOf({} as Infer<typeof keptKeylessSchema>).toEqualTypeOf<{ line: string }>();
class KeptOrdered extends Model {
  static options = modelOptions({ ordering: '-at', cache: { ttl: 1000 } });
  static fields = { at: fields.datetime() };
}
const keptOrderedSchema = KeptOrdered.schema({ input: true });
expectTypeOf({} as Infer<typeof keptOrderedSchema>).toEqualTypeOf<{ at: string; id?: number | string }>();
// @ts-expect-error
modelOptions({ primarykey: false });
// @ts-expect-error
modelOptions({ table: 'books', ordring: ['title'] });
// @ts-expect-error
modelOptions({ primaryKey: 'id' });
// @ts-expect-error
modelOptions({ cache: { ttl: '1s' } });
// Every option, the lists too (rules, indexes).
class KeptAll extends Model {
  static options = modelOptions({
    table: 'events',
    schema: 'audit',
    ordering: ['-at'],
    rules: ['at != null', { rule: 'at != null', message: 'needs a date', field: 'at' }],
    indexes: [['at'], { fields: ['at'], expireAfter: '30d' }],
    abstract: false,
    strict: true,
    cache: true,
    database: 'logs',
  });
  static fields = { at: fields.datetime() };
}
assertType<ModelOptions>(KeptAll.options);
// The audit log.
const audited = new Database({
  backend: 'memory',
  audit: { redact: ['password'], retain: '365d', exclude: ['Session'] },
});
expectTypeOf(new Database({ backend: 'memory', audit: true }).audit!.retain).toEqualTypeOf<number | null>();
if (audited.audit) {
  const log = audited.audit;
  expectTypeOf(log.with({ actor: 'u1', requestId: 'r1' }, async () => 1)).toEqualTypeOf<Promise<number>>();
  expectTypeOf(log.log('export', { rows: 3 })).toEqualTypeOf<Promise<void>>();
  const entries = await log.entries({ model: 'Book', action: 'update', since: new Date() });
  expectTypeOf(entries).toEqualTypeOf<AuditEntry[]>();
  expectTypeOf(entries[0].changes).toEqualTypeOf<AuditChange[] | null>();
  expectTypeOf(entries[0].actor).toEqualTypeOf<string | null>();
}
// @ts-expect-error
new Database({ audit: { retain: true } });
// @ts-expect-error
fields.string({ audit: 'hide' });
assertType<ModelOptions>({ audit: false });

// The audit log over HTTP: auth is required.
import { auditResource } from '../..';
expectTypeOf(auditResource({ auth: 'admin' })).toEqualTypeOf<(app: any) => Promise<void>>();
expectTypeOf(auditResource({ auth: false, pageSize: 20 })).toEqualTypeOf<(app: any) => Promise<void>>();
// @ts-expect-error
auditResource({});

// Factories, soft deletes, defer and inBulk.
{
  class Pet extends Model {
    static fields = { name: fields.string(), color: fields.string() };
  }
  const Pets = factory(
    Pet,
    { name: (n: number) => `Pet ${n}`, color: sequence(['red', 'green']) },
    { states: { red: { color: 'red' } } }
  );
  expectTypeOf(Pets.state('red').create()).toEqualTypeOf<Promise<Pet>>();
  expectTypeOf(Pets.createMany(2)).toEqualTypeOf<Promise<Pet[]>>();
  expectTypeOf(Pets.make()).toEqualTypeOf<Promise<Pet>>();
  expectTypeOf(Pet.query().withDeleted().restore()).toEqualTypeOf<Promise<number>>();
  expectTypeOf(new Pet().forceDelete()).toEqualTypeOf<Promise<number>>();
  expectTypeOf(new Pet().isDeleted).toEqualTypeOf<boolean>();
  expectTypeOf(Pet.query().defer('color').inBulk([1])).toEqualTypeOf<Promise<Map<unknown, Pet>>>();
}

// ping() and the store of the maintenance mode.
{
  const db = new Database({ backend: 'memory' });
  expectTypeOf(db.ping()).toEqualTypeOf<Promise<number>>();
  const store = maintenance(db, { key: 'app' });
  expectTypeOf(store.get()).toEqualTypeOf<Promise<MaintenanceState | null>>();
  store.set({ message: 'soon', retryAfter: 60, allow: ['10.0.0.1'] });
}

// distinct(), union() and the parts of dates.
{
  class Post extends Model {}
  const genres = Post.objects.values<{ genre: string }>('genre').distinct();
  expectTypeOf(genres).toEqualTypeOf<QuerySet<{ genre: string }>>();
  Post.objects.orderBy('author', '-at').distinct('author');
  const both = Post.objects
    .filter({ at__month: 12, at__week_day__in: [1, 7] })
    .union(Post.objects.filter({ pk: 1 }), { all: true });
  both
    .orderBy('-at')
    .slice(0, 10)
    .then((posts) => posts.length);
  Post.objects
    .filter({ at__year: 2026 })
    .intersection(Post.objects.filter({ pk: 1 }))
    .difference(Post.objects.filter({ pk: 2 }));
}

// Extract and Trunc in values() and the groups of annotate().
{
  class Sale extends Model {}
  const monthly = Sale.objects
    .values<{ month: number; n: number }>({ month: Extract('createdAt', 'month') })
    .annotate({ n: Count() });
  Sale.objects.values('region', { week: Trunc('createdAt', 'week') });
  Sale.objects.valuesList({ y: new Extract('createdAt', 'year') }, { flat: true });
  // @ts-expect-error
  Extract('createdAt', 'decade');
  // @ts-expect-error
  Trunc('createdAt', 'week_day');
  void monthly;
}

{
  const db = new Database({ backend: 'memory' });
  db.health({ slow: 100 })
    .check()
    .then((result) => expectTypeOf(result.latency).toEqualTypeOf<number | undefined>());
}

// Raw: fragments of SQL in conditions, orders, values, extra(), update() and aggregates.
{
  class Order extends Model {}
  const raw = Raw(`length(${Raw.TABLE}.title) > ?`, [10]);
  expectTypeOf(raw.sql).toEqualTypeOf<string>();
  expectTypeOf(raw.params).toEqualTypeOf<unknown[]>();
  expectTypeOf(new Raw('random()')).toEqualTypeOf<RawSql>();
  Order.objects
    .filter(raw, { paid: true })
    .exclude(Raw('total < ?', [5]))
    .orderBy(Raw('random()'), '-total');
  Order.objects.filter(or(Raw('a = 1'), { b: 2 }));
  Order.objects.values('id', { total: Raw('price * quantity') });
  Order.objects.extra({ items: Raw('(SELECT COUNT(*) FROM line WHERE line.order_id = order.id)') });
  Order.objects.update({ total: Raw('price * ?', [2]) });
  Order.objects.aggregate({ paid: Raw('SUM(CASE WHEN paid THEN 1 ELSE 0 END)'), orders: Count() }).then((result) => {
    expectTypeOf(result.paid).toEqualTypeOf<unknown>();
    expectTypeOf(result.orders).toEqualTypeOf<number>();
  });
  // @ts-expect-error
  Raw(42);
  // @ts-expect-error
  Order.objects.extra({ items: 'SELECT 1' });
}

// Plain values() ordered by their Extract and Trunc keys.
{
  class Visit extends Model {}
  const months = Visit.objects
    .values<{ title: string; month: number }>('title', { month: Extract('at', 'month') })
    .orderBy('-month', 'title');
  expectTypeOf(months).toEqualTypeOf<QuerySet<{ title: string; month: number }>>();
  Visit.objects
    .valuesList<number>({ day: Trunc('at', 'day') }, { flat: true })
    .orderBy('day')
    .limit(10);
}

// Scopes: Book.query().published() typed, chained with the methods of querysets and with each other.
{
  const shelfFields = { title: fields.string(), published: fields.boolean(), pages: fields.integer() };
  class Shelf extends Model {
    static fields = shelfFields;

    static scopes = {
      published: (qs: QuerySet<Shelf>) => qs.filter({ published: true }),
      longerThan: (qs: QuerySet<Shelf>, pages: number) => qs.filter({ pages__gt: pages }),
    };
  }
  interface Shelf extends Fields<typeof shelfFields> {}
  const books = Shelf.query().published().orderBy('title').longerThan(100).limit(5);
  expectTypeOf(books).toEqualTypeOf<ScopedQuerySet<Shelf, typeof Shelf.scopes>>();
  books.then((rows) => expectTypeOf(rows).toEqualTypeOf<Shelf[]>());
  Shelf.query()
    .filter({ title__startswith: 'A' })
    .published()
    .first()
    .then((one) => expectTypeOf(one).toEqualTypeOf<Shelf | null>());
  // @ts-expect-error
  Shelf.query().longerThan('many');
  // @ts-expect-error
  Shelf.query().unpublished();
  // values() leaves the objects: no scopes after it.
  // @ts-expect-error
  Shelf.query().values('title').published();
  // A model without scopes: a QuerySet.
  class Plain extends Model {}
  assertType<QuerySet<Plain>>(Plain.query().filter({}).limit(1));
}

// Transactions: the options of SQLite and MongoDB.
{
  const txdb = new Database({ backend: 'memory' });
  txdb.transaction(async () => 1, { retry: false, timeout: 5000 }).then((n) => expectTypeOf(n).toEqualTypeOf<number>());
  txdb.transaction(() => 'x', { mode: 'immediate' });
  // @ts-expect-error
  txdb.transaction(() => 1, { mode: 'later' });
}

// Tests in transactions.
{
  const testDb = new Database({ backend: 'sqlite', filename: ':memory:' });
  testDb.beginTest().then(() => testDb.rollbackTest());
  expectTypeOf(testDb.canRollbackTests).toEqualTypeOf<boolean>();
  expectTypeOf(testDb.flush()).toEqualTypeOf<Promise<void>>();
  const hooks = { beforeEach: (fn: () => Promise<void>) => fn, afterEach: (fn: () => Promise<void>) => fn };
  rollbackEach(testDb, hooks);
  rollbackEach(() => testDb, { ...hooks, mode: 'flush' });
  // @ts-expect-error
  rollbackEach(testDb, { mode: 'never' });
}

// Paginator.
{
  class Paged extends Model {
    static fields = { title: fields.string() };
  }
  const paginator = new Paginator(Paged.query().orderBy('title'), 10, { orphans: 2 });
  paginator.page('2').then((page) => {
    expectTypeOf(page.objectList).toEqualTypeOf<Paged[]>();
    expectTypeOf(page.hasNext).toEqualTypeOf<boolean>();
    for (const item of page) expectTypeOf(item).toEqualTypeOf<Paged>();
  });
  expectTypeOf(paginator.elidedPageRange(5)).toEqualTypeOf<Promise<(number | '…')[]>>();
  expectTypeOf(new Paginator([1, 2, 3], 2).getPage(9)).toEqualTypeOf<Promise<Page<number>>>();
  // @ts-expect-error
  new Paginator(Paged.objects.all(), '10');
}

// Choices with labels, labels and help of fields.
{
  class Copy extends Model {
    static fields = {
      status: fields.string({ choices: [['a', 'Available'], ['o', 'On loan']], label: 'Availability', help: 'Can it be borrowed?' }),
      format: fields.string({ choices: { hb: 'Hardback' }, blank: false }),
    };
  }
  expectTypeOf(new Copy().display('status')).toEqualTypeOf<string | null | undefined>();
  // @ts-expect-error
  fields.string({ label: 7 });
}

// Constraints and Lower().
{
  class Genre extends Model {
    static fields = { name: fields.string() };

    static options = {
      constraints: [
        { unique: [Lower('name')], name: 'genre_name_ci', message: 'Genre already exists' },
        { check: 'name.length > 0', message: 'A name' },
      ],
      indexes: [[Lower('name')]],
    };
  }
  expectTypeOf(Lower('name').kind).toEqualTypeOf<'lower'>();
  // @ts-expect-error
  Lower(7);
  expectTypeOf(Genre).toEqualTypeOf<typeof Genre>();
}
