// The proxy of a call, by the option `proxy` of the client:
// - a URL ('http://proxy:3128', 'https://user:password@proxy:3128'): every call through it;
// - false: none;
// - 'env': the one of the environment: HTTP_PROXY (http:) or HTTPS_PROXY (https:), in capitals or not, unless NO_PROXY
//   names the host (as curl and Node.js read them);
// - undefined (the default): that of the environment when NODE_USE_ENV_PROXY is set, as Node.js decides for its own
//   fetch and agents (24), and none otherwise (as fetch of Node.js 22, which reads no proxy).
//
// NO_PROXY: a list (commas or spaces) of hosts: `*` is every one; `example.com` and `.example.com` are that domain and
// its subdomains; `host:port` only that port; addresses as they are ([::1] or ::1 for IPv6).

// Reading a variable of the environment costs (about 0.35 µs on Windows, for each call): the names in small letters are
// read where they are other variables (not on Windows, whose names have no case), the rest only when needed.
const CASED = process.platform !== 'win32';
const NO_RULES = { 'http:': null, 'https:': null, none: [] };
const PROTOCOLS = new Set(['http:', 'https:']);

let cache = { key: null, value: null };

// A proxy given as a URL: checked (http: or https:), or an error.
function proxyUrl(value, where) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value));
  } catch {
    throw new TypeError(`${where} is not a URL: ${value}`);
  }
  if (!PROTOCOLS.has(url.protocol)) throw new TypeError(`${where}: proxies are http: or https: (${url.protocol})`);
  return url;
}

function rulesOf(env) {
  const http = env.HTTP_PROXY || (CASED && env.http_proxy) || '';
  const https = env.HTTPS_PROXY || (CASED && env.https_proxy) || '';
  if (!http && !https) return NO_RULES;
  const noProxy = env.NO_PROXY ?? (CASED ? env.no_proxy : undefined) ?? '';
  const key = `${http}\n${https}\n${noProxy}`;
  if (cache.key === key) return cache.value;
  const value = {
    'http:': http ? proxyUrl(http, 'HTTP_PROXY') : null,
    'https:': https ? proxyUrl(https, 'HTTPS_PROXY') : null,
    none: noProxy
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((entry) => {
        const text = entry.trim().toLowerCase();
        // [::1]:8080, ::1 (an IPv6 address has colons: no port), host:port, host.
        const match =
          /^\[([^\]]+)\](?::(\d+))?$/.exec(text) ||
          (text.split(':').length > 2 ? [text, text, ''] : /^([^:]*)(?::(\d+))?$/.exec(text));
        return { host: match[1].replace(/^\*?\./, ''), port: match[2] || '', any: match[1] === '*' };
      }),
  };
  cache = { key, value };
  return value;
}

// The proxy of the environment for a URL, or null.
function envProxy(url, env) {
  const rules = rulesOf(env);
  if (!rules['http:'] && !rules['https:']) return null; // no proxy: the URL is not even parsed
  const target = url instanceof URL ? url : new URL(url);
  const proxy = rules[target.protocol];
  if (!proxy) return null;
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = target.port || (target.protocol === 'https:' ? '443' : '80');
  const excluded = rules.none.some(
    (rule) => rule.any || ((host === rule.host || host.endsWith(`.${rule.host}`)) && (!rule.port || rule.port === port))
  );
  return excluded ? null : proxy;
}

// A function of a URL that gives its proxy (a URL) or null, for the option `proxy` (checked once).
function proxyOf(option, env = process.env) {
  if (option === false || option === null) return () => null;
  if (option === undefined) return (url) => (env.NODE_USE_ENV_PROXY ? envProxy(url, env) : null);
  if (option === 'env') return (url) => envProxy(url, env);
  const fixed = proxyUrl(option, 'proxy');
  return () => fixed;
}

export { proxyOf, envProxy };
