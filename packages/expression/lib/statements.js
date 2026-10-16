// Programs (engines with `statements`): statements compiled to closures as expressions are, with the same checks (and,
// run often, to one function of JavaScript: see codegen-statements.js). Their
// names are frames of their own (blocks, loops, functions, catch), never the context: a name assigned and declared
// nowhere is a variable of the program, which starts with the value of that name in the context (or the globals).
// Members are assigned only on plain objects and arrays, never on the globals of the engine (nor what they reach), and
// never by the names __proto__, constructor or prototype. Loops and calls of functions count steps: past `maxSteps`
// a program fails (XUFA_EXPR_ERR_LIMIT), as it does with calls nested deeper than `maxDepth`; no catch of the program
// can stop that.
import { ExpressionError } from './errors.js';
import { isProgramObject, constructOf, privateAssign, privateUpdate } from './classes.js';
import { drive, asyncGenerator } from './async.js';

const BREAK = Symbol('break');
const CONTINUE = Symbol('continue');

// A break or continue of a label: up to the statement (or loop) of that label.
class Jump {
  constructor(kind, label) {
    this.kind = kind;
    this.label = label;
  }
}

// What a loop of some labels does with the completion of a turn: 'continue', 'break', or null (it goes up).
function jumpOf(completion, labels) {
  if (completion === CONTINUE) return 'continue';
  if (completion === BREAK) return 'break';
  if (completion instanceof Jump && labels.has(completion.label)) return completion.kind;
  return null;
}

const NO_LABELS = new Set();

// The frame of a function with a rest parameter: its parameters, then an array of the arguments after them.
function restFrame(args, count) {
  const frame = args.slice(0, count);
  frame.length = count;
  frame.push(args.slice(count));
  return frame;
}

// What a return gives up to its function.
class Return {
  constructor(value) {
    this.value = value;
  }
}

/* eslint-disable no-bitwise */
const OPERATIONS = Object.assign(Object.create(null), {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
});
/* eslint-enable no-bitwise */

// Whether a tree makes functions (which keep the names of the turn of a loop that made them).
const FUNCTION_NODES = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);
function makesFunctions(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(makesFunctions);
  if (FUNCTION_NODES.has(node.type)) return true;
  for (const key in node) {
    const value = node[key];
    if (value && typeof value === 'object' && makesFunctions(value)) return true;
  }
  return false;
}

const isLimit = (err) => err instanceof ExpressionError && err.code === 'XUFA_EXPR_ERR_LIMIT';

// The names a list of statements declares in its own frame: let, const and functions; and, for the body of a function
// (or the program), the var of its blocks too.
function declaredNames(statements, functionLevel) {
  const names = [];
  const consts = new Set();
  // (let and const of the source: those used before their declaration are errors with tdz; not the hidden ones.)
  const lexical = new Set();
  const add = (name) => {
    if (!names.includes(name)) names.push(name);
  };
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
      for (const declarator of statement.declarations) {
        add(declarator.id);
        if (statement.kind === 'const') consts.add(declarator.id);
        if (!declarator.id.startsWith('#')) lexical.add(declarator.id);
      }
    } else if (statement.type === 'FunctionDeclaration') add(statement.id);
  }
  if (functionLevel) {
    // (Found by the scan of the program; else, of a body it did not see, walked here.)
    const vars = VARS.get(statements);
    if (vars) vars.forEach(add);
    else {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration') return;
        if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach((d) => add(d.id));
        for (const key of Object.keys(node)) if (key !== 'type' && typeof node[key] === 'object') walk(node[key]);
      };
      walk(statements);
    }
  }
  const frame = names;
  frame.consts = consts;
  frame.lexical = lexical;
  return frame;
}

// The var of each body of a function (and of the program), by its list of statements: found by the scan of the
// program, read by declaredNames. The names each program assigns without declaring them, by the program.
const VARS = new WeakMap();
const IMPLICIT = new WeakMap();

// The names a program assigns without declaring them anywhere: its own variables. One walk of the program finds them
// and the var of the bodies of its functions (both compilers read them: the walk is made once).
function implicitNames(program) {
  const known = IMPLICIT.get(program);
  if (known) return known;
  const declared = new Set();
  const assigned = [];
  const walk = (node, vars) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, vars);
      return;
    }
    switch (node.type) {
      case 'VariableDeclarator':
        declared.add(node.id);
        break;
      case 'VariableDeclaration':
        if (node.kind === 'var') for (const { id } of node.declarations) if (!vars.includes(id)) vars.push(id);
        break;
      case 'FunctionDeclaration':
      case 'ArrowFunctionExpression': {
        if (node.type === 'FunctionDeclaration') declared.add(node.id);
        node.params.forEach((name) => declared.add(name));
        if (node.rest) declared.add(node.rest);
        // (Its var are its own: of its body.)
        const own = [];
        if (node.body?.type === 'BlockStatement') VARS.set(node.body.body, own);
        for (const key in node) {
          const value = node[key];
          if (value !== null && typeof value === 'object') walk(value, own);
        }
        return;
      }
      case 'CatchClause':
        if (node.param) declared.add(node.param);
        break;
      case 'AssignmentExpression':
        if (node.left.type === 'Identifier') assigned.push(node.left.name);
        break;
      case 'UpdateExpression':
        if (node.argument.type === 'Identifier') assigned.push(node.argument.name);
        break;
      case 'ForOfStatement':
        if (node.left.type === 'Identifier') assigned.push(node.left.name);
        break;
      default:
    }
    // (for...in: no array of keys made for each node; the nodes are plain objects.)
    for (const key in node) {
      const value = node[key];
      if (value !== null && typeof value === 'object') walk(value, vars);
    }
  };
  const vars = [];
  walk(program.body, vars);
  VARS.set(program.body, vars);
  const implicit = [...new Set(assigned)].filter((name) => !declared.has(name));
  IMPLICIT.set(program, implicit);
  return implicit;
}

// The frame of a program's top level: with the context as its scope (scope: 'context'), only its hidden names (#...:
// of the compiler's own lowering), the names of the program being the context's properties.
function contextFrame(frame, contextScope) {
  if (!contextScope) return frame;
  const hidden = frame.filter((name) => name.startsWith('#'));
  hidden.consts = new Set([...frame.consts].filter((name) => name.startsWith('#')));
  hidden.lexical = new Set();
  return hidden;
}

// The objects and functions the globals reach (to some depth): what a program can never change.
function guardedOf(globals) {
  const guarded = new WeakSet();
  const walk = (value, depth) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function') || guarded.has(value)) return;
    guarded.add(value);
    if (depth >= 4) return;
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) walk(descriptor.value, depth + 1);
    }
  };
  for (const key of Object.keys(globals)) walk(globals[key], 0);
  return guarded;
}

// The nodes of programs: what the parser of expressions never makes.
const PROGRAM_NODES = new Set([
  'AssignmentExpression',
  'UpdateExpression',
  'NewExpression',
  'BlockStatement',
  'FunctionDeclaration',
  'ClassExpression',
  'ThisExpression',
  'SuperMember',
  'SuperCall',
  'AwaitExpression',
  'YieldExpression',
  'ImportModule',
]);

// Whether a tree of a program's expression is an expression of expressions only (can be compiled, and inlined, as
// one): no assignments, ++, new, delete, nor functions of statements.
function isExpressionOnly(node) {
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node)) return node.every(isExpressionOnly);
  if (PROGRAM_NODES.has(node.type)) return false;
  if (node.type === 'UnaryExpression' && node.operator === 'delete') return false;
  for (const key of Object.keys(node)) {
    if (key !== 'type' && typeof node[key] === 'object' && !isExpressionOnly(node[key])) return false;
  }
  return true;
}

// The methods of the compiler for programs.
const statements = {
  limit(node) {
    return this.error(`The program ran more than ${this.maxSteps} steps`, node, 'XUFA_EXPR_ERR_LIMIT');
  },

  // fn(context) of a program: the value of its return, or else of the last expression statement it ran.
  program(node) {
    this.depth = 0;
    this.breakable = [];
    // (Programs count every call of their arrow functions.)
    this.inProgram = true;
    // (The scan first: declaredNames reads the var it found.)
    const scanned = implicitNames(node);
    const { contextScope } = this;
    if (contextScope && node.async) {
      throw this.error("A program whose scope is the context (scope: 'context') cannot await at its top", node);
    }
    // (With the context as its scope, the program's own names are the context's: its frame keeps the hidden ones.)
    const frame = contextFrame(declaredNames(node.body, true), contextScope);
    const implicit = contextScope ? [] : scanned.filter((name) => !frame.includes(name));
    for (const name of implicit) this.checkKey(name, node);
    const firstImplicit = frame.length;
    frame.push(...implicit);
    // (await at its top: an async program, run by the driver of async bodies; a promise of its value.)
    const body = node.async
      ? this.aList(node.body, [frame])
      : this.onError || contextScope
        ? this.topList(node.body, [frame])
        : this.list(node.body, [frame]);
    const size = frame.length;
    const { globals } = this;
    const { hasOwnProperty } = Object.prototype;
    return (ctx) => {
      const run = { steps: 0, depth: 0, last: undefined };
      const scope = { ctx, frame: new Array(size), up: null, run };
      for (let i = 0; i < implicit.length; i += 1) {
        const name = implicit[i];
        const value = ctx[name];
        scope.frame[firstImplicit + i] =
          value !== undefined || name in ctx ? value : hasOwnProperty.call(globals, name) ? globals[name] : undefined;
      }
      if (node.async) {
        return drive(body(scope)).then((completion) => (completion instanceof Return ? completion.value : run.last));
      }
      const completion = body(scope);
      return completion instanceof Return ? completion.value : run.last;
    };
  },

  // The statements of a block, with the functions it declares made first.
  list(nodes, env) {
    const hoisted = nodes
      .filter((node) => node.type === 'FunctionDeclaration')
      .map((node) => ({ set: this.setter(node.id, node, env, true), make: this.functionOf(node, env) }));
    const steps = nodes.filter((node) => node.type !== 'FunctionDeclaration').map((node) => this.statement(node, env));
    const { length } = steps;
    return (s) => {
      for (let i = 0; i < hoisted.length; i += 1) hoisted[i].set(s, hoisted[i].make(s));
      for (let i = 0; i < length; i += 1) {
        const completion = steps[i](s);
        if (completion !== undefined) return completion;
      }
      return undefined;
    };
  },

  // A block: a frame of its own when it declares names.
  block(nodes, env, functionLevel = false) {
    const frame = declaredNames(nodes, functionLevel);
    if (frame.length === 0) return this.list(nodes, env);
    const body = this.list(nodes, [...env, frame]);
    const size = frame.length;
    return (s) => body({ ctx: s.ctx, frame: new Array(size), up: s, run: s.run });
  },

  // (s, value) => sets a name of the frames around (declaring: a const can take its value).
  setter(name, node, env, declaring = false) {
    for (let depth = env.length - 1; depth >= 0; depth -= 1) {
      const index = env[depth].indexOf(name);
      if (index === -1) continue;
      if (!declaring && env[depth].consts?.has(name)) throw this.error(`${name} is a constant`, node);
      const up = env.length - 1 - depth;
      // (With tdz: a let assigned before its declaration runs, an error.)
      if (!declaring && this.unsetChecked(env[depth], name)) {
        const compiler = this;
        return (s, value) => {
          let scope = s;
          for (let i = 0; i < up; i += 1) scope = scope.up;
          if (!(index in scope.frame)) throw compiler.unset(node);
          scope.frame[index] = value;
        };
      }
      if (up === 0) {
        return (s, value) => {
          s.frame[index] = value;
        };
      }
      if (up === 1) {
        return (s, value) => {
          s.up.frame[index] = value;
        };
      }
      return (s, value) => {
        let scope = s;
        for (let i = 0; i < up; i += 1) scope = scope.up;
        scope.frame[index] = value;
      };
    }
    // (With the context as the program's scope: a name of the program is the context's property.)
    if (this.contextScope && !name.startsWith('#')) {
      this.checkKey(name, node);
      const compiler = this;
      return (s, value) => {
        compiler.contextWritable(s.ctx, node)[name] = value;
      };
    }
    throw this.error(`${name} is not declared here`, node);
  },

  // The context, when a program writes a name of it: a plain object (not a value of the engine, as Math).
  contextWritable(ctx, node) {
    const proto = Object.getPrototypeOf(ctx);
    if (this.guarded.has(ctx) || this.guardedToo?.has(ctx) || !(proto === Object.prototype || proto === null)) {
      throw this.error('The context cannot be changed: only a plain object can', node, 'XUFA_EXPR_ERR_FORBIDDEN');
    }
    return ctx;
  },

  // The statements of a program's top level, with onError (an error of one is given to it, its value is undefined,
  // and the next one runs; limits still end the run) and, with the context as its scope, a declaration's value
  // undefined (the value of the program is that of its last statement).
  topList(nodes, env) {
    const hoisted = nodes
      .filter((node) => node.type === 'FunctionDeclaration')
      .map((node) => ({ set: this.setter(node.id, node, env, true), make: this.functionOf(node, env) }));
    const top = [];
    nodes.forEach((node, index) => {
      if (node.type !== 'FunctionDeclaration') {
        top.push({ step: this.statement(node, env), index, declares: node.type === 'VariableDeclaration', node });
      }
    });
    const { onError, contextScope } = this;
    const compiler = this;
    const { length } = top;
    return (s) => {
      for (let i = 0; i < hoisted.length; i += 1) hoisted[i].set(s, hoisted[i].make(s));
      for (let i = 0; i < length; i += 1) {
        const { step, index, declares, node } = top[i];
        let completion;
        if (onError) {
          try {
            completion = step(s);
          } catch (error) {
            if (isLimit(error)) throw error;
            s.run.last = undefined;
            // (The source of the statement: of an expression statement, its expression.)
            onError(error, { source: compiler.text(node.expression ?? node), statement: index, context: s.ctx });
            continue;
          }
        } else {
          completion = step(s);
        }
        if (contextScope && declares) s.run.last = undefined;
        if (completion !== undefined) return completion;
      }
      return undefined;
    };
  },

  // A function (of a declaration, a function expression or an arrow function with a body of statements).
  functionOf(node, env) {
    const saved = [this.depth, this.breakable, this.labels];
    this.depth += 1;
    this.breakable = [];
    this.labels = [];
    const { rest, method } = node;
    const count = node.params.length;
    // (A method has its this first in its frame: #this, what this reads.)
    const params = [...(method ? ['#this'] : []), ...node.params, ...(rest ? [rest] : [])];
    let body;
    // (Generators: yield as it is, or as a YieldRequest of async generators; async functions have none.)
    const savedMode = this.yieldMode;
    this.yieldMode = node.generator ? (node.async ? 'wrapped' : 'raw') : null;
    if (node.async || node.generator) {
      // (async and generators: their body a generator, run by the driver of async bodies or as a generator.)
      const inner = [...env, params];
      if (node.body.type === 'BlockStatement') body = this.aBlock(node.body.body, inner, true);
      else {
        const expression = this.aExpr(node.body, inner);
        body = function* returned(s) {
          return new Return(yield* expression(s));
        };
      }
    } else {
      body =
        node.body.type === 'BlockStatement'
          ? this.block(node.body.body, [...env, params], true)
          : (
              (expression) => (s) =>
                new Return(expression(s))
            )(this.compile(node.body, [...env, params]));
    }
    this.yieldMode = savedMode;
    [this.depth, this.breakable, this.labels] = saved;
    const max = this.maxSteps;
    const { maxDepth } = this;
    const compiler = this;
    const isAsync = Boolean(node.async);
    const isGenerator = Boolean(node.generator);
    return (s) => {
      const { run, ctx } = s;
      const call = (self, args) => {
        if (run && (run.steps += 1) > max) throw compiler.limit(node);
        // (An async call: a promise of its body run by the driver; its depth is not counted, as its awaits leave the
        // stack, the same as the function of JavaScript.)
        // (A generator: its body as one, its completion its value; an async generator: its async iterator.)
        if (isGenerator) {
          const frame = rest ? restFrame(args, count) : args;
          const generator = body({ ctx, frame: method ? [self, ...frame] : frame, up: s, run });
          if (isAsync) return asyncGenerator(generator);
          return (function* generated() {
            const completion = yield* generator;
            return completion instanceof Return ? completion.value : undefined;
          })();
        }
        if (isAsync) {
          const frame = rest ? restFrame(args, count) : args;
          let generator;
          try {
            generator = body({ ctx, frame: method ? [self, ...frame] : frame, up: s, run });
          } catch (err) {
            return Promise.reject(err);
          }
          return drive(generator).then((completion) => (completion instanceof Return ? completion.value : undefined));
        }
        if (run && (run.depth += 1) > maxDepth) {
          run.depth = 0;
          throw compiler.error(`Calls nested deeper than ${maxDepth}`, node, 'XUFA_EXPR_ERR_LIMIT');
        }
        try {
          const frame = rest ? restFrame(args, count) : args;
          const completion = body({ ctx, frame: method ? [self, ...frame] : frame, up: s, run });
          return completion instanceof Return ? completion.value : undefined;
        } finally {
          if (run && run.depth > 0) run.depth -= 1;
        }
      };
      // (A method: a function of JavaScript, for its this.)
      if (method) {
        return function method(...args) {
          return call(this, args);
        };
      }
      return (...args) => call(undefined, args);
    };
  },

  statement(node, env) {
    switch (node.type) {
      case 'EmptyStatement':
      case 'FunctionDeclaration':
        return () => undefined;
      case 'ExpressionStatement': {
        const expression = this.compile(node.expression, env);
        if (this.depth === 0) {
          return (s) => {
            s.run.last = expression(s);
          };
        }
        return (s) => {
          expression(s);
        };
      }
      case 'BlockStatement':
        return this.block(node.body, env);
      case 'VariableDeclaration':
        return this.declaration(node, env);
      case 'IfStatement': {
        const test = this.compile(node.test, env);
        const consequent = this.statement(node.consequent, env);
        const alternate = node.alternate ? this.statement(node.alternate, env) : () => undefined;
        return (s) => (test(s) ? consequent(s) : alternate(s));
      }
      case 'ForStatement':
        return this.forLoop(node, env, NO_LABELS);
      case 'ForOfStatement':
        return this.forOf(node, env, NO_LABELS);
      case 'WhileStatement':
      case 'DoWhileStatement':
        return this.whileLoop(node, env, NO_LABELS);
      case 'LabeledStatement':
        return this.labeled(node, env);
      case 'ReturnStatement': {
        if (!node.argument) return () => new Return(undefined);
        const argument = this.compile(node.argument, env);
        return (s) => new Return(argument(s));
      }
      case 'BreakStatement': {
        if (node.label) {
          if (!this.labels.some((item) => item.name === node.label))
            throw this.error(`No label ${node.label} here`, node);
          const jump = new Jump('break', node.label);
          return () => jump;
        }
        if (this.breakable.length === 0) throw this.error('break out of a loop or a switch', node);
        return () => BREAK;
      }
      case 'ContinueStatement': {
        if (node.label) {
          if (!this.labels.some((item) => item.name === node.label && item.loop)) {
            throw this.error(`No loop of the label ${node.label} here`, node);
          }
          const jump = new Jump('continue', node.label);
          return () => jump;
        }
        if (!this.breakable.includes('loop')) throw this.error('continue out of a loop', node);
        return () => CONTINUE;
      }
      case 'ThrowStatement': {
        const argument = this.compile(node.argument, env);
        return (s) => {
          throw argument(s);
        };
      }
      case 'TryStatement':
        return this.tryStatement(node, env);
      case 'SwitchStatement':
        return this.switchStatement(node, env);
      default:
        throw this.error(`Unsupported ${node.type}`, node);
    }
  },

  // label: statement (a: b: for...: the labels of one statement): a loop of them takes their breaks and continues;
  // another statement, their breaks.
  labeled(node, env) {
    const names = [];
    let body = node;
    while (body.type === 'LabeledStatement') {
      if (names.includes(body.label) || this.labels.some((item) => item.name === body.label)) {
        throw this.error(`The label ${body.label} is already used here`, body);
      }
      names.push(body.label);
      body = body.body;
    }
    const loop = ['ForStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(body.type);
    this.labels.push(...names.map((name) => ({ name, loop })));
    const labels = new Set(names);
    let run;
    if (body.type === 'ForStatement') run = this.forLoop(body, env, labels);
    else if (body.type === 'ForOfStatement') run = this.forOf(body, env, labels);
    else if (loop) run = this.whileLoop(body, env, labels);
    else run = this.statement(body, env);
    this.labels.length -= names.length;
    if (loop) return run;
    return (s) => {
      const completion = run(s);
      return completion instanceof Jump && completion.kind === 'break' && labels.has(completion.label)
        ? undefined
        : completion;
    };
  },

  declaration(node, env) {
    const parts = node.declarations
      .filter((declarator) => declarator.init || node.kind !== 'var')
      .map((declarator) => ({
        set: this.setter(declarator.id, declarator, env, true),
        init: declarator.init ? this.compile(declarator.init, env) : () => undefined,
      }));
    return (s) => {
      for (let i = 0; i < parts.length; i += 1) parts[i].set(s, parts[i].init(s));
      return undefined;
    };
  },

  // The body of a loop (break and continue are its own).
  loopBody(node, env) {
    this.breakable.push('loop');
    const body = this.statement(node, env);
    this.breakable.pop();
    return body;
  },

  forLoop(node, env, labels) {
    const { init } = node;
    const declares = init?.type === 'VariableDeclaration' && init.kind !== 'var';
    const frame = declares ? declaredNames([init], false) : null;
    const inner = declares ? [...env, frame] : env;
    let start = null;
    if (init) start = init.type === 'VariableDeclaration' ? this.declaration(init, inner) : this.compile(init, inner);
    const test = node.test ? this.compile(node.test, inner) : null;
    const update = node.update ? this.compile(node.update, inner) : null;
    const body = this.loopBody(node.body, inner);
    const size = frame ? frame.length : 0;
    const max = this.maxSteps;
    const compiler = this;
    // (A copy of its names each turn only when a function made in a turn can keep them.)
    const copies = declares && makesFunctions([node.test, node.update, node.body]);
    return (s) => {
      let scope = declares ? { ctx: s.ctx, frame: new Array(size), up: s, run: s.run } : s;
      if (start) start(scope);
      const { run } = s;
      for (;;) {
        if (test && !test(scope)) break;
        if ((run.steps += 1) > max) throw compiler.limit(node);
        const completion = body(scope);
        if (completion !== undefined) {
          const jump = jumpOf(completion, labels);
          if (jump === 'break') break;
          if (jump !== 'continue') return completion;
        }
        // (Each turn its own names, as let in JavaScript: functions made in a turn keep its values.)
        if (copies) scope = { ctx: s.ctx, frame: scope.frame.slice(), up: s, run };
        if (update) update(scope);
      }
      return undefined;
    };
  },

  forOf(node, env, labels) {
    const { left } = node;
    const right = this.compile(node.right, env);
    const declares = left.type === 'VariableDeclaration' && left.kind !== 'var';
    const name = left.type === 'Identifier' ? left.name : left.declarations[0].id;
    const frame = declares ? declaredNames([{ ...left, kind: 'let' }], false) : null;
    const inner = declares ? [...env, frame] : env;
    const set = declares ? null : this.setter(name, left, env);
    const body = this.loopBody(node.body, inner);
    const max = this.maxSteps;
    const compiler = this;
    // (A scope of its own each turn only when a function made in a turn can keep it; else one for every turn.)
    const fresh = declares && makesFunctions(node.body);
    return (s) => {
      const { run } = s;
      const shared = declares && !fresh ? { ctx: s.ctx, frame: [undefined], up: s, run } : null;
      for (const value of right(s)) {
        if ((run.steps += 1) > max) throw compiler.limit(node);
        let scope = s;
        if (shared) {
          shared.frame[0] = value;
          scope = shared;
        } else if (declares) scope = { ctx: s.ctx, frame: [value], up: s, run };
        else set(s, value);
        const completion = body(scope);
        if (completion !== undefined) {
          const jump = jumpOf(completion, labels);
          if (jump === 'break') break;
          if (jump !== 'continue') return completion;
        }
      }
      return undefined;
    };
  },

  whileLoop(node, env, labels) {
    const test = this.compile(node.test, env);
    const body = this.loopBody(node.body, env);
    const first = node.type === 'DoWhileStatement';
    const max = this.maxSteps;
    const compiler = this;
    return (s) => {
      const { run } = s;
      let skipTest = first;
      for (;;) {
        if (!skipTest && !test(s)) break;
        skipTest = false;
        if ((run.steps += 1) > max) throw compiler.limit(node);
        const completion = body(s);
        if (completion !== undefined) {
          const jump = jumpOf(completion, labels);
          if (jump === 'break') break;
          if (jump !== 'continue') return completion;
        }
      }
      return undefined;
    };
  },

  tryStatement(node, env) {
    const block = this.block(node.block.body, env);
    let handler = null;
    if (node.handler) {
      const { param } = node.handler;
      if (param) {
        const frame = [param];
        const body = this.block(node.handler.body.body, [...env, frame]);
        handler = (s, err) => body({ ctx: s.ctx, frame: [err], up: s, run: s.run });
      } else {
        const body = this.block(node.handler.body.body, env);
        handler = (s) => body(s);
      }
    }
    const finalizer = node.finalizer ? this.block(node.finalizer.body, env) : null;
    return (s) => {
      let completion;
      let failed = false;
      let error;
      try {
        completion = block(s);
      } catch (err) {
        // (The limit of steps goes through every catch.)
        if (!handler || isLimit(err)) {
          failed = true;
          error = err;
        } else {
          try {
            completion = handler(s, err);
          } catch (again) {
            failed = true;
            error = again;
          }
        }
      }
      // (As in JavaScript: a return, break or continue of finally is what the statement does, an error or not.)
      if (finalizer) {
        const last = finalizer(s);
        if (last !== undefined) return last;
      }
      if (failed) throw error;
      return completion;
    };
  },

  switchStatement(node, env) {
    const discriminant = this.compile(node.discriminant, env);
    const frame = declaredNames(
      node.cases.flatMap((item) => item.consequent),
      false
    );
    const inner = frame.length ? [...env, frame] : env;
    this.breakable.push('switch');
    const cases = node.cases.map((item) => ({
      test: item.test ? this.compile(item.test, inner) : null,
      body: this.list(item.consequent, inner),
    }));
    this.breakable.pop();
    const size = frame.length;
    return (s) => {
      const scope = size ? { ctx: s.ctx, frame: new Array(size), up: s, run: s.run } : s;
      const value = discriminant(s);
      let at = cases.findIndex((item) => item.test && item.test(scope) === value);
      if (at === -1) at = cases.findIndex((item) => !item.test);
      if (at === -1) return undefined;
      for (let i = at; i < cases.length; i += 1) {
        const completion = cases[i].body(scope);
        if (completion !== undefined) return completion === BREAK ? undefined : completion;
      }
      return undefined;
    };
  },

  // An object whose members a program can change: a plain object or an array the globals do not reach.
  writable(object, node) {
    if (object === null || object === undefined) {
      throw this.error(
        `Cannot set ${this.memberName(node)} of ${this.text(node.object)}, which is null or undefined`,
        node,
        'XUFA_EXPR_ERR_RUNTIME'
      );
    }
    const proto = typeof object === 'object' ? Object.getPrototypeOf(object) : undefined;
    if (
      this.guarded.has(object) ||
      this.guardedToo?.has(object) ||
      (typeof object !== 'object' && typeof object !== 'function') ||
      !(Array.isArray(object) || proto === Object.prototype || proto === null || isProgramObject(object))
    ) {
      throw this.error(
        `${this.text(node.object)} cannot be changed: only plain objects, arrays and objects of classes of programs can`,
        node,
        'XUFA_EXPR_ERR_FORBIDDEN'
      );
    }
    return object;
  },

  memberName(node) {
    return node.computed ? this.text(node.property) : node.property;
  },

  // a = b, a += b, a.b = c, a[b] ??= c...
  assignment(node, env) {
    const { operator, left } = node;
    const right = this.compile(node.right, env);
    // (object.#name = ...: of the private names of its class.)
    if (left.type === 'PrivateMember') {
      const object = this.compile(left.object, env);
      const privates = this.hidden(`#p${left.classId}`, left, env);
      const compiler = this;
      return (s) => privateAssign(compiler, privates(s), left.name, object(s), operator, () => right(s), left);
    }
    const operation = operator === '=' ? null : OPERATIONS[operator.slice(0, -1)];
    const logical = operator === '&&=' || operator === '||=' || operator === '??=' ? operator.slice(0, 2) : null;
    if (left.type === 'Identifier') {
      const set = this.setter(left.name, left, env);
      const get = operator === '=' ? null : this.compile(left, env);
      if (logical) {
        return (s) => {
          const current = get(s);
          if (logical === '&&' ? !current : logical === '||' ? current : current !== null && current !== undefined) {
            return current;
          }
          const value = right(s);
          set(s, value);
          return value;
        };
      }
      if (operation) {
        return (s) => {
          const value = operation(get(s), right(s));
          set(s, value);
          return value;
        };
      }
      return (s) => {
        const value = right(s);
        set(s, value);
        return value;
      };
    }
    const { object, key, keyFn } = this.memberParts(left, env);
    const compiler = this;
    return (s) => {
      const target = compiler.writable(object(s), left);
      const name = keyFn ? keyFn(s) : key;
      if (logical) {
        const current = target[name];
        if (logical === '&&' ? !current : logical === '||' ? current : current !== null && current !== undefined) {
          return current;
        }
      }
      const value = operation ? operation(target[name], right(s)) : right(s);
      target[name] = value;
      return value;
    };
  },

  // ++a, a--...
  update(node, env) {
    const { argument, prefix } = node;
    const step = node.operator === '++' ? 1 : -1;
    const next = (old) => {
      const number = typeof old === 'bigint' ? old : +old;
      return [number, typeof number === 'bigint' ? number + BigInt(step) : number + step];
    };
    if (argument.type === 'Identifier') {
      const get = this.compile(argument, env);
      const set = this.setter(argument.name, argument, env);
      return (s) => {
        const [old, value] = next(get(s));
        set(s, value);
        return prefix ? value : old;
      };
    }
    if (argument.type === 'PrivateMember') {
      const object = this.compile(argument.object, env);
      const privates = this.hidden(`#p${argument.classId}`, argument, env);
      const compiler = this;
      return (s) => privateUpdate(compiler, privates(s), argument.name, object(s), step, prefix, argument);
    }
    const { object, key, keyFn } = this.memberParts(argument, env);
    const compiler = this;
    return (s) => {
      const target = compiler.writable(object(s), argument);
      const name = keyFn ? keyFn(s) : key;
      const [old, value] = next(target[name]);
      target[name] = value;
      return prefix ? value : old;
    };
  },

  remove(node, env) {
    const { argument } = node;
    const { object, key, keyFn } = this.memberParts(argument, env);
    const compiler = this;
    return (s) => {
      const target = compiler.writable(object(s), argument);
      return delete target[keyFn ? keyFn(s) : key];
    };
  },

  // new Name(...): a class of the program (a name of it), else a constructor of the engine.
  construct(node, env) {
    const args = this.argumentsOf(node.arguments, env);
    if (this.declared(node.callee, env)) {
      const Class = this.compile({ type: 'Identifier', name: node.callee, start: node.start, end: node.end }, env);
      const compiler = this;
      return (s) => constructOf(compiler, Class(s), args(s), node);
    }
    if (!Object.prototype.hasOwnProperty.call(this.constructors, node.callee)) {
      throw this.error(`new ${node.callee} is not allowed`, node, 'XUFA_EXPR_ERR_FORBIDDEN');
    }
    const Constructor = this.constructors[node.callee];
    return (s) => Reflect.construct(Constructor, args(s));
  },
};

export {
  statements,
  contextFrame,
  guardedOf,
  isExpressionOnly,
  isLimit,
  declaredNames,
  implicitNames,
  makesFunctions,
  Return,
  BREAK,
  CONTINUE,
  Jump,
  jumpOf,
  NO_LABELS,
  restFrame,
};
