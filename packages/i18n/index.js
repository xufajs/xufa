// @xufa/i18n: the messages of an app in its languages: catalogs by locale, plurals by the rules of each language,
// parameters, fallbacks; the locale of each request (and its async context: the messages of the ORM speak it), and
// the translations of the messages of the validation of @xufa/orm. No dependencies.
import { I18n, I18nError, normalize } from './lib/i18n.js';
import { i18nPlugin, acceptedLanguages } from './lib/plugin.js';
import * as ormMessages from './lib/orm-messages.js';

export { I18n, I18nError, i18nPlugin as plugin, normalize, acceptedLanguages, ormMessages };
