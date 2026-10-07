// The page of the errors for development (as Laravel's Ignition and Django's debug page): a request of a browser
// (Accept: text/html) that fails gets a page with the error, its causes, its stack with the lines of the source around
// each call of the app, the request (headers of credentials hidden) and the routes; a route that is not there, the
// list of the routes. Other requests get the answers they get without it (JSON). Off when NODE_ENV is production,
// unless enabled: true; never turn it on where others can reach the app: it shows the code and the request.
//
//   app.register(devErrors);                          // or app.register(devErrors, { enabled: true, context: 7 })
const fs = require('node:fs');
const path = require('node:path');
const { STATUS_CODES } = require('node:http');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
// The error of a request (from onError), for the page.
const ERROR = Symbol('xufa.devErrors.error');
const HIDDEN = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth-token)$/i;

// The folder of @xufa/http itself: its calls are not of the app. Asked when a page is made (not when the module
// loads: the playground of the docs runs this package in a browser, without folders).
let own = null;
function ownFolder() {
  if (own === null) own = typeof __dirname === 'string' ? path.join(__dirname, path.sep) : '\0';
  return own;
}

const wantsHtml = (request) => /text\/html/.test(request.headers.accept || '');

// The calls of a stack: { fn, file, line, column, app } (app: a file of the app, not of node_modules nor of Node).
function framesOf(stack) {
  const frames = [];
  for (const line of String(stack || '')
    .split('\n')
    .slice(1)) {
    const match = /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    let file = match[2];
    if (file.startsWith('file://')) {
      try {
        file = decodeURIComponent(new URL(file).pathname).replace(/^\/([A-Za-z]:)/, '$1');
      } catch {
        // as it is
      }
    }
    const internal = file.startsWith('node:') || !path.isAbsolute(file);
    frames.push({
      fn: match[1] || '(anonymous)',
      file,
      line: Number(match[3]),
      column: Number(match[4]),
      app: !internal && !/[\\/]node_modules[\\/]/.test(file) && !file.startsWith(ownFolder()),
      internal,
    });
  }
  return frames;
}

// The lines of a file around one (cached for the page).
function sourceAround(file, line, context, cache) {
  if (!cache.has(file)) {
    let lines = null;
    try {
      const stat = fs.statSync(file);
      if (stat.size < 2 * 1024 * 1024) lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      lines = null;
    }
    cache.set(file, lines);
  }
  const lines = cache.get(file);
  if (!lines) return null;
  const from = Math.max(1, line - context);
  const to = Math.min(lines.length, line + context);
  const out = [];
  for (let n = from; n <= to; n += 1) out.push({ n, text: lines[n - 1], here: n === line });
  return out;
}

function table(rows) {
  if (rows.length === 0) return '<p class="empty">None</p>';
  return `<table>${rows
    .map(([name, value]) => `<tr><th>${escape(name)}</th><td><code>${escape(value)}</code></td></tr>`)
    .join('')}</table>`;
}

function json(value) {
  if (value === undefined || value === null || value === '') return '<p class="empty">None</p>';
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length > 20000) text = `${text.slice(0, 20000)}\n... (${text.length - 20000} characters more)`;
  return `<pre class="block">${escape(text)}</pre>`;
}

function errorSection(err, context, cache, depth) {
  const name = (err && err.name) || 'Error';
  const message = err && err.message !== undefined ? err.message : String(err);
  const frames = framesOf(err && err.stack);
  const shown = frames
    .map((frame, i) => {
      const where = `${escape(frame.fn)} <span class="file">${escape(frame.file)}:${frame.line}:${frame.column}</span>`;
      if (!frame.app) return `<li class="frame other">${where}</li>`;
      const lines = sourceAround(frame.file, frame.line, context, cache);
      const code = lines
        ? `<pre class="source">${lines
            .map(({ n, text, here }) => `<span class="${here ? 'here' : ''}"><b>${n}</b>${escape(text)}</span>`)
            .join('')}</pre>`
        : '';
      return `<li class="frame app"><details${i === frames.findIndex((f) => f.app) ? ' open' : ''}><summary>${where}</summary>${code}</details></li>`;
    })
    .join('');
  const extra = [];
  if (err && err.code) extra.push(['code', err.code]);
  if (err && Array.isArray(err.validation)) {
    err.validation.forEach((item, i) =>
      extra.push([`validation ${i + 1}`, `${item.instancePath || ''} ${item.message}`])
    );
  }
  if (err && err.errors && typeof err.errors === 'object' && !Array.isArray(err.errors)) {
    for (const [field, messages] of Object.entries(err.errors)) extra.push([field, [].concat(messages).join(' ')]);
  }
  let html = `<section class="error${depth ? ' cause' : ''}">
  <h2>${depth ? 'Caused by ' : ''}<span class="name">${escape(name)}</span></h2>
  <p class="message">${escape(message)}</p>
  ${extra.length ? table(extra) : ''}
  <ol class="frames">${shown || '<li class="frame other">No stack</li>'}</ol>
</section>`;
  if (err && err.cause && depth < 5) html += errorSection(err.cause, context, cache, depth + 1);
  return html;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f8; --fg: #1d1d1f; --muted: #6b6b76; --card: #fff; --line: #e3e3e8;
  --accent: #c42b1c; --here: #fde8e6; --code: #f2f2f5; }
@media (prefers-color-scheme: dark) { :root { --bg: #151518; --fg: #ececf1; --muted: #9a9aa6; --card: #1e1e23;
  --line: #2e2e36; --accent: #ff6b5e; --here: #4a1f1c; --code: #26262c; } }
* { box-sizing: border-box; } body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
header { border-left: 4px solid var(--accent); padding: 4px 0 4px 16px; margin-bottom: 24px; }
header .status { color: var(--accent); font-weight: 600; letter-spacing: .02em; }
header h1 { margin: 4px 0; font-size: 26px; word-break: break-word; }
header .where { color: var(--muted); font-family: ui-monospace, monospace; font-size: 13px; }
.warning { color: var(--muted); font-size: 13px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 16px 0; }
section h2 { margin: 0 0 8px; font-size: 17px; } .name { color: var(--accent); }
.message { font-size: 17px; margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
.frames { list-style: none; padding: 0; margin: 0; font-family: ui-monospace, monospace; font-size: 13px; }
.frame { padding: 4px 0; border-top: 1px solid var(--line); } .frame.other { color: var(--muted); }
.file { color: var(--muted); } summary { cursor: pointer; }
pre { margin: 8px 0 0; overflow-x: auto; background: var(--code); border-radius: 6px; padding: 8px 0; font-size: 13px; }
pre.block { padding: 8px 12px; }
.source span { display: block; padding: 0 12px; white-space: pre; } .source span.here { background: var(--here); }
.source b { display: inline-block; width: 4em; color: var(--muted); font-weight: normal; user-select: none; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; vertical-align: top; padding: 4px 8px; border-top: 1px solid var(--line); }
th { width: 200px; color: var(--muted); font-weight: normal; } td code { word-break: break-all; }
.empty { color: var(--muted); margin: 0; }
`;

function page({ status, title, where, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(`${status} ${title}`)}</title><style>${STYLE}</style></head>
<body><main>
<header><div class="status">${status} ${escape(STATUS_CODES[status] || '')}</div><h1>${escape(title)}</h1>
<div class="where">${escape(where)}</div></header>
${body}
<p class="warning">This page is of @xufa/http's devErrors, for development: it shows the code and the request. It is off when NODE_ENV is production.</p>
</main></body></html>`;
}

function requestSection(request) {
  const headers = Object.entries(request.headers).map(([name, value]) => [
    name,
    HIDDEN.test(name) ? '(hidden)' : Array.isArray(value) ? value.join(', ') : value,
  ]);
  const route = request.routeOptions && request.routeOptions.url;
  return `<section><h2>Request</h2>${table([
    ['method', request.method],
    ['url', request.url],
    ...(route ? [['route', route]] : []),
    ['ip', request.ip],
    ['id', request.id],
  ])}
<h3>Params</h3>${json(request.params && Object.keys(request.params).length ? request.params : null)}
<h3>Query</h3>${json(request.query && Object.keys(request.query).length ? request.query : null)}
<h3>Body</h3>${json(request.body)}
<h3>Headers</h3>${table(headers)}</section>`;
}

function routesSection(app) {
  let routes = '';
  try {
    routes = app.printRoutes({ commonPrefix: false });
  } catch {
    routes = '';
  }
  return `<section><details><summary><b>Routes</b></summary><pre class="block">${escape(routes || '(none)')}</pre></details>
${table([
  ['node', process.version],
  ['NODE_ENV', process.env.NODE_ENV || '(not set)'],
])}</section>`;
}

function errorPage(err, request, { context = 5, app, status: sent }) {
  const status =
    sent || (err && (err.statusCode >= 400 ? err.statusCode : err.status >= 400 ? err.status : 500)) || 500;
  const cache = new Map();
  return {
    status,
    html: page({
      status,
      title: (err && err.message) || 'Error',
      where: `${request.method} ${request.url}`,
      body: errorSection(err, context, cache, 0) + requestSection(request) + routesSection(app),
    }),
  };
}

function notFoundPage(request, app) {
  return page({
    status: 404,
    title: `No route for ${request.method} ${request.url.split('?')[0]}`,
    where: `${request.method} ${request.url}`,
    body: `<section><h2>The routes of the app</h2><pre class="block">${escape(
      app.printRoutes({ commonPrefix: false }) || '(none)'
    )}</pre></section>${requestSection(request)}`,
  });
}

function devErrors(app, options, done) {
  const { enabled = process.env.NODE_ENV !== 'production', context = 5, notFound = true } = options || {};
  if (!enabled) {
    done();
    return;
  }
  // Hooks, not handlers: the error handlers and the not-found handler of the app (and of plugins, as the ORM's) answer
  // as they do; for a browser, what they send is replaced by the page. onError keeps the error of the request.
  app.addHook('onError', async (request, reply, err) => {
    request[ERROR] = err;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 400 || !wantsHtml(request)) return payload;
    const err = request[ERROR];
    let html;
    if (err) html = errorPage(err, request, { context, app, status: reply.statusCode }).html;
    else if (notFound && reply.statusCode === 404 && request.is404) html = notFoundPage(request, app);
    else return payload;
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.removeHeader('content-length');
    return html;
  });
  done();
}

devErrors[Symbol.for('skip-override')] = true;
devErrors[Symbol.for('fastify.display-name')] = 'devErrors';
devErrors[Symbol.for('plugin-meta')] = { name: 'devErrors' };

module.exports = { devErrors, framesOf, errorPage };
