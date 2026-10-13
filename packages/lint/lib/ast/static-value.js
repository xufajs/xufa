// The value of an expression, when it can be known without running the program: `{ value }` (with `optional: true`
// when an optional chain stopped at null or undefined), or null. Known are literals, operators on known values,
// templates, arrays and objects of known values, variables that are constant (const, or written only by their
// declaration) whose objects are not mutated, the builtin globals (Math, String, JSON...), their properties (getters
// only of Map, Set and RegExp), and calls of the builtin functions that have no side effects. Rules ask it of
// patterns and flags given to RegExp(), of the updates of for loops...

// The builtin globals a reference may stand for (when nothing declares their name).
const BUILTIN_NAMES = new Set([
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'Float32Array',
  'Float64Array',
  'Function',
  'Infinity',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'isFinite',
  'isNaN',
  'isPrototypeOf',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'parseFloat',
  'parseInt',
  'Promise',
  'Proxy',
  'Reflect',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'undefined',
  'unescape',
  'WeakMap',
  'WeakSet',
]);

const methods = (type, names) => names.map((name) => type.prototype[name]);

// The builtin functions that may be called: they have no side effects (Math.random, which is not pure, is out).
const CALLABLE = new Set(
  [
    Array.isArray,
    Array.of,
    ...methods(Array, ['at', 'concat', 'entries', 'every', 'filter', 'find', 'findIndex', 'flat', 'includes']),
    ...methods(Array, ['indexOf', 'join', 'keys', 'lastIndexOf', 'slice', 'some', 'toString', 'values']),
    typeof BigInt === 'function' ? BigInt : undefined,
    Boolean,
    Date,
    Date.parse,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
    escape,
    isFinite,
    isNaN,
    // eslint-disable-next-line no-undef -- a global of the engine: what `isPrototypeOf` names, Object.prototype's
    isPrototypeOf,
    Map,
    ...methods(Map, ['entries', 'get', 'has', 'keys', 'values']),
    ...Object.getOwnPropertyNames(Math)
      .filter((name) => name !== 'random')
      .map((name) => Math[name])
      .filter((value) => typeof value === 'function'),
    Number,
    Number.isFinite,
    Number.isNaN,
    Number.parseFloat,
    Number.parseInt,
    ...methods(Number, ['toExponential', 'toFixed', 'toPrecision', 'toString']),
    Object,
    Object.entries,
    Object.is,
    Object.isExtensible,
    Object.isFrozen,
    Object.isSealed,
    Object.keys,
    Object.values,
    parseFloat,
    parseInt,
    RegExp,
    Set,
    ...methods(Set, ['entries', 'has', 'keys', 'values']),
    String,
    String.fromCharCode,
    String.fromCodePoint,
    String.raw,
    ...methods(String, ['at', 'charAt', 'charCodeAt', 'codePointAt', 'concat', 'endsWith', 'includes', 'indexOf']),
    ...methods(String, ['lastIndexOf', 'normalize', 'padEnd', 'padStart', 'slice', 'startsWith', 'substr']),
    ...methods(String, ['substring', 'toLowerCase', 'toString', 'toUpperCase', 'trim', 'trimEnd', 'trimLeft']),
    ...methods(String, ['trimRight', 'trimStart']),
    Symbol.for,
    Symbol.keyFor,
    unescape,
  ].filter((value) => typeof value === 'function')
);

// Functions that return their argument (as they would make it frozen, sealed...: its value does not change).
const PASS_THROUGH = new Set([Object.freeze, Object.preventExtensions, Object.seal]);

// Getters that may be read: they have no side effects.
const READABLE_GETTERS = [
  [Map, new Set(['size'])],
  [
    RegExp,
    new Set(['dotAll', 'flags', 'global', 'hasIndices', 'ignoreCase', 'multiline', 'source', 'sticky', 'unicode']),
  ],
  [Set, new Set(['size'])],
];

// Array methods that change the array.
const MUTATING_METHODS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

// The innermost scope around a node.
function innermostScope(initialScope, node) {
  const location = node.range[0];
  let scope = initialScope;
  let found;
  do {
    found = false;
    for (const child of scope.childScopes) {
      const [start, end] = child.block.range;
      if (start <= location && location < end) {
        scope = child;
        found = true;
        break;
      }
    }
  } while (found);
  return scope;
}

/** The variable of a name (or of an identifier, from its innermost scope), from a scope out; or null. */
function findVariable(initialScope, nameOrNode) {
  let name;
  let scope = initialScope;
  if (typeof nameOrNode === 'string') {
    name = nameOrNode;
  } else {
    name = nameOrNode.name;
    scope = innermostScope(scope, nameOrNode);
  }
  for (; scope != null; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable != null) return variable;
  }
  return null;
}

function hasGetter(object, name) {
  for (let current = object; (typeof current === 'object' || typeof current === 'function') && current !== null;) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor.get != null;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

const isBuiltinGlobal = (variable) =>
  variable != null && variable.defs.length === 0 && BUILTIN_NAMES.has(variable.name) && variable.name in globalThis;

// Declared once by a const declaration, or by one written only by its declaration.
function isConstant(variable) {
  if (variable.defs.length !== 1) return false;
  const [def] = variable.defs;
  if (!def.parent || def.type !== 'Variable') return false;
  if (def.parent.kind === 'const') return true;
  const { references } = variable;
  const inits = references.filter((ref) => ref.init).length;
  const reads = references.filter((ref) => ref.isReadOnly()).length;
  return inits === 1 && reads + inits === references.length;
}

// Whether a property of the variable's value is written, or it is changed by an array's method.
function isMutated(variable, initialScope) {
  for (const ref of variable.references) {
    let node = ref.identifier;
    while (node?.parent?.type === 'MemberExpression') node = node.parent;
    if (!node?.parent) continue;
    const { parent } = node;
    if (
      (parent.type === 'AssignmentExpression' && parent.left === node) ||
      (parent.type === 'UpdateExpression' && parent.argument === node)
    ) {
      return true;
    }
    if (parent.type === 'CallExpression' && parent.callee === node && node.type === 'MemberExpression') {
      const method = propertyNameValue(node, initialScope);
      if (method?.value != null && MUTATING_METHODS.has(method.value)) return true;
    }
  }
  return false;
}

// The values of a list of nodes (elements, arguments: holes kept, spreads spread), or null if one is not known.
function valuesOf(nodes, initialScope) {
  const values = [];
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i];
    if (node == null) {
      values.length = i + 1;
    } else if (node.type === 'SpreadElement') {
      const argument = evaluate(node.argument, initialScope);
      if (argument == null) return null;
      values.push(...argument.value);
    } else {
      const element = evaluate(node, initialScope);
      if (element == null) return null;
      values.push(element.value);
    }
  }
  return values;
}

// The name of a member's property or a property's key, as a value.
function propertyNameValue(node, initialScope) {
  const nameNode = node.type === 'Property' ? node.key : node.property;
  if (node.computed) return evaluate(nameNode, initialScope);
  if (nameNode.type === 'Identifier') return { value: nameNode.name };
  if (nameNode.type === 'Literal') return { value: nameNode.bigint ? nameNode.bigint : String(nameNode.value) };
  return null;
}

const BINARY = {
  // eslint-disable-next-line eqeqeq -- the operator itself
  '==': (a, b) => a == b,
  // eslint-disable-next-line eqeqeq -- the operator itself
  '!=': (a, b) => a != b,
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
  '&': (a, b) => a & b,
};

const UNARY = {
  '-': (a) => -a,
  '+': (a) => +a,
  '!': (a) => !a,
  '~': (a) => ~a,
  typeof: (a) => typeof a,
};

// The value of a call of a known function with known arguments.
function callOf(func, receiver, args) {
  if (CALLABLE.has(func)) return { value: receiver === undefined ? func(...args) : func.apply(receiver, args) };
  if (PASS_THROUGH.has(func)) return { value: args[0] };
  return null;
}

const EVALUATORS = {
  ArrayExpression(node, scope) {
    const elements = valuesOf(node.elements, scope);
    return elements != null ? { value: elements } : null;
  },

  AssignmentExpression(node, scope) {
    return node.operator === '=' ? evaluate(node.right, scope) : null;
  },

  BinaryExpression(node, scope) {
    if (node.operator === 'in' || node.operator === 'instanceof') return null;
    const left = evaluate(node.left, scope);
    const right = evaluate(node.right, scope);
    const operate = BINARY[node.operator];
    return left != null && right != null && operate ? { value: operate(left.value, right.value) } : null;
  },

  CallExpression(node, scope) {
    const callee = node.callee;
    const args = valuesOf(node.arguments, scope);
    if (args == null) return null;
    if (callee.type === 'MemberExpression') {
      if (callee.property.type === 'PrivateIdentifier') return null;
      const object = evaluate(callee.object, scope);
      if (object == null) return null;
      if (object.value == null && (object.optional || node.optional)) return { value: undefined, optional: true };
      const property = propertyNameValue(callee, scope);
      if (property == null) return null;
      const receiver = object.value;
      const method = receiver[property.value];
      return callOf(method, receiver, args);
    }
    const called = evaluate(callee, scope);
    if (called == null) return null;
    if (called.value == null && node.optional) return { value: undefined, optional: true };
    return callOf(called.value, undefined, args);
  },

  ConditionalExpression(node, scope) {
    const test = evaluate(node.test, scope);
    if (test == null) return null;
    return evaluate(test.value ? node.consequent : node.alternate, scope);
  },

  ExpressionStatement(node, scope) {
    return evaluate(node.expression, scope);
  },

  Identifier(node, scope) {
    if (scope == null) return null;
    const variable = findVariable(scope, node);
    if (variable == null) return null;
    if (isBuiltinGlobal(variable)) return { value: globalThis[variable.name] };
    if (!isConstant(variable)) return null;
    const [def] = variable.defs;
    if (def.node.id.type !== 'Identifier') return null;
    const init = evaluate(def.node.init, scope);
    if (init && typeof init.value === 'object' && init.value !== null && isMutated(variable, scope)) return null;
    return init;
  },

  Literal(node) {
    // A regular expression or a bigint the engine cannot make.
    if ((node.regex != null || node.bigint != null) && node.value == null) return null;
    return { value: node.value };
  },

  LogicalExpression(node, scope) {
    const left = evaluate(node.left, scope);
    if (left == null) return null;
    if (
      (node.operator === '||' && Boolean(left.value)) ||
      (node.operator === '&&' && !left.value) ||
      (node.operator === '??' && left.value != null)
    ) {
      return left;
    }
    return evaluate(node.right, scope);
  },

  MemberExpression(node, scope) {
    if (node.property.type === 'PrivateIdentifier') return null;
    const object = evaluate(node.object, scope);
    if (object == null) return null;
    if (object.value == null && (object.optional || node.optional)) return { value: undefined, optional: true };
    const property = propertyNameValue(node, scope);
    if (property == null) return null;
    if (!hasGetter(object.value, property.value)) return { value: object.value[property.value] };
    for (const [type, getters] of READABLE_GETTERS) {
      if (object.value instanceof type && getters.has(property.value)) return { value: object.value[property.value] };
    }
    return null;
  },

  ChainExpression(node, scope) {
    const expression = evaluate(node.expression, scope);
    return expression != null ? { value: expression.value } : null;
  },

  NewExpression(node, scope) {
    const callee = evaluate(node.callee, scope);
    const args = valuesOf(node.arguments, scope);
    if (callee == null || args == null || !CALLABLE.has(callee.value)) return null;
    const Type = callee.value;
    return { value: new Type(...args) };
  },

  ObjectExpression(node, scope) {
    const object = {};
    for (const property of node.properties) {
      if (property.type === 'Property') {
        if (property.kind !== 'init') return null;
        const key = propertyNameValue(property, scope);
        const value = evaluate(property.value, scope);
        if (key == null || value == null) return null;
        object[key.value] = value.value;
      } else if (property.type === 'SpreadElement') {
        const argument = evaluate(property.argument, scope);
        if (argument == null) return null;
        Object.assign(object, argument.value);
      } else {
        return null;
      }
    }
    return { value: object };
  },

  SequenceExpression(node, scope) {
    return evaluate(node.expressions.at(-1), scope);
  },

  // Only String.raw`...`.
  TaggedTemplateExpression(node, scope) {
    const tag = evaluate(node.tag, scope);
    const expressions = valuesOf(node.quasi.expressions, scope);
    if (tag == null || expressions == null || tag.value !== String.raw) return null;
    const strings = node.quasi.quasis.map((quasi) => quasi.value.cooked);
    strings.raw = node.quasi.quasis.map((quasi) => quasi.value.raw);
    return { value: String.raw(strings, ...expressions) };
  },

  TemplateLiteral(node, scope) {
    const expressions = valuesOf(node.expressions, scope);
    if (expressions == null) return null;
    let value = node.quasis[0].value.cooked;
    for (let i = 0; i < expressions.length; ++i) value += expressions[i] + node.quasis[i + 1].value.cooked;
    return { value };
  },

  UnaryExpression(node, scope) {
    if (node.operator === 'delete') return null;
    if (node.operator === 'void') return { value: undefined };
    const argument = evaluate(node.argument, scope);
    const operate = UNARY[node.operator];
    return argument != null && operate ? { value: operate(argument.value) } : null;
  },
};

function evaluate(node, scope) {
  return node != null && Object.hasOwn(EVALUATORS, node.type) ? EVALUATORS[node.type](node, scope) : null;
}

/** The value of an expression: { value, optional? }, or null when it cannot be known (or knowing it throws). */
function getStaticValue(node, initialScope = null) {
  try {
    return evaluate(node, initialScope);
  } catch {
    return null;
  }
}

/** The value of an expression as a string (a regular expression's and a bigint's literal text), or null. */
function getStringIfConstant(node, initialScope = null) {
  if (node?.type === 'Literal' && node.value === null) {
    if (node.regex) return `/${node.regex.pattern}/${node.regex.flags}`;
    if (node.bigint) return node.bigint;
  }
  const evaluated = getStaticValue(node, initialScope);
  if (evaluated) {
    try {
      return String(evaluated.value);
    } catch {
      // A value without a string (a symbol made by Symbol()).
    }
  }
  return null;
}

/** The name of a member's property or of a property's, method's or field's key, or null when not known. */
function getPropertyName(node, initialScope) {
  switch (node.type) {
    case 'MemberExpression':
      if (node.computed) return getStringIfConstant(node.property, initialScope);
      return node.property.type === 'PrivateIdentifier' ? null : node.property.name;
    case 'Property':
    case 'MethodDefinition':
    case 'PropertyDefinition':
      if (node.computed) return getStringIfConstant(node.key, initialScope);
      if (node.key.type === 'Literal') return String(node.key.value);
      return node.key.type === 'PrivateIdentifier' ? null : node.key.name;
    default:
      return null;
  }
}

export { getStaticValue, getStringIfConstant, getPropertyName, findVariable };
