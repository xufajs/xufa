import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The language of the page of the admin for a request, and its catalog (the texts of client/src by their English): the
// language given (option language), that the user chose in the page (its cookie), that of the request (request.locale
// of @xufa/i18n), or the first of its Accept-Language the admin has (es, fr, de, pt, it, and those of the option
// uiMessages); English otherwise.
const BUNDLED = ['es', 'fr', 'de', 'pt', 'it'];
// The cookie of the language chosen in the page (its menu).
const LANGUAGE_COOKIE = 'xufa-admin-language';
// Each language by its own name, for the menu.
const NAMES = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
};
const loaded = new Map();

function bundled(language) {
  if (!BUNDLED.includes(language)) return {};
  // Loaded when a page asks for it (require() of an ES module: its default export).
  if (!loaded.has(language)) loaded.set(language, require(`./ui-messages/${language}.js`).default);
  return loaded.get(language);
}

// The languages of an Accept-Language header, by their weight (es-ES;q=0.9 gives es-ES and es).
function wanted(header) {
  return String(header || '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((param) => /^\s*q=([\d.]+)/.exec(param)).find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q[1]) : 1, index };
    })
    .filter((item) => item.tag && item.tag !== '*' && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .flatMap((item) => [item.tag, item.tag.split('-')[0]]);
}

// The language of the cookie of a request, or null.
function chosen(request) {
  const header = request && request.headers ? String(request.headers.cookie || '') : '';
  const found = header
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === LANGUAGE_COOKIE);
  return found && found[1] ? decodeURIComponent(found[1]).toLowerCase() : null;
}

// { language, uiMessages }: the options of the admin. Gives { locale, messages, languages }: languages, those the
// user may choose ([{ tag, name }]), none when the option language fixes it.
function uiOf(request, { language = null, uiMessages = {} } = {}) {
  const available = new Set(['en', ...BUNDLED, ...Object.keys(uiMessages)]);
  const candidates = [
    language,
    chosen(request),
    request && request.locale ? String(request.locale).toLowerCase() : null,
    request && request.locale ? String(request.locale).toLowerCase().split('-')[0] : null,
    ...wanted(request && request.headers ? request.headers['accept-language'] : ''),
  ].filter(Boolean);
  const locale = candidates.find((tag) => available.has(tag)) || 'en';
  const messages = { ...bundled(locale), ...(uiMessages[locale] || {}) };
  const languages = language ? [] : [...available].map((tag) => ({ tag, name: NAMES[tag] || tag }));
  return { locale, messages, languages };
}

// A text of the page on the server, in its language.
function translate(ui, text, params = {}) {
  const found = ui && Object.hasOwn(ui.messages, text) ? ui.messages[text] : text;
  return found.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
}

export { uiOf, translate, BUNDLED, LANGUAGE_COOKIE };
