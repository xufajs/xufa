// BlobBackend: the backends of stores of objects (blobs: files of a folder, objects of S3 or Azure Blob, in memory):
// a model is a container (a folder, a bucket), an object of the model is an object of the store, its primary key (a
// string) the key of the object, its fields.blob() the body, its fields.blobInfo() what the store knows of it (size,
// etag, updatedAt, contentType), and its other fields the metadata of the object.
//
//   class Upload extends Model {
//     static fields = {
//       key: fields.string({ primaryKey: true }),
//       content: fields.blob(),
//       size: fields.blobInfo('size'),
//       owner: fields.string(),
//     };
//   }
//
// Queries are those of the ORM: the conditions on the key (exact, in, startswith) are asked to the store (an object, or
// a listing of a prefix), and the rest run in memory on what the store gives; the bodies are not read (their
// BlobValue reads them when asked), nor the metadata of objects when the query does not need it. Relations and
// transactions are not: db.transaction() runs its function, its writes made at once (as MongoDB without a replica set).
//
// A backend of a store gives (all async, `table` the name of the container):
//   storePut(table, key, body, { contentType, metadata, create })   body a Buffer or a readable stream; gives the
//                                                            info. create: refused (an error of code EXISTS) when
//                                                            the object is there
//   storeRead(table, key)                                    a Buffer or a readable stream of the body, or null
//   storeHead(table, key)                                    { info, contentType, metadata } or null
//   storeList(table, prefix)                                 an async iterable of { key, info } (info without metadata)
//   storeSetMeta(table, key, { contentType, metadata })      the metadata of an object, its body kept
//   storeDelete(table, key)                                  whether there was one
//   storeCreate(table), storeDrop(table), storeUrl(table, key, options) (optional: a URL to read it)
// info: { size, etag, updatedAt }.
import { Backend } from '../base.js';
import { MemoryBackend } from '../memory.js';
import { encodeValue, decodeValue } from '../fs.js';
import { BlobValue, bodyOf, contentTypeOf } from '../../blob.js';
import { BackendError, ModelError } from '../../errors.js';

// The code of the error of a store when a create finds the object there (storePut with create).
const EXISTS = 'XUFA_BLOB_EXISTS';
const exists = (table, key) => Object.assign(new BackendError(`${table}/${key} is there already`), { code: EXISTS });

// A memory backend for one query: the objects listed, filtered, ordered, sliced and aggregated as the memory backend
// does; the bodies (BlobValue) are given as they are.
class ScratchBackend extends MemoryBackend {
  stored(field, value) {
    return field && field.type === 'blob' ? value : super.stored(field, value);
  }

  given(field, value) {
    return field && field.type === 'blob' ? value : super.given(field, value);
  }
}

// The fields a query reads (conditions, order, output).
function fieldsOfNode(node, out) {
  if (!node) return out;
  if (node.children) node.children.forEach((child) => fieldsOfNode(child, out));
  if (node.fields) node.fields.forEach((field) => out.add(field));
  if (node.value && node.value.kind === 'F') node.value.fields.forEach((field) => out.add(field));
  if (node.op === 'exists' || node.op === 'raw') out.add(null); // refused later
  return out;
}

class BlobBackend extends Backend {
  constructor(options = {}) {
    super(options);
    this.shapes = new WeakMap();
  }

  get blobs() {
    return true;
  }

  // -- The shape of a model in a store: its key, its body, its info and its metadata.

  shape(meta) {
    let shape = this.shapes.get(meta);
    if (shape) return shape;
    const name = meta.model ? meta.model.name : meta.table;
    const { pk } = meta;
    if (!pk || pk.composite || !['string', 'text', 'uuid'].includes(pk.type)) {
      throw new ModelError(name, `a model of the ${this.name} backend has a primary key that is a string (the key)`);
    }
    const blobs = meta.fields.filter((field) => field.type === 'blob');
    if (blobs.length !== 1) {
      throw new ModelError(name, `a model of the ${this.name} backend has one fields.blob() (it has ${blobs.length})`);
    }
    const info = {};
    const metadata = [];
    for (const field of meta.fields) {
      if (field === pk || field === blobs[0]) continue;
      if (field.blobInfo) info[field.blobInfo] = field;
      else if (field.target || field.type === 'manyToMany') {
        throw new ModelError(name, `the ${this.name} backend has no relations (${field.name})`);
      } else {
        if (field.unique)
          throw new ModelError(name, `the ${this.name} backend has no unique fields but the key (${field.name})`);
        metadata.push(field);
      }
    }
    if (meta.manyToMany && meta.manyToMany.length) {
      throw new ModelError(name, `the ${this.name} backend has no relations (${meta.manyToMany[0].name})`);
    }
    shape = { table: meta.table, pk, blob: blobs[0], info, metadata };
    this.shapes.set(meta, shape);
    return shape;
  }

  // A key of an object: a string; backends refuse what their store cannot keep (checkKey).
  keyOf(shape, value) {
    if (typeof value !== 'string' || value === '') {
      throw new BackendError(`The key of an object of ${shape.table} is a string that is not empty`);
    }
    this.checkKey(value);
    return value;
  }

  checkKey() {}

  // The metadata of a row (the values of its metadata fields), as JSON keeps them.
  metadataOf(shape, row) {
    const out = {};
    for (const field of shape.metadata) {
      const value = row[field.attname];
      if (value !== undefined && value !== null) out[field.attname] = encodeValue(value);
    }
    return out;
  }

  // A row of the ORM from what the store gives.
  row(shape, key, info = {}, head = null) {
    const row = { [shape.pk.attname]: key };
    // The type the store knows, or the one of the extension of the key (an object written there by other means).
    const contentType = (head ? head.contentType : info.contentType) || contentTypeOf(key);
    row[shape.blob.attname] = new BlobValue({
      key,
      table: shape.table,
      store: this,
      backend: this.name,
      info: { ...info, contentType },
      source: async () => {
        const body = await this.storeRead(shape.table, key);
        if (body === null) throw new BackendError(`The object ${key} of ${shape.table} is not there any more`);
        return body;
      },
      url: typeof this.storeUrl === 'function' ? (options) => this.storeUrl(shape.table, key, options) : null,
    });
    for (const [kind, field] of Object.entries(shape.info)) {
      const value = kind === 'contentType' ? contentType : info[kind];
      row[field.attname] = value === undefined || value === null ? null : field.toValue(value);
    }
    for (const field of shape.metadata) {
      const value = head && head.metadata ? head.metadata[field.attname] : undefined;
      row[field.attname] = value === undefined ? null : decodeValue(value);
    }
    return row;
  }

  // -- Reading.

  // The keys a condition asks for: { keys } (exact or in), { prefix } (startswith), or {} (all of them).
  keysOf(shape, where) {
    if (!where) return {};
    const nodes = where.op === 'and' ? where.children : [where];
    for (const node of nodes) {
      if (!node || node.op || !node.fields || node.fields.length !== 1 || node.fields[0] !== shape.pk || node.path)
        continue;
      const { value, lookup } = node;
      if (value && value.kind === 'F') continue;
      if (lookup === 'exact' && typeof value === 'string') return { keys: [value] };
      if (lookup === 'in' && Array.isArray(value) && value.every((item) => typeof item === 'string'))
        return { keys: value };
      if (lookup === 'startswith' && typeof value === 'string') return { prefix: value };
    }
    return {};
  }

  // Whether a query needs the metadata of the objects (what a listing does not give).
  needsHead(shape, query, outputFields) {
    const used = fieldsOfNode(query.where, new Set());
    if (used.has(null)) throw new BackendError(`The ${this.name} backend has no relations nor fragments of SQL`);
    (query.orderBy || []).forEach((item) => item.fields.forEach((field) => used.add(field)));
    (query.values || []).forEach((item) => item.fields.forEach((field) => used.add(field)));
    if (!query.values) outputFields.forEach((field) => used.add(field));
    for (const field of used) {
      if (field && field.model && field.model.meta !== query.meta) {
        throw new BackendError(`The ${this.name} backend has no relations (${field.name})`);
      }
    }
    return (
      shape.metadata.some((field) => used.has(field)) || (shape.info.contentType && used.has(shape.info.contentType))
    );
  }

  // The rows of the objects a query may match (all its conditions are checked after, in memory).
  async load(query, outputFields = query.only || query.meta.fields) {
    const shape = this.shape(query.meta);
    if (query.extra) throw this.unsupported('Fragments of SQL (extra)');
    if (query.related && query.related.length) throw this.unsupported('Relations');
    const head = this.needsHead(shape, query, outputFields);
    const { keys, prefix } = this.keysOf(shape, query.where);
    const rows = [];
    if (keys) {
      for (const key of new Set(keys)) {
        this.checkKey(key);
        const found = await this.storeHead(shape.table, key);
        if (found) rows.push(this.row(shape, key, found.info, found));
      }
      return { shape, rows };
    }
    const listed = [];
    for await (const item of this.storeList(shape.table, prefix || '')) listed.push(item);
    if (!head) return { shape, rows: listed.map((item) => this.row(shape, item.key, item.info)) };
    for (const item of listed) {
      const found = await this.storeHead(shape.table, item.key);
      if (found) rows.push(this.row(shape, item.key, found.info, found));
    }
    return { shape, rows };
  }

  // A memory backend with the rows of a query, in the table of its model.
  scratch(meta, rows) {
    const scratch = new ScratchBackend();
    const table = scratch.table(meta);
    rows.forEach((row) => table.rows.set(row[meta.pk.attname], row));
    return scratch;
  }

  async select(query) {
    const { rows } = await this.load(query);
    return this.scratch(query.meta, rows).select(query);
  }

  async count(query) {
    const { rows } = await this.load(query, []);
    return this.scratch(query.meta, rows).count(query);
  }

  async aggregate(query, aggregates, groupBy) {
    const { rows } = await this.load(query, []);
    return this.scratch(query.meta, rows).aggregate(query, aggregates, groupBy);
  }

  // The rows a write matches (its conditions checked).
  async matching(query) {
    const { shape, rows } = await this.load({ ...query, orderBy: [] }, []);
    const scratch = this.scratch(query.meta, rows);
    return { shape, scratch, rows: scratch.find({ ...query, limit: null, offset: 0, orderBy: [] }) };
  }

  // -- Writing.

  async insert(meta, rows, options = {}) {
    if (options.conflict) throw this.unsupported('Inserts with conflicts');
    const shape = this.shape(meta);
    const keys = [];
    for (const row of rows) {
      const key = this.keyOf(shape, row[shape.pk.attname]);
      const duplicate = () =>
        Object.assign(new BackendError(`Duplicate primary key ${key} in ${shape.table}`), {
          unique: [shape.pk.column],
        });
      if (await this.storeHead(shape.table, key)) throw duplicate();
      // A create: the store refuses it when the object is there by then (another create of the same key), so two
      // creates of one key never both succeed (S3: If-None-Match: *; disk: a link that does not replace a file).
      try {
        const info = await this.put(shape, key, row[shape.blob.attname], row, { create: true });
        // What the store knows of the object, for the object created (Model.save() takes it from the row).
        for (const kind of ['size', 'etag', 'updatedAt', 'contentType']) {
          if (shape.info[kind] && info && info[kind] !== undefined) row[shape.info[kind].attname] = info[kind];
        }
      } catch (err) {
        if (err.code === EXISTS) throw duplicate();
        throw err;
      }
      keys.push(key);
    }
    return keys;
  }

  // Writes the body of an object (and its metadata and content type).
  async put(shape, key, value, row, { create = false } = {}) {
    const given = shape.info.contentType ? row[shape.info.contentType.attname] : null;
    const contentType = given || (value instanceof BlobValue ? value.contentType : null) || contentTypeOf(key);
    const body = value === null || value === undefined ? Buffer.alloc(0) : await bodyOf(value);
    const info = await this.storePut(shape.table, key, body, {
      contentType,
      metadata: this.metadataOf(shape, row),
      create,
    });
    return { ...info, contentType };
  }

  async update(query, assignments) {
    if (assignments.some(({ value }) => value && value.kind === 'raw'))
      throw this.unsupported('Fragments of SQL (Raw)');
    const { shape, scratch, rows } = await this.matching(query);
    // The metadata of the objects, to change some of it.
    for (const row of rows) {
      const key = row[shape.pk.attname];
      const found = shape.metadata.length ? await this.storeHead(shape.table, key) : null;
      const next = found ? this.row(shape, key, found.info, found) : { ...row };
      let body;
      for (const { field, value } of assignments) {
        if (field === shape.pk) throw new BackendError('update() cannot change the key of an object');
        if (field.blobInfo && field.readOnly) continue; // given by the store
        const evaluated = scratch.evaluate(row, value);
        if (field === shape.blob) body = evaluated;
        else next[field.attname] = evaluated;
      }
      // The body as it was read from this object (save() of an object loaded) is not written again.
      const unchanged =
        body instanceof BlobValue && body.store === this && body.table === shape.table && body.key === key;
      if (body !== undefined && !unchanged) await this.put(shape, key, body, next);
      else {
        const contentType = shape.info.contentType ? next[shape.info.contentType.attname] : undefined;
        await this.storeSetMeta(shape.table, key, { contentType, metadata: this.metadataOf(shape, next) });
      }
    }
    return rows.length;
  }

  async delete(query) {
    const { shape, rows } = await this.matching(query);
    let deleted = 0;
    for (const row of rows) if (await this.storeDelete(shape.table, row[shape.pk.attname])) deleted += 1;
    return deleted;
  }

  // -- Containers, and what a store has not.

  async createSchema(metas) {
    for (const meta of metas) await this.storeCreate(this.shape(meta).table);
  }

  async dropSchema(metas) {
    for (const meta of metas) await this.storeDrop(this.shape(meta).table);
  }

  // No transactions: the function runs, its writes made at once.
  async transaction(fn) {
    return fn();
  }
}

export { BlobBackend, EXISTS, exists };
