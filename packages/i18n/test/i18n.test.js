// @xufa/i18n: catalogs (nested and with dots), parameters, the chain of a locale (es-AR, es, the fallback), keys
// without a message, plurals by the rules of each language (and zero), numbers and dates in the locale of the context,
// matching the locales wanted with those there are, Accept-Language; the plugin (the locale of each request by query,
// cookie, the user or the header; request.t; Content-Language and Vary; the async context of the request); the
// validation messages of @xufa/orm in the language of the request; and the filter of @xufa/template.
import xufa from '@xufa/http';
import * as orm from '@xufa/orm';
import { TemplateEngine } from '@xufa/template';
import { I18n, I18nError, plugin, acceptedLanguages, normalize } from '../index.js';

const { Database, Model, fields } = orm;

const catalogs = {
  en: {
    hello: 'Hello, {name}!',
    cart: { items: { zero: 'Your cart is empty', one: '{count} item', other: '{count} items' }, title: 'Cart' },
    'books.pages.positive': 'Pages are more than 0.',
  },
  es: {
    hello: '¡Hola, {name}!',
    cart: { items: { one: '{count} artículo', other: '{count} artículos' } },
    'books.pages.positive': 'Las páginas son más de 0.',
  },
  'es-AR': { hello: '¡Hola, {name}! ¿Todo bien?' },
  ru: { files: { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' } },
};

describe('I18n', () => {
  const i18n = new I18n({ locales: catalogs, fallback: 'en' });

  it('messages with parameters; the chain of a locale; keys without a message', () => {
    expect(i18n.t('hello', { name: 'Ada' }, 'en')).toBe('Hello, Ada!');
    expect(i18n.t('hello', { name: 'Ada' }, 'es')).toBe('¡Hola, Ada!');
    expect(i18n.t('hello', { name: 'Ada' }, 'es-AR')).toBe('¡Hola, Ada! ¿Todo bien?');
    expect(i18n.t('hello', { name: 'Ada' }, 'es-MX')).toBe('¡Hola, Ada!');
    // es has no cart.title: English.
    expect(i18n.t('cart.title', {}, 'es-AR')).toBe('Cart');
    expect(i18n.t('books.pages.positive', {}, 'es')).toBe('Las páginas son más de 0.');
    expect(i18n.t('nope.nothing', {}, 'es')).toBe('nope.nothing');
    expect(i18n.t('hello', {}, 'en')).toBe('Hello, {name}!');
    expect(new I18n({ locales: catalogs, missing: (key, locale) => `[${locale}:${key}]` }).t('x', {}, 'es')).toBe(
      '[es:x]'
    );
    expect(i18n.chain('es-AR')).toEqual(['es-AR', 'es', 'en']);
    expect(i18n.has('cart.title', 'es')).toBe(true);
    expect(i18n.has('cart', 'es')).toBe(false);
    expect(i18n.locales).toEqual(['en', 'es', 'es-AR', 'ru']);
  });

  it('plurals by the rules of each language, and zero when the message has it', () => {
    expect([0, 1, 2].map((count) => i18n.t('cart.items', { count }, 'en'))).toEqual([
      'Your cart is empty',
      '1 item',
      '2 items',
    ]);
    expect([0, 1, 5].map((count) => i18n.t('cart.items', { count }, 'es'))).toEqual([
      '0 artículos',
      '1 artículo',
      '5 artículos',
    ]);
    expect([1, 3, 5, 21].map((count) => i18n.t('files', { count }, 'ru'))).toEqual([
      '1 файл',
      '3 файла',
      '5 файлов',
      '21 файл',
    ]);
  });

  it('the locale of the async context; numbers, dates and lists in it', async () => {
    expect(i18n.locale).toBe('en');
    await i18n.run('es', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(i18n.locale).toBe('es');
      expect(i18n.t('hello', { name: 'Bo' })).toBe('¡Hola, Bo!');
      expect(i18n.number(1234.5)).toBe('1234,5');
      expect(i18n.number(12345.5)).toBe('12.345,5');
      expect(i18n.list(['a', 'b', 'c'])).toBe('a, b y c');
      expect(i18n.date(new Date(Date.UTC(2026, 9, 8, 12)), { dateStyle: 'long', timeZone: 'UTC' })).toBe(
        '8 de octubre de 2026'
      );
    });
    expect(i18n.locale).toBe('en');
  });

  it('matches the locales wanted with those there are; Accept-Language; normalize', () => {
    expect(i18n.match(['fr', 'es-ES', 'en'])).toBe('es');
    expect(i18n.match(['es-AR'])).toBe('es-AR');
    expect(i18n.match(['pt-BR', 'de'])).toBe(null);
    expect(new I18n({ locales: { 'pt-BR': { a: 'b' } } }).match(['pt'])).toBe('pt-BR');
    expect(acceptedLanguages('fr;q=0.5, es-ES,es;q=0.9, *;q=0.1, en;q=0')).toEqual(['es-ES', 'es', 'fr']);
    expect(acceptedLanguages(undefined)).toEqual([]);
    expect([normalize('ES_ar'), normalize('zh-hant-tw'), normalize('nope!')]).toEqual(['es-AR', 'zh-Hant-TW', null]);
    expect(() => new I18n({ fallback: 'not a locale!' })).toThrow(I18nError);
    expect(() => i18n.add('es', 'x')).toThrow('an object of messages');
  });

  it('the filter of @xufa/template', () => {
    const engine = new TemplateEngine({ filters: { t: i18n.filter } });
    expect(i18n.run('es', () => engine.render("{{ 'cart.items' | t({ count: n }) }}", { n: 3 }))).toBe('3 artículos');
  });
});

describe('the plugin', () => {
  async function makeApp(options = {}) {
    const i18n = new I18n({ locales: catalogs });
    const app = xufa();
    app.register(plugin, { i18n, ...options });
    // The locale far from the request: after an await, in code that only knows the I18n.
    const later = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return i18n.t('hello', { name: 'later' });
    };
    app.get('/hello', async (request) => ({
      locale: request.locale,
      text: request.t('hello', { name: 'Ada' }),
      later: await later(),
    }));
    await app.ready();
    return app;
  }

  it('the locale of each request: query, cookie, header, the fallback; Content-Language and Vary', async () => {
    const app = await makeApp();
    const header = await app.inject({ url: '/hello', headers: { 'accept-language': 'es-AR,es;q=0.9,en;q=0.5' } });
    expect(header.json()).toEqual({
      locale: 'es-AR',
      text: '¡Hola, Ada! ¿Todo bien?',
      later: '¡Hola, later! ¿Todo bien?',
    });
    expect([header.headers['content-language'], header.headers.vary]).toEqual(['es-AR', 'Accept-Language']);
    const cookie = await app.inject({ url: '/hello', headers: { cookie: 'a=b; lang=es', 'accept-language': 'en' } });
    expect([cookie.json().locale, cookie.headers.vary]).toEqual(['es', undefined]);
    const query = await app.inject({ url: '/hello?lang=en', headers: { cookie: 'lang=es' } });
    expect(query.json().locale).toBe('en');
    const none = await app.inject({ url: '/hello', headers: { 'accept-language': 'ja' } });
    expect(none.json()).toMatchObject({ locale: 'en', text: 'Hello, Ada!' });
    await app.close();
  });

  it('detect: the user, or functions of the request; contentLanguage: false', async () => {
    const app = await makeApp({
      detect: [(request) => request.headers['x-locale'], 'user', 'header'],
      user: (request) => (request.headers['x-user'] === 'bo' ? 'es' : null),
      contentLanguage: false,
    });
    const own = await app.inject({ url: '/hello', headers: { 'x-locale': 'es-AR' } });
    expect([own.json().locale, own.headers['content-language']]).toEqual(['es-AR', undefined]);
    expect(
      (await app.inject({ url: '/hello', headers: { 'x-user': 'bo', 'accept-language': 'en' } })).json().locale
    ).toBe('es');
    await app.close();
    await expect(makeApp({ detect: ['moon'] })).rejects.toThrow('detect: query, cookie, user, header');
    const bare = xufa();
    bare.register(plugin, {});
    await expect(bare.ready()).rejects.toThrow('needs { i18n }');
  });
});

describe('the messages of @xufa/orm', () => {
  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 10 }),
      pages: fields.integer({ null: true, validate: { rule: 'value > 0', message: 'books.pages.positive' } }),
      rating: fields.integer({ null: true, max: 5 }),
    };
  }
  let i18n;
  let app;

  beforeAll(async () => {
    const db = new Database({ backend: 'memory' }).register(Book);
    await db.sync();
    i18n = new I18n({ locales: { ...catalogs, es: { ...catalogs.es, orm: { max: 'Como mucho {max}, por favor.' } } } });
    i18n.translateOrm(orm);
    app = xufa();
    app.register(plugin, { i18n });
    app.register(orm.plugin, { database: db });
    app.post('/books', async (request) => Book.objects.create(request.body));
    await app.ready();
  });

  afterAll(async () => {
    orm.setTranslator(null);
    await app.close();
  });

  const post = (language, payload) =>
    app.inject({ method: 'POST', url: '/books', headers: { 'accept-language': language }, payload });

  it('in the language of the request: those of xufa, those of the catalogs over them, and the messages of rules as keys', async () => {
    const es = await post('es', { title: 'A title that is too long', pages: 0, rating: 9 });
    expect(es.statusCode).toBe(400);
    expect(es.json().errors).toEqual({
      title: ['Asegúrate de que este valor tenga como máximo 10 caracteres (tiene 24).'],
      pages: ['Las páginas son más de 0.'],
      rating: ['Como mucho 5, por favor.'],
    });
    const fr = await post('fr', { pages: 'many' });
    expect(fr.json().errors).toEqual({
      title: ['Ce champ est obligatoire.'],
      pages: ['La valeur doit être un nombre entier.'],
    });
    const de = await post('de', { title: 'ok', rating: 7 });
    expect(de.json().errors.rating).toEqual(['Dieser Wert muss kleiner oder gleich 5 sein.']);
    // A language without them: English, as the ORM says it.
    const ja = await post('ja', { title: 'ok', pages: -1 });
    expect(ja.json().errors).toEqual({ pages: ['Pages are more than 0.'] });
    // Outside a request: the fallback.
    expect(() => new Book({ title: 'x'.repeat(11) }).validate()).toThrow(/Ensure this value has at most 10 characters/);
    expect(orm.validationMessage('unique')).toBe('There is already one with this value.');
    expect(i18n.run('pt', () => orm.validationMessage('unique'))).toBe('Já existe um com este valor.');
  });
});
