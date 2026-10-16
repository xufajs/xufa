// express.static(root, options) (serve-static): the files of a folder for GET and HEAD (./send.js). A file not found
// goes on to the next layer (fallthrough), or is a 404 with fallthrough false (other methods a 405); a folder is
// redirected to its path with a '/' (redirect), or a 404. setHeaders(res, path, stat) before a file's headers go.
import path from 'node:path';
import { FileSender } from './send.js';
import { encodeUrl, escapeHtml, htmlDocument } from './headers.js';
import { originalOf, parsedUrl } from './url.js';

const collapseLeadingSlashes = (text) => {
  let i = 0;
  while (i < text.length && text.charCodeAt(i) === 0x2f) i += 1;
  return i > 1 ? `/${text.slice(i)}` : text;
};

// A folder asked for without its '/': a redirect to it, query kept.
function redirectToFolder(res) {
  if (this.hasTrailingSlash()) {
    this.error(404);
    return;
  }
  const original = originalOf(this.req);
  const location = encodeUrl(collapseLeadingSlashes(`${original.pathname}/`) + (original.search || ''));
  const doc = htmlDocument('Redirecting', `Redirecting to ${escapeHtml(location)}`);
  res.statusCode = 301;
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Content-Length', Buffer.byteLength(doc));
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Location', location);
  res.end(doc);
}

function folderNotFound() {
  this.error(404);
}

export function serveStatic(root, options) {
  if (!root) throw new TypeError('root path required');
  if (typeof root !== 'string') throw new TypeError('root path must be a string');
  const opts = Object.create(options || null);
  const fallthrough = opts.fallthrough !== false;
  const redirect = opts.redirect !== false;
  const { setHeaders } = opts;
  if (setHeaders && typeof setHeaders !== 'function') throw new TypeError('option setHeaders must be function');
  opts.maxage = opts.maxage || opts.maxAge || 0;
  opts.root = path.resolve(root);
  const onDirectory = redirect ? redirectToFolder : folderNotFound;
  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        next();
        return;
      }
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }
    let forwardError = !fallthrough;
    let { pathname } = parsedUrl(req);
    // (A redirect happens where the folder is mounted.)
    if (pathname === '/' && originalOf(req).pathname.slice(-1) !== '/') pathname = '';
    const stream = new FileSender(req, pathname, opts);
    stream.on('directory', onDirectory);
    if (setHeaders) stream.on('headers', setHeaders);
    if (fallthrough) {
      stream.on('file', () => {
        forwardError = true;
      });
    }
    stream.on('error', (error) => {
      if (forwardError || !(error.statusCode < 500)) next(error);
      else next();
    });
    stream.pipe(res);
  };
}
