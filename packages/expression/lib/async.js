// async and await of programs, in the closures: the body of an async function (or a program with await at its top)
// compiled to generator functions, which yield each value awaited to a driver that resumes them with what it gives
// (or throws in them its error), as JavaScript runs async functions. Only what has an await in it is compiled so (its
// statements and expressions); the rest is the closures as they are. The same checks as the closures: members,
// changes, steps of loops, the limit through every catch. The function of JavaScript has async and await of its own.
import { SHORT } from './short.js';
import { define, defineAccessor } from './objects.js';
import { superCall, constructOf, privateGet, privateSet, privateIn, privateUpdate } from './classes.js';
import { Return, BREAK, Jump, jumpOf, NO_LABELS, isLimit, declaredNames, makesFunctions } from './statements.js';

/* eslint-disable eqeqeq, no-bitwise */
const BINARY = Object.assign(Object.create(null), {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  '|': (a, b) => a | b,
  '&': (a, b) => a & b,
  '^': (a, b) => a ^ b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  in: (a, b) => a in b,
});
const UNARY = Object.assign(Object.create(null), {
  '!': (a) => !a,
  '-': (a) => -a,
  '+': (a) => +a,
  '~': (a) => ~a,
  typeof: (a) => typeof a,
  void: () => undefined,
});
/* eslint-enable eqeqeq, no-bitwise */

// Whether a tree has an await of its own (not of the functions and classes in it).
// (And a yield, a for await: what suspends the body it is in.)
function containsAwait(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(containsAwait);
  if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') return true;
  if (node.type === 'ForOfStatement' && node.await) return true;
  if (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassExpression'
  ) {
    return false;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object' && containsAwait(value)) return true;
  }
  return false;
}

// A promise of what a generator of an async body gives: each value it yields awaited (its error thrown in it).
function drive(generator) {
  return new Promise((resolve, reject) => {
    const step = (method, input) => {
      let result;
      try {
        result = generator[method](input);
      } catch (err) {
        reject(err);
        return;
      }
      if (result.done) resolve(result.value);
      else {
        Promise.resolve(result.value).then(
          (value) => step('next', value),
          (err) => step('throw', err)
        );
      }
    };
    step('next', undefined);
  });
}

// A value yielded by an async generator (what it yields otherwise is awaited).
class YieldRequest {
  constructor(value) {
    this.value = value;
  }
}

// An async iterator of a value, as for await takes it: its Symbol.asyncIterator, else its iterator (each value
// awaited).
function asyncIteratorOf(compiler, value, node) {
  if (value !== null && value !== undefined) {
    const asyncMethod = value[Symbol.asyncIterator];
    if (typeof asyncMethod === 'function') return Reflect.apply(asyncMethod, value, []);
    const method = value[Symbol.iterator];
    if (typeof method === 'function') {
      const iterator = Reflect.apply(method, value, []);
      return {
        next: (input) => {
          const result = iterator.next(input);
          return Promise.resolve(result.value).then((item) => ({ value: item, done: result.done }));
        },
        return: typeof iterator.return === 'function' ? (input) => Promise.resolve(iterator.return(input)) : undefined,
      };
    }
  }
  throw compiler.error(`${compiler.text(node)} is not iterable`, node, 'XUFA_EXPR_ERR_RUNTIME');
}

// The async iterator of an async generator body: its yields (YieldRequest) given to next() one at a time, what it
// awaits otherwise awaited; next, throw and return queued as JavaScript queues them.
function asyncGenerator(generator) {
  const queue = [];
  let running = false;
  let done = false;
  const value = (completion) => (completion instanceof Return ? completion.value : undefined);
  const answer = (result) => {
    const request = queue.shift();
    running = false;
    request.resolve(result);
    resume();
  };
  const fail = (err) => {
    const request = queue.shift();
    running = false;
    done = true;
    request.reject(err);
    resume();
  };
  const step = (method, input) => {
    let result;
    try {
      result = generator[method](input);
    } catch (err) {
      fail(err);
      return;
    }
    if (result.done) {
      done = true;
      Promise.resolve(value(result.value)).then((item) => answer({ value: item, done: true }), fail);
    } else if (result.value instanceof YieldRequest) {
      Promise.resolve(result.value.value).then(
        (item) => answer({ value: item, done: false }),
        (err) => step('throw', err)
      );
    } else {
      Promise.resolve(result.value).then(
        (item) => step('next', item),
        (err) => step('throw', err)
      );
    }
  };
  function resume() {
    if (running || queue.length === 0) return;
    const request = queue[0];
    if (done) {
      queue.shift();
      if (request.method === 'throw') request.reject(request.input);
      else request.resolve({ value: request.method === 'return' ? request.input : undefined, done: true });
      resume();
      return;
    }
    running = true;
    step(request.method, request.input);
  }
  const call = (method) => (input) =>
    new Promise((resolve, reject) => {
      queue.push({ method, input, resolve, reject });
      resume();
    });
  return {
    next: call('next'),
    throw: call('throw'),
    return: call('return'),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

// A closure as a generator (of what has no await).
const lift = (fn) =>
  // eslint-disable-next-line require-yield
  function* lifted(s) {
    return fn(s);
  };

// The methods of the compiler for async bodies (a* of the closures' names).
const asyncStatements = {
  // The items of a list (arguments, arrays): their values, spread or not.
  aItems(nodes, env) {
    const items = nodes.map((item) =>
      item.type === 'SpreadElement'
        ? { spread: true, value: this.aExpr(item.argument, env) }
        : { spread: false, value: this.aExpr(item, env) }
    );
    return function* items_(s) {
      const result = [];
      for (const item of items) {
        const value = yield* item.value(s);
        if (item.spread) result.push(...value);
        else result.push(value);
      }
      return result;
    };
  },

  // The object and the key of a member (a key checked as the closures check it).
  aMember(node, env) {
    const object = this.aExpr(node.object, env);
    if (!node.computed) {
      this.checkKey(node.property, node);
      const { property } = node;
      return { object, key: lift(() => property) };
    }
    const value = this.aExpr(node.property, env);
    const keyOf = this.keyOf(node.property);
    return {
      object,
      *key(s) {
        return keyOf(yield* value(s));
      },
    };
  },

  aExpr(node, env) {
    if (!containsAwait(node)) return lift(this.compile(node, env));
    const compiler = this;
    const { lenient } = this;
    switch (node.type) {
      case 'AwaitExpression': {
        const argument = this.aExpr(node.argument, env);
        return function* awaited(s) {
          return yield yield* argument(s);
        };
      }
      // yield of a generator: as it is (a generator), or as a YieldRequest (an async generator, which awaits the rest).
      case 'YieldExpression': {
        const argument = node.argument ? this.aExpr(node.argument, env) : lift(() => undefined);
        const wrapped = this.yieldMode === 'wrapped';
        if (node.delegate && !wrapped) {
          return function* delegated(s) {
            return yield* yield* argument(s);
          };
        }
        if (node.delegate) {
          return function* delegatedAsync(s) {
            const iterator = asyncIteratorOf(compiler, yield* argument(s), node.argument);
            let input;
            for (;;) {
              const result = yield iterator.next(input);
              if (result.done) return result.value;
              input = yield new YieldRequest(result.value);
            }
          };
        }
        if (wrapped) {
          return function* yielded(s) {
            return yield new YieldRequest(yield* argument(s));
          };
        }
        return function* yielded(s) {
          return yield yield* argument(s);
        };
      }
      case 'BinaryExpression': {
        const left = this.aExpr(node.left, env);
        if (node.operator === 'instanceof') {
          const named = this.namedType(node.right, env);
          const right = named ? lift(() => named) : this.aExpr(node.right, env);
          return function* instance(s) {
            const object = yield* left(s);
            const type = yield* right(s);
            if (named || compiler.isClass(type)) return object instanceof type;
            throw compiler.error(
              `${compiler.text(node.right)} is not a type instanceof takes`,
              node.right,
              'XUFA_EXPR_ERR_RUNTIME'
            );
          };
        }
        const operation = BINARY[node.operator];
        if (!operation) throw this.error(`Unsupported operator ${node.operator}`, node);
        const right = this.aExpr(node.right, env);
        return function* binary(s) {
          const a = yield* left(s);
          return operation(a, yield* right(s));
        };
      }
      case 'LogicalExpression': {
        const left = this.aExpr(node.left, env);
        const right = this.aExpr(node.right, env);
        const { operator } = node;
        return function* logical(s) {
          const value = yield* left(s);
          if (operator === '&&' ? !value : operator === '||' ? value : value !== null && value !== undefined) {
            return value;
          }
          return yield* right(s);
        };
      }
      case 'ConditionalExpression': {
        const test = this.aExpr(node.test, env);
        const consequent = this.aExpr(node.consequent, env);
        const alternate = this.aExpr(node.alternate, env);
        return function* conditional(s) {
          return (yield* test(s)) ? yield* consequent(s) : yield* alternate(s);
        };
      }
      case 'UnaryExpression': {
        if (node.operator === 'delete') {
          const { object, key } = this.aMember(node.argument, env);
          return function* remove(s) {
            const target = compiler.writable(yield* object(s), node.argument);
            return delete target[yield* key(s)];
          };
        }
        const operation = UNARY[node.operator];
        if (!operation) throw this.error(`Unsupported operator ${node.operator}`, node);
        const argument = this.aExpr(node.argument, env);
        return function* unary(s) {
          return operation(yield* argument(s));
        };
      }
      case 'MemberExpression': {
        const { object, key } = this.aMember(node, env);
        return function* member(s) {
          const value = yield* object(s);
          if (value === SHORT) return SHORT;
          if (value === null || value === undefined) {
            if (node.optional) return SHORT;
            if (lenient) return undefined;
            throw compiler.nullMember(node);
          }
          return value[yield* key(s)];
        };
      }
      case 'PrivateMember': {
        const object = this.aExpr(node.object, env);
        const privates = this.hidden(`#p${node.classId}`, node, env);
        return function* privateMember(s) {
          const value = yield* object(s);
          if (value === SHORT) return SHORT;
          return privateGet(compiler, privates(s), node.name, value, node);
        };
      }
      case 'PrivateIn': {
        const right = this.aExpr(node.right, env);
        const privates = this.hidden(`#p${node.classId}`, node, env);
        return function* privateHas(s) {
          return privateIn(compiler, privates(s), node.name, yield* right(s), node);
        };
      }
      case 'ChainExpression': {
        const inner = this.aExpr(node.expression, env);
        return function* chain(s) {
          const value = yield* inner(s);
          return value === SHORT ? undefined : value;
        };
      }
      case 'CallExpression':
        return this.aCall(node, env);
      case 'NewExpression': {
        const args = this.aItems(node.arguments, env);
        if (this.declared(node.callee, env)) {
          const Class = this.compile({ type: 'Identifier', name: node.callee, start: node.start, end: node.end }, env);
          return function* construct(s) {
            const Made = Class(s);
            return constructOf(compiler, Made, yield* args(s), node);
          };
        }
        if (!Object.prototype.hasOwnProperty.call(this.constructors, node.callee)) {
          throw this.error(`new ${node.callee} is not allowed`, node, 'XUFA_EXPR_ERR_FORBIDDEN');
        }
        const Constructor = this.constructors[node.callee];
        return function* construct(s) {
          return Reflect.construct(Constructor, yield* args(s));
        };
      }
      case 'ArrayExpression': {
        if (node.elements.includes(null)) throw this.error('Holes in arrays are not allowed', node);
        return this.aItems(node.elements, env);
      }
      case 'ObjectExpression':
        return this.aObject(node, env);
      case 'TemplateLiteral': {
        const parts = node.expressions.map((expression) => this.aExpr(expression, env));
        const { quasis } = node;
        return function* template(s) {
          let text = quasis[0];
          for (let i = 0; i < parts.length; i += 1) text += `${yield* parts[i](s)}${quasis[i + 1]}`;
          return text;
        };
      }
      case 'SequenceExpression': {
        const parts = node.expressions.map((expression) => this.aExpr(expression, env));
        return function* sequence(s) {
          let value;
          for (const part of parts) value = yield* part(s);
          return value;
        };
      }
      case 'Intrinsic': {
        const fn = this.intrinsics[node.name];
        if (!fn) throw this.error(`Unknown intrinsic ${node.name}`, node);
        const args = this.aItems(node.arguments, env);
        return function* intrinsic(s) {
          const values = yield* args(s);
          return fn(node, values[0], values[1]);
        };
      }
      case 'AssignmentExpression':
        return this.aAssignment(node, env);
      case 'UpdateExpression': {
        const { argument, prefix } = node;
        const step = node.operator === '++' ? 1 : -1;
        if (argument.type === 'PrivateMember') {
          const object = this.aExpr(argument.object, env);
          const privates = this.hidden(`#p${argument.classId}`, argument, env);
          return function* privateUpdated(s) {
            return privateUpdate(compiler, privates(s), argument.name, yield* object(s), step, prefix, argument);
          };
        }
        const { object, key } = this.aMember(argument, env);
        return function* update(s) {
          const target = compiler.writable(yield* object(s), argument);
          const name = yield* key(s);
          const old = target[name];
          const number = typeof old === 'bigint' ? old : +old;
          const value = typeof number === 'bigint' ? number + BigInt(step) : number + step;
          target[name] = value;
          return prefix ? value : number;
        };
      }
      case 'SuperCall': {
        const record = this.hidden('#ctor', node, env);
        const set = this.setter('#this', node, env, true);
        const args = this.aItems(node.arguments, env);
        return function* superCalled(s) {
          const instance = superCall(compiler, record(s), yield* args(s), node);
          set(s, instance);
          return instance;
        };
      }
      default:
        throw this.error(`await is not supported in ${node.type}`, node);
    }
  },

  aCall(node, env) {
    const compiler = this;
    const { lenient } = this;
    const args = this.aItems(node.arguments, env);
    const callOptional = node.optional;
    const { callee } = node;
    if (callee.type === 'SuperMember') {
      const { home, self, key } = this.superParts(callee, env);
      return function* superMethod(s) {
        const target = self(s);
        const fn = Reflect.get(home(s), key(s), target);
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = yield* args(s);
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    if (callee.type === 'PrivateMember') {
      const object = this.aExpr(callee.object, env);
      const privates = this.hidden(`#p${callee.classId}`, callee, env);
      return function* privateMethod(s) {
        const target = yield* object(s);
        if (target === SHORT) return SHORT;
        const fn = privateGet(compiler, privates(s), callee.name, target, callee);
        if (fn === SHORT) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = yield* args(s);
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    if (callee.type === 'MemberExpression') {
      const { object, key } = this.aMember(callee, env);
      return function* method(s) {
        const target = yield* object(s);
        if (target === SHORT) return SHORT;
        if (target === null || target === undefined) {
          if (callee.optional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(callee);
        }
        const fn = target[yield* key(s)];
        if (callOptional && (fn === null || fn === undefined)) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = yield* args(s);
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    const fnOf = this.aExpr(callee, env);
    return function* call(s) {
      const fn = yield* fnOf(s);
      if (fn === SHORT) return SHORT;
      if (callOptional && (fn === null || fn === undefined)) return SHORT;
      // (The arguments before the check, as JavaScript does: what they do happens.)
      const values = yield* args(s);
      if (typeof fn !== 'function') {
        if (lenient) return undefined;
        throw compiler.notFunction(node);
      }
      return Reflect.apply(fn, undefined, values);
    };
  },

  aObject(node, env) {
    const entries = node.properties.map((property) => {
      if (property.type === 'SpreadElement') return { spread: this.aExpr(property.argument, env) };
      if (property.value?.coverInit) {
        throw this.error('{ a = 1 } is a pattern of an assignment, not an object', property.value);
      }
      const value = this.aExpr(property.value, env);
      const accessor = property.kind === 'get' || property.kind === 'set' ? property.kind : null;
      if (!property.computed) {
        if (property.key === '__proto__') {
          throw this.error('__proto__ cannot be a key', property.value, 'XUFA_EXPR_ERR_FORBIDDEN');
        }
        const { key } = property;
        return { key: lift(() => key), value, accessor };
      }
      const key = this.aExpr(property.key, env);
      const keyOf = this.keyOf(property.key);
      return {
        *key(s) {
          return keyOf(yield* key(s));
        },
        value,
        accessor,
      };
    });
    return function* object(s) {
      const result = {};
      for (const entry of entries) {
        if (entry.spread) {
          const source = yield* entry.spread(s);
          if (source !== null && source !== undefined)
            for (const k of Object.keys(source)) define(result, k, source[k]);
        } else {
          const key = yield* entry.key(s);
          const value = yield* entry.value(s);
          if (entry.accessor) defineAccessor(result, key, entry.accessor, value);
          else define(result, key, value);
        }
      }
      return result;
    };
  },

  aAssignment(node, env) {
    const compiler = this;
    const { operator, left } = node;
    const right = this.aExpr(node.right, env);
    const logical = operator === '&&=' || operator === '||=' || operator === '??=' ? operator.slice(0, 2) : null;
    const operation = operator === '=' || logical ? null : BINARY[operator.slice(0, -1)];
    const skip = (current) =>
      logical === '&&' ? !current : logical === '||' ? current : current !== null && current !== undefined;
    if (left.type === 'Identifier') {
      const set = this.setter(left.name, left, env);
      const get = operator === '=' ? null : this.compile(left, env);
      return function* assign(s) {
        if (logical) {
          const current = get(s);
          if (skip(current)) return current;
        }
        const value = operation ? operation(get(s), yield* right(s)) : yield* right(s);
        set(s, value);
        return value;
      };
    }
    if (left.type === 'PrivateMember') {
      const object = this.aExpr(left.object, env);
      const privates = this.hidden(`#p${left.classId}`, left, env);
      const { name } = left;
      return function* assignPrivate(s) {
        const target = yield* object(s);
        const store = privates(s);
        if (operator === '=') return privateSet(compiler, store, name, target, yield* right(s), left);
        const current = privateGet(compiler, store, name, target, left);
        if (logical && skip(current)) return current;
        const value = operation ? operation(current, yield* right(s)) : yield* right(s);
        return privateSet(compiler, store, name, target, value, left);
      };
    }
    const { object, key } = this.aMember(left, env);
    return function* assignMember(s) {
      const target = compiler.writable(yield* object(s), left);
      const name = yield* key(s);
      if (logical && skip(target[name])) return target[name];
      const value = operation ? operation(target[name], yield* right(s)) : yield* right(s);
      target[name] = value;
      return value;
    };
  },

  // Statements: as those of statements.js, with generators.

  aList(nodes, env) {
    const hoisted = nodes
      .filter((node) => node.type === 'FunctionDeclaration')
      .map((node) => ({ set: this.setter(node.id, node, env, true), make: this.functionOf(node, env) }));
    const steps = nodes.filter((node) => node.type !== 'FunctionDeclaration').map((node) => this.aStatement(node, env));
    return function* list(s) {
      for (const { set, make } of hoisted) set(s, make(s));
      for (const step of steps) {
        const completion = yield* step(s);
        if (completion !== undefined) return completion;
      }
      return undefined;
    };
  },

  aBlock(nodes, env, functionLevel = false) {
    const frame = declaredNames(nodes, functionLevel);
    if (frame.length === 0) return this.aList(nodes, env);
    const body = this.aList(nodes, [...env, frame]);
    const size = frame.length;
    return function* block(s) {
      return yield* body({ ctx: s.ctx, frame: new Array(size), up: s, run: s.run });
    };
  },

  aLoopBody(node, env) {
    this.breakable.push('loop');
    const body = this.aStatement(node, env);
    this.breakable.pop();
    return body;
  },

  aStatement(node, env, labels = NO_LABELS) {
    if (!containsAwait(node)) return lift(this.statement(node, env));
    const compiler = this;
    const max = this.maxSteps;
    switch (node.type) {
      case 'ExpressionStatement': {
        const expression = this.aExpr(node.expression, env);
        const top = this.depth === 0;
        return function* statement(s) {
          const value = yield* expression(s);
          if (top) s.run.last = value;
          return undefined;
        };
      }
      case 'BlockStatement':
        return this.aBlock(node.body, env);
      case 'VariableDeclaration': {
        const parts = node.declarations
          .filter((declarator) => declarator.init || node.kind !== 'var')
          .map((declarator) => ({
            set: this.setter(declarator.id, declarator, env, true),
            init: declarator.init ? this.aExpr(declarator.init, env) : lift(() => undefined),
          }));
        return function* declaration(s) {
          for (const { set, init } of parts) set(s, yield* init(s));
          return undefined;
        };
      }
      case 'IfStatement': {
        const test = this.aExpr(node.test, env);
        const consequent = this.aStatement(node.consequent, env);
        const alternate = node.alternate ? this.aStatement(node.alternate, env) : lift(() => undefined);
        return function* ifStatement(s) {
          return (yield* test(s)) ? yield* consequent(s) : yield* alternate(s);
        };
      }
      case 'ReturnStatement': {
        const argument = this.aExpr(node.argument, env);
        return function* returned(s) {
          return new Return(yield* argument(s));
        };
      }
      case 'ThrowStatement': {
        const argument = this.aExpr(node.argument, env);
        return function* thrown(s) {
          throw yield* argument(s);
        };
      }
      case 'LabeledStatement': {
        const names = [];
        let body = node;
        while (body.type === 'LabeledStatement') {
          names.push(body.label);
          body = body.body;
        }
        const loop = ['ForStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(body.type);
        this.labels.push(...names.map((name) => ({ name, loop })));
        const set = new Set(names);
        const run = this.aStatement(body, env, set);
        this.labels.length -= names.length;
        if (loop) return run;
        return function* labeled(s) {
          const completion = yield* run(s);
          return completion instanceof Jump && completion.kind === 'break' && set.has(completion.label)
            ? undefined
            : completion;
        };
      }
      case 'ForStatement': {
        const { init } = node;
        const declares = init?.type === 'VariableDeclaration' && init.kind !== 'var';
        const frame = declares ? declaredNames([init], false) : null;
        const inner = declares ? [...env, frame] : env;
        let start = null;
        if (init) start = init.type === 'VariableDeclaration' ? this.aStatement(init, inner) : this.aExpr(init, inner);
        const test = node.test ? this.aExpr(node.test, inner) : null;
        const update = node.update ? this.aExpr(node.update, inner) : null;
        const body = this.aLoopBody(node.body, inner);
        const size = frame ? frame.length : 0;
        const copies = declares && makesFunctions([node.test, node.update, node.body]);
        return function* forLoop(s) {
          let scope = declares ? { ctx: s.ctx, frame: new Array(size), up: s, run: s.run } : s;
          if (start) yield* start(scope);
          const { run } = s;
          for (;;) {
            if (test && !(yield* test(scope))) break;
            if ((run.steps += 1) > max) throw compiler.limit(node);
            const completion = yield* body(scope);
            if (completion !== undefined) {
              const jump = jumpOf(completion, labels);
              if (jump === 'break') break;
              if (jump !== 'continue') return completion;
            }
            if (copies) scope = { ctx: s.ctx, frame: scope.frame.slice(), up: s, run };
            if (update) yield* update(scope);
          }
          return undefined;
        };
      }
      case 'ForOfStatement': {
        const { left } = node;
        const right = this.aExpr(node.right, env);
        const declares = left.type === 'VariableDeclaration' && left.kind !== 'var';
        const name = left.type === 'Identifier' ? left.name : left.declarations[0].id;
        const frame = declares ? declaredNames([{ ...left, kind: 'let' }], false) : null;
        const inner = declares ? [...env, frame] : env;
        const set = declares ? null : this.setter(name, left, env);
        const body = this.aLoopBody(node.body, inner);
        if (node.await) {
          // for await: each value of the async iterator awaited; its return() when the loop ends early.
          return function* forAwait(s) {
            const { run } = s;
            const iterator = asyncIteratorOf(compiler, yield* right(s), node.right);
            let finished = false;
            let threw = true;
            try {
              for (;;) {
                const result = yield iterator.next();
                if (result === null || typeof result !== 'object') {
                  throw compiler.error('An async iterator gave no object', node, 'XUFA_EXPR_ERR_RUNTIME');
                }
                if (result.done) {
                  finished = true;
                  break;
                }
                if ((run.steps += 1) > max) throw compiler.limit(node);
                let scope = s;
                if (declares) scope = { ctx: s.ctx, frame: [result.value], up: s, run };
                else set(s, result.value);
                const completion = yield* body(scope);
                if (completion !== undefined) {
                  const jump = jumpOf(completion, labels);
                  if (jump === 'break') break;
                  if (jump !== 'continue') {
                    threw = false;
                    return completion;
                  }
                }
              }
              threw = false;
              return undefined;
            } finally {
              if (!finished && typeof iterator.return === 'function') {
                // (Its error when the loop ended with none of its own.)
                try {
                  yield iterator.return();
                } catch (err) {
                  if (!threw) throw err; // eslint-disable-line no-unsafe-finally
                }
              }
            }
          };
        }
        return function* forOf(s) {
          const { run } = s;
          for (const value of yield* right(s)) {
            if ((run.steps += 1) > max) throw compiler.limit(node);
            let scope = s;
            if (declares) scope = { ctx: s.ctx, frame: [value], up: s, run };
            else set(s, value);
            const completion = yield* body(scope);
            if (completion !== undefined) {
              const jump = jumpOf(completion, labels);
              if (jump === 'break') break;
              if (jump !== 'continue') return completion;
            }
          }
          return undefined;
        };
      }
      case 'WhileStatement':
      case 'DoWhileStatement': {
        const test = this.aExpr(node.test, env);
        const body = this.aLoopBody(node.body, env);
        const first = node.type === 'DoWhileStatement';
        return function* whileLoop(s) {
          const { run } = s;
          let skipTest = first;
          for (;;) {
            if (!skipTest && !(yield* test(s))) break;
            skipTest = false;
            if ((run.steps += 1) > max) throw compiler.limit(node);
            const completion = yield* body(s);
            if (completion !== undefined) {
              const jump = jumpOf(completion, labels);
              if (jump === 'break') break;
              if (jump !== 'continue') return completion;
            }
          }
          return undefined;
        };
      }
      case 'TryStatement': {
        const block = this.aBlock(node.block.body, env);
        let handler = null;
        if (node.handler) {
          const { param } = node.handler;
          if (param) {
            const body = this.aBlock(node.handler.body.body, [...env, [param]]);
            handler = (s, err) => body({ ctx: s.ctx, frame: [err], up: s, run: s.run });
          } else {
            const body = this.aBlock(node.handler.body.body, env);
            handler = (s) => body(s);
          }
        }
        const finalizer = node.finalizer ? this.aBlock(node.finalizer.body, env) : null;
        return function* tryStatement(s) {
          let completion;
          let failed = false;
          let error;
          // (finally of JavaScript: the return() of a generator runs it too.)
          try {
            try {
              completion = yield* block(s);
            } catch (err) {
              if (!handler || isLimit(err)) {
                failed = true;
                error = err;
              } else {
                try {
                  completion = yield* handler(s, err);
                } catch (again) {
                  failed = true;
                  error = again;
                }
              }
            }
          } finally {
            if (finalizer) {
              const last = yield* finalizer(s);
              if (last !== undefined) return last; // eslint-disable-line no-unsafe-finally
            }
          }
          if (failed) throw error;
          return completion;
        };
      }
      case 'SwitchStatement': {
        const discriminant = this.aExpr(node.discriminant, env);
        const frame = declaredNames(
          node.cases.flatMap((item) => item.consequent),
          false
        );
        const inner = frame.length ? [...env, frame] : env;
        this.breakable.push('switch');
        const cases = node.cases.map((item) => ({
          test: item.test ? this.aExpr(item.test, inner) : null,
          body: this.aList(item.consequent, inner),
        }));
        this.breakable.pop();
        const size = frame.length;
        return function* switchStatement(s) {
          const scope = size ? { ctx: s.ctx, frame: new Array(size), up: s, run: s.run } : s;
          const value = yield* discriminant(s);
          let at = -1;
          for (let i = 0; i < cases.length && at === -1; i += 1) {
            if (cases[i].test && (yield* cases[i].test(scope)) === value) at = i;
          }
          if (at === -1) at = cases.findIndex((item) => !item.test);
          if (at === -1) return undefined;
          for (let i = at; i < cases.length; i += 1) {
            const completion = yield* cases[i].body(scope);
            if (completion !== undefined) return completion === BREAK ? undefined : completion;
          }
          return undefined;
        };
      }
      default:
        throw this.error(`await is not supported in ${node.type}`, node);
    }
  },
};

// What for await of the function of JavaScript goes through: an async iterable of the async iterator of a value.
function asyncIterable(compiler, value, node) {
  const iterator = asyncIteratorOf(compiler, value, node);
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
}

export { asyncStatements, containsAwait, drive, asyncGenerator, asyncIterable };
