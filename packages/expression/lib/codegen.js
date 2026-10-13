// An expression as one function of JavaScript, for those run often (see compileTree): its arrow functions are arrow
// functions of JavaScript, its operators those of JavaScript, and what must be checked (names of the context, members,
// calls, keys, optional chains) goes through helpers that check as the closures do and fail with their errors.
//
// Nothing of the source is code there: strings and keys are JSON literals, numbers are written by String(), operators
// come from a fixed list, and the parameters of arrow functions have names made here (a0, a1...). The tree was
// compiled to closures first, so its names and keys are checked already.
import { ExpressionError } from './errors.js';
import { statementMethods } from './codegen-statements.js';
import { isLimit } from './statements.js';
import { templateStrings } from './intrinsics.js';
import { asyncIterable } from './async.js';
import {
  makeClass,
  makePrivates,
  privateGet,
  privateSet,
  privateIn,
  privateUpdate,
  heritageOf,
  superCall,
  constructOf,
} from './classes.js';
import { define, defineAccessor } from './objects.js';

// The context of a run that is not an object: {} for null and undefined, the object of a primitive for the others.
function contextOf(context) {
  return context === null || context === undefined ? {} : Object(context);
}

const BINARY = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '|',
  '&',
  '^',
  '<<',
  '>>',
  '>>>',
  'in',
]);
// What a let or const of a program holds before its declaration runs, with tdz (no program can reach it).
const UNSET = Object.freeze(Object.create(null));
const LOGICAL = new Set(['&&', '||', '??']);
const UNARY = new Set(['!', '-', '+', '~', 'typeof', 'void']);
const { hasOwnProperty } = Object.prototype;

function literal(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '(-0)' : `(${String(value)})`;
  if (typeof value === 'bigint') return `(${String(value)}n)`;
  if (value === true || value === false || value === null) return String(value);
  throw new Error(`Unexpected literal ${typeof value}`);
}

class Generator {
  constructor(compiler, SHORT) {
    this.compiler = compiler;
    this.SHORT = SHORT;
    this.nodes = [];
    this.names = 0;
    // The temporary variables of the function, and of each arrow function (declared where they are used).
    this.temps = [[]];
    // (Labels of programs: their names of JavaScript made here, innermost last; whether functions count steps.)
    this.labelNames = [];
    this.usesSteps = false;
  }

  temp() {
    this.names += 1;
    const name = `t${this.names}`;
    this.temps[this.temps.length - 1].push(name);
    return name;
  }

  // The index of a node, for the errors of the helpers.
  at(node) {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }

  // env: the parameters of the arrow functions around, innermost last: [{ name, as }].
  gen(node, env, chain = false) {
    switch (node.type) {
      case 'Literal':
        if (node.regex) return `RX(${JSON.stringify(node.regex.pattern)}, ${JSON.stringify(node.regex.flags)})`;
        return literal(node.value);
      case 'Identifier': {
        for (let depth = env.length - 1; depth >= 0; depth -= 1) {
          const param = env[depth].find((item) => item.name === node.name);
          if (param) return param.unset ? this.readOf(param, node) : param.as;
        }
        if (node.name === 'undefined') return '(void 0)';
        // (A bound name: its value, fixed.)
        if (hasOwnProperty.call(this.compiler.bound, node.name)) return `B[${JSON.stringify(node.name)}]`;
        // The name read here (its own inline cache); what is not there, by the helper (in, globals, strict).
        const name = JSON.stringify(node.name);
        const t = this.temp();
        return `((${t} = ctx[${name}]) !== undefined ? ${t} : id(ctx, ${name}, ${this.at(node)}))`;
      }
      case 'TemplateLiteral': {
        const parts = [JSON.stringify(node.quasis[0])];
        node.expressions.forEach((expression, i) => {
          // Each value as a template literal of its own turns it to text (only code made here is in it).
          parts.push(`\`\${${this.gen(expression, env)}}\``, JSON.stringify(node.quasis[i + 1]));
        });
        return `(${parts.join(' + ')})`;
      }
      case 'ArrayExpression':
        if (node.elements.includes(null)) throw new Error('Holes in arrays');
        return `[${node.elements.map((element) => this.item(element, env)).join(', ')}]`;
      case 'ObjectExpression': {
        // (With getters or setters: made by the helper as the closures make it.)
        if (node.properties.some((property) => property.kind === 'get' || property.kind === 'set')) {
          const entries = node.properties.map((property) => {
            if (property.type === 'SpreadElement') return `[3, null, ${this.gen(property.argument, env)}]`;
            const kind = property.kind === 'get' ? 1 : property.kind === 'set' ? 2 : 0;
            const key = property.computed
              ? `K(${this.gen(property.key, env)}, ${this.at(property.key)})`
              : JSON.stringify(property.key);
            return `[${kind}, ${key}, ${this.gen(property.value, env)}]`;
          });
          return `OB([${entries.join(', ')}])`;
        }
        const properties = node.properties.map((property) => {
          if (property.type === 'SpreadElement') return `...${this.gen(property.argument, env)}`;
          const value = this.gen(property.value, env);
          // __proto__ was refused as a key; computed keys are checked (and are own properties in JavaScript).
          if (!property.computed) return `${JSON.stringify(property.key)}: ${value}`;
          return `[K(${this.gen(property.key, env)}, ${this.at(property.key)})]: ${value}`;
        });
        return `({ ${properties.join(', ')} })`;
      }
      case 'MemberExpression': {
        const object = this.gen(node.object, env, chain);
        if (chain) return `MS(${object}, ${this.chainKey(node, env)}, ${this.at(node)}, ${node.optional})`;
        const key = this.key(node, env);
        // The member read here; null and undefined by the helper (undefined, or the error).
        const t = this.temp();
        return `((${t} = ${object}) === null || ${t} === undefined ? MN(${this.at(node)}) : ${t}[${key}])`;
      }
      case 'CallExpression':
        return this.call(node, env, chain);
      case 'ChainExpression':
        return `C(${this.gen(node.expression, env, true)})`;
      // (Of programs: assignments, ++ and --, delete, new, functions of statements; see codegen-statements.js.)
      case 'AssignmentExpression':
        return this.assignment(node, env);
      case 'UpdateExpression':
        return this.update(node, env);
      case 'NewExpression':
        return this.construct(node, env);
      case 'UnaryExpression':
        if (node.operator === 'delete') return this.remove(node, env);
        if (!UNARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${node.operator === 'typeof' || node.operator === 'void' ? `${node.operator} ` : node.operator}${this.gen(node.argument, env)})`;
      case 'BinaryExpression':
        if (node.operator === 'instanceof') return this.instanceOf(node, env);
        if (!BINARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'LogicalExpression':
        if (!LOGICAL.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'ConditionalExpression':
        return `(${this.gen(node.test, env)} ? ${this.gen(node.consequent, env)} : ${this.gen(node.alternate, env)})`;
      case 'AwaitExpression':
        return `(await ${this.gen(node.argument, env)})`;
      case 'ImportModule':
        return `IMP(${this.at(node)})`;
      case 'YieldExpression':
        return `(yield${node.delegate ? '*' : ''} ${node.argument ? this.gen(node.argument, env) : ''})`;
      case 'ArrowFunctionExpression': {
        if (node.body.type === 'BlockStatement' || node.async) return this.fn(node, env);
        const names = node.rest ? [...node.params, node.rest] : node.params;
        const params = names.map((name) => {
          this.names += 1;
          return { name, as: `a${this.names}` };
        });
        this.temps.push([]);
        const body = this.gen(node.body, [...env, params]);
        const temps = this.temps.pop();
        const list = params
          .map((param, i) => (node.rest && i === params.length - 1 ? `...${param.as}` : param.as))
          .join(', ');
        // (Its calls steps of the run, as the closures count them: in programs, and in expressions of arrow functions
        // in others.)
        if (!this.inProgram && env.length === 0) {
          if (temps.length === 0) return `((${list}) => ${body})`;
          return `((${list}) => { let ${temps.join(', ')}; return ${body}; })`;
        }
        this.usesSteps = true;
        const step = `++st > MX && THR(${this.at(node)})`;
        if (temps.length === 0) return `((${list}) => (${step}, ${body}))`;
        return `((${list}) => { let ${temps.join(', ')}; ${step}; return ${body}; })`;
      }
      case 'SequenceExpression':
        return `(${node.expressions.map((expression) => this.gen(expression, env)).join(', ')})`;
      case 'Intrinsic': {
        const args = node.arguments.map((arg) => this.gen(arg, env));
        return `IN(${JSON.stringify(node.name)}, ${this.at(node)}${args.map((arg) => `, ${arg}`).join('')})`;
      }
      case 'TemplateStrings':
        return `TS(${this.at(node)})`;
      // (Of classes: see codegen-statements.js.)
      case 'ClassExpression':
        return this.classExpression(node, env);
      case 'ThisExpression': {
        const self = this.variableOf('#this', env);
        if (!node.checked) return self;
        return `(${self} === undefined ? NT(${this.at(node)}) : ${self})`;
      }
      case 'SuperMember': {
        const { home, self, key } = this.superParts(node, env);
        return `Reflect.get(${home}, ${key}, ${self})`;
      }
      // (Private names: of the class whose id they have.)
      case 'PrivateMember':
        return `PG(${this.variableOf(`#p${node.classId}`, env)}, ${JSON.stringify(node.name)}, ${this.gen(node.object, env, chain)}, ${this.at(node)})`;
      case 'PrivateIn':
        return `PI(${this.variableOf(`#p${node.classId}`, env)}, ${JSON.stringify(node.name)}, ${this.gen(node.right, env)}, ${this.at(node)})`;
      case 'SuperCall': {
        const items = node.arguments.map((arg) => this.item(arg, env));
        return `(${this.variableOf('#this', env)} = SUP(${this.variableOf('#ctor', env)}, [${items.join(', ')}], ${this.at(node)}))`;
      }
      case 'Filter': {
        const args = [this.gen(node.expression, env), ...node.arguments.map((arg) => this.item(arg, env))];
        return `(0, FL[${JSON.stringify(node.name)}])(${args.join(', ')})`;
      }
      default:
        throw new Error(`Unexpected ${node.type}`);
    }
  }

  // a instanceof Type: a type named (of JavaScript, of the engine) as the closures resolve it, else the helper.
  instanceOf(node, env) {
    const left = this.gen(node.left, env);
    const { right } = node;
    const declared = env.some((frame) => frame.some((item) => item.name === right.name));
    if (
      right.type === 'Identifier' &&
      !declared &&
      !hasOwnProperty.call(this.compiler.bound, right.name) &&
      this.compiler.typeOf(right.name)
    ) {
      return `(${left} instanceof IT(${JSON.stringify(right.name)}))`;
    }
    return `IO(${left}, ${this.gen(right, env)}, ${this.at(right)})`;
  }

  item(node, env) {
    return node.type === 'SpreadElement' ? `...${this.gen(node.argument, env)}` : this.gen(node, env);
  }

  key(node, env) {
    if (!node.computed) return JSON.stringify(node.property);
    return `K(${this.gen(node.property, env)}, ${this.at(node.property)})`;
  }

  // The key of a member in a chain: a function when it is computed (but of a literal), run only when the object is
  // not null nor undefined (a?.[f()] does not call f when a is null, as in JavaScript).
  chainKey(node, env) {
    const key = this.key(node, env);
    return node.computed && node.property.type !== 'Literal' ? `() => ${key}` : key;
  }

  call(node, env, chain) {
    const items = node.arguments.map((arg) => this.item(arg, env));
    const args = `[${items.join(', ')}]`;
    const callArgs = items.map((item) => `, ${item}`).join('');
    const index = this.at(node);
    const { callee } = node;
    // super.method(...): the method of what the class extends, with this.
    if (callee.type === 'SuperMember') {
      const { home, self, key } = this.superParts(callee, env);
      return `SCL(${home}, ${key}, ${self}, ${args}, ${index})`;
    }
    // object.#method(...): with the object as this.
    if (callee.type === 'PrivateMember') {
      const privates = this.variableOf(`#p${callee.classId}`, env);
      return `PCL(${privates}, ${JSON.stringify(callee.name)}, ${this.gen(callee.object, env, chain)}, ${args}, ${index})`;
    }
    if (callee.type === 'MemberExpression') {
      const object = this.gen(callee.object, env, chain);
      // In a chain, the key and the arguments are evaluated only when the chain goes on.
      if (chain) {
        return `CMS(${object}, ${this.chainKey(callee, env)}, () => ${args}, ${index}, ${callee.optional}, ${node.optional})`;
      }
      const key = this.key(callee, env);
      // The method read here and called with its object (f.call: expressions cannot assign, so no call of a function
      // is replaced but by the application); null objects and what is not a function by the helpers.
      const t = this.temp();
      const f = this.temp();
      return (
        `((${t} = ${object}) === null || ${t} === undefined ? CN(${index}) : ` +
        `typeof (${f} = ${t}[${key}]) !== 'function' ? (${args}, NF(${index})) : ${f}.call(${t}${callArgs}))`
      );
    }
    const fn = this.gen(callee, env, chain);
    if (chain) return `CFS(${fn}, () => ${args}, ${index}, ${node.optional})`;
    return `CF(${fn}, ${args}, ${index})`;
  }

  // The helpers, as the closures of the compiler check and fail.
  helpers(options) {
    const { compiler, nodes, SHORT } = this;
    const { globals, filters, lenient, strict } = options;
    const RUNTIME = 'XUFA_EXPR_ERR_RUNTIME';
    const keyOf = (n) => compiler.keyOf(nodes[n]);
    const keys = new Map();
    const strings = [];
    const imports = [];
    return {
      id(ctx, name, n) {
        const value = ctx[name];
        if (value !== undefined || name in ctx) return value;
        if (hasOwnProperty.call(globals, name)) return globals[name];
        if (strict) throw compiler.error(`${name} is not defined`, nodes[n], RUNTIME);
        return undefined;
      },
      K(value, n) {
        if (typeof value === 'number' || typeof value === 'symbol') return value;
        let check = keys.get(n);
        if (!check) {
          check = keyOf(n);
          keys.set(n, check);
        }
        return check(value);
      },
      // A member of null or undefined: undefined (lenient) or the error.
      MN(n) {
        if (lenient) return undefined;
        throw compiler.nullMember(nodes[n]);
      },
      // A method of null or undefined.
      CN(n) {
        if (lenient) return undefined;
        throw compiler.nullMember(nodes[n].callee);
      },
      // What a let or const holds before its declaration runs (with tdz), and its error.
      U: UNSET,
      TDZ(n) {
        throw compiler.unset(nodes[n]);
      },
      // A call of what is not a function.
      NF(n) {
        if (lenient) return undefined;
        throw compiler.notFunction(nodes[n]);
      },
      RA: Reflect.apply,
      M(object, key, n) {
        if (object === null || object === undefined) {
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n]);
        }
        return object[key];
      },
      MS(object, key, n, optional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === undefined) {
          if (optional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n]);
        }
        return object[typeof key === 'function' ? key() : key];
      },
      CMS(object, key, args, n, memberOptional, callOptional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === undefined) {
          if (memberOptional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[typeof key === 'function' ? key() : key];
        if (callOptional && (fn === null || fn === undefined)) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = args();
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, values);
      },
      CF(fn, args, n) {
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, undefined, args);
      },
      CFS(fn, args, n, optional) {
        if (fn === SHORT) return SHORT;
        if (optional && (fn === null || fn === undefined)) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = args();
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, undefined, values);
      },
      C: (value) => (value === SHORT ? undefined : value),
      S: (value) => `${value}`,
      FL: filters || {},
      B: compiler.bound,
      RX: (pattern, flags) => new RegExp(pattern, flags),
      // Of programs: a member changed (its object checked), the limits, a name the program assigns without declaring
      // it (its value from the context, else the globals), the constructors of new.
      WR: (object, n) => compiler.writable(object, nodes[n]),
      LIM: (n) => compiler.limit(nodes[n]),
      DEEP: (n) => compiler.error(`Calls nested deeper than ${compiler.maxDepth}`, nodes[n], 'XUFA_EXPR_ERR_LIMIT'),
      LM: isLimit,
      IV(ctx, name) {
        const value = ctx[name];
        if (value !== undefined || name in ctx) return value;
        return hasOwnProperty.call(globals, name) ? globals[name] : undefined;
      },
      MX: compiler.maxSteps,
      MD: compiler.maxDepth,
      CO: compiler.constructors,
      // A step past maxSteps (of a call of an arrow function); the intrinsics; the texts of tagged templates (one
      // array of each, as JavaScript gives); the types of instanceof.
      THR(n) {
        throw compiler.limit(nodes[n]);
      },
      IN: (name, n, ...args) => compiler.intrinsics[name](nodes[n], ...args),
      TS(n) {
        strings[n] ??= templateStrings(nodes[n]);
        return strings[n];
      },
      IT: (name) => compiler.typeOf(name),
      // Of classes: made by the builder (classes.js); what they extend; super() and super.method(); new of them;
      // this before super(); objects with getters and setters.
      CL: (spec, n) => makeClass(compiler, spec, nodes[n]),
      HP(parent, extended, n) {
        const [home, homeStatic] = heritageOf(compiler, parent, nodes[n], extended);
        return [home, homeStatic, makePrivates(), parent];
      },
      SUP: (record, args, n) => superCall(compiler, record, args, nodes[n]),
      SCL(home, key, self, args, n) {
        const fn = Reflect.get(home, key, self);
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, self, args);
      },
      NW: (Class, args, n) => constructOf(compiler, Class, args, nodes[n]),
      // Of private names: read (SHORT goes on, in chains), set, in, ++ and --, calls; the private names of a class
      // made with it (HP gives them).
      // The value of a for await as an async iterable (the checks and errors of the closures).
      AI: (value, n) => asyncIterable(compiler, value, nodes[n]),
      // import: what the module exports (the loader made by the closures, its errors at the import).
      IMP(n) {
        imports[n] ??= compiler.importOf(nodes[n]);
        return imports[n]();
      },
      PG: (privates, name, object, n) =>
        object === SHORT ? SHORT : privateGet(compiler, privates, name, object, nodes[n]),
      PS: (privates, name, object, value, n) => privateSet(compiler, privates, name, object, value, nodes[n]),
      PI: (privates, name, object, n) => privateIn(compiler, privates, name, object, nodes[n]),
      PU: (privates, name, object, step, prefix, n) =>
        privateUpdate(compiler, privates, name, object, step, prefix, nodes[n]),
      PCL(privates, name, object, args, n) {
        if (object === SHORT) return SHORT;
        const fn = privateGet(compiler, privates, name, object, nodes[n].callee);
        if (fn === SHORT) return SHORT;
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args);
      },
      NT(n) {
        throw compiler.error('this is used before super()', nodes[n], 'XUFA_EXPR_ERR_RUNTIME');
      },
      OB(entries) {
        const result = {};
        for (const [kind, key, value] of entries) {
          if (kind === 3) {
            if (value !== null && value !== undefined) for (const k of Object.keys(value)) define(result, k, value[k]);
          } else if (kind === 0) define(result, key, value);
          else defineAccessor(result, key, kind === 1 ? 'get' : 'set', value);
        }
        return result;
      },
      IO(object, type, n) {
        if (compiler.isClass(type)) return object instanceof type;
        throw compiler.error(
          `${compiler.text(nodes[n])} is not a type instanceof takes`,
          nodes[n],
          'XUFA_EXPR_ERR_RUNTIME'
        );
      },
    };
  }
}

Object.assign(Generator.prototype, statementMethods);

const HELPERS = [
  'id',
  'K',
  'M',
  'MS',
  'MN',
  'CN',
  'NF',
  'RA',
  'U',
  'TDZ',
  'CMS',
  'CF',
  'CFS',
  'C',
  'S',
  'FL',
  'B',
  'RX',
  'WR',
  'LIM',
  'DEEP',
  'LM',
  'IV',
  'MX',
  'MD',
  'CO',
  'THR',
  'IN',
  'TS',
  'IT',
  'IO',
  'CL',
  'HP',
  'SUP',
  'SCL',
  'NW',
  'NT',
  'OB',
  'PG',
  'PS',
  'PI',
  'PU',
  'PCL',
  'AI',
  'IMP',
];

// The function of a tree as JavaScript; null when functions cannot be made (code generation off).
function generate(tree, compiler, options, SHORT) {
  const generator = new Generator(compiler, SHORT);
  const body = generator.gen(tree, []);
  const helpers = generator.helpers(options);
  const [temps] = generator.temps;
  // (Steps of the calls of its arrow functions: of each run.)
  const declare = `${generator.usesSteps ? 'let st = 0; ' : ''}${temps.length ? `let ${temps.join(', ')}; ` : ''}`;
  try {
    // eslint-disable-next-line no-new-func
    const make = new Function(
      ...HELPERS,
      'contextOf',
      `"use strict"; return function expression(context) { const ctx = typeof context === 'object' && context !== null ? context : contextOf(context); ${declare}return ${body}; };`
    );
    return make(...HELPERS.map((name) => helpers[name]), contextOf);
  } catch (err) {
    if (err instanceof ExpressionError) throw err;
    return null;
  }
}

// The function of a program as JavaScript (its statements those of JavaScript; see codegen-statements.js); null when
// functions cannot be made. Its steps and depth are variables of each run (st, dp), as the run of the closures.
function generateProgram(tree, compiler, options, SHORT) {
  const generator = new Generator(compiler, SHORT);
  let body;
  try {
    body = generator.programBody(tree);
  } catch (err) {
    if (err instanceof ExpressionError) throw err;
    return null;
  }
  const helpers = generator.helpers(options);
  const [temps] = generator.temps;
  const declare = temps.length ? `let ${temps.join(', ')}; ` : '';
  try {
    // eslint-disable-next-line no-new-func
    const make = new Function(
      ...HELPERS,
      'contextOf',
      `"use strict"; return ${tree.async ? 'async ' : ''}function program(context) { const ctx = typeof context === 'object' && context !== null ? context : contextOf(context); let st = 0, dp = 0, last; ${declare}${body} };`
    );
    return make(...HELPERS.map((name) => helpers[name]), contextOf);
  } catch (err) {
    if (err instanceof ExpressionError) throw err;
    return null;
  }
}

export { generate, generateProgram };
