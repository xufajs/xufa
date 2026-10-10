// AzureBackend ('azure-blob'): Azure Blob Storage (and Azurite, its emulator), with node:http(s) and the signatures of
// Shared Key of its own (no SDK).
//
//   new Database({ backend: 'azure-blob', container: 'uploads' })   // AZURE_STORAGE_CONNECTION_STRING, or
//                                                                   // AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY
//   new Database({ backend: 'azure-blob', container: 'uploads', account: 'myaccount', accountKey: '...' })
//   new Database({ backend: 'azure-blob', container: 'uploads', connectionString: 'UseDevelopmentStorage=true' })
//
// The objects of a model are in its container under <prefix><table>/ (the key of an object is its key there). Options:
// container (required), and the account as a connection string (connectionString, or the variable
// AZURE_STORAGE_CONNECTION_STRING), or account and accountKey (AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY), or account
// and sasToken (a SAS of the account or the container, instead of the key); endpoint (the URL of the blob service:
// https://<account>.blob.core.windows.net by default, Azurite's for UseDevelopmentStorage=true), prefix (''),
// blockSize (bytes of each block of the uploads of streams: 8 MiB), publicUrl (a URL where the objects are public, as a
// CDN: url() gives it instead of a SAS), createContainer (sync() makes the container when it is not there), fetch.
//
// Bodies of a known size up to blockSize are one Put Blob; streams are sent in blocks (Put Block, then Put Block List),
// so their size need not be known and no more than a block is kept in memory; blocks of an upload that fails are not
// committed, and Azure deletes them. The metadata is one header (x-ms-meta-xufa: base64 of its JSON, 8 KB at most as
// Azure allows); changing it does not send the body again. url() of a body is a SAS of reading it (expiresIn: '15m' by
// default), signed with the key (with a sasToken instead, the URL carries that token).
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { BlobBackend, exists } from './base.js';
import { encode } from './sigv4.js';
import { httpClient } from './http-client.js';
import { tag, tags } from './xml.js';
import { BackendError } from '../../errors.js';
import { seconds } from '../../duration.js';

const MIB = 1024 * 1024;
const VERSION = '2021-12-02';
const META = 'x-ms-meta-xufa';

// The account of Azurite (UseDevelopmentStorage=true): its name and key are public, the same everywhere.
const DEVELOPMENT = {
  account: 'devstoreaccount1',
  accountKey: 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
  endpoint: 'http://127.0.0.1:10000/devstoreaccount1',
};

class AzureError extends BackendError {
  constructor(status, code, message, request) {
    super(`Azure Blob ${request}: ${status} ${code || ''}${message ? ` (${message.split('\n')[0]})` : ''}`.trim());
    this.status = status;
    this.azureCode = code;
  }
}

// The parts of a connection string (Key=Value;...), as the options of the backend.
function parseConnectionString(text) {
  const parts = {};
  for (const item of text.split(';')) {
    const at = item.indexOf('=');
    if (at > 0) parts[item.slice(0, at).trim()] = item.slice(at + 1).trim();
  }
  if (/^true$/i.test(parts.UseDevelopmentStorage || '')) {
    const proxy = parts.DevelopmentStorageProxyUri;
    return {
      ...DEVELOPMENT,
      endpoint: proxy ? `${proxy.replace(/\/$/, '')}:10000/devstoreaccount1` : DEVELOPMENT.endpoint,
    };
  }
  const account = parts.AccountName;
  const protocol = parts.DefaultEndpointsProtocol || 'https';
  const endpoint =
    parts.BlobEndpoint ||
    (account ? `${protocol}://${account}.blob.${parts.EndpointSuffix || 'core.windows.net'}` : undefined);
  return { account, accountKey: parts.AccountKey, sasToken: parts.SharedAccessSignature, endpoint };
}

// The Authorization of Shared Key of a request: the headers given (names in lower case) and the URL.
function sharedKey({ method, url, headers, account, accountKey }) {
  const get = (name) => (headers[name] === undefined || headers[name] === null ? '' : String(headers[name]));
  const length = get('content-length') === '0' ? '' : get('content-length');
  const canonicalHeaders = Object.keys(headers)
    .filter((name) => name.startsWith('x-ms-'))
    .sort()
    .map((name) => `${name}:${String(headers[name]).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  let resource = `/${account}${url.pathname}`;
  const query = new Map();
  for (const [name, value] of url.searchParams) {
    const key = name.toLowerCase();
    query.set(key, [...(query.get(key) || []), value]);
  }
  for (const name of [...query.keys()].sort()) resource += `\n${name}:${query.get(name).sort().join(',')}`;
  const text = [
    method,
    get('content-encoding'),
    get('content-language'),
    length,
    get('content-md5'),
    get('content-type'),
    '', // Date: x-ms-date is signed instead
    get('if-modified-since'),
    get('if-match'),
    get('if-none-match'),
    get('if-unmodified-since'),
    get('range'),
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(`${text}\n${canonicalHeaders}${resource}`, 'utf8')
    .digest('base64');
  return `SharedKey ${account}:${signature}`;
}

// A SAS of the service for one blob (sr=b) with these permissions, until expiresAt: the query of its URL.
function blobSas({
  account,
  accountKey,
  container,
  blob,
  permissions = 'r',
  expiresAt,
  startsAt = null,
  version = VERSION,
}) {
  const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fields = {
    sp: permissions,
    st: startsAt ? iso(startsAt) : '',
    se: iso(expiresAt),
    resource: `/blob/${account}/${container}/${blob}`,
    si: '',
    sip: '',
    spr: '',
    sv: version,
    sr: 'b',
  };
  // The fields of version 2020-12-06 and later: those above, the snapshot time, the encryption scope and the five
  // headers of the response (rscc, rscd, rsce, rscl, rsct), empty.
  const text = [...Object.values(fields), '', '', '', '', '', '', ''].join('\n');
  const signature = crypto
    .createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(text, 'utf8')
    .digest('base64');
  const query = new URLSearchParams({ sv: version, se: fields.se, sr: 'b', sp: permissions });
  if (fields.st) query.set('st', fields.st);
  query.set('sig', signature);
  return query.toString();
}

class AzureBackend extends BlobBackend {
  constructor(options = {}) {
    super(options);
    if (typeof options.container !== 'string' || options.container === '')
      throw new BackendError('The azure-blob backend needs a container');
    this.container = options.container;
    const fromString =
      options.connectionString || (!options.account && process.env.AZURE_STORAGE_CONNECTION_STRING)
        ? parseConnectionString(options.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING)
        : {};
    this.account = options.account || fromString.account || process.env.AZURE_STORAGE_ACCOUNT;
    this.accountKey =
      options.accountKey || fromString.accountKey || (options.sasToken ? null : process.env.AZURE_STORAGE_KEY);
    this.sasToken = (options.sasToken || fromString.sasToken || '').replace(/^\?/, '') || null;
    if (!this.account) {
      throw new BackendError(
        'The azure-blob backend needs an account (a connectionString, account and accountKey, or AZURE_STORAGE_*)'
      );
    }
    if (!this.accountKey && !this.sasToken)
      throw new BackendError('The azure-blob backend needs the key of the account (accountKey) or a sasToken');
    this.endpoint = new URL(
      (options.endpoint || fromString.endpoint || `https://${this.account}.blob.core.windows.net`).replace(/\/$/, '')
    );
    this.prefix = options.prefix || '';
    this.blockSize = options.blockSize === undefined ? 8 * MIB : options.blockSize;
    if (!(this.blockSize >= 1 && this.blockSize <= 4000 * MIB))
      throw new BackendError('blockSize of the azure-blob backend is from 1 byte to 4000 MiB');
    this.publicUrl = options.publicUrl ? String(options.publicUrl).replace(/\/$/, '') : null;
    this.createContainer = Boolean(options.createContainer);
    this.fetch = options.fetch || httpClient();
  }

  get name() {
    return 'azure-blob';
  }

  async close() {
    if (typeof this.fetch.close === 'function') this.fetch.close();
  }

  checkKey(key) {
    if (Buffer.byteLength(key) > 900)
      throw new BackendError('The key of an object of the azure-blob backend is at most 900 bytes');
  }

  objectKey(table, key) {
    return `${this.prefix}${table}/${key}`;
  }

  // The URL of the container, or of a blob of it, with a query.
  url(objectKey = null, query = {}) {
    const base = new URL(this.endpoint);
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${encode(this.container)}${
      objectKey === null ? '' : `/${encode(objectKey, true)}`
    }`;
    for (const [name, value] of Object.entries(query)) base.searchParams.set(name, value);
    return base;
  }

  // A signed request (or one with the SAS): its response (errors thrown, but the statuses of `ok`). keep: the caller
  // reads the body of the answer; otherwise it is let go at once, so its connection serves the next request.
  async request(method, url, { headers = {}, body = null, ok = [], keep = false } = {}) {
    const all = { 'x-ms-date': new Date().toUTCString(), 'x-ms-version': VERSION, ...headers };
    if (body !== null) all['content-length'] = String(body.length);
    else if (method === 'PUT' || method === 'POST') all['content-length'] = '0';
    let target = url;
    if (this.accountKey) {
      all.authorization = sharedKey({ method, url, headers: all, account: this.account, accountKey: this.accountKey });
    } else {
      target = new URL(url);
      target.search = target.search ? `${target.search}&${this.sasToken}` : `?${this.sasToken}`;
    }
    const init = { method, headers: all };
    if (body !== null) init.body = body;
    const response = await this.fetch(target, init);
    if (response.ok || ok.includes(response.status)) {
      if (!keep && response.body) await response.body.cancel().catch(() => {});
      return response;
    }
    if (method === 'HEAD' && response.body) await response.body.cancel().catch(() => {});
    const text = method === 'HEAD' ? '' : await response.text().catch(() => '');
    throw new AzureError(
      response.status,
      tag(text, 'Code') || response.headers.get('x-ms-error-code'),
      tag(text, 'Message'),
      `${method} ${url.pathname}`
    );
  }

  static metaHeaders(contentType, metadata) {
    const headers = {};
    if (contentType) headers['x-ms-blob-content-type'] = contentType;
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

  // create: If-None-Match: *, which Azure refuses when the blob is there (409 BlobAlreadyExists, or 412), so two
  // creates of one key never both succeed.
  async storePut(table, key, body, { contentType, metadata, create = false }) {
    const objectKey = this.objectKey(table, key);
    const headers = AzureBackend.metaHeaders(contentType, metadata);
    const condition = create ? { 'if-none-match': '*' } : {};
    try {
      if (Buffer.isBuffer(body) && body.length <= this.blockSize) {
        await this.request('PUT', this.url(objectKey), {
          headers: { ...headers, ...condition, 'x-ms-blob-type': 'BlockBlob' },
          body,
        });
      } else {
        await this.upload(objectKey, Buffer.isBuffer(body) ? Readable.from([body]) : body, headers, condition);
      }
    } catch (err) {
      if (create && err instanceof AzureError && (err.status === 409 || err.status === 412)) throw exists(table, key);
      throw err;
    }
    const head = await this.storeHead(table, key);
    return head.info;
  }

  // The blocks of a stream, of blockSize bytes (the last one smaller).
  async *blocks(stream) {
    let chunks = [];
    let size = 0;
    for await (const piece of stream) {
      let chunk = Buffer.from(piece);
      while (size + chunk.length >= this.blockSize) {
        const take = this.blockSize - size;
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

  // A stream as one Put Blob (when it is one block) or as blocks and their list.
  async upload(objectKey, stream, headers, condition = {}) {
    const iterator = this.blocks(stream)[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = first.done ? { done: true } : await iterator.next();
    if (second.done) {
      await this.request('PUT', this.url(objectKey), {
        headers: { ...headers, ...condition, 'x-ms-blob-type': 'BlockBlob' },
        body: first.done ? Buffer.alloc(0) : first.value,
      });
      return;
    }
    // The ids of the blocks of a blob are of one length: an id of this upload and the number of the block.
    const upload = crypto.randomBytes(6).toString('hex');
    const ids = [];
    const send = async (block) => {
      const id = Buffer.from(`${upload}-${String(ids.length).padStart(6, '0')}`).toString('base64');
      ids.push(id);
      await this.request('PUT', this.url(objectKey, { comp: 'block', blockid: id }), { body: block });
    };
    await send(first.value);
    await send(second.value);
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) await send(next.value);
    const list = ids.map((id) => `<Latest>${id}</Latest>`).join('');
    const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${list}</BlockList>`;
    await this.request('PUT', this.url(objectKey, { comp: 'blocklist' }), {
      headers: { ...headers, ...condition },
      body: Buffer.from(xml),
    });
  }

  async storeRead(table, key) {
    const response = await this.request('GET', this.url(this.objectKey(table, key)), { ok: [404], keep: true });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    return response.stream || Readable.fromWeb(response.body);
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
    return { info: AzureBackend.infoOf(response.headers), contentType: response.headers.get('content-type'), metadata };
  }

  async *storeList(table, prefix) {
    const base = this.objectKey(table, '');
    let marker = null;
    do {
      const query = { restype: 'container', comp: 'list', prefix: `${base}${prefix}` };
      if (marker) query.marker = marker;
      const response = await this.request('GET', this.url(null, query), { keep: true });
      const xml = await response.text();
      for (const item of tags(xml, 'Blob')) {
        // A name with characters XML cannot carry comes percent-encoded (Encoded="true").
        const encoded = /<Name\s+Encoded="true"/i.test(item);
        const name = tag(item, 'Name');
        const full = encoded ? decodeURIComponent(name) : name;
        if (!full.startsWith(base)) continue;
        yield {
          key: full.slice(base.length),
          info: {
            size: Number(tag(item, 'Content-Length')),
            etag: (tag(item, 'Etag') || '').replace(/"/g, ''),
            updatedAt: new Date(tag(item, 'Last-Modified')),
          },
        };
      }
      marker = tag(xml, 'NextMarker') || null;
    } while (marker);
  }

  // The metadata of a blob (Set Blob Metadata), and its content type when it is given (Set Blob Properties, at the
  // same time: each one keeps what the other sets).
  async storeSetMeta(table, key, { contentType, metadata }) {
    const url = (comp) => this.url(this.objectKey(table, key), { comp });
    const writes = [this.request('PUT', url('metadata'), { headers: AzureBackend.metaHeaders(null, metadata) })];
    if (contentType !== undefined) {
      const headers = contentType ? { 'x-ms-blob-content-type': contentType } : {};
      writes.push(this.request('PUT', url('properties'), { headers }));
    }
    await Promise.all(writes);
  }

  async storeDelete(table, key) {
    await this.request('DELETE', this.url(this.objectKey(table, key)), { ok: [404] });
    return true;
  }

  async storeCreate() {
    if (!this.createContainer) return;
    await this.request('PUT', this.url(null, { restype: 'container' }), { ok: [409] });
  }

  // Deletes every blob of a table (the container stays), 16 at a time.
  async storeDrop(table) {
    let batch = [];
    const flush = async () => {
      await Promise.all(batch.map((key) => this.storeDelete(table, key)));
      batch = [];
    };
    for await (const { key } of this.storeList(table, '')) {
      batch.push(key);
      if (batch.length === 16) await flush();
    }
    await flush();
  }

  // A SAS of reading the blob (or the public URL, with publicUrl; the URL with the sasToken, without a key).
  async storeUrl(table, key, options = {}) {
    const objectKey = this.objectKey(table, key);
    if (this.publicUrl) return `${this.publicUrl}/${encode(objectKey, true)}`;
    const url = this.url(objectKey);
    if (!this.accountKey) return `${url}?${this.sasToken}`;
    const expiresIn = options.expiresIn === undefined ? 900 : seconds(options.expiresIn);
    if (!(expiresIn >= 1)) throw new BackendError('expiresIn of an URL of Azure Blob is 1 second or more');
    const sas = blobSas({
      account: this.account,
      accountKey: this.accountKey,
      container: this.container,
      blob: objectKey,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    return `${url}?${sas}`;
  }
}

export { AzureBackend, AzureError, sharedKey, blobSas, parseConnectionString, DEVELOPMENT };
