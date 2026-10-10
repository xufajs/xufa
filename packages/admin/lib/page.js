// The pages of the admin: a document that loads the page (React, built into lib/client/dist by client/build.js), for
// the admin and for its login page (with the CSRF token of the session); and the files of the page, served with their
// hash in their address (cached for good), compressed with brotli or gzip when the browser takes them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { message as msg } from './messages.js';
import { translate } from './ui-locale.js';

const DIST = path.join(import.meta.dirname, 'client', 'dist');
const TYPES = { 'admin.js': 'text/javascript; charset=utf-8', 'admin.css': 'text/css; charset=utf-8' };

let assets = null;

// The files of the page, read once: their bytes (and compressed copies) and their hash.
function read() {
  if (assets === null) {
    assets = {};
    for (const name of Object.keys(TYPES)) {
      const file = (suffix = '') => {
        const at = path.join(DIST, name + suffix);
        return fs.existsSync(at) ? fs.readFileSync(at) : null;
      };
      const raw = file();
      if (!raw) throw new Error(`The page of the admin is not built (${name}): node client/build.js`);
      assets[name] = {
        raw,
        br: file('.br'),
        gzip: file('.gz'),
        hash: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16),
        type: TYPES[name],
      };
    }
  }
  return assets;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The catalog of the page as JSON in a script (its < escaped: no text closes the script).
function catalogOf(ui) {
  if (!ui) return '';
  const json = JSON.stringify({ locale: ui.locale, messages: ui.messages, languages: ui.languages || [] }).replace(
    /</g,
    '\\u003c'
  );
  return `\n<script type="application/json" id="xufa-admin-i18n">${json}</script>`;
}

function shell(title, view, extra = '', ui = null) {
  const files = read();
  return `<!doctype html>
<html lang="${escape(ui ? ui.locale : 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">${extra}
<title>${escape(title)}</title>
<link rel="stylesheet" href="assets/admin.css?v=${files['admin.css'].hash}">
</head>
<body>
<div id="app" data-view="${view}" data-title="${escape(title)}"></div>
<noscript>${escape(translate(ui, 'The admin needs JavaScript.'))}</noscript>${catalogOf(ui)}
<script src="assets/admin.js?v=${files['admin.js'].hash}" defer></script>
</body>
</html>
`;
}

// ui: the language and catalog of the request (ui-locale.js).
function page(title, ui = null) {
  return shell(title, 'admin', '', ui);
}

function loginPage(title, csrf, ui = null) {
  const full = translate(ui, 'Log in · {title}', { title });
  return shell(full, 'login', `\n<meta name="csrf-token" content="${escape(csrf || '')}">`, ui).replace(
    `data-title="${escape(full)}"`,
    `data-title="${escape(title)}"`
  );
}

// Answers a file of the page: with its hash in the address, cached for good; else checked again (ETag).
function sendAsset(request, reply, name) {
  const files = read();
  const asset = Object.hasOwn(files, name) ? files[name] : null;
  if (!asset) return reply.code(404).send({ error: msg('notFound'), errors: {} });
  const etag = `"${asset.hash}"`;
  reply.header('content-type', asset.type);
  reply.header('vary', 'accept-encoding');
  reply.header('etag', etag);
  reply.header(
    'cache-control',
    request.query && request.query.v === asset.hash ? 'public, max-age=31536000, immutable' : 'no-cache'
  );
  if (request.headers['if-none-match'] === etag) return reply.code(304).send();
  const accepts = String(request.headers['accept-encoding'] || '');
  if (asset.br && /\bbr\b/.test(accepts)) return reply.header('content-encoding', 'br').send(asset.br);
  if (asset.gzip && /\bgzip\b/.test(accepts)) return reply.header('content-encoding', 'gzip').send(asset.gzip);
  return reply.send(asset.raw);
}

export { page, loginPage, sendAsset };
