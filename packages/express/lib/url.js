// The pathname and query of a request's url (parseurl), read once for each url the request has (req.url changes as
// routers mount it): { pathname, query (without '?', or null), search ('?...' or null), path, href }. originalOf()
// reads req.originalUrl.

const kParsed = Symbol('xufa.express.parsedUrl');
const kOriginal = Symbol('xufa.express.parsedOriginalUrl');

// Characters url.parse() escapes, and those that make Express's fast reading give way to the full one.
const ESCAPES = {
  ' ': '%20',
  '\t': '%09',
  '\n': '%0A',
  '\r': '%0D',
  '"': '%22',
  "'": '%27',
  '<': '%3C',
  '>': '%3E',
  '\\': '%5C',
  '^': '%5E',
  '`': '%60',
  '{': '%7B',
  '|': '%7C',
  '}': '%7D',
};
const ESCAPED = /[ \t\n\r"'<>\\^`{|}]/g;

function result(pathname, search) {
  return {
    pathname,
    search,
    query: search === null ? null : search.slice(1),
    path: search === null ? pathname : pathname + search,
    href: search === null ? pathname : pathname + search,
  };
}

// The full reading (url.parse's, for what it is used here): the url trimmed, its hash dropped, backslashes before the
// query made slashes, the protocol and host of an absolute url dropped, unsafe characters escaped.
function slowParse(url) {
  let rest = url.trim();
  const hash = rest.indexOf('#');
  if (hash !== -1) rest = rest.slice(0, hash);
  const question = rest.indexOf('?');
  const before = question === -1 ? rest : rest.slice(0, question);
  rest = before.replace(/\\/g, '/') + (question === -1 ? '' : rest.slice(question));
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(rest);
  if (scheme) {
    const slash = rest.slice(scheme[0].length).search(/[/?]/);
    rest = slash === -1 ? '/' : rest.slice(scheme[0].length + slash);
    if (rest[0] === '?') rest = `/${rest}`;
  }
  const at = rest.indexOf('?');
  const pathname = (at === -1 ? rest : rest.slice(0, at)).replace(ESCAPED, (char) => ESCAPES[char]);
  const search = at === -1 ? null : rest.slice(at).replace(ESCAPED, (char) => ESCAPES[char]);
  // (No pathname: null, as url.parse() reads '' or '?a=1'.)
  return result(pathname || (scheme ? '/' : null), search);
}

// A url: the fast reading of '/path?query' (Express's), the full one for the rest.
export function parse(url) {
  if (typeof url !== 'string' || url.charCodeAt(0) !== 0x2f) return slowParse(String(url));
  let pathname = url;
  let search = null;
  for (let i = 1; i < url.length; i += 1) {
    const code = url.charCodeAt(i);
    if (code === 0x3f) {
      if (search === null) {
        pathname = url.substring(0, i);
        search = url.substring(i);
      }
    } else if (code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20 || code === 0x23) {
      return slowParse(url);
    } else if (code === 0xa0 || code === 0xfeff) return slowParse(url);
  }
  return result(pathname, search);
}

// The reading of req.url (undefined when it has none).
export function parsedUrl(req) {
  const { url } = req;
  if (url === undefined) return undefined;
  const cached = req[kParsed];
  if (cached !== undefined && cached.raw === url) return cached;
  const parsed = parse(url);
  parsed.raw = url;
  req[kParsed] = parsed;
  return parsed;
}

export function pathnameOf(req) {
  const parsed = parsedUrl(req);
  return parsed === undefined ? undefined : parsed.pathname;
}

// The reading of req.originalUrl (or req.url).
export function originalOf(req) {
  const url = req.originalUrl;
  if (typeof url !== 'string') return parsedUrl(req);
  const cached = req[kOriginal];
  if (cached !== undefined && cached.raw === url) return cached;
  const parsed = parse(url);
  parsed.raw = url;
  req[kOriginal] = parsed;
  return parsed;
}
