// The s3 backend: its signatures (the examples of the documentation of AWS), and against a server of the API of S3
// (test/fake-s3.js, which checks every signature): uploads in parts and their abort, metadata changed by copies, keys
// of every character, signed and public URLs, drops in batches, errors. With XUFA_S3_URL
// (http://<key>:<secret>@<host>:<port>/<bucket>?region=<region>, as MinIO's), the same against that store.
import { Readable } from 'node:stream';
import { Database, Model, fields } from '../index.js';
import { sign, presign } from '../lib/backends/blob/sigv4.js';
import { S3Backend, S3Error } from '../lib/backends/blob/s3.js';
import { fakeS3 } from './fake-s3.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const EXAMPLE = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };
const MAY_24 = new Date('2013-05-24T00:00:00Z');
const signatureOf = (headers) => headers.authorization.split('Signature=')[1];

describe('SigV4: the examples of the documentation of S3', () => {
  const base = { region: 'us-east-1', credentials: EXAMPLE, date: MAY_24 };

  it('GET of an object, with a range', () => {
    const headers = sign({ ...base, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: { range: 'bytes=0-9' } });
    expect(signatureOf(headers)).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    expect(headers.authorization).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
  });

  it('PUT of an object (its body hashed, a key with $)', () => {
    const payloadHash = require('node:crypto').createHash('sha256').update('Welcome to Amazon S3.').digest('hex'); // eslint-disable-line global-require
    const headers = sign({
      ...base,
      method: 'PUT',
      url: new URL('https://examplebucket.s3.amazonaws.com/test%24file.text'),
      headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      payloadHash,
    });
    expect(signatureOf(headers)).toBe('98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('GET of a bucket: a listing, and a subresource', () => {
    expect(signatureOf(sign({ ...base, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J') }))).toBe(
      '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7'
    );
    expect(signatureOf(sign({ ...base, method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?lifecycle') }))).toBe(
      'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543'
    );
  });

  it('a URL signed in its query', () => {
    const url = new URL(presign({ ...base, url: 'https://examplebucket.s3.amazonaws.com/test.txt', expiresIn: 86400 }));
    expect(url.searchParams.get('X-Amz-Signature')).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
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

describe('s3 backend, against a server of the API of S3', () => {
  let s3;
  let db;
  let Upload;
  let count = 0;

  beforeAll(async () => {
    s3 = await fakeS3().start();
  });
  afterAll(() => s3.close());

  async function open(options = {}) {
    count += 1;
    Upload = makeModel();
    db = new Database({ backend: 's3', bucket: `b${count}`, endpoint: s3.endpoint, credentials: s3.credentials, createBucket: true, ...options }).register(Upload);
    await db.connect();
    await db.sync();
    s3.log.length = 0;
    return db;
  }
  afterEach(() => db && db.close());

  it('streams in parts (a multipart upload), and bodies of one part in one PUT', async () => {
    await open({ partSize: 5, allowSmallParts: true, prefix: 'app/' });
    await Upload.objects.create({ key: 'big.bin', content: Readable.from([Buffer.from('0123'), Buffer.from('456789ab'), Buffer.from('c')]) });
    // (the HEAD before: create() checks that the key is not taken)
    const ops = s3.log.filter((entry) => entry.method !== 'HEAD').map((entry) => `${entry.method} ${entry.key || ''} ${Object.keys(entry.query).join(',')}`.trim());
    expect(ops.slice(0, 5)).toEqual(['POST app/upload/big.bin uploads', 'PUT app/upload/big.bin partNumber,uploadId', 'PUT app/upload/big.bin partNumber,uploadId', 'PUT app/upload/big.bin partNumber,uploadId', 'POST app/upload/big.bin uploadId']);
    expect(s3.log.filter((entry) => entry.query.partNumber).map((entry) => entry.size)).toEqual([5, 5, 3]);
    const big = await Upload.objects.get({ key: 'big.bin' });
    expect([await big.content.text(), big.size, big.etag]).toEqual(['0123456789abc', 13, expect.stringMatching(/-3$/)]);
    s3.log.length = 0;
    await Upload.objects.create({ key: 'small.txt', content: 'tiny' });
    expect(s3.log.filter((entry) => entry.method === 'PUT').length).toBe(1);
    expect([...s3.buckets.get(`b${count}`).keys()].sort()).toEqual(['app/upload/big.bin', 'app/upload/small.txt']);
  });

  it('an upload whose stream fails is aborted: no object, no parts left', async () => {
    await open({ partSize: 5, allowSmallParts: true });
    let sent = 0;
    const failing = new Readable({
      read() {
        sent += 1;
        if (sent <= 3) this.push(Buffer.from('12345'));
        else this.destroy(new Error('the client went away'));
      },
    });
    await expect(Upload.objects.create({ key: 'broken', content: failing })).rejects.toThrow('the client went away');
    expect(s3.log.some((entry) => entry.method === 'DELETE' && entry.query.uploadId)).toBe(true);
    expect(s3.uploads.size).toBe(0);
    expect(await Upload.objects.filter({ key: 'broken' }).count()).toBe(0);
  });

  it('metadata changed alone is a copy of the object on itself (its body not sent); keys of every character', async () => {
    await open();
    const key = 'dir/a b+c%d&é?#ünï.txt';
    await Upload.objects.create({ key, content: 'body', owner: 'ada' });
    expect(await Upload.objects.filter({ key__startswith: 'dir/' }).valuesList('key', { flat: true })).toEqual([key]);
    const found = await Upload.objects.get({ key });
    s3.log.length = 0;
    found.owner = 'grace';
    await found.save();
    const writes = s3.log.filter((entry) => entry.method === 'PUT');
    expect(writes.map((entry) => [entry.size, entry.headers['x-amz-copy-source'] !== undefined, entry.headers['x-amz-metadata-directive']])).toEqual([[0, true, 'REPLACE']]);
    const again = await Upload.objects.get({ key });
    expect([again.owner, await again.content.text(), again.contentType]).toEqual(['grace', 'body', 'text/plain; charset=utf-8']);
    // The metadata as S3 keeps it: one header, base64 of its JSON.
    const stored = s3.buckets.get(`b${count}`).get(`upload/${key}`);
    expect(JSON.parse(Buffer.from(stored.meta['x-amz-meta-xufa'], 'base64url').toString())).toEqual({ owner: 'grace' });
  });

  it('url(): signed (it reads the object, until it is changed), or public', async () => {
    await open();
    await Upload.objects.create({ key: 'a/doc.pdf', content: Buffer.from('%PDF') });
    const url = await (await Upload.objects.get({ key: 'a/doc.pdf' })).content.url({ expiresIn: '10m' });
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('600');
    const response = await fetch(url);
    expect([response.status, await response.text()]).toEqual([200, '%PDF']);
    const tampered = new URL(url);
    tampered.pathname = tampered.pathname.replace('doc', 'other');
    expect((await fetch(tampered)).status).toBe(403);
    await expect((await Upload.objects.get({ key: 'a/doc.pdf' })).content.url({ expiresIn: '8d' })).rejects.toThrow(/from 1 second to 7 days/);
    db.backend.publicUrl = 'https://cdn.example.com';
    expect(await (await Upload.objects.get({ key: 'a/doc.pdf' })).content.url()).toBe('https://cdn.example.com/upload/a/doc.pdf');
  });

  it('drop(): the objects of the table deleted in batches (the bucket stays)', async () => {
    await open();
    for (let i = 0; i < 5; i += 1) await Upload.objects.create({ key: `k${i}`, content: String(i) });
    s3.log.length = 0;
    await db.drop();
    expect(s3.log.filter((entry) => entry.method === 'POST' && 'delete' in entry.query).length).toBe(1);
    expect(s3.buckets.get(`b${count}`).size).toBe(0);
  });

  it('errors: of S3 (with its code), of the options', async () => {
    await open();
    const wrong = new Database({ backend: 's3', bucket: `b${count}`, endpoint: s3.endpoint, credentials: { accessKeyId: s3.credentials.accessKeyId, secretAccessKey: 'wrong' } }).register(makeModel());
    const error = await wrong.backend.storeHead('upload', 'x').catch((err) => err);
    expect(error).toBeInstanceOf(S3Error);
    const listing = await (async () => {
      for await (const item of wrong.backend.storeList('upload', '')) return item;
      return null;
    })().catch((err) => err);
    expect([listing.status, listing.s3Code]).toEqual([403, 'SignatureDoesNotMatch']);
    expect(() => new S3Backend({})).toThrow(/needs a bucket/);
    expect(() => new S3Backend({ bucket: 'b', credentials: {} })).toThrow(/needs credentials/);
    expect(() => new S3Backend({ bucket: 'b', credentials: s3.credentials, partSize: 1024 })).toThrow(/at least 5 MiB/);
  });

  it('a session token is sent, and signed', async () => {
    await open({ credentials: { ...s3.credentials, sessionToken: 'session-1' } });
    await Upload.objects.create({ key: 'x', content: 'y' });
    const put = s3.log.find((entry) => entry.method === 'PUT');
    expect(put.headers['x-amz-security-token']).toBe('session-1');
    expect(put.headers.authorization).toContain('x-amz-security-token');
  });

  it('the URLs of AWS: the bucket in the host (or in the path, forcePathStyle)', () => {
    const credentials = EXAMPLE;
    const aws = new S3Backend({ bucket: 'my-bucket', region: 'eu-west-1', credentials });
    expect(aws.url('upload/a b.txt').toString()).toBe('https://my-bucket.s3.eu-west-1.amazonaws.com/upload/a%20b.txt');
    expect(aws.url(null, { 'list-type': '2' }).toString()).toBe('https://my-bucket.s3.eu-west-1.amazonaws.com/?list-type=2');
    const path = new S3Backend({ bucket: 'my-bucket', region: 'eu-west-1', credentials, forcePathStyle: true });
    expect(path.url('k').toString()).toBe('https://s3.eu-west-1.amazonaws.com/my-bucket/k');
  });
});

const REAL = process.env.XUFA_S3_URL;
(REAL ? describe : describe.skip)('s3 backend against XUFA_S3_URL', () => {
  it('writes, lists, reads, changes, signs and deletes objects', async () => {
    const url = new URL(REAL);
    const Upload = makeModel();
    const db = new Database({
      backend: 's3',
      endpoint: `${url.protocol}//${url.host}`,
      bucket: url.pathname.slice(1),
      region: url.searchParams.get('region') || 'us-east-1',
      credentials: { accessKeyId: decodeURIComponent(url.username), secretAccessKey: decodeURIComponent(url.password) },
      prefix: `xufa-test-${Date.now()}/`,
      createBucket: true,
      partSize: 5 * 1024 * 1024, // the stream of 6 MiB in two parts: a multipart upload
    }).register(Upload);
    await db.connect();
    await db.sync();
    try {
      await Upload.objects.create({ key: 'a/1.txt', content: 'one', owner: 'ada' });
      await Upload.objects.create({ key: 'a/2 é.bin', content: Readable.from([Buffer.alloc(6 * 1024 * 1024, 1), Buffer.from('end')]) });
      expect(await Upload.objects.filter({ key__startswith: 'a/' }).orderBy('key').valuesList('key', { flat: true })).toEqual(['a/1.txt', 'a/2 é.bin']);
      const one = await Upload.objects.get({ key: 'a/1.txt' });
      one.owner = 'grace';
      await one.save();
      expect((await Upload.objects.get({ key: 'a/1.txt' })).owner).toBe('grace');
      expect((await Upload.objects.get({ key: 'a/2 é.bin' })).size).toBe(6 * 1024 * 1024 + 3);
      expect(await (await fetch(await one.content.url())).text()).toBe('one');
    } finally {
      await db.drop();
      await db.close();
    }
  });
});
