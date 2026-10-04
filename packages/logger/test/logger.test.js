const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createLogger = require('..');

function sink() {
  const lines = [];
  return {
    lines,
    write(line) {
      lines.push(line);
    },
    get last() {
      return JSON.parse(lines[lines.length - 1]);
    },
    get all() {
      return lines.map((line) => JSON.parse(line));
    },
  };
}

describe('levels', () => {
  it('writes level, time, pid, hostname and msg, in that order', () => {
    const out = sink();
    const log = createLogger(out);
    const before = Date.now();
    log.info('hello');
    const line = out.last;
    expect(Object.keys(line)).toEqual(['level', 'time', 'pid', 'hostname', 'msg']);
    expect(line.level).toBe(30);
    expect(line.time).toBeGreaterThanOrEqual(before);
    expect(line.pid).toBe(process.pid);
    expect(line.hostname).toBe(os.hostname());
    expect(line.msg).toBe('hello');
    expect(out.lines[0].endsWith('}\n')).toBe(true);
  });

  it('defaults to info and skips lower levels', () => {
    const out = sink();
    const log = createLogger(out);
    expect(log.level).toBe('info');
    expect(log.levelVal).toBe(30);
    log.trace('a');
    log.debug('b');
    log.info('c');
    log.warn('d');
    log.error('e');
    log.fatal('f');
    expect(out.all.map((l) => l.level)).toEqual([30, 40, 50, 60]);
  });

  it('changes the level at runtime', () => {
    const out = sink();
    const log = createLogger({ level: 'error' }, out);
    log.warn('no');
    log.level = 'trace';
    log.trace('yes');
    expect(out.all.map((l) => l.msg)).toEqual(['yes']);
    expect(log.isLevelEnabled('debug')).toBe(true);
    log.level = 'silent';
    log.fatal('no');
    expect(out.lines.length).toBe(1);
    expect(log.isLevelEnabled('fatal')).toBe(false);
  });

  it('throws on unknown levels', () => {
    expect(() => createLogger({ level: 'nope' }, sink())).toThrow('unknown level nope');
  });

  it('supports custom levels', () => {
    const out = sink();
    const log = createLogger({ customLevels: { audit: 35 }, level: 'audit' }, out);
    log.info('no');
    log.audit('yes');
    expect(out.last).toMatchObject({ level: 35, msg: 'yes' });
    expect(log.levels.values.audit).toBe(35);
    expect(log.levels.labels[35]).toBe('audit');
  });

  it('supports only custom levels', () => {
    const out = sink();
    const log = createLogger({ customLevels: { low: 1, high: 2 }, useOnlyCustomLevels: true, level: 'high' }, out);
    expect(log.info).toBeUndefined();
    log.low('no');
    log.high('yes');
    expect(out.all.map((l) => l.msg)).toEqual(['yes']);
  });

  it('is silent when disabled', () => {
    const out = sink();
    const log = createLogger({ enabled: false }, out);
    log.fatal('x');
    expect(out.lines).toEqual([]);
  });
});

describe('arguments', () => {
  it('formats printf placeholders', () => {
    const out = sink();
    const log = createLogger(out);
    log.info('a %s b %d c %j d %o %%', 'str', 42.5, { x: 1 }, [1]);
    expect(out.last.msg).toBe('a str b 42.5 c {"x":1} d [1] %');
    log.info('%i items', 3.9);
    expect(out.last.msg).toBe('3 items');
    log.info('missing %s and %s', 'one');
    expect(out.last.msg).toBe('missing one and %s');
  });

  it('merges an object before the message', () => {
    const out = sink();
    const log = createLogger({ base: null, timestamp: false }, out);
    log.info({ a: 1, b: 'x', skip: undefined }, 'hello %s', 'world');
    expect(out.lines[0]).toBe('{"level":30,"a":1,"b":"x","msg":"hello world"}\n');
  });

  it('logs an object without message', () => {
    const out = sink();
    const log = createLogger({ base: null, timestamp: false }, out);
    log.info({ a: 1 });
    expect(out.lines[0]).toBe('{"level":30,"a":1}\n');
  });

  it('serializes errors under err with their message', () => {
    const out = sink();
    const log = createLogger(out);
    const err = new TypeError('boom');
    err.code = 'E_BOOM';
    log.error(err);
    expect(out.last.msg).toBe('boom');
    expect(out.last.err).toMatchObject({ type: 'TypeError', message: 'boom', code: 'E_BOOM' });
    expect(out.last.err.stack).toContain('TypeError: boom');
    log.error(err, 'custom');
    expect(out.last.msg).toBe('custom');
    log.error({ err }, 'nested');
    expect(out.last.err.type).toBe('TypeError');
  });

  it('includes the causes of errors', () => {
    const out = sink();
    const log = createLogger(out);
    log.error(new Error('outer', { cause: new Error('inner') }));
    expect(out.last.err.message).toBe('outer: inner');
    expect(out.last.err.stack).toContain('caused by: Error: inner');
  });

  it('escapes strings and handles circular objects', () => {
    const out = sink();
    const log = createLogger(out);
    const obj = { name: 'a"b\n' };
    obj.self = obj;
    log.info(obj, 'quote " and \u0001');
    expect(out.last.name).toBe('a"b\n');
    expect(out.last.self).toBe('[Circular]');
    expect(out.last.msg).toBe('quote " and \u0001');
  });

  it('writes numbers, booleans and null as messages', () => {
    const out = sink();
    const log = createLogger(out);
    log.info(42);
    expect(out.last.msg).toBe(42);
    log.info(null);
    expect(out.last.msg).toBe(null);
  });
});

describe('child loggers', () => {
  it('adds bindings after the base ones', () => {
    const out = sink();
    const log = createLogger({ base: { app: 'x' }, timestamp: false }, out);
    const child = log.child({ reqId: 'req-1' });
    child.info('hi');
    expect(out.lines[0]).toBe('{"level":30,"app":"x","reqId":"req-1","msg":"hi"}\n');
    expect(child.bindings()).toEqual({ app: 'x', reqId: 'req-1' });
    const grandchild = child.child({ user: 'u' });
    grandchild.warn('deep');
    expect(out.last).toMatchObject({ app: 'x', reqId: 'req-1', user: 'u', msg: 'deep' });
  });

  it('inherits the level, and may set its own', () => {
    const out = sink();
    const log = createLogger({ level: 'warn' }, out);
    const child = log.child({});
    expect(child.level).toBe('warn');
    const verbose = log.child({}, { level: 'trace' });
    verbose.debug('yes');
    child.debug('no');
    expect(out.all.map((l) => l.msg)).toEqual(['yes']);
    expect(log.level).toBe('warn');
  });

  it('keeps its level when the parent changes', () => {
    const out = sink();
    const log = createLogger(out);
    const child = log.child({ a: 1 });
    log.level = 'error';
    child.info('still');
    expect(out.last.msg).toBe('still');
  });

  it('adds serializers of its own', () => {
    const out = sink();
    const log = createLogger({ serializers: { a: (v) => `parent-${v}` } }, out);
    const child = log.child({}, { serializers: { b: (v) => `child-${v}` } });
    child.info({ a: 1, b: 2 });
    expect(out.last).toMatchObject({ a: 'parent-1', b: 'child-2' });
    log.info({ b: 2 });
    expect(out.last.b).toBe(2);
  });

  it('applies serializers to bindings', () => {
    const out = sink();
    const log = createLogger({ serializers: { user: (u) => u.name } }, out);
    log.child({ user: { name: 'ada', password: 'x' } }).info('hi');
    expect(out.last.user).toBe('ada');
  });

  it('prefixes messages', () => {
    const out = sink();
    const log = createLogger({ msgPrefix: '[app] ' }, out);
    log.child({}, { msgPrefix: '[db] ' }).info('query');
    expect(out.last.msg).toBe('[app] [db] query');
  });

  it('requires bindings', () => {
    const log = createLogger(sink());
    expect(() => log.child()).toThrow('missing bindings for child Pino');
  });

  it('sets bindings', () => {
    const out = sink();
    const log = createLogger({ base: null }, out);
    log.setBindings({ a: 1 });
    log.info('x');
    expect(log.bindings()).toEqual({ a: 1 });
    expect(out.last.a).toBe(1);
  });

  it('calls onChild', () => {
    const children = [];
    const log = createLogger({ onChild: (child) => children.push(child) }, sink());
    const child = log.child({ a: 1 });
    expect(children).toEqual([child]);
  });
});

describe('options', () => {
  it('names the logger', () => {
    const out = sink();
    createLogger({ name: 'api' }, out).info('x');
    expect(out.last.name).toBe('api');
  });

  it('changes the message and error keys', () => {
    const out = sink();
    const log = createLogger({ messageKey: 'message', errorKey: 'error' }, out);
    log.error(new Error('e'));
    expect(out.last.message).toBe('e');
    expect(out.last.error.type).toBe('Error');
  });

  it('takes timestamp functions', () => {
    const out = sink();
    createLogger({ timestamp: createLogger.stdTimeFunctions.isoTime }, out).info('x');
    expect(typeof out.last.time).toBe('string');
    createLogger({ timestamp: () => ',"t":1' }, out).info('x');
    expect(out.last.t).toBe(1);
    createLogger({ timestamp: false }, out).info('x');
    expect(out.last.time).toBeUndefined();
  });

  it('applies formatters', () => {
    const out = sink();
    const log = createLogger(
      {
        base: { pid: 1 },
        timestamp: false,
        formatters: {
          level: (label) => ({ severity: label.toUpperCase() }),
          bindings: (bindings) => ({ process: bindings.pid }),
          log: (obj) => ({ ...obj, extra: true }),
        },
      },
      out
    );
    log.info({ a: 1 }, 'm');
    expect(out.lines[0]).toBe('{"severity":"INFO","process":1,"a":1,"extra":true,"msg":"m"}\n');
  });

  it('mixes objects in', () => {
    const out = sink();
    const log = createLogger({ mixin: (obj, level) => ({ level2: level, a: 0 }) }, out);
    log.info({ a: 1 }, 'x');
    expect(out.last).toMatchObject({ level2: 30, a: 1 });
  });

  it('nests the object logged', () => {
    const out = sink();
    const log = createLogger({ nestedKey: 'payload' }, out);
    log.info({ a: 1 }, 'x');
    expect(out.last.payload).toEqual({ a: 1 });
  });

  it('calls the logMethod hook', () => {
    const out = sink();
    const log = createLogger(
      {
        hooks: {
          logMethod(args, method) {
            method.apply(this, [`hooked ${args[0]}`]);
          },
        },
      },
      out
    );
    log.info('x');
    expect(out.last.msg).toBe('hooked x');
  });

  it('writes crlf', () => {
    const out = sink();
    createLogger({ crlf: true }, out).info('x');
    expect(out.lines[0].endsWith('}\r\n')).toBe(true);
  });

  it('takes the stream in the options', () => {
    const out = sink();
    createLogger({ stream: out }).info('x');
    expect(out.lines.length).toBe(1);
    expect(() => createLogger({ stream: out, file: 'x' })).toThrow();
  });
});

describe('redact', () => {
  it('censors paths without changing the object logged', () => {
    const out = sink();
    const log = createLogger({ redact: ['req.headers.authorization', 'users[*].password', 'a["b-c"]'] }, out);
    const obj = {
      req: { headers: { authorization: 'secret', host: 'h' } },
      users: [{ name: 'a', password: 'p' }, { name: 'b' }],
      a: { 'b-c': 1, d: 2 },
    };
    log.info(obj);
    expect(out.last.req.headers).toEqual({ authorization: '[Redacted]', host: 'h' });
    expect(out.last.users).toEqual([{ name: 'a', password: '[Redacted]' }, { name: 'b' }]);
    expect(out.last.a).toEqual({ 'b-c': '[Redacted]', d: 2 });
    expect(obj.req.headers.authorization).toBe('secret');
    expect(obj.users[0].password).toBe('p');
  });

  it('removes paths or uses a censor', () => {
    const out = sink();
    createLogger({ redact: { paths: ['a.b'], remove: true } }, out).info({ a: { b: 1, c: 2 } });
    expect(out.last.a).toEqual({ c: 2 });
    createLogger({ redact: { paths: ['a.b'], censor: (v, p) => `${p.join('.')}=${v}` } }, out).info({ a: { b: 1 } });
    expect(out.last.a.b).toBe('a.b=1');
    createLogger({ redact: { paths: ['*.secret'] } }, out).info({ x: { secret: 1 }, y: { secret: 2, z: 3 } });
    expect(out.last).toMatchObject({ x: { secret: '[Redacted]' }, y: { secret: '[Redacted]', z: 3 } });
  });

  it('redacts after the serializers', () => {
    const out = sink();
    const log = createLogger(
      { redact: ['req.headers.authorization'], serializers: { req: (req) => ({ headers: req.headers }) } },
      out
    );
    log.info({ req: { headers: { authorization: 'x' }, other: 1 } });
    expect(out.last.req).toEqual({ headers: { authorization: '[Redacted]' } });
  });
});

describe('destination', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-logger-'));

  it('writes synchronously to a file', () => {
    const file = path.join(dir, 'sync.log');
    const dest = createLogger.destination(file);
    const log = createLogger(dest);
    log.info('one');
    log.info('two');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    expect(lines.map((l) => l.msg)).toEqual(['one', 'two']);
    dest.end();
  });

  it('buffers asynchronous writes and flushes them', async () => {
    const file = path.join(dir, 'async.log');
    const dest = createLogger.destination({ dest: file, sync: false, minLength: 4096 });
    const log = createLogger(dest);
    log.info('buffered');
    expect(fs.readFileSync(file, 'utf8')).toBe('');
    await new Promise((resolve) => {
      log.flush(resolve);
    });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).msg).toBe('buffered');
    log.info('sync flush');
    dest.flushSync();
    expect(fs.readFileSync(file, 'utf8')).toContain('sync flush');
    await new Promise((resolve) => {
      dest.on('close', resolve);
      dest.end();
    });
  });

  it('creates directories', () => {
    const file = path.join(dir, 'a', 'b', 'c.log');
    const dest = createLogger.destination({ dest: file, mkdir: true });
    createLogger(dest).info('x');
    expect(fs.existsSync(file)).toBe(true);
    dest.end();
  });

  it('is reachable through the stream symbol', () => {
    const out = sink();
    expect(createLogger(out)[createLogger.symbols.streamSym]).toBe(out);
  });
});

describe('multistream', () => {
  it('sends each line to the streams of its level', () => {
    const all = sink();
    const errors = sink();
    const log = createLogger(
      { level: 'debug' },
      createLogger.multistream([
        { stream: all, level: 'debug' },
        { stream: errors, level: 'error' },
      ])
    );
    log.debug('d');
    log.error('e');
    expect(all.all.map((l) => l.msg)).toEqual(['d', 'e']);
    expect(errors.all.map((l) => l.msg)).toEqual(['e']);
  });
});

describe('std serializers', () => {
  it('serializes requests and responses', () => {
    const { req, res } = createLogger.stdSerializers;
    const raw = { method: 'GET', url: '/x', headers: { a: '1' }, socket: { remoteAddress: '::1', remotePort: 1 } };
    expect(req(raw)).toMatchObject({ method: 'GET', url: '/x', remoteAddress: '::1', remotePort: 1 });
    expect(res({ statusCode: 200, headersSent: true, getHeaders: () => ({ b: '2' }) })).toEqual({
      statusCode: 200,
      headers: { b: '2' },
    });
  });

  it('serializes errors with causes as objects', () => {
    const out = createLogger.stdSerializers.errWithCause(new Error('a', { cause: new Error('b') }));
    expect(out.message).toBe('a');
    expect(out.cause.message).toBe('b');
  });

  it('serializes aggregate errors', () => {
    const out = createLogger.stdSerializers.err(new AggregateError([new Error('x')], 'many'));
    expect(out.aggregateErrors[0].message).toBe('x');
  });
});

describe('pino compatibility', () => {
  it('wraps serializers of your own around the standard ones', () => {
    const { err, wrapErrorSerializer, wrapRequestSerializer } = createLogger.stdSerializers;
    const withExtra = wrapErrorSerializer((serialized) => ({ ...serialized, extra: true }));
    expect(withExtra(new Error('x'))).toMatchObject({ message: 'x', extra: true });
    expect(wrapErrorSerializer(err)).toBe(err);
    const method = wrapRequestSerializer((serialized) => serialized.method);
    expect(method({ method: 'POST', url: '/', headers: {}, socket: {} })).toBe('POST');
  });

  it('maps requests and responses to objects with one key', () => {
    const { mapHttpRequest, mapHttpResponse } = createLogger.stdSerializers;
    expect(mapHttpRequest({ method: 'GET', url: '/a', headers: {}, socket: {} }).req.url).toBe('/a');
    expect(mapHttpResponse({ statusCode: 204, headersSent: true, getHeaders: () => ({}) }).res.statusCode).toBe(204);
  });

  it('writes ISO times with nanoseconds', () => {
    const time = createLogger.stdTimeFunctions.isoTimeNano();
    expect(time).toMatch(/^,"time":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{9}Z"$/);
    const parsed = Date.parse(JSON.parse(`{${time.slice(1)}}`).time);
    expect(Math.abs(parsed - Date.now())).toBeLessThan(1000);
  });
});
