// FsBackend: the objects in files, for data that lives with the application (content, settings, small catalogs) or
// where there is no database. Queries run in memory with the semantics of the memory backend (every lookup, order,
// aggregate and transaction); what changes is written to files after each operation, or when a transaction commits,
// and read back when the database connects.
//
// `dir`: the folder of the database. `layout`: 'collection' (a file for each collection: <dir>/<table>.json, the
// default) or 'files' (a folder for each collection, a file for each object: <dir>/<table>/<key>.json, which writes
// only the objects that changed). Files are written whole to a temporary file and renamed, so a file is never left
// half written. Values JSON has not (dates, bytes, bigints, infinite numbers) are kept with their type, and the values of
// encrypted fields encrypted.
//
// One process writes a folder: a lock file (<dir>/.xufa.lock) refuses another process while it is alive
// (`lock: false` leaves it out).
//
// `watch: true` (or { delay } in milliseconds, 50 by default) reads again the files changed from outside (by hand, by
// a deploy, by git) while the database is open: the collections, or the objects in the layout files, whose files
// changed (out of transactions: what changes while one is open is read when it ends). `onChange(tables)` is called
// after, and `onError(err)` when a file cannot be read (as JSON half saved by an editor: it is read again when it
// changes again). The cached objects of the models of those tables are dropped. A file the database writes before
// its change from outside is read is merged by object: the objects changed from outside only keep that change, and
// one changed on both sides keeps what the database has (onError gets an error with code XUFA_ORM_ERR_FS_CONFLICT,
// its table and the keys).
//
// Only the objects that changed are serialized again (their JSON is kept while they are the same), and in the layout
// files the files of a table are written several at a time.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { MemoryBackend } = require('./memory');
const { BackendError } = require('../errors');

const TAG = '$xufa';
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

// A value as JSON can keep it, its type tagged.
function encodeValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { [TAG]: 'date', v: Number.isNaN(value.getTime()) ? null : value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { [TAG]: 'bytes', v: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return { [TAG]: 'bigint', v: String(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [TAG]: 'number', v: String(value) };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = encodeValue(value[key]);
    });
    // An object of the data with the key of the tags is kept apart, so it is not read as a tag.
    return TAG in value ? { [TAG]: 'object', v: out } : out;
  }
  return value;
}

function decodeValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  if (typeof value[TAG] === 'string') {
    const { v } = value;
    switch (value[TAG]) {
      case 'date':
        return v === null ? new Date(NaN) : new Date(v);
      case 'bytes':
        return Buffer.from(v, 'base64');
      case 'bigint':
        return BigInt(v);
      case 'number':
        return Number(v);
      case 'object': {
        const out = {};
        Object.keys(v).forEach((key) => {
          out[key] = decodeValue(v[key]);
        });
        return out;
      }
      default:
    }
  }
  const out = {};
  Object.keys(value).forEach((key) => {
    out[key] = decodeValue(value[key]);
  });
  return out;
}

// A name as the name of a file: its characters that are not safe escaped, and the names Windows keeps for devices
// (con, nul...) too.
function fileName(name) {
  const safe = encodeURIComponent(String(name)).replace(/\*/g, '%2A');
  return RESERVED.test(safe) ? `%${safe.charCodeAt(0).toString(16).toUpperCase()}${safe.slice(1)}` : safe;
}

// The file of an object: its key, or (for long keys) a hash of it; the key is kept in the file.
function rowFileName(key) {
  const name = fileName(JSON.stringify(key));
  if (name.length <= 150) return `${name}.json`;
  return `~${crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex')}.json`;
}

// A file written whole: to a temporary file, then renamed over the old one (again, a moment later, while Windows has
// the old one open to read).
async function writeFile(file, text) {
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, text);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fsp.rename(temp, file);
      return;
    } catch (err) {
      if (attempt >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((resolve) => {
        setTimeout(resolve, 10 * (attempt + 1));
      });
    }
  }
}

// The text of a file (null: there is none).
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Runs tasks, up to `limit` at a time (the files of the objects of a table, each written in its file).
async function inParallel(tasks, limit) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

class FsBackend extends MemoryBackend {
  constructor(options = {}) {
    super(options);
    if (!options.dir) throw new BackendError('The fs backend needs a dir (the folder of its files)');
    this.dir = path.resolve(options.dir);
    this.layout = options.layout || 'collection';
    if (!['collection', 'files'].includes(this.layout)) {
      throw new BackendError(`The layout of the fs backend is collection or files (not ${this.layout})`);
    }
    this.pretty = Boolean(options.pretty);
    this.lockFile = options.lock === false ? null : path.join(this.dir, '.xufa.lock');
    // The tables changed and not written yet; what was written of each (to write only what changed).
    this.dirty = new Set();
    this.written = new Map();
    this.writing = Promise.resolve();
    this.connected = false;
    this.watchOptions = options.watch ? { delay: 50, ...(options.watch === true ? {} : options.watch) } : null;
    this.onChange = options.onChange || null;
    this.onError = options.onError || null;
    // The changes seen in the folder and not read yet: by table, the files changed (or 'all').
    this.outside = new Map();
    this.rowTexts = new WeakMap();
    this.watcher = null;
    this.watchTimer = null;
  }

  get name() {
    return 'fs';
  }

  // Encrypted fields are kept encrypted, in the files and in memory (as databases keep them).
  stored(field, value) {
    if (field.encrypted) return value === null || value === undefined ? null : field.seal(value);
    return super.stored(field, value);
  }

  given(field, value) {
    if (field.encrypted) return value === null || value === undefined ? null : field.open(value);
    return super.given(field, value);
  }

  async connect() {
    if (this.connected) return;
    fs.mkdirSync(this.dir, { recursive: true });
    this.takeLock();
    this.load();
    this.connected = true;
    if (this.watchOptions) this.watch();
  }

  async close() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    clearTimeout(this.watchTimer);
    this.outside.clear();
    await this.writing;
    if (this.lockFile && this.connected) {
      try {
        const lock = readJson(this.lockFile);
        if (lock.pid === process.pid && lock.host === os.hostname()) fs.unlinkSync(this.lockFile);
      } catch {
        // gone already
      }
    }
    this.connected = false;
  }

  // The lock of the folder: refused when another process alive on this host has it.
  takeLock() {
    if (!this.lockFile) return;
    try {
      const lock = readJson(this.lockFile);
      if (lock.pid !== process.pid && lock.host === os.hostname() && alive(lock.pid)) {
        throw new BackendError(`${this.dir} is used by the process ${lock.pid} (fs backend)`);
      }
    } catch (err) {
      if (err instanceof BackendError) throw err;
    }
    fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid, host: os.hostname() }));
  }

  // The tables in the folder, as they were written.
  load() {
    fs.readdirSync(this.dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === '_migrations.json') {
        this.migrations = new Set(readJson(path.join(this.dir, entry.name)));
        return;
      }
      const name = tableOf(entry.name, entry.isDirectory());
      if (name !== null) this.readTable(name);
    });
  }

  // A table as its files are now (no file: the table is not there). Whether it changed.
  readTable(name) {
    if (this.layout === 'collection') {
      const file = path.join(this.dir, `${fileName(name)}.json`);
      if (!fs.existsSync(file)) return this.removeTable(name);
      const text = fs.readFileSync(file, 'utf8');
      const before = this.written.get(name);
      if (before && before.text === text && this.tables.has(name)) return false;
      const data = JSON.parse(text);
      this.tables.set(name, this.restore(data.sequence, data.rows));
      this.written.set(name, { text });
      return true;
    }
    const folder = path.join(this.dir, fileName(name));
    if (!fs.existsSync(folder)) return this.removeTable(name);
    const tableFile = path.join(folder, '_table.json');
    const sequence = fs.existsSync(tableFile) ? readJson(tableFile).sequence : 0;
    const rows = [];
    const texts = new Map();
    fs.readdirSync(folder).forEach((file) => {
      if (!isRowFile(file)) return;
      const text = fs.readFileSync(path.join(folder, file), 'utf8');
      const { key, row } = JSON.parse(text);
      rows.push([key, row]);
      texts.set(JSON.stringify(key), { file, text, json: JSON.stringify(row) });
    });
    const before = this.written.get(name);
    const same =
      before &&
      this.tables.has(name) &&
      before.sequence === sequence &&
      before.rows.size === texts.size &&
      [...texts].every(([id, item]) => before.rows.has(id) && before.rows.get(id).text === item.text);
    if (same) return false;
    this.tables.set(name, this.restore(sequence, rows));
    this.written.set(name, { rows: texts, sequence });
    return true;
  }

  removeTable(name) {
    if (!this.tables.has(name) && !this.written.has(name)) return false;
    this.tables.delete(name);
    this.written.delete(name);
    return true;
  }

  // Objects of a table in the layout files as their files are now: changed, added or removed. Whether any changed.
  readRows(name, files) {
    const folder = path.join(this.dir, fileName(name));
    const table = this.tables.get(name);
    const written = this.written.get(name);
    if (!table || !written || !fs.existsSync(folder)) return this.readTable(name);
    let changed = false;
    files.forEach((file) => {
      const full = path.join(folder, file);
      if (file === '_table.json') {
        const sequence = fs.existsSync(full) ? readJson(full).sequence || 0 : 0;
        written.sequence = sequence;
        if (sequence > table.sequence) {
          table.sequence = sequence;
          changed = true;
        }
        return;
      }
      const ids = [...written.rows].filter(([, item]) => item.file === file).map(([id]) => id);
      const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
      if (text !== null && ids.length === 1 && written.rows.get(ids[0]).text === text) return;
      const record = text === null ? null : JSON.parse(text);
      // What the file had before goes, and what it has now comes.
      ids.forEach((id) => {
        written.rows.delete(id);
        table.rows.delete(decodeValue(JSON.parse(id)));
      });
      if (ids.length) changed = true;
      if (!record) return;
      const id = JSON.stringify(record.key);
      const old = written.rows.get(id);
      // Another file had the object of this key: this one is its file now.
      if (old && old.file !== file) fs.rmSync(path.join(folder, old.file), { force: true });
      const restored = this.restore(0, [[record.key, record.row]]);
      restored.rows.forEach((value, rowKey) => table.rows.set(rowKey, value));
      table.sequence = Math.max(table.sequence, restored.sequence);
      written.rows.set(id, { file, text, json: JSON.stringify(record.row) });
      changed = true;
    });
    return changed;
  }

  // The folder watched: the changes are gathered for a moment, then read.
  watch() {
    try {
      this.watcher = fs.watch(this.dir, { recursive: true }, (event, name) => this.seen(name));
    } catch (err) {
      throw new BackendError(`The fs backend cannot watch ${this.dir}: ${err.message}`);
    }
    this.watcher.on('error', (err) => this.failed(err));
    this.watcher.unref();
  }

  seen(name) {
    if (!name) return;
    const parts = String(name).split(/[\\/]/);
    if (parts.some((part) => part.startsWith('.') || part.endsWith('.tmp'))) return;
    if (parts.length === 1) {
      const table = tableOf(parts[0], this.layout === 'files');
      if (table === null) return;
      this.outside.set(table, 'all');
    } else if (parts.length === 2 && this.layout === 'files' && isRowFile(parts[1], true)) {
      const table = tableOf(parts[0], true);
      if (table === null) return;
      const files = this.outside.get(table);
      if (files === 'all') return;
      if (files) files.add(parts[1]);
      else this.outside.set(table, new Set([parts[1]]));
    } else return;
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => this.readOutside(), this.watchOptions.delay);
    this.watchTimer.unref();
  }

  // The changes from outside read: after the writes started, and out of transactions.
  readOutside() {
    if (!this.watcher || this.outside.size === 0) return this.writing;
    // (A write that failed failed for its caller; the next ones go on.)
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        if (this.snapshots.length > 0 || this.outside.size === 0) return;
        const outside = [...this.outside];
        this.outside.clear();
        const changed = [];
        outside.forEach(([name, files]) => {
          try {
            const read =
              files === 'all' || this.layout === 'collection' ? this.readTable(name) : this.readRows(name, files);
            if (read) changed.push(name);
          } catch (err) {
            this.failed(new BackendError(`The fs backend cannot read ${name} in ${this.dir}: ${err.message}`));
          }
        });
        if (changed.length) await this.notify(changed);
      });
    return this.writing;
  }

  failed(err) {
    if (this.onError) this.onError(err);
    else process.emitWarning(err.message, 'XufaFsWarning');
  }

  restore(sequence, entries) {
    const rows = new Map();
    entries.forEach(([stored, row]) => {
      const key = decodeValue(stored);
      const value = decodeValue(row);
      // The rows of models without a primary key keep their number.
      this.rowKeys.set(value, key);
      rows.set(key, value);
    });
    // Objects added by hand with their numbers: the next numbers come after them.
    let next = sequence || 0;
    rows.forEach((value, key) => {
      if (typeof key === 'number' && key > next) next = key;
    });
    return { rows, sequence: next };
  }

  // What changes is written: after each operation, or when the outermost transaction commits.
  async changed(keys) {
    keys.forEach((key) => this.dirty.add(key));
    if (this.snapshots.length === 0) await this.flush();
  }

  // The tables changed, written one after the other (each with what it has when it is written).
  flush() {
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        const keys = [...this.dirty];
        this.dirty.clear();
        const merged = [];
        for (const key of keys) {
          const changed = this.layout === 'files' ? await this.writeFolder(key) : await this.writeCollection(key);
          if (changed) merged.push(key);
        }
        if (this.migrationsChanged) {
          this.migrationsChanged = false;
          await writeFile(path.join(this.dir, '_migrations.json'), JSON.stringify([...(this.migrations || [])]));
        }
        // Changes from outside taken while writing: as those read by the watcher.
        if (merged.length) await this.notify(merged);
      });
    return this.writing;
  }

  async notify(tables) {
    try {
      if (this.changedOutside) await this.changedOutside(tables);
      if (this.onChange) await this.onChange(tables);
    } catch (err) {
      this.failed(err);
    }
  }

  // The JSON of a stored row, kept while the row is the same object (rows are replaced when they change; migrations
  // that change them in place start again): only the rows that changed are serialized again.
  serialized(rowKey, row) {
    let entry = this.rowTexts.get(row);
    if (!entry) {
      const key = encodeValue(rowKey);
      const value = encodeValue(row);
      const id = JSON.stringify(key);
      const json = JSON.stringify(value);
      let text;
      if (this.layout === 'files')
        text = this.pretty ? JSON.stringify({ key, row: value }, null, 2) : `{"key":${id},"row":${json}}`;
      else text = this.pretty ? indent(JSON.stringify([key, value], null, 2), '    ') : `[${id},${json}]`;
      entry = { id, json, text };
      this.rowTexts.set(row, entry);
    }
    return entry;
  }

  // A conflict: an object changed from outside and here before the change from outside was read. What is here is
  // kept, and onError says so.
  conflict(table, ids) {
    if (!ids.length) return;
    const err = new BackendError(
      `The fs backend wrote over changes made from outside to ${table} in ${this.dir} (objects ${ids.join(', ')}), changed here too`
    );
    err.code = 'XUFA_ORM_ERR_FS_CONFLICT';
    err.table = table;
    err.keys = ids.map((id) => decodeValue(JSON.parse(id)));
    this.failed(err);
  }

  // Writes a table in its file. When watching, what changed in the file from outside since it was read or written is
  // taken first (the objects not changed here). Whether something was taken.
  async writeCollection(key) {
    const file = path.join(this.dir, `${fileName(key)}.json`);
    const table = this.tables.get(key);
    if (!table) {
      this.written.delete(key);
      await fsp.rm(file, { force: true });
      return false;
    }
    const before = this.written.get(key);
    const taken = this.watcher && before ? this.merge(key, table, before.text, readText(file)) : false;
    const rows = [...table.rows].map(([rowKey, row]) => this.serialized(rowKey, row).text);
    const text = this.pretty
      ? `{\n  "sequence": ${table.sequence},\n  "rows": [${rows.length ? `\n${rows.join(',\n')}\n  ` : ''}]\n}`
      : `{"sequence":${table.sequence},"rows":[${rows.join(',')}]}`;
    if (before && before.text === text) return taken;
    await writeFile(file, text);
    this.written.set(key, { text });
    return taken;
  }

  // Three ways, by object: as written (base), as here (ours), as in the file now (theirs). An object only one side
  // changed takes that change; one both changed keeps ours (a conflict).
  merge(key, table, baseText, diskText) {
    if (diskText === baseText) return false;
    if (diskText === null) {
      this.conflict(
        key,
        [...table.rows].map(([rowKey, row]) => this.serialized(rowKey, row).id)
      );
      return false;
    }
    const byId = (text) => {
      const map = new Map();
      JSON.parse(text).rows.forEach(([rowKey, row]) => map.set(JSON.stringify(rowKey), { key: rowKey, row }));
      return map;
    };
    let base;
    let theirs;
    let sequence;
    try {
      base = byId(baseText);
      const data = JSON.parse(diskText);
      sequence = data.sequence || 0;
      theirs = byId(diskText);
    } catch (err) {
      this.failed(new BackendError(`The fs backend cannot read ${key} in ${this.dir}: ${err.message}`));
      return false;
    }
    const ours = new Map();
    table.rows.forEach((row, rowKey) => ours.set(this.serialized(rowKey, row).id, { rowKey, row }));
    const jsonOf = (entry) => (entry ? JSON.stringify(entry.row) : undefined);
    const conflicts = [];
    let taken = false;
    new Set([...base.keys(), ...theirs.keys(), ...ours.keys()]).forEach((id) => {
      const b = jsonOf(base.get(id));
      const t = jsonOf(theirs.get(id));
      const mine = ours.get(id);
      const o = mine ? this.serialized(mine.rowKey, mine.row).json : undefined;
      if (t === b || t === o) return;
      if (o !== b) {
        conflicts.push(id);
        return;
      }
      taken = true;
      if (t === undefined) {
        table.rows.delete(mine.rowKey);
        return;
      }
      const { key: storedKey, row } = theirs.get(id);
      this.restore(0, [[storedKey, row]]).rows.forEach((value, rowKey) => table.rows.set(rowKey, value));
    });
    table.sequence = Math.max(table.sequence, sequence);
    table.rows.forEach((row, rowKey) => {
      if (typeof rowKey === 'number' && rowKey > table.sequence) table.sequence = rowKey;
    });
    this.conflict(key, conflicts);
    return taken;
  }

  // Writes the objects of a table that changed here, each in its file. When watching, an object changed from outside
  // too keeps what is here (a conflict); the others changed from outside are left to the watcher.
  async writeFolder(key) {
    const folder = path.join(this.dir, fileName(key));
    const table = this.tables.get(key);
    if (!table) {
      this.written.delete(key);
      await fsp.rm(folder, { recursive: true, force: true });
      return false;
    }
    await fsp.mkdir(folder, { recursive: true });
    const before = this.written.get(key) || { rows: new Map(), sequence: null };
    const now = new Map();
    const conflicts = [];
    const tasks = [];
    const outside = (file, text) => this.watcher && readText(path.join(folder, file)) !== text;
    for (const [rowKey, row] of table.rows) {
      const { id, json, text } = this.serialized(rowKey, row);
      const old = before.rows.get(id);
      if (old && old.json === json) {
        now.set(id, old);
        continue;
      }
      const file = old ? old.file : rowFileName(JSON.parse(id));
      if (outside(file, old ? old.text : null)) conflicts.push(id);
      tasks.push(() => writeFile(path.join(folder, file), text));
      now.set(id, { file, text, json });
    }
    for (const [id, old] of before.rows) {
      if (now.has(id)) continue;
      if (outside(old.file, old.text)) conflicts.push(id);
      tasks.push(() => fsp.rm(path.join(folder, old.file), { force: true }));
    }
    await inParallel(tasks, 32);
    if (before.sequence !== table.sequence) {
      await writeFile(path.join(folder, '_table.json'), JSON.stringify({ sequence: table.sequence }));
    }
    this.written.set(key, { rows: now, sequence: table.sequence });
    this.conflict(key, conflicts);
    return false;
  }

  async insert(meta, rows, options) {
    const result = await super.insert(meta, rows, options);
    await this.changed([meta.key]);
    return result;
  }

  async update(query, assignments) {
    const result = await super.update(query, assignments);
    if (result) await this.changed([query.meta.key]);
    return result;
  }

  async delete(query) {
    const result = await super.delete(query);
    if (result) await this.changed([query.meta.key]);
    return result;
  }

  async createSchema(metas) {
    await super.createSchema(metas);
    await this.changed(metas.map((meta) => meta.key));
  }

  async dropSchema(metas) {
    await super.dropSchema(metas);
    await this.changed(metas.map((meta) => meta.key));
  }

  async recordMigration(name) {
    await super.recordMigration(name);
    this.migrationsChanged = true;
    await this.changed([]);
  }

  async migrationOperation(op) {
    await super.migrationOperation(op);
    this.rowTexts = new WeakMap();
    const keys = [op.table, op.from, op.to, op.spec && op.spec.table].filter(Boolean);
    await this.changed(keys);
  }

  async commit() {
    await super.commit();
    if (this.snapshots.length === 0) {
      await this.flush();
      await this.readOutside();
    }
  }

  async rollback() {
    await super.rollback();
    // The outermost transaction rolled back: its tables are as they were (written again only if what was done out of
    // it while it was open changed them).
    if (this.snapshots.length === 0) {
      await this.flush();
      await this.readOutside();
    }
  }
}

// The table of a file or folder in the folder of the database (null: not one).
function tableOf(name, folder) {
  if (name.startsWith('.') || name === '_migrations.json' || name.endsWith('.tmp')) return null;
  if (!folder && !name.endsWith('.json')) return null;
  try {
    return decodeURIComponent(folder ? name : name.slice(0, -5));
  } catch {
    return null;
  }
}

function isRowFile(file, orTable = false) {
  if (file === '_table.json') return orTable;
  return file.endsWith('.json') && !file.startsWith('.');
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

module.exports = { FsBackend, encodeValue, decodeValue };
