// Messages in the languages of an app: catalogs by locale (objects of keys, nested or with dots), the language of each
// request (kept in its async context, so code far from the request, as the validation of the ORM, speaks it), words
// in the plural by the rules of each language (Intl.PluralRules), parameters ({name}), and the languages a locale
// falls back to (es-AR, then es, then the fallback).
//
//   const i18n = new I18n({ fallback: 'en', locales: { en: { cart: { items: { one: '{count} item', other: '{count} items' } } }, es: {...} } });
//   i18n.t('cart.items', { count: 3 }, 'es');     // or in a request: request.t('cart.items', { count: 3 })
import { AsyncLocalStorage } from 'node:async_hooks';
import * as ormMessagesModule from './orm-messages.js';
import * as authMessagesModule from './auth-messages.js';
import * as adminMessagesModule from './admin-messages.js';
import * as formsMessagesModule from './forms-messages.js';

class I18nError extends Error {
  constructor(message) {
    super(message);
    this.name = 'I18nError';
    this.code = 'XUFA_I18N_ERR';
  }
}

const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

// A locale as BCP 47 writes it: es-ar gives es-AR, EN gives en.
function normalize(locale) {
  if (typeof locale !== 'string' || !/^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i.test(locale)) return null;
  const [language, ...rest] = locale.replace(/_/g, '-').split('-');
  return [
    language.toLowerCase(),
    ...rest.map((part) =>
      part.length === 2
        ? part.toUpperCase()
        : part.length === 4
          ? part[0].toUpperCase() + part.slice(1).toLowerCase()
          : part.toLowerCase()
    ),
  ].join('-');
}

// The objects of a catalog merged into another (nested keys), and keys with dots made nested.
function merge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    const parts = key.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object' || isPlural(node[parts[i]])) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value && typeof value === 'object' && !isPlural(value)) {
      if (!node[last] || typeof node[last] !== 'object' || isPlural(node[last])) node[last] = {};
      merge(node[last], value);
    } else node[last] = value;
  }
  return target;
}

// A message in the plural: an object of the forms of Intl.PluralRules (other is needed).
function isPlural(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.other === 'string' &&
    Object.keys(value).every((key) => PLURAL_FORMS.has(key))
  );
}

const fill = (text, params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) =>
    params && params[name] !== undefined && params[name] !== null ? String(params[name]) : whole
  );

class I18n {
  // locales: { locale: catalog }. fallback: the language every locale falls back to ('en'). missing(key, locale): what
  // a key with no message gives (the key).
  constructor({ locales = {}, fallback = 'en', missing = null } = {}) {
    this.fallback = normalize(fallback);
    if (!this.fallback) throw new I18nError(`Not a locale: ${fallback}`);
    this.catalogs = new Map();
    this.missing = missing;
    this.context = new AsyncLocalStorage();
    this.plurals = new Map();
    for (const [locale, catalog] of Object.entries(locales)) this.add(locale, catalog);
  }

  // Adds messages to the catalog of a locale (over those it has).
  add(locale, catalog) {
    const name = normalize(locale);
    if (!name) throw new I18nError(`Not a locale: ${locale}`);
    if (!catalog || typeof catalog !== 'object')
      throw new I18nError(`The catalog of ${locale} is an object of messages`);
    const current = this.catalogs.get(name) || {};
    this.catalogs.set(name, merge(current, catalog));
    return this;
  }

  // The locales with a catalog.
  get locales() {
    return [...this.catalogs.keys()];
  }

  // The locale of this async context (a request), or the fallback.
  get locale() {
    const store = this.context.getStore();
    return (store && store.locale) || this.fallback;
  }

  // Runs fn in a locale: everything it calls speaks it.
  run(locale, fn) {
    return this.context.run({ locale: normalize(locale) || this.fallback }, fn);
  }

  // The locale for the rest of this async context (a hook of a request).
  enter(locale) {
    this.context.enterWith({ locale: normalize(locale) || this.fallback });
  }

  // The locales a locale looks in, in order: es-AR, es, then the fallback.
  chain(locale) {
    const name = normalize(locale) || this.fallback;
    const out = [];
    const parts = name.split('-');
    for (let i = parts.length; i > 0; i -= 1) out.push(parts.slice(0, i).join('-'));
    if (!out.includes(this.fallback)) out.push(this.fallback);
    return out;
  }

  // The message of a key in one locale (no fallback), or undefined.
  lookup(key, locale) {
    const catalog = this.catalogs.get(locale);
    if (!catalog) return undefined;
    if (Object.hasOwn(catalog, key) && typeof catalog[key] !== 'object') return catalog[key];
    let node = catalog;
    for (const part of String(key).split('.')) {
      if (!node || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined;
      node = node[part];
    }
    return typeof node === 'string' || isPlural(node) ? node : undefined;
  }

  // Whether a key has a message in a locale (or in those it falls back to).
  has(key, locale = this.locale) {
    return this.chain(locale).some((name) => this.lookup(key, name) !== undefined);
  }

  pluralOf(locale) {
    let rules = this.plurals.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      this.plurals.set(locale, rules);
    }
    return rules;
  }

  // The message of a key with its parameters, in a locale (this context's by default): the first locale of its chain
  // that has it; plurals by params.count (zero, when the message has it, for 0).
  t(key, params = {}, locale = this.locale) {
    for (const name of this.chain(locale)) {
      const found = this.lookup(key, name);
      if (found === undefined) continue;
      if (typeof found === 'string') return fill(found, params);
      const count = Number(params.count);
      const form =
        count === 0 && found.zero !== undefined
          ? 'zero'
          : this.pluralOf(name).select(Number.isFinite(count) ? count : 0);
      return fill(found[form] !== undefined ? found[form] : found.other, params);
    }
    return this.missing ? this.missing(key, locale, params) : key;
  }

  // The locale of these, of those with a catalog: the first that has one (es-AR given, es there, gives es), or null.
  match(wanted) {
    const available = this.locales;
    for (const given of wanted) {
      const name = normalize(given);
      if (!name) continue;
      if (available.includes(name)) return name;
      const language = name.split('-')[0];
      if (available.includes(language)) return language;
      const regional = available.find((item) => item.split('-')[0] === language);
      if (regional) return regional;
    }
    return null;
  }

  // Numbers, dates and lists in the locale of this context.
  number(value, options) {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  date(value, options = { dateStyle: 'medium' }) {
    return new Intl.DateTimeFormat(this.locale, options).format(value instanceof Date ? value : new Date(value));
  }

  list(values, options) {
    return new Intl.ListFormat(this.locale, options).format(values);
  }

  // The messages of the validation of @xufa/orm in the locale of each request: the translations of xufa (es, fr, de,
  // pt, it) under orm.*, over which those of the catalogs go, and the English of the ORM for the languages without.
  translateOrm(orm, { messages = true } = {}) {
    if (!orm || typeof orm.setTranslator !== 'function') throw new I18nError('translateOrm(orm): the module @xufa/orm');
    return this.install(orm, 'orm', messages ? ormMessagesModule : null);
  }

  // The messages users read of logins, passwords, authenticator apps and accounts (and their emails) of @xufa/auth,
  // under auth.*, as translateOrm.
  translateAuth(auth, { messages = true } = {}) {
    if (!auth || typeof auth.setTranslator !== 'function' || !auth.AUTH_MESSAGES) {
      throw new I18nError('translateAuth(auth): the module @xufa/auth');
    }
    return this.install(auth, 'auth', messages ? authMessagesModule : null);
  }

  // The messages of the API of @xufa/admin, under admin.*, as translateOrm (its logins are those of translateAuth).
  translateAdmin(admin, { messages = true } = {}) {
    if (!admin || typeof admin.setTranslator !== 'function' || !admin.ADMIN_MESSAGES) {
      throw new I18nError('translateAdmin(admin): the module @xufa/admin');
    }
    return this.install(admin, 'admin', messages ? adminMessagesModule : null);
  }

  // The messages of the forms of @xufa/forms (their fields and ModelForms), under forms.*, as translateOrm.
  translateForms(forms, { messages = true } = {}) {
    if (!forms || typeof forms.setTranslator !== 'function' || !forms.FORMS_MESSAGES) {
      throw new I18nError('translateForms(forms): the module @xufa/forms');
    }
    return this.install(forms, 'forms', messages ? formsMessagesModule : null);
  }

  // The translations of xufa of a module (by locale) under its namespace, the app's catalogs over them; and its
  // translator: a key the catalogs have, in the locale of the context, else the English of the module.
  install(module, namespace, bundled) {
    for (const [locale, catalog] of Object.entries(bundled || {})) {
      const own = this.catalogs.get(locale);
      this.catalogs.set(locale, merge(merge({}, { [namespace]: catalog }), own || {}));
    }
    module.setTranslator((key, params, english) => (this.has(key) ? this.t(key, params) : english));
    return this;
  }

  // A filter of @xufa/template: {{ 'cart.items' | t({ count }) }}.
  get filter() {
    return (key, params) => this.t(key, params);
  }
}

export { I18n, I18nError, normalize, isPlural };
