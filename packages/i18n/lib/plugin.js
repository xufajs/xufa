// The plugin of @xufa/http (and fastify): the locale of each request, of those the I18n has catalogs of, found by
// `detect` in order (a query parameter, a cookie, the user, the header Accept-Language), or the fallback; kept as
// request.locale and in the async context of the request (so i18n.t(), and the messages of the ORM, speak it);
// request.t(key, params); and Content-Language in the answers (Vary: Accept-Language when the header decides).
//
//   app.register(i18n.plugin, { i18n, detect: ['query', 'cookie', 'header'] });
//   app.get('/cart', (request) => ({ title: request.t('cart.title') }));
import { I18n } from './i18n.js';

// The languages of an Accept-Language header, by their q (the order given for the same q): ['es-ES', 'es', 'en'].
function acceptedLanguages(header) {
  if (typeof header !== 'string' || header.length > 1000) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((item) => item.tag && item.tag !== '*' && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((item) => item.tag);
}

function cookieOf(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return null;
}

const DETECTORS = ['query', 'cookie', 'user', 'header'];

function i18nPlugin(app, options, done) {
  const {
    i18n,
    detect = ['query', 'cookie', 'header'],
    query = 'lang',
    cookie = 'lang',
    user = null,
    contentLanguage = true,
  } = options || {};
  if (!(i18n instanceof I18n)) {
    done(new TypeError('The plugin of @xufa/i18n needs { i18n }: an I18n'));
    return;
  }
  const unknown = detect.find((item) => typeof item !== 'function' && !DETECTORS.includes(item));
  if (unknown) {
    done(new TypeError(`detect: ${DETECTORS.join(', ')} or functions of the request (not ${unknown})`));
    return;
  }

  // The locale of a request, and whether the header decided it.
  const localeOf = (request) => {
    for (const item of detect) {
      let wanted = [];
      if (typeof item === 'function') wanted = [].concat(item(request) || []);
      else if (item === 'query') wanted = [request.query && request.query[query]].filter(Boolean);
      else if (item === 'cookie') wanted = [cookieOf(request.headers.cookie, cookie)].filter(Boolean);
      else if (item === 'user') wanted = [user ? user(request) : request.user && request.user.locale].filter(Boolean);
      else wanted = acceptedLanguages(request.headers['accept-language']);
      const found = i18n.match(wanted.map(String));
      if (found) return { locale: found, byHeader: item === 'header' };
    }
    return { locale: i18n.fallback, byHeader: detect.includes('header') };
  };

  app.decorateRequest('locale', null);
  app.decorateRequest('t', function t(key, params) {
    return i18n.t(key, params, this.locale || i18n.locale);
  });
  app.decorate('i18n', i18n);
  // Entered now (before any await of the handler), so the handler and what it calls run in the locale.
  app.addHook('onRequest', (request, reply, next) => {
    const { locale, byHeader } = localeOf(request);
    request.locale = locale;
    i18n.enter(locale);
    if (contentLanguage) {
      reply.header('content-language', locale);
      if (byHeader) reply.header('vary', 'Accept-Language');
    }
    next();
  });
  done();
}

i18nPlugin[Symbol.for('skip-override')] = true;
i18nPlugin[Symbol.for('fastify.display-name')] = '@xufa/i18n';
i18nPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/i18n' };

export { i18nPlugin, acceptedLanguages };
