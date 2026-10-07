# @xufa/orm

The ORM of [xufa](../xufa): models and QuerySets in the spirit of Django, over SQL and NoSQL databases, with no
dependencies outside xufa.

Its documentation is in `docs/orm/`: an [overview](../../docs/orm/index.html), a [guide](../../docs/orm/guide.html)
(its examples run when the docs are checked), the [reference](../../docs/orm/reference.html) of its declarations,
[From Django](../../docs/orm/django.html) and the [benchmarks](../../docs/orm/benchmarks.html). This file is the summary.

The same models and queries run on every backend:

| Backend       | Database                            | Made with                     |
| ------------- | ----------------------------------- | ----------------------------- |
| `memory`      | In memory, for tests and prototypes | JavaScript                    |
| `fs`          | Files (JSON) in a folder            | `node:fs`                     |
| `sqlite`      | SQLite                              | `node:sqlite` (Node.js 22.5+) |
| `postgres`    | PostgreSQL                          | [`@xufa/pg`](../pg)           |
| `mongodb`     | MongoDB                             | [`@xufa/mongo`](../mongo)     |
| `disk`        | Objects (blobs) as files            | `node:fs`                     |
| `memory-blob` | Objects (blobs) in memory           | JavaScript                    |
| `s3`          | Objects (blobs) in S3, R2, MinIO... | `fetch` (SigV4 of its own)    |
| `azure-blob`  | Objects (blobs) in Azure Blob       | `node:http` (Shared Key, SAS) |
| `smtp`        | Email sent (a server of SMTP)       | `node:net`, `node:tls`        |
| `memory-mail` | Email kept in memory (tests)        | JavaScript                    |

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
// (with the options of the pool of @xufa/pg: max, acquireTimeoutMillis...; onError(err) for the idle connections
// the server closes)
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
`abstract` (a parent whose fields its children have; `fields.extend(Parent, { ... })` writes them for TypeScript), `strict` (SQLite: a STRICT table, its columns of the types
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
when they are safe integers, bigints otherwise; `mode: 'bigint'` always gives bigints, `mode: 'string'` their text), `decimal` (`precision`, `scale`; strings, so no precision is lost, with the places of the scale on every backend: `'3'` is `'3.00'`; more places or digits are a validation error, as in Django),
`boolean`, `datetime` (`autoNow`, `autoNowAdd`), `date` ('YYYY-MM-DD' strings), `json`, `uuid` (generated when it is
the primary key), `bytes` (Buffers) and
`foreignKey(Model | () => Model | 'Name' | 'self', { onDelete, relatedName, attname, dbOnDelete })` and
`manyToMany(Model | () => Model | 'Name' | 'self', { relatedName, through })`. Every field takes `null`, `default`
(a value or a function), `unique`, `index`, `primaryKey`, `choices`, `column` and `validate` (rules of the value:
functions or expressions that give a message, or false, when it is not valid; see Validation rules).

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
and `pk`. Hooks: `Model.on('beforeSave' | 'afterSave' | 'beforeDelete' | 'afterDelete', fn)`. `Model.schema()` gives
the schema of the objects, typed, for the schemas of routes ([Schemas of routes](#schemas-of-routes)).

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
(strings in MongoDB and in the files of the fs backend; the memory backend keeps the values as they are, since nothing
leaves the process).

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

## Computed fields

A field with `computed` has the value it computes from the other fields of its object: an expression of
[@xufa/expression](../expression) on them, or a function of the object. Not stored by default (computed when it is
read; no query can use it); with `stored: true`, a column set by the ORM, which queries can filter, order and
aggregate by.

```js
class Line extends Model {
  static fields = {
    product: fields.string(),
    price: fields.decimal({ precision: 10, scale: 2 }),
    quantity: fields.integer(),
    total: fields.decimal({ precision: 12, scale: 2, computed: 'price * quantity', stored: true }),
    label: fields.string({ computed: '`${quantity} x ${product}`' }),
    code: fields.string({ computed: (line) => line.product.toUpperCase(), uses: ['product'], stored: true }),
  };
}

const line = await Line.objects.create({ product: 'pen', price: '2.50', quantity: 4 });
line.total; // '10.00'
await Line.objects.filter({ total__gte: '100' });
await Line.objects.filter({ product: 'pen' }).update({ quantity: 50 }); // total computed again
```

- **Stored fields** are computed on `save()`, `create()` and `bulkCreate()` (from the values cleaned), and again for
  the objects of an `update()` that changes a field they read (found before the update, in the same transaction). The
  ORM finds what an expression reads; a function says it in `uses` (without it, every update computes it again).
- **Decimals are text** in expressions: `price * quantity` is a number, `price + 1` joins text (`Number(price) + 1`).
  A number computed for a decimal field is rounded to its `scale`.
- **Set by the ORM only**: giving one to `create()`, setting one that is not stored, or naming one in `update()` throws;
  `orm.resource()` ignores them in bodies and `jsonSchema()` marks them `readOnly`.
- **`recompute()`** computes the stored fields of a QuerySet again and saves those that changed: after adding one to a
  table with rows (with `null: true` or a `default`, as any new column), or after changes made outside the ORM.

## Validation rules

The rules of a field (`validate`) and of a model (`options.rules`) can be expressions of
[@xufa/expression](../expression), functions, or either with its message. A rule gives true when the value is valid,
false when it is not (its message, or a default one), or a string: the message.

```js
class Event extends Model {
  static fields = {
    name: fields.string({ validate: { rule: 'value.trim().length >= 3', message: 'At least 3 characters.' } }),
    seats: fields.integer({ validate: ['value >= 1', 'value <= 100 || "100 seats at most."'] }),
    start: fields.date(),
    end: fields.date(),
  };

  static options = {
    rules: [
      { rule: 'end >= start', message: 'The end cannot come before the start.', field: 'end' },
      'seats <= 10 || !name.startsWith("Small") || "A small event has 10 seats at most."',
    ],
  };
}
```

- A rule of a field reads its value as `value` (coerced; nulls are not given to it). A rule of a model reads the
  fields of the object by name; its message goes to the errors of `field`, or to `__all__` (as in Django). The rules
  of the parents of a model are its rules too.
- They run in `validate()`: on `save()`, `create()` and `bulkCreate()`. The rules of a model run once the fields
  are valid (as Django's `clean()`); `update()` runs the rules of the fields it sets, not those of the model.
- An expression that does not compile throws when the model is first used; a rule that throws when it runs throws its
  error (a mistake of the rule, not of the object).

## Scopes and soft deletes

```js
class Post extends Model {
  static options = { softDelete: true }; // a field deletedAt (added when the model has none; or softDelete: 'removedAt')
  static fields = { title: fields.string(), status: fields.string(), views: fields.integer({ default: 0 }) };
  static scopes = {
    published: (qs) => qs.filter({ status: 'published' }),
    popular: (qs, min = 100) => qs.filter({ views__gte: min }),
  };
}

await Post.objects.published().popular(50).orderBy('-views'); // scopes: methods of the querysets of the model
await post.delete(); // sets deletedAt; querysets leave the post out
await Post.objects.withDeleted().count(); // onlyDeleted(), restore(), forceDelete(), post.isDeleted
```

Scopes are the scopes of Rails and Laravel (and Django's custom managers): functions of a queryset, with arguments,
that give a queryset; the parent's are the child's too. With `softDelete`, `delete()` (of an object or a queryset)
sets the date and every queryset leaves those objects out (`get()` too); `withDeleted()` and `onlyDeleted()` give
them, `restore()` takes them back and `forceDelete()` deletes for good, taking the related objects with it (those
deleted softly too). A soft delete does not cascade.

## Factories

```js
const { factory, sequence } = require('@xufa/orm');

const Teams = factory(Team, { name: (n) => `Team ${n}` });
const Users = factory(
  User,
  {
    name: (n) => `User ${n}`, // n: the number of the object (1, 2...)
    email: (n, values) => `user${n}@example.com`, // values: those made before it
    color: sequence(['red', 'green']),
    team: Teams, // an object of another factory, made for each
  },
  { states: { admin: { role: 'admin' } } }
);

await Users.create(); // saved; make() does not save
await Users.state('admin').createMany(3, { team }); // values given replace those of the factory
await Users.using(db).create(); // in another database
```

As Laravel's model factories (and factory_bot): values are constants, functions (async too) or factories; states and
the values given replace them. `createMany` saves with `bulkCreate`.

## QuerySets

`Model.objects` is a lazy QuerySet: refining it (`filter`, `exclude`, `orderBy`, `limit`, `offset`, `slice`,
`only`, `defer`, `values`, `valuesList`, `selectRelated`, `prefetchRelated`, `annotate`, `using`, `selectForUpdate`: `FOR
UPDATE` of PostgreSQL, with `skipLocked`, `noWait` or `mode: 'share'`, `limitPer(names, count, offset)`: the first
objects of every group, as `Book.objects.orderBy('-pages').limitPer('author', 3)`, a window of `ROW_NUMBER()` in SQL;
`distinct()`: the rows of `values()` once, and `distinct('author')` the first object of each group; `union(other, {
all })`, `intersection(other)` and `difference(other)`: one query for objects of one model without slices, the
conditions ORed, ANDed or excluded, and the rows of the queries combined otherwise, values by their values)
gives a new one, and it
runs when it is awaited or iterated (`for await`). Then: `get`, `first`, `last`, `count`, `exists`, `inBulk` (a Map of
the objects by key, or by a unique field: `inBulk(codes, { field: 'code' })`), `aggregate`, `create`, `getOrCreate`, `updateOrCreate`, `bulkCreate`, `update` and `delete`. In PostgreSQL, `bulkCreate` of 500
objects or more uses COPY (the keys are taken from the sequence of the table first); the option `copyRows` of the
database changes that number (`false`: never). As in Django, `bulkCreate` can ignore the rows that break a unique key
(`{ ignoreConflicts: true }`: their objects get no key) or update the rows there
(`{ updateConflicts: true, updateFields: ['name'], uniqueFields: ['code'] }`, on the primary key when no
`uniqueFields` are given; `uniqueCondition` is the SQL of the rows of a partial unique index of them): `INSERT ...
ON CONFLICT`, in SQL databases.

Conditions are those of Django: `field__lookup` with the lookups `exact`, `iexact`, `contains`, `icontains`,
`startswith`, `istartswith`, `endswith`, `iendswith`, `like` and `ilike` (patterns of SQL LIKE: `%`, `_`, and `\` to
escape them; GLOB in SQLite and regular expressions in MongoDB, with the same results), `gt`, `gte`, `lt`, `lte`,
`in`, `range` and `isnull`; the parts of dates, in UTC, as Django's: `createdAt__year: 2026` and `__date` (ranges of the
field, served by its indexes), `__month`, `__day`, `__week_day` (1 is Sunday), `__iso_week_day`, `__week` (ISO),
`__quarter`, `__hour`, `__minute` and `__second` (taken out by each backend), with the comparisons, `in` and `range`;
`relation__field` follows foreign keys (joins in SQL, `$lookup` in MongoDB), and reverse and many-to-many relations
(`Author.objects.filter({ books__title__contains: 'x' })`: the authors with a book that matches, each once; the
conditions of one `filter()` are of the same book, those of chained ones of any; `EXISTS` in SQL); `Q`, `and`, `or` and `not` combine
conditions; `F('field')` compares with another field, and updates from its value (`F('views').add(1)`). Aggregates:
`Count` (with `{ distinct: true }`), `Sum`, `Avg`, `Min`, `Max`; they follow reverse relations too
(`Author.objects.values('name').annotate({ books: Count('books'), pages: Sum('books__pages') })`: LEFT JOINs in SQL,
computed by the ORM in the other backends). Without `values()`, `annotate()` gives the objects, each with its
aggregates, as Django's: `Author.objects.annotate({ numBooks: Count('books') }).orderBy('-numBooks')` (its names cannot
be those of fields or relations). Reports by dates: `values({ month: Extract('at', 'month') })` (a number: `year`,
`quarter`, `month`, `week`, `day`, `week_day`, `iso_week_day`, `hour`, `minute`, `second`) and `Trunc('at', 'month')`
(the start of the unit: a Date, a date for dates), grouped by `annotate()`: `strftime`, `EXTRACT`/`date_trunc` and
`$month`/`$dateTrunc` (MongoDB 5.0+), in UTC.
Nested transactions are savepoints; those started at the same time in one transaction run one after another. In a
SQLite file, the transactions of a process run one after another (SQLite has one writer), and writes outside them wait
for them instead of failing with `SQLITE_BUSY`.

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

## Files as a database

The `fs` backend keeps the objects in files: for content, settings and small catalogs that live with the application,
or where there is no database. Queries run in memory, with everything the memory backend does (lookups, relations,
aggregates, transactions, migrations); what changes is written after each operation, or when a transaction commits
(nothing when it rolls back), and read back when the database connects.

```js
new Database({ backend: 'fs', dir: 'data' }); // data/<table>.json
new Database({ backend: 'fs', dir: 'content', layout: 'files', pretty: true }); // content/<table>/<key>.json
new Database({ backend: 'fs', dir: 'content', layout: 'files', watch: true, onChange: (tables) => log(tables) });
```

- `layout: 'files'` writes a file for each object, and writes only the objects that changed (files that can be read,
  diffed and edited by hand: edits are read when the database connects again).
- Files are written to a temporary file and renamed, so a file is never left half written.
- Dates, bytes, bigints and infinite numbers are kept with their type; encrypted fields are written encrypted.
- One process writes a folder: a lock file (`.xufa.lock`) refuses a second one while the first is alive.
- `watch: true` (or `{ delay }`, 50 ms by default) reads again the files changed from outside while the database is
  open (edits by hand, a deploy, `git pull`; on Linux the folder, and the folder of each table, are watched one by
  one, as Node's recursive watching there misses the files replaced by a rename): the collections whose files changed, or in `layout: 'files'` only the
  objects whose files were changed, added or removed. What changes while a transaction is open is read when it ends.
  `onChange(tables)` is called after, and the cached objects of those models are dropped; `onError(err)` is called when
  a file cannot be read (JSON half saved by an editor), and the data stays as it was until the file changes again.
  When the application writes a file before its change from outside is read, the two are merged by object: the objects
  changed only from outside keep that change, and an object changed on both sides keeps the application's, with an
  `onError` error of code `XUFA_ORM_ERR_FS_CONFLICT` (with `table` and `keys`).
- Only the objects that changed are serialized again, so a write to a large collection costs the writing of its file;
  `layout: 'files'` writes only the files of the objects that changed (several at a time). Each new or changed
  object is a file written (to a temporary file, then renamed): about 1 ms an object on Windows (NTFS and the
  antivirus look at each new file), about 0.1 ms on Linux. A batch of 16 objects or more of a table (`bulkCreate()`,
  `update()` of a QuerySet...) is written with a journal instead: the batch in one file (`.xufa-pending.json`, in the
  folder of the table), then each object written in place, then the journal removed. It takes half the time on Windows
  (2,000 objects: 1.4 s instead of 2.2 s to create them, 1.3 s instead of 2.4 s to update them) and, on Linux, where
  the files of a batch are written synchronously (by 256, the event loop let go between them), a tenth (20 ms instead
  of 150 to create them). A batch is all or nothing: one cut short is written again from its journal when the folder is
  opened.
  With `watch`, files are always written with a rename (the watcher never reads one half written). The layout is still
  for content edited a few objects at a time: thousands of objects take a second or more on Windows.
- With tenants or several databases, a collection can live in files while others are in a database
  (`databases: { default: {...}, content: { backend: 'fs', dir: 'content' } }`).

## Stores of objects (blobs)

Stores of objects are backends too: a model is a container (a folder, a bucket), an object of the model is an object
of the store. Its primary key (a string) is the key of the object; its `fields.blob()` the body; its
`fields.blobInfo()` what the store knows of it (`size`, `etag`, `updatedAt`, `contentType`); its other fields the
metadata of the object. The querysets are the same:

```js
class Upload extends Model {
  static fields = {
    key: fields.string({ primaryKey: true }), // the key of the object (its path)
    content: fields.blob(), // the body
    size: fields.blobInfo('size'),
    contentType: fields.blobInfo('contentType'),
    owner: fields.string({ null: true }), // metadata
  };
}

const files = new Database({ backend: 'disk', dir: 'uploads' }).register(Upload); // or { backend: 'memory-blob' }

await Upload.objects.create({ key: 'reports/q3.pdf', content: request.body, owner: 'ada' }); // a stream, a Buffer...
const report = await Upload.objects.get({ key: 'reports/q3.pdf' });
reply.type(report.contentType).send(await report.content.stream());
await Upload.objects.filter({ key__startswith: 'reports/' }).only('key', 'size'); // a listing: no bodies read
```

- A body is written as a Buffer, a string, a readable stream (a request, a file), a `Blob`, or the body of another
  object (copied). It is read as a `BlobValue`, whose body is read only when asked: `stream()`, `buffer()`,
  `text()`, `json()`, and `url()` where the store gives URLs. As JSON it is `{ size, contentType, etag }`.
- Conditions on the key (`exact`, `in`, `startswith`) are asked to the store: an object, or a listing of a prefix. The
  rest (conditions, orders, slices, aggregates) run in memory on what the store gives. The metadata of objects is read
  only when a query needs it (a condition or an output of a metadata field), with a read for each object listed.
- `save()` of an object read writes its metadata alone, not its body; a new body (`upload.content = stream`) is
  written. `update()` and `delete()` of querysets work on every object matched.
- The content type is the one given, or the one of the extension of the key (`application/octet-stream` else).
- A model of these backends has a primary key that is a string and one `fields.blob()`, and no relations nor unique
  fields but the key; `fields.blob()` in another backend is an error when the model is registered. There are no
  transactions: `db.transaction(fn)` runs `fn`, its writes made at once.
- A create of a key that is there is a `UniqueError`, and so are creates of one key at the same time but one: the
  store refuses them when it writes (S3: `If-None-Match: *`, which AWS, R2, MinIO and SeaweedFS honor; disk: a link
  that does not replace a file; memory-blob: checked as it is stored), so no create writes over another.

Backends:

- `memory-blob`: in memory, for tests.
- `disk` (`dir`): each object is a file, `<dir>/<table>/<key>`, its body as it is, so the folder can be served,
  copied or backed up; a key with slashes is a path of folders. Content types and metadata are in
  `<dir>/.meta/<table>/<key>.json`. Files are written to a temporary file and renamed. Keys stay in their folder:
  `..`, empty parts, absolute paths, backslashes, colons and the names Windows keeps are refused (to write, read or
  delete). Files put in the folder by other means are objects too. `url: (table, key) => string` gives the URLs of
  `url()` where the folder is served.
- `s3` (`bucket`, `region`): S3, and the stores that speak its API (Cloudflare R2, MinIO, Backblaze B2, Wasabi,
  DigitalOcean Spaces, Alibaba OSS...), with `node:http(s)` (connections kept for the next requests) and SigV4
  signatures of its own (no SDK): 1.6 to 3.3 times as many requests a second as the AWS SDK v3 on the same store
  (`bench/micro/s3.js`, `bench/results/s3-1.md`; `fetch` gives one of your own). The objects of a model
  are in the bucket under `<prefix><table>/`. `endpoint` is the URL of a store that is not AWS (the bucket then goes
  in the path; `forcePathStyle: true` on AWS too); `credentials` (`{ accessKeyId, secretAccessKey, sessionToken }`)
  are the variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` when not given. Streams are
  sent in parts (a multipart upload of `partSize` parts, 8 MiB, aborted when it fails), so their size need not be
  known and no more than a part is kept in memory. The metadata is one header (`x-amz-meta-xufa`, at most 2 KB), and
  changing it alone copies the object on itself (its body is not sent again). `url()` is a signed URL (`expiresIn`:
  `'15m'` by default, up to 7 days), or the URL under `publicUrl` (a CDN). `createBucket: true` makes the bucket in
  `sync()`; `drop()` deletes the objects of the models (the bucket stays). A create is a conditional write
  (`If-None-Match: *`): of two processes creating the same key at once, one gets a `UniqueError`.

  ```js
  new Database({ backend: 's3', bucket: 'uploads', region: 'eu-west-1' }); // AWS, credentials of AWS_* variables
  new Database({
    backend: 's3',
    bucket: 'uploads',
    endpoint: 'https://<account>.r2.cloudflarestorage.com',
    region: 'auto',
    credentials,
  });
  ```

  Its tests run against a server of the API of S3 that checks every signature (and the examples of the documentation
  of AWS), and with `XUFA_S3_URL` (`http://<key>:<secret>@<host>:<port>/<bucket>?region=<region>`) against that store.

- `azure-blob` (`container`): Azure Blob Storage, and Azurite (its emulator), with `node:http(s)` and Shared Key
  signatures of its own (no SDK). The account is a connection string (`connectionString`, or the variable
  `AZURE_STORAGE_CONNECTION_STRING`; `'UseDevelopmentStorage=true'` for Azurite), or `account` and `accountKey`
  (`AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY`), or `account` and a `sasToken` instead of the key. The objects of a
  model are blobs of the container under `<prefix><table>/`; `endpoint` is the URL of the blob service when it is not
  `https://<account>.blob.core.windows.net`. Streams are sent in blocks (`blockSize`, 8 MiB, then their list), so
  their size need not be known; the blocks of an upload that fails are never committed. The metadata is one header
  (`x-ms-meta-xufa`), and changing it does not send the body. `url()` is a SAS of reading the blob (`expiresIn`,
  `'15m'` by default), the URL with the `sasToken`, or the one under `publicUrl`. `createContainer: true` makes the
  container in `sync()`; creates are conditional writes (`If-None-Match: *`), as with S3.

  ```js
  new Database({ backend: 'azure-blob', container: 'uploads' }); // AZURE_STORAGE_CONNECTION_STRING
  new Database({ backend: 'azure-blob', container: 'uploads', account: 'acme', accountKey });
  new Database({ backend: 'azure-blob', container: 'uploads', connectionString: 'UseDevelopmentStorage=true' });
  ```

  Its tests run against a server of the API of Azure Blob that checks every signature (and requests Azurite
  accepted), and with `XUFA_AZURE_CONNECTION_STRING` against that account (or Azurite).

With tenants, a store can be a database of each tenant:
`config: (id) => ({ databases: { files: { backend: 'disk', dir: 'files/' + id } }, routes: { Upload: 'files' } })`.

## Email (mail backends)

Email is a backend too: a model whose objects are messages, routed to a database of `smtp` (a server of mail) or
`memory-mail` (kept in memory, for tests, as Django's locmem backend). Creating an object sends it, and
`fields.mailInfo()` are what the sending gave.

```js
class Email extends Model {
  static fields = {
    to: fields.json(), // 'ada@example.com', 'Ada <ada@example.com>, bob@...', { name, address }, or an array
    subject: fields.string(),
    text: fields.text({ null: true }),
    html: fields.text({ null: true }),
    attachments: fields.json({ null: true }), // [{ filename, content, contentType, cid }]
    messageId: fields.mailInfo('messageId'),
    accepted: fields.mailInfo('accepted'),
  };
}

const dbs = new Databases(
  {
    default: { backend: 'postgres', url: process.env.DATABASE_URL },
    mail: { backend: 'smtp', url: process.env.SMTP_URL, from: 'Shop <shop@example.com>' }, // memory-mail in tests
  },
  { routes: { Email: 'mail' } }
);

const sent = await Email.objects.create({ to: 'Ada <ada@example.com>', subject: 'Your order', text: 'On its way.' });
sent.accepted; // ['ada@example.com']
```

- The fields of a message are those of these names: `from` (the option `from` of the backend when the model has none
  or it is null), `to`, `cc`, `bcc`, `replyTo`, `subject`, `text`, `html`, `attachments` (`{ filename, content:
Buffer or string, contentType, cid, encoding: 'base64' }`, `cid` for images of the HTML: `<img src="cid:logo">`)
  and `headers` (`{ name: value }`). Other fields are refused. `fields.mailInfo(kind)`: `messageId`, `accepted`,
  `rejected` (`[{ address, code, response }]`), `response` (the answer of the server), `sentAt` and `raw` (the
  message as sent).
- Messages are made as RFC 5322 and MIME ask: text and HTML as alternatives, inline images and attachments (names in
  RFC 2231), non-ASCII headers as encoded words (a line break in a value cannot add a header), bodies in
  quoted-printable or base64, domains in punycode, `bcc` only in the envelope. A message that is wrong (an address, a
  header) is a `MailError` of 400.
- `smtp` (`url: 'smtp://user:password@host:587'`, `smtps://` for TLS from the start, or `host`, `port`, `secure`,
  `auth`): its own client (no dependencies), with STARTTLS whenever the server offers it (`requireTLS` refuses a
  server without it), AUTH PLAIN, LOGIN or XOAUTH2 (`auth: { user, accessToken }`), SMTPUTF8 for addresses that are not
  ASCII, and connections kept for the next messages (`pool: { maxConnections: 3, maxMessages: 100, idleTimeout }`;
  one the server closed while it waited is opened again). Recipients the server refuses are in `rejected`; when it
  refuses all of them, or the message, or cannot be reached, the error is a `MailError` of 502 (`responseCode`,
  `response`, `rejected`). `db.backend.verify()` connects, secures and logs in. A server of mail does not keep what
  it sends: queries, updates and deletes of the model are `UnsupportedError`s.
- `memory-mail` makes the messages as `smtp` does (the same checks), accepts every recipient and keeps them: tests
  query them (`Email.objects.filter({ subject__startswith: 'Your' })`).
- The primary key is the automatic one (`smtp` gives none), or a string with a default, which is then the
  Message-ID.

Its tests run against a server of SMTP that checks the protocol (STARTTLS, TLS from the start, the three AUTH, refused
recipients, closed connections); its messages were checked with mailparser, and its client against nodemailer's
smtp-server.

## Databases from URLs

`Database.fromUrl(process.env.DATABASE_URL)` makes a database from a URL: `postgres://`, `mongodb://` (and
`mongodb+srv://`), `sqlite:data/app.db` (`sqlite::memory:`), `memory:`, `fs:folder`, `smtp://` and `smtps://`;
options given go over those of the URL (`Database.optionsFromUrl()` gives them).

## Several databases and tenants

`new Databases({ default: {...}, events: {...} }, { routes: { Event: 'events' } })` routes each model to a database:
the one of its option `database`, of its route, or the default one. Relations across databases are followed with more
queries (`prefetchRelated`, `load()`, the reverse accessors); a query cannot join them.

`new Tenants({ models, config, setup, max })` gives each tenant its database, opened the first time it is used;
`tenants.run(id, fn)` (or the HTTP plugin, for each request) runs code in it. A tenant can have several databases, a
provider for each collection: `config(id)` gives `{ databases: { name: options }, routes }` (over the `routes` of the
Tenants), and its models are routed to them as in Databases, so one tenant can keep its orders in PostgreSQL, its
events in MongoDB and its sessions in memory, and another tenant can have another layout.

```js
const tenants = new Tenants({
  models: [Author, Book, Event, Session], // Session has static options = { database: 'cache' }
  routes: { Event: 'events' }, // for every tenant; the models not named go to default
  config: async (id) => ({
    databases: {
      default: { backend: 'postgres', url: `postgres://app@db:5432/tenant_${id}` }, // Author, Book
      events: { backend: 'mongodb', url: 'mongodb://db:27017', database: `events_${id}` }, // Event
      cache: { backend: 'memory' }, // Session
    },
    routes: {}, // changes for this tenant only, such as { Event: 'default' }
  }),
  setup: (db) => db.sync(),
});
await tenants.run('acme', () => Event.objects.create({ kind: 'login' })); // in events_acme (MongoDB)
```

The database of a model is its option `database`, else its route (of the tenant, else of the Tenants), else the route
`'*'`, else `default`. The docs (`docs/orm/`, "Several databases in a tenant") have the whole of it.

## Audit log

A database with the option `audit` keeps every change of its objects in a table of its own (`xufa_audit`, the model
`AuditEntry`): what changed (the values before and after, field by field and inside json fields), who changed it, and
in what context. With `Tenants`, each tenant has its own log, in its database (the option in the config of the tenant).

```js
const { Database, plugin } = require('xufa/orm');

const db = new Database({ backend: 'postgres', url, audit: { redact: ['passwordHash'], retain: '365d' } });

await db.audit.with({ actor: user.id, reason: 'ticket 42' }, () => order.save()); // who, and in what context
await db.audit.log('export', { rows: 1200 }); // events of your own (log('viewed', null, { object }) for one object)
const history = await db.audit.history(order); // what happened to an object, oldest first
const today = await db.audit.entries({ model: Order, action: 'delete', since: midnight });

// In an app: the actor and context of each request (asked when an entry is made: the user is known then).
app.register(plugin, {
  database: db,
  audit: { actor: (request) => request.user && request.user.id, context: (request) => ({ ip: request.ip }) },
});
```

- **What is recorded:** the writes of the database: `save()`, `create()`, `bulkCreate()`, `update()` and
  `delete()` of QuerySets, and what deleting does to related objects (cascades, `setNull`). A save that changes
  nothing makes no entry.
- **An entry:** `at`, `action` (`create`, `update`, `delete`, `upsert`, or that of `log()`), `model`, `key` (the
  primary key as text; the JSON of the values of a composite one), `changes`, `data` (of `log()`), `actor` and
  `context`. `changes` is a list of `{ field, from, to }`: `from` is missing when a value was added, `to` when it
  was removed, and `path` says where inside a json field.
- **One transaction:** each write and its entries are made in one transaction, so a change is never without its entry
  (MongoDB without a replica set has no transactions). Updates read the rows before (locked, in PostgreSQL) and after;
  an update assigning only texts, integers, booleans, uuids and datetimes (values every backend gives back as
  given) is not read after (saves 15–30% faster), so a trigger that changes those values is not seen.
- **Redacted and left out:** encrypted fields, fields with the option `audit: 'redact'` and the names in `redact` are
  recorded as `{ field, redacted: true }`, without values. Fields with `audit: false` are left out (a change of only
  them makes no entry). Rows whose encrypted values cannot be decrypted (an old key gone) are still updated and
  deleted, their entries without those fields.
- **The models audited:** all of them, or those of `models`, without those of `exclude` and those with the option
  `audit: false`.
- **Retention:** `retain` (seconds, or text as `'365d'`): `db.expire()` and `startExpiry()` delete older entries.
- `auditResource({ auth })`: the entries over HTTP, read only (`GET /`, `GET /:id`), newest first, filtered by
  `model`, `key`, `action`, `actor` and date (`?at__gte=`, `?at__lt=`); with tenants, those of the tenant of the request.
  `auth` is required (a rule of @xufa/auth, or `false` to leave it open):
  `app.register(auditResource({ auth: 'admin' }), { prefix: '/audit' })`. `db.audit.resource({ auth })` gives the
  entries of that database (as `database`: for several databases audited without tenants).
- `group(fn)`: several writes that are one change make one entry for each object (the first value before and the
  last after of each field; a field back where it was is no change). An `update()` of fields that stored computed
  fields read is one, so its entry has both.
- `with(context, fn)` merges with the context of the code that runs it; `actor` and `context` can be functions,
  asked when an entry is made. Blob backends have no audit log.

## Caches

A model with the option `cache` (`true`, or `{ ttl, indexes }`) answers `get()` by its primary key, or by a unique
field of `indexes`, from the cache of its database (`cache` of the Database: a `MemoryCache({ max, ttl })` by
default; a `SharedCache({ bus })` in the primary of a cluster, a `LocalCache({ bus })` in each process, or the
`NetCache` of [@xufa/netcache](../netcache) between machines). Saving or deleting an object removes it. Values are
copied in and out.

A cache that fails to read or to write (a NetCache that lost its peers, a bus that does not answer) is a miss: the
database answers, and `onCacheError(err, { operation })` of the Database (or of `cached()`) is told; without it, a
warning (code `XUFA_ORM_CACHE`) is emitted once for each database. A delete that fails is an error (what the cache
keeps would be old): the `save()` or `delete()` that asked for it fails.

### Cached querysets

`.cached({ ttl })` keeps the results of a queryset in the cache of its database (objects, `values()`, `count()`,
`exists()`, `aggregate()`, `first()`...) until a model it reads is written: every write to a model with the option
`cache` (insert, update, delete, from anywhere in the app) gives it a new version, and results are kept by the
versions of the models they read (the model, and those of its conditions, orders and values: `writer__name` reads
Writer). With a SharedCache or a NetCache the versions are shared, so a write in one process is seen by all. Every
model a cached queryset reads needs the option `cache` (otherwise its writes would not be followed: it throws).
Inside transactions nothing is read nor kept, and a commit gives its models new versions again. Objects with related
ones (`selectRelated`, `prefetchRelated`) are not kept: cache their `values()`.

```js
const top = await Book.objects.filter({ author__country: 'ES' }).orderBy('-sales').limit(10).cached({ ttl: 60000 });
```

### Functions

`orm.cached(fn, { key, ttl, cache, name })` keeps the results of a function of yours: the same arguments (written the
same way whatever the order of the keys of objects; dates, bytes and bigints as values) give the result kept for
`ttl` ms, calls made while one runs wait for it (and get copies), and errors are not kept. `fn.invalidate(...args)`
and `fn.clear()` forget them. `cache`: where (a MemoryCache of its own by default; a SharedCache or NetCache shares
the results between processes, and then `name` tells functions apart).

```js
const rates = orm.cached(async (currency) => fetchRates(currency), { ttl: 600000 });
```

## Health and maintenance

`db.ping()` makes a round trip to the database (`SELECT 1`, MongoDB's `ping`; nothing for memory and files) and gives
its milliseconds, or throws; `db.health({ slow })` is the check of the database of `xufa.health` (critical, with its
latency; degraded when slower than `slow`). `maintenance(db)` keeps the maintenance mode
of an app in the database (table `xufa_maintenance`) so every machine sees it: `get()`, `set(state)`, `clear()`, the
store of `xufa.maintenance` of [@xufa/http](../http) that `xufa down --everywhere` sets.

## With @xufa/http

`app.register(orm.plugin, { database: db, migrate: { dir: 'migrations' } })` connects the database when the app
starts (and migrates it, when asked; `sync: true` creates the tables), gives it as `app.db` and closes it with the
app. Validation errors are answered with 400 and the messages of each field (`errors`), duplicates of unique fields
(`UniqueError`, from every backend) with 409 and their `fields`, and `get()` of nothing with 404.

### Schemas of routes

`Model.schema()` gives the JSON Schema of the objects of a model as [@xufa/schema](../schema) makes them, so its
functions take it and, in TypeScript, it carries the type of the objects (as JSON):

```js
const { s } = require('@xufa/schema');

const BookOut = Book.schema(); // the objects: replies
const NewBook = s.omit(Book.schema({ input: true, additionalProperties: false }), ['id', 'createdAt']);
const BookPatch = s.partial(NewBook); // the body of an update

app.post('/books', { schema: { body: NewBook, response: { 201: BookOut } } }, async (request, reply) => {
  reply.code(201);
  return Book.objects.create(request.body); // request.body: { title: string; writerId: number | string; pages?: ... }
});
```

- Each field is its JSON: dates and datetimes are strings (`format: date`, `date-time`), bytes base64 strings,
  decimals strings; `choices` are an `enum`; a field with `null: true` takes null (`type: ['integer', 'null']`).
- A foreign key is its key (`writerId`, of the type of the primary key it points to). Many-to-many relations and the
  bodies of blobs are not in it.
- Required: the fields that must be given. Not required: those that can be null, have a default, are given by the
  database (the automatic `id`, `autoNow`, what a blob backend knows) or are computed (`readOnly`).
- `input: true` leaves out what is never given: computed fields, and what a blob backend gives. Other options are
  those of `s.object()` (`additionalProperties`, `$id`, `title`...).
- In TypeScript, the type comes from `static fields` (those of its parents too with `fields.extend()`, see
  [TypeScript](#typescript)): `Infer<typeof BookOut>`,
  and typed requests with `SchemaTypeProvider`. `choices` give their values as a type when written `as const`.
- A model without a primary key (`primaryKey: false`) or with a composite one (`primaryKey: ['a', 'b']`) has no
  automatic `id`, in the schema and in its type when `static options` keeps the literal: `modelOptions()`, `as const`
  or `satisfies ModelOptions` (`{ primaryKey: false }` alone is a boolean to TypeScript, and the type keeps an `id`
  that is not required). `modelOptions()` returns the options as they are, keeps their values without `as const`,
  and refuses a misspelled name (`primarykey`): TypeScript when it checks the code, and JavaScript when the model is
  defined (a TypeError that names the option meant). `primaryKey` is not inherited (a child of a model
  without one has its `id`), but TypeScript reads the options of the parent in a child without options of its own.

```ts
import { Model, fields, modelOptions } from 'xufa/orm';

class Membership extends Model {
  static options = modelOptions({ primaryKey: ['team', 'user'] }); // no as const
  static fields = { team: fields.string(), user: fields.string() };
}
```

`Model.schema()` is the one source of the schemas of a model: `Model.jsonSchema({ exclude, partial })` is the same
schema in the form of OpenAPI 3.0 (`nullable: true`, no `null` type), and the resources of `orm.resource()` document
their routes with `Model.schema()` (@xufa/openapi writes null as OpenAPI 3.0 or 3.1 asks).

### Tenants of requests

With `tenants: { tenants, resolve, required, authorize }`, each request runs in its tenant: `resolve(request)` gives its
id (a header, the host, the user). A request without one gets 400 (unless `required: false`), and one of a tenant that
does not exist, 404. `authorize(request, id, reply)` says whether the request may use that tenant, before it is
entered (its database is not even looked up): `false` is answered with 403, and an error it throws is sent as it is.
With [@xufa/auth](../auth), users may use the tenants of their claims:

```js
app.register(orm.plugin, {
  tenants: {
    tenants,
    resolve: (request) => request.headers['x-tenant'],
    authorize: (request, id, reply) => app.auth.canUseTenant(request, id, reply), // 401 without a user, 403 if not its
  },
});
```

Without `authorize`, any request may use any tenant it names, and a warning says so when the app starts. `authorize:
false` is for tenants taken from the user itself (`resolve: (request) => request.user?.tenant`), which need no check.

### Reads that stop when the client goes away

With `cancel: true`, the reads of a request stop when its client goes away (`request.signal`): the queries that have
not started throw its reason (an `AbortError`), and PostgreSQL cancels the one that runs, so the server stops working
for nobody. Writes are not stopped (one the client did not wait for may still be wanted), nor the statements of a
transaction. Outside requests, `QuerySet.signal(signal)` and `orm.withSignal(signal, fn)` do the same:

```js
const books = await Book.objects.filter({ pages__gte: 100 }).signal(AbortSignal.timeout(2000));
await orm.withSignal(signal, async () => report());
```

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
- `strict: true`: those other fields are refused too, and every key refused (read-only or unknown) is in one
  `ValidationError`: 400 with `errors` by key (`{ id: ['This field is read-only.'], nope: ['Book has no field
nope.'] }`). In a PUT or PATCH, a read-only key with the value the object has is taken, so a body can be the object
  as it was read.
- `filters`, `ordering` and `search` say which query parameters lists take (`?pages__gte=100`, `?author__in=1,2`,
  `?ordering=-pages,title`, `?search=ada`, with `?limit=` and `?offset=`); others are a 400. `pageSize` (50),
  `maxPageSize` (500), `pagination: false` (arrays), `lookup` (the field of `/:id`, `pk` by default).
- `auth`: the rule of [@xufa/auth](../auth) (`config.auth` of the routes) for every action, or one by action.
- `openapi`: with [@xufa/openapi](../openapi), the routes are documented (operations, parameters, bodies and objects
  from `Model.schema()`, responses, the security of `auth`): `{ tag }` names their tag, `false` leaves them out.
  The object answered is a schema of its own (`app.addSchema({ $id: 'Book' })`, so `components/schemas` of the
  document) that every operation refers to; `{ component }` names it (the name of the model by default), and a name
  another schema has keeps the object inline. Only
  documented: what they accept and answer does not change. Bodies are checked by the resource and the model (unknown
  keys refused, read-only ones ignored or refused with `strict`, 400 with the errors of each field), not by a schema of
  the route. The documented bodies list the read-only fields too, as `readOnly`, with what the resource does with
  them.
- `hooks`: `beforeCreate(values, request)` and `beforeUpdate(object, values, request)` (they can change the values,
  or throw), `afterCreate`, `afterUpdate` and `beforeDelete(object, request)`.
- Errors are answered with their status: 400 for values that are not valid (with the messages of each field), 404,
  and 409 for duplicates (`UniqueError`) and for objects others protect (`ProtectedError`).

## Faults (tests of resilience)

`db.faults` makes operations of a database fail, wait or hang, as a database that is down, slow or lost would, to
see what an app does then (in its tests, or in staging): retries, timeouts, the answers of its routes, its alerts.
`dbs.faults` does it to every database of `Databases`, and `tenants.faults` to the databases of every tenant (those
open and those opened after; rules can name tenants).

```js
db.faults.fail({ operations: 'write', models: [Order], rate: 0.2 }); // 1 write of Order in 5 fails
db.faults.delay({ operations: 'read', ms: 300, jitter: 200 }); // reads take 300 to 500 ms more
const hung = db.faults.hang({ models: ['Payment'] }); // they do not end until hung.release()
tenants.faults.down({ tenants: ['acme'] }); // every operation of acme fails (connect too)
db.faults.up(); // no more down
db.faults.clear(); // no more faults
```

- A rule matches `operations` (`select`, `count`, `aggregate`, `insert`, `update`, `delete`, `transaction`,
  `connect`; `'read'` and `'write'` for the first six; all but `connect` by default), `models` (classes or names) and
  `tenants`; `rate` is the chance of each match (`faults.random` is `Math.random`: give it a function of your own,
  in tests, for results that do not change), `after` leaves the first matches alone, and `times` removes it after
  that many.
- Each rule given back counts its `hits`; `remove()` takes it away, and `release()` lets the operations it holds
  (`hang`) go on.
- The errors of `fail` and `down` are `FaultError`s (code `XUFA_ORM_ERR_FAULT`, status 503: the HTTP plugin answers
  503), or the `error` given (an error, or a function of `{ operation, model, tenant }`).
- Without rules, the operations are as they were (one check of an empty list). Objects that the cache of a model gives
  do not reach the database, so no fault happens to them.
- `cache.faults` of `MemoryCache`, `SharedCache` and `LocalCache` (and of `NetCache`) makes the cache fail:
  `get`, `set`, `delete` and `clear` (`read` and `write`), `keys` by prefix or regular expression.
  `cache.faults.down()` shows that the app still answers without its cache (see [Caches](#caches)).

The rules are those of [@xufa/faults](../faults), which the faults of [@xufa/client](../client) (calls to APIs) and
[@xufa/cluster](../cluster) (messages of the bus) use too. `Faults` is exported, and `err instanceof FaultError` is
true of the errors of all of them.

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

Children of a model: `fields.extend(Parent, { ... })` gives the fields of the parent (and of its parents) with those
given, as the ORM merges them (theirs replace those of the same name; `null` removes one). The model is the same as
with its own fields only; TypeScript then knows them all (`Fields<typeof Article.fields>`, `Article.schema()`), and
the class is accepted as a child of its parent (its `static fields` has the parent's).

```ts
class Timestamped extends Model {
  static options = { abstract: true };
  static fields = { createdAt: fields.datetime({ autoNowAdd: true }), updatedAt: fields.datetime({ autoNow: true }) };
}
const articleFields = fields.extend(Timestamped, { title: fields.string() });
class Article extends Timestamped {
  static fields = articleFields;
}
interface Article extends Fields<typeof articleFields> {} // article.title, article.createdAt...
```

A child that removes a field of its parent (`null`) is not one TypeScript accepts as its child (`// @ts-expect-error`
on its class); its fields are still typed without that one.

`Book.schema()` is typed from the same fields: `Infer<typeof schema>` of [@xufa/schema](../schema) is the type of
its objects as JSON ([Schemas of routes](#schemas-of-routes)).

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
- Decimals are compared, ordered and summed as numbers, exactly (MongoDB keeps them as `Decimal128`); sums and
  averages are numbers.

What differs, as it does between the databases:

- Transactions: `db.transaction(fn)` commits when `fn` ends and rolls back when it throws; transactions inside it are
  savepoints. MongoDB has transactions on replica sets and sharded clusters only (on a standalone server, `fn` runs
  without one), and no savepoints: a transaction that fails inside another rolls back the outer one.
- Foreign keys are constraints in SQL; in MongoDB, a key can point to nothing.
- Decimals in MongoDB have 34 digits at most (`Decimal128`): a decimal field with a larger `precision` is refused.
  Decimals written as strings by earlier versions of the ORM are read as they are but compared as text:
  `await db.migrateDecimals()` converts them in the server (the number of values, by model).
- The order of strings is the collation of the database.
- Raw queries: `db.backend.raw(sql, params)` in SQL; `db.backend.db` is the `@xufa/mongo` database in MongoDB.

## Not yet

Ordering and values across reverse relations (conditions and aggregates follow them), generic relations, and a CLI for
migrations.

## License

MIT.
