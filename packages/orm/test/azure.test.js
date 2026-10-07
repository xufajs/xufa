// The azure-blob backend: its signatures (Shared Key and SAS: requests that Azurite, the emulator of Microsoft, which
// checks them, accepted), connection strings, and against a server of the API of Azure Blob (test/fake-azure.js, which
// checks every signature): blocks of streams and uploads that fail, metadata set without the body, keys of every
// character, SAS and public URLs, drops, errors. With XUFA_AZURE_CONNECTION_STRING (an account, or
// UseDevelopmentStorage=true for Azurite), the same against that store.
const { Readable } = require('node:stream');
const { Database, Model, fields } = require('..');
const { AzureBackend, AzureError, sharedKey, blobSas, parseConnectionString, DEVELOPMENT } = require('../lib/backends/blob/azure');
const { fakeAzure } = require('./fake-azure');

describe('Shared Key and SAS: requests Azurite accepted', () => {
  const base = 'http://127.0.0.1:10000/devstoreaccount1';
  const date = 'Wed, 07 Oct 2026 12:00:00 GMT';

  it('a container made (PUT without a body: its length is not signed)', () => {
    const headers = { 'x-ms-date': date, 'x-ms-version': '2021-12-02', 'content-length': '0' };
    expect(sharedKey({ method: 'PUT', url: new URL(`${base}/vectors?restype=container`), headers, ...DEVELOPMENT })).toBe(
      'SharedKey devstoreaccount1:IAf3ptT6ArtCpnmUPSkn/DxftcbYi7CpdF0qRXcGJjw='
    );
  });

  it('a blob written with metadata and a condition, its key with a space', () => {
    const headers = {
      'x-ms-date': date,
      'x-ms-version': '2021-12-02',
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-blob-content-type': 'text/plain',
      'x-ms-meta-xufa': 'eyJhIjoxfQ',
      'if-none-match': '*',
      'content-length': '5',
    };
    expect(sharedKey({ method: 'PUT', url: new URL(`${base}/vectors/a%20b/hello.txt`), headers, ...DEVELOPMENT })).toBe(
      'SharedKey devstoreaccount1:RTUOY5A04H1ug4L74X0KVAfeWhw5khn9adOpSC7oBsI='
    );
  });

  it('a listing: the query in the canonical resource', () => {
    const url = new URL(`${base}/vectors?restype=container&comp=list&prefix=a%20b%2F`);
    expect(sharedKey({ method: 'GET', url, headers: { 'x-ms-date': date, 'x-ms-version': '2021-12-02' }, ...DEVELOPMENT })).toBe(
      'SharedKey devstoreaccount1:QPGfkDCO2PgKeYlfk2SXh1mrx80RztzpAjEjcwnyJj4='
    );
  });

  it('a SAS of reading a blob', () => {
    const sas = blobSas({ ...DEVELOPMENT, container: 'vectors', blob: 'a b/hello.txt', expiresAt: new Date('2030-01-01T00:00:00Z') });
    expect(sas).toBe('sv=2021-12-02&se=2030-01-01T00%3A00%3A00Z&sr=b&sp=r&sig=Es1xWrq3hMDRTE6edtq4ycRpZxaIM11Bi7LhBsiKrNE%3D');
  });

  it('connection strings: of an account, of Azurite, with a SAS', () => {
    expect(parseConnectionString('DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=a2V5;EndpointSuffix=core.windows.net')).toEqual({
      account: 'acme',
      accountKey: 'a2V5',
      sasToken: undefined,
      endpoint: 'https://acme.blob.core.windows.net',
    });
    expect(parseConnectionString('UseDevelopmentStorage=true')).toEqual(DEVELOPMENT);
    expect(parseConnectionString('BlobEndpoint=https://acme.blob.core.windows.net/;SharedAccessSignature=sv=2021&sig=x')).toMatchObject({
      endpoint: 'https://acme.blob.core.windows.net/',
      sasToken: 'sv=2021&sig=x',
    });
  });
});

function makeModel() {
  class Upload extends Model {
    static fields = {
      key: fields.string({ primaryKey: true }),
      content: fields.blob(),
      size: fields.blobInfo('size'),
      etag: fields.blobInfo('etag'),
      contentType: fields.blobInfo('contentType'),
      owner: fields.string({ null: true }),
    };
  }
  return Upload;
}

describe('azure-blob backend, against a server of the API of Azure Blob', () => {
  let azure;
  let db;
  let Upload;
  let count = 0;

  beforeAll(async () => {
    azure = await fakeAzure().start();
  });
  afterAll(() => azure.close());

  async function open(options = {}) {
    count += 1;
    Upload = makeModel();
    db = new Database({
      backend: 'azure-blob',
      container: `c${count}`,
      connectionString: azure.connectionString,
      createContainer: true,
      ...options,
    }).register(Upload);
    await db.connect();
    await db.sync();
    azure.log.length = 0;
    return db;
  }
  afterEach(() => db && db.close());

  it('streams in blocks (Put Block, Put Block List), and bodies of one block in one Put Blob', async () => {
    await open({ blockSize: 5, prefix: 'app/' });
    await Upload.objects.create({ key: 'big.bin', content: Readable.from([Buffer.from('0123'), Buffer.from('456789ab'), Buffer.from('c')]) });
    const writes = azure.log.filter((entry) => entry.method === 'PUT');
    expect(writes.map((entry) => entry.query.comp || 'blob')).toEqual(['block', 'block', 'block', 'blocklist']);
    expect(writes.slice(0, 3).map((entry) => entry.size)).toEqual([5, 5, 3]);
    // The ids of the blocks of a blob are of one length.
    expect(new Set(writes.slice(0, 3).map((entry) => entry.query.blockid.length)).size).toBe(1);
    const big = await Upload.objects.get({ key: 'big.bin' });
    expect([await big.content.text(), big.size, big.contentType]).toEqual(['0123456789abc', 13, 'application/octet-stream']);
    azure.log.length = 0;
    await Upload.objects.create({ key: 'small.txt', content: 'tiny' });
    expect(azure.log.filter((entry) => entry.method === 'PUT').map((entry) => entry.headers['x-ms-blob-type'])).toEqual(['BlockBlob']);
    expect([...azure.containers.get(`c${count}`).keys()].sort()).toEqual(['app/upload/big.bin', 'app/upload/small.txt']);
  });

  it('an upload whose stream fails commits nothing: no blob', async () => {
    await open({ blockSize: 5 });
    let sent = 0;
    const failing = new Readable({
      read() {
        sent += 1;
        if (sent <= 3) this.push(Buffer.from('12345'));
        else this.destroy(new Error('the client went away'));
      },
    });
    await expect(Upload.objects.create({ key: 'broken', content: failing })).rejects.toThrow('the client went away');
    expect(azure.log.some((entry) => entry.query.comp === 'blocklist')).toBe(false);
    expect(await Upload.objects.filter({ key: 'broken' }).count()).toBe(0);
  });

  it('metadata changed alone is Set Blob Metadata and Properties (the body not sent); keys of every character', async () => {
    await open();
    const key = 'dir/a b+c%d&é?#ünï.txt';
    await Upload.objects.create({ key, content: 'body', owner: 'ada' });
    expect(await Upload.objects.filter({ key__startswith: 'dir/' }).valuesList('key', { flat: true })).toEqual([key]);
    const found = await Upload.objects.get({ key });
    azure.log.length = 0;
    found.owner = 'grace';
    await found.save();
    const writes = azure.log.filter((entry) => entry.method === 'PUT');
    expect(writes.map((entry) => [entry.query.comp, entry.size]).sort()).toEqual([['metadata', 0], ['properties', 0]]);
    const again = await Upload.objects.get({ key });
    expect([again.owner, await again.content.text(), again.contentType]).toEqual(['grace', 'body', 'text/plain; charset=utf-8']);
    // The metadata as Azure keeps it: one header, base64 of its JSON.
    const stored = azure.containers.get(`c${count}`).get(`upload/${key}`);
    expect(JSON.parse(Buffer.from(stored.meta['x-ms-meta-xufa'], 'base64url').toString())).toEqual({ owner: 'grace' });
  });

  it('creates of one key at the same time: one is made, the others are UniqueErrors (If-None-Match: *)', async () => {
    await open();
    const results = await Promise.allSettled([1, 2, 3].map((i) => Upload.objects.create({ key: 'same', content: String(i) })));
    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(1);
    expect(results.filter((result) => result.status === 'rejected').map((result) => result.reason.code)).toEqual([
      'XUFA_ORM_ERR_UNIQUE',
      'XUFA_ORM_ERR_UNIQUE',
    ]);
  });

  it('url(): a SAS of reading (until it is changed), or public', async () => {
    await open();
    await Upload.objects.create({ key: 'a/doc.pdf', content: Buffer.from('%PDF') });
    const url = await (await Upload.objects.get({ key: 'a/doc.pdf' })).content.url({ expiresIn: '10m' });
    const expires = new Date(new URL(url).searchParams.get('se')).getTime();
    expect(Math.abs(expires - (Date.now() + 600000))).toBeLessThan(5000);
    const response = await fetch(url);
    expect([response.status, await response.text()]).toEqual([200, '%PDF']);
    const tampered = new URL(url);
    tampered.pathname = tampered.pathname.replace('doc', 'other');
    expect((await fetch(tampered)).status).toBe(403);
    db.backend.publicUrl = 'https://cdn.example.com';
    expect(await (await Upload.objects.get({ key: 'a/doc.pdf' })).content.url()).toBe('https://cdn.example.com/upload/a/doc.pdf');
  });

  it('drop(): the blobs of the table deleted (the container stays), listed in pages', async () => {
    await open();
    for (let i = 0; i < 5; i += 1) await Upload.objects.create({ key: `k${i}`, content: String(i) });
    expect(await Upload.objects.count()).toBe(5);
    azure.log.length = 0;
    await db.drop();
    expect(azure.log.filter((entry) => entry.method === 'DELETE').length).toBe(5);
    expect(azure.containers.get(`c${count}`).size).toBe(0);
  });

  it('a SAS token instead of the key: sent in the query of every request, and the URL of url()', async () => {
    const backend = new AzureBackend({ container: 'c', account: azure.account, endpoint: azure.endpoint, sasToken: '?sv=2021-12-02&sig=abc' });
    expect(await backend.storeUrl('upload', 'x.txt')).toBe(`${azure.endpoint}/c/upload/x.txt?sv=2021-12-02&sig=abc`);
    azure.log.length = 0;
    await expect(backend.storeHead('upload', 'x.txt')).rejects.toThrow(AzureError);
    expect(azure.log[0].query).toEqual({ sv: '2021-12-02', sig: 'abc' });
    expect(azure.log[0].headers.authorization).toBe(undefined);
    await backend.close();
  });

  it('errors: of Azure (with its code), of the options', async () => {
    await open();
    const wrong = new AzureBackend({ container: `c${count}`, account: azure.account, endpoint: azure.endpoint, accountKey: Buffer.from('wrong').toString('base64') });
    const error = await wrong.storeHead('upload', 'x').catch((err) => err);
    expect([error instanceof AzureError, error.status, error.azureCode]).toEqual([true, 403, 'AuthenticationFailed']);
    const listing = await (async () => {
      for await (const item of wrong.storeList('upload', '')) return item;
      return null;
    })().catch((err) => err);
    expect([listing.status, listing.azureCode]).toEqual([403, 'AuthenticationFailed']);
    await wrong.close();
    expect(() => new AzureBackend({})).toThrow(/needs a container/);
    expect(() => new AzureBackend({ container: 'c', connectionString: 'AccountName=a' })).toThrow(/key of the account/);
  });

  it('the URLs of Azure: the account in the host', () => {
    const backend = new AzureBackend({ container: 'uploads', account: 'acme', accountKey: 'a2V5' });
    expect(backend.url('upload/a b.txt').toString()).toBe('https://acme.blob.core.windows.net/uploads/upload/a%20b.txt');
    expect(backend.url(null, { restype: 'container' }).toString()).toBe('https://acme.blob.core.windows.net/uploads?restype=container');
  });
});

const REAL = process.env.XUFA_AZURE_CONNECTION_STRING;
(REAL ? describe : describe.skip)('azure-blob backend against XUFA_AZURE_CONNECTION_STRING', () => {
  it('writes, lists, reads, changes, signs and deletes blobs', async () => {
    const Upload = makeModel();
    const db = new Database({
      backend: 'azure-blob',
      container: 'xufa-tests',
      connectionString: REAL,
      createContainer: true,
      prefix: `run-${Date.now()}/`,
      blockSize: 1024 * 1024,
    }).register(Upload);
    await db.connect();
    await db.sync();
    try {
      await Upload.objects.create({ key: 'a/1.txt', content: 'hello', owner: 'ada' });
      const big = Buffer.alloc(2.5 * 1024 * 1024, 7);
      await Upload.objects.create({ key: 'a/big é.bin', content: Readable.from([big]) });
      expect(await Upload.objects.orderBy('key').valuesList('key', { flat: true })).toEqual(['a/1.txt', 'a/big é.bin']);
      const one = await Upload.objects.get({ key: 'a/1.txt' });
      one.owner = 'grace';
      await one.save();
      expect((await Upload.objects.get({ key: 'a/1.txt' })).owner).toBe('grace');
      expect((await Upload.objects.get({ key: 'a/big é.bin' })).size).toBe(big.length);
      const response = await fetch(await one.content.url());
      expect(await response.text()).toBe('hello');
      await expect(Upload.objects.create({ key: 'a/1.txt', content: 'again' })).rejects.toThrow(/already/);
    } finally {
      await db.drop();
      await db.close();
    }
  });
});
