'use strict';

// @xufa/admin: the admin of the models of @xufa/orm, as Django's (lib/plugin.js).
const { adminPlugin, AdminError } = require('./lib/plugin');
const { describeModel, labelOf } = require('./lib/describe');

module.exports = { admin: adminPlugin, adminPlugin, plugin: adminPlugin, AdminError, describeModel, labelOf };
