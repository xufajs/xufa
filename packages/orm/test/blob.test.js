// Blob backends (memory-blob, disk, s3, azure-blob): models whose objects are objects of a store (a key, a body, what the store knows
// and metadata), with the querysets of the ORM: what they ask the store (an object, a listing, the metadata only when
// needed), bodies read when asked, writes (metadata alone, or the body), deletes; and, on disk, the files as they are
// and keys that cannot leave the folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Database, Model, fields, BlobValue, UniqueError, ModelError, Sum, Count } = require('..');
const { fakeS3 } = require('./fake-s3');
const { fakeAzure } = require('./fake-azure');

function makeModel() {
  class Upload extends Model {
    static fields = {
      key: fields.string({ primaryKey: true }),
      content: fields.blob(),
      size: fields.blobInfo('size'),
      etag: fields.blobInfo('etag'),
      updatedAt: fields.blobInfo('updatedAt'),
      contentType: fields.blobInfo('contentType'),
      owner: fields.string({ null: true }),
      tags: fields.json({ null: true }),
      takenAt: fields.datetime({ null: true }),
    };
  }
  return Upload;
}

// Counts the calls of the store (what a query asks it).
function spy(backend) {
  const calls = { storeHead: 0, storeList: 0, storePut: 0, storeRead: 0, storeSetMeta: 0 };
  for (const name of Object.keys(calls)) {
    const original = backend[name].bind(backend);
    backend[name] = (...args) => {
      calls[name] += 1;
      return original(...args);
    };
  }
  calls.reset = () => Object.keys(calls).forEach((name) => name !== 'reset' && (calls[name] = 0));
  return calls;
}

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-blob-'));
  dirs.push(dir);
  return dir;
};

// A server of the API of S3 for the s3 backend (lists in pages of 2 keys).
let s3;
let bucketCount = 0;
beforeAll(async () => {
  s3 = await fakeS3().start();
});
afterAll(() => s3.close());

// A server of the API of Azure Blob for the azure-blob backend (lists in pages of 2 blobs).
let azure;
beforeAll(async () => {
  azure = await fakeAzure().start();
});
afterAll(() => azure.close());

const optionsOf = (backend, dir) => {
  if (backend === 'disk') return { backend, dir };
  // The store of XUFA_S3_URL (a prefix of its own for each test).
  if (backend === 's3-real') {
    const url = new URL(process.env.XUFA_S3_URL);
    bucketCount += 1;
    return {
      backend: 's3',
      endpoint: `${url.protocol}//${url.host}`,
      bucket: url.pathname.slice(1),
      region: url.searchParams.get('region') || 'us-east-1',
      credentials: { accessKeyId: decodeURIComponent(url.username), secretAccessKey: decodeURIComponent(url.password) },
      prefix: `xufa-blob-${Date.now()}-${bucketCount}/`,
      createBucket: true,
    };
  }
  if (backend === 'azure-blob') {
    bucketCount += 1;
    return { backend, container: `container-${bucketCount}`, connectionString: azure.connectionString, createContainer: true };
  }
  // The store of XUFA_AZURE_CONNECTION_STRING (a prefix of its own for each test).
  if (backend === 'azure-real') {
    bucketCount += 1;
    return {
      backend: 'azure-blob',
      container: 'xufa-tests',
      connectionString: process.env.XUFA_AZURE_CONNECTION_STRING,
      prefix: `xufa-blob-${Date.now()}-${bucketCount}/`,
      createContainer: true,
    };
  }
  if (backend === 's3') {
    bucketCount += 1;
    return { backend, bucket: `bucket-${bucketCount}`, endpoint: s3.endpoint, credentials: s3.credentials, createBucket: true };
  }
  return { backend };
};

const BACKENDS = ['memory-blob', 'disk', 's3', 'azure-blob'];
if (process.env.XUFA_S3_URL) BACKENDS.push('s3-real');
if (process.env.XUFA_AZURE_CONNECTION_STRING) BACKENDS.push('azure-real');

for (const backend of BACKENDS) {
  describe(`blob backend: ${backend}`, () => {
    let db;
    let Upload;
    let calls;
    let dir;

    beforeEach(async () => {
      Upload = makeModel();
      dir = tempDir();
      db = new Database(optionsOf(backend, dir)).register(Upload);
      await db.connect();
      await db.sync();
      calls = spy(db.backend);
    });

    afterEach(async () => {
      if (backend === 's3-real' || backend === 'azure-real') await db.drop();
      await db.close();
    });

    it('bodies of every kind, read when asked; the info of the store; content types', async () => {
      await Upload.objects.create({ key: 'notes/a.txt', content: 'héllo', owner: 'ada', tags: ['x'], takenAt: new Date(5) });
      await Upload.objects.create({ key: 'bytes.bin', content: new Uint8Array([1, 2, 3]) });
      await Upload.objects.create({ key: 'stream.json', content: Readable.from([Buffer.from('{"a"'), Buffer.from(':1}')]) });
      await Upload.objects.create({ key: 'typed', content: Buffer.from('x'), contentType: 'application/x-custom' });
      const a = await Upload.objects.get({ key: 'notes/a.txt' });
      expect(a.content).toBeInstanceOf(BlobValue);
      expect([a.size, a.contentType, a.owner, a.tags, a.takenAt]).toEqual([6, 'text/plain; charset=utf-8', 'ada', ['x'], new Date(5)]);
      expect(a.updatedAt).toBeInstanceOf(Date);
      expect(typeof a.etag).toBe('string');
      expect(await a.content.text()).toBe('héllo');
      expect([...(await (await Upload.objects.get({ key: 'bytes.bin' })).content.buffer())]).toEqual([1, 2, 3]);
      expect(await (await Upload.objects.get({ key: 'stream.json' })).content.json()).toEqual({ a: 1 });
      const typed = await Upload.objects.get({ key: 'typed' });
      expect(typed.contentType).toBe('application/x-custom');
      const chunks = [];
      for await (const chunk of await typed.content.stream()) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('x');
      expect((await Upload.objects.get({ key: 'bytes.bin' })).contentType).toBe('application/octet-stream');
      // A copy of another object (its body and its type).
      await Upload.objects.create({ key: 'copy.txt', content: a.content });
      expect(await (await Upload.objects.get({ key: 'copy.txt' })).content.text()).toBe('héllo');
      expect(JSON.parse(JSON.stringify(a))).toMatchObject({ key: 'notes/a.txt', content: { size: 6 }, owner: 'ada' });
    });

    it('queries: by key (the object), by prefix (a listing), on metadata (read only then), order, slices, counts', async () => {
      for (const [key, owner, text] of [['a/1', 'ada', 'one'], ['a/2', 'grace', 'two!'], ['b/3', 'ada', 'three'], ['a/sub/4', null, '4']]) {
        await Upload.objects.create({ key, owner, content: text });
      }
      calls.reset();
      expect((await Upload.objects.filter({ key__startswith: 'a/' }).orderBy('-key').valuesList('key', { flat: true }))).toEqual(['a/sub/4', 'a/2', 'a/1']);
      expect(await Upload.objects.filter({ size__gt: 3 }).count()).toBe(2);
      expect((await Upload.objects.only('key', 'size').orderBy('key')).map((u) => `${u.key}:${u.size}`)).toEqual(['a/1:3', 'a/2:4', 'a/sub/4:1', 'b/3:5']);
      // Listings only: no metadata read, no bodies.
      expect([calls.storeHead, calls.storeRead]).toEqual([0, 0]);
      expect((await Upload.objects.filter({ owner: 'ada' }).orderBy('key')).map((u) => u.key)).toEqual(['a/1', 'b/3']);
      expect(calls.storeHead).toBe(4); // the metadata of each object listed
      calls.reset();
      expect((await Upload.objects.filter({ key__in: ['a/2', 'nope', 'b/3'] }).orderBy('key')).map((u) => u.owner)).toEqual(['grace', 'ada']);
      expect([calls.storeList, calls.storeHead]).toEqual([0, 3]);
      expect(await Upload.objects.filter({ key: 'nope' }).first()).toBe(null);
      expect((await Upload.objects.orderBy('key').offset(1).limit(2)).map((u) => u.key)).toEqual(['a/2', 'a/sub/4']);
      expect(await Upload.objects.aggregate({ total: Sum('size'), n: Count() })).toEqual({ total: 13, n: 4 });
      expect(await Upload.objects.filter({ owner__isnull: true }).valuesList('key', { flat: true })).toEqual(['a/sub/4']);
      expect(calls.storeRead).toBe(0);
    });

    it('save(): its metadata without writing the body again; a new body; update() and delete() of querysets', async () => {
      await Upload.objects.create({ key: 'doc.txt', content: 'v1', owner: 'ada' });
      const doc = await Upload.objects.get({ key: 'doc.txt' });
      calls.reset();
      doc.owner = 'grace';
      await doc.save();
      expect([calls.storePut, calls.storeSetMeta]).toEqual([0, 1]);
      const saved = await Upload.objects.get({ key: 'doc.txt' });
      expect([saved.owner, await saved.content.text()]).toEqual(['grace', 'v1']);
      saved.content = 'version two';
      await saved.save();
      expect(calls.storePut).toBe(1);
      const again = await Upload.objects.get({ key: 'doc.txt' });
      expect([await again.content.text(), again.size, again.owner]).toEqual(['version two', 11, 'grace']);
      await Upload.objects.create({ key: 'x/1', content: 'a' });
      await Upload.objects.create({ key: 'x/2', content: 'b' });
      expect(await Upload.objects.filter({ key__startswith: 'x/' }).update({ owner: 'bulk' })).toBe(2);
      expect(await Upload.objects.filter({ owner: 'bulk' }).count()).toBe(2);
      expect(await (await Upload.objects.get({ key: 'x/1' })).content.text()).toBe('a');
      expect(await Upload.objects.filter({ key__startswith: 'x/' }).delete()).toBe(2);
      await again.delete();
      expect(await Upload.objects.count()).toBe(0);
    });

    it('creates of one key at the same time: one is made, the others are UniqueErrors (the store refuses them)', async () => {
      const results = await Promise.allSettled(
        ['a', 'b', 'c', 'd'].map((text) => Upload.objects.create({ key: 'race', content: text }))
      );
      const made = results.filter((result) => result.status === 'fulfilled');
      const refused = results.filter((result) => result.status === 'rejected');
      expect([made.length, refused.length]).toEqual([1, 3]);
      expect(refused.every((result) => result.reason instanceof UniqueError)).toBe(true);
      // The object is the one of the create that was made.
      expect(await (await Upload.objects.get({ key: 'race' })).content.text()).toBe(made[0].value.content.toString());
    });

    it('a key that is there already is a UniqueError; no transactions (the function runs)', async () => {
      const made = await Upload.objects.create({ key: 'one', content: 'a' });
      // What the store knows of it, on the object created.
      expect([made.size, typeof made.etag, made.updatedAt instanceof Date, made.contentType]).toEqual([1, 'string', true, 'application/octet-stream']);
      await expect(Upload.objects.create({ key: 'one', content: 'b' })).rejects.toThrow(UniqueError);
      expect(await (await Upload.objects.get({ key: 'one' })).content.text()).toBe('a');
      expect(await db.transaction(async () => Upload.objects.count())).toBe(1);
      const url = (await Upload.objects.get({ key: 'one' })).content.url();
      if (backend.startsWith('s3')) expect(await url).toMatch(/X-Amz-Signature=/);
      else if (backend.startsWith('azure')) expect(await url).toMatch(/[?&]sig=/);
      else await expect(url).rejects.toThrow(/URLs of blobs is not supported by the/);
    });
  });
}

describe('models of blob backends', () => {
  const blobDb = () => new Database({ backend: 'memory-blob' });

  it('a key that is a string, one blob, no relations nor unique fields; blobs only on blob backends', () => {
    class NoKey extends Model {
      static fields = { content: fields.blob() };
    }
    expect(() => blobDb().register(NoKey)).toThrow(/primary key that is a string/);
    class TwoBlobs extends Model {
      static fields = { key: fields.string({ primaryKey: true }), a: fields.blob(), b: fields.blob() };
    }
    expect(() => blobDb().register(TwoBlobs)).toThrow(/one fields\.blob\(\) \(it has 2\)/);
    class Unique extends Model {
      static fields = { key: fields.string({ primaryKey: true }), body: fields.blob(), slug: fields.string({ unique: true }) };
    }
    expect(() => blobDb().register(Unique)).toThrow(/no unique fields but the key \(slug\)/);
    class Author extends Model {
      static fields = { name: fields.string() };
    }
    class Linked extends Model {
      static fields = { key: fields.string({ primaryKey: true }), body: fields.blob(), author: fields.foreignKey(() => Author) };
    }
    expect(() => blobDb().register(Author, Linked)).toThrow(ModelError);
    class File extends Model {
      static fields = { key: fields.string({ primaryKey: true }), body: fields.blob() };
    }
    expect(() => new Database({ backend: 'memory' }).register(File)).toThrow(/fields\.blob\(\) is of blob backends .*not of memory/);
    expect(() => fields.blobInfo('owner')).toThrow(/kind is size, etag, updatedAt, contentType/);
    expect(() => fields.blob().toValue(5)).toThrow(/Buffer, a string, a stream or a blob/);
  });
});

describe('disk', () => {
  let dir;
  let db;
  let File;

  beforeEach(async () => {
    dir = tempDir();
    File = class File extends Model {
      static fields = { key: fields.string({ primaryKey: true }), body: fields.blob(), owner: fields.string({ null: true }) };

      static options = { table: 'files' };
    };
    db = new Database({ backend: 'disk', dir, url: (table, key) => `https://cdn.example.com/${table}/${key}` }).register(File);
    await db.connect();
    await db.sync();
  });

  afterEach(() => db.close());

  it('objects are the files themselves; their metadata apart; folders emptied by deletes go', async () => {
    await File.objects.create({ key: 'reports/2026/q3.pdf', body: Buffer.from('%PDF-1.7'), owner: 'ada' });
    await File.objects.create({ key: 'plain.txt', body: 'no metadata' });
    expect(fs.readFileSync(path.join(dir, 'files', 'reports', '2026', 'q3.pdf'), 'utf8')).toBe('%PDF-1.7');
    const meta = JSON.parse(fs.readFileSync(path.join(dir, '.meta', 'files', 'reports', '2026', 'q3.pdf.json'), 'utf8'));
    expect(meta).toEqual({ contentType: 'application/pdf', metadata: { owner: 'ada' } });
    // A file put there from outside is an object too.
    fs.mkdirSync(path.join(dir, 'files', 'dropped'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'files', 'dropped', 'in.csv'), 'a,b');
    fs.writeFileSync(path.join(dir, 'files', 'half.txt.xufa-0123456789ab.tmp'), 'a temporary file: not an object');
    expect(await File.objects.orderBy('key').valuesList('key', { flat: true })).toEqual(['dropped/in.csv', 'plain.txt', 'reports/2026/q3.pdf']);
    expect((await File.objects.get({ key: 'dropped/in.csv' })).body.contentType).toBe('text/csv; charset=utf-8');
    expect(await (await File.objects.get({ key: 'reports/2026/q3.pdf' })).body.url()).toBe('https://cdn.example.com/files/reports/2026/q3.pdf');
    await (await File.objects.get({ key: 'reports/2026/q3.pdf' })).delete();
    expect(fs.existsSync(path.join(dir, 'files', 'reports'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'files'))).toBe(true);
  });

  it('keys that would leave the folder are refused, to write, read or delete', async () => {
    const outside = path.join(path.dirname(dir), `${path.basename(dir)}-outside.txt`);
    fs.writeFileSync(outside, 'secret');
    dirs.push(outside);
    for (const key of ['../x', 'a/../../x', '/etc/passwd', 'C:\\x', 'c:x', 'a\\b', 'a//b', './a', 'a/.', 'con', 'nul.txt', 'x.', 'x ', `../../${path.basename(outside)}`]) {
      await expect(File.objects.create({ key, body: 'x' })).rejects.toThrow(/not a path of the disk backend|cannot have|not a name of a file|leaves its folder/);
      await expect(File.objects.filter({ key }).delete()).rejects.toThrow();
      await expect(File.objects.get({ key })).rejects.toThrow();
    }
    expect(fs.readFileSync(outside, 'utf8')).toBe('secret');
    expect(() => new Database({ backend: 'disk' })).toThrow(/needs a dir/);
  });

  it('a body that fails while it is written leaves nothing (no file, no temporary file)', async () => {
    const failing = new Readable({
      read() {
        this.push(Buffer.from('part'));
        this.destroy(new Error('the client went away'));
      },
    });
    await expect(File.objects.create({ key: 'broken.bin', body: failing })).rejects.toThrow('the client went away');
    expect(fs.readdirSync(path.join(dir, 'files'))).toEqual([]);
  });
});

describe('blobs in an app', () => {
  it('routes that upload and stream files, and a folder for each tenant', async () => {
    const xufa = require('@xufa/http'); // eslint-disable-line global-require
    const { Tenants, plugin } = require('..'); // eslint-disable-line global-require
    class Doc extends Model {
      static fields = { key: fields.string({ primaryKey: true }), body: fields.blob(), size: fields.blobInfo('size') };
    }
    const root = tempDir();
    const tenants = new Tenants({ models: [Doc], config: (id) => ({ backend: 'disk', dir: path.join(root, id) }), setup: (tdb) => tdb.sync() });
    const app = xufa();
    app.addContentTypeParser('*', (request, payload, done) => done(null, payload)); // bodies as streams
    app.register(plugin, { tenants: { tenants, resolve: (request) => request.headers['x-tenant'], authorize: false } });
    app.put('/files/*', async (request) => {
      const doc = await Doc.objects.create({ key: request.params['*'], body: request.body });
      return { key: doc.key };
    });
    app.get('/files/*', async (request, reply) => {
      const doc = await Doc.objects.get({ key: request.params['*'] });
      reply.type(doc.body.contentType);
      return doc.body.stream();
    });
    app.get('/files', async () => Doc.objects.orderBy('key').values('key', 'size'));
    await app.ready();
    const put = await app.inject({ method: 'PUT', url: '/files/img/logo.svg', headers: { 'x-tenant': 'acme', 'content-type': 'image/svg+xml' }, payload: '<svg/>' });
    expect(put.json()).toEqual({ key: 'img/logo.svg' });
    const got = await app.inject({ url: '/files/img/logo.svg', headers: { 'x-tenant': 'acme' } });
    expect([got.statusCode, got.headers['content-type'], got.body]).toEqual([200, 'image/svg+xml', '<svg/>']);
    expect((await app.inject({ url: '/files', headers: { 'x-tenant': 'acme' } })).json()).toEqual([{ key: 'img/logo.svg', size: 6 }]);
    expect((await app.inject({ url: '/files', headers: { 'x-tenant': 'globex' } })).json()).toEqual([]);
    expect((await app.inject({ url: '/files/img/logo.svg', headers: { 'x-tenant': 'globex' } })).statusCode).toBe(404);
    expect(fs.readFileSync(path.join(root, 'acme', 'doc', 'img', 'logo.svg'), 'utf8')).toBe('<svg/>');
    await app.close();
  });
});
