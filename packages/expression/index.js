// @xufa/expression: expressions of JavaScript (a safe part of it) compiled once and run many times, on data of their
// own. They read the context they are given, the parameters of their arrow functions and a few globals that compute
// (Math, JSON, Number...); they cannot assign, reach prototypes or constructors, nor anything else of the process.
//
//   import { compile, evaluate } from '@xufa/expression';
//   const total = compile('items.filter(i => i.price > min).map(i => i.price * i.quantity)');
//   total({ items, min: 10 });
//   evaluate('user.name?.toUpperCase() ?? "anonymous"', { user });
import { parse } from './lib/parser.js';
import { compileTree, FORBIDDEN } from './lib/compiler.js';
import { GLOBALS } from './lib/globals.js';
import { ExpressionError, locate } from './lib/errors.js';

class Engine {
  // `globals`: names over the default ones (`builtins: false` leaves those out); `filters`: functions by name, which
  // makes `|` separate them (`price | round(2)`, the value first); `lenient`: members of null or undefined and calls of
  // what is not a function give undefined; `strict`: names not in the context nor the globals are errors;
  // `maxLength`: of a source (10000); `cacheSize`: of the expressions compiled kept (1000); `inline`: false keeps
  // expressions as closures (by default, those run `inlineAfter` times, 64, become one function of JavaScript).
  constructor(options = {}) {
    const { globals = {}, builtins = true, filters = null, lenient = false, strict = false } = options;
    this.globals = Object.freeze({ ...(builtins ? GLOBALS : {}), ...globals });
    this.filters = filters ? Object.freeze({ ...filters }) : null;
    this.lenient = Boolean(lenient);
    this.strict = Boolean(strict);
    this.maxLength = options.maxLength === undefined ? 10000 : options.maxLength;
    this.cacheSize = options.cacheSize === undefined ? 1000 : options.cacheSize;
    this.inline = options.inline !== false;
    this.inlineAfter = options.inlineAfter === undefined ? 64 : options.inlineAfter;
    this.cache = new Map();
  }

  parse(source) {
    this.check(source);
    return parse(source, { filters: Boolean(this.filters) });
  }

  check(source) {
    if (typeof source !== 'string') throw new TypeError('An expression is a string');
    if (source.length > this.maxLength) {
      throw new ExpressionError(`The expression is longer than ${this.maxLength} characters`, {
        code: 'XUFA_EXPR_ERR_LENGTH',
      });
    }
  }

  // The function of an expression: fn(context) gives its value. Kept for the next time.
  compile(source) {
    const cached = this.cache.get(source);
    if (cached) return cached;
    const tree = this.parse(source);
    const fn = compileTree(tree, source, this);
    Object.defineProperty(fn, 'source', { value: source });
    if (this.cacheSize > 0) {
      if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(source, fn);
    }
    return fn;
  }

  evaluate(source, context) {
    return this.compile(source)(context);
  }
}

const engine = new Engine();

const __parse = (source, options) => parse(source, options);
export const compile = (source) => engine.compile(source);
export const evaluate = (source, context) => engine.evaluate(source, context);

export { Engine, ExpressionError, locate, GLOBALS, FORBIDDEN, __parse as parse };
