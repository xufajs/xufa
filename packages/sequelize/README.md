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
  retried on `SQLITE_BUSY`; row locks (`lock`, `skipLocked`, `lock: { level, of }`).
- Raw SQL: `sequelize.query(sql, { replacements, bind, type, model, mapToModel, plain, nest, fieldMap, retry,
rawErrors })`. As in Sequelize, replacements are written in the SQL, escaped; binds (`$1`, `$name`) are parameters
  of the database.
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

- `BIGINT` values are numbers when they are safe integers (bigints otherwise), not strings.
- `NULL`s sort first in ascending order and last in descending order, in every database (as @xufa/orm); orders by
  the rows of includes of many keep the order of the database.
- Foreign keys are not indexed unless an index says so (as in Sequelize).
- A model without a primary key (`removeAttribute('id')`) has a table without one; its instances are only created:
  `save()` of a saved one, `destroy()`, `reload()` and `increment()` throw (Sequelize writes every row of the table
  then, with an empty where), so its rows are written with `Model.update()` and `Model.destroy()`. A primary key that
  references another table is not a relation of @xufa/orm. Primary keys of several attributes are composite keys (and those of
  the through models Sequelize makes, as Sequelize does); no foreign key points to such a model unless to a unique key.
- `hasMany`, `hasOne` and `belongsToMany` includes are loaded with queries of their own: `count` with them counts
  the parents (as `distinct: true` does) and literals cannot name their columns; orders by their attributes are
  subqueries.
- Polymorphic keys (one key of associations to several models, by scopes) are columns, not relations: required
  includes of them are found first, and conditions across them (`$comments.title$`) are not supported.
- Right joins (`include: [{ right: true }]`) are not made: `right` is ignored, as Sequelize does in the dialects
  without them (the dialect says `RIGHT JOIN: false`).
- Not supported (they throw `NotSupportedError`): functions in conditions of includes.

## Compatibility

The integration tests of Sequelize 6 (its v6 branch, `test/integration`) run against this package, each file in a
process of its own, with `sequelize` resolved to this package; the same harness runs them against Sequelize 6.37.8
itself, to tell the failures of the tests and of the environment from those of the package (the harness is
[`tools/sequelize-compat`](../../tools/sequelize-compat)). Latest runs:

| Database                                    | @xufa/sequelize          | Sequelize 6.37.8        |
| ------------------------------------------- | ------------------------ | ----------------------- |
| SQLite                                      | 1,707 passed, 54 failed  | 1,737 passed, 5 failed  |
| PostgreSQL 18 (PostGIS, hstore, btree_gist) | 1,939 passed, 105 failed | 1,968 passed, 39 failed |

What fails here and passes in Sequelize checks its internals (the parsers of its data types, its connection manager
and query generator), the SQL text it writes, or the differences listed above (bigints as bigints, hasMany includes
loaded apart...), by design.
