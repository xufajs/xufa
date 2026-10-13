// @xufa/expression: expressions of JavaScript (a safe part of it) compiled once and run many times, on data of their
// own. They read the context they are given, the parameters of their arrow functions and a few globals that compute
// (Math, JSON, Number...); they cannot assign, reach prototypes or constructors, nor anything else of the process.
//
//   import { compile, evaluate } from '@xufa/expression';
//   const total = compile('items.filter(i => i.price > min).map(i => i.price * i.quantity)');
//   total({ items, min: 10 });
//   evaluate('user.name?.toUpperCase() ?? "anonymous"', { user });
import { parse } from './lib/parser.js';
import { compileTree, checkForeignTree, FORBIDDEN } from './lib/compiler.js';
import { GLOBALS, PROGRAM_GLOBALS, SafeArray } from './lib/globals.js';
import { guardedOf } from './lib/statements.js';
import { ExpressionError, locate } from './lib/errors.js';

// The constructors of new in programs, by default (Array: of at most 10 million items; Promise for async programs).
const CONSTRUCTORS = Object.freeze({ Date, Map, Set, Error, TypeError, RangeError, Array: SafeArray, Promise });

// The namespace of what a host exports: a frozen copy (without prototype) of its own properties, one for each object.
const namespaces = new WeakMap();
function namespaceOf(exported) {
  if (exported === null || typeof exported !== 'object') {
    throw new ExpressionError('A module given by the host is an object of what it exports', {
      code: 'XUFA_EXPR_ERR_RUNTIME',
    });
  }
  let namespace = namespaces.get(exported);
  if (!namespace) {
    namespace = Object.freeze(Object.defineProperties(Object.create(null), Object.getOwnPropertyDescriptors(exported)));
    namespaces.set(exported, namespace);
  }
  return namespace;
}

// Object.assign and Object.freeze of programs: of what a program can change (plain objects and arrays its engine does
// not guard), copying no key that cannot be reached.
function changersOf(engine) {
  const changeable = (target, name) => {
    const proto = target !== null && typeof target === 'object' ? Object.getPrototypeOf(target) : undefined;
    if (
      proto === undefined ||
      engine.guarded.has(target) ||
      !(Array.isArray(target) || proto === Object.prototype || proto === null)
    ) {
      throw new ExpressionError(`Object.${name} changes only plain objects and arrays`, {
        code: 'XUFA_EXPR_ERR_FORBIDDEN',
      });
    }
    return target;
  };
  return {
    assign(target, ...sources) {
      changeable(target, 'assign');
      for (const source of sources) {
        if (source === null || source === undefined) continue;
        for (const key of Object.keys(source)) {
          if (FORBIDDEN.has(key)) {
            throw new ExpressionError(`${key} cannot be reached in expressions`, { code: 'XUFA_EXPR_ERR_FORBIDDEN' });
          }
          target[key] = source[key];
        }
      }
      return target;
    },
    freeze: (target) => Object.freeze(changeable(target, 'freeze')),
    isFrozen: (target) => Object.isFrozen(target),
  };
}

class Engine {
  // `globals`: names over the default ones (`builtins: false` leaves those out); `filters`: functions by name, which
  // makes `|` separate them (`price | round(2)`, the value first); `lenient`: members of null or undefined and calls of
  // what is not a function give undefined; `strict`: names not in the context nor the globals are errors;
  // `maxLength`: of a source (10000); `cacheSize`: of the expressions compiled kept (1000); `inline`: false keeps
  // expressions as closures (by default, those run `inlineAfter` times, 64, become one function of JavaScript).
  // `statements`: sources are programs (statements, variables, loops, functions); `maxSteps`: of a run of a program
  // (loop turns and calls, 10 million); `maxDepth`: of calls of its functions nested (1000); `constructors`: what
  // `new` makes, by name (Date, Map, Set and errors); `bound`: names whose values are fixed, over the context (code
  // cannot hide them); `modules`: what `import` of programs takes, (name) => the source of a module (a string, a
  // program compiled by this engine and run for each import with a context of its own) or what it exports (an object,
  // given by the host), or undefined (none); `tdz`: a let or const of a program used before its declaration runs is
  // an error (as in JavaScript), not undefined.
  constructor(options = {}) {
    const { globals = {}, builtins = true, filters = null, lenient = false, strict = false, bound = {} } = options;
    // (Programs change objects: Object.assign and Object.freeze too.)
    const changers =
      builtins && options.statements && !Object.hasOwn(globals, 'Object')
        ? { Object: Object.freeze({ ...GLOBALS.Object, ...changersOf(this) }) }
        : {};
    const defaults = options.statements ? PROGRAM_GLOBALS : GLOBALS;
    this.globals = Object.freeze({ ...(builtins ? defaults : {}), ...changers, ...globals });
    this.filters = filters ? Object.freeze({ ...filters }) : null;
    this.lenient = Boolean(lenient);
    this.strict = Boolean(strict);
    this.tdz = Boolean(options.tdz);
    this.maxLength = options.maxLength === undefined ? 10000 : options.maxLength;
    this.cacheSize = options.cacheSize === undefined ? 1000 : options.cacheSize;
    this.inline = options.inline !== false;
    this.inlineAfter = options.inlineAfter === undefined ? 64 : options.inlineAfter;
    this.cache = new Map();
    this.bound = Object.freeze(Object.assign(Object.create(null), bound));
    this.statements = Boolean(options.statements);
    this.maxSteps = options.maxSteps === undefined ? 10_000_000 : options.maxSteps;
    this.maxDepth = options.maxDepth === undefined ? 1000 : options.maxDepth;
    this.constructors = Object.freeze({ ...CONSTRUCTORS, ...(options.constructors ?? {}) });
    this.guarded = guardedOf({ ...this.globals, ...(this.filters ?? {}), ...this.constructors, ...this.bound });
    this.modules = options.modules ?? null;
    // (The loaders of modules of each resolver, and the programs compiled with each.)
    this.loaders = new WeakMap();
    this.caches = new WeakMap();
    this.load = this.modules ? this.loaderOf(this.modules) : null;
  }

  // What import of a resolver does: (name) => what the module exports. Modules of sources are compiled once (for
  // this resolver) and run for each import, a module importing one being run refused (a cycle).
  loaderOf(resolver) {
    const known = this.loaders.get(resolver);
    if (known) return known;
    const compiled = new Map();
    const loading = [];
    const loader = (specifier) => {
      const found = resolver(specifier);
      if (found === undefined || found === null) {
        throw new ExpressionError(`No module ${specifier}`, { code: 'XUFA_EXPR_ERR_RUNTIME' });
      }
      // (What the host exports: a frozen copy of it, kept for each object (getters as they are), not the object.)
      if (typeof found !== 'string') return namespaceOf(found);
      if (loading.includes(specifier)) {
        throw new ExpressionError(`Modules import each other: ${[...loading, specifier].join(' → ')}`, {
          code: 'XUFA_EXPR_ERR_RUNTIME',
        });
      }
      let run = compiled.get(found);
      if (!run) {
        run = this.compileModule(found, resolver);
        compiled.set(found, run);
      }
      loading.push(specifier);
      try {
        return run({});
      } finally {
        loading.pop();
      }
    };
    this.loaders.set(resolver, loader);
    return loader;
  }

  // A module of a source: what it exports (a program that exports none: an empty module, run for what it does).
  compileModule(source, resolver) {
    const tree = this.parse(source);
    if (tree.async) {
      throw new ExpressionError('A module cannot await at its top', { code: 'XUFA_EXPR_ERR_SYNTAX', source });
    }
    const run = compileTree(tree, source, this.optionsOf(resolver));
    if (tree.module) return run;
    return (context) => {
      run(context);
      return Object.freeze(Object.create(null));
    };
  }

  // The options of compiling with a resolver of modules (this engine's, with its loader).
  optionsOf(resolver) {
    if (!resolver || resolver === this.modules) return this;
    return Object.assign(Object.create(this), { modules: resolver, load: this.loaderOf(resolver) });
  }

  // The names of the modules a program imports.
  imports(source) {
    const names = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node.type === 'ImportModule' && !names.includes(node.source)) names.push(node.source);
      for (const key of Object.keys(node)) if (node[key] && typeof node[key] === 'object') walk(node[key]);
    };
    walk(this.parse(source));
    return names;
  }

  parse(source) {
    this.check(source);
    return parse(source, { filters: Boolean(this.filters), statements: this.statements });
  }

  check(source) {
    if (typeof source !== 'string') throw new TypeError('An expression is a string');
    if (source.length > this.maxLength) {
      throw new ExpressionError(`The expression is longer than ${this.maxLength} characters`, {
        code: 'XUFA_EXPR_ERR_LENGTH',
      });
    }
  }

  // The function of an expression: fn(context) gives its value. Kept for the next time. `modules`: a resolver of
  // its imports of its own (over the engine's; kept apart for each resolver).
  compile(source, { modules } = {}) {
    const resolver = modules && modules !== this.modules ? modules : null;
    let cache = this.cache;
    if (resolver) {
      cache = this.caches.get(resolver);
      if (!cache) {
        cache = new Map();
        this.caches.set(resolver, cache);
      }
    }
    const cached = cache.get(source);
    if (cached) return cached;
    const tree = this.parse(source);
    const fn = compileTree(tree, source, this.optionsOf(resolver));
    Object.defineProperty(fn, 'source', { value: source });
    if (this.cacheSize > 0) {
      if (cache.size >= this.cacheSize) cache.delete(cache.keys().next().value);
      cache.set(source, fn);
    }
    return fn;
  }

  evaluate(source, context) {
    return this.compile(source)(context);
  }

  // The function of a tree made by another parser (of another language): nodes as those of parse() gives (of
  // programs too), compiled with the same checks as those of sources. `source`: the text their positions are in;
  // `bound`: names of this tree only whose values are fixed (over those of the engine and the context).
  compileTree(tree, source = '', { bound } = {}) {
    // (What the parser never makes is refused first: names that are not strings, literals that are objects...)
    checkForeignTree(tree, source, this);
    if (!bound) return compileTree(tree, source, this);
    const all = Object.assign(Object.create(null), this.bound, bound);
    return compileTree(tree, source, { ...this, bound: all, guardedToo: new Set(Object.values(bound)) });
  }
}

const engine = new Engine();

const __parse = (source, options) => parse(source, options);
export const compile = (source) => engine.compile(source);
export const evaluate = (source, context) => engine.evaluate(source, context);

export { Engine, ExpressionError, locate, GLOBALS, FORBIDDEN, CONSTRUCTORS, __parse as parse };
