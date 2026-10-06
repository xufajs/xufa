// MemoryBlobBackend ('memory-blob'): a store of objects in memory, for tests and prototypes of the models of blob
// backends (lib/backends/blob/base.js). Its containers are made when an object is written to them.
const crypto = require('node:crypto');
const { BlobBackend } = require('./base');
const { bufferOf } = require('../../blob');

class MemoryBlobBackend extends BlobBackend {
  constructor(options = {}) {
    super(options);
    this.containers = new Map();
  }

  get name() {
    return 'memory-blob';
  }

  container(table) {
    let container = this.containers.get(table);
    if (!container) {
      container = new Map();
      this.containers.set(table, container);
    }
    return container;
  }

  static info(object) {
    return { size: object.body.length, etag: object.etag, updatedAt: new Date(object.updatedAt.getTime()) };
  }

  async storePut(table, key, body, { contentType, metadata }) {
    const buffer = Buffer.from(await bufferOf(body));
    const object = {
      body: buffer,
      etag: crypto.createHash('md5').update(buffer).digest('hex'),
      updatedAt: new Date(),
      contentType: contentType || null,
      metadata: structuredClone(metadata || {}),
    };
    this.container(table).set(key, object);
    return MemoryBlobBackend.info(object);
  }

  async storeRead(table, key) {
    const object = this.container(table).get(key);
    return object ? Buffer.from(object.body) : null;
  }

  async storeHead(table, key) {
    const object = this.container(table).get(key);
    if (!object) return null;
    return {
      info: MemoryBlobBackend.info(object),
      contentType: object.contentType,
      metadata: structuredClone(object.metadata),
    };
  }

  async *storeList(table, prefix) {
    const container = this.container(table);
    const keys = [...container.keys()].filter((key) => key.startsWith(prefix)).sort();
    for (const key of keys) {
      const object = container.get(key);
      if (object) yield { key, info: MemoryBlobBackend.info(object) };
    }
  }

  async storeSetMeta(table, key, { contentType, metadata }) {
    const object = this.container(table).get(key);
    if (!object) return;
    if (contentType !== undefined) object.contentType = contentType || null;
    object.metadata = structuredClone(metadata || {});
  }

  async storeDelete(table, key) {
    return this.container(table).delete(key);
  }

  async storeCreate(table) {
    this.container(table);
  }

  async storeDrop(table) {
    this.containers.delete(table);
  }
}

module.exports = { MemoryBlobBackend };
