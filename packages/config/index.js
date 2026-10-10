// @xufa/config: the configuration of an app, from layers (defaults, files of JSON, YAML or JS by environment, local
// files, .env files, variables of the environment, overrides), with templates ({{ env.PORT ?? 3000 }}, of
// @xufa/expression: safe), a schema that converts, fills in defaults and checks (every error at once), and secrets
// redacted when it is shown. Remote sources (HTTP, Consul, Vault, folders of secrets) with loadRemoteConfig(), and
// watchConfig() to read them again. Frozen; get('a.b') fails for keys that are not there. No dependencies outside xufa.
import { loadConfig, readFile } from './lib/load.js';
import { parseDotenv } from './lib/dotenv.js';
import { ConfigError } from './lib/errors.js';
import { loadRemoteConfig, watchConfig, sources } from './lib/remote.js';

// One file of JSON, YAML or JS (a function: called with context), as the layers read them (other files of an app:
// the urls.yaml of xufa's apps).
const readConfigFile = (file, context) => readFile(file, context);

export { loadConfig, loadRemoteConfig, watchConfig, sources, parseDotenv, readConfigFile, ConfigError };
