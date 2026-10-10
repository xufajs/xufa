// The designer of the models of a project, for the admin's data model page (its option designer), in development: the
// models of each app's models.yaml can be edited there. preview(draft) gives the migration a draft of them makes,
// and publish(draft) writes their models.yaml and that migration in the app; `xufa dev` starts the server again and
// the migration is applied. Models of models.js are code: they are drawn, and relations can point to them.
//
// A draft: { apps: { label: spec } (the whole models.yaml of each app changed), renames: { label: { models: { Old:
// 'New' }, fields: { Model: { old: 'new' } } } }, name (of the migration) }.
//
// Drafts are tried in a process of their own (lib/designer-run.js): models made and registered there leave those of
// the app that runs as they are.
//
// With store (designer: database), the models are versions in the project's database (lib/schema-store.js) instead
// of files: publish adds a version (the models of every app, and the migrations so far), migrates the project's
// database (those of tenants are migrated when they are opened), and every process starts again with it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUNNER = path.join(import.meta.dirname, 'designer-run.js');
const LABEL = /^[a-z][a-z0-9_]*$/;
const NAME = /^[\w-]{1,60}$/;

class DesignError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DesignError';
    this.statusCode = 400;
  }
}

// What an operation does to the data that is there: drops (lost), changes of type (may fail), or nothing. A risk:
// { level, kind, table, column?, from?, to?, text } (kind and its values for pages in other languages).
function riskOf(op) {
  if (op.op === 'dropTable') {
    return { level: 'danger', kind: 'dropTable', table: op.table, text: `drops the table ${op.table} and its rows` };
  }
  if (op.op === 'dropColumn') {
    const text = `drops the column ${op.table}.${op.column} and its values`;
    return { level: 'danger', kind: 'dropColumn', table: op.table, column: op.column, text };
  }
  if (op.op === 'alterColumn') {
    const from = op.from || {};
    const to = op.to || {};
    const where = { table: op.table, column: op.column };
    if (from.type !== to.type) {
      const text = `changes ${op.table}.${op.column} from ${from.type} to ${to.type}`;
      return { level: 'warning', kind: 'type', ...where, from: from.type, to: to.type, text };
    }
    if (from.null && !to.null) {
      const text = `makes ${op.table}.${op.column} required: rows without a value stop it`;
      return { level: 'warning', kind: 'required', ...where, text };
    }
  }
  return null;
}

// A value in YAML's flow style, on one line: { type: string, maxLength: 100 }, [title, author]; texts and keys
// quoted only when they must be (@xufa/yaml says).
function flowOf(value) {
  const yaml = require('@xufa/yaml'); // eslint-disable-line global-require
  if (Array.isArray(value)) return `[${value.map(flowOf).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => `${keyOf(key)}: ${flowOf(item)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  const text = yaml.dump(value, { flowLevel: 0, lineWidth: -1 }).trim();
  // (In a flow, a plain text cannot have , [ ] { }: quoted.)
  return typeof value === 'string' && /[,[\]{}]/.test(text) && !/^['"]/.test(text) ? JSON.stringify(value) : text;
}
const keyOf = (key) => (/^[A-Za-z_][\w]*$/.test(key) ? key : JSON.stringify(key));

// The text of models.yaml: models by name, each with its options and then its fields, a field on a line.
function yamlOf(label, spec) {
  const lines = [
    `# The models of ${label} as data (@xufa/orm's modelsFromSpec): written by the data model page of the admin, and`,
    '# yours to edit too (comments are not kept when the page writes it again).',
  ];
  for (const [name, model] of Object.entries(spec)) {
    lines.push(`${keyOf(name)}:`);
    const { fields = {}, ...options } = model || {};
    for (const [key, value] of Object.entries(options)) lines.push(`  ${keyOf(key)}: ${flowOf(value)}`);
    lines.push(Object.keys(fields).length ? '  fields:' : '  fields: {}');
    for (const [key, value] of Object.entries(fields)) lines.push(`    ${keyOf(key)}: ${flowOf(value)}`);
  }
  if (!Object.keys(spec).length) lines.push('{}');
  return `${lines.join('\n')}\n`;
}

function designerOf(project, { run, db = null, store = null } = {}) {
  const root = project.root;
  const designed = () => project.APPS.list.filter((item) => item.design);
  // What was published (by this process, or a newer version seen): its models run once the server starts again.
  let published = null;
  // The models and migrations the process runs, by app (a version kept in the database: those of it).
  const specs = () => Object.fromEntries(designed().map((item) => [item.label, item.design.spec]));
  const stored = () => Object.fromEntries(designed().map((item) => [item.label, item.stored || []]));

  // Checks a draft: apps of the project, specs as objects, a name for the migration.
  function check(draft) {
    if (!draft || typeof draft !== 'object' || !draft.apps || typeof draft.apps !== 'object') {
      throw new DesignError('A draft is { apps: { app: models }, renames, name }');
    }
    for (const [label, spec] of Object.entries(draft.apps)) {
      if (!LABEL.test(label) || !designed().some((item) => item.label === label)) {
        throw new DesignError(`There is no app ${label} in the project`);
      }
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        throw new DesignError(`The models of ${label} are models by name`);
      }
    }
    if (draft.name !== undefined && draft.name !== '' && !NAME.test(String(draft.name))) {
      throw new DesignError('The name of the migration is letters, digits, _ and - (60 at most)');
    }
    return {
      apps: draft.apps,
      renames: draft.renames && typeof draft.renames === 'object' ? draft.renames : {},
      ...(draft.name ? { name: String(draft.name) } : {}),
    };
  }

  // Runs a request in the process of the designer: its answer.
  const runIn =
    run ||
    ((request) =>
      new Promise((resolve, reject) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-design-'));
        const file = path.join(dir, 'request.json');
        fs.writeFileSync(file, JSON.stringify(request));
        const child = spawn(process.execPath, [RUNNER, root, file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => {
          out += chunk;
        });
        child.stderr.on('data', (chunk) => {
          err += chunk;
        });
        child.on('error', reject);
        child.on('close', () => {
          fs.rmSync(dir, { recursive: true, force: true });
          const line = out.trim().split('\n').pop();
          try {
            resolve(JSON.parse(line));
          } catch {
            reject(new Error(`The designer's process failed: ${(err || out).trim().slice(0, 500)}`));
          }
        });
      }));

  // The answer of a run: each app with its migration and what it risks; a draft that cannot be is a DesignError.
  async function tryDraft(mode, draft) {
    // (In the database, the process of the designer is given the models and migrations the files do not have.)
    const request = store
      ? { mode: 'preview', ...check(draft), specs: specs(), stored: stored(), current: specs() }
      : { mode, ...check(draft) };
    const answer = await runIn(request);
    if (!answer.ok) throw new DesignError(answer.error);
    return {
      apps: answer.apps.map((item) => ({
        ...item,
        // (In the database, a migration is no file.)
        migration: store && item.migration ? { ...item.migration, file: null } : item.migration,
        risks: item.migration ? item.migration.operations.map(riskOf).filter(Boolean) : [],
      })),
    };
  }

  // A version in the database: the models of every app (the draft's over those run), the migrations so far with the
  // new ones; the project's database migrated as xufa migrate does (the apps of tenants: in each tenant's database,
  // when it is opened).
  // { apps, version }.
  async function publishVersion(checked) {
    const result = await tryDraft('preview', checked);
    const apps = { ...specs(), ...checked.apps };
    const migrations = stored();
    for (const item of result.apps) {
      if (!item.migration) continue;
      const { name, operations } = item.migration;
      migrations[item.app] = [...(migrations[item.app] || []), { name, operations }];
    }
    const version = await store.add({ after: project.version, apps, migrations, note: checked.name }, async () => {
      for (const item of result.apps) {
        // (The apps of tenants: in each tenant's database, when it is opened.)
        if (!item.migration || (project.tenantApps || []).includes(item.app)) continue;
        const one = project.APPS.get(item.app);
        await db.migrate({ dir: one.migrations, label: one.label, extra: migrations[item.app] });
      }
    });
    published = { at: new Date().toISOString(), version };
    return { ...result, version };
  }

  return {
    // Where the models go: files, or database (with the version run).
    store: store ? 'database' : 'files',
    // The apps whose models can be edited: { app, file (null in the database), spec, models (their names) }.
    apps() {
      return designed().map((item) => ({
        app: item.label,
        file: store ? null : path.relative(root, item.design.file).split(path.sep).join('/'),
        spec: item.design.spec,
        models: item.design.models.map((model) => model.name),
      }));
    },
    // The last publish ({ at, files } or { at, version }), or null: its models run once the server starts again.
    pending() {
      return published;
    },
    // A newer version seen in the database (another process published it).
    notice(version) {
      if (!published || published.version !== version) published = { at: new Date().toISOString(), version };
    },
    // Whether a model is one of a models.yaml (else code).
    editable(model) {
      return designed().some((item) => item.design.models.includes(model));
    },
    preview(draft) {
      return tryDraft('preview', draft);
    },
    // Writes the migration of each app (the process of the designer), then its models.yaml: { apps, files }.
    async publish(draft) {
      const checked = check(draft);
      if (store) return publishVersion(checked);
      const result = await tryDraft('publish', checked);
      const files = [];
      for (const [label, spec] of Object.entries(checked.apps)) {
        const item = designed().find((one) => one.label === label);
        fs.mkdirSync(path.dirname(item.design.file), { recursive: true });
        fs.writeFileSync(item.design.file, yamlOf(label, spec));
        files.push(path.relative(root, item.design.file).split(path.sep).join('/'));
      }
      for (const item of result.apps) if (item.migration) files.push(item.migration.file.split(path.sep).join('/'));
      published = { at: new Date().toISOString(), files };
      return { ...result, files };
    },
  };
}

export { designerOf, DesignError, yamlOf, riskOf };
