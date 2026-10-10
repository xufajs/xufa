// Static files (as Django's staticfiles with whitenoise, and @fastify/static): the files of some folders under a
// prefix, with their type, an ETag and Last-Modified (304 when the browser has them), the .br or .gz file next to one
// when the browser takes it, and addresses of their versions to cache for good: app.staticUrl('css/site.css') is
// '/static/css/site.css?v=<hash of its bytes>', and an address with the right version is cached for a year.
//
//   app.register(xufa.staticFiles, { root: ['static', 'node_modules/some-ui/dist'], prefix: '/static/' });
//   app.staticUrl('css/site.css'); // '/static/css/site.css?v=4f1c2a9b'
//
// The first folder with the file serves it. Paths out of the folders, files and folders whose names start with a dot,
// and folders are a 404. Options: root (a folder or a list), prefix ('/static/'), maxAge (seconds of the cache of an
// address without its version: 0, so browsers ask again with the ETag), immutable (31536000: a year, for versioned
// addresses), dotfiles (false), precompressed (true: .br and .gz files), types (more types by extension).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.zip': 'application/zip',
  '.webmanifest': 'application/manifest+json',
};

class StaticError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StaticError';
    this.code = 'XUFA_ERR_STATIC';
  }
}

function staticFiles(app, options, done) {
  const {
    root,
    prefix = '/static/',
    maxAge = 0,
    immutable = 31536000,
    dotfiles = false,
    precompressed = true,
    types = {},
  } = options || {};
  try {
    if (!root || (Array.isArray(root) && root.length === 0))
      throw new StaticError('staticFiles needs root: a folder, or a list');
    if (typeof prefix !== 'string' || !prefix.startsWith('/') || !prefix.endsWith('/')) {
      throw new StaticError(`The prefix of staticFiles starts and ends with /: ${prefix}`);
    }
  } catch (err) {
    done(err);
    return;
  }
  const roots = [].concat(root).map((dir) => path.resolve(dir));
  const typeOf = (file) =>
    types[path.extname(file).toLowerCase()] || TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // The hashes of the files (their version), kept while their size and time stay.
  const hashes = new Map();

  // The file of a path inside the folders: { file, stat } or null.
  async function find(relative) {
    const parts = relative.split('/');
    if (parts.some((part) => part === '..' || part === '' || (!dotfiles && part.startsWith('.')))) return null;
    for (const dir of roots) {
      const file = path.resolve(dir, ...parts);
      if (!file.startsWith(dir + path.sep)) continue;
      try {
        const stat = await fs.promises.stat(file);
        if (stat.isFile()) return { file, stat };
      } catch {
        // Not in this folder.
      }
    }
    return null;
  }

  async function hashOf(file, stat) {
    const known = hashes.get(file);
    if (known && known.size === stat.size && known.mtime === stat.mtimeMs) return known.hash;
    const hash = crypto
      .createHash('sha256')
      .update(await fs.promises.readFile(file))
      .digest('hex')
      .slice(0, 12);
    hashes.set(file, { size: stat.size, mtime: stat.mtimeMs, hash });
    return hash;
  }

  // The hash of each path asked for, with when its file was looked at: looked at again at most once a second (each
  // render asked for the same files, with a stat of the disk each time).
  const checked = new Map();
  const CHECK_EVERY = 1000;
  function hashNow(relative) {
    const now = Date.now();
    const known = checked.get(relative);
    if (known && now - known.at < CHECK_EVERY) return known.hash;
    const hash = hashFound(relative);
    if (checked.size >= 1000) checked.clear();
    checked.set(relative, { hash, at: now });
    return hash;
  }

  // The hash of a path, at once (staticUrl() is called by templates, which do not wait): read now, and kept.
  function hashFound(relative) {
    const parts = relative.split('/');
    if (parts.some((part) => part === '..' || part === '')) return null;
    for (const dir of roots) {
      const file = path.resolve(dir, ...parts);
      if (!file.startsWith(dir + path.sep)) continue;
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const known = hashes.get(file);
      if (known && known.size === stat.size && known.mtime === stat.mtimeMs) return known.hash;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
      hashes.set(file, { size: stat.size, mtime: stat.mtimeMs, hash });
      return hash;
    }
    return null;
  }

  // The address of a static file, with its version (Django's {% static %}): '/static/css/site.css?v=...'. A file
  // that is not there gets its address without one.
  app.decorate('staticUrl', (relative) => {
    const clean = String(relative).replace(/^\/+/, '');
    const hash = hashNow(clean);
    const address = prefix + clean.split('/').map(encodeURIComponent).join('/');
    return hash ? `${address}?v=${hash}` : address;
  });

  const handler = async (request, reply) => {
    let relative;
    try {
      relative = decodeURIComponent(request.params['*'] || '');
    } catch {
      return reply.callNotFound();
    }
    const found = await find(relative);
    if (!found) return reply.callNotFound();
    const { file, stat } = found;
    const hash = await hashOf(file, stat);
    const etag = `"${hash}"`;
    const versioned = request.query && request.query.v === hash;
    reply.header('etag', etag);
    reply.header('last-modified', stat.mtime.toUTCString());
    reply.header(
      'cache-control',
      versioned ? `public, max-age=${immutable}, immutable` : maxAge > 0 ? `public, max-age=${maxAge}` : 'no-cache'
    );
    reply.header('content-type', typeOf(file));
    const match = request.headers['if-none-match'];
    const since = request.headers['if-modified-since'];
    if (
      (match && match.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) ||
      (!match && since && Date.parse(since) >= Math.floor(stat.mtimeMs / 1000) * 1000)
    ) {
      return reply.code(304).send();
    }
    // The file compressed beforehand (.br, .gz) when the browser takes it.
    let served = file;
    let size = stat.size;
    if (precompressed) {
      reply.header('vary', 'accept-encoding');
      const accepts = String(request.headers['accept-encoding'] || '');
      for (const [encoding, extension] of [
        ['br', '.br'],
        ['gzip', '.gz'],
      ]) {
        if (!new RegExp(`\\b${encoding}\\b`).test(accepts)) continue;
        try {
          const compressed = await fs.promises.stat(file + extension);
          if (compressed.isFile()) {
            served = file + extension;
            size = compressed.size;
            reply.header('content-encoding', encoding);
            break;
          }
        } catch {
          // None.
        }
      }
    }
    reply.header('content-length', size);
    if (request.method === 'HEAD') return reply.send();
    return reply.send(fs.createReadStream(served));
  };
  app.route({ method: ['GET', 'HEAD'], url: `${prefix}*`, handler, config: { static: true } });
  done();
}

staticFiles[Symbol.for('skip-override')] = true;
staticFiles[Symbol.for('fastify.display-name')] = 'staticFiles';
staticFiles[Symbol.for('plugin-meta')] = { name: 'staticFiles' };

export { staticFiles, StaticError, TYPES as STATIC_TYPES };
