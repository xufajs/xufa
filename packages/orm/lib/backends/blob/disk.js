// DiskBackend ('disk'): a store of objects in a folder: each object is a file, <dir>/<table>/<key>, its body as it
// is (a PDF is a PDF), so the folder can be served, copied or backed up as it is. A key with slashes is a path of
// folders (a/b/c.pdf). The content type and the metadata of an object, when it has them, are in
// <dir>/.meta/<table>/<key>.json. Options: dir, url, atomic (true: files written to a temporary file and renamed;
// false: in place, as fs.writeFile, faster), metadata (false: a store without content types nor metadata, whose files
// of them are never written, removed nor read).
//
// Keys are relative paths that stay in the folder: '..', '.', empty segments, absolute paths, backslashes, colons and
// the names Windows keeps (con, nul...) are refused (an object cannot be written, read nor deleted outside its
// folder). Files are written to a temporary file and renamed, so a file is never left half written. The etag of an
// object is of its size and its time (it changes when it is written again).
//
// `url(table, key)`: the URL of an object where the folder is served (by a CDN, or app.register(static)), for
// BlobValue.url().
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { BlobBackend, exists } from './base.js';
import { BackendError } from '../../errors.js';

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const META = '.meta';
// A key of one plain name: no slash, no dot at its start nor end, at most 255 characters.
const PLAIN = /^[A-Za-z0-9_-](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9_-])?$/;
// Files up to this size are read whole (one read), bigger ones as a stream.
const WHOLE = 1024 * 1024;
const TEMP = /\.xufa-[0-9a-f]{12}\.tmp$/;

class DiskBackend extends BlobBackend {
  constructor(options = {}) {
    super(options);
    if (typeof options.dir !== 'string' || options.dir === '') {
      throw new BackendError('The disk backend needs a dir (the folder of its objects)');
    }
    this.dir = path.resolve(options.dir);
    // atomic: false writes files in place (fs.writeFile: faster, a reader may see one half written); metadata: false
    // for stores that never keep a content type nor metadata (no file of them is written, removed nor read).
    this.atomic = options.atomic !== false;
    this.metadata = options.metadata !== false;
    // The folders made (or found) by this backend: not made again for each write.
    this.folders = new Set();
    this.tableFolders = new Map();
    this.urlOf = typeof options.url === 'function' ? options.url : null;
    if (this.urlOf) this.storeUrl = async (table, key) => this.urlOf(table, key);
  }

  get name() {
    return 'disk';
  }

  // A path (a key, or the name of a table) that stays in the folder.
  checkPath(value, what) {
    if (typeof value !== 'string' || value === '' || value.length > 1024) {
      throw new BackendError(`The ${what} ${JSON.stringify(value)} is not a path of the disk backend`);
    }
    if (value.startsWith('/') || value.includes('\\') || value.includes(':') || value.includes('\0')) {
      throw new BackendError(`The ${what} ${JSON.stringify(value)} cannot have /, \\, : nor NUL at its start or in it`);
    }
    for (const segment of value.split('/')) {
      if (segment === '' || segment === '.' || segment === '..' || RESERVED.test(segment) || /[. ]$/.test(segment)) {
        throw new BackendError(
          `The ${what} ${JSON.stringify(value)} has a part that is not a name of a file (${JSON.stringify(segment)})`
        );
      }
      if (TEMP.test(segment))
        throw new BackendError(`The ${what} ${JSON.stringify(value)} is a name of a temporary file`);
    }
    return value;
  }

  checkKey(key) {
    this.checkPath(key, 'key');
  }

  // The file of a path inside a folder, checked to be inside it.
  inside(base, relative) {
    const file = path.resolve(base, ...relative.split('/'));
    if (!file.startsWith(base + path.sep))
      throw new BackendError(`The path ${JSON.stringify(relative)} leaves its folder`);
    return file;
  }

  // (The folders of tables are kept: a table is checked once.)
  folder(table) {
    let folder = this.tableFolders.get(table);
    if (folder === undefined) {
      if (table === META) throw new BackendError(`A table of the disk backend cannot be named ${META}`);
      folder = this.inside(this.dir, this.checkPath(table, 'table'));
      this.tableFolders.set(table, folder);
    }
    return folder;
  }

  // A key that is one plain name (letters, digits, '-', '_', dots inside) is a file of the folder as it is, without
  // the checks of paths (the common case: an id); any other is checked.
  fileOf(table, key) {
    const folder = this.folder(table);
    if (PLAIN.test(key) && !RESERVED.test(key) && !TEMP.test(key)) return `${folder}${path.sep}${key}`;
    return this.inside(folder, this.checkPath(key, 'key'));
  }

  metaFileOf(table, key) {
    return `${this.inside(this.inside(this.dir, `${META}/${this.checkPath(table, 'table')}`), this.checkPath(key, 'key'))}.json`;
  }

  static info(stat) {
    return {
      size: stat.size,
      etag: `${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}`,
      updatedAt: new Date(Math.floor(stat.mtimeMs)),
    };
  }

  // Writes a file whole: to a temporary file next to it, then renamed.
  // create: the file must not be there (it is linked in place, which fails when it is: no other create of it wins
  // in between); otherwise it is renamed over the one there was.
  static async writeAtomic(file, body, { create = false, mkdir = true } = {}) {
    if (mkdir) await fsp.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.xufa-${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      if (Buffer.isBuffer(body)) await fsp.writeFile(temp, body);
      else await pipeline(body, fs.createWriteStream(temp));
      if (create) {
        await fsp.link(temp, file);
        await fsp.rm(temp, { force: true });
      } else await fsp.rename(temp, file);
    } catch (err) {
      await fsp.rm(temp, { force: true });
      throw err;
    }
  }

  async writeMeta(table, key, contentType, metadata) {
    const file = this.metaFileOf(table, key);
    const empty = !contentType && (!metadata || Object.keys(metadata).length === 0);
    if (empty) {
      await fsp.rm(file, { force: true });
      return;
    }
    await DiskBackend.writeAtomic(
      file,
      Buffer.from(JSON.stringify({ contentType: contentType || null, metadata: metadata || {} }))
    );
  }

  async readMeta(table, key) {
    try {
      return JSON.parse(await fsp.readFile(this.metaFileOf(table, key), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return { contentType: null, metadata: {} };
      throw err;
    }
  }

  static async statFile(file) {
    try {
      const stat = await fsp.stat(file);
      return stat.isFile() ? stat : null;
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
      throw err;
    }
  }

  async storePut(table, key, body, { contentType, metadata, create = false, info = true }) {
    const file = this.fileOf(table, key);
    const folder = path.dirname(file);
    const write = (mkdir) =>
      this.atomic || create || !Buffer.isBuffer(body)
        ? DiskBackend.writeAtomic(file, body, { create, mkdir })
        : (mkdir ? fsp.mkdir(folder, { recursive: true }) : Promise.resolve()).then(() => fsp.writeFile(file, body));
    try {
      try {
        await write(!this.folders.has(folder));
      } catch (err) {
        // A folder removed since it was made: made again.
        if (err.code !== 'ENOENT' || !this.folders.has(folder)) throw err;
        this.folders.delete(folder);
        await write(true);
      }
      this.folders.add(folder);
    } catch (err) {
      if (create && err.code === 'EEXIST') throw exists(table, key);
      throw err;
    }
    if (this.metadata) await this.writeMeta(table, key, contentType, metadata);
    return info ? DiskBackend.info(await fsp.stat(file)) : null;
  }

  // (One open: the size from the open file, as fs.readFile does; no stat of the path before.)
  async storeRead(table, key) {
    const file = this.fileOf(table, key);
    let handle;
    try {
      handle = await fsp.open(file, 'r');
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') return null;
      throw err;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) {
        await handle.close();
        return null;
      }
      if (stat.size > WHOLE) return handle.createReadStream();
      // (Read into a buffer of its size: handle.readFile() would stat it again.)
      const body = Buffer.allocUnsafe(stat.size);
      let offset = 0;
      while (offset < body.length) {
        const { bytesRead } = await handle.read(body, offset, body.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      await handle.close();
      return offset === body.length ? body : body.subarray(0, offset);
    } catch (err) {
      await handle.close().catch(() => {});
      throw err;
    }
  }

  async storeHead(table, key) {
    const stat = await DiskBackend.statFile(this.fileOf(table, key));
    if (!stat) return null;
    if (!this.metadata) return { info: DiskBackend.info(stat), contentType: null, metadata: {} };
    const { contentType, metadata } = await this.readMeta(table, key);
    return { info: DiskBackend.info(stat), contentType, metadata };
  }

  // The files of a table (under the folder of the prefix), their keys in order.
  async *storeList(table, prefix) {
    const base = this.folder(table);
    const from = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
    let start = base;
    if (from) {
      try {
        start = this.inside(base, this.checkPath(from, 'prefix'));
      } catch {
        return; // a prefix that is no folder of keys: nothing
      }
    }
    let entries;
    try {
      entries = await fsp.readdir(start, { recursive: true, withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return;
      throw err;
    }
    const keys = [];
    for (const entry of entries) {
      if (!entry.isFile() || TEMP.test(entry.name)) continue;
      const parent = entry.parentPath || entry.path;
      const key = path.relative(base, path.join(parent, entry.name)).split(path.sep).join('/');
      if (key.startsWith(prefix)) keys.push(key);
    }
    keys.sort();
    for (const key of keys) {
      const stat = await DiskBackend.statFile(path.join(base, ...key.split('/')));
      if (stat) yield { key, info: DiskBackend.info(stat) };
    }
  }

  async storeSetMeta(table, key, { contentType, metadata }) {
    let type = contentType;
    if (type === undefined) type = (await this.readMeta(table, key)).contentType;
    await this.writeMeta(table, key, type, metadata);
  }

  async storeExists(table, key) {
    return (await DiskBackend.statFile(this.fileOf(table, key))) !== null;
  }

  async storeDelete(table, key) {
    const file = this.fileOf(table, key);
    const existed = Boolean(await DiskBackend.statFile(file));
    await fsp.rm(file, { force: true });
    if (this.metadata) await fsp.rm(this.metaFileOf(table, key), { force: true });
    // The folders left empty by it (up to the folder of the table).
    const base = this.folder(table);
    let folder = path.dirname(file);
    while (folder !== base && folder.startsWith(base + path.sep)) {
      try {
        await fsp.rmdir(folder);
      } catch {
        break;
      }
      folder = path.dirname(folder);
    }
    return existed;
  }

  async storeCreate(table) {
    await fsp.mkdir(this.folder(table), { recursive: true });
  }

  async storeDrop(table) {
    const base = this.folder(table);
    [...this.folders].forEach((folder) => {
      if (folder === base || folder.startsWith(base + path.sep)) this.folders.delete(folder);
    });
    await fsp.rm(base, { recursive: true, force: true });
    await fsp.rm(this.inside(this.dir, `${META}/${this.checkPath(table, 'table')}`), { recursive: true, force: true });
  }
}

export { DiskBackend };
