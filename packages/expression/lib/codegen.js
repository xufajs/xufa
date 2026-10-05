// An expression as one function of JavaScript, for those run often (see compileTree): its arrow functions are arrow
// functions of JavaScript, its operators those of JavaScript, and what must be checked (names of the context, members,
// calls, keys, optional chains) goes through helpers that check as the closures do and fail with their errors.
//
// Nothing of the source is code there: strings and keys are JSON literals, numbers are written by String(), operators
// come from a fixed list, and the parameters of arrow functions have names made here (a0, a1...). The tree was
// compiled to closures first, so its names and keys are checked already.
const { ExpressionError } = require('./errors');

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
const LOGICAL = new Set(['&&', '||', '??']);
const UNARY = new Set(['!', '-', '+', '~', 'typeof']);
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
        return literal(node.value);
      case 'Identifier': {
        for (let depth = env.length - 1; depth >= 0; depth -= 1) {
          const param = env[depth].find((item) => item.name === node.name);
          if (param) return param.as;
        }
        if (node.name === 'undefined') return '(void 0)';
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
        return `[${node.elements.map((element) => this.item(element, env)).join(', ')}]`;
      case 'ObjectExpression': {
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
        const key = this.key(node, env);
        if (chain) return `MS(${object}, ${key}, ${this.at(node)}, ${node.optional})`;
        // The member read here; null and undefined by the helper (undefined, or the error).
        const t = this.temp();
        return `((${t} = ${object}) === null || ${t} === undefined ? MN(${this.at(node)}) : ${t}[${key}])`;
      }
      case 'CallExpression':
        return this.call(node, env, chain);
      case 'ChainExpression':
        return `C(${this.gen(node.expression, env, true)})`;
      case 'UnaryExpression':
        if (!UNARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${node.operator === 'typeof' ? 'typeof ' : node.operator}${this.gen(node.argument, env)})`;
      case 'BinaryExpression':
        if (!BINARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'LogicalExpression':
        if (!LOGICAL.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'ConditionalExpression':
        return `(${this.gen(node.test, env)} ? ${this.gen(node.consequent, env)} : ${this.gen(node.alternate, env)})`;
      case 'ArrowFunctionExpression': {
        const params = node.params.map((name) => {
          this.names += 1;
          return { name, as: `a${this.names}` };
        });
        this.temps.push([]);
        const body = this.gen(node.body, [...env, params]);
        const temps = this.temps.pop();
        const list = params.map((param) => param.as).join(', ');
        if (temps.length === 0) return `((${list}) => ${body})`;
        return `((${list}) => { let ${temps.join(', ')}; return ${body}; })`;
      }
      case 'Filter': {
        const args = [this.gen(node.expression, env), ...node.arguments.map((arg) => this.item(arg, env))];
        return `(0, FL[${JSON.stringify(node.name)}])(${args.join(', ')})`;
      }
      default:
        throw new Error(`Unexpected ${node.type}`);
    }
  }

  item(node, env) {
    return node.type === 'SpreadElement' ? `...${this.gen(node.argument, env)}` : this.gen(node, env);
  }

  key(node, env) {
    if (!node.computed) return JSON.stringify(node.property);
    return `K(${this.gen(node.property, env)}, ${this.at(node.property)})`;
  }

  call(node, env, chain) {
    const items = node.arguments.map((arg) => this.item(arg, env));
    const args = `[${items.join(', ')}]`;
    const callArgs = items.map((item) => `, ${item}`).join('');
    const index = this.at(node);
    const { callee } = node;
    if (callee.type === 'MemberExpression') {
      const object = this.gen(callee.object, env, chain);
      const key = this.key(callee, env);
      // In a chain, the arguments are evaluated only when the chain goes on.
      if (chain) return `CMS(${object}, ${key}, () => ${args}, ${index}, ${callee.optional}, ${node.optional})`;
      // The method read here and called with its object (f.call: expressions cannot assign, so no call of a function
      // is replaced but by the application); null objects and what is not a function by the helpers.
      const t = this.temp();
      const f = this.temp();
      return (
        `((${t} = ${object}) === null || ${t} === undefined ? CN(${index}) : ` +
        `typeof (${f} = ${t}[${key}]) !== 'function' ? NF(${index}) : ${f}.call(${t}${callArgs}))`
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
        return object[key];
      },
      CM(object, key, args, n) {
        if (object === null || object === undefined) {
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args);
      },
      CMS(object, key, args, n, memberOptional, callOptional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === undefined) {
          if (memberOptional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== 'function') {
          if (callOptional && (fn === null || fn === undefined)) return SHORT;
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args());
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
        if (typeof fn !== 'function') {
          if (optional && (fn === null || fn === undefined)) return SHORT;
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, undefined, args());
      },
      C: (value) => (value === SHORT ? undefined : value),
      S: (value) => `${value}`,
      FL: filters || {},
    };
  }
}

const HELPERS = ['id', 'K', 'M', 'MS', 'MN', 'CN', 'NF', 'RA', 'CM', 'CMS', 'CF', 'CFS', 'C', 'S', 'FL'];

// The function of a tree as JavaScript; null when functions cannot be made (code generation off).
function generate(tree, compiler, options, SHORT) {
  const generator = new Generator(compiler, SHORT);
  const body = generator.gen(tree, []);
  const helpers = generator.helpers(options);
  const [temps] = generator.temps;
  const declare = temps.length ? `let ${temps.join(', ')}; ` : '';
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

module.exports = { generate };
