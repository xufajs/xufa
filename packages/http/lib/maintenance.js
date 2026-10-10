// The maintenance mode (as Laravel's php artisan down): while it is on, requests get a 503 (with Retry-After, a page
// for browsers and JSON for the rest), but the health routes, routes with config.maintenance: false, the addresses
// allowed, and the browsers that opened the secret path (a cookie) go through. xufa down turns it on: a file of this
// machine (.xufa/down.json), or with --everywhere a store every machine reads (maintenance(db) of @xufa/orm); xufa up
// turns it off.
//
//   app.register(xufa.maintenance, { store: maintenance(db) }); // the file, and the database
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const COOKIE = 'xufa_maintenance';

// The state written in a file (xufa down): the file there is the mode on (an empty or broken one too).
function fileStore(file) {
  return {
    file,
    async get() {
      let text;
      try {
        text = await fs.promises.readFile(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      try {
        const state = JSON.parse(text);
        return state && typeof state === 'object' ? state : {};
      } catch {
        return {};
      }
    },
  };
}

const bypassOf = (secret) => crypto.createHash('sha256').update(`xufa-maintenance:${secret}`).digest('hex');

function cookieOf(header, name) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

function page(state) {
  const message = state.message || 'We are making some changes. We will be back soon.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Down for maintenance</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#222}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}@media (prefers-color-scheme:dark){body{background:#16181d;color:#e6e6e6}}</style></head><body><main><h1>Down for maintenance</h1><p>${escape(message)}</p></main></body></html>`;
}

function matches(url, patterns) {
  const pathname = url.split('?')[0];
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern
  );
}

function maintenance(app, options, done) {
  const {
    file = path.join(process.cwd(), '.xufa', 'down.json'),
    store,
    refresh = 1000,
    except = ['/health', '/health/*'],
    render = null,
  } = options || {};
  const stores = [];
  if (file) stores.push(fileStore(file));
  for (const item of [].concat(store || [])) {
    if (!item || typeof item.get !== 'function') {
      done(new TypeError('maintenance: store is an object with get() (as maintenance(db) of @xufa/orm)'));
      return;
    }
    stores.push(item);
  }

  let cached = null;
  let readAt = 0;
  let reading = null;
  // The state (null: up), read at most every `refresh` ms. A store that fails counts as up: a broken store does not
  // take the app down.
  async function read() {
    for (const item of stores) {
      try {
        const state = await item.get();
        if (state) return state;
      } catch (err) {
        app.log.warn({ err }, 'the maintenance mode could not be read');
      }
    }
    return null;
  }
  function current() {
    if (Date.now() - readAt < refresh) return cached;
    if (!reading) {
      reading = read()
        .then((state) => {
          cached = state;
          readAt = Date.now();
          return state;
        })
        .finally(() => {
          reading = null;
        });
    }
    return reading;
  }

  app.decorate('maintenance', {
    // The state now (null when the app is up), read again.
    async state() {
      readAt = 0;
      return current();
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    const state = await current();
    if (!state) return undefined;
    const config = request.routeOptions && request.routeOptions.config;
    if (config && config.maintenance === false) return undefined;
    if (matches(request.url, except)) return undefined;
    if (Array.isArray(state.allow) && state.allow.includes(request.ip)) return undefined;
    if (state.secret) {
      const bypass = bypassOf(state.secret);
      if (request.url.split('?')[0] === `/${state.secret}`) {
        const secure = request.protocol === 'https' ? '; Secure' : '';
        reply.header('set-cookie', `${COOKIE}=${bypass}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`);
        return reply.redirect(state.redirect || '/');
      }
      if (cookieOf(request.headers.cookie, COOKIE) === bypass) return undefined;
    }
    if (state.retryAfter) reply.header('retry-after', String(state.retryAfter));
    reply.code(503);
    if (/text\/html/.test(request.headers.accept || '')) {
      return reply.type('text/html; charset=utf-8').send(render ? render(state, request) : page(state));
    }
    return reply.send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: state.message || 'The app is down for maintenance',
      ...(state.retryAfter ? { retryAfter: state.retryAfter } : {}),
    });
  });
  done();
}

maintenance[Symbol.for('skip-override')] = true;
maintenance[Symbol.for('fastify.display-name')] = 'xufa.maintenance';

export { maintenance, fileStore, bypassOf };
