// S3Backend ('s3'): a store of objects of the API of S3: AWS, and those that speak it (Cloudflare R2, MinIO, Backblaze
// B2, Wasabi, DigitalOcean Spaces, Alibaba OSS...), with fetch and SigV4 signatures of its own (no SDK).
//
//   new Database({ backend: 's3', bucket: 'uploads', region: 'eu-west-1' })   // credentials of AWS_* variables
//   new Database({ backend: 's3', bucket: 'uploads', endpoint: 'http://localhost:9000', credentials: { ... } })
//
// The objects of a model are in its bucket under <prefix><table>/ (the key of an object is its key there). Options:
// bucket (required), region (AWS_REGION, or us-east-1), endpoint (of a store that is not AWS: then the bucket is in
// the path; forcePathStyle: true for AWS too), credentials ({ accessKeyId, secretAccessKey, sessionToken }, or the
// variables AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN), prefix (''), partSize (bytes of each part of
// the uploads of streams: 8 MiB, at least 5 MiB), publicUrl (a URL where the objects are public, as a CDN: url() gives
// it instead of a signed URL), createBucket (sync() makes the bucket when it is not there), fetch (another fetch).
//
// Bodies of a known size (Buffers, strings) up to partSize are one PUT; streams are sent in parts (a multipart upload,
// aborted when it fails), so their size need not be known and no more than a part is kept in memory. The metadata is
// one header (x-amz-meta-xufa: base64 of its JSON, at most 2 KB as S3 allows); changing it alone copies the object on
// itself (its body is not sent again). url() of a body is a signed URL of GET (expiresIn: '15m' by default, at most
// 7 days).
const { Readable } = require('node:stream');
const crypto = require('node:crypto');
const { BlobBackend } = require('./base');
const { sign, presign, encode, sha256, EMPTY_HASH, UNSIGNED } = require('./sigv4');
const { BackendError } = require('../../errors');
const { seconds } = require('../../duration');

const MIB = 1024 * 1024;
const META = 'x-amz-meta-xufa';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, name) => {
    if (name[0] === '#')
      return String.fromCodePoint(
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      );
    return ENTITIES[name.toLowerCase()];
  });
const tag = (xml, name) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? unescapeXml(match[1]) : null;
};
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
const escapeXml = (text) =>
  text.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[c]};`);

class S3Error extends BackendError {
  constructor(status, code, message, request) {
    super(`S3 ${request}: ${status} ${code || ''}${message ? ` (${message})` : ''}`.trim());
    this.status = status;
    this.s3Code = code;
  }
}

class S3Backend extends BlobBackend {
  constructor(options = {}) {
    super(options);
    if (typeof options.bucket !== 'string' || options.bucket === '')
      throw new BackendError('The s3 backend needs a bucket');
    this.bucket = options.bucket;
    this.region = options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const credentials = options.credentials || {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    };
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new BackendError(
        'The s3 backend needs credentials (accessKeyId and secretAccessKey, or AWS_ACCESS_KEY_ID...)'
      );
    }
    this.credentials = credentials;
    this.pathStyle = Boolean(options.endpoint) || Boolean(options.forcePathStyle);
    const endpoint = options.endpoint || `https://s3.${this.region}.amazonaws.com`;
    this.endpoint = new URL(endpoint);
    this.prefix = options.prefix || '';
    this.partSize = options.partSize === undefined ? 8 * MIB : options.partSize;
    if (!(this.partSize >= 5 * MIB) && !options.allowSmallParts) {
      throw new BackendError('partSize of the s3 backend is at least 5 MiB (S3 refuses smaller parts)');
    }
    this.publicUrl = options.publicUrl ? String(options.publicUrl).replace(/\/$/, '') : null;
    this.createBucket = Boolean(options.createBucket);
    this.fetch = options.fetch || globalThis.fetch;
  }

  get name() {
    return 's3';
  }

  checkKey(key) {
    if (Buffer.byteLength(key) > 900)
      throw new BackendError('The key of an object of the s3 backend is at most 900 bytes');
  }

  objectKey(table, key) {
    return `${this.prefix}${table}/${key}`;
  }

  // The URL of the bucket, or of an object of it, with a query.
  url(objectKey = null, query = {}) {
    const base = new URL(this.endpoint);
    let pathname = base.pathname.replace(/\/$/, '');
    if (this.pathStyle) pathname += `/${encode(this.bucket)}`;
    else base.host = `${this.bucket}.${base.host}`;
    if (objectKey !== null) pathname += `/${encode(objectKey, true)}`;
    base.pathname = pathname || '/';
    if (objectKey === null && !this.pathStyle) base.pathname = '/';
    for (const [name, value] of Object.entries(query)) base.searchParams.set(name, value);
    return base;
  }

  // A signed request: its response (errors thrown, but the statuses of `ok`).
  async request(method, url, { headers = {}, body = null, payloadHash = null, ok = [] } = {}) {
    const hash = payloadHash || (body ? sha256(body) : EMPTY_HASH);
    const signed = sign({
      method,
      url,
      headers,
      payloadHash: hash,
      region: this.region,
      credentials: this.credentials,
    });
    const init = { method, headers: signed };
    if (body !== null) init.body = body;
    const response = await this.fetch(url, init);
    if (response.ok || ok.includes(response.status)) return response;
    const text = method === 'HEAD' ? '' : await response.text().catch(() => '');
    throw new S3Error(response.status, tag(text, 'Code'), tag(text, 'Message'), `${method} ${url.pathname}`);
  }

  static metaHeaders(contentType, metadata) {
    const headers = {};
    if (contentType) headers['content-type'] = contentType;
    if (metadata && Object.keys(metadata).length) {
      headers[META] = Buffer.from(JSON.stringify(metadata)).toString('base64url');
    }
    return headers;
  }

  static infoOf(headers) {
    return {
      size: Number(headers.get('content-length')),
      etag: (headers.get('etag') || '').replace(/"/g, ''),
      updatedAt: headers.get('last-modified') ? new Date(headers.get('last-modified')) : null,
    };
  }

  async storePut(table, key, body, { contentType, metadata }) {
    const objectKey = this.objectKey(table, key);
    const headers = S3Backend.metaHeaders(contentType, metadata);
    if (Buffer.isBuffer(body) && body.length <= this.partSize) {
      await this.request('PUT', this.url(objectKey), { headers, body });
    } else {
      await this.upload(objectKey, Buffer.isBuffer(body) ? Readable.from([body]) : body, headers);
    }
    const head = await this.storeHead(table, key);
    return head.info;
  }

  // The parts of a stream, of partSize bytes (the last one smaller).
  async *parts(stream) {
    let chunks = [];
    let size = 0;
    for await (const piece of stream) {
      let chunk = typeof piece === 'string' ? Buffer.from(piece) : Buffer.from(piece);
      while (size + chunk.length >= this.partSize) {
        const take = this.partSize - size;
        chunks.push(chunk.subarray(0, take));
        yield Buffer.concat(chunks);
        chunks = [];
        size = 0;
        chunk = chunk.subarray(take);
      }
      if (chunk.length) {
        chunks.push(chunk);
        size += chunk.length;
      }
    }
    if (size || chunks.length === 0) yield Buffer.concat(chunks);
  }

  // A stream as one PUT (when it is one part) or as a multipart upload (aborted when it fails).
  async upload(objectKey, stream, headers) {
    const iterator = this.parts(stream)[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = first.done ? { done: true } : await iterator.next();
    if (second.done) {
      await this.request('PUT', this.url(objectKey), { headers, body: first.done ? Buffer.alloc(0) : first.value });
      return;
    }
    const created = await this.request('POST', this.url(objectKey, { uploads: '' }), { headers });
    const uploadId = tag(await created.text(), 'UploadId');
    if (!uploadId) throw new BackendError(`S3 did not start the upload of ${objectKey}`);
    const etags = [];
    try {
      let number = 0;
      const send = async (part) => {
        number += 1;
        const response = await this.request('PUT', this.url(objectKey, { partNumber: String(number), uploadId }), {
          body: part,
        });
        etags.push(response.headers.get('etag'));
      };
      await send(first.value);
      await send(second.value);
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) await send(next.value);
      const xml = `<CompleteMultipartUpload>${etags.map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${escapeXml(etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const completed = await this.request('POST', this.url(objectKey, { uploadId }), { body: Buffer.from(xml) });
      // S3 can answer 200 with an error in the body.
      const text = await completed.text();
      if (/<Error>/.test(text)) throw new S3Error(200, tag(text, 'Code'), tag(text, 'Message'), `POST ${objectKey}`);
    } catch (err) {
      await this.request('DELETE', this.url(objectKey, { uploadId }), { ok: [404] }).catch(() => {});
      throw err;
    }
  }

  async storeRead(table, key) {
    const response = await this.request('GET', this.url(this.objectKey(table, key)), { ok: [404] });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    return Readable.fromWeb(response.body);
  }

  async storeHead(table, key) {
    const response = await this.request('HEAD', this.url(this.objectKey(table, key)), { ok: [404] });
    if (response.status === 404) return null;
    const encoded = response.headers.get(META);
    let metadata = {};
    if (encoded) {
      try {
        metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch {
        metadata = {};
      }
    }
    return { info: S3Backend.infoOf(response.headers), contentType: response.headers.get('content-type'), metadata };
  }

  async *storeList(table, prefix) {
    const base = this.objectKey(table, '');
    let token = null;
    do {
      const query = { 'list-type': '2', prefix: `${base}${prefix}`, 'encoding-type': 'url' };
      if (token) query['continuation-token'] = token;
      const response = await this.request('GET', this.url(null, query));
      const xml = await response.text();
      for (const item of tags(xml, 'Contents')) {
        // encoding-type=url is form encoding: a space is +, a + is %2B.
        const full = decodeURIComponent(tag(item, 'Key').replace(/\+/g, ' '));
        if (!full.startsWith(base)) continue;
        yield {
          key: full.slice(base.length),
          info: {
            size: Number(tag(item, 'Size')),
            etag: (tag(item, 'ETag') || '').replace(/"/g, ''),
            updatedAt: new Date(tag(item, 'LastModified')),
          },
        };
      }
      token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null;
    } while (token);
  }

  // The metadata of an object, changed by copying it on itself (its body stays in S3).
  async storeSetMeta(table, key, { contentType, metadata }) {
    const objectKey = this.objectKey(table, key);
    let type = contentType;
    if (type === undefined) {
      const head = await this.storeHead(table, key);
      type = head ? head.contentType : null;
    }
    await this.request('PUT', this.url(objectKey), {
      headers: {
        ...S3Backend.metaHeaders(type, metadata),
        'x-amz-copy-source': `/${encode(this.bucket)}/${encode(objectKey, true)}`,
        'x-amz-metadata-directive': 'REPLACE',
      },
    });
  }

  async storeDelete(table, key) {
    await this.request('DELETE', this.url(this.objectKey(table, key)), { ok: [404] });
    return true;
  }

  async storeCreate() {
    if (!this.createBucket) return;
    const exists = await this.request('HEAD', this.url(), { ok: [404, 403] });
    if (exists.status === 200) return;
    const body =
      this.region === 'us-east-1'
        ? null
        : Buffer.from(
            `<CreateBucketConfiguration><LocationConstraint>${this.region}</LocationConstraint></CreateBucketConfiguration>`
          );
    await this.request('PUT', this.url(), { body, ok: [409] });
  }

  // Deletes every object of a table (the bucket stays), 1000 at a time.
  async storeDrop(table) {
    let batch = [];
    const flush = async () => {
      const xml = `<Delete><Quiet>true</Quiet>${batch.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('')}</Delete>`;
      const body = Buffer.from(xml);
      await this.request('POST', this.url(null, { delete: '' }), {
        body,
        headers: { 'content-md5': crypto.createHash('md5').update(body).digest('base64') },
      });
      batch = [];
    };
    for await (const { key } of this.storeList(table, '')) {
      batch.push(this.objectKey(table, key));
      if (batch.length === 1000) await flush();
    }
    if (batch.length) await flush();
  }

  // A signed URL of GET (or the public URL, with publicUrl).
  async storeUrl(table, key, options = {}) {
    const objectKey = this.objectKey(table, key);
    if (this.publicUrl) return `${this.publicUrl}/${encode(objectKey, true)}`;
    const expiresIn = options.expiresIn === undefined ? 900 : seconds(options.expiresIn);
    if (!(expiresIn >= 1 && expiresIn <= 604800))
      throw new BackendError('expiresIn of an URL of S3 is from 1 second to 7 days');
    return presign({ url: this.url(objectKey), region: this.region, credentials: this.credentials, expiresIn });
  }
}

S3Backend.UNSIGNED = UNSIGNED;

module.exports = { S3Backend, S3Error };
