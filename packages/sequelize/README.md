# @xufa/sequelize

The API of [Sequelize](https://sequelize.org) 6 over [@xufa/orm](../orm): code written for Sequelize runs with
`require('@xufa/sequelize')` instead of `require('sequelize')`, with no dependencies (PostgreSQL through
[@xufa/pg](../pg), SQLite through `node:sqlite`).

```js
const { Sequelize, DataTypes, Op } = require('@xufa/sequelize');

const sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', { logging: false });
const Author = sequelize.define('Author', { name: { type: DataTypes.STRING, allowNull: false } });
const Book = sequelize.define('Book', { title: DataTypes.STRING, pages: DataTypes.INTEGER });
Book.belongsTo(Author, { as: 'author' });
Author.hasMany(Book, { as: 'books' });

await sequelize.sync();
const ada = await Author.create({ name: 'Ada' });
await ada.createBook({ title: 'Notes', pages: 120 });
const books = await Book.findAll({
  where: { pages: { [Op.gte]: 100 } },
  include: [{ model: Author, as: 'author' }],
  order: [['pages', 'DESC']],
});
```

## Speed

The same Sequelize code (the benchmark's adapter, unchanged) against Sequelize 6.37 with pg and sqlite3 is in
[bench/results](../../bench/results) (`orm-6.md`): from 2x to 12x faster in reads and writes, about the same where the
database does the work (sorts of big tables, updates of many rows).

What makes it faster: the queries are compiled once per shape and prepared by @xufa/pg (binary results), rows become
instances without copies, belongsTo includes are joins and hasMany ones a query more (never duplicated rows to put
back together), and big bulkCreates use COPY.

## What there is

- `new Sequelize(url, options)`, `new Sequelize(database, username, password, options)`, `new Sequelize(options)`;
  dialects `postgres` and `sqlite` (`sqlite::memory:`, `storage`); `define`, `models`, `model()`, `isDefined()`,
  `authenticate()`, `sync({ force })`, `drop()`, `close()`, `logging` (console.log by default, as in Sequelize).
- Connections (PostgreSQL), as Sequelize makes them: the `dialectOptions` it gives pg (`ssl`, `application_name`,
  `statement_timeout`, `query_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, `keepAlive`,
  `options`...), `ssl`, `client_min_messages` (`warning` by default; `clientMinMessages`, `false` or `'IGNORE'` to
  leave the server's), `pool` (`max`, `idle`); `replication: { write, read: [...] }`, with finds, counts, aggregates
  and queries of type SELECT on the replicas in turn (not with `useMaster`), read-only transactions too, and the rest
  on the primary; the errors of connections by their cause (`ConnectionRefusedError`, `HostNotFoundError`,
  `HostNotReachableError`...); `pool.acquire` (60 s: what waits longer for a connection of the pool fails with
  `ConnectionAcquireTimeoutError`); the hooks `beforePoolAcquire` and `afterPoolAcquire`; and
  `connectionManager` as Sequelize has it: the numbers of its `pool` (`size`, `available`, `using`, `waiting`),
  `getConnection(options)` and `releaseConnection(connection)` (a client of `@xufa/pg` for code of your own: `query()`,
  `processID`; of a replica for `type: 'SELECT'`), `validate(connection)`, and `_connect(options)`, through which
  every connection is opened (to wrap it, or stub it in tests). `quoteIdentifiers: false` makes the names of
  tables and columns those PostgreSQL makes of names not quoted (lower case), so SQL without quotes names them.
- Types of your own, as Sequelize takes them: `DataTypes.DATE.parse = (value) => ...` (the values read) and
  `DataTypes.DATE.prototype.stringify` or `bindParam` (the values written), after `sequelize.refreshTypes()`; the
  parse functions of types a dialect cannot parse are an error there, as in Sequelize.
- Models: `Model.init` and `sequelize.define`, table names as Sequelize makes them (plural, `freezeTableName`,
  `tableName`, `underscored`), `timestamps` (`createdAt`, `updatedAt`, custom names or false), `paranoid`, `indexes`,
  `unique` (and named composite uniques), `defaultValue` (values, functions, `NOW`, `UUIDV4`), getters and setters of
  attributes, `getterMethods`, `setterMethods`, `VIRTUAL`, `defaultScope` and `scopes`, `hooks`.
- DataTypes: `STRING`, `CHAR`, `TEXT`, `CITEXT`, `INTEGER` (and `TINYINT`, `SMALLINT`, `MEDIUMINT`), `BIGINT`,
  `FLOAT`, `REAL`, `DOUBLE`, `DECIMAL`, `NUMERIC`, `BOOLEAN`, `DATE`, `DATEONLY`, `TIME`, `UUID`, `JSON`, `JSONB`,
  `BLOB`, `ENUM`, `ARRAY` (stored as JSON), `INET`, `CIDR`, `MACADDR`, `RANGE`, `VIRTUAL`; binary strings
  (`STRING(n, true)`, `STRING.BINARY`); the DataType methods of Sequelize (`validate`, `stringify`, `parse`).
- Validation: `allowNull` (notNull Violation), string violations, the validators of validator.js that Sequelize has
  (`isEmail`, `len`, `isIn`, `min`, `max`, `is`, `notEmpty`, `isUUID`, `isURL`, `isInt`, `isImmutable`...),
  `Sequelize.Validator.extend()`, custom validators (also with a `next` callback) and model validators;
  `ValidationError` with `ValidationErrorItem`s (`origin`, `getValidatorKey()`). Optimistic locking (`version`).
- JSON: conditions inside JSON attributes (`{ data: { owner: { name: 'Ada' } } }`, `'data.owner.name'`, with the
  operators of `Op`), `sequelize.json()`, `sequelize.where()`, JSON paths in `attributes` and `order`.
- Schemas: `define(..., { schema })`, `Model.schema()`, `createSchema` (real schemas in PostgreSQL, table names
  `schema.table` in SQLite, as Sequelize does); `Deferrable` constraints and transactions (PostgreSQL).
- Finding: `findAll`, `findOne`, `findByPk`, `findAndCountAll`, `count` (`distinct`, `col`, `group`), `max`, `min`,
  `sum`, `where` with the operators of `Op` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `is`, `not`, `in`, `notIn`,
  `between`, `notBetween`, `like`, `notLike`, `iLike`, `notILike`, `startsWith`, `endsWith`, `substring`, `regexp`,
  `iRegexp`, `any`, `all`, the operators of ranges and of JSONB in PostgreSQL, `and`, `or`, `not`, `col`),
  `$include.attribute$` keys, `literal()`, `fn()`, `col()`, `cast()` and `where()` in conditions, attributes and
  orders, `attributes` (names, renames, `exclude`, aggregates with `fn('COUNT', ...)` and `group`), `order`
  (attributes and attributes of includes), `limit`, `offset`, `raw`, `nest`, `rejectOnEmpty` (also of the model),
  `paranoid` (with a `deletedAt` default too).
- Includes: `belongsTo` (joined; `where`, `required`, nested), `hasMany`, `hasOne` and `belongsToMany` (one query more
  each; `where` and `required`, nested too, filter the parents as inner joins do), `include: ['alias']`,
  `{ association }`, `{ all: true }`, scoped models, the through instance of belongsToMany (`tag.BookTags`,
  `through: { as, attributes, where, paranoid }`). `separate: true` includes do not filter the parents, and their
  `limit` is per parent (a window, `ROW_NUMBER() OVER (PARTITION BY ...)`, in SQL); `groupedLimit` of `findAll` too.
- Writing: `build`, `save` (only what changed), `create` and `bulkCreate` (`include`, `validate`, `fields`,
  `individualHooks`, `ignoreDuplicates`, `updateOnDuplicate`, `conflictAttributes`, `conflictWhere` on partial
  unique indexes), `update` (instance and model, `individualHooks`, `sideEffects`, `returning`; `fn`, `col` and
  `literal` values), `destroy` (`force`, `truncate`, `individualHooks`), `restore`, `increment`,
  `decrement`, `reload`, `findOrCreate`, `findOrBuild`, `upsert` (one `INSERT ... ON CONFLICT DO UPDATE`, on the
  primary key or the unique key of the values given, or `conflictFields`); `changed()`, `previous()`,
  `get({ plain })`, `toJSON()`, `set`, `setDataValue`, `isNewRecord`, `isSoftDeleted()`.
- `searchPath` (PostgreSQL) in the options of finds, writes and `sync`: the operation runs with that search_path, set
  for it with `SET LOCAL` in a transaction of its own (or the one given).
- `ARRAY` columns are arrays of PostgreSQL (`VARCHAR(255)[]`, `"enum_<table>_<column>"[]`), with `Op.contains`,
  `Op.contained` and `Op.overlap`; in SQLite they are JSON (Sequelize has no arrays there).
- `HSTORE` (PostgreSQL with the extension hstore): objects of strings, compared as wholes in conditions, also in
  arrays (`ARRAY(HSTORE)`). `sync` adds the values an `ENUM` gained to its type (in their order). Includes are own
  properties of the instances too (`user.hasOwnProperty('tasks')`), as in Sequelize.
- `GEOMETRY` and `GEOGRAPHY` (PostgreSQL with PostGIS): GeoJSON values, with their SRID as crs. A value without crs
  is stored without SRID and read back as it was given (Sequelize 6 with PostGIS 3 gives back EPSG:4326); coordinates
  that are not numbers are a ValidationError (PostGIS would store them as 0).
- Fillfactor (an option of @xufa/orm, not of Sequelize): `define(name, attributes, { fillfactor: 50 })` makes the
  table `WITH (fillfactor = 50)` in PostgreSQL (10 to 100: room left in its pages, so updated rows stay in them and the
  table bloats less), and `sync({ alter })` sets or resets it. SQLite ignores it.
- Schema: `sync({ force, alter, match })` and `Model.sync()`, with the SQL types of Sequelize (`VARCHAR(255)`,
  `TINYINT(1)`, `TIMESTAMP WITH TIME ZONE`, the enum types of PostgreSQL...), and the QueryInterface:
  `createTable`, `describeTable`, `dropTable`, `renameTable`, `showAllTables`, `addColumn`, `removeColumn`,
  `changeColumn`, `renameColumn`, `addIndex`, `removeIndex`, `showIndex`, `addConstraint`, `removeConstraint`,
  `showConstraint`, `getForeignKeyReferencesForTable`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `pgListEnums`,
  `createSchema`... (SQLite tables are made again for the changes it cannot make, as Sequelize does);
  `Model.describe()`.
- Associations: `belongsTo`, `hasOne`, `hasMany`, `belongsToMany` (`through` names or models), with the keys
  Sequelize makes (`AuthorId`, `author_id` when underscored), `as`, `foreignKey` (names or options), `sourceKey`,
  `targetKey`, `otherKey`, `uniqueKey`, `onDelete` (in the database; with `hooks: true`, dependents are destroyed one
  by one with their hooks), scopes of associations and of through models, and the accessors (`getBooks`, `setBooks`,
  `addBook`, `addBooks`, `removeBook`, `hasBook`, `countBooks`, `createBook`, `getAuthor`, `setAuthor`,
  `createAuthor`...; getters take `scope` and through values).
- Hooks: those of instances and of bulk operations (`beforeCreate`, `afterSave`, `beforeBulkUpdate`...), of finds
  (`beforeFind`, `beforeFindAfterOptions`, `afterFind`), of syncs, `beforeDefine`/`afterDefine` and
  `Sequelize.beforeInit`/`afterInit`, by `addHook`, `Model.beforeCreate(fn)` or the `hooks` option.
- Transactions: managed (`sequelize.transaction(async (t) => ...)`, with `afterCommit`) and not managed
  (`const t = await sequelize.transaction(); ... await t.commit()`), nested ones as savepoints; as in Sequelize, the
  queries not given `{ transaction: t }` run outside it in PostgreSQL (unless `Sequelize.useCLS()` was called; in
  SQLite they are always part of it); isolation levels (PostgreSQL), transaction types of SQLite (`EXCLUSIVE`...),
  retried on `SQLITE_BUSY`; row locks (`lock`, `skipLocked`, `lock: { level, of }`). As in Sequelize, a transaction
  not managed ends with `queryInterface.commitTransaction()` or `rollbackTransaction()`, which run `COMMIT;` or
  `ROLLBACK;` through `sequelize.query` (logged with the id of the transaction); when they fail, the transaction is
  rolled back and its connection closed, not given back to the pool.
- Raw SQL: `sequelize.query(sql, { replacements, bind, type, model, mapToModel, plain, nest, fieldMap, retry,
rawErrors })`. As in Sequelize, replacements are written in the SQL, escaped; binds (`$1`, `$name`) are parameters
  of the database.
- `operatorsAliases` (deprecated in Sequelize 6, as there): `{ $gt: Op.gt }` makes `{ age: { $gt: 18 } }` a
  condition. `queryInterface.queryGenerator` (also `sequelize.dialect.queryGenerator`) has
  `handleSequelizeMethod(fragment)` (the SQL of `literal`, `col`, `fn`, `cast`, `where` and `json`, values written
  as literals) and `getForeignKeysQuery(table)` (run with `type: QueryTypes.FOREIGNKEYS`).
- CLS: `Sequelize.useCLS(namespace)` as in Sequelize (the transaction of a managed callback is in the namespace, and
  the queries without `{ transaction }` take it).
- QueryInterface: tables, columns, indexes and constraints (SQLite tables are made again for the changes it cannot
  make, as Sequelize does), rows (`bulkInsert`, `bulkUpdate`, `bulkDelete`, `insert`, `select`, `upsert`,
  `increment`, `decrement`, `delete`, `rawSelect`), and in PostgreSQL functions (`createFunction`...), triggers
  (`createTrigger`, `dropTrigger`, `renameTrigger`), databases (`createDatabase`, `dropDatabase`) and enum types.
- Also: the `schema` option of the Sequelize instance, `onUpdate` (CASCADE by default, as Sequelize), references to
  tables that are no model, functional indexes (PostgreSQL), aggregates of includes
  (`attributes: [[fn('COUNT', col('comments.id')), 'n']]` with `group`), `Sequelize.useInflection()`, and the
  helpers of `Utils` that code outside Sequelize uses (`pluralize`, `camelize`, `cloneDeep`...).
- Errors: `ValidationError`, `UniqueConstraintError` (with `fields`), `ForeignKeyConstraintError`, `DatabaseError`,
  `EmptyResultError`, `ConnectionError`, `TimeoutError`...

## From Sequelize 7

The API is Sequelize 6's: code written for it runs as it is. What Sequelize 7 improves is taken where it does not
change what code for Sequelize 6 does:

- `queryInterface.changeColumns(table, { column: definition })`: several columns in one `ALTER TABLE` (one rebuild of
  the table in SQLite), and only what a definition gives changes (`allowNull` when it is true or false, the default
  when `defaultValue` is given, or dropped with `dropDefaultValue: true`; the type, `unique`, `references`, `comment`
  and `autoIncrement` when given). In PostgreSQL an `ENUM` keeps the type of its column: the values it lacks are added
  to it, and it is made again when values are left out (it fails, changing nothing, when rows have them). A text
  column can become an enum. `changeColumn` stays as in Sequelize 6 (the column gets the definition given: `NULL`
  allowed and no default unless given), and keeps the enum type of the column too.
- Paths inside JSON attributes in conditions: keys in double quotes (`'data."a.b"'`, `{ data: { '"x.y"': 1 } }`, the
  empty key `'data.""'`), keys named as operators (`{ data: { in: 1 } }`), indexes up to 2^31 - 1 (larger ones throw,
  as in Sequelize 7, instead of matching nothing), and casts checked (`::123` throws).
- Attribute names with any character (`first-name`, `a b`, `café`...) in conditions, orders and
  `$include.attribute$`.
- Attributes computed by the database: `DataTypes.VIRTUAL(type, (includeAs) => [literal(...), 'name'])` (or the
  literal alone) is selected when it is in `attributes`, of the find or of an include, `includeAs` naming the table of
  its model in the query:
  ``posts: DataTypes.VIRTUAL(DataTypes.INTEGER, (as) => literal(`(SELECT COUNT(*) FROM posts p WHERE p.user_id = ${as}.id)`))``.
- Runtime attributes: with `enableRuntimeAttributes: true` (of the find, or of the model), the values selected with
  names of their own (`attributes: [[literal('...'), 'score']]`) are properties of the instances (`user.score`), not
  only values of `get()`.
- `build(saved.toJSON(), { isNewRecord: false })` keeps the timestamps, and `toJSON()` gives the values of virtual
  attributes in the order of the attributes.
- `showIndexes()`, as Sequelize 7: `{ name, unique, primary, fields: [{ name, order, collate }] }` (with `method` and
  `includes` in PostgreSQL), the order and collation of every field in SQLite too. `showIndex()` stays as in Sequelize
  6, and gives `method` (`BTREE`, `GIN`...) and `includes` (the columns of `INCLUDE`) in PostgreSQL too.
- The enum values of `describeTable()` are those of the schema of the column.
- BIGINT values as bigints: `new Sequelize(url, { bigint: 'bigint' })` (or `'string'`; see [Differences](#differences)).
- `Model.findByPks(keys, options)`: the instances of several primary keys in one query (objects of the attributes of
  a composite key); none for an empty list, without a query.
- `sync()` makes the schemas of the tables (and of named enums) that are not there.
- `DataTypes.UUIDV7`: defaults of UUIDs of version 7 (the time first: they sort as they are made, and stay in order
  within a millisecond).
- `noWait: true` with `lock`: an error (55P03) at once on rows locked by others, instead of waiting (PostgreSQL).
- `onConflictUpdateWhere` (`bulkCreate` with `updateOnDuplicate`, and `upsert`): ON CONFLICT ... DO UPDATE ... WHERE,
  the rows there updated only when it holds. Rows a conflict leaves out (ignored or not updated) get no key, and the
  others theirs (`ignoreDuplicates` too).
- `updateOnDuplicate` takes `[attribute, value]` pairs too, a value or SQL (`['hits', literal('"Usage"."hits" + 1')]`;
  in PostgreSQL the columns are named with the model or its table, or `excluded.`, as the bare ones are ambiguous),
  and the includes of `bulkCreate` take it for their rows. `upsert(values, { updateValues })`: what a row there gets
  instead of the values inserted (`{ hits: literal('"Usage"."hits" + 1') }`).
- Named enums (PostgreSQL): `DataTypes.ENUM({ values, name, schema })` is one type for every column of it (and of
  arrays of it), made once (with its schema) and given the values it lacks; dropping a table keeps it.
- Foreign keys indexed: `new Sequelize(url, { indexForeignKeys: true })` indexes the keys associations make, and
  `foreignKey: { index: true | false | { unique, name } }` says it for one (Sequelize 7 indexes them by default; here
  it is asked for, so `sync()` makes what it made).
- STRICT tables of SQLite: `define(name, attributes, { strict: true })` (and `queryInterface.createTable(..., { strict:
true })`), the columns of the types STRICT has (INTEGER, REAL, TEXT, BLOB; dates, decimals and json are text);
  tables made again for changes stay STRICT. Other dialects refuse it.
- Generated columns: `{ type, generatedAs: literal('"price" * "quantity"'), generatedColumn: 'STORED' | 'VIRTUAL' }`.
  Their values are not written (those given are left out), and are read back after `create` and `save`; `sync({
alter })` and the tables SQLite makes again keep them.
- Instances of classes as values (`create(new Input())`, `build`, `upsert`, `update`, `bulkCreate`): the values
  of their getters for the attributes and associations of the model.
- Plain objects in `set` and `add` of hasMany and belongsToMany are targets to create (`user.setTasks([task,
{ title: 'new' }])`), and `createTasks(records)` creates several at once (for associations whose plural is not
  their singular).
- `Model.update(values, { where, include })`: the rows whose includes are there (required, or with a where), as a
  find gives them.

## TypeScript and ES modules

The declarations are Sequelize's own (6.37.8), ported with their type tests by
[`tools/port-types`](../../tools/port-types): models typed by `InferAttributes`, `CreationOptional`, the accessors
of associations, `WhereOptions`... What changes in them is what the package has not: the helpers of Sequelize's own
SQL writer in `Utils` (`format`, `mapFinderOptions`...) and the transactions of the QueryInterface
(`startTransaction`...; transactions are `sequelize.transaction()`). They do not need `@types/validator` or
`retry-as-promised`, as Sequelize's do. `NotSupportedError` is declared too.

```ts
import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  Sequelize,
} from '@xufa/sequelize';

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
}

const sequelize = new Sequelize('sqlite::memory:');
User.init(
  { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, name: DataTypes.STRING },
  { sequelize }
);
await sequelize.sync();
const ada = await User.create({ name: 'Ada' }); // id is optional
```

As Sequelize, the package is also an ES module with named exports (`import { Sequelize, DataTypes, Op } from
'@xufa/sequelize'`), and `require('@xufa/sequelize')` is the Sequelize class.

## Differences

- `BIGINT` values are numbers when they are safe integers (bigints otherwise), not strings. The option `bigint` of
  the Sequelize instance changes it: `'bigint'` (always bigints, as Sequelize 7 goes) or `'string'` (as Sequelize 6
  gives them in PostgreSQL), for the values read and those set, `BIGINT` keys (`autoIncrement` too) and the foreign
  keys to them.
- `NULL`s sort first in ascending order and last in descending order, in every database (as @xufa/orm); orders by
  the rows of includes of many keep the order of the database.
- Foreign keys are not indexed unless an index says so (as in Sequelize).
- A model without a primary key (`removeAttribute('id')`) has a table without one; its instances are only created:
  `save()` of a saved one, `destroy()`, `reload()` and `increment()` throw (Sequelize writes every row of the table
  then, with an empty where), so its rows are written with `Model.update()` and `Model.destroy()`. A primary key that
  references another table is not a relation of @xufa/orm. Primary keys of several attributes are composite keys (and those of
  the through models Sequelize makes, as Sequelize does); no foreign key points to such a model unless to a unique key.
- `hasMany`, `hasOne` and `belongsToMany` includes are loaded with queries of their own: `count` with them counts
  the parents (as `distinct: true` does) and literals cannot name their columns; orders by their attributes, at any
  depth (`[[Country, { model: Person, as: 'residents' }, 'lastName', 'ASC']]`), are subqueries of the first of their
  rows (limits too).
- Polymorphic keys (one key of associations to several models, by scopes) are columns, not relations: required
  includes of them are found first, and conditions across them (`$comments.title$`) are not supported.
- Right joins (`include: [{ right: true }]`) are not made: `right` is ignored, as Sequelize does in the dialects
  without them (the dialect says `RIGHT JOIN: false`).
- Not supported (they throw `NotSupportedError`): functions in conditions of includes.

## Compatibility

The integration tests of Sequelize 6 (its v6 branch, `test/integration`) run against this package, each file in a
process of its own, with `sequelize` resolved to this package; the same harness runs them against Sequelize 6.37.8
itself, to tell the failures of the tests and of the environment from those of the package (the harness is
[`tools/sequelize-compat`](../../tools/sequelize-compat)). The tests both runs ran (a test that fails in a hook
leaves the rest of its file out, and the features a dialect says it supports decide which tests run), in the latest
runs:

| Database                                    | Tests run by both | @xufa/sequelize         | Sequelize 6.37.8        |
| ------------------------------------------- | ----------------- | ----------------------- | ----------------------- |
| SQLite                                      | 1,746             | 1,720 passed, 21 failed | 1,737 passed, 4 failed  |
| PostgreSQL 18 (PostGIS, hstore, btree_gist) | 2,006             | 1,971 passed, 35 failed | 1,968 passed, 38 failed |

Of the failures, 3 (SQLite) and 8 (PostgreSQL) fail on Sequelize too. In all, this package runs 1,766 tests in
SQLite (1,740 pass: those of separate includes and groupedLimit, which Sequelize skips in SQLite, too) and 2,062 in
PostgreSQL (2,023 pass); Sequelize runs 1,747 and 2,007 (a test of concurrency of its own crashes its database in
PostgreSQL, and leaves the rest of its file out).

What fails here and passes in Sequelize checks its internals (the parsers of its data types, its connection manager
and query generator), the SQL text it writes, or the differences listed above (bigints as bigints, hasMany includes
loaded apart...), by design.
