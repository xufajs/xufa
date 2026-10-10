// Compiles the tree of a method into code that finds a route: the walk of index.js (match), with the nodes written
// as code. A static child is a case of a switch on the next character and comparisons of character codes, a
// parameter a slice up to the next slash, and backtracking is falling out of a block to the next child to try, in
// the order of the walk: the static child, the parametric children, then the wildcard. No calls per node, no stack of
// nodes to try, and the parameters are locals. The code of a large tree is split into functions of a few kilobytes,
// each one a subtree: V8 optimizes functions of that size well, and one of a hundred kilobytes badly.
//
// The function is walk(path, originPath, len, derivedConstraints, decode, result): it gives 0 when it found the
// route (its handler, store and params written to result), 1 when there is none, 2 when there is none and a
// parameter was longer than maxParamLength.
import { decodeParam } from './url.js';

// Trees with more nodes are walked by match(): the time to compile them would be too long.
const MAX_NODES = 20000;
// The code of a node larger than this has its largest subtrees moved to functions of their own.
const MAX_CHUNK = 24000;
// Prefixes longer than this are compared with startsWith() rather than one comparison per character.
const MAX_INLINE_PREFIX = 12;

function compileTree(root, maxParamLength) {
  const refs = [];
  const functions = [];
  let names = 0;
  let nodes = 0;
  const ref = (value) => {
    refs.push(value);
    return `R${refs.length - 1}`;
  };
  const name = (prefix) => `${prefix}${(names += 1)}`;

  // The code of a subtree moved to a function: it gets the index in the path (when a variable) and the parameters
  // found so far, under the names its code uses, and gives 0, 1 or 2 as walk() does.
  function extract(piece, at, params) {
    const fn = name('f');
    const args = (/^[a-z]+\d+$/.test(at) ? [at] : []).concat(params);
    const signature = ['path', 'originPath', 'len', 'dc', 'decode', 'r'].concat(args).join(', ');
    functions.push(`function ${fn}(${signature}) {\nlet exceeded = false;\n${piece}return exceeded ? 2 : 1;\n}\n`);
    const status = name('s');
    return (
      `{\nconst ${status} = ${fn}(${signature});\n` +
      `if (${status} === 0) return 0;\nif (${status} === 2) exceeded = true;\n}\n`
    );
  }

  // The code of a node whose part of the path ends at index `at` (an expression), with the parameters found so far.
  function body(node, at, params) {
    nodes += 1;
    let leaf = '';
    if (node.isLeafNode) {
      const h = name('h');
      leaf =
        `if (${at} === len) {\nconst ${h} = ${ref(node.handlerStorage)}.getMatchingHandler(dc);\n` +
        `if (${h} !== null) {\nr.handler = ${h}.handler;\nr.store = ${h}.store;\n` +
        `r.params = ${h}.createParamsArgs(${params.join(', ')});\nreturn 0;\n}\n}\n`;
    }
    // The code of each child, in the order they are tried.
    const cases = [];
    const others = [];
    const codes = node.staticChildrenCharCodes;
    if (codes !== undefined) {
      for (let i = 0; i < codes.length; i += 1) {
        cases.push({ code: codes[i], text: staticChild(node.staticChildrenNodes[i], at, params) });
      }
    }
    if (node.parametricChildren !== undefined) {
      for (const child of node.parametricChildren) others.push({ text: parametricChild(child, at, params) });
    }
    if (node.wildcardChild != null) others.push({ text: wildcardChild(node.wildcardChild, at, params) });
    // The largest ones to functions of their own, until the code of the node is small enough.
    const pieces = cases.concat(others);
    let size = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
    for (const piece of [...pieces].sort((a, b) => b.text.length - a.text.length)) {
      if (size <= MAX_CHUNK) break;
      const before = piece.text.length;
      piece.text = extract(piece.text, at, params);
      size -= before - piece.text.length;
    }
    let out = leaf;
    if (cases.length !== 0) {
      out += `switch (path.charCodeAt(${at})) {\n`;
      for (const piece of cases) out += `case ${piece.code}: {\n${piece.text}break;\n}\n`;
      out += '}\n';
    }
    for (const piece of others) out += piece.text;
    return out;
  }

  // Its first character is the case of the switch: the others are compared here.
  function staticChild(node, at, params) {
    const { prefix } = node;
    const end = name('i');
    let test = '';
    if (prefix.length > MAX_INLINE_PREFIX) {
      test = `path.startsWith(${JSON.stringify(prefix)}, ${at})`;
    } else if (prefix.length > 1) {
      const checks = [];
      for (let i = 1; i < prefix.length; i += 1)
        checks.push(`path.charCodeAt(${at} + ${i}) === ${prefix.charCodeAt(i)}`);
      test = checks.join(' && ');
    }
    const code = `{\nconst ${end} = ${at} + ${prefix.length};\n${body(node, end, params)}}\n`;
    return test === '' ? code : `if (${test}) ${code}`;
  }

  function parametricChild(node, at, params) {
    const end = name('e');
    const value = name('v');
    let out =
      `{\nlet ${end} = originPath.indexOf('/', ${at});\nif (${end} === -1) ${end} = len;\n` +
      `let ${value} = originPath.slice(${at}, ${end});\nif (decode) ${value} = decodeParam(${value});\n`;
    if (node.isRegex) {
      const groups = new RegExp(`${node.regex.source}|`).exec('').length - 1;
      const match = name('m');
      const found = [];
      for (let i = 1; i <= groups; i += 1) found.push(name('p'));
      out +=
        `const ${match} = ${ref(node.regex)}.exec(${value});\nif (${match} !== null) {\n` +
        found.map((p, i) => `const ${p} = ${match}[${i + 1}] ?? '';\n`).join('') +
        `if (${found.map((p) => `${p}.length > max`).join(' || ') || 'false'}) exceeded = true;\n` +
        `else {\n${body(node, end, params.concat(found))}}\n}\n`;
    } else {
      out += `if (${value}.length > max) exceeded = true;\nelse {\n${body(node, end, params.concat(value))}}\n`;
    }
    return `${out}}\n`;
  }

  function wildcardChild(node, at, params) {
    const value = name('v');
    return (
      `{\nlet ${value} = originPath.slice(${at});\nif (decode) ${value} = decodeParam(${value});\n` +
      `${body(node, 'len', params.concat(value))}}\n`
    );
  }

  const code = body(root, String(root.prefix.length), []);
  if (nodes > MAX_NODES) return null;
  const source =
    `${refs.map((_, i) => `const R${i} = refs[${i}];`).join('\n')}\n${functions.join('')}` +
    `return function walk(path, originPath, len, dc, decode, r) {\nlet exceeded = false;\n${code}` +
    'return exceeded ? 2 : 1;\n};';
  // eslint-disable-next-line no-new-func
  return new Function('refs', 'max', 'decodeParam', source)(refs, maxParamLength, decodeParam);
}

export { compileTree };
