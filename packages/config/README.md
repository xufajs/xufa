# @xufa/config

The configuration of an app, from layers: defaults, files of JSON, YAML or JS by environment, local files, `.env`
files, variables of the environment and overrides. Templates in its values (`{{ env.PORT ?? 3000 }}`) are safe
expressions; a schema converts, fills in defaults and checks (every error at once); secrets are redacted when it is
shown; and it is frozen, with `get('a.b')` failing for keys that are not there. No dependencies outside xufa.

```js
const { loadConfig } = require('@xufa/config'); // or require('xufa/config')

const config = loadConfig({
  envPrefix: 'APP',
  schema: {
    server: { port: { type: 'port', default: 3000, env: 'PORT' } },
    db: {
      url: { type: 'url', required: true, env: 'DATABASE_URL', sensitive: true },
      pool: { max: { type: 'integer', default: 10, min: 1 } },
    },
    level: { type: 'string', values: ['debug', 'info', 'warn'], default: 'info' },
  },
});

config.server.port; // 3000, or the PORT of the environment, as a number
config.get('db.pool.max');
console.log(config); // db.url: '[redacted]'
```

## Layers

Each layer is merged over the one before (objects key by key; arrays and other values replace):

1. `defaults`, an object of the options;
2. `config/default.json` (or `.yaml`, `.yml`, `.js`, `.cjs`: one of them);
3. `config/{env}.*`: the environment is the `env` option, or `NODE_ENV`, or `development`;
4. `config/local.*`, then `config/local-{env}.*`: of the machine, kept out of git;
   - the remote sources, in their order (with `loadRemoteConfig()`: [Remote sources](#remote-sources));
5. the variables of the schema (`env: 'PORT'`);
6. the variables with the prefix (`envPrefix: 'APP'`): `APP__DB__POOL__MAX=20` sets `db.pool.max`. Their keys are found
   whatever their case (`APP__DB__MAX_CONNECTIONS` is `db.maxConnections` when there is one; new ones are camelCase).
   Without a schema, a value takes the type of the one it replaces (a number, a boolean, an array, an object);
7. `overrides`, an object of the options.

A JS file exports the configuration, or a function of `{ env, name }` that gives it. The folder is `config` (the `dir`
option, from `cwd`); without one, there are no files.

## .env files

The variables are those of the process (the `environment` option), with what `.env` files have that they do not:
`.env`, `.env.{env}`, `.env.local` and `.env.{env}.local`, the later first. `dotenv: false` reads none, and
`dotenv: ['secrets.env']` those (they must exist). `populate: true` sets in `process.env` what it does not have, for
libraries that read it.

`KEY=value` lines: `export ` before a key, values in double quotes with escapes (`\n`, `\"`) and on several lines, in
single quotes as written, unquoted with a comment after ` #`. `parseDotenv(text)` reads one.

## Remote sources

`loadRemoteConfig(options)` takes the options of `loadConfig()` and `remote`, sources read at once (it is async), and
merged in their order after the files and before the variables of the environment: a variable still overrides what a
server says.

```js
const { loadRemoteConfig, sources } = require('@xufa/config');

const config = await loadRemoteConfig({
  schema,
  remote: [
    sources.http({ url: 'https://config.internal/apps/shop.yaml', headers: { authorization: `Bearer ${token}` } }),
    sources.consul({ prefix: 'apps/shop' }), // apps/shop/db/host is db.host
    sources.vault({ path: 'shop/production', at: 'credentials' }), // KV 2 of Vault, under credentials
    sources.directory({ dir: '/run/secrets', at: 'files', sensitive: true }), // Docker, Kubernetes
  ],
  cacheFile: '.config-cache.json',
});
```

| Source                                                              | What it reads                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http({ url, headers, format })`                                    | A document of JSON or YAML (by `format`, its content type or its extension). With an ETag, one that has not changed is not sent again.                                                                                                                |
| `consul({ prefix \| key, url, token, datacenter })`                 | The keys under a prefix as a tree (texts; JSON objects and arrays as values), or one key as a document. `CONSUL_HTTP_ADDR` and `CONSUL_HTTP_TOKEN` by default.                                                                                        |
| `vault({ path, mount, kv, token \| roleId + secretId, namespace })` | A secret of the KV engine (`kv: 2`, or 1) of Vault or OpenBao, with a token or AppRole (logged in again when the token is refused). `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `VAULT_NAMESPACE`. Sensitive, without templates. |
| `directory({ dir })`                                                | A key for each file (its text without the last newline); `.json`, `.yaml` and `.yml` files are their documents. Hidden ones (the `..data` of Kubernetes) are left out. Without templates.                                                             |
| `{ name, load({ env, name, signal }) }`                             | One of your own: the tree it gives.                                                                                                                                                                                                                   |

Options of every source: `at` (the key it is put under), `optional` (a failure leaves it out, with a warning),
`sensitive` (its keys redacted, and never written to the cache), `templates: false` (its texts are never templates: a
password with `{{` is that text), `timeout` (5000 ms for each attempt), `retries` (2, after 200 ms, 400 ms) and
`name`.

A source that fails, after its retries, takes the tree it gave last from `cacheFile` (a file of 0600 that only keeps
sources that are not sensitive), so an app starts while its config server is down; or it is left out when optional
(both with `onSourceError(err, source)`, or a warning). The rest fail together: one `ConfigError` with every source
that failed. `config.sources` lists the names of the sources read.

### Watching

```js
const watcher = await watchConfig(options, {
  interval: '30s',
  onChange: (config, previous, changed) => log.info({ changed }, 'the configuration changed'), // ['flags.beta']
  onError: (err) => log.warn(err), // the configuration there was is kept
});
watcher.current.flags.beta;
```

`watchConfig()` reads every layer again every `interval`: when something changed, `watcher.current` is a new
configuration (they are frozen), and `onChange` gets it, the one before and the paths that changed. A reading that
fails (a source down without a cache, a value the schema refuses) keeps the one there was. `refresh()` reads it now,
and `stop()` stops it. Read `watcher.current` where the value is used, not once at the start.

## Templates

A text with `{{ expression }}` is resolved after the layers are merged, with `env` (the variables) and `config` (the
other keys, resolved first):

```yaml
server:
  port: '{{ Number(env.PORT ?? 3000) }}'
  url: 'http://{{ config.server.host }}:{{ config.server.port }}'
cache: '{{ env.NODE_ENV === "production" ? "redis" : "memory" }}'
```

A text that is only a template is the value of its expression (a number, a boolean, an object); in a text with more,
each is written in it (`null` and `undefined` as nothing). A template whose value is `undefined`, alone, leaves its key
missing: its default, or an error when it is required. The expressions are those of
[@xufa/expression](../expression): a safe part of JavaScript, that cannot assign nor reach the process; a name that is
not `env`, `config` nor one of its globals is an error (a typo, `evn.PORT`, is not a silent `undefined`). Templates
that refer to each other in a cycle are an error.

## The schema

The keys, nested as the configuration; a key whose `type` is a text is one value:

| Type       | Its value                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| `string`   | A text (numbers and booleans are written as text)                          |
| `number`   | A number (`'1.5'` is 1.5)                                                  |
| `integer`  | A whole number                                                             |
| `boolean`  | `true`, `false`; texts `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`     |
| `port`     | A whole number from 0 to 65535                                             |
| `url`      | A text that is a URL                                                       |
| `duration` | Milliseconds: a number, or `'500ms'`, `'30s'`, `'10m'`, `'2h'`, `'1h30m'`  |
| `array`    | An array; a text of JSON (`'[1,2]'`) or of commas (`'a,b'`); `items`: type |
| `object`   | An object; a text of JSON                                                  |
| `any`      | What it is                                                                 |

Options of a key: `default` (or a function that gives it), `required`, `nullable`, `env` (the variable that sets it),
`values` (those allowed), `pattern` (of texts), `min` and `max` (of numbers, or of the length of texts and arrays),
`items`, `sensitive`, `doc`. `strict: true` makes keys that are not in the schema errors.

Every error is in one `ConfigError` (`code` `XUFA_CONFIG_ERR`), each with its `path`, so a deploy shows all that is
wrong at once:

```
The configuration (production) has errors:
  - db.url: is required (set DATABASE_URL)
  - server.port: 70000 is not a port (0-65535)
```

In TypeScript, the type of the configuration follows from its schema (`loadConfig({ schema })`: `config.server.port` is
a `number`), or is the one given (`loadConfig<AppConfig>()`).

## The configuration

Frozen, deep: nothing changes it. Its keys are its own; its methods are not among them:

- `get(path)`: the value at `'a.b'` (or `['a', 'b']`); a key that is not there is an error (a typo fails at once);
- `has(path)`;
- `redacted()`: a copy without its secrets: the keys `sensitive` in the schema, and those named as secrets
  (`password`, `passphrase`, `secret`, `token`, `apiKey`, `privateKey`, `credentials`). `JSON.stringify(config)` and
  `console.log(config)` show that copy;
- `sources`: the files read, and the remote sources.

`get`, `has`, `redacted`, `toJSON` and `sources` cannot be keys of a configuration.

## License

MIT.
