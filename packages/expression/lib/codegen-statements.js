// A program as one function of JavaScript (see generate in codegen.js): its statements those of JavaScript, its names
// variables of JavaScript (v1, v2... made here, in the same frames the closures make: blocks, loops, functions,
// catch), declared at the start of their block (so a name read before its declaration is undefined, as in the
// closures). What must be checked goes through helpers that check as the closures do and fail with their errors:
// members changed (WR: only plain objects and arrays the globals do not reach), steps of loops and calls (past
// maxSteps, LIM), calls nested too deep, limits that no catch stops (LM), new of the constructors of the engine (CO).
//
// The tree was compiled to closures first: its names are declared, its keys, breaks and constructors checked.
import { declaredNames, implicitNames } from './statements.js';

const ASSIGNMENTS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
]);

// Whether a declaration of a loop reads one of its own names (in its values, or in functions made there).
function mentions(node, frame) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => mentions(item, frame));
  if (node.type === 'Identifier' && frame.some((item) => item.name === node.name)) return true;
  return Object.keys(node).some((key) => key !== 'type' && typeof node[key] === 'object' && mentions(node[key], frame));
}

const statementMethods = {
  variable() {
    this.names += 1;
    return `v${this.names}`;
  },

  // A frame of names: each with the variable of JavaScript it is (with tdz, its let and const: `unset`, they start as
  // U and are checked where they are used, as the closures check theirs).
  frameOf(names, lexical = names.lexical) {
    const { tdz } = this.compiler;
    return names.map((name) => ({ name, as: this.variable(), unset: tdz && Boolean(lexical?.has(name)) }));
  },

  // The declaration of the variables of a frame.
  declare(frame) {
    return frame.map((item) => (item.unset ? `${item.as} = U` : item.as)).join(', ');
  },

  // The entry of a name of the frames around (the innermost that has it).
  entryOf(name, env) {
    for (let depth = env.length - 1; depth >= 0; depth -= 1) {
      const entry = env[depth].find((item) => item.name === name);
      if (entry) return entry;
    }
    throw new Error(`${name} is not declared here`);
  },

  // The variable of a name of the frames around.
  variableOf(name, env) {
    return this.entryOf(name, env).as;
  },

  // A name read: its variable, checked when it can be used before its declaration.
  readOf(entry, node) {
    return entry.unset ? `(${entry.as} === U ? TDZ(${this.at(node)}) : ${entry.as})` : entry.as;
  },

  // The label of JavaScript of a label of the program (the innermost so named).
  labelOf(name) {
    for (let i = this.labelNames.length - 1; i >= 0; i -= 1)
      if (this.labelNames[i].name === name) return this.labelNames[i].as;
    throw new Error(`No label ${name}`);
  },

  // A check of the steps of a loop turn or a call.
  step(node) {
    return `if (++st > MX) throw LIM(${this.at(node)});`;
  },

  // The body of a program: its names (and those it assigns without declaring them, from the context), its statements,
  // the value of its last expression statement.
  programBody(tree) {
    this.inFunction = 0;
    this.inProgram = true;
    const scanned = implicitNames(tree);
    const declared = declaredNames(tree.body, true);
    const implicit = scanned.filter((name) => !declared.includes(name));
    const frame = this.frameOf([...declared, ...implicit], declared.lexical);
    const env = [frame];
    const body = this.list(tree.body, env);
    const inits = implicit.map((name) => `${this.variableOf(name, env)} = IV(ctx, ${JSON.stringify(name)});`);
    const names = frame.length ? `let ${this.declare(frame)}; ` : '';
    return `${names}${inits.join(' ')} ${body} return last;`;
  },

  // The statements of a block, the functions it declares made first.
  list(nodes, env) {
    const hoisted = nodes
      .filter((node) => node.type === 'FunctionDeclaration')
      .map((node) => `${this.variableOf(node.id, env)} = ${this.fn(node, env)};`);
    const rest = nodes.filter((node) => node.type !== 'FunctionDeclaration').map((node) => this.statement(node, env));
    return [...hoisted, ...rest].join(' ');
  },

  // A block: its names declared at its start (a binding of each run of it, as the frame of the closures).
  block(nodes, env, functionLevel = false) {
    const names = declaredNames(nodes, functionLevel);
    if (names.length === 0) return `{ ${this.list(nodes, env)} }`;
    const frame = this.frameOf(names);
    return `{ let ${this.declare(frame)}; ${this.list(nodes, [...env, frame])} }`;
  },

  // A function (a declaration, a function expression, an arrow function with a body of statements): its steps and
  // depth counted as the closures count them.
  fn(node, env) {
    // (A method: a function of JavaScript, its this first in its frame, #this.)
    const { method } = node;
    const params = this.frameOf([...(method ? ['#this'] : []), ...node.params, ...(node.rest ? [node.rest] : [])]);
    const savedLabels = this.labelNames;
    this.labelNames = [];
    this.inFunction += 1;
    this.temps.push([]);
    const inner = [...env, params];
    const body =
      node.body.type === 'BlockStatement'
        ? this.block(node.body.body, inner, true)
        : `return ${this.gen(node.body, inner)};`;
    const temps = this.temps.pop();
    this.inFunction -= 1;
    this.labelNames = savedLabels;
    const n = this.at(node);
    const declare = temps.length ? `let ${temps.join(', ')}; ` : '';
    const named = method ? params.slice(1) : params;
    const list = named.map((item, i) => (node.rest && i === named.length - 1 ? `...${item.as}` : item.as));
    const self = method ? `let ${params[0].as} = this; ` : '';
    const prefix = node.async ? 'async ' : '';
    // (Generators: function* of JavaScript; a function of a program has no this of its own to keep.)
    const head =
      method || node.generator
        ? `(${prefix}function${node.generator ? '*' : ''} (${list.join(', ')}) {`
        : `(${prefix}(${list.join(', ')}) => {`;
    // (async and generators: their depth not counted, as they leave the stack; the same as the closures.)
    if (node.async || node.generator) return `${head} ${this.step(node)} ${self}${declare}${body} })`;
    return (
      `${head} ${this.step(node)} ` +
      `if (++dp > MD) { dp = 0; throw DEEP(${n}); } ` +
      `try { ${self}${declare}${body} } finally { if (dp > 0) dp -= 1; } })`
    );
  },

  // The assignments of a declaration (var without a value: none), as an expression.
  assignments(node, env) {
    return node.declarations
      .filter((declarator) => declarator.init || node.kind !== 'var')
      .map(
        (declarator) =>
          `${this.variableOf(declarator.id, env)} = ${declarator.init ? this.gen(declarator.init, env) : '(void 0)'}`
      );
  },

  statement(node, env) {
    switch (node.type) {
      case 'EmptyStatement':
      case 'FunctionDeclaration':
        return '';
      case 'ExpressionStatement': {
        const expression = this.gen(node.expression, env);
        return this.inFunction ? `${expression};` : `last = ${expression};`;
      }
      case 'BlockStatement':
        return this.block(node.body, env);
      case 'VariableDeclaration': {
        const parts = this.assignments(node, env);
        return parts.length ? `${parts.join(', ')};` : '';
      }
      case 'IfStatement': {
        const alternate = node.alternate ? ` else { ${this.statement(node.alternate, env)} }` : '';
        return `if (${this.gen(node.test, env)}) { ${this.statement(node.consequent, env)} }${alternate}`;
      }
      case 'ForStatement':
        return this.forLoop(node, env);
      case 'ForOfStatement': {
        const { left } = node;
        const right = this.gen(node.right, env);
        const declares = left.type === 'VariableDeclaration' && left.kind !== 'var';
        // (for await: of JavaScript, of the iterator AI gives: async, or of a value's iterator.)
        const keyword = node.await ? 'for await' : 'for';
        const source = node.await ? `AI(${right}, ${this.at(node.right)})` : right;
        if (declares) {
          const frame = this.frameOf([left.declarations[0].id]);
          const body = this.statement(node.body, [...env, frame]);
          return `${keyword} (let ${frame[0].as} of ${source}) { ${this.step(node)} ${body} }`;
        }
        const name = left.type === 'Identifier' ? left.name : left.declarations[0].id;
        const entry = this.entryOf(name, env);
        // (A let of the program not declared yet, with tdz: assigned after the step, checked, as the closures do.)
        if (entry.unset) {
          const value = this.variable();
          return (
            `${keyword} (const ${value} of ${source}) { ${this.step(node)} if (${entry.as} === U) throw TDZ(${this.at(left)}); ` +
            `${entry.as} = ${value}; ${this.statement(node.body, env)} }`
          );
        }
        return `${keyword} (${entry.as} of ${source}) { ${this.step(node)} ${this.statement(node.body, env)} }`;
      }
      case 'WhileStatement':
        return `while (${this.gen(node.test, env)}) { ${this.step(node)} ${this.statement(node.body, env)} }`;
      case 'DoWhileStatement':
        return `do { ${this.step(node)} ${this.statement(node.body, env)} } while (${this.gen(node.test, env)});`;
      case 'ReturnStatement':
        return node.argument ? `return ${this.gen(node.argument, env)};` : 'return;';
      case 'BreakStatement':
        return node.label ? `break ${this.labelOf(node.label)};` : 'break;';
      case 'ContinueStatement':
        return node.label ? `continue ${this.labelOf(node.label)};` : 'continue;';
      case 'LabeledStatement': {
        // (Labels of JavaScript made here: L1, L2...)
        const added = [];
        let body = node;
        while (body.type === 'LabeledStatement') {
          this.names += 1;
          added.push({ name: body.label, as: `L${this.names}` });
          body = body.body;
        }
        this.labelNames.push(...added);
        const code = `${added.map((item) => `${item.as}: `).join('')}${this.statement(body, env)}`;
        this.labelNames.length -= added.length;
        return code;
      }
      case 'ThrowStatement':
        return `throw ${this.gen(node.argument, env)};`;
      case 'TryStatement':
        return this.tryStatement(node, env);
      case 'SwitchStatement':
        return this.switchStatement(node, env);
      default:
        throw new Error(`Unexpected ${node.type}`);
    }
  },

  forLoop(node, env) {
    const { init } = node;
    const declares = init?.type === 'VariableDeclaration' && init.kind !== 'var';
    // (let and const of the loop: those of JavaScript, a binding of each turn.)
    const frame = declares ? this.frameOf(declaredNames([init], false)) : null;
    const inner = declares ? [...env, frame] : env;
    let start = '';
    // (Names of the loop read in its own head, before they are declared: declared first, as the closures do,
    // undefined or with tdz U; else let of JavaScript would throw its own error.)
    if (declares && (frame.some((item) => item.unset) || mentions(init, frame))) {
      start = `let ${this.declare(frame)}, ${this.variable()} = (${this.assignments(init, inner).join(', ')}, 0)`;
    } else if (declares) start = `let ${this.assignments(init, inner).join(', ')}`;
    else if (init?.type === 'VariableDeclaration') start = this.assignments(init, inner).join(', ');
    else if (init) start = this.gen(init, inner);
    const test = node.test ? this.gen(node.test, inner) : '';
    const update = node.update ? this.gen(node.update, inner) : '';
    return `for (${start}; ${test}; ${update}) { ${this.step(node)} ${this.statement(node.body, inner)} }`;
  },

  tryStatement(node, env) {
    let code = `try ${this.block(node.block.body, env)}`;
    if (node.handler) {
      const { param } = node.handler;
      // (The limit of steps goes through every catch.)
      if (param) {
        const frame = this.frameOf([param]);
        const caught = frame[0].as;
        code += ` catch (${caught}) { if (LM(${caught})) throw ${caught}; ${this.block(node.handler.body.body, [...env, frame])} }`;
      } else {
        const caught = this.variable();
        code += ` catch (${caught}) { if (LM(${caught})) throw ${caught}; ${this.block(node.handler.body.body, env)} }`;
      }
    }
    if (node.finalizer) code += ` finally ${this.block(node.finalizer.body, env)}`;
    return code;
  },

  switchStatement(node, env) {
    const discriminant = this.gen(node.discriminant, env);
    const names = declaredNames(
      node.cases.flatMap((item) => item.consequent),
      false
    );
    const frame = this.frameOf(names);
    const inner = frame.length ? [...env, frame] : env;
    const cases = node.cases.map(
      (item) => `${item.test ? `case ${this.gen(item.test, inner)}:` : 'default:'} ${this.list(item.consequent, inner)}`
    );
    const declare = frame.length ? `let ${this.declare(frame)}; ` : '';
    return `{ ${declare}switch (${discriminant}) { ${cases.join(' ')} } }`;
  },

  // a = b, a += b, a.b = c, a[b] ??= c...: of a name, its variable; of a member, its object checked (WR) before the
  // key and the value are read, as the closures do.
  assignment(node, env) {
    const { operator, left } = node;
    if (!ASSIGNMENTS.has(operator)) throw new Error(`Unexpected operator ${operator}`);
    if (left.type === 'Identifier') {
      const entry = this.entryOf(left.name, env);
      const value = this.gen(node.right, env);
      if (!entry.unset) return `(${entry.as} ${operator} ${value})`;
      // (With tdz: =, its value first and then the check; the others read it first, as the closures do.)
      const check = `${entry.as} === U ? TDZ(${this.at(left)})`;
      if (operator !== '=') return `(${check} : (${entry.as} ${operator} ${value}))`;
      const t = this.temp();
      return `(${t} = ${value}, ${check} : (${entry.as} = ${t}))`;
    }
    if (left.type === 'PrivateMember') return this.privateAssignment(node, env);
    const { setup, member } = this.writableMember(left, env);
    return `(${setup}, ${member} ${operator} ${this.gen(node.right, env)})`;
  },

  // A member changed: setup (its object read and checked, then its key, into temporaries: the order of the closures)
  // and the member of those temporaries.
  writableMember(node, env) {
    if (node.type !== 'MemberExpression') throw new Error(`Unexpected ${node.type}`);
    const object = this.temp();
    const setup = [`${object} = WR(${this.gen(node.object, env)}, ${this.at(node)})`];
    if (!node.computed) return { setup: setup.join(', '), member: `${object}[${JSON.stringify(node.property)}]` };
    const key = this.temp();
    setup.push(`${key} = ${this.key(node, env)}`);
    return { setup: setup.join(', '), member: `${object}[${key}]` };
  },

  // object.#name = value, += value, ??= value: the object read first, then the member, then the value.
  privateAssignment(node, env) {
    const { operator, left } = node;
    const privates = this.variableOf(`#p${left.classId}`, env);
    const name = JSON.stringify(left.name);
    const n = this.at(left);
    const object = this.temp();
    const setup = `${object} = ${this.gen(left.object, env)}`;
    const right = this.gen(node.right, env);
    if (operator === '=') return `(${setup}, PS(${privates}, ${name}, ${object}, ${right}, ${n}))`;
    const current = this.temp();
    const read = `${current} = PG(${privates}, ${name}, ${object}, ${n})`;
    const set = (value) => `PS(${privates}, ${name}, ${object}, ${value}, ${n})`;
    if (operator === '&&=') return `(${setup}, (${read}) ? ${set(right)} : ${current})`;
    if (operator === '||=') return `(${setup}, (${read}) ? ${current} : ${set(right)})`;
    if (operator === '??=') {
      return `(${setup}, ${read}, ${current} !== null && ${current} !== undefined ? ${current} : ${set(right)})`;
    }
    return `(${setup}, ${read}, ${set(`${current} ${operator.slice(0, -1)} ${right}`)})`;
  },

  update(node, env) {
    const { argument, prefix } = node;
    const operator = node.operator === '++' ? '++' : '--';
    if (argument.type === 'PrivateMember') {
      const privates = this.variableOf(`#p${argument.classId}`, env);
      const step = operator === '++' ? 1 : -1;
      return `PU(${privates}, ${JSON.stringify(argument.name)}, ${this.gen(argument.object, env)}, ${step}, ${Boolean(prefix)}, ${this.at(argument)})`;
    }
    if (argument.type === 'Identifier') {
      const entry = this.entryOf(argument.name, env);
      const name = entry.as;
      const update = prefix ? `(${operator}${name})` : `(${name}${operator})`;
      return entry.unset ? `(${name} === U ? TDZ(${this.at(argument)}) : ${update})` : update;
    }
    const { setup, member } = this.writableMember(argument, env);
    return prefix ? `(${setup}, ${operator}${member})` : `(${setup}, ${member}${operator})`;
  },

  remove(node, env) {
    const { setup, member } = this.writableMember(node.argument, env);
    return `(${setup}, delete ${member})`;
  },

  // new Name(...): a class of the program (a name of it), else a constructor of the engine, as the closures resolve it.
  construct(node, env) {
    const items = node.arguments.map((arg) => this.item(arg, env));
    const declared = env.some((frame) => frame.some((item) => item.name === node.callee));
    if (declared) {
      const callee = { type: 'Identifier', name: node.callee, start: node.start, end: node.end };
      return `NW(${this.readOf(this.entryOf(node.callee, env), callee)}, [${items.join(', ')}], ${this.at(node)})`;
    }
    return `(new CO[${JSON.stringify(node.callee)}](${items.join(', ')}))`;
  },

  // super.name, super[key]: [#home (or #homeStatic), the key, #this].
  superParts(node, env) {
    const home = this.variableOf(node.static ? '#homeStatic' : '#home', env);
    const self = this.variableOf('#this', env);
    const key = node.computed
      ? `K(${this.gen(node.property, env)}, ${this.at(node.property)})`
      : JSON.stringify(node.property);
    return { home, self, key };
  },

  // class Name extends Base {...}: an arrow function of #home and #homeStatic (and what it extends) called with what
  // HP gives, that makes the class by the builder (CL), its members functions of JavaScript.
  classExpression(node, env) {
    const extended = Boolean(node.superClass);
    // (extends Error, Map...: by their names, as the closures resolve them.)
    const { superClass } = node;
    const named =
      extended &&
      superClass.type === 'Identifier' &&
      !env.some((frame) => frame.some((item) => item.name === superClass.name)) &&
      !Object.prototype.hasOwnProperty.call(this.compiler.bound, superClass.name) &&
      this.compiler.typeOf(superClass.name);
    const parent = !extended
      ? 'undefined'
      : named
        ? `IT(${JSON.stringify(superClass.name)})`
        : this.gen(superClass, env);
    const frame = this.frameOf(['#home', '#homeStatic', `#p${node.privateId}`, ...(node.id ? [node.id] : [])]);
    const parentName = this.variable();
    const inner = [...env, frame];
    const constructorOf = node.body.find((element) => element.kind === 'constructor');
    const ctor = constructorOf ? this.fn(constructorOf.value, inner) : 'null';
    const elements = node.body
      .filter((element) => element.kind !== 'constructor')
      .map((element) => {
        const key = element.computed
          ? `K(${this.gen(element.key, inner)}, ${this.at(element.key)})`
          : JSON.stringify(element.key);
        const fn = element.value ? this.fn(element.value, inner) : 'null';
        return `{ kind: ${JSON.stringify(element.kind)}, static: ${Boolean(element.static)}, private: ${Boolean(element.private)}, key: ${key}, fn: ${fn} }`;
      });
    const spec =
      `{ name: ${JSON.stringify(node.id ?? null)}, parent: ${parentName}, derived: ${extended}, privates: ${frame[2].as}, ` +
      `bind: ${node.id ? `(c) => { ${frame[3].as} = c; }` : 'null'}, ctor: ${ctor}, ` +
      `elements: [${elements.join(', ')}] }`;
    const at = this.at(node.superClass ?? node);
    return `((${frame[0].as}, ${frame[1].as}, ${frame[2].as}, ${parentName}${node.id ? `, ${frame[3].as}` : ''}) => CL(${spec}, ${this.at(node)}))(...HP(${parent}, ${extended}, ${at}))`;
  },
};

export { statementMethods };
