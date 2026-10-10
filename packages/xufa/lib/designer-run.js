// The process of the designer of the admin (lib/designer.js): it loads the project with a draft of the models.yaml of
// some apps (in a process of its own: the models of the app that runs are left as they are) and finds the migration
// of each app, or writes it (publish). Run as: node designer-run.js <root> <request.json>; it prints one line of JSON:
// { ok, apps: [{ app, migration: { name, file, operations } | null }] }, or { ok: false, error }.
//
// A request: { mode: 'preview' | 'publish', apps: { label: spec }, renames: { label: { models: { Old: 'New' },
// fields: { Model: { old: 'new' } } } }, name }; with the models kept in the database, specs (the models of every
// app run now), stored (their migrations, by app) and current (the models the renames are from). Renames come first in the migration (renameTable, renameColumn), so
// a model or field renamed keeps its rows instead of being dropped and made again.
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from './project.js';
import { databaseWith } from './apps.js';
import * as configModule from '@xufa/config';
import * as ormModule from '@xufa/orm';

const RELATIONS = new Set(['foreignKey']);

// The column of a field of a spec: its option column, else its name (a foreign key: name + Id, or its attname).
function columnOf(name, field) {
  const spec = typeof field === 'string' ? { type: field } : field || {};
  if (spec.column) return spec.column;
  if (RELATIONS.has(spec.type)) return spec.attname || `${name}Id`;
  return name;
}

// The table of a model of the app's spec (that of the app, catalog_book, unless the model gives one).
function tableOf(item, name, spec) {
  const options = Object.fromEntries(Object.entries(spec || {}).filter(([key]) => key !== 'fields'));
  if (item.tables) return item.tableOf({ name, options });
  const { modelsFromSpec } = ormModule;
  return modelsFromSpec({ [name]: { ...options, fields: {} } })[0].meta.table;
}

// The operations of the renames of an app: tables first, then columns (in the tables of their new names).
function renamesOf(item, renames, now, spec) {
  if (!renames) return [];
  const operations = [];
  for (const [from, to] of Object.entries(renames.models || {})) {
    if (!now[from] || !spec[to] || from === to) continue;
    const before = tableOf(item, from, now[from]);
    const after = tableOf(item, to, spec[to]);
    if (before !== after) operations.push({ op: 'renameTable', from: before, to: after });
  }
  const formerName = (model) => Object.entries(renames.models || {}).find(([, to]) => to === model)?.[0] || model;
  for (const [model, fields] of Object.entries(renames.fields || {})) {
    const former = now[formerName(model)];
    if (!former || !spec[model]) continue;
    const table = tableOf(item, model, spec[model]);
    for (const [from, to] of Object.entries(fields)) {
      const before = former.fields && former.fields[from];
      const after = spec[model].fields && spec[model].fields[to];
      if (!before || !after || from === to) continue;
      const fromColumn = columnOf(from, before);
      const toColumn = columnOf(to, after);
      if (fromColumn !== toColumn) operations.push({ op: 'renameColumn', table, from: fromColumn, to: toColumn });
    }
  }
  return operations;
}

async function main() {
  const [root, file] = process.argv.slice(2);
  const request = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { mode = 'preview', apps = {}, renames = {}, name, specs = {}, stored = {}, current } = request;
  const project = await loadProject(root, { modelSpecs: { ...specs, ...apps } });
  for (const item of project.APPS.list) if (stored[item.label]) item.stored = stored[item.label];
  // A database in memory: the models registered (and checked), the migrations found from the files of each app.
  const db = project.database('memory:');
  const { readConfigFile } = configModule;
  const results = [];
  for (const label of Object.keys(apps)) {
    const item = project.APPS.get(label);
    const now = current
      ? current[label] || {}
      : fs.existsSync(item.design.file)
        ? readConfigFile(item.design.file) || {}
        : {};
    const before = renamesOf(item, renames[label], now, apps[label] || {});
    const dir = item.migrations || path.join(item.dir, 'migrations');
    // (The models of tenants are not in the project's database: found in one of their own.)
    const made = await databaseWith(db, item.models).makeMigrations({
      dir,
      name,
      models: item.models,
      before,
      write: mode === 'publish',
      extra: item.stored,
    });
    results.push({
      app: label,
      migration: made ? { name: made.name, file: path.relative(root, made.file), operations: made.operations } : null,
    });
  }
  return { ok: true, apps: results };
}

main().then(
  (result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  },
  (err) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: err.message })}\n`);
    process.exit(0);
  }
);
