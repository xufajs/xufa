// A server of the API of S3 for the tests (path style): buckets, objects with metadata, listings in pages of `page`
// keys, copies, multipart uploads, batch deletes and URLs signed in their query. Every request has to be signed
// (SigV4: the signature of the request as it arrives, and the hash of its body); what it did is in `log`.
const http = require('node:http');
const crypto = require('node:crypto');
const { signature, sha256, UNSIGNED } = require('../lib/backends/blob/sigv4');

const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?>${body}`;
const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function fakeS3({ accessKeyId = 'AKIDTEST', secretAccessKey = 'secret/key', region = 'us-east-1', page = 2 } = {}) {
  const buckets = new Map(); // name -> Map(key -> object)
  const uploads = new Map(); // id -> { bucket, key, parts: Map, headers }
  const log = [];
  let next = 0;

  const fail = (res, status, code, message = code) => {
    res.writeHead(status, { 'content-type': 'application/xml' });
    res.end(xml(`<Error><Code>${code}</Code><Message>${escape(message)}</Message></Error>`));
  };

  // The signature of the request, as the server computes it from what arrived.
  function verify(req, url, body) {
    const presigned = url.searchParams.get('X-Amz-Signature');
    if (presigned) {
      const query = new URL(url);
      query.searchParams.delete('X-Amz-Signature');
      const amzDate = query.searchParams.get('X-Amz-Date');
      const date = new Date(`${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`);
      if (Date.now() > date.getTime() + Number(query.searchParams.get('X-Amz-Expires')) * 1000) return 'expired';
      const { signed } = signature({ method: req.method, url: query, headers: { host: req.headers.host }, payloadHash: UNSIGNED, region, service: 's3', credentials: { accessKeyId, secretAccessKey }, date });
      return signed === presigned ? null : 'bad presigned signature';
    }
    const auth = req.headers.authorization || '';
    const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/\d{8}\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
    if (!match) return 'no signature';
    if (match[1] !== accessKeyId) return 'unknown access key';
    const payloadHash = req.headers['x-amz-content-sha256'];
    if (payloadHash !== UNSIGNED && payloadHash !== sha256(body)) return 'the hash of the body is not its hash';
    const headers = {};
    for (const name of match[3].split(';')) headers[name] = req.headers[name];
    const amzDate = req.headers['x-amz-date'];
    const date = new Date(`${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`);
    const { signed } = signature({ method: req.method, url, headers, payloadHash, region: match[2], service: 's3', credentials: { accessKeyId, secretAccessKey }, date });
    if (!match[3].split(';').includes('host')) return 'host is not signed';
    return signed === match[4] ? null : 'bad signature';
  }

  const objectHeaders = (object) => ({
    'content-length': String(object.body.length),
    'content-type': object.contentType || 'binary/octet-stream',
    etag: `"${object.etag}"`,
    'last-modified': object.updatedAt.toUTCString(),
    ...object.meta,
  });
  const metaOf = (req) => Object.fromEntries(Object.entries(req.headers).filter(([name]) => name.startsWith('x-amz-meta-')));

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const problem = verify(req, url, body);
      const [, bucketName, ...rest] = url.pathname.split('/');
      const bucket = decodeURIComponent(bucketName || '');
      const key = rest.length ? decodeURIComponent(rest.join('/')) : null;
      const q = url.searchParams;
      log.push({ method: req.method, bucket, key, query: Object.fromEntries(q), size: body.length, headers: req.headers });
      if (problem) return fail(res, 403, 'SignatureDoesNotMatch', problem);
      const objects = buckets.get(bucket);
      if (key === null) {
        if (req.method === 'PUT') {
          if (objects) return fail(res, 409, 'BucketAlreadyOwnedByYou');
          buckets.set(bucket, new Map());
          return res.end();
        }
        if (!objects) return fail(res, 404, 'NoSuchBucket');
        if (req.method === 'HEAD') return res.end();
        if (req.method === 'POST' && q.has('delete')) {
          if (req.headers['content-md5'] !== crypto.createHash('md5').update(body).digest('base64')) return fail(res, 400, 'BadDigest');
          for (const [, item] of body.toString().matchAll(/<Key>([\s\S]*?)<\/Key>/g)) objects.delete(item.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
          return res.end(xml('<DeleteResult/>'));
        }
        if (req.method === 'GET' && q.get('list-type') === '2') {
          const prefix = q.get('prefix') || '';
          const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
          const start = q.has('continuation-token') ? Number(q.get('continuation-token')) : 0;
          const slice = keys.slice(start, start + page);
          const truncated = start + page < keys.length;
          // As S3 does: form encoding (a space is +).
          const encodeKey = (k) => (q.get('encoding-type') === 'url' ? encodeURIComponent(k).replace(/%20/g, '+') : escape(k));
          const contents = slice.map((k) => {
            const o = objects.get(k);
            return `<Contents><Key>${encodeKey(k)}</Key><LastModified>${o.updatedAt.toISOString()}</LastModified><ETag>&quot;${o.etag}&quot;</ETag><Size>${o.body.length}</Size></Contents>`;
          });
          return res.end(xml(`<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${contents.join('')}${truncated ? `<NextContinuationToken>${start + page}</NextContinuationToken>` : ''}</ListBucketResult>`));
        }
        return fail(res, 400, 'NotImplemented');
      }
      if (!objects) return fail(res, 404, 'NoSuchBucket');
      if (req.method === 'POST' && q.has('uploads')) {
        next += 1;
        uploads.set(String(next), { bucket, key, parts: new Map(), contentType: req.headers['content-type'], meta: metaOf(req) });
        return res.end(xml(`<InitiateMultipartUploadResult><UploadId>${next}</UploadId></InitiateMultipartUploadResult>`));
      }
      if (q.has('uploadId')) {
        const upload = uploads.get(q.get('uploadId'));
        if (!upload) return fail(res, 404, 'NoSuchUpload');
        if (req.method === 'PUT') {
          const etag = crypto.createHash('md5').update(body).digest('hex');
          upload.parts.set(Number(q.get('partNumber')), { body, etag });
          res.writeHead(200, { etag: `"${etag}"` });
          return res.end();
        }
        if (req.method === 'DELETE') {
          uploads.delete(q.get('uploadId'));
          upload.aborted = true;
          res.writeHead(204);
          return res.end();
        }
        if (req.method === 'POST') {
          const numbers = [...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
          const parts = numbers.map((n) => upload.parts.get(n));
          if (parts.some((part) => !part)) return fail(res, 400, 'InvalidPart');
          // A conditional write (If-None-Match: *): refused when the object is there.
          if (req.headers['if-none-match'] === '*' && objects.has(key)) return fail(res, 412, 'PreconditionFailed');
          const whole = Buffer.concat(parts.map((part) => part.body));
          objects.set(key, { body: whole, contentType: upload.contentType, meta: upload.meta, etag: `${crypto.createHash('md5').update(whole).digest('hex')}-${parts.length}`, updatedAt: new Date() });
          uploads.delete(q.get('uploadId'));
          return res.end(xml('<CompleteMultipartUploadResult/>'));
        }
      }
      if (req.method === 'PUT') {
        const source = req.headers['x-amz-copy-source'];
        if (source) {
          const [, from, ...path] = source.split('/');
          const original = buckets.get(decodeURIComponent(from))?.get(decodeURIComponent(path.join('/')));
          if (!original) return fail(res, 404, 'NoSuchKey');
          const replace = req.headers['x-amz-metadata-directive'] === 'REPLACE';
          objects.set(key, { ...original, body: original.body, contentType: replace ? req.headers['content-type'] : original.contentType, meta: replace ? metaOf(req) : original.meta, updatedAt: new Date() });
          return res.end(xml('<CopyObjectResult/>'));
        }
        if (req.headers['if-none-match'] === '*' && objects.has(key)) return fail(res, 412, 'PreconditionFailed');
        const etag = crypto.createHash('md5').update(body).digest('hex');
        objects.set(key, { body, contentType: req.headers['content-type'], meta: metaOf(req), etag, updatedAt: new Date() });
        res.writeHead(200, { etag: `"${etag}"` });
        return res.end();
      }
      const object = objects.get(key);
      if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204);
        return res.end();
      }
      if (!object) return req.method === 'HEAD' ? (res.writeHead(404), res.end()) : fail(res, 404, 'NoSuchKey');
      res.writeHead(200, objectHeaders(object));
      return res.end(req.method === 'HEAD' ? undefined : object.body);
    });
  });

  return {
    log,
    buckets,
    uploads,
    credentials: { accessKeyId, secretAccessKey },
    region,
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      this.endpoint = `http://127.0.0.1:${server.address().port}`;
      return this;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { fakeS3 };
