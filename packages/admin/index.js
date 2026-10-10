// @xufa/admin: the admin of the models of @xufa/orm, as Django's (lib/plugin.js).
import { adminPlugin, AdminError } from './lib/plugin.js';
import { describeModel, labelOf } from './lib/describe.js';
import * as messages from './lib/messages.js';

export const ADMIN_MESSAGES = messages.MESSAGES;
export const adminMessage = messages.message;
export const setTranslator = messages.setTranslator;

export { adminPlugin as admin, adminPlugin, adminPlugin as plugin, AdminError, describeModel, labelOf };
