import { expectTypeOf } from '@xufa/test';
import xufa from '@xufa/http';
import * as orm from '@xufa/orm';
import * as auth from '@xufa/auth';
import * as admin from '@xufa/admin';
import { I18n, plugin, acceptedLanguages } from '../..';

const i18n = new I18n({
  fallback: 'en',
  locales: { en: { cart: { items: { one: '{count} item', other: '{count} items' } } }, es: { hello: '¡Hola!' } },
});
expectTypeOf(i18n.t('cart.items', { count: 2 }, 'es')).toEqualTypeOf<string>();
expectTypeOf(i18n.run('es', () => i18n.t('hello'))).toEqualTypeOf<string>();
i18n.translateOrm(orm);
expectTypeOf(i18n.translateAuth(auth).translateAdmin(admin)).toEqualTypeOf<I18n>();
// @ts-expect-error
i18n.translateAuth(orm);
expectTypeOf(auth.authMessage('tooShort', { min: 8 })).toEqualTypeOf<string>();
expectTypeOf(admin.adminMessage('noModel', { model: 'Book' })).toEqualTypeOf<string>();
expectTypeOf(acceptedLanguages('es,en;q=0.5')).toEqualTypeOf<string[]>();
// @ts-expect-error
new I18n({ locales: { en: { a: 1 } } });

const app = xufa();
app.register(plugin, { i18n, detect: ['query', (request) => request.headers['x-locale'], 'header'] });
app.get('/', (request) => {
  expectTypeOf(request.locale).toEqualTypeOf<string | null>();
  return request.t('hello');
});
// @ts-expect-error
app.register(plugin, { i18n, detect: ['moon'] });
