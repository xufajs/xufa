# @xufa/orm

The ORM of [xufa](../xufa): models and QuerySets in the spirit of Django, over SQL and NoSQL databases, with no
dependencies outside xufa. The same models and queries run on every backend:

| Backend    | Database                            | Made with                     |
| ---------- | ----------------------------------- | ----------------------------- |
| `memory`   | In memory, for tests and prototypes | JavaScript                    |
| `sqlite`   | SQLite                              | `node:sqlite` (Node.js 22.5+) |
| `postgres` | PostgreSQL                          | [`@xufa/pg`](../pg)           |
| `mongodb`  | MongoDB                             | [`@xufa/mongo`](../mongo)     |

```js
const { Database, Model, fields, or, F, Count, Sum } = require('@xufa/orm'); // or require('xufa/orm')

class Author extends Model {
  static fields = {
    name: fields.string({ maxLength: 100 }),
    email: fields.string({ null: true, unique: true }),
    createdAt: fields.datetime({ autoNowAdd: true }),
  };

  static options = { ordering: ['name'] };
}

class Book extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    pages: fields.integer({ null: true, min: 1 }),
    author: fields.foreignKey(() => Author, { relatedName: 'books', onDelete: 'cascade' }),
  };
}

const db = new Database({ backend: 'sqlite', filename: 'app.db' });
// or { backend: 'mongodb', url: 'mongodb://localhost:27017/app' }
// or { backend: 'postgres', url: 'postgres://user:password@localhost:5432/app' }
db.register(Author, Book);
await db.connect();
await db.sync(); // creates the tables (or collections and indexes), and the schemas of PostgreSQL, that do not exist

const ada = await Author.objects.create({ name: 'Ada' });
await ada.books.create({ title: 'Notes', pages: 120 });

const books = await Book.objects
  .filter({ author__name__istartswith: 'a', pages__gte: 100 })
  .exclude(or({ title__contains: 'draft' }, { pages: null }))
  .selectRelated('author')
  .orderBy('-pages')
  .limit(10);
books[0].author.name; // 'Ada'

await Book.objects.filter({ author: ada }).update({ pages: F('pages').add(1) });
await Book.objects.values('author__name').annotate({ books: Count(), pages: Sum('pages') });
```

## Models

A model is a class extending `Model` with `static fields` and, optionally, `static options`: `table` (the snake
case of the class name by default; a name, dots included), `schema` (the schema of the table in PostgreSQL; SQLite names
the table `schema.table`, MongoDB the collection), `ordering`, `indexes` (`[['a', 'b'], { fields: ['c'], unique: true }]`; in SQL
databases, `condition` is the SQL of the rows of a partial index: `{ fields: ['c'], unique: true, condition:
'"deleted" IS NULL' }`; `expireAfter` makes a [TTL index](#ttl-indexes)),
`abstract` (a parent whose fields its children have), `strict` (SQLite: a STRICT table, its columns of the types
STRICT has) and `fillfactor` (PostgreSQL, 10 to 100: room left in the pages
of the table for the new versions of updated rows, which makes updates of tables updated often about twice as fast
when they change no indexed column; set when the table is created by `sync()`). A model without a primary key gets `id` (an integer in SQL, an
ObjectId as a hex string in MongoDB). A primary key of several fields (`primaryKey: true` on each, or
`options.primaryKey: ['student', 'course']`) is composite, as Django's CompositePrimaryKey: `instance.pk` is the array of
their values, and `pk` in queries takes arrays (`get({ pk: [1, 'math'] })`, `pk__in: [[1, 'math'], [2, 'logic']]`,
`orderBy('-pk')`). No foreign key can point to such a model (but to a unique field, with `toField`); MongoDB does not
support them.

`options.primaryKey: false` makes a model without a primary key (and without `id`), for tables that have none, as logs
or tables made by others. Its rows are inserted (`create`, `bulkCreate`), read, counted, updated and deleted with
querysets, but its objects cannot be found again by themselves: `save()` of a saved one, `delete()` and `refresh()`
throw, as do `last()` without an order and updates or deletes whose conditions follow relations (in SQL). No foreign
key can point to it (but to a unique field, with `toField`), and it has no many-to-many fields.

Fields: `id` (`mode` in SQL databases: keys as numbers, bigints or strings, as `bigint` fields), `string` (`maxLength`, `minLength`), `text`, `integer` and `float` (`min`, `max`), `bigint` (numbers
when they are safe integers, bigints otherwise; `mode: 'bigint'` always gives bigints, `mode: 'string'` their text), `decimal` (`precision`, `scale`; strings, so no precision is lost),
`boolean`, `datetime` (`autoNow`, `autoNowAdd`), `date` ('YYYY-MM-DD' strings), `json`, `uuid` (generated when it is
the primary key), `bytes` (Buffers) and
`foreignKey(Model | () => Model | 'Name' | 'self', { onDelete, relatedName, attname, dbOnDelete })` and
`manyToMany(Model | () => Model | 'Name' | 'self', { relatedName, through })`. Every field takes `null`, `default`
(a value or a function), `unique`, `index`, `primaryKey`, `choices`, `column` and `validate` (functions that return
a message, or false, when a value is not valid).

`array(field, options)` holds arrays of the values of a field, as Django's ArrayField:
`tags: fields.array(fields.string({ maxLength: 20 }))`. They are native arrays in PostgreSQL (`VARCHAR(20)[]`), json text
in SQLite and arrays in MongoDB; their items are checked by the field (null items are kept), and they are compared as
wholes (`filter({ tags: ['a', 'b'] })`).

`hstore(options)` holds maps of strings, as Django's HStoreField: `HSTORE` columns in PostgreSQL (the extension
`hstore` must be in the database), json text in SQLite and documents in MongoDB. Values are strings or nulls (numbers
and booleans are taken as their text), compared as wholes.

`geometry(options)` and `geography(options)` hold geometries of PostGIS as GeoJSON values (`{ type: 'Point',
coordinates: [1, 2] }`): `GEOMETRY` and `GEOGRAPHY` columns in PostgreSQL (of a `shape`, `'POINT'`, and a `srid`, when
given; the extension `postgis` must be in the database), GeoJSON as json text in SQLite and as documents in MongoDB.
The SRID of a value is its crs (`{ type: 'name', properties: { name: 'EPSG:4326' } }`), written as EWKT and read back
from PostGIS; a value without one is written without one. Coordinates must be numbers (text that is not one is
refused, not stored as 0).

Aggregates can be fragments of SQL too (SQL databases): `annotate({ engines: Raw('SUM(CASE WHEN engines > 1 THEN 1
ELSE 0 END)') })`, their values as the driver gives them.

`datetime` and `date` fields take infinite dates, PostgreSQL's `infinity` and `-infinity`: `Infinity` and
`-Infinity` (or those words as text, in any case), after and before every other date in orders and conditions. SQLite
keeps them as the texts `infinity` and `-infinity` (which sort after and before its ISO dates); MongoDB has none and
refuses them. `float` fields take `NaN`, `Infinity` and `-Infinity` (`NaN` only when it is given, not when a text is no
number); how `NaN` compares is the database's (PostgreSQL and SQLite put it after every number).

A foreign key `author` keeps the key in `authorId` and, once loaded (`selectRelated`, `prefetchRelated`,
`await book.load('author')`, or assigned), the object in `author`. The model it points to gets the reverse relation,
`relatedName` (`<model>Set` by default): `author.books` is a QuerySet, and `author.books.create()` sets the key.
`onDelete` is `cascade` (default), `setNull`, `protect` or `doNothing`, done by the ORM so that it is the same on
every database. `attname` names the key otherwise (`author_id`), `toField` points it to a unique field of the other
model instead of its primary key (`foreignKey(Country, { toField: 'code' })`), `dbOnDelete` (`cascade`, `setNull`,
`restrict`, `noAction`) is an `ON DELETE` of the foreign key in SQL databases, for deletes made outside the ORM,
`dbOnUpdate` (the same values) its `ON UPDATE`, for keys that change, and
`dbConstraint: false` makes it no constraint of the database at all.

In SQL databases a field can say its column exactly: `sqlType` (`'VARCHAR(255)'`; for a primary key the database
gives, the whole definition) and `dbDefault` (a `DEFAULT` of the column). Values are still those of the type of the
field.

A many-to-many relation `tags` (of a Book to a Tag) goes through a model with a foreign key to each, made when the
models are registered (or given as `through`). `book.tags` is the QuerySet of the tags of a book, with `add()`,
`remove()`, `set()` and `clear()`; `tag.books` (its `relatedName`) is the other way; both can be in conditions
(`Book.objects.filter({ tags__name: 'x' })`) and in `prefetchRelated`. Deleting an object deletes its links.

Objects: `save({ fields })` (insert or update; validates first), `delete()`, `refresh()`, `load(name)`, `validate()`
(throws a `ValidationError` with `errors` by field and the status code 400), `toJSON()` (with the relations loaded)
and `pk`. Hooks: `Model.on('beforeSave' | 'afterSave' | 'beforeDelete' | 'afterDelete', fn)`. `Model.jsonSchema()`
gives the JSON Schema of the objects, for the schemas of routes.

## TTL indexes

An index of one datetime field with `expireAfter` (seconds, or text as `'30d'`) is a TTL index, as MongoDB's: its
objects expire that long after the date of the field (`0`: at the date).

```js
class LogEntry extends Model {
  static fields = { message: fields.text(), createdAt: fields.datetime({ autoNowAdd: true }) };

  static options = { indexes: [{ fields: ['createdAt'], expireAfter: '30d' }] }; // deleted 30 days after createdAt
}

class Session extends Model {
  static fields = { token: fields.string(), expiresAt: fields.datetime() };

  static options = { indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] }; // deleted at expiresAt
}

app.register(orm.plugin, { database: db, sync: true, expire: true }); // db.expire() every minute while the app runs
```

MongoDB deletes them itself (a TTL index, `expireAfterSeconds`; its monitor runs every minute). In every backend,
`db.expire()` deletes the objects that expired, as QuerySets delete them (their relations as `onDelete` says, which
MongoDB's own deletes do not do), and returns how many of each model; `db.startExpiry({ interval: '1m' })` calls it
every interval (until `db.stopExpiry()` or `db.close()`), and so does the plugin with `expire: true` (or
`{ interval }`). Objects that expired are found until they are deleted. In a cluster, any process (or all of them) can
do it; for tenants, start it in their `setup`. Changing `expireAfter` makes a migration that drops and creates the
index.

## Encrypted fields

`encrypted(field, options)` keeps the values of a field encrypted in the database (AES-256-GCM): the objects have
their values, and the database has text it cannot read (`$xenc$1$<key id>$<iv>$<ciphertext>`), in a `TEXT` column
(strings in MongoDB; the memory backend keeps the values as they are, since nothing leaves the process).

```js
setEncryptionKeys({ keys: { k1: process.env.ENCRYPTION_KEY } }); // or XUFA_ENCRYPTION_KEYS='k1:<base64>'

class Patient extends Model {
  static fields = {
    name: fields.string(),
    ssn: fields.encrypted(fields.string({ maxLength: 11 })),
    email: fields.encrypted(fields.string(), { deterministic: true, unique: true }),
    history: fields.encrypted(fields.json(), { null: true }),
  };
}

await Patient.objects.create({ name: 'Ada', ssn: '123-45-6789', email: 'ada@example.com', history: { allergies: [] } });
const ada = await Patient.objects.get({ email: 'ada@example.com' }); // deterministic: found by equality
ada.ssn; // '123-45-6789'
// Patient.objects.filter({ ssn: '123-45-6789' }) throws: ssn takes isnull only
```

- **Keys** are 32 random bytes (`generateEncryptionKey()` makes one), in base64 or hex, by id. The first one (or
  `current`) encrypts, and all of them decrypt. They are set with `setEncryptionKeys()`, or read from
  `XUFA_ENCRYPTION_KEYS` (`'k2:<base64>,k1:<base64>'`). Without keys, writing or reading an encrypted value throws.
- **Values are authenticated and bound to their column**: a value changed in the database, or copied to another column
  or table, is refused (`EncryptionError`), not read. `context` binds them to something else: after renaming the table
  or the column, give the old `'table.column'`.
- **Queries**: the database cannot compare, sort nor compute what it cannot read. Encrypted fields take `isnull` in
  conditions, and no orders nor aggregates other than `Count`. With `deterministic: true`, the same value gives the
  same text (for the same key), so the field also takes `exact` and `in`, and can be `unique` or indexed: the database
  can tell which rows have the same value, not what it is. Fields of json, arrays, hstore and geometries cannot be
  deterministic.
- **The base field** validates the values (`maxLength`, `choices`...) and gives the JSON Schema.
- **Rotating keys**: add the new key as the current one, call `reencrypt(Model)` (every object written again with
  it), and remove the old one. Until then, deterministic values of the old key are not found by equality.

  ```js
  setEncryptionKeys({ current: 'k2', keys: { k2: newKey, k1: oldKey } });
  await reencrypt(Patient);
  setEncryptionKeys({ keys: { k2: newKey } });
  ```

- **Encrypting a field that has values**: make it `encrypted(..., { acceptPlaintext: true })`, so the values written
  before are read as they are, call `reencrypt(Model)`, and remove `acceptPlaintext`. The column becomes `TEXT` (a
  migration changes it).

## QuerySets

`Model.objects` is a lazy QuerySet: refining it (`filter`, `exclude`, `orderBy`, `limit`, `offset`, `slice`,
`only`, `values`, `valuesList`, `selectRelated`, `prefetchRelated`, `annotate`, `using`, `selectForUpdate`: `FOR
UPDATE` of PostgreSQL, with `skipLocked`, `noWait` or `mode: 'share'`, `limitPer(names, count, offset)`: the first
objects of every group, as `Book.objects.orderBy('-pages').limitPer('author', 3)`, a window of `ROW_NUMBER()` in SQL)
gives a new one, and it
runs when it is awaited or iterated (`for await`). Then: `get`, `first`, `last`, `count`, `exists`, `aggregate`,
`create`, `getOrCreate`, `updateOrCreate`, `bulkCreate`, `update` and `delete`. In PostgreSQL, `bulkCreate` of 500
objects or more uses COPY (the keys are taken from the sequence of the table first); the option `copyRows` of the
database changes that number (`false`: never). As in Django, `bulkCreate` can ignore the rows that break a unique key
(`{ ignoreConflicts: true }`: their objects get no key) or update the rows there
(`{ updateConflicts: true, updateFields: ['name'], uniqueFields: ['code'] }`, on the primary key when no
`uniqueFields` are given; `uniqueCondition` is the SQL of the rows of a partial unique index of them): `INSERT ...
ON CONFLICT`, in SQL databases.

Conditions are those of Django: `field__lookup` with the lookups `exact`, `iexact`, `contains`, `icontains`,
`startswith`, `istartswith`, `endswith`, `iendswith`, `like` and `ilike` (patterns of SQL LIKE: `%`, `_`, and `\` to
escape them; GLOB in SQLite and regular expressions in MongoDB, with the same results), `gt`, `gte`, `lt`, `lte`,
`in`, `range` and `isnull`;
`relation__field` follows foreign keys (joins in SQL, `$lookup` in MongoDB), and reverse and many-to-many relations
(`Author.objects.filter({ books__title__contains: 'x' })`: the authors with a book that matches, each once; the
conditions of one `filter()` are of the same book, those of chained ones of any; `EXISTS` in SQL); `Q`, `and`, `or` and `not` combine
conditions; `F('field')` compares with another field, and updates from its value (`F('views').add(1)`). Aggregates:
`Count` (with `{ distinct: true }`), `Sum`, `Avg`, `Min`, `Max`; in SQL databases they follow reverse relations too
(`Author.objects.values('name').annotate({ books: Count('books'), pages: Sum('books__pages') })`, with LEFT JOINs).
Nested transactions are savepoints; those started at the same time in one transaction run one after another.

## Migrations

As in Django: `await db.makeMigrations({ dir: 'migrations' })` compares the models with the schema the migration
files give, and writes a file (`0002_auto.js`) with the operations between them: tables created and dropped, fields
added (the rows there get their default; a field without null or a default that is not a function is refused),
dropped and altered, indexes and the fillfactor. `await db.migrate({ dir })` applies the files not applied yet, in
order, each in a transaction where the database has them, and records them (`xufa_migrations`);
`db.showMigrations({ dir })` lists them. The files are JavaScript and can be edited: renames are not detected, so
write `{ op: 'renameColumn', table, from, to }` or `{ op: 'renameTable', from, to }`, and `{ op: 'sql', sql }` or
`{ op: 'run', fn: async (db) => {} }` (data migrations) by hand. SQLite has no ALTER COLUMN: its tables are made
again (with the foreign keys checked after). In MongoDB, migrations make collections and indexes, fill the fields
added and unset those dropped. `db.sync()` still creates what does not exist, for a start.

## With @xufa/http

`app.register(orm.plugin, { database: db, migrate: { dir: 'migrations' } })` connects the database when the app
starts (and migrates it, when asked; `sync: true` creates the tables), gives it as `app.db` and closes it with the
app. Validation errors are answered with 400 and the messages of each field (`errors`), duplicates of unique fields
(`UniqueError`, from every backend) with 409 and their `fields`, and `get()` of nothing with 404.
`Model.jsonSchema({ exclude, partial })` gives the schema of the bodies of routes.

### Resources

`orm.resource(Model, options)` makes the routes of the objects of a model, as the ModelViewSets of Django REST
framework, to register with a prefix:

```js
app.register(
  orm.resource(Book, {
    filters: { author: ['exact', 'in'], pages: ['gte', 'lte'] },
    ordering: ['title', 'pages'],
    search: ['title', 'author__name'],
    related: ['author'],
    readOnly: ['owner'],
    auth: { list: false, get: false, create: true, update: true, delete: 'admin' }, // rules of @xufa/auth
    hooks: { beforeCreate: (values, request) => ({ ...values, owner: request.user.sub }) },
  }),
  { prefix: '/books' }
);
app.register(orm.resource(Author, { actions: ['list', 'get'] }), { prefix: '/authors' });
```

| Route               | Action   | Answer                                                        |
| ------------------- | -------- | ------------------------------------------------------------- |
| `GET /books`        | `list`   | `{ count, limit, offset, results }` (query parameters: below) |
| `GET /books/:id`    | `get`    | The object, or 404                                            |
| `POST /books`       | `create` | 201 and the object                                            |
| `PUT /books/:id`    | `update` | Every writable field set (those not given take their default) |
| `PATCH /books/:id`  | `update` | The fields given set                                          |
| `DELETE /books/:id` | `delete` | 204                                                           |

- `queryset(request)`: the QuerySet of the objects of a request (all by default). An object out of it is not found by
  any route: `(request) => Book.objects.filter({ owner: request.user.sub })` gives each user theirs.
- `fields` or `exclude`: what is answered (`toJSON()`, with the related objects loaded); `serialize(object, request)`
  answers something else.
- `writable` or `readOnly`: what bodies set (every field but the primary key and those set by the ORM, by default).
  Other fields of the model in a body are ignored (id, createdAt...); keys that are no field are a 400.
- `filters`, `ordering` and `search` say which query parameters lists take (`?pages__gte=100`, `?author__in=1,2`,
  `?ordering=-pages,title`, `?search=ada`, with `?limit=` and `?offset=`); others are a 400. `pageSize` (50),
  `maxPageSize` (500), `pagination: false` (arrays), `lookup` (the field of `/:id`, `pk` by default).
- `auth`: the rule of [@xufa/auth](../auth) (`config.auth` of the routes) for every action, or one by action.
- `hooks`: `beforeCreate(values, request)` and `beforeUpdate(object, values, request)` (they can change the values,
  or throw), `afterCreate`, `afterUpdate` and `beforeDelete(object, request)`.
- Errors are answered with their status: 400 for values that are not valid (with the messages of each field), 404,
  and 409 for duplicates (`UniqueError`) and for objects others protect (`ProtectedError`).

## TypeScript

The declarations type models from their fields: give the model an interface of the same name, and use
`Model.query()` for QuerySets of the model (TypeScript cannot type `Model.objects` by the class).

```ts
const bookFields = { title: fields.string(), author: fields.foreignKey(() => Author) };
class Book extends Model {
  static fields = bookFields;
}
interface Book extends Fields<typeof bookFields> {}
const books: Book[] = await Book.query().filter({ author__name: 'Ada' }); // book.title, book.authorId, book.author
```

## The same on every backend

Each backend compiles the description of a query (`lib/query.js`) to its database, and they give the same results:

- A null is not equal, greater or less than anything, and `exclude()` of such a condition keeps the rows with nulls
  (as Django does): SQL conditions under NOT are made two-valued with `COALESCE`.
- Nulls sort first in ascending order and last in descending order.
- `contains`, `startswith` and `endswith` are case sensitive (SQLite's `LIKE` is not, so they are compiled
  without it), and `%`, `_` and the characters of regular expressions are plain characters.
- Unique fields allow many nulls (partial unique indexes in MongoDB).
- Names of fields can have `__` (`a__b`): paths are read by the longest names of fields first (`a__b__gt` is the
  field `a__b` and the lookup `gt`).
- `json` fields are compared as whole values, and so are the values inside them: `data__owner__name: 'ada'`,
  `data__tags__0: 'x'` (numbers are indexes), `data__level__gte: 3`. For keys that this syntax cannot say (a key named
  as a lookup, `in` or `gt`, or with `__`), `jsonPath('data', ['in'], 1)` and `jsonPath('data', ['a__b', 0], 2,
'gte')` take the path as a list (indexes as numbers, up to 2^31 - 1). MongoDB cannot reach keys with dots or `$`.
- A sum of no values is `null`; groups of a missing field and of a null are the same group.

What differs, as it does between the databases:

- Transactions: `db.transaction(fn)` commits when `fn` ends and rolls back when it throws; transactions inside it are
  savepoints. MongoDB has transactions on replica sets and sharded clusters only (on a standalone server, `fn` runs
  without one), and no savepoints: a transaction that fails inside another rolls back the outer one.
- Foreign keys are constraints in SQL; in MongoDB, a key can point to nothing.
- The order of strings is the collation of the database.
- Raw queries: `db.backend.raw(sql, params)` in SQL; `db.backend.db` is the `@xufa/mongo` database in MongoDB.

## Not yet

Ordering and values across reverse relations (conditions and aggregates follow them), generic relations, and a CLI for
migrations.

## License

MIT.
