// Migrations, as in Django: makeMigrations() compares the schema of the models (schema.js) with the schema the
// migration files give (their operations applied one after the other) and writes a file with the operations between
// them; migrate() applies the files not applied yet, in order, each in a transaction where the backend has them, and
// records them in the database (xufa_migrations).
//
// Operations (data, in the files; they can be edited and written by hand):
//   { op: 'createTable', spec }                      { op: 'dropTable', table }
//   { op: 'addColumn', table, column, spec, default } { op: 'dropColumn', table, column }
//   { op: 'alterColumn', table, column, from, to }    { op: 'renameColumn', table, from, to }
//   { op: 'renameTable', from, to }                   { op: 'setOptions', table, fillfactor }
//   { op: 'createIndex', table, index }               { op: 'dropIndex', table, name }
//   { op: 'sql', sql }  (SQL backends)               { op: 'run', fn: async (db) => {} }  (data migrations)
// Renames are not detected (they are a drop and an add): write renameColumn or renameTable instead.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { specOf, defaultOf } from './schema.js';
import { ModelError } from './errors.js';
import { tableKey } from './meta.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FILE = /^(\d{4})_[\w-]+\.js$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// The schema after an operation (a new object; the one given is not changed).
function applyOperation(state, op) {
  const next = { tables: { ...state.tables } };
  const table = (name) => {
    if (!next.tables[name]) throw new Error(`Migration ${op.op}: there is no table ${name}`);
    next.tables[name] = clone(next.tables[name]);
    return next.tables[name];
  };
  switch (op.op) {
    case 'createTable':
      next.tables[tableKey(op.spec.table, op.spec.schema)] = clone(op.spec);
      break;
    case 'dropTable':
      delete next.tables[op.table];
      break;
    case 'addColumn':
      table(op.table).columns[op.column] = clone(op.spec);
      break;
    case 'dropColumn': {
      const spec = table(op.table);
      delete spec.columns[op.column];
      spec.indexes = spec.indexes.filter((index) => !index.columns.includes(op.column));
      break;
    }
    case 'alterColumn':
      table(op.table).columns[op.column] = clone(op.to);
      break;
    case 'renameColumn': {
      const spec = table(op.table);
      spec.columns = Object.fromEntries(
        Object.entries(spec.columns).map(([name, column]) => [name === op.from ? op.to : name, column])
      );
      spec.indexes.forEach((index) => {
        index.columns = index.columns.map((name) => (name === op.from ? op.to : name));
      });
      Object.values(next.tables).forEach((other) => {
        Object.values(other.columns).forEach((column) => {
          const target = column.references && tableKey(column.references.table, column.references.schema);
          if (target === op.table && column.references.column === op.from) {
            column.references.column = op.to;
          }
        });
      });
      break;
    }
    case 'renameTable': {
      // Tables are known by their keys (schema.table): the name is the key without the schema.
      const spec = table(op.from);
      delete next.tables[op.from];
      const prefix = spec.schema ? `${spec.schema}.` : '';
      spec.table = prefix && op.to.startsWith(prefix) ? op.to.slice(prefix.length) : op.to;
      next.tables[tableKey(spec.table, spec.schema)] = spec;
      Object.keys(next.tables).forEach((name) => {
        const other = clone(next.tables[name]);
        Object.values(other.columns).forEach((column) => {
          const target = column.references && tableKey(column.references.table, column.references.schema);
          if (target === op.from) column.references.table = spec.table;
        });
        next.tables[name] = other;
      });
      break;
    }
    case 'setOptions':
      table(op.table).fillfactor = op.fillfactor || null;
      break;
    case 'createIndex':
      table(op.table).indexes.push(clone(op.index));
      break;
    case 'dropIndex': {
      const spec = table(op.table);
      spec.indexes = spec.indexes.filter((index) => index.name !== op.name);
      break;
    }
    case 'sql':
    case 'run':
      break;
    default:
      throw new Error(`Unknown migration operation ${op.op}`);
  }
  return next;
}

const sameColumn = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The operations from the schema `from` to the schema of the models (`metas`, each after those it points to).
function diff(from, metas) {
  const to = new Map(metas.map((meta) => [meta.key, { meta, spec: specOf(meta) }]));
  const creates = [];
  const changes = [];
  const indexDrops = [];
  const indexCreates = [];
  to.forEach(({ meta, spec }, name) => {
    const before = from.tables[name];
    if (!before) {
      creates.push({ op: 'createTable', spec });
      return;
    }
    const fieldOf = (column) => meta.fields.find((field) => field.column === column);
    const beforeIndexes = new Map(before.indexes.map((index) => [index.name, index]));
    const afterIndexes = new Map(spec.indexes.map((index) => [index.name, index]));
    beforeIndexes.forEach((index, indexName) => {
      const after = afterIndexes.get(indexName);
      if (!after || !sameColumn(after, index)) indexDrops.push({ op: 'dropIndex', table: name, name: indexName });
    });
    Object.entries(spec.columns).forEach(([column, columnSpec]) => {
      if (!before.columns[column]) {
        const field = fieldOf(column);
        const value = defaultOf(field);
        if (!columnSpec.null && value === undefined && !columnSpec.primaryKey) {
          throw new ModelError(
            meta.name,
            `the new field ${field.name} needs null: true or a default (not a function) for the rows that exist`
          );
        }
        const op = { op: 'addColumn', table: name, column, spec: columnSpec };
        if (value !== undefined) op.default = value;
        changes.push(op);
      } else if (!sameColumn(before.columns[column], columnSpec)) {
        changes.push({ op: 'alterColumn', table: name, column, from: before.columns[column], to: columnSpec });
      }
    });
    Object.keys(before.columns).forEach((column) => {
      if (!spec.columns[column]) changes.push({ op: 'dropColumn', table: name, column });
    });
    if ((before.fillfactor || null) !== (spec.fillfactor || null)) {
      changes.push({ op: 'setOptions', table: name, fillfactor: spec.fillfactor || null });
    }
    afterIndexes.forEach((index, indexName) => {
      const previous = beforeIndexes.get(indexName);
      if (!previous || !sameColumn(previous, index)) indexCreates.push({ op: 'createIndex', table: name, index });
    });
  });
  // Tables of no model are dropped last, those pointed to after those that point to them.
  const drops = Object.keys(from.tables)
    .filter((name) => !to.has(name))
    .map((name) => ({ op: 'dropTable', table: name }))
    .reverse();
  return [...creates, ...indexDrops, ...changes, ...indexCreates, ...drops];
}

// The migration files of a folder, in order: { name, operations }. ES modules (export const operations) or CommonJS
// (module.exports = { operations }); a file changed since it was read is read again (the query of its address).
async function loadMigrations(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((file) => FILE.test(file))
    .sort();
  const loaded = [];
  for (const file of files) {
    const full = path.resolve(dir, file);
    delete require.cache[full];
    const { mtimeMs } = fs.statSync(full);
    const module = await import(`${pathToFileURL(full).href}?mtime=${mtimeMs}`);
    const operations = module.operations ?? (module.default && module.default.operations);
    if (!Array.isArray(operations)) throw new Error(`The migration ${file} has no operations`);
    loaded.push({ name: file.slice(0, -3), operations });
  }
  return loaded;
}

// Whether the files of a folder are ES modules: the type of the nearest package.json.
function isModuleFolder(dir) {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    const pkg = path.join(current, 'package.json');
    if (fs.existsSync(pkg)) return JSON.parse(fs.readFileSync(pkg, 'utf8')).type === 'module';
    if (path.dirname(current) === current) return false;
  }
}

// Migrations kept elsewhere than files ({ name, operations }), checked.
function checkedExtra(extra) {
  if (!Array.isArray(extra)) throw new TypeError('extra: a list of migrations ({ name, operations })');
  for (const migration of extra) {
    if (!migration || typeof migration.name !== 'string' || !Array.isArray(migration.operations)) {
      throw new TypeError('extra: each migration is { name, operations }');
    }
  }
  return extra;
}

function stateOf(migrations) {
  return migrations.reduce((state, migration) => migration.operations.reduce(applyOperation, state), { tables: {} });
}

// The text of a migration: an ES module, or CommonJS where the folder's package is.
function render(operations, date, esm = true) {
  const header = [
    `// A migration of xufa, made by makeMigrations() on ${date.toISOString()}. Its operations can be edited, and`,
    '// written by hand: renameColumn, renameTable, sql and run (data migrations, with a function of the database).',
  ];
  const list = JSON.stringify(operations, null, 2);
  if (esm) return `${header.join('\n')}\nexport const operations = ${list};\n`;
  return `${header.join('\n')}\nmodule.exports = {\n  operations: ${list.replace(/\n/g, '\n  ')},\n};\n`;
}

// The metas of some models (an app's), with the tables of their many-to-many, in the order of the database.
function metasOf(database, models) {
  const wanted = new Set();
  for (const model of models) {
    wanted.add(model.meta);
    for (const field of model.meta.manyToMany || []) if (field.through) wanted.add(field.through.meta);
  }
  return database.sortedMetas().filter((meta) => wanted.has(meta));
}

// The name a migration is recorded with: an app's has its label (catalog.0001_initial), so apps can have the same
// numbers.
const recordedName = (label, name) => (label ? `${label}.${name}` : name);

// Writes the migration from the files of `dir` to the models: { name, file, operations }, or null when there is none.
// models: those of an app (Django's makemigrations <app>): only their tables, in its folder. before: operations that
// come first (renameTable, renameColumn: what the diff would see as a table or column dropped and another added),
// applied before the rest is found. write: false finds it without writing it (and gives its text). extra: migrations
// kept elsewhere ([{ name, operations }]: those of models kept in the database), after those of the folder.
async function makeMigrations(database, { dir, name, models, before = [], write = true, extra = [] } = {}) {
  if (!dir) throw new Error('makeMigrations needs the folder of the migrations (dir)');
  const migrations = [...(await loadMigrations(dir)), ...checkedExtra(extra)];
  const state = before.reduce(applyOperation, stateOf(migrations));
  const operations = [...before, ...diff(state, models ? metasOf(database, models) : database.sortedMetas())];
  if (operations.length === 0) return null;
  const number = String(
    migrations.length ? Number(FILE.exec(`${migrations[migrations.length - 1].name}.js`)[1]) + 1 : 1
  ).padStart(4, '0');
  const label = (name || (migrations.length ? 'auto' : 'initial')).replace(/[^\w-]+/g, '_');
  const fileName = `${number}_${label}`;
  const file = path.join(dir, `${fileName}.js`);
  const text = render(operations, new Date(), isModuleFolder(dir));
  if (!write) return { name: fileName, file, operations, text };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
  return { name: fileName, file, operations };
}

// Writes a migration of operations given as a file of `dir` (name: 0003_books), in the module format of the folder's
// package: its file. Migrations kept elsewhere (in the database) become files so.
function writeMigration(dir, name, operations) {
  if (!FILE.test(`${name}.js`))
    throw new Error(`A migration's name is its number and a label (0003_books), not ${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, render(operations, new Date(), isModuleFolder(dir)));
  return file;
}

// The migrations of `dir` with whether each is applied (label: of an app).
async function showMigrations(database, { dir, label, extra = [] } = {}) {
  const applied = new Set(await database.backend.appliedMigrations());
  return [...(await loadMigrations(dir)), ...checkedExtra(extra)].map((migration) => ({
    name: migration.name,
    applied: applied.has(recordedName(label, migration.name)),
  }));
}

// Applies the migrations of `dir` not applied yet (up to `to`, a name, when given): the names applied. label: of an
// app (its migrations are recorded as label.name); the apps are migrated one after the other, in their order.
async function migrate(database, { dir, to, label, extra = [] } = {}) {
  if (!dir) throw new Error('migrate needs the folder of the migrations (dir)');
  const { backend } = database;
  const migrations = [...(await loadMigrations(dir)), ...checkedExtra(extra)];
  const applied = new Set(await backend.appliedMigrations());
  const done = [];
  let state = { tables: {} };
  for (let i = 0; i < migrations.length; i += 1) {
    const migration = migrations[i];
    if (applied.has(recordedName(label, migration.name))) {
      state = migration.operations.reduce(applyOperation, state);
    } else {
      await backend.migrationTransaction(async () => {
        for (let j = 0; j < migration.operations.length; j += 1) {
          const op = migration.operations[j];
          const after = applyOperation(state, op);
          if (op.op === 'run') await op.fn(database);
          else await backend.migrationOperation(op, state, after);
          state = after;
        }
        await backend.recordMigration(recordedName(label, migration.name));
      });
      done.push(migration.name);
    }
    if (to && migration.name === to) break;
  }
  return done;
}

export { makeMigrations, migrate, showMigrations, diff, applyOperation, loadMigrations, stateOf, writeMigration };
