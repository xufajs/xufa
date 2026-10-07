'use strict';

// The requests of the s3 backend over node:http and node:https, with connections kept for the next ones: a function
// of the shape of fetch (url, { method, headers, body }) that gives what the backend reads of an answer (status, ok,
// headers.get(), text(), body.cancel(), and stream: the body as a Node stream). Node's fetch is several times slower
// for small requests (HEAD above all: about 1,600 a second where this makes 14,000, on one machine).
const http = require('node:http');
const https = require('node:https');

function httpClient({ maxSockets = 64 } = {}) {
  const agents = {
    'http:': new http.Agent({ keepAlive: true, maxSockets }),
    'https:': new https.Agent({ keepAlive: true, maxSockets }),
  };
  function request(url, { method = 'GET', headers = {}, body } = {}) {
    const target = url instanceof URL ? url : new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.request(target, { method, headers, agent: agents[target.protocol] }, (res) => {
        let used = false;
        const read = () => {
          used = true;
          return new Promise((done, failed) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => done(Buffer.concat(chunks)));
            res.on('error', failed);
          });
        };
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: {
            get(name) {
              const value = res.headers[name.toLowerCase()];
              if (value === undefined) return null;
              return Array.isArray(value) ? value.join(', ') : String(value);
            },
          },
          text: () => read().then((buffer) => buffer.toString('utf8')),
          arrayBuffer: () =>
            read().then((buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
          // The body not read: let go, so its connection serves the next request.
          body: {
            cancel() {
              if (!used) res.resume();
              return Promise.resolve();
            },
          },
          stream: res,
        });
      });
      req.on('error', reject);
      req.end(body === null || body === undefined ? undefined : body);
    });
  }
  request.close = () => {
    agents['http:'].destroy();
    agents['https:'].destroy();
  };
  return request;
}

module.exports = { httpClient };
