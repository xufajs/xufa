// Built-in constraint strategies: version (semver, from the Accept-Version header) and host.

function equalValue(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  return a === b;
}

function SemVerStore() {
  if (!(this instanceof SemVerStore)) return new SemVerStore();
  this.store = new Map();
  this.maxMajor = 0;
  this.maxMinors = {};
  this.maxPatches = {};
}

SemVerStore.prototype.set = function set(version, value) {
  if (typeof version !== 'string') throw new TypeError('Version should be a string');
  const parts = version.split('.', 3);
  if (Number.isNaN(Number(parts[0]))) throw new TypeError('Major version must be a numeric value');
  const major = Number(parts[0]);
  const minor = Number(parts[1]) || 0;
  const patch = Number(parts[2]) || 0;
  if (major >= this.maxMajor) {
    this.maxMajor = major;
    this.store.set('x', value);
    this.store.set('*', value);
    this.store.set('x.x', value);
    this.store.set('x.x.x', value);
  }
  if (minor >= (this.maxMinors[major] || 0)) {
    this.maxMinors[major] = minor;
    this.store.set(`${major}.x`, value);
    this.store.set(`${major}.x.x`, value);
  }
  if (patch >= (this.maxPatches[`${major}.${minor}`] || 0)) {
    this.maxPatches[`${major}.${minor}`] = patch;
    this.store.set(`${major}.${minor}.x`, value);
  }
  this.store.set(`${major}.${minor}.${patch}`, value);
  return this;
};

SemVerStore.prototype.get = function get(version) {
  return this.store.get(version);
};

const version = {
  name: 'version',
  mustMatchWhenDerived: true,
  storage: SemVerStore,
  deriveConstraint: (req) => req.headers['accept-version'],
  validate(value) {
    if (typeof value !== 'string') throw new TypeError('Version should be a string');
  },
};

function HostStorage() {
  const hosts = new Map();
  const regexHosts = [];
  const regexCache = new Map();
  return {
    get(host) {
      const exact = hosts.get(host);
      if (exact) return exact;
      if (regexHosts.length === 0) return undefined;
      if (regexCache.has(host)) return regexCache.get(host);
      for (const entry of regexHosts) {
        if (entry.host.test(host)) {
          regexCache.set(host, entry.value);
          return entry.value;
        }
      }
      regexCache.set(host, undefined);
      return undefined;
    },
    set(host, value) {
      if (host instanceof RegExp) {
        regexHosts.push({ host: new RegExp(host.source, host.flags.replace(/[gy]/g, '')), value });
        regexCache.clear();
      } else {
        hosts.set(host, value);
      }
    },
  };
}

const host = {
  name: 'host',
  mustMatchWhenDerived: false,
  storage: HostStorage,
  deriveConstraint: (req) => req.headers.host || req.headers[':authority'],
  validate(value) {
    if (typeof value !== 'string' && Object.prototype.toString.call(value) !== '[object RegExp]') {
      throw new TypeError('Host should be a string or a RegExp');
    }
  },
};

// Used to print every method of a route in one tree.
const httpMethod = {
  name: '__xufa_router_http_method__',
  storage() {
    const handlers = new Map();
    return {
      get: (type) => handlers.get(type) || null,
      set: (type, value) => handlers.set(type, value),
    };
  },
  deriveConstraint: (req) => req.method,
  mustMatchWhenDerived: true,
};

function deepEqualConstraints(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !equalValue(a[key], b[key])) return false;
  }
  return true;
}

export { version, host, httpMethod, SemVerStore, HostStorage, deepEqualConstraints };
