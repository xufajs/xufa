// A server of the API of Azure Blob for the tests (as Azurite: http://host:port/<account>/<container>/<blob>):
// containers, block blobs with metadata (Put Blob, Put Block, Put Block List), listings in pages of `page` blobs,
// metadata and properties set apart, and SAS of reading. Every request has to be signed with Shared Key (the signature
// of the request as it arrives), or carry a SAS; conditional writes (If-None-Match: *) are refused when the blob is
// there; what it did is in `log`.
const http = require('node:http');
const { sharedKey, blobSas } = require('../lib/backends/blob/azure');

const xml = (body) => `<?xml version="1.0" encoding="utf-8"?>${body}`;
const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function fakeAzure({ account = 'devaccount', accountKey = Buffer.from('a key of the fake account').toString('base64'), page = 2 } = {}) {
  const containers = new Map(); // name -> Map(blob -> { body, contentType, meta, etag, updatedAt })
  const blocks = new Map(); // `${container}/${blob}` -> Map(id -> Buffer)
  const log = [];
  let next = 0;

  const fail = (res, status, code, message = code) => {
    res.writeHead(status, { 'content-type': 'application/xml', 'x-ms-error-code': code });
    res.end(xml(`<Error><Code>${code}</Code><Message>${escape(message)}</Message></Error>`));
  };

  // Shared Key computed from what arrived; or a SAS of reading one blob.
  function verify(req, url, container, blob) {
    const sig = url.searchParams.get('sig');
    if (sig) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return 'a SAS of reading';
      const expiresAt = new Date(url.searchParams.get('se'));
      if (Date.now() > expiresAt.getTime()) return 'expired';
      const expected = new URLSearchParams(
        blobSas({ account, accountKey, container, blob, permissions: url.searchParams.get('sp'), expiresAt, version: url.searchParams.get('sv') })
      ).get('sig');
      return expected === sig ? null : 'bad SAS signature';
    }
    const match = /^SharedKey ([^:]+):(.+)$/.exec(req.headers.authorization || '');
    if (!match) return 'no signature';
    if (match[1] !== account) return 'unknown account';
    if (!req.headers['x-ms-date'] || !req.headers['x-ms-version']) return 'no x-ms-date or x-ms-version';
    const expected = sharedKey({ method: req.method, url, headers: req.headers, account, accountKey });
    return expected === req.headers.authorization ? null : 'bad signature';
  }

  const etag = () => `0x8D${(next += 1).toString(16).toUpperCase().padStart(13, '0')}`;
  const metaOf = (req) => Object.fromEntries(Object.entries(req.headers).filter(([name]) => name.startsWith('x-ms-meta-')));
  const blobHeaders = (object) => ({
    'content-length': String(object.body.length),
    'content-type': object.contentType || 'application/octet-stream',
    etag: `"${object.etag}"`,
    'last-modified': object.updatedAt.toUTCString(),
    'x-ms-blob-type': 'BlockBlob',
    ...object.meta,
  });
  function store(objects, name, body, req) {
    objects.set(name, {
      body,
      contentType: req.headers['x-ms-blob-content-type'] || req.headers['content-type'] || null,
      meta: metaOf(req),
      etag: etag(),
      updatedAt: new Date(),
    });
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const [, accountName, containerName, ...rest] = url.pathname.split('/');
      const container = decodeURIComponent(containerName || '');
      const blob = rest.length ? decodeURIComponent(rest.join('/')) : null;
      const q = url.searchParams;
      log.push({ method: req.method, container, blob, query: Object.fromEntries(q), size: body.length, headers: req.headers });
      if (accountName !== account) return fail(res, 400, 'InvalidUri');
      const problem = verify(req, url, container, blob);
      if (problem) return fail(res, 403, 'AuthenticationFailed', problem);
      const objects = containers.get(container);
      if (blob === null) {
        if (q.get('restype') !== 'container') return fail(res, 400, 'InvalidQueryParameterValue');
        if (req.method === 'PUT') {
          if (objects) return fail(res, 409, 'ContainerAlreadyExists');
          containers.set(container, new Map());
          res.writeHead(201);
          return res.end();
        }
        if (!objects) return fail(res, 404, 'ContainerNotFound');
        if (req.method === 'GET' && q.get('comp') === 'list') {
          const prefix = q.get('prefix') || '';
          const names = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
          const start = q.get('marker') ? names.indexOf(q.get('marker')) : 0;
          const shown = names.slice(start, start + page);
          const marker = start + page < names.length ? names[start + page] : '';
          const items = shown
            .map((name) => {
              const object = objects.get(name);
              return `<Blob><Name>${escape(name)}</Name><Properties><Last-Modified>${object.updatedAt.toUTCString()}</Last-Modified><Etag>${object.etag}</Etag><Content-Length>${object.body.length}</Content-Length><Content-Type>${escape(object.contentType || '')}</Content-Type><BlobType>BlockBlob</BlobType></Properties></Blob>`;
            })
            .join('');
          res.writeHead(200, { 'content-type': 'application/xml' });
          return res.end(xml(`<EnumerationResults><Prefix>${escape(prefix)}</Prefix><Blobs>${items}</Blobs>${marker ? `<NextMarker>${escape(marker)}</NextMarker>` : '<NextMarker/>'}</EnumerationResults>`));
        }
        return fail(res, 400, 'UnsupportedHttpVerb');
      }
      if (!objects) return fail(res, 404, 'ContainerNotFound');
      const existing = objects.get(blob);
      const refused = req.headers['if-none-match'] === '*' && existing;
      const comp = q.get('comp');
      if (req.method === 'PUT' && comp === 'block') {
        const id = q.get('blockid');
        const key = `${container}/${blob}`;
        if (!blocks.has(key)) blocks.set(key, new Map());
        blocks.get(key).set(id, body);
        res.writeHead(201);
        return res.end();
      }
      if (req.method === 'PUT' && comp === 'blocklist') {
        if (refused) return fail(res, 409, 'BlobAlreadyExists');
        const uncommitted = blocks.get(`${container}/${blob}`) || new Map();
        const ids = [...body.toString().matchAll(/<Latest>([^<]*)<\/Latest>/g)].map((m) => m[1]);
        if (ids.some((id) => !uncommitted.has(id))) return fail(res, 400, 'InvalidBlockList');
        store(objects, blob, Buffer.concat(ids.map((id) => uncommitted.get(id))), req);
        blocks.delete(`${container}/${blob}`);
        res.writeHead(201, { etag: `"${objects.get(blob).etag}"` });
        return res.end();
      }
      if (req.method === 'PUT' && (comp === 'metadata' || comp === 'properties')) {
        if (!existing) return fail(res, 404, 'BlobNotFound');
        if (comp === 'metadata') existing.meta = metaOf(req);
        else existing.contentType = req.headers['x-ms-blob-content-type'] || null;
        existing.etag = etag();
        res.writeHead(200);
        return res.end();
      }
      if (req.method === 'PUT') {
        if (req.headers['x-ms-blob-type'] !== 'BlockBlob') return fail(res, 400, 'MissingRequiredHeader');
        if (refused) return fail(res, 409, 'BlobAlreadyExists');
        store(objects, blob, body, req);
        res.writeHead(201, { etag: `"${objects.get(blob).etag}"` });
        return res.end();
      }
      if (!existing) return fail(res, 404, 'BlobNotFound');
      if (req.method === 'HEAD') {
        res.writeHead(200, blobHeaders(existing));
        return res.end();
      }
      if (req.method === 'GET') {
        res.writeHead(200, blobHeaders(existing));
        return res.end(existing.body);
      }
      if (req.method === 'DELETE') {
        objects.delete(blob);
        res.writeHead(202);
        return res.end();
      }
      return fail(res, 400, 'UnsupportedHttpVerb');
    });
  });

  const fake = {
    containers,
    blocks,
    log,
    account,
    accountKey,
    endpoint: null,
    connectionString: null,
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      fake.endpoint = `http://127.0.0.1:${server.address().port}/${account}`;
      fake.connectionString = `DefaultEndpointsProtocol=http;AccountName=${account};AccountKey=${accountKey};BlobEndpoint=${fake.endpoint};`;
      return fake;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
  return fake;
}

module.exports = { fakeAzure };
