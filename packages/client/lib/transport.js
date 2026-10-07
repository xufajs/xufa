// The calls of a client over node:http and node:https (transport: 'http', the default), with connections kept for the
// next ones: a function of the shape of fetch (url, { method, headers, body, signal, redirect }) that gives what the
// client reads of an answer (status, statusText, ok, url, headers, text(), arrayBuffer(), body). Node's fetch costs
// more per call; the answers of 'response' and 'stream' (web streams) and bodies that are streams go through fetch all
// the same (see client.js). As fetch, it asks for compressed answers (gzip, deflate, br) and decompresses them. Through
// a proxy (the option proxy, a function of the URL: see proxy.js), https: servers are reached by tunnels (CONNECT) kept
// alive, and requests to http: servers go to the proxy with the whole URL.
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const { Readable, Transform, pipeline } = require('node:stream');
const { ReadableStream } = require('node:stream/web');

// What is asked for when the caller does not say (fetch asks the same), and how each is decompressed (off the main
// thread). Deflate is zlib's (RFC 1950), or raw as some servers send it: fetch takes both.
const ACCEPT_ENCODING = 'gzip, deflate, br';
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);
const DECODERS = {
  gzip: promisify(zlib.gunzip),
  'x-gzip': promisify(zlib.gunzip),
  deflate: (data) => (data.length > 0 && (data[0] & 0x0f) === 8 ? inflate(data) : inflateRaw(data)),
  br: promisify(zlib.brotliDecompress),
  ...(zlib.zstdDecompress ? { zstd: promisify(zlib.zstdDecompress) } : {}),
};

// Deflate in a stream: zlib's or raw, as its first byte says.
class DeflateDecoder extends Transform {
  _transform(chunk, encoding, callback) {
    if (!this.inner) {
      this.inner = (chunk[0] & 0x0f) === 8 ? zlib.createInflate() : zlib.createInflateRaw();
      this.inner.on('data', (data) => this.push(data));
      this.inner.on('error', (err) => this.destroy(err));
    }
    this.inner.write(chunk, () => callback());
  }

  _flush(callback) {
    if (!this.inner) {
      callback();
      return;
    }
    this.inner.once('end', () => callback());
    this.inner.end();
  }
}

const STREAM_DECODERS = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => new DeflateDecoder(),
  br: () => zlib.createBrotliDecompress(),
  ...(zlib.createZstdDecompress ? { zstd: () => zlib.createZstdDecompress() } : {}),
};

// The body as a Node stream, decoded as it comes (for responseType: 'stream'), as decode() does it for a whole one.
function decodeStream(res) {
  const encoding = res.headers['content-encoding'];
  const codings = encoding
    ? String(encoding)
        .toLowerCase()
        .split(',')
        .map((coding) => coding.trim())
        .filter((coding) => coding && coding !== 'identity')
    : [];
  if (codings.length === 0 || !codings.every((coding) => STREAM_DECODERS[coding])) return res;
  const stages = codings.reverse().map((coding) => STREAM_DECODERS[coding]());
  // The errors of any stage (the answer cut, bytes that are not of the encoding) end the last one.
  const last = stages[stages.length - 1];
  pipeline(res, ...stages, (err) => {
    if (err && !last.destroyed) last.destroy(err);
  });
  return last;
}

// The body as sent, decoded by its content-encoding (several are undone last first); unknown ones are left as they
// are, as fetch leaves them.
async function decode(data, encoding) {
  if (!encoding || data.length === 0) return data;
  const codings = String(encoding)
    .toLowerCase()
    .split(',')
    .map((coding) => coding.trim())
    .filter((coding) => coding && coding !== 'identity');
  if (!codings.every((coding) => DECODERS[coding])) return data;
  let out = data;
  for (const coding of codings.reverse()) out = await DECODERS[coding](out);
  return out;
}

// Statuses of a redirect, and those after which the next request is a GET without a body (as fetch does).
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Whether this Node.js has the race of keep-alive sockets of nodejs/node#60001 (fixed in 22.22.3, 24.15.0, 25.7.0):
// xufa needs a version with the fix, but works around it on the older ones.
const KEEP_ALIVE_RACE = (() => {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const fixed = { 22: [22, 3], 24: [15, 0], 25: [7, 0] }[major];
  if (major < 22) return true;
  if (!fixed) return major === 23;
  return minor < fixed[0] || (minor === fixed[0] && patch < fixed[1]);
})();
const MAX_REDIRECTS = 20;

// A body that is a stream: of Node (pipe) or of the web (getReader).
const isStream = (body) =>
  body !== null &&
  typeof body === 'object' &&
  (typeof body.pipe === 'function' || typeof body.getReader === 'function');

class AnswerHeaders {
  constructor(headers) {
    this.headers = headers;
  }

  get(name) {
    const value = this.headers[name.toLowerCase()];
    if (value === undefined) return null;
    return Array.isArray(value) ? value.join(', ') : String(value);
  }

  has(name) {
    return this.headers[name.toLowerCase()] !== undefined;
  }

  *[Symbol.iterator]() {
    for (const name of Object.keys(this.headers)) yield [name, this.get(name)];
  }
}

// A body cut by the signal fails with its reason, as with fetch (a TimeoutError of the timeout).
function answerOf(res, url, signal, method) {
  let read = null;
  // Answers without a body (HEAD, 204, 304) are read at once, which gives their connection back for the next call
  // (the client does not read what it knows is empty).
  if (method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304) {
    read = Promise.resolve(Buffer.alloc(0));
    res.resume();
  }
  const buffer = () => {
    if (!read) {
      read = new Promise((done, failed) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        const fail = (err) => failed(signal && signal.aborted ? signal.reason : err);
        res.on('end', () => {
          const data = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
          decode(data, res.headers['content-encoding']).then(done, fail);
        });
        res.on('error', fail);
        res.on('aborted', () => fail(new Error('The answer was cut')));
      });
    }
    return read;
  };
  return {
    status: res.statusCode,
    statusText: res.statusMessage || '',
    ok: res.statusCode >= 200 && res.statusCode < 300,
    url,
    redirected: false,
    headers: new AnswerHeaders(res.headers),
    text: () => buffer().then((data) => data.toString('utf8')),
    json: () => buffer().then((data) => JSON.parse(data.toString('utf8'))),
    arrayBuffer: () => buffer().then((data) => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    body: {
      // Not read: let go, so its connection serves the next call.
      cancel() {
        if (!read) res.resume();
        return Promise.resolve();
      },
    },
    // The body as a web ReadableStream (responseType: 'stream'), decoded as it comes. Cut by the signal (the timeout,
    // the request gone), it fails with its reason, as the body of fetch does.
    stream() {
      if (read) return new ReadableStream({ start: (controller) => controller.close() });
      read = Promise.resolve(Buffer.alloc(0)); // taken: not read nor let go again
      const out = decodeStream(res);
      if (signal) {
        const stop = () => out.destroy(signal.reason);
        if (signal.aborted) stop();
        else {
          signal.addEventListener('abort', stop, { once: true });
          out.once('close', () => signal.removeEventListener('abort', stop));
        }
      }
      return webStreamOf(out);
    },
  };
}

// A Node stream as a web ReadableStream: its chunks as they come, paused while the reader has enough waiting (4
// chunks). Faster than Readable.toWeb() here: 1.1x fetch on an answer of 1 MB, where toWeb() made it 0.85x.
function webStreamOf(node) {
  let done = false;
  return new ReadableStream(
    {
      start(controller) {
        node.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          if (controller.desiredSize <= 0) node.pause();
        });
        node.once('end', () => {
          done = true;
          controller.close();
        });
        node.once('error', (err) => {
          if (done) return;
          done = true;
          controller.error(err);
        });
        node.once('close', () => {
          // Closed without an end nor an error (destroyed): the answer was cut.
          if (!done) {
            done = true;
            controller.error(Object.assign(new Error('The answer was cut'), { code: 'ECONNRESET' }));
          }
        });
      },
      pull() {
        node.resume();
      },
      cancel(reason) {
        done = true;
        node.destroy(reason instanceof Error ? reason : undefined);
      },
    },
    { highWaterMark: 4 }
  );
}

// The header that logs in to a proxy, from the user and password of its URL (http://user:password@proxy:3128).
function proxyAuthorization(proxy) {
  if (!proxy.username && !proxy.password) return null;
  const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

const portOf = (url) => Number(url.port) || (url.protocol === 'https:' ? 443 : 80);

// Connections to https: servers through a proxy: each one a tunnel (CONNECT host:port) with TLS to the server inside
// it, kept alive and pooled as the connections without a proxy are. The proxy itself is reached over http: or https:.
class TunnelAgent extends https.Agent {
  constructor(proxy, options) {
    super(options);
    this.proxy = proxy;
    this.proxyAuthorization = proxyAuthorization(proxy);
  }

  createConnection(options, callback) {
    const { proxy } = this;
    const authority = `${options.host.includes(':') ? `[${options.host}]` : options.host}:${options.port}`;
    const headers = { host: authority };
    if (this.proxyAuthorization) headers['proxy-authorization'] = this.proxyAuthorization;
    const client = proxy.protocol === 'https:' ? https : http;
    const connect = client.request({
      host: proxy.hostname.replace(/^\[|\]$/g, ''),
      port: portOf(proxy),
      method: 'CONNECT',
      path: authority,
      headers,
      agent: false,
      ...(proxy.protocol === 'https:' ? this.tlsOptions : {}),
    });
    let done = false;
    const finish = (err, socket) => {
      if (done) return;
      done = true;
      callback(err, socket);
    };
    connect.once('connect', (res, socket, head) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        finish(
          Object.assign(new Error(`The proxy did not open a tunnel to ${authority}: ${res.statusCode}`), {
            code: 'XUFA_CLIENT_PROXY',
            statusCode: res.statusCode,
          })
        );
        return;
      }
      if (head && head.length) socket.unshift(head);
      const secure = tls.connect({ ...options, socket, servername: options.servername || options.host });
      finish(null, secure);
    });
    connect.once('error', (err) => finish(err));
    connect.end();
    return undefined; // made later: the callback gives it
  }

  get tlsOptions() {
    const { ca, cert, key, rejectUnauthorized } = this.options;
    return Object.fromEntries(Object.entries({ ca, cert, key, rejectUnauthorized }).filter(([, v]) => v !== undefined));
  }
}

// Options: maxSockets, tls (ca, cert, key, rejectUnauthorized... of the connections to https: servers and proxies).
function httpTransport({ maxSockets = 256, tls: tlsOptions = {} } = {}) {
  // The agents, by the protocol of the server and the proxy in between (none: '').
  const agents = new Map();
  function agentOf(protocol, proxy) {
    const key = `${protocol}${proxy ? ` ${proxy.href}` : ''}`;
    let agent = agents.get(key);
    if (!agent) {
      const options = { keepAlive: true, maxSockets };
      if (!proxy)
        agent = protocol === 'https:' ? new https.Agent({ ...options, ...tlsOptions }) : new http.Agent(options);
      else if (protocol === 'https:') agent = new TunnelAgent(proxy, { ...options, ...tlsOptions });
      // http: through a proxy: the requests go to the proxy, which makes them.
      else
        agent = proxy.protocol === 'https:' ? new https.Agent({ ...options, ...tlsOptions }) : new http.Agent(options);
      agents.set(key, agent);
    }
    return agent;
  }

  function once(target, method, headers, body, signal, proxy) {
    const streaming = isStream(body);
    // A text or bytes: their length. A stream: chunked, unless the caller gives its content-length.
    if (!streaming && body !== null && body !== undefined && headers['content-length'] === undefined) {
      headers = { ...headers, 'content-length': String(Buffer.byteLength(body)) };
    }
    const agent = agentOf(target.protocol, proxy);
    let client = target.protocol === 'https:' ? https : http;
    let options = { method, headers, agent, signal };
    let address = target;
    if (proxy && target.protocol === 'http:') {
      // To the proxy, with the whole URL as the path (RFC 9112, absolute-form).
      client = proxy.protocol === 'https:' ? https : http;
      const authorization = proxyAuthorization(proxy);
      address = proxy;
      options = {
        ...options,
        path: target.href,
        headers: { ...headers, host: target.host, ...(authorization ? { 'proxy-authorization': authorization } : {}) },
      };
    }
    return new Promise((resolve, reject) => {
      let finished = false;
      const req = client.request(address, options, (res) => {
        // Node.js before 22.22.3 (24.15, 25.7): a request whose body is a stream may be answered before its 'finish'
        // (the server has its content-length: the stream ends a tick after its last bytes), and Node.js then gives its
        // socket back to the pool twice, the second time when another request may be using it (which waits for ever):
        // nodejs/node#60001, fixed by #61710. On those versions, such a connection is closed after its answer.
        if (streaming && !finished && KEEP_ALIVE_RACE) req.shouldKeepAlive = false;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(res);
      });
      req.on('error', reject);
      // The signal ends the call, also when Node.js no longer tells the request of it (a socket taken from it).
      function onAbort() {
        req.destroy();
        reject(signal.reason);
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      if (!streaming) {
        req.end(body === null || body === undefined ? undefined : body);
        return;
      }
      req.once('finish', () => {
        finished = true;
      });
      // Sent as it comes; an error of the stream ends the request with it (and the call fails with it).
      const source = typeof body.pipe === 'function' ? body : Readable.fromWeb(body);
      pipeline(source, req, (err) => {
        if (err && !req.destroyed) req.destroy(err);
        if (err) reject(err);
      });
    });
  }

  // proxy(url): the proxy of a URL (a URL), or null; asked again after each redirect (another host may have none).
  async function request(url, { method = 'GET', headers = {}, body, signal, redirect = 'follow', proxy } = {}) {
    let target = new URL(url);
    let verb = method;
    let content = body;
    // Compressed answers, unless the caller asks for something else (accept-encoding: identity).
    let sent = headers['accept-encoding'] === undefined ? { ...headers, 'accept-encoding': ACCEPT_ENCODING } : headers;
    for (let count = 0; ; count += 1) {
      const res = await once(target, verb, sent, content, signal || undefined, proxy ? proxy(target) : null);
      const location = res.headers.location;
      if (redirect === 'manual' || !REDIRECTS.has(res.statusCode) || !location) {
        const answer = answerOf(res, target.href, signal, verb);
        answer.redirected = count > 0;
        return answer;
      }
      res.resume();
      if (redirect === 'error') throw new TypeError(`Redirect to ${location}, with redirect: 'error'`);
      if (count >= MAX_REDIRECTS) throw new TypeError('Too many redirects');
      const next = new URL(location, target);
      if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && verb === 'POST')) {
        if (verb !== 'HEAD') verb = 'GET';
        content = undefined;
        sent = { ...sent };
        delete sent['content-type'];
        delete sent['content-length'];
      } else if (isStream(content)) {
        // The same request again (307, 308...) needs its body again, and a stream was sent once: as fetch, an error.
        throw new TypeError(
          `A body that is a stream cannot be sent again, for the redirect ${res.statusCode} to ${next.href}`
        );
      }
      // Credentials stay with their origin.
      if (next.origin !== target.origin) {
        sent = { ...sent };
        delete sent.authorization;
        delete sent.cookie;
      }
      target = next;
    }
  }
  request.close = () => {
    for (const agent of agents.values()) agent.destroy();
    agents.clear();
  };
  return request;
}

module.exports = { httpTransport };
