'use strict';

// Remote sources of a configuration, read by loadRemoteConfig(options) (async: they take time) as layers after the
// files and before the variables of the environment (so a variable still overrides what a server says):
//
//   const config = await loadRemoteConfig({
//     schema,
//     remote: [
//       sources.http({ url: 'https://config.internal/apps/shop.json' }),
//       sources.consul({ prefix: 'apps/shop' }),
//       sources.vault({ path: 'shop/production', at: 'secrets' }),
//       sources.directory({ dir: '/run/secrets', at: 'secrets' }),
//       sources.ssm({ path: '/shop/production' }),                 // AWS: Parameter Store, Secrets Manager (lib/aws.js)
//     ],
//     cacheFile: '.config-cache.json',
//   });
//
// A source is { name, load({ env, name, signal }) }: the tree it gives (an object), with the options at (the key it is
// put under), optional (a failure leaves it out), sensitive (its keys redacted), templates (false: its texts are
// never templates; so a secret with {{ is that text), timeout (ms of each attempt) and retries. Sources are read at
// once, and merged in their order. A source that fails is retried; then its last tree in `cacheFile` is used (not for
// sensitive ones: secrets are never written), or it is left out when optional; otherwise every failure is in one
// ConfigError.
//
// watchConfig(options, { interval, onChange, onError }) reads it again every interval: a new configuration (they are
// frozen) when something changed, given to onChange with the one before and the paths that changed; a reading that
// fails keeps the one there was (onError is told).
const fs = require('node:fs');
const path = require('node:path');
const { ConfigError } = require('./errors');
const { readLocal, complete, merge } = require('./load');
const { coerce, isPlain } = require('./schema');
const { call } = require('./aws');

const DEFAULTS = { timeout: 5000, retries: 2 };

const wait = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => clearTimeout(timer) || resolve(), { once: true });
  });

// A document of a format (json, yaml), or by the name of the file or its content type; JSON first otherwise.
function parseDocument(text, { format, name = '', type = '' } = {}) {
  const yaml = () => require('@xufa/yaml').load(text, { filename: name }); // eslint-disable-line global-require
  if (format === 'json' || /json/i.test(type) || /\.json$/i.test(name)) return JSON.parse(text);
  if (format === 'yaml' || /yaml/i.test(type) || /\.ya?ml$/i.test(name)) return yaml();
  try {
    return JSON.parse(text);
  } catch {
    return yaml();
  }
}

// A text of a key-value store as a value: objects and arrays of JSON are values; other texts are texts (the schema
// converts them: '3000' is a port).
function valueOfText(text) {
  if (/^\s*[[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function request(url, init, what) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(`${what}: ${err.cause ? err.cause.message || err.cause.code : err.message}`);
  }
  return response;
}

async function failed(response, what) {
  const body = await response.text().catch(() => '');
  return new Error(`${what}: ${response.status} ${response.statusText}${body ? ` (${body.slice(0, 200)})` : ''}`);
}

// A document of JSON or YAML over HTTP (a config server, a file of a bucket, a raw key...). With its ETag, a reading
// that has not changed is answered 304 and the tree before is kept.
function http(options) {
  const { url, headers = {}, format, ...rest } = options || {};
  if (!url) throw new TypeError('sources.http(): url is required');
  let last = null; // { etag, tree }
  return {
    name: rest.name || `http ${String(url).replace(/\/\/[^@/]*@/, '//')}`,
    ...rest,
    async load({ signal }) {
      const what = this.name;
      const sent = { ...headers };
      if (last && last.etag) sent['if-none-match'] = last.etag;
      const response = await request(url, { headers: sent, signal }, what);
      if (response.status === 304 && last) return last.tree;
      if (!response.ok) throw await failed(response, what);
      const tree = parseDocument(await response.text(), {
        format,
        name: new URL(url).pathname,
        type: response.headers.get('content-type') || '',
      });
      const etag = response.headers.get('etag');
      last = etag ? { etag, tree } : null;
      return tree;
    },
  };
}

// The keys of Consul under a prefix, as a tree (apps/shop/db/url is db.url), or one key as a document (key).
function consul(options) {
  const { url, prefix, key, token, datacenter, format, ...rest } = options || {};
  if (!prefix === !key) throw new TypeError('sources.consul(): a prefix (keys as a tree) or a key (a document)');
  return {
    name: rest.name || `consul ${prefix || key}`,
    ...rest,
    // A blocking query: it answers when the keys change (or after `wait`), with their index (X-Consul-Index), or null
    // when the server gives none (watchConfig() then does not follow it). Its socket does not keep the process alive.
    watch({ env, signal, index = null, wait = '5m' }) {
      const base = String(url || env.CONSUL_HTTP_ADDR || 'http://127.0.0.1:8500').replace(/\/$/, '');
      const headers = {};
      const secret = token || env.CONSUL_HTTP_TOKEN;
      if (secret) headers['x-consul-token'] = secret;
      const at = String(prefix || key).replace(/^\/+|\/+$/g, '');
      const params = [];
      if (!key) params.push('recurse=true');
      if (index) params.push(`index=${index}`, `wait=${wait}`);
      if (datacenter) params.push(`dc=${encodeURIComponent(datacenter)}`);
      const target = `${base}/v1/kv/${at.split('/').map(encodeURIComponent).join('/')}${key ? '' : '/'}`;
      const what = this.name;
      return new Promise((resolve, reject) => {
        const address = new URL(`${target}?${params.join('&')}`);
        const client = address.protocol === 'https:' ? require('node:https') : require('node:http'); // eslint-disable-line global-require
        const req = client.get(address, { headers, signal }, (res) => {
          res.resume();
          res.on('end', () => {
            const header = res.headers['x-consul-index'];
            if (header === undefined) resolve({ index: null });
            else if (res.statusCode >= 400 && res.statusCode !== 404) {
              reject(new Error(`${what}: ${res.statusCode} when waiting for changes`));
            } else resolve({ index: Number(header) });
          });
        });
        req.on('socket', (socket) => socket.unref());
        req.on('error', (err) => reject(new Error(`${what}: ${err.message}`)));
      });
    },
    async load({ env, signal }) {
      const base = String(url || env.CONSUL_HTTP_ADDR || 'http://127.0.0.1:8500').replace(/\/$/, '');
      const headers = {};
      const secret = token || env.CONSUL_HTTP_TOKEN;
      if (secret) headers['x-consul-token'] = secret;
      const dc = datacenter ? `&dc=${encodeURIComponent(datacenter)}` : '';
      const what = this.name;
      const at = String(prefix || key).replace(/^\/+|\/+$/g, '');
      const target = `${base}/v1/kv/${at.split('/').map(encodeURIComponent).join('/')}`;
      if (key) {
        const response = await request(`${target}?raw=true${dc}`, { headers, signal }, what);
        if (!response.ok) throw await failed(response, what);
        return parseDocument(await response.text(), { format, name: key });
      }
      const response = await request(`${target}/?recurse=true${dc}`, { headers, signal }, what);
      if (response.status === 404) throw new Error(`${what}: no keys under ${at}/`);
      if (!response.ok) throw await failed(response, what);
      const tree = {};
      for (const entry of await response.json()) {
        const rel = entry.Key.slice(at.length).replace(/^\/+/, '');
        if (rel === '' || rel.endsWith('/') || entry.Value === null) continue; // folders
        const keys = rel.split('/');
        let node = tree;
        for (const part of keys.slice(0, -1)) {
          if (!isPlain(node[part])) node[part] = {};
          node = node[part];
        }
        node[keys[keys.length - 1]] = valueOfText(Buffer.from(entry.Value, 'base64').toString('utf8'));
      }
      return tree;
    },
  };
}

// A secret of the KV engine of HashiCorp Vault (or OpenBao): version 2 (data/ in its path) or 1. A token, or the
// role and secret of AppRole (it logs in, and again when the token is refused). Sensitive, without templates.
function vault(options) {
  const { url, path: at, mount = 'secret', kv = 2, token, roleId, secretId, namespace, ...rest } = options || {};
  if (!at) throw new TypeError('sources.vault(): path is required (the secret, as shop/production)');
  let session = null;
  return {
    name: rest.name || `vault ${mount}/${at}`,
    sensitive: true,
    templates: false,
    ...rest,
    async load({ env, signal }) {
      const base = String(url || env.VAULT_ADDR || 'http://127.0.0.1:8200').replace(/\/$/, '');
      const what = this.name;
      const headers = {};
      if (namespace || env.VAULT_NAMESPACE) headers['x-vault-namespace'] = namespace || env.VAULT_NAMESPACE;
      const login = async () => {
        const role = roleId || env.VAULT_ROLE_ID;
        if (!role) return token || env.VAULT_TOKEN || null;
        const response = await request(
          `${base}/v1/auth/approle/login`,
          {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({ role_id: role, secret_id: secretId || env.VAULT_SECRET_ID }),
            signal,
          },
          `${what} (login)`
        );
        if (!response.ok) throw await failed(response, `${what} (login)`);
        return (await response.json()).auth.client_token;
      };
      const read = async (again) => {
        if (!session || again) session = await login();
        if (!session) throw new Error(`${what}: no token (token, VAULT_TOKEN, or roleId of AppRole)`);
        const secretPath = kv === 2 ? `${mount}/data/${at}` : `${mount}/${at}`;
        return request(`${base}/v1/${secretPath}`, { headers: { ...headers, 'x-vault-token': session }, signal }, what);
      };
      let response = await read(false);
      if (response.status === 403 && (roleId || env.VAULT_ROLE_ID)) response = await read(true);
      if (!response.ok) throw await failed(response, what);
      const body = await response.json();
      return kv === 2 ? body.data.data : body.data;
    },
  };
}

// The files of a folder, a key each (Docker secrets in /run/secrets, the ConfigMaps and Secrets of Kubernetes): the
// text of each (its last newline removed); .json, .yaml and .yml files are their documents, under their names
// without the extension. Hidden files and folders (the ..data of Kubernetes) are left out. No templates.
function directory(options) {
  const { dir, ...rest } = options || {};
  if (!dir) throw new TypeError('sources.directory(): dir is required');
  return {
    name: rest.name || `directory ${dir}`,
    templates: false,
    ...rest,
    async load() {
      const tree = {};
      for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const file = path.join(dir, entry.name);
        const stat = await fs.promises.stat(file); // links to files count (Kubernetes mounts them so)
        if (!stat.isFile()) continue;
        const text = await fs.promises.readFile(file, 'utf8');
        const ext = path.extname(entry.name).toLowerCase();
        if (['.json', '.yaml', '.yml'].includes(ext))
          tree[path.basename(entry.name, ext)] = parseDocument(text, { name: file });
        else tree[entry.name] = text.replace(/\r?\n$/, '');
      }
      return tree;
    },
  };
}

// The parameters of the Parameter Store of AWS Systems Manager under a path, as a tree (/shop/production/db/url is
// db.url under the path /shop/production), SecureStrings decrypted. Sensitive, without templates.
function ssm(options) {
  const { path: at, ...rest } = options || {};
  if (!at || !String(at).startsWith('/')) throw new TypeError('sources.ssm(): path is required (as /shop/production)');
  const prefix = String(at).replace(/\/+$/, '');
  return {
    name: rest.name || `ssm ${prefix}`,
    sensitive: true,
    templates: false,
    ...rest,
    async load({ env, signal }) {
      const tree = {};
      let token;
      do {
        const page = await call({
          options: rest,
          env,
          signal,
          service: 'ssm',
          host: 'ssm',
          target: 'AmazonSSM.GetParametersByPath',
          payload: {
            Path: prefix || '/',
            Recursive: true,
            WithDecryption: true,
            ...(token ? { NextToken: token } : {}),
          },
          what: this.name,
        });
        for (const parameter of page.Parameters || []) {
          const keys = parameter.Name.slice(prefix.length).split('/').filter(Boolean);
          if (keys.length === 0) continue;
          let node = tree;
          for (const part of keys.slice(0, -1)) {
            if (!isPlain(node[part])) node[part] = {};
            node = node[part];
          }
          node[keys[keys.length - 1]] = valueOfText(parameter.Value);
        }
        token = page.NextToken;
      } while (token);
      return tree;
    },
  };
}

// A secret of AWS Secrets Manager: its JSON (the keys and values of a secret made in the console), or its text under
// `value`. A version by its stage (AWSCURRENT) or id. Sensitive, without templates.
function secretsManager(options) {
  const { secretId, versionStage, versionId, ...rest } = options || {};
  if (!secretId) throw new TypeError('sources.secretsManager(): secretId is required (its name or ARN)');
  return {
    name: rest.name || `secretsmanager ${secretId}`,
    sensitive: true,
    templates: false,
    ...rest,
    async load({ env, signal }) {
      const secret = await call({
        options: rest,
        env,
        signal,
        service: 'secretsmanager',
        host: 'secretsmanager',
        target: 'secretsmanager.GetSecretValue',
        payload: {
          SecretId: secretId,
          ...(versionStage ? { VersionStage: versionStage } : {}),
          ...(versionId ? { VersionId: versionId } : {}),
        },
        what: this.name,
      });
      const text =
        secret.SecretString !== undefined
          ? secret.SecretString
          : Buffer.from(secret.SecretBinary || '', 'base64').toString('utf8');
      const value = valueOfText(text);
      return isPlain(value) ? value : { value };
    },
  };
}

const sources = { http, consul, vault, directory, ssm, secretsManager };

// One source: its attempts (each with its timeout), then what it gave, or its error.
async function readSource(source, context) {
  const timeout = source.timeout ?? DEFAULTS.timeout;
  const retries = source.retries ?? DEFAULTS.retries;
  let error;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt) await wait(200 * 2 ** (attempt - 1));
    try {
      const signal = AbortSignal.timeout(timeout);
      const tree = await Promise.race([
        source.load({ ...context, signal }),
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error(`${source.name}: no answer in ${timeout} ms`)), {
            once: true,
          });
        }),
      ]);
      if (tree === undefined || tree === null) return {};
      if (!isPlain(tree)) throw new Error(`${source.name}: a configuration is an object`);
      return tree;
    } catch (err) {
      error = err.name === 'TimeoutError' ? new Error(`${source.name}: no answer in ${timeout} ms`) : err;
    }
  }
  throw error;
}

function readCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

// The paths of the leaves of a tree under `at` ('a.b'), with their values.
function leavesOf(tree, prefix, out = []) {
  if (Array.isArray(tree)) tree.forEach((item, i) => leavesOf(item, [...prefix, String(i)], out));
  else if (isPlain(tree)) Object.entries(tree).forEach(([key, value]) => leavesOf(value, [...prefix, key], out));
  else out.push([prefix.join('.'), tree]);
  return out;
}

const mount = (tree, at) =>
  at
    ? String(at)
        .split('.')
        .reverse()
        .reduce((inner, key) => ({ [key]: inner }), tree)
    : tree;

function checkSources(remote) {
  if (!Array.isArray(remote)) throw new TypeError('remote: a list of sources');
  const names = new Set();
  for (const source of remote) {
    if (!source || typeof source.load !== 'function' || !source.name) {
      throw new TypeError('A remote source is { name, load({ env, name, signal }) } (sources.http(), consul()...)');
    }
    if (names.has(source.name)) throw new TypeError(`Two remote sources are named ${source.name}`);
    names.add(source.name);
  }
}

async function loadRemoteConfig(options = {}) {
  const remote = options.remote || [];
  checkSources(remote);
  const state = readLocal(options);
  const context = { env: state.env, name: state.name };
  const results = await Promise.allSettled(remote.map((source) => readSource(source, context)));
  const cacheFile = options.cacheFile ? path.resolve(options.cwd || process.cwd(), options.cacheFile) : null;
  const cache = cacheFile ? readCache(cacheFile) : {};
  const errors = [];
  let cacheChanged = false;
  results.forEach((result, i) => {
    const source = remote[i];
    let tree;
    if (result.status === 'fulfilled') {
      tree = result.value;
      if (cacheFile && !source.sensitive) {
        cache[source.name] = { tree, at: new Date().toISOString() };
        cacheChanged = true;
      }
    } else {
      const cached = cacheFile && !source.sensitive ? cache[source.name] : undefined;
      const report =
        options.onSourceError || ((err) => process.emitWarning(err.message, { code: 'XUFA_CONFIG_REMOTE' }));
      if (cached) {
        report(new Error(`${result.reason.message}; the one of ${cached.at} (${options.cacheFile}) is used`), source);
        tree = cached.tree;
      } else if (source.optional) {
        report(new Error(`${result.reason.message}; it is optional: left out`), source);
        return;
      } else {
        errors.push({ path: source.name, message: result.reason.message.replace(`${source.name}: `, '') });
        return;
      }
    }
    const mounted = mount(tree, source.at);
    state.tree = merge(state.tree, mounted);
    state.sources.push(source.name);
    for (const [at, value] of leavesOf(mounted, [])) {
      if (source.sensitive) state.sensitive.push(at);
      if (source.templates === false) state.literal.set(at, value);
    }
  });
  if (errors.length) throw new ConfigError('The remote sources of the configuration failed', errors);
  if (cacheChanged) {
    fs.writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  }
  return complete(state, options);
}

// The paths whose values differ between two trees.
function changedPaths(before, after, prefix = [], out = []) {
  if (isPlain(before) && isPlain(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      changedPaths(before[key], after[key], [...prefix, key], out);
    }
  } else if (JSON.stringify(before) !== JSON.stringify(after)) out.push(prefix.join('.'));
  return out;
}

async function watchConfig(options = {}, { interval = '30s', onChange, onError, blocking = true } = {}) {
  const every = coerce(interval, 'duration');
  if (every.error || every.value <= 0) throw new TypeError(`watchConfig(): interval is a duration ('30s', 60000)`);
  let current = await loadRemoteConfig(options);
  let timer = null;
  let stopped = false;
  let running = null;
  const report = onError || ((err) => process.emitWarning(err.message, { code: 'XUFA_CONFIG_RELOAD' }));
  const plain = (config) => JSON.parse(JSON.stringify({ ...config }));
  async function refresh() {
    if (running) return running;
    running = (async () => {
      try {
        const next = await loadRemoteConfig(options);
        const changed = changedPaths(plain(current), plain(next));
        if (changed.length) {
          const previous = current;
          current = next;
          if (onChange) await onChange(next, previous, changed);
        }
      } catch (err) {
        report(err);
      } finally {
        running = null;
      }
      return current;
    })();
    return running;
  }
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => refresh().then(schedule), every.value);
    timer.unref();
  };
  schedule();
  // Sources that can wait for their changes (Consul's blocking queries) are followed: a change is read at once, not
  // at the next interval. A failure is told and tried again later (1 s, then twice as long, 30 s at most).
  const controller = new AbortController();
  const { env } = readLocal(options);
  const pause = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms).unref();
    });
  async function follow(source) {
    let index = null;
    let failures = 0;
    while (!stopped) {
      try {
        const answer = await source.watch({ env, signal: controller.signal, index });
        if (answer.index === null) return; // a server that does not wait: the interval reads it
        if (index !== null && answer.index !== index) await refresh();
        // An index that goes back (the server started again) starts again.
        index = answer.index > 0 && (index === null || answer.index >= index) ? answer.index : null;
        failures = 0;
      } catch (err) {
        if (stopped) return;
        failures += 1;
        report(err);
        await pause(Math.min(30000, 1000 * 2 ** (failures - 1)));
      }
    }
  }
  if (blocking) {
    for (const source of options.remote || []) if (typeof source.watch === 'function') follow(source);
  }
  return {
    get current() {
      return current;
    },
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    },
  };
}

module.exports = { loadRemoteConfig, watchConfig, sources, parseDocument };
