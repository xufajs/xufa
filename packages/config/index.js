'use strict';

// @xufa/config: the configuration of an app, from layers (defaults, files of JSON, YAML or JS by environment, local
// files, .env files, variables of the environment, overrides), with templates ({{ env.PORT ?? 3000 }}, of
// @xufa/expression: safe), a schema that converts, fills in defaults and checks (every error at once), and secrets
// redacted when it is shown. Remote sources (HTTP, Consul, Vault, folders of secrets) with loadRemoteConfig(), and
// watchConfig() to read them again. Frozen; get('a.b') fails for keys that are not there. No dependencies outside xufa.
const { loadConfig } = require('./lib/load');
const { parseDotenv } = require('./lib/dotenv');
const { ConfigError } = require('./lib/errors');
const { loadRemoteConfig, watchConfig, sources } = require('./lib/remote');

module.exports = { loadConfig, loadRemoteConfig, watchConfig, sources, parseDotenv, ConfigError };
