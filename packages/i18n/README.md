# @xufa/i18n

The messages of an app in its languages: catalogs by locale, plurals by the rules of each language
(`Intl.PluralRules`), parameters, and the locales a locale falls back to. The locale of each request is kept in its
async context, so code far from the request speaks it too: the validation messages of [@xufa/orm](../orm), translated
into Spanish, French, German, Portuguese and Italian. No dependencies.

Its documentation is in [docs/i18n/](../../docs/i18n/index.html). This file is the summary.

```sh
npm install @xufa/i18n
```

```js
import { I18n, plugin } from '@xufa/i18n';
import * as orm from '@xufa/orm';

const i18n = new I18n({
  fallback: 'en',
  locales: {
    en: { hello: 'Hello, {name}!', cart: { items: { one: '{count} item', other: '{count} items' } } },
    es: { hello: '¡Hola, {name}!', cart: { items: { one: '{count} artículo', other: '{count} artículos' } } },
  },
});
i18n.translateOrm(orm); // the validation messages of the ORM in the locale of each request
i18n.translateAuth(auth).translateAdmin(admin); // logins, accounts, their emails, and the API of the admin

app.register(plugin, { i18n, detect: ['query', 'cookie', 'header'] });
app.get('/cart', (request) => ({ items: request.t('cart.items', { count: 3 }), locale: request.locale }));
```

- `t(key, params, locale)`: `{name}` parameters; plurals by `count` (and `zero`); `es-AR` falls back to `es`, then to
  the fallback; a key without a message gives the key (or `missing(key, locale)`).
- The plugin finds the locale of each request (`?lang=`, the cookie `lang`, the user, `Accept-Language`, or functions),
  sets `request.locale`, `request.t()` and `Content-Language`, and keeps the locale in the async context of the
  request: `i18n.t()` speaks it anywhere. `i18n.run(locale, fn)` outside requests.
- xufa's translations (`es`, `fr`, `de`, `pt`, `it`) of the messages users read of [@xufa/orm](../orm) (`orm.*`),
  [@xufa/auth](../auth) (`auth.*`: logins, passwords, authenticator apps, accounts and the emails of their links)
  and [@xufa/admin](../admin) (`admin.*`); the app's catalogs go over them, other languages get English.
- `number()`, `date()` and `list()` in the locale of the context; `i18n.filter` is a filter `t` for
  [@xufa/template](../template).

## License

MIT
