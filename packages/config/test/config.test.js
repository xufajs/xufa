// The configuration of an app from folders made here: the layers and their order (files by environment, local ones,
// .env files, variables of the schema and prefixed, overrides), the formats (JSON, YAML, JS), templates, the schema
// (conversions, defaults, checks, every error at once), and the configuration made (frozen, get, has, secrets
// redacted).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import { loadConfig, parseDotenv, ConfigError } from '../index.js';

let dirs = [];
function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-config-'));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

const errorsOf = (fn) => {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return err.errors.map((e) => `${e.path}: ${e.message}`);
  }
  throw new Error('no ConfigError');
};

describe('layers', () => {
  it('default, the environment, local and local of the environment, each over the one before', () => {
    const cwd = project({
      'config/default.json': { server: { host: '0.0.0.0', port: 3000 }, features: ['a', 'b'], name: 'app' },
      'config/production.yaml': 'server:\n  port: 80\nfeatures: [c]\n',
      'config/local.js': "module.exports = ({ name }) => ({ server: { host: 'localhost' }, seen: name });",
      'config/local-production.json': { name: 'app (here)' },
      'config/development.json': { server: { port: 1 } },
    });
    const config = loadConfig({ cwd, env: 'production', environment: {}, defaults: { server: { timeout: 5 } } });
    expect(config).toEqual({
      server: { host: 'localhost', port: 80, timeout: 5 },
      features: ['c'], // arrays replace
      name: 'app (here)',
      seen: 'production',
    });
    expect(config.sources.map((file) => path.basename(file))).toEqual([
      'default.json',
      'production.yaml',
      'local.js',
      'local-production.json',
    ]);
  });

  it('the environment: options.env, NODE_ENV, or development', () => {
    const cwd = project({ 'config/development.json': { e: 'dev' }, 'config/test.json': { e: 'test' } });
    expect(loadConfig({ cwd, environment: {} }).e).toBe('dev');
    expect(loadConfig({ cwd, environment: { NODE_ENV: 'test' } }).e).toBe('test');
    expect(loadConfig({ cwd, env: 'development', environment: { NODE_ENV: 'test' } }).e).toBe('dev');
  });

  it('variables of the schema, prefixed ones, then overrides, over the files', () => {
    const cwd = project({
      'config/default.json': { db: { url: 'from-file', maxConnections: 10, ssl: false }, port: 1 },
    });
    const environment = {
      DATABASE_URL: 'postgres://env/app',
      APP__DB__MAX_CONNECTIONS: '20',
      APP__DB__SSL: 'true',
      APP__DB__POOL_IDLE_TIMEOUT: '30s',
      APP__PORT: '2',
      OTHER__PORT: '9',
    };
    const config = loadConfig({
      cwd,
      environment,
      envPrefix: 'APP',
      schema: {
        db: {
          url: { type: 'url', env: 'DATABASE_URL' },
          maxConnections: { type: 'integer' },
          ssl: { type: 'boolean' },
        },
      },
      overrides: { port: 3 },
    });
    expect(config.db).toEqual({ url: 'postgres://env/app', maxConnections: 20, ssl: true, poolIdleTimeout: '30s' });
    expect(config.port).toBe(3);
  });

  it('prefixed variables without a schema take the type of the value they replace', () => {
    const cwd = project({ 'config/default.json': { n: 1, on: false, list: [1], obj: { a: 1 }, text: 'x' } });
    const environment = { X__N: '42', X__ON: 'yes', X__LIST: '[2,3]', X__TEXT: '7', X__NEW_KEY: 'v', X__N2: 'abc' };
    const config = loadConfig({ cwd, environment, envPrefix: 'X' });
    expect(config).toEqual({ n: 42, on: true, list: [2, 3], obj: { a: 1 }, text: '7', newKey: 'v', n2: 'abc' });
    const wrong = loadConfig({ cwd, environment: { X__N: 'many' }, envPrefix: 'X' });
    expect(wrong.n).toBe('many'); // not a number: as it is (a schema would refuse it)
  });

  it('errors: several files of one layer, a folder given that is not there, a file that is not an object, bad JSON', () => {
    const two = project({ 'config/default.json': {}, 'config/default.yaml': 'a: 1' });
    expect(() => loadConfig({ cwd: two, environment: {} })).toThrow(
      /Several files of default .*default.json, default.yaml/
    );
    expect(() => loadConfig({ cwd: two, dir: 'nope', environment: {} })).toThrow(/does not exist/);
    expect(loadConfig({ cwd: project({}), environment: {} })).toEqual({}); // no folder (not given): no files
    const list = project({ 'config/default.json': [1, 2] });
    expect(() => loadConfig({ cwd: list, environment: {} })).toThrow(/a configuration is an object/);
    const bad = project({ 'config/default.json': '{ "a": ' });
    expect(() => loadConfig({ cwd: bad, environment: {} })).toThrow(/default\.json: .*JSON/);
  });
});

describe('the file of the app (option file)', () => {
  it('xufa.yaml (or .json, .js) below config/, with templates', () => {
    const cwd = project({
      'xufa.yaml': [
        'name: Library',
        'database:',
        `  url: "{{ env.DATABASE_URL ?? 'sqlite:data/app.db' }}"`,
        'apps: [catalog]',
      ].join('\n'),
      'config/production.json': { database: { pool: 4 } },
    });
    const config = loadConfig({ cwd, file: 'xufa', env: 'production', environment: { DATABASE_URL: 'memory:' } });
    expect(config).toEqual({ name: 'Library', database: { url: 'memory:', pool: 4 }, apps: ['catalog'] });
    expect(config.sources.map((file) => path.basename(file))).toEqual(['xufa.yaml', 'production.json']);
    const js = project({ 'xufa.js': "module.exports = ({ name }) => ({ env: name, debug: name !== 'production' });" });
    expect(loadConfig({ cwd: js, file: 'xufa.js', env: 'test', environment: {} })).toEqual({
      env: 'test',
      debug: true,
    });
  });

  it('verbatim: texts that are templates of something else', () => {
    const cwd = project({ 'xufa.json': { mails: { reset: { text: 'Hi {{ name }}' } }, port: '{{ 1 + 1 }}' } });
    const config = loadConfig({ cwd, file: 'xufa', environment: {}, verbatim: ['mails'] });
    expect(config).toEqual({ mails: { reset: { text: 'Hi {{ name }}' } }, port: 2 });
  });

  it('missing, or two of them', () => {
    expect(() => loadConfig({ cwd: project({}), file: 'xufa', environment: {} })).toThrow('does not exist');
    const two = project({ 'xufa.json': {}, 'xufa.yaml': 'a: 1\n' });
    expect(() => loadConfig({ cwd: two, file: 'xufa', environment: {} })).toThrow('one only');
  });
});

describe('.env files', () => {
  it('fill in what the environment does not have; the later files first', () => {
    const cwd = project({
      '.env': 'A=env\nB=env\nC=env\nD=env\n',
      '.env.production': 'B=production\n',
      '.env.local': 'C=local\n',
      '.env.production.local': 'D=production-local\n',
      'config/default.json': {
        a: '{{ env.A }}',
        b: '{{ env.B }}',
        c: '{{ env.C }}',
        d: '{{ env.D }}',
        e: '{{ env.E }}',
      },
    });
    const config = loadConfig({ cwd, env: 'production', environment: { A: 'process' } });
    expect(config).toEqual({ a: 'process', b: 'production', c: 'local', d: 'production-local' });
    expect(config.sources.map((f) => path.basename(f))).toEqual([
      '.env',
      '.env.production',
      '.env.local',
      '.env.production.local',
      'default.json',
    ]);
    expect(loadConfig({ cwd, env: 'production', environment: {}, dotenv: false }).a).toBe(undefined);
  });

  it('files given (they must exist), and populate', () => {
    const cwd = project({
      'secrets.env': 'XUFA_CONFIG_TEST_SECRET=s3cret\n',
      'config/default.json': { s: '{{ env.XUFA_CONFIG_TEST_SECRET }}' },
    });
    expect(loadConfig({ cwd, environment: {}, dotenv: 'secrets.env' }).s).toBe('s3cret');
    expect(() => loadConfig({ cwd, environment: {}, dotenv: ['missing.env'] })).toThrow(/missing\.env does not exist/);
    expect(process.env.XUFA_CONFIG_TEST_SECRET).toBe(undefined);
    try {
      loadConfig({ cwd, environment: {}, dotenv: 'secrets.env', populate: true });
      expect(process.env.XUFA_CONFIG_TEST_SECRET).toBe('s3cret');
    } finally {
      delete process.env.XUFA_CONFIG_TEST_SECRET;
    }
  });

  it('parseDotenv: quotes, escapes, several lines, comments, export', () => {
    const text = [
      '# a comment',
      'export PLAIN = value with spaces  # a comment',
      'HASH=a#b',
      'DOUBLE="line 1\\nline 2 \\"q\\" # not a comment"',
      "SINGLE='as \\n written'",
      'MULTI="first',
      'second"',
      'EMPTY=',
      '',
      'URL=postgres://u:p@h/db?x=1',
    ].join('\n');
    expect(parseDotenv(text)).toEqual({
      PLAIN: 'value with spaces',
      HASH: 'a#b',
      DOUBLE: 'line 1\nline 2 "q" # not a comment',
      SINGLE: 'as \\n written',
      MULTI: 'first\nsecond',
      EMPTY: '',
      URL: 'postgres://u:p@h/db?x=1',
    });
    expect(() => parseDotenv('A=1\nnot a line\n', 'x.env')).toThrow('x.env:2: not a KEY=value line');
    expect(() => parseDotenv('A="open\n', 'x.env')).toThrow('x.env:1: the value of A has no closing "');
    expect(() => parseDotenv('A="v" extra\n', 'x.env')).toThrow(/text after the value of A/);
  });
});

describe('templates', () => {
  const load = (defaults, environment = {}, schema) => loadConfig({ cwd: project({}), environment, defaults, schema });

  it('alone, the value of the expression; in a text, written in it; env and config', () => {
    const config = load(
      {
        port: '{{ Number(env.PORT ?? 3000) }}',
        debug: '{{ env.DEBUG === "1" }}',
        host: 'localhost',
        url: 'http://{{ config.host }}:{{ config.port }}/',
        list: ['{{ config.host }}', 'x'],
        nested: { a: '{{ config.deep.b.toUpperCase() }}' },
        deep: { b: 'text' },
        keys: '{{ Object.keys(config.deep).join() }}',
      },
      { PORT: '8080' }
    );
    expect(config).toEqual({
      port: 8080,
      debug: false,
      host: 'localhost',
      url: 'http://localhost:8080/',
      list: ['localhost', 'x'],
      nested: { a: 'TEXT' },
      deep: { b: 'text' },
      keys: 'b',
    });
  });

  it('undefined alone: the key is missing (its default); in a text: empty', () => {
    const config = load(
      { a: '{{ env.NOPE }}', b: 'x{{ env.NOPE }}y' },
      {},
      { a: { type: 'string', default: 'fallback' }, b: { type: 'string' } }
    );
    expect(config).toEqual({ a: 'fallback', b: 'xy' });
  });

  it('errors: every template that fails, a cycle, and what an expression cannot reach', () => {
    expect(errorsOf(() => load({ a: '{{ 1 + }}', b: { c: '{{ env.constructor }}' }, d: 'ok' }))).toEqual([
      expect.stringMatching(/^a: the template \{\{ 1 \+ \}\}: /),
      expect.stringMatching(/^b\.c: the template \{\{ env\.constructor \}\}: .*constructor/),
    ]);
    expect(() => load({ a: '{{ config.b }}', b: '{{ config.c }}', c: '{{ config.a }}' })).toThrow(
      /refer to each other: a -> b -> c -> a/
    );
    expect(errorsOf(() => load({ a: '{{ process.exit() }}', b: '{{ evn.PORT }}' }))).toEqual([
      expect.stringMatching(/^a: .*process/),
      expect.stringMatching(/^b: .*evn/),
    ]);
  });
});

describe('the schema', () => {
  const load = (defaults, schema, options = {}) =>
    loadConfig({ cwd: project({}), environment: {}, defaults, schema, ...options });

  it('converts texts to their types', () => {
    const schema = {
      i: { type: 'integer' },
      n: { type: 'number' },
      b1: { type: 'boolean' },
      b2: { type: 'boolean' },
      p: { type: 'port' },
      u: { type: 'url' },
      d1: { type: 'duration' },
      d2: { type: 'duration' },
      a1: { type: 'array' },
      a2: { type: 'array', items: 'integer' },
      o: { type: 'object' },
      s: { type: 'string' },
      any: { type: 'any' },
    };
    const config = load(
      {
        i: '42',
        n: '1.5',
        b1: 'off',
        b2: 'YES',
        p: '8080',
        u: 'https://x.org/a',
        d1: '1h30m',
        d2: 250,
        a1: 'a, b ,c',
        a2: '[1,"2"]',
        o: '{"k":1}',
        s: 5,
        any: [1],
      },
      schema
    );
    expect(config).toEqual({
      i: 42,
      n: 1.5,
      b1: false,
      b2: true,
      p: 8080,
      u: 'https://x.org/a',
      d1: 5400000,
      d2: 250,
      a1: ['a', 'b', 'c'],
      a2: [1, 2],
      o: { k: 1 },
      s: '5',
      any: [1],
    });
  });

  it('defaults, required (with its variable), nullable', () => {
    const schema = {
      server: { port: { type: 'port', default: 3000 }, host: { type: 'string', default: () => 'computed' } },
      db: { url: { type: 'url', required: true, env: 'DATABASE_URL' }, replica: { type: 'url', nullable: true } },
      optional: { type: 'string' },
    };
    expect(errorsOf(() => load({}, schema))).toEqual(['db.url: is required (set DATABASE_URL)']);
    const config = load({ db: { url: 'postgres://h/db', replica: null } }, schema);
    expect(config).toEqual({ server: { port: 3000, host: 'computed' }, db: { url: 'postgres://h/db', replica: null } });
    expect(errorsOf(() => load({ db: { url: null } }, schema))).toEqual(['db.url: cannot be null']);
  });

  it('every error at once: types, values, pattern, min and max, keys not in the schema (strict)', () => {
    const schema = {
      port: { type: 'port' },
      level: { type: 'string', values: ['debug', 'info'] },
      code: { type: 'string', pattern: '^[A-Z]{3}$' },
      workers: { type: 'integer', min: 1, max: 8 },
      name: { type: 'string', min: 2 },
      tags: { type: 'array', items: 'integer' },
      big: { type: 'integer' },
      nested: { ok: { type: 'boolean' } },
    };
    const err = (() => {
      try {
        load(
          {
            port: 70000,
            level: 'trace',
            code: 'abcd',
            workers: 9,
            name: 'x',
            tags: '1,b',
            big: 1.5,
            nested: { ok: 'maybe', extra: 1 },
            extra: true,
          },
          schema,
          { strict: true }
        );
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.code).toBe('XUFA_CONFIG_ERR');
    expect(err.errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'port: 70000 is not a port (0-65535)',
      'level: "trace" is not one of "debug", "info"',
      'code: "abcd" does not match /^[A-Z]{3}$/',
      'workers: 9 is more than 8',
      'name: "x" is less than 2 long',
      'tags: item 1: "b" is not an integer',
      'big: 1.5 is not an integer',
      'nested.ok: "maybe" is not a boolean',
      'nested.extra: is not in the schema',
      'extra: is not in the schema',
    ]);
    expect(err.message).toMatch(/^The configuration \(development\) has errors:\n {2}- port: 70000 is not a port/);
    expect(() => load({}, { a: { type: 'date' } })).toThrow(/'date' is not a type/);
    expect(() => load({}, { a: 5 })).toThrow(/The schema of a is an object/);
  });
});

describe('the configuration', () => {
  const schema = { db: { password: { type: 'string', sensitive: true }, url: { type: 'string' } } };
  const config = () =>
    loadConfig({
      cwd: project({}),
      environment: {},
      defaults: {
        db: { password: 'pw', url: 'u', apiKey: 'k', token: null },
        auth: { jwtSecret: 's', passphrase: 'p' },
        list: [{ secret: 'x' }],
        name: 'app',
      },
      schema,
    });

  it('frozen; get() of a key that is not there throws; has()', () => {
    const c = config();
    expect(Object.isFrozen(c) && Object.isFrozen(c.db) && Object.isFrozen(c.list[0])).toBe(true);
    expect(() => {
      'use strict';

      c.name = 'other';
    }).toThrow(TypeError);
    expect(c.get('db.url')).toBe('u');
    expect(c.get(['db', 'url'])).toBe('u');
    expect(() => c.get('db.uri')).toThrow('The configuration has no db.uri');
    expect(() => c.get('name.x')).toThrow('The configuration has no name.x');
    expect([c.has('db.url'), c.has('db.uri'), c.has('nope.x')]).toEqual([true, false, false]);
    expect(Object.keys(c)).toEqual(['db', 'auth', 'list', 'name']);
  });

  it('secrets redacted: keys sensitive in the schema, and named as secrets; JSON, inspect, redacted()', () => {
    const c = config();
    const shown = {
      db: { password: '[redacted]', url: 'u', apiKey: '[redacted]', token: null },
      auth: { jwtSecret: '[redacted]', passphrase: '[redacted]' },
      list: [{ secret: '[redacted]' }],
      name: 'app',
    };
    expect(c.redacted()).toEqual(shown);
    expect(JSON.parse(JSON.stringify(c))).toEqual(shown);
    expect(util.inspect(c, { depth: 5 })).not.toMatch(/pw|'k'|'s'/);
    expect(util.inspect(c, { depth: 5 })).toMatch(/\[redacted\]/);
    expect(c.db.password).toBe('pw'); // the values themselves are there
  });

  it('the names of its methods cannot be keys', () => {
    expect(() => loadConfig({ cwd: project({}), environment: {}, defaults: { get: 1 } })).toThrow(
      /'get' cannot be a key/
    );
  });
});
