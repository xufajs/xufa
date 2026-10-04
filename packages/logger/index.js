// @xufa/logger: a JSON logger with the API of pino. Lines are built as strings: the bindings of a logger are
// serialized once, when it is created, and each line adds its level, time, the properties logged and the message.
const os = require('node:os');
const { asString, asKey, stringify } = require('./lib/stringify');
const { format } = require('./lib/format');
const { createRedactor } = require('./lib/redact');
const stdSerializers = require('./lib/serializers');
const { Destination } = require('./lib/destination');
const { version } = require('./package.json');

const DEFAULT_LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

const configSym = Symbol('xufa.logger.config');
const chindingsSym = Symbol('xufa.logger.chindings');
const serializersSym = Symbol('xufa.logger.serializers');
const redactSym = Symbol('xufa.logger.redact');
const levelValSym = Symbol('xufa.logger.levelVal');
const levelSym = Symbol('xufa.logger.level');
const msgPrefixSym = Symbol('xufa.logger.msgPrefix');
const streamSym = Symbol('xufa.logger.stream');
const writeSym = Symbol('xufa.logger.write');
const needsMetadataGsym = Symbol.for('pino.metadata');

const symbols = {
  configSym,
  chindingsSym,
  serializersSym,
  redactSym,
  levelValSym,
  msgPrefixSym,
  streamSym,
  writeSym,
  needsMetadataGsym,
};

// The ISO time with nanoseconds: the wall clock when the module was loaded, advanced by the monotonic clock.
const NS_PER_MS = 1000000n;
const startNs = BigInt(Date.now()) * NS_PER_MS;
const startHr = process.hrtime.bigint();
function isoTimeNano() {
  const now = startNs + (process.hrtime.bigint() - startHr);
  const iso = new Date(Number(now / NS_PER_MS)).toISOString(); // 2026-10-02T12:34:56.789Z
  const nanos = (now % 1000000000n).toString().padStart(9, '0');
  return `,"time":"${iso.slice(0, 19)}.${nanos}Z"`;
}

const stdTimeFunctions = {
  epochTime: () => `,"time":${Date.now()}`,
  unixTime: () => `,"time":${Math.round(Date.now() / 1000)}`,
  isoTime: () => `,"time":"${new Date().toISOString()}"`,
  isoTimeNano,
  nullTime: () => '',
};

function noop() {}

// The properties of an object as JSON members, each one preceded by a comma.
function members(obj) {
  let out = '';
  for (const key in obj) {
    const value = obj[key];
    if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const json = stringify(value, obj);
    if (json !== undefined) out += `,${asKey(key)}:${json}`;
  }
  return out;
}

// The logging function of one level, shared by every logger: logger.info(obj?, msg?, ...args).
function createLogFunction(levelVal) {
  return function LOG(a, b) {
    const config = this[configSym];
    if (config.logMethod !== null) {
      config.logMethod.call(
        this,
        Array.prototype.slice.call(arguments),
        (...args) => write(this, levelVal, args),
        levelVal
      );
      return;
    }
    const argc = arguments.length;
    let obj;
    let msg;
    if (typeof a === 'object' && a !== null) {
      if (argc > 1) msg = typeof b === 'string' && argc > 2 ? format(b, arguments, 2) : b;
      if (a instanceof Error) {
        obj = { [config.errorKey]: a };
        if (msg === undefined) msg = a.message;
      } else {
        obj = a;
        // An error logged in an object gives the message, when there is none.
        if (msg === undefined && a[config.messageKey] === undefined && a[config.errorKey]) {
          msg = a[config.errorKey].message;
        }
      }
    } else {
      msg = typeof a === 'string' && argc > 1 ? format(a, arguments, 1) : a;
    }
    this[writeSym](obj, msg, levelVal);
  };
}

function write(logger, levelVal, args) {
  const config = logger[configSym];
  const saved = config.logMethod;
  config.logMethod = null;
  try {
    config.logFunctions[levelVal].apply(logger, args);
  } finally {
    config.logMethod = saved;
  }
}

function Logger() {
  this[configSym] = null;
  this[chindingsSym] = '';
  this[serializersSym] = null;
  this[redactSym] = null;
  this[msgPrefixSym] = '';
  this[levelSym] = '';
  this[levelValSym] = 0;
}

Logger.prototype[writeSym] = function writeLine(obj, msg, levelVal) {
  const config = this[configSym];
  let line = config.levelPart(levelVal) + config.time() + this[chindingsSym];
  if (config.slow || this[redactSym] !== null) {
    line += members(transform(this, config, obj, levelVal));
  } else if (obj !== undefined) {
    const serializers = this[serializersSym];
    for (const key in obj) {
      let value = obj[key];
      if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const serializer = serializers[key];
      if (serializer !== undefined) value = serializer(value);
      const json = stringify(value, obj);
      if (json !== undefined) line += `,${asKey(key)}:${json}`;
    }
  }
  if (msg !== undefined) {
    const prefix = this[msgPrefixSym];
    if (typeof msg === 'string') line += `,${config.messageKeyJson}:${asString(prefix + msg)}`;
    else if (prefix !== '') line += `,${config.messageKeyJson}:${asString(prefix + String(msg))}`;
    else {
      const json = stringify(msg);
      if (json !== undefined) line += `,${config.messageKeyJson}:${json}`;
    }
  }
  line += config.end;
  if (config.streamWrite !== null) line = config.streamWrite(line);
  const { stream } = config;
  if (config.metadata) {
    stream.lastLevel = levelVal;
    stream.lastMsg = msg;
    stream.lastObj = obj;
    stream.lastLogger = this;
  }
  stream.write(line);
};

// The object logged after serializers, mixin, formatters.log, redaction and nestedKey.
function transform(logger, config, obj, levelVal) {
  const serializers = logger[serializersSym];
  let out = {};
  if (obj !== undefined) {
    for (const key in obj) {
      let value = obj[key];
      if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const serializer = serializers[key];
      if (serializer !== undefined) value = serializer(value);
      out[key] = value;
    }
  }
  if (config.mixin !== null) {
    const mixed = config.mixin(obj === undefined ? {} : obj, levelVal, logger);
    if (mixed && typeof mixed === 'object') {
      out = config.mixinMergeStrategy ? config.mixinMergeStrategy(out, mixed) : Object.assign(mixed, out);
    }
  }
  if (config.formatLog !== null) out = config.formatLog(out);
  if (logger[redactSym] !== null) out = logger[redactSym](out);
  if (config.nestedKey !== null && Object.keys(out).length > 0) out = { [config.nestedKey]: out };
  return out;
}

Object.defineProperties(Logger.prototype, {
  level: {
    get() {
      return this[levelSym];
    },
    set(label) {
      const config = this[configSym];
      const { values } = config.levels;
      let value;
      if (label === 'silent') value = Infinity;
      else if (typeof label === 'number' && config.levels.labels[label] !== undefined) {
        value = label;
        // eslint-disable-next-line no-param-reassign
        label = config.levels.labels[label];
      } else {
        value = values[label];
      }
      if (value === undefined) throw new Error(`unknown level ${label}`);
      this[levelSym] = label;
      this[levelValSym] = value;
      const names = config.levelNames;
      for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        this[name] = config.enabled && values[name] >= value ? config.logFunctions[values[name]] : noop;
      }
    },
  },
  levelVal: {
    get() {
      return this[levelValSym];
    },
  },
  levels: {
    get() {
      return this[configSym].levels;
    },
  },
  [streamSym]: {
    get() {
      return this[configSym].stream;
    },
  },
});

Logger.prototype.version = version;
Logger.prototype.silent = noop;

Logger.prototype.isLevelEnabled = function isLevelEnabled(label) {
  const value = this[configSym].levels.values[label];
  return value !== undefined && value >= this[levelValSym];
};

Logger.prototype.child = function child(bindings, options) {
  if (!bindings || typeof bindings !== 'object') throw new Error('missing bindings for child Pino');
  const config = this[configSym];
  const instance = new Logger();
  instance[configSym] = config;
  let serializers = this[serializersSym];
  if (options && options.serializers) {
    serializers = Object.assign(Object.create(null), serializers);
    // Inherited serializers too: fastify chains the ones of plugins and routes with prototypes.
    // eslint-disable-next-line guard-for-in
    for (const key in options.serializers) serializers[key] = options.serializers[key];
  }
  instance[serializersSym] = serializers;
  instance[redactSym] = options && options.redact ? createRedactor(options.redact) : this[redactSym];
  instance[chindingsSym] = this[chindingsSym] + serializeBindings(instance, config, bindings);
  instance[msgPrefixSym] = options && options.msgPrefix ? this[msgPrefixSym] + options.msgPrefix : this[msgPrefixSym];
  instance.level = options && options.level ? options.level : this[levelSym];
  if (config.onChild !== null) config.onChild(instance);
  return instance;
};

function serializeBindings(logger, config, bindings) {
  let values = config.formatBindings !== null ? config.formatBindings(bindings) : bindings;
  const serializers = logger[serializersSym];
  let copied = false;
  for (const key in values) {
    if (serializers[key] !== undefined && Object.prototype.hasOwnProperty.call(values, key)) {
      if (!copied) {
        values = { ...values };
        copied = true;
      }
      values[key] = serializers[key](values[key]);
    }
  }
  if (logger[redactSym] !== null) values = logger[redactSym](values);
  return members(values);
}

Logger.prototype.bindings = function bindings() {
  const result = JSON.parse(`{${this[chindingsSym].slice(1)}}`);
  delete result.pid;
  delete result.hostname;
  return result;
};

Logger.prototype.setBindings = function setBindings(newBindings) {
  this[chindingsSym] += serializeBindings(this, this[configSym], newBindings);
};

Logger.prototype.flush = function flush(cb) {
  const { stream } = this[configSym];
  if (typeof stream.flush === 'function') stream.flush(cb || noop);
  else if (cb) process.nextTick(cb);
};

function buildLevels(opts) {
  const custom = opts.customLevels || {};
  for (const name of Object.keys(custom)) {
    if (typeof custom[name] !== 'number') throw new Error(`level ${name} must be a number`);
    if (!opts.useOnlyCustomLevels && DEFAULT_LEVELS[name] !== undefined) {
      throw new Error(`levels cannot be overridden: ${name}`);
    }
  }
  const values = opts.useOnlyCustomLevels ? { ...custom } : { ...DEFAULT_LEVELS, ...custom };
  const labels = {};
  for (const name of Object.keys(values)) labels[values[name]] = name;
  return { values, labels };
}

function isStream(value) {
  return value !== null && typeof value === 'object' && typeof value.write === 'function';
}

function createLogger(options, destination) {
  let opts = options;
  let stream = destination;
  if (isStream(opts)) {
    stream = opts;
    opts = {};
  }
  opts = opts || {};
  if (stream === undefined) {
    if (opts.stream && opts.file) throw new Error('Cannot specify both stream and file');
    if (isStream(opts.stream)) stream = opts.stream;
    else if (opts.file) stream = new Destination({ dest: opts.file, sync: true, mkdir: true });
    else stream = new Destination({ dest: 1, sync: true });
  } else if (typeof stream === 'string' || typeof stream === 'number') {
    stream = new Destination({ dest: stream, sync: true });
  }
  if (opts.transport) throw new Error('@xufa/logger does not support transports; pass a stream instead');

  const levels = buildLevels(opts);
  const formatters = opts.formatters || {};
  const levelCache = new Map();
  const formatLevel = typeof formatters.level === 'function' ? formatters.level : null;
  let time = stdTimeFunctions.epochTime;
  if (opts.timestamp === false) time = stdTimeFunctions.nullTime;
  else if (typeof opts.timestamp === 'function') time = opts.timestamp;

  const config = {
    stream,
    levels,
    levelNames: Object.keys(levels.values),
    logFunctions: {},
    enabled: opts.enabled !== false,
    messageKey: opts.messageKey || 'msg',
    messageKeyJson: asKey(opts.messageKey || 'msg'),
    errorKey: opts.errorKey || 'err',
    nestedKey: opts.nestedKey || null,
    time,
    end: opts.crlf ? '}\r\n' : '}\n',
    formatBindings: typeof formatters.bindings === 'function' ? formatters.bindings : null,
    formatLog: typeof formatters.log === 'function' ? formatters.log : null,
    mixin: typeof opts.mixin === 'function' ? opts.mixin : null,
    mixinMergeStrategy: typeof opts.mixinMergeStrategy === 'function' ? opts.mixinMergeStrategy : null,
    logMethod: opts.hooks && typeof opts.hooks.logMethod === 'function' ? opts.hooks.logMethod : null,
    streamWrite: opts.hooks && typeof opts.hooks.streamWrite === 'function' ? opts.hooks.streamWrite : null,
    onChild: typeof opts.onChild === 'function' ? opts.onChild : null,
    metadata: stream[needsMetadataGsym] === true,
    slow: false,
    levelPart(levelVal) {
      let part = levelCache.get(levelVal);
      if (part === undefined) {
        part = formatLevel
          ? `{${members(formatLevel(levels.labels[levelVal], levelVal)).slice(1)}`
          : `{"level":${levelVal}`;
        levelCache.set(levelVal, part);
      }
      return part;
    },
  };
  config.slow = config.mixin !== null || config.formatLog !== null || config.nestedKey !== null;
  for (const name of config.levelNames) {
    const value = levels.values[name];
    config.logFunctions[value] = createLogFunction(value);
  }

  const logger = new Logger();
  logger[configSym] = config;
  logger[serializersSym] = Object.assign(
    Object.create(null),
    { err: stdSerializers.err, [config.errorKey]: stdSerializers.err },
    opts.serializers
  );
  logger[redactSym] = createRedactor(opts.redact);
  logger[msgPrefixSym] = opts.msgPrefix || '';
  let base;
  if (opts.base === null) base = {};
  else if (opts.base) base = { ...opts.base };
  else base = { pid: process.pid, hostname: os.hostname() };
  if (opts.name !== undefined) base.name = opts.name;
  logger[chindingsSym] = serializeBindings(logger, config, base);
  const level = opts.level === undefined ? (opts.useOnlyCustomLevels ? config.levelNames[0] : 'info') : opts.level;
  logger.level = config.enabled ? level : 'silent';
  return logger;
}

// Writes each line to the streams whose level is at most the level of the line.
function multistream(streamsArray, options = {}) {
  const levels = { ...DEFAULT_LEVELS, ...(options.levels || {}) };
  const streams = (Array.isArray(streamsArray) ? streamsArray : [streamsArray]).map((entry) => {
    const item = isStream(entry) ? { stream: entry } : entry;
    const level = typeof item.level === 'number' ? item.level : levels[item.level || 'info'];
    return { stream: item.stream, level };
  });
  const result = {
    [needsMetadataGsym]: true,
    lastLevel: 0,
    streams,
    write(line) {
      for (const { stream, level } of streams) {
        if (this.lastLevel >= level) {
          stream.write(line);
          if (options.dedupe) break;
        }
      }
    },
    add(entry) {
      const item = isStream(entry) ? { stream: entry } : entry;
      streams.push({ stream: item.stream, level: levels[item.level || 'info'] });
      return result;
    },
    flushSync() {
      for (const { stream } of streams) if (typeof stream.flushSync === 'function') stream.flushSync();
    },
  };
  if (options.dedupe) streams.sort((a, b) => b.level - a.level);
  return result;
}

createLogger.destination = (dest) => new Destination(typeof dest === 'object' && dest !== null ? dest : { dest });
createLogger.multistream = multistream;
createLogger.stdSerializers = stdSerializers;
createLogger.stdTimeFunctions = stdTimeFunctions;
createLogger.symbols = symbols;
createLogger.levels = buildLevels({});
createLogger.version = version;
createLogger.Destination = Destination;
createLogger.Logger = Logger;
createLogger.createLogger = createLogger;
createLogger.pino = createLogger;
createLogger.default = createLogger;

module.exports = createLogger;
