// The messages of @xufa/auth (logins, accounts and their emails) and of @xufa/admin (its API) in the language of each
// request: the bundled catalogs have every key of the English with its parameters, and requests get them.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import * as auth from '@xufa/auth';
import * as admin from '@xufa/admin';
import { sessionPlugin } from '@xufa/session';
import { I18n, plugin } from '../index.js';
import * as authCatalogs from '../lib/auth-messages.js';
import * as adminCatalogs from '../lib/admin-messages.js';
import * as forms from '@xufa/forms';
import * as formsCatalogs from '../lib/forms-messages.js';

const paramsOf = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('the messages of @xufa/auth and @xufa/admin', () => {
  it('each bundled language has every key of the English, with the same parameters', () => {
    for (const [catalogs, english] of [
      [authCatalogs, auth.AUTH_MESSAGES],
      [adminCatalogs, admin.ADMIN_MESSAGES],
      [formsCatalogs, forms.FORMS_MESSAGES],
    ]) {
      expect(Object.keys(catalogs).sort()).toEqual(['de', 'es', 'fr', 'it', 'pt']);
      for (const [locale, catalog] of Object.entries(catalogs)) {
        expect([locale, Object.keys(catalog).sort()]).toEqual([locale, Object.keys(english).sort()]);
        for (const [key, text] of Object.entries(catalog)) {
          expect([locale, key, paramsOf(text)]).toEqual([locale, key, paramsOf(english[key])]);
        }
      }
    }
  });

  describe('in requests', () => {
    class Member extends Model {
      static fields = {
        email: fields.string({ unique: true }),
        password: fields.string(),
      };
    }
    let app;
    const sent = [];

    beforeAll(async () => {
      const db = new Database({ backend: 'memory' }).register(Member);
      await db.sync();
      await Member.objects.create({
        email: 'ada@example.com',
        password: await auth.hashPassword('right-horse-battery', { ln: 4 }),
      });
      const i18n = new I18n({ locales: { en: {}, es: {}, fr: {}, de: { auth: { invalidEmail: 'Nein.' } } } });
      i18n.translateAuth(auth).translateAdmin(admin);
      app = xufa();
      app.register(plugin, { i18n });
      app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
      app.register(auth.accounts, {
        secret: 'a secret of the accounts, 32 chars or more',
        users: {
          findByEmail: (email) => Member.objects.filter({ email }).first(),
          findById: (id) => Member.objects.filter({ pk: id }).first(),
          setPassword: (user, hash) => Member.objects.filter({ pk: user.pk }).update({ password: hash }),
        },
        passwordOptions: { ln: 4 },
        lockout: false,
        mailer: { send: (mail) => sent.push(mail) },
        links: { reset: (token) => `https://app.example/reset?token=${token}` },
        app: { name: 'Biblioteca' },
      });
      app.register(admin.admin, { prefix: '/admin', models: [Member], authorize: () => true });
      await app.ready();
    });

    afterAll(async () => {
      auth.setTranslator(null);
      admin.setTranslator(null);
      await app.close();
    });

    const login = (language, password) =>
      app.inject({
        method: 'POST',
        url: '/account/login',
        headers: { 'accept-language': language },
        payload: { email: 'ada@example.com', password },
      });

    it('logins and accounts: those of xufa, those of the catalogs over them, English without them', async () => {
      expect((await login('es', 'wrong-one')).json().error).toBe('Email o contraseña incorrectos');
      expect((await login('fr', 'wrong-one')).json().error).toBe('E-mail ou mot de passe incorrect');
      expect((await login('de', 'wrong-one')).json().error).toBe('Nein.');
      expect((await login('ja', 'wrong-one')).json().error).toBe('Wrong email or password');
      const empty = await app.inject({
        method: 'POST',
        url: '/account/login',
        headers: { 'accept-language': 'es' },
        payload: {},
      });
      expect(empty.json().errors).toEqual({ email: ['Un email'], password: ['Una contraseña'] });
    });

    it('the emails of the links, in the language of the request that asked for them', async () => {
      const forgot = await app.inject({
        method: 'POST',
        url: '/account/password/forgot',
        headers: { 'accept-language': 'es' },
        payload: { email: 'ada@example.com' },
      });
      expect(forgot.json().message).toBe(
        'Si hay una cuenta con este email, le llegará un enlace para restablecer su contraseña'
      );
      expect(sent.at(-1)).toMatchObject({
        subject: 'Restablece tu contraseña de Biblioteca',
        with: { button: 'Restablecer la contraseña', foot: expect.stringContaining('durante 60 minutos') },
      });
    });

    it('the messages of forms', async () => {
      const i18n = new I18n({ locales: { en: {}, es: {} } });
      i18n.translateForms(forms);
      const form = new (class extends forms.Form {
        static fields = { name: forms.fields.string() };
      })({ data: {} });
      await i18n.run('es', () => form.isValid());
      expect(form.errors).toEqual({ name: ['Este campo es obligatorio.'] });
      forms.setTranslator(null);
    });

    it('the pages of the accounts (auth.pages): titles, texts, labels and buttons, and the lang of the page', async () => {
      const i18n = new I18n({ locales: { en: {}, es: {} } });
      i18n.translateAuth(auth);
      const pages = xufa();
      pages.register(xufa.formBody);
      pages.register(plugin, { i18n });
      pages.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
      pages.register(auth.accounts, {
        secret: 'a secret of the accounts, 32 chars or more',
        users: { findByEmail: () => null, findById: () => null },
        lockout: false,
      });
      pages.register(auth.pages, { prefix: '/accounts' });
      await pages.ready();
      const es = await pages.inject({ url: '/accounts/login/', headers: { 'accept-language': 'es' } });
      expect(es.body).toContain('<html lang="es">');
      expect(es.body).toContain('<title>Iniciar sesión</title>');
      expect(es.body).toContain('Correo electrónico:</label>');
      expect(es.body).toContain('Contraseña:</label>');
      const reset = await pages.inject({ url: '/accounts/password_reset/', headers: { 'accept-language': 'es' } });
      expect(reset.body).toContain('Restablecer mi contraseña');
      const en = await pages.inject('/accounts/login/');
      expect(en.body).toContain('<title>Log in</title>');
      expect(en.body).toContain('Email:</label>');
      auth.setTranslator(null);
      await pages.close();
    });

    it('the API of the admin', async () => {
      const missing = await app.inject({ url: '/admin/api/Nope', headers: { 'accept-language': 'it' } });
      expect([missing.statusCode, missing.json().error]).toEqual([404, "L'admin non ha il modello Nope"]);
      const english = await app.inject({ url: '/admin/api/Nope' });
      expect(english.json().error).toBe('The admin has no model Nope');
    });
  });
});
