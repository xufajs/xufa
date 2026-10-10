// JSON.parse that refuses (or removes) __proto__ and constructor.prototype keys, which could pollute prototypes when
// the parsed object is merged into another. The text is scanned only when it holds one of those words.

const PROTO =
  /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
const CONSTRUCTOR =
  /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;

function parse(text, options = {}) {
  const source = typeof text === 'string' ? text : text.toString();
  // A byte order mark is removed, as JSON.parse does not accept it.
  const json = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const value = JSON.parse(json, options.reviver);
  const protoAction = options.protoAction || 'error';
  const constructorAction = options.constructorAction || 'error';
  if (value === null || typeof value !== 'object') return value;
  if (protoAction === 'ignore' && constructorAction === 'ignore') return value;
  // Escaped keys ("__proto__") are only possible when the text has a backslash-u.
  const escaped = json.indexOf('\\u') !== -1;
  const checkProto = protoAction !== 'ignore' && (json.indexOf('__proto__') !== -1 || (escaped && PROTO.test(json)));
  const checkConstructor =
    constructorAction !== 'ignore' && (json.indexOf('constructor') !== -1 || (escaped && CONSTRUCTOR.test(json)));
  if (!checkProto && !checkConstructor) return value;
  return filter(value, {
    protoAction: checkProto ? protoAction : 'ignore',
    constructorAction: checkConstructor ? constructorAction : 'ignore',
  });
}

function filter(root, { protoAction, constructorAction }) {
  let next = [root];
  while (next.length) {
    const nodes = next;
    next = [];
    for (const node of nodes) {
      if (protoAction !== 'ignore' && Object.prototype.hasOwnProperty.call(node, '__proto__')) {
        if (protoAction === 'error') throw new SyntaxError('Object contains forbidden prototype property');
        delete node.__proto__; // eslint-disable-line no-proto
      }
      if (
        constructorAction !== 'ignore' &&
        Object.prototype.hasOwnProperty.call(node, 'constructor') &&
        node.constructor !== null &&
        typeof node.constructor === 'object' &&
        Object.prototype.hasOwnProperty.call(node.constructor, 'prototype')
      ) {
        if (constructorAction === 'error') throw new SyntaxError('Object contains forbidden prototype property');
        delete node.constructor;
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (value !== null && typeof value === 'object') next.push(value);
      }
    }
  }
  return root;
}

// Like parse(), but null instead of throwing.
function safeParse(text, reviver) {
  try {
    return parse(text, { reviver, protoAction: 'error', constructorAction: 'error' });
  } catch {
    return null;
  }
}

// Callable, as secure-json-parse is.
export default parse;
parse.parse = parse;
parse.safeParse = safeParse;
parse.filter = filter;

export { parse, safeParse, filter };

// What require() gives (the tests of fastify are CommonJS).
export { parse as 'module.exports' };
