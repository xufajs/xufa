import { expectType, expectError } from 'tsd';
import xufa from '@xufa/http';
import * as orm from '@xufa/orm';
import * as auth from '@xufa/auth';
import * as admin from '@xufa/admin';
import { I18n, plugin, acceptedLanguages } from '../..';

const i18n = new I18n({
  fallback: 'en',
  locales: { en: { cart: { items: { one: '{count} item', other: '{count} items' } } }, es: { hello: '¡Hola!' } },
});
expectType<string>(i18n.t('cart.items', { count: 2 }, 'es'));
expectType<string>(i18n.run('es', () => i18n.t('hello')));
i18n.translateOrm(orm);
expectType<I18n>(i18n.translateAuth(auth).translateAdmin(admin));
expectError(i18n.translateAuth(orm));
expectType<string>(auth.authMessage('tooShort', { min: 8 }));
expectType<string>(admin.adminMessage('noModel', { model: 'Book' }));
expectType<string[]>(acceptedLanguages('es,en;q=0.5'));
expectError(new I18n({ locales: { en: { a: 1 } } }));

const app = xufa();
app.register(plugin, { i18n, detect: ['query', (request) => request.headers['x-locale'], 'header'] });
app.get('/', (request) => {
  expectType<string | null>(request.locale);
  return request.t('hello');
});
expectError(app.register(plugin, { i18n, detect: ['moon'] }));
