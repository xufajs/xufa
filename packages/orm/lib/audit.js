// Audit log: every change of the objects of a database, kept in the database itself (its table xufa_audit), with what
// changed (the values before and after, field by field and inside json fields), who changed it and in what context.
// With Tenants, each tenant has its own (its database's): the option of the database of the tenant.
//
//   const db = new Database({ backend: 'postgres', ..., audit: { redact: ['passwordHash'], retain: '365d' } });
//   await db.audit.with({ actor: user.id, reason: 'support ticket 42' }, () => order.save());
//   await db.audit.log('export', { rows: 1200 });                 // events of your own
//   const entries = await db.audit.history(order);                // what happened to an object, oldest first
//
// The writes of the backend are what is audited: save(), create(), bulkCreate(), update() and delete() of QuerySets,
// and what deleting does to related objects (cascades, setNull). Each write and its entries are made in one transaction
// (where the backend has transactions); updates read the rows before (locked in PostgreSQL), and after unless they
// only assign texts, integers, booleans, uuids and datetimes (what every backend gives back as it was given).
//
// Options (`audit: true`, or):
// - models: the models audited (classes or names; all of them by default), exclude: those that are not. A model with
//   the option audit: false is not audited either.
// - redact: names of fields whose values are not kept (only that they changed), in any model. Encrypted fields and
//   fields with the option audit: 'redact' are redacted too; those with audit: false are left out.
// - retain: how long entries are kept (seconds, or text as '365d'): db.expire() (and startExpiry()) deletes older ones.
//
// An entry: at, action (create, update, delete, upsert, or an event of log()), model, key (the primary key as text: the
// JSON of the values of a composite one), changes ([{ field, path, from, to }]: `from` missing when added, `to` when
// removed, `path` inside json fields, `redacted: true` without values), data (of log()), actor and context (of
// with(), or of the requests of the plugin of the ORM).
const { AsyncLocalStorage } = require('node:async_hooks');
const { Model } = require('./model');
const fields = require('./fields');
const { seconds } = require('./duration');

class AuditEntry extends Model {
  static fields = {
    at: fields.datetime({ index: true }),
    action: fields.string({ maxLength: 100 }),
    model: fields.string({ maxLength: 200, null: true, index: true }),
    key: fields.string({ maxLength: 500, null: true }),
    changes: fields.json({ null: true }),
    data: fields.json({ null: true }),
    actor: fields.string({ maxLength: 200, null: true }),
    context: fields.json({ null: true }),
  };

  static options = { table: 'xufa_audit', ordering: ['at', 'id'] };
}

// Who acts, and the context of what they do, for the code run in with() (and the requests of the plugin): { actor,
// ...context }; actor and context can be functions, called when an entry is made (the user of a request is known then).
const scope = new AsyncLocalStorage();
// The entries of the writes of a group (Audit.group()), written together at its end.
const grouping = new AsyncLocalStorage();

// The entries of a group, those of the same object and action merged in the first of them (its time, actor and
// context): the first `from` and the last `to` of each field (and path), without the fields back to where they were.
function mergeEntries(entries) {
  const merged = [];
  const byObject = new Map();
  for (const entry of entries) {
    const id = entry.key === null ? null : `${entry.action}\u0000${entry.model}\u0000${entry.key}`;
    const first = id === null ? undefined : byObject.get(id);
    if (!first || !first.changes || !entry.changes) {
      const copy = { ...entry, changes: entry.changes ? entry.changes.map((change) => ({ ...change })) : null };
      if (id !== null && !first) byObject.set(id, copy);
      merged.push(copy);
      continue;
    }
    for (const change of entry.changes) {
      const same = first.changes.find(
        (old) => old.field === change.field && JSON.stringify(old.path) === JSON.stringify(change.path)
      );
      if (!same) first.changes.push({ ...change });
      else if (change.redacted) same.redacted = true;
      else if ('to' in change) same.to = change.to;
      else delete same.to;
    }
  }
  for (const entry of merged) {
    if (entry.changes) entry.changes = entry.changes.filter((change) => change.redacted || !sameChange(change));
  }
  return merged.filter((entry) => !entry.changes || entry.changes.length > 0 || entry.action !== 'update');
}

const sameChange = (change) =>
  'from' in change && 'to' in change && JSON.stringify(change.from) === JSON.stringify(change.to);

// The values of entries as JSON: dates as ISO text, bytes as base64, bigints as text.
function plain(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    if (typeof value.toJSON === 'function') return plain(value.toJSON());
    const out = {};
    for (const key of Object.keys(value)) if (value[key] !== undefined) out[key] = plain(value[key]);
    return out;
  }
  return value;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Equal plain values (the keys of objects in any order: PostgreSQL's jsonb has an order of its own).
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
}

// A primary key as the text of entries: the JSON of the values of a composite one.
const keyText = (value) => (Array.isArray(value) ? JSON.stringify(plain(value)) : String(plain(value)));

// The changes inside a json value (plain already): the keys added, removed and changed, by path.
function jsonChanges(field, from, to, path, out) {
  if (isObject(from) && isObject(to)) {
    for (const key of Object.keys(from)) {
      if (!(key in to)) out.push({ field, path: [...path, key], from: from[key] });
      else jsonChanges(field, from[key], to[key], [...path, key], out);
    }
    for (const key of Object.keys(to)) if (!(key in from)) out.push({ field, path: [...path, key], to: to[key] });
    return out;
  }
  if (!same(from, to)) out.push(path.length ? { field, path, from, to } : { field, from, to });
  return out;
}

class Audit {
  constructor(db, options) {
    const { models, exclude, redact = [], retain } = options === true ? {} : options;
    const names = (list) => (list ? new Set([].concat(list).map((m) => (typeof m === 'string' ? m : m.name))) : null);
    this.db = db;
    this.models = names(models);
    this.exclude = names(exclude) || new Set();
    this.redact = new Set(redact);
    this.retain = retain === undefined ? null : seconds(retain, 'retain');
    // The fields of each model as an entry writes them: [field, how] with how 'value' or 'redact'.
    this.plans = new WeakMap();
    install(this, db.backend);
  }

  audits(meta) {
    if (!meta || meta === AuditEntry.meta || meta.options.audit === false) return false;
    if (this.exclude.has(meta.name)) return false;
    return this.models ? this.models.has(meta.name) : true;
  }

  plan(meta) {
    let plan = this.plans.get(meta);
    if (!plan) {
      plan = [];
      for (const field of meta.fields) {
        const option = field.options.audit;
        // The primary key is the key of the entry.
        if (option === false || field.primaryKey) continue;
        const redacted = option === 'redact' || field.type === 'encrypted' || this.redact.has(field.name);
        plan.push([field, redacted ? 'redact' : 'value']);
      }
      this.plans.set(meta, plan);
    }
    return plan;
  }

  // The changes between two rows (by attname; null: the object did not exist).
  changes(meta, before, after) {
    const out = [];
    for (const [field, how] of this.plan(meta)) {
      const { attname, name } = field;
      const from = before ? plain(before[attname]) : null;
      const to = after ? plain(after[attname]) : null;
      if (before && after && same(from, to)) continue;
      if (!before && to === null) continue;
      if (!after && from === null) continue;
      if (how === 'redact') out.push({ field: name, redacted: true });
      else if (before && after && field.type === 'json') jsonChanges(name, from, to, [], out);
      else if (!before) out.push({ field: name, to });
      else if (!after) out.push({ field: name, from });
      else out.push({ field: name, from, to });
    }
    return out;
  }

  keyOf(meta, row) {
    if (!meta.pk) return null;
    if (meta.pk.composite) return keyText(meta.pkFields.map((field) => row[field.attname]));
    const value = row[meta.pk.attname];
    return value === null || value === undefined ? null : keyText(value);
  }

  // An entry, with the actor and the context of the code that runs.
  entry(action, meta, key, changes, data) {
    const current = scope.getStore() || {};
    const { actor, context, ...rest } = current;
    const who = typeof actor === 'function' ? actor() : actor;
    let more = typeof context === 'function' ? context() : context;
    if (Object.keys(rest).length) more = { ...rest, ...more };
    return {
      at: new Date(),
      action,
      model: meta ? meta.name : null,
      key,
      changes: changes || null,
      data: data === undefined ? null : plain(data),
      actor: who === null || who === undefined ? null : String(who),
      context: more && Object.keys(more).length ? plain(more) : null,
    };
  }

  async write(backend, entries) {
    if (entries.length === 0) return;
    // In a group (see group()): kept, to be merged and written at its end.
    const collected = grouping.getStore();
    if (collected && collected.audit === this) {
      collected.entries.push(...entries);
      return;
    }
    // Through the backend as any write (its faults too): entries are not audited.
    await backend.insert(AuditEntry.meta, entries);
  }

  // Runs fn (several writes that are one change, as an update() and the stored computed fields it makes compute
  // again): the entries of the same object and action are one, with the first value before and the last after of each
  // field (a field back to what it was is no change), written when fn ends.
  async group(fn) {
    const collected = { audit: this, entries: [] };
    const result = await grouping.run(collected, fn);
    await this.write(this.db.backend, mergeEntries(collected.entries));
    return result;
  }

  // An event of your own: log('export', { rows: 1200 }), or of an object: log('viewed', null, { object: order }).
  async log(action, data, { object } = {}) {
    if (typeof action !== 'string' || action === '') throw new TypeError('The action of an audit entry is a text');
    const meta = object ? object.constructor.meta : null;
    const key = object ? this.keyOf(meta, object) : null;
    const row = this.entry(action, meta, key, null, data);
    await this.write(this.db.backend, [row]);
  }

  // Runs fn with an actor and a context (merged with those of the code that runs it): its changes are theirs.
  with(context, fn) {
    return scope.run({ ...scope.getStore(), ...context }, fn);
  }

  // The entries, oldest first: filter by model (a class or a name), key, action, actor, since and until (dates).
  entries({ model, key, action, actor, since, until } = {}) {
    const conditions = {};
    if (model) conditions.model = typeof model === 'string' ? model : model.name;
    if (key !== undefined) conditions.key = key === null ? null : keyText(key);
    if (action) conditions.action = action;
    if (actor !== undefined) conditions.actor = actor === null ? null : String(actor);
    if (since) conditions.at__gte = since;
    if (until) conditions.at__lt = until;
    return AuditEntry.objects.using(this.db).filter(conditions).orderBy('at', 'id');
  }

  // The entries of an object, oldest first.
  history(object) {
    const { meta } = object.constructor;
    return AuditEntry.objects
      .using(this.db)
      .filter({ model: meta.name, key: this.keyOf(meta, object) })
      .orderBy('at', 'id');
  }

  // The entries of this database over HTTP, read only (see auditResource()).
  resource(options = {}) {
    return auditResource({ ...options, database: this.db });
  }

  // Deletes the entries older than `retain` (db.expire() calls it). Their number.
  expire(now = new Date()) {
    if (this.retain === null) return 0;
    const cutoff = new Date(now.getTime() - this.retain * 1000);
    return AuditEntry.objects.using(this.db).filter({ at__lt: cutoff }).delete();
  }
}

// Wraps the writes of a backend (once): those of audited models make entries.
const LOCK = { mode: 'update', skipLocked: false, noWait: false, of: null };
const plainAssignment = (value) =>
  value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value) || isPlainData(value);
// Types every backend stores as they are given (once cleaned by the field), and gives back the same: an update
// assigning only values of these needs no second read of its rows. Datetimes too (each backend keeps their
// milliseconds: autoNow saves stay cheap). Dates, decimals, floats, json and the rest are read again.
const EXACT_TYPES = new Set(['string', 'text', 'integer', 'boolean', 'uuid']);
const exactAssignments = (assignments) =>
  assignments.every(({ field, value }) => {
    if (value === null) return true;
    if (field.dbType === 'datetime') return value instanceof Date;
    return EXACT_TYPES.has(field.dbType) && typeof value !== 'object' && typeof value !== 'bigint';
  });

function isPlainData(value) {
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}

// The rows of a write as they are, for its entries. Encrypted fields are redacted (their values are not kept): when
// one cannot be decrypted (a key no longer in the keyring, a value written from outside), the rows are read without
// them, and the write is made all the same (its entry without them).
async function readRows(backend, meta, query) {
  try {
    return { rows: await backend.select(query), complete: true };
  } catch (err) {
    if (err.code !== 'XUFA_ORM_ERR_ENCRYPTION') throw err;
    const only = meta.fields.filter((field) => field.type !== 'encrypted');
    return { rows: await backend.select({ ...query, only }), complete: false };
  }
}

const withoutEncrypted = (meta, rows) =>
  rows.map((row) => {
    const out = { ...row };
    for (const field of meta.fields) if (field.type === 'encrypted') delete out[field.attname];
    return out;
  });

function install(audit, backend) {
  if (backend.audit) throw new TypeError('A backend has one audit (one database)');
  backend.audit = audit;
  const atomic = (fn) => (backend.inTransaction ? fn() : backend.transaction(fn));
  const wrap = (operation, audited) => {
    const original = backend[operation];
    const wrapped = function withAudit(target, ...args) {
      const meta = target && target.meta ? target.meta : target;
      if (!audit.audits(meta)) return original.call(this, target, ...args);
      return atomic(() => audited.call(this, original, meta, target, ...args));
    };
    wrapped.original = original;
    backend[operation] = wrapped;
  };

  wrap('insert', async function insert(original, meta, target, rows, options) {
    const keys = await original.call(this, target, rows, options);
    const action = options && options.conflict ? 'upsert' : 'create';
    const entries = rows.map((row, i) => {
      let values = row;
      if (meta.pk && !meta.pk.composite && (row[meta.pk.attname] === undefined || row[meta.pk.attname] === null)) {
        values = { ...row, [meta.pk.attname]: keys ? keys[i] : null };
      }
      return audit.entry(action, meta, audit.keyOf(meta, values), audit.changes(meta, null, values));
    });
    await audit.write(this, entries);
    return keys;
  });

  wrap('update', async function update(original, meta, query, assignments) {
    const read = await readRows(this, meta, { ...query, lock: query.lock || LOCK });
    let before = read.rows;
    const count = await original.call(this, query, assignments);
    if (before.length === 0) return count;
    let after;
    if (read.complete && exactAssignments(assignments)) {
      // The values assigned are those the database has now.
      after = before.map((row) => {
        const next = { ...row };
        for (const { field, value } of assignments) next[field.attname] = value;
        return next;
      });
    } else if (meta.pk) {
      // The rows as the database has them now (its decimals, dates and json; the values of F() and Raw()).
      const keys = before.map((row) =>
        meta.pk.composite ? meta.pkFields.map((f) => row[f.attname]) : row[meta.pk.attname]
      );
      const again = await readRows(this, meta, meta.model.objects.filter({ pk__in: keys }).orderBy().toQuery());
      let { rows } = again;
      if (!read.complete || !again.complete) {
        before = withoutEncrypted(meta, before);
        rows = withoutEncrypted(meta, rows);
      }
      const byKey = new Map(rows.map((row) => [meta.pkValue(row), row]));
      after = before.map((row) => byKey.get(meta.pkValue(row)) || row);
    } else {
      // Without a primary key the rows cannot be read again: the values assigned (those of expressions unknown).
      after = before.map((row) => {
        const next = { ...row };
        for (const { field, value } of assignments) if (plainAssignment(value)) next[field.attname] = value;
        return next;
      });
    }
    const entries = [];
    for (let i = 0; i < before.length; i += 1) {
      const changes = audit.changes(meta, before[i], after[i]);
      if (changes.length) entries.push(audit.entry('update', meta, audit.keyOf(meta, after[i]), changes));
    }
    await audit.write(this, entries);
    return count;
  });

  wrap('delete', async function remove(original, meta, query) {
    const before = (await readRows(this, meta, { ...query, lock: query.lock || LOCK })).rows;
    const count = await original.call(this, query);
    const entries = before.map((row) =>
      audit.entry('delete', meta, audit.keyOf(meta, row), audit.changes(meta, row, null))
    );
    await audit.write(this, entries);
    return count;
  });
}

// The plugin of the ORM: the actor and context of each request.
function enterRequest(request, { actor, context }) {
  scope.enterWith({
    ...scope.getStore(),
    actor: actor ? () => actor(request) : undefined,
    context: context ? () => context(request) : undefined,
  });
}

// The entries over HTTP, read only: a resource of orm.resource() (GET / and GET /:id), newest first, filtered by
// model, key, action, actor and date (?at__gte=, ?at__lt=). The entries of `database` (db.audit.resource() gives
// its own), or of the database of each request: with tenants, those of its tenant (several databases audited without
// tenants: give the database). `auth` is required (an audit log tells what everyone changed): a rule of @xufa/auth, or false to
// leave it open. The other options are those of orm.resource().
//
//   app.register(orm.auditResource({ auth: 'admin' }), { prefix: '/audit' });
function auditResource(options = {}) {
  if (options.auth === undefined) {
    throw new TypeError(
      'auditResource() needs auth: a rule of @xufa/auth (who may read it), or false to leave it open'
    );
  }
  const { resource } = require('./resource'); // eslint-disable-line global-require
  const { database, ...rest } = options;
  return resource(AuditEntry, {
    actions: ['list', 'get'],
    queryset: () => (database ? AuditEntry.objects.using(database) : AuditEntry.objects).orderBy('-at', '-id'),
    filters: { model: ['exact'], key: ['exact'], action: ['exact', 'in'], actor: ['exact'], at: ['gte', 'lt'] },
    ordering: ['at'],
    openapi: { tag: 'Audit' },
    ...rest,
  });
}

module.exports = { Audit, AuditEntry, auditResource, enterRequest, plain };
