// helmet's API (8.3.0), xufa's own implementation: middlewares of node:http (Express, connect, @xufa/express) that set
// the security headers of responses: Content-Security-Policy, Cross-Origin-*-Policy, Origin-Agent-Cluster,
// Referrer-Policy, Strict-Transport-Security, X-Content-Type-Options, X-DNS-Prefetch-Control, X-Download-Options,
// X-Frame-Options, X-Permitted-Cross-Domain-Policies, X-XSS-Protection, and X-Powered-By removed. Options are checked
// when the middleware is made (an error then, as helmet throws), so a request only sets headers.
//
//   app.use(helmet({ contentSecurityPolicy: { directives: { scriptSrc: ["'self'", 'cdn.example.com'] } } }));
//
// staticHeaders(options) gives what helmet() would do to every response (headers set and removed), when no directive
// of the policy is a function: native routes set them at once.

// --- Content-Security-Policy ----------------------------------------------------------------------------------------

const dangerouslyDisableDefaultSrc = Symbol('dangerouslyDisableDefaultSrc');

const SHOULD_BE_QUOTED = new Set([
  'none',
  'self',
  'strict-dynamic',
  'report-sample',
  'inline-speculation-rules',
  'unsafe-inline',
  'unsafe-eval',
  'unsafe-hashes',
  'wasm-unsafe-eval',
]);

/** The directives of the default policy (a new copy each time). */
const getDefaultDirectives = () => ({
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'font-src': ["'self'", 'https:', 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'object-src': ["'none'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", 'https:', "'unsafe-inline'"],
  'upgrade-insecure-requests': [],
});

const dashify = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function parseDirectiveName(raw) {
  if (raw.length === 0 || !/^[a-z](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(raw)) {
    throw new Error(`Content-Security-Policy received an invalid directive name ${JSON.stringify(raw)}`);
  }
  return dashify(raw);
}

// A value with ';' or ',' would end the directive (or the policy).
const valueError = (name, value) =>
  /;|,/.test(value)
    ? new Error(`Content-Security-Policy received an invalid directive value for ${JSON.stringify(name)}`)
    : null;

// Keywords, nonces and hashes are quoted ("'self'"); unquoted they would be host names.
const entryError = (name, entry) =>
  SHOULD_BE_QUOTED.has(entry) ||
  entry.startsWith('nonce-') ||
  entry.startsWith('sha256-') ||
  entry.startsWith('sha384-') ||
  entry.startsWith('sha512-')
    ? new Error(
        `Content-Security-Policy received an invalid directive value for ${JSON.stringify(name)}. ${JSON.stringify(entry)} should be quoted`
      )
    : null;

// The text of a value whose entries are all strings, or null (some are functions of the request).
function stringifyValue(value) {
  if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string') ? value.join(' ') : null;
  if (value instanceof Set) return stringifyValue(Array.from(value));
  return null;
}

// The policy as its header (a string), or a Map of its directives when some value is computed per request.
function parseDirectives({ useDefaults = true, directives: rawDirectives = {} }) {
  const result = new Map(useDefaults ? Object.entries(getDefaultDirectives()) : []);
  let hasDisabledDefaultSrc = false;
  const seen = new Set();
  for (const rawName in rawDirectives) {
    if (!Object.hasOwn(rawDirectives, rawName)) continue;
    const name = parseDirectiveName(rawName);
    if (seen.has(name))
      throw new Error(`Content-Security-Policy received a duplicate directive ${JSON.stringify(name)}`);
    seen.add(name);
    const raw = rawDirectives[rawName];
    let value;
    if (raw === null) {
      if (name === 'default-src') {
        throw new Error(
          'Content-Security-Policy needs a default-src but it was set to `null`. If you really want to disable it, set it to `contentSecurityPolicy.dangerouslyDisableDefaultSrc`.'
        );
      }
      result.delete(name);
      continue;
    } else if (typeof raw === 'string') {
      value = [raw];
    } else if (raw === dangerouslyDisableDefaultSrc) {
      if (name !== 'default-src') {
        throw new Error(
          `Content-Security-Policy: tried to disable ${JSON.stringify(name)} as if it were default-src; simply omit the key`
        );
      }
      hasDisabledDefaultSrc = true;
      result.delete(name);
      continue;
    } else if (raw) {
      value = raw;
    } else {
      throw new Error(`Content-Security-Policy received an invalid directive value for ${JSON.stringify(name)}`);
    }
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const err = valueError(name, entry) ?? entryError(name, entry);
      if (err) throw err;
    }
    result.set(name, value);
  }
  if (!result.size) throw new Error('Content-Security-Policy has no directives. Either set some or disable the header');
  if (!result.has('default-src') && !hasDisabledDefaultSrc) {
    throw new Error(
      'Content-Security-Policy needs a default-src but none was provided. If you really want to disable it, set it to `contentSecurityPolicy.dangerouslyDisableDefaultSrc`.'
    );
  }
  const parts = [];
  for (const [name, value] of result) {
    const text = stringifyValue(value);
    if (text === null) return result;
    parts.push(text ? `${name} ${text}` : name);
  }
  return parts.join(';');
}

// The directives of a policy with functions: the text of each one whose values are all strings, made once (as helmet
// does for a policy of strings only), and [name, values] of the others, computed for each request.
function planOf(directives) {
  const plan = [];
  for (const [name, raw] of directives) {
    const text = stringifyValue(raw);
    plan.push(text === null ? [name, raw] : text ? `${name} ${text}` : name);
  }
  return plan;
}

// The header of a request, with the values its functions give (or the error of one).
function headerOf(req, res, plan) {
  const parts = [];
  for (const step of plan) {
    if (typeof step === 'string') {
      parts.push(step);
      continue;
    }
    const [name, raw] = step;
    let value = '';
    for (const entry of raw) {
      if (typeof entry === 'function') {
        let computed;
        try {
          computed = entry(req, res);
        } catch (err) {
          return err instanceof Error ? err : new Error(String(err));
        }
        const err = entryError(name, computed);
        if (err) return err;
        value += ` ${computed}`;
      } else {
        value += ` ${entry}`;
      }
    }
    if (value) {
      const err = valueError(name, value);
      if (err) return err;
      parts.push(`${name}${value}`);
    } else {
      parts.push(name);
    }
  }
  return parts.join(';');
}

/**
 * Content-Security-Policy: helmet's default policy, `directives` (camelCase or dashed names; null removes one of the
 * defaults; values are arrays or Sets of strings or functions of (req, res)), `useDefaults: false` for only the
 * directives given, `reportOnly` for the Report-Only header.
 */
function contentSecurityPolicy(options = {}) {
  const headerName = options.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const parsed = parseDirectives(options);
  if (typeof parsed === 'string') {
    const middleware = function contentSecurityPolicyMiddleware(req, res, next) {
      res.setHeader(headerName, parsed);
      next();
    };
    middleware.headers = { [headerName]: parsed };
    return middleware;
  }
  const plan = planOf(parsed);
  return function contentSecurityPolicyMiddleware(req, res, next) {
    const result = headerOf(req, res, plan);
    if (result instanceof Error) {
      next(result);
    } else {
      res.setHeader(headerName, result);
      next();
    }
  };
}
contentSecurityPolicy.getDefaultDirectives = getDefaultDirectives;
contentSecurityPolicy.dangerouslyDisableDefaultSrc = dangerouslyDisableDefaultSrc;

// --- The other headers ----------------------------------------------------------------------------------------------

// A middleware that sets one header to a value known when it is made (its `headers` say which).
function setting(functionName, name, value) {
  const middleware = {
    [functionName](req, res, next) {
      res.setHeader(name, value);
      next();
    },
  }[functionName];
  middleware.headers = { [name]: value };
  return middleware;
}

// A policy of a set of allowed ones.
function policyOf(header, allowed, policy) {
  if (allowed.has(policy)) return policy;
  throw new Error(`${header} does not support the ${JSON.stringify(policy)} policy`);
}

const EMBEDDER_POLICIES = new Set(['require-corp', 'credentialless', 'unsafe-none']);
const OPENER_POLICIES = new Set(['same-origin', 'same-origin-allow-popups', 'noopener-allow-popups', 'unsafe-none']);
const RESOURCE_POLICIES = new Set(['same-origin', 'same-site', 'cross-origin']);

function crossOriginEmbedderPolicy({ policy = 'require-corp' } = {}) {
  const value = policyOf('Cross-Origin-Embedder-Policy', EMBEDDER_POLICIES, policy);
  return setting('crossOriginEmbedderPolicyMiddleware', 'Cross-Origin-Embedder-Policy', value);
}

function crossOriginOpenerPolicy({ policy = 'same-origin' } = {}) {
  const value = policyOf('Cross-Origin-Opener-Policy', OPENER_POLICIES, policy);
  return setting('crossOriginOpenerPolicyMiddleware', 'Cross-Origin-Opener-Policy', value);
}

function crossOriginResourcePolicy({ policy = 'same-origin' } = {}) {
  const value = policyOf('Cross-Origin-Resource-Policy', RESOURCE_POLICIES, policy);
  return setting('crossOriginResourcePolicyMiddleware', 'Cross-Origin-Resource-Policy', value);
}

const originAgentCluster = () => setting('originAgentClusterMiddleware', 'Origin-Agent-Cluster', '?1');

const REFERRER_TOKENS = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
  '',
]);

function referrerPolicy({ policy = ['no-referrer'] } = {}) {
  const tokens = typeof policy === 'string' ? [policy] : policy;
  if (tokens.length === 0) throw new Error('Referrer-Policy received no policy tokens');
  const seen = new Set();
  tokens.forEach((token) => {
    if (!REFERRER_TOKENS.has(token)) {
      throw new Error(`Referrer-Policy received an unexpected policy token ${JSON.stringify(token)}`);
    } else if (seen.has(token)) {
      throw new Error(`Referrer-Policy received a duplicate policy token ${JSON.stringify(token)}`);
    }
    seen.add(token);
  });
  return setting('referrerPolicyMiddleware', 'Referrer-Policy', tokens.join(','));
}

const DEFAULT_MAX_AGE = 365 * 24 * 60 * 60;

function strictTransportSecurity(options = {}) {
  if ('maxage' in options) {
    throw new Error(
      'Strict-Transport-Security received an unsupported property, `maxage`. Did you mean to pass `maxAge`?'
    );
  }
  if ('includeSubdomains' in options) {
    throw new Error(
      'Strict-Transport-Security middleware should use `includeSubDomains` instead of `includeSubdomains`. (The correct one has an uppercase "D".)'
    );
  }
  const { maxAge = DEFAULT_MAX_AGE } = options;
  if (!(maxAge >= 0 && Number.isFinite(maxAge))) {
    throw new Error(
      `Strict-Transport-Security: ${JSON.stringify(maxAge)} is not a valid value for maxAge. Please choose a positive integer.`
    );
  }
  const directives = [`max-age=${Math.floor(maxAge)}`];
  if (options.includeSubDomains === undefined || options.includeSubDomains) directives.push('includeSubDomains');
  if (options.preload) directives.push('preload');
  return setting('strictTransportSecurityMiddleware', 'Strict-Transport-Security', directives.join('; '));
}

const xContentTypeOptions = () => setting('xContentTypeOptionsMiddleware', 'X-Content-Type-Options', 'nosniff');

const xDnsPrefetchControl = (options = {}) =>
  setting('xDnsPrefetchControlMiddleware', 'X-DNS-Prefetch-Control', options.allow ? 'on' : 'off');

const xDownloadOptions = () => setting('xDownloadOptionsMiddleware', 'X-Download-Options', 'noopen');

function xFrameOptions({ action = 'sameorigin' } = {}) {
  const normalized = typeof action === 'string' ? action.toUpperCase() : action;
  let value;
  if (normalized === 'SAME-ORIGIN') value = 'SAMEORIGIN';
  else if (normalized === 'DENY' || normalized === 'SAMEORIGIN') value = normalized;
  else throw new Error(`X-Frame-Options received an invalid action ${JSON.stringify(action)}`);
  return setting('xFrameOptionsMiddleware', 'X-Frame-Options', value);
}

const PERMITTED_POLICIES = new Set(['none', 'master-only', 'by-content-type', 'all']);

function xPermittedCrossDomainPolicies({ permittedPolicies = 'none' } = {}) {
  if (!PERMITTED_POLICIES.has(permittedPolicies)) {
    throw new Error(`X-Permitted-Cross-Domain-Policies does not support ${JSON.stringify(permittedPolicies)}`);
  }
  return setting('xPermittedCrossDomainPoliciesMiddleware', 'X-Permitted-Cross-Domain-Policies', permittedPolicies);
}

function xPoweredBy() {
  const middleware = function xPoweredByMiddleware(req, res, next) {
    res.removeHeader('X-Powered-By');
    next();
  };
  middleware.removes = ['X-Powered-By'];
  return middleware;
}

// X-XSS-Protection: 0 turns off the filters of old browsers (which made pages vulnerable).
const xXssProtection = () => setting('xXssProtectionMiddleware', 'X-XSS-Protection', '0');

// --- helmet() -------------------------------------------------------------------------------------------------------

// Each header: its option (and the old name of it), its middleware, whether it is on by default, and whether it takes
// options (those that do not warn when given some).
const HEADERS = [
  ['contentSecurityPolicy', null, contentSecurityPolicy, true, true],
  ['crossOriginEmbedderPolicy', null, crossOriginEmbedderPolicy, false, true],
  ['crossOriginOpenerPolicy', null, crossOriginOpenerPolicy, true, true],
  ['crossOriginResourcePolicy', null, crossOriginResourcePolicy, true, true],
  ['originAgentCluster', null, originAgentCluster, true, false, 'Origin-Agent-Cluster'],
  ['referrerPolicy', null, referrerPolicy, true, true],
  ['strictTransportSecurity', 'hsts', strictTransportSecurity, true, true, 'Strict-Transport-Security'],
  ['xContentTypeOptions', 'noSniff', xContentTypeOptions, true, false, 'X-Content-Type-Options'],
  ['xDnsPrefetchControl', 'dnsPrefetchControl', xDnsPrefetchControl, true, true, 'X-DNS-Prefetch-Control'],
  ['xDownloadOptions', 'ieNoOpen', xDownloadOptions, true, false, 'X-Download-Options'],
  ['xFrameOptions', 'frameguard', xFrameOptions, true, true, 'X-Frame-Options'],
  [
    'xPermittedCrossDomainPolicies',
    'permittedCrossDomainPolicies',
    xPermittedCrossDomainPolicies,
    true,
    true,
    'X-Permitted-Cross-Domain-Policies',
  ],
  ['xPoweredBy', 'hidePoweredBy', xPoweredBy, true, false, 'X-Powered-By'],
  ['xXssProtection', 'xssFilter', xXssProtection, true, false, 'X-XSS-Protection'],
];

// The middlewares of helmet's options, in helmet's order.
function middlewaresOf(options) {
  const result = [];
  for (const [name, alias, make, byDefault, takesOptions, header] of HEADERS) {
    if (alias && name in options && alias in options) {
      throw new Error(`${header} option was specified twice. Remove the \`${alias}\` option to fix this error.`);
    }
    const option = alias ? (options[name] ?? options[alias]) : options[name];
    if (option === false || (option === undefined && !byDefault)) continue;
    if (option === undefined || option === true) {
      result.push(make());
    } else if (takesOptions) {
      result.push(make(option));
    } else {
      console.warn(`${header} does not take options. Remove the property to silence this warning.`);
      result.push(make());
    }
  }
  return result;
}

/** The middleware of all the headers, each on by default (Cross-Origin-Embedder-Policy off) or as its option says. */
function helmet(options = {}) {
  if (options.constructor?.name === 'IncomingMessage') {
    throw new Error('It appears you have done something like `app.use(helmet)`, but it should be `app.use(helmet())`.');
  }
  const middlewares = middlewaresOf(options);
  const fixed = fixedOf(middlewares);
  // Headers known when made (the policy has no functions), as most are: set them in one loop, no chain of calls.
  if (fixed) {
    // In helmet's order: [name, value] to set, [name] to remove.
    const { steps } = fixed;
    return function helmetMiddleware(req, res, next) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.length === 2) res.setHeader(step[0], step[1]);
        else res.removeHeader(step[0]);
      }
      next();
    };
  }
  return function helmetMiddleware(req, res, next) {
    let index = 0;
    (function internalNext(err) {
      if (err) {
        next(err);
        return;
      }
      const middleware = middlewares[index];
      if (middleware) {
        index++;
        middleware(req, res, internalNext);
      } else {
        next();
      }
    })();
  };
}

// The headers of middlewares that all know theirs when made: { set, removed }, or null.
function fixedOf(middlewares) {
  const set = {};
  const removed = [];
  const steps = [];
  for (const middleware of middlewares) {
    if (middleware.removes) {
      removed.push(...middleware.removes);
      for (const name of middleware.removes) steps.push([name]);
    } else if (middleware.headers) {
      Object.assign(set, middleware.headers);
      for (const entry of Object.entries(middleware.headers)) steps.push(entry);
    } else {
      return null;
    }
  }
  // (A header set and then removed is not set: only X-Powered-By is removed, and none sets it.)
  return { set, removed, steps };
}

/** What helmet(options) does to every response: { set: { header: value }, removed: [header] }; null when the
 * policy has values computed per request. For servers that set headers their own way (native routes). */
function staticHeaders(options = {}) {
  const fixed = fixedOf(middlewaresOf(options));
  return fixed && { set: fixed.set, removed: fixed.removed };
}

Object.assign(helmet, {
  contentSecurityPolicy,
  crossOriginEmbedderPolicy,
  crossOriginOpenerPolicy,
  crossOriginResourcePolicy,
  originAgentCluster,
  referrerPolicy,
  strictTransportSecurity,
  xContentTypeOptions,
  xDnsPrefetchControl,
  xDownloadOptions,
  xFrameOptions,
  xPermittedCrossDomainPolicies,
  xPoweredBy,
  xXssProtection,
  // The old names.
  dnsPrefetchControl: xDnsPrefetchControl,
  xssFilter: xXssProtection,
  permittedCrossDomainPolicies: xPermittedCrossDomainPolicies,
  ieNoOpen: xDownloadOptions,
  noSniff: xContentTypeOptions,
  frameguard: xFrameOptions,
  hidePoweredBy: xPoweredBy,
  hsts: strictTransportSecurity,
  // xufa's: what it sets on every response.
  staticHeaders,
});

export {
  helmet,
  staticHeaders,
  contentSecurityPolicy,
  crossOriginEmbedderPolicy,
  crossOriginOpenerPolicy,
  crossOriginResourcePolicy,
  originAgentCluster,
  referrerPolicy,
  strictTransportSecurity,
  xContentTypeOptions,
  xDnsPrefetchControl,
  xDownloadOptions,
  xFrameOptions,
  xPermittedCrossDomainPolicies,
  xPoweredBy,
  xXssProtection,
  dangerouslyDisableDefaultSrc,
  getDefaultDirectives,
};
