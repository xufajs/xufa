// The page of the admin in the language of each request: its catalog (es, fr, de, pt, it) has every text of the
// client (each t() of client/src) with the same parameters; the language is the option language, request.locale (of
// @xufa/i18n), or the Accept-Language; uiMessages of the app go over the texts of the admin, or add languages.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { admin } from '../index.js';
import { texts } from '../client/texts.js';
import { BUNDLED } from '../lib/ui-locale.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

class Shelf extends Model {
  static fields = { name: fields.string() };
}

async function setUp(options = {}, hook = null) {
  const db = new Database({ backend: 'memory' }).register(Shelf);
  await db.sync();
  const app = xufa();
  if (hook) app.addHook('onRequest', hook);
  app.register(admin, { prefix: '/admin', models: [Shelf], authorize: () => true, ...options });
  await app.ready();
  return app;
}

// The catalog the page got: { locale, messages }.
const catalogOf = (html) => JSON.parse(/<script type="application\/json" id="xufa-admin-i18n">([^<]*)<\/script>/.exec(html)[1]);

describe('the languages of the page of the admin', () => {
  it('every text of the client in each language, with the same parameters', () => {
    const all = texts();
    expect(all.length).toBeGreaterThan(300);
    for (const language of BUNDLED) {
      const catalog = require(`../lib/ui-messages/${language}.js`).default; // eslint-disable-line global-require
      expect([language, all.filter((text) => !Object.hasOwn(catalog, text))]).toEqual([language, []]);
      expect([language, Object.keys(catalog).filter((text) => !all.includes(text))]).toEqual([language, []]);
      for (const text of all) expect([language, text, params(catalog[text])]).toEqual([language, text, params(text)]);
    }
  });

  it('the language of the request (Accept-Language), its lang and catalog in the page; English without one', async () => {
    const app = await setUp();
    const fr = await app.inject({ url: '/admin/', headers: { 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.5' } });
    expect(fr.body).toContain('<html lang="fr">');
    expect(fr.body).toContain('<noscript>L’admin a besoin de JavaScript.</noscript>');
    const { locale, messages } = catalogOf(fr.body);
    expect([locale, messages.Save, messages['{count} of {total}']]).toEqual(['fr', 'Enregistrer', '{count} sur {total}']);
    // A language it has not: the next one wanted, else English (and no texts).
    const next = await app.inject({ url: '/admin/', headers: { 'accept-language': 'ja, de;q=0.8' } });
    expect(catalogOf(next.body).locale).toBe('de');
    const en = catalogOf((await app.inject('/admin/')).body);
    expect([en.locale, en.messages]).toEqual(['en', {}]);
    // The languages of the menu, each by its own name.
    expect(en.languages.map(({ tag, name }) => `${tag} ${name}`)).toEqual([
      'en English',
      'es Español',
      'fr Français',
      'de Deutsch',
      'pt Português',
      'it Italiano',
    ]);
    await app.close();
  });

  it('the language chosen in the menu (its cookie) over that of the browser', async () => {
    const app = await setUp();
    const chosen = await app.inject({
      url: '/admin/',
      headers: { 'accept-language': 'es', cookie: 'other=1; xufa-admin-language=de' },
    });
    expect(catalogOf(chosen.body).locale).toBe('de');
    expect(chosen.body).toContain('<html lang="de">');
    // English chosen: over a browser in Spanish.
    const english = await app.inject({ url: '/admin/', headers: { 'accept-language': 'es', cookie: 'xufa-admin-language=en' } });
    expect(catalogOf(english.body).locale).toBe('en');
    // A language it has not: that of the browser.
    const unknown = await app.inject({ url: '/admin/', headers: { 'accept-language': 'es', cookie: 'xufa-admin-language=ja' } });
    expect(catalogOf(unknown.body).locale).toBe('es');
    await app.close();
  });

  it('the option language, request.locale of @xufa/i18n, and the texts of the app (uiMessages)', async () => {
    const forced = await setUp({ language: 'it' });
    const fixed = catalogOf(
      (await forced.inject({ url: '/admin/', headers: { 'accept-language': 'es', cookie: 'xufa-admin-language=fr' } }))
        .body
    );
    // The option over the menu, which has no languages then.
    expect([fixed.locale, fixed.languages]).toEqual(['it', []]);
    await forced.close();
    const located = await setUp({}, async (request) => {
      request.locale = 'pt-BR';
    });
    expect(catalogOf((await located.inject('/admin/')).body).locale).toBe('pt');
    await located.close();
    const own = await setUp({ uiMessages: { es: { Save: 'Grabar' }, ca: { Save: 'Desa' } } });
    expect(catalogOf((await own.inject({ url: '/admin/', headers: { 'accept-language': 'es' } })).body).messages.Save).toBe(
      'Grabar'
    );
    const catalan = catalogOf((await own.inject({ url: '/admin/', headers: { 'accept-language': 'ca' } })).body);
    expect([catalan.locale, catalan.messages]).toEqual(['ca', { Save: 'Desa' }]);
    await own.close();
    await expect(setUp({ uiMessages: [] })).rejects.toThrow('uiMessages of the admin is');
  });

  it('no text of the catalog closes its script', async () => {
    const app = await setUp({ uiMessages: { es: { Save: '</script><b>x' } } });
    const page = (await app.inject({ url: '/admin/', headers: { 'accept-language': 'es' } })).body;
    expect(page).not.toContain('</script><b>');
    expect(catalogOf(page).messages.Save).toBe('</script><b>x');
    await app.close();
  });
});
