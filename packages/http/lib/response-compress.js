// xufa.compress: answers compressed with brotli, gzip or deflate on the routes of @xufa/http, by the rules of
// @xufa/http/compression (compression 1.8.2): the type compressible (or `filter`), Cache-Control without no-transform,
// Vary: Accept-Encoding, from `threshold` (1kb), not HEAD, not encoded already, the encoding the request prefers.
// Bodies of strings and Buffers are compressed at once; streams through zlib as they are read.
//
//   app.register(xufa.compress, { threshold: 256 });
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { acceptedEncoding, compressible, noTransform, parseBytes } from './compression.js';
import { appendVary } from './vary.js';

function compress(app, options, done) {
  const opts = { ...options };
  delete opts.prefix;
  const brotli = { ...opts.brotli };
  brotli.params = { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, ...brotli.params };
  let threshold = parseBytes(opts.threshold);
  if (threshold == null) threshold = 1024;
  const enforceEncoding = opts.enforceEncoding || 'identity';
  const filter =
    opts.filter ||
    ((request, reply) => {
      const type = reply.getHeader('content-type');
      return type !== undefined && !!compressible(type);
    });
  const zlibOptions = { ...opts };
  for (const name of ['brotli', 'threshold', 'filter', 'enforceEncoding']) delete zlibOptions[name];
  const once = {
    br: promisify((body, callback) => zlib.brotliCompress(body, brotli, callback)),
    gzip: promisify((body, callback) => zlib.gzip(body, zlibOptions, callback)),
    deflate: promisify((body, callback) => zlib.deflate(body, zlibOptions, callback)),
  };
  const streams = {
    br: () => zlib.createBrotliCompress(brotli),
    gzip: () => zlib.createGzip(zlibOptions),
    deflate: () => zlib.createDeflate(zlibOptions),
  };

  app.addHook('onSend', async (request, reply, payload) => {
    if (payload === null || payload === undefined) return payload;
    const isBytes = typeof payload === 'string' || Buffer.isBuffer(payload);
    const isStream = !isBytes && typeof payload.pipe === 'function';
    if (!isBytes && !isStream) return payload;
    if (!filter(request, reply)) return payload;
    if (noTransform(reply.getHeader('cache-control'))) return payload;
    const vary = reply.getHeader('vary');
    reply.header('vary', appendVary(Array.isArray(vary) ? vary.join(', ') : String(vary || ''), 'Accept-Encoding'));
    const declared = reply.getHeader('content-length');
    const length = isBytes ? Buffer.byteLength(payload) : undefined;
    if (Number(declared) < threshold || length < threshold) return payload;
    if ((reply.getHeader('content-encoding') || 'identity') !== 'identity') return payload;
    if (request.method === 'HEAD') return payload;
    const encoding = acceptedEncoding(request.headers['accept-encoding'], enforceEncoding);
    if (!encoding) return payload;
    reply.header('content-encoding', encoding);
    reply.removeHeader('content-length');
    return isBytes ? once[encoding](payload) : payload.pipe(streams[encoding]());
  });
  done();
}

compress[Symbol.for('skip-override')] = true;
compress[Symbol.for('fastify.display-name')] = 'compress';
compress[Symbol.for('plugin-meta')] = { name: 'compress' };

export { compress };
