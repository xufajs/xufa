// Smaller JavaScript and CSS: comments and white space left out, and (mangle) the names of local bindings made short.
//
// JavaScript is parsed (by TypeScript) and written again token by token, with a space only where two tokens would
// otherwise be read as one, and a semicolon at the end of every statement that relied on a line break (so nothing
// depends on automatic semicolon insertion). Renaming follows the scopes of lib/scope.js: a binding gets the shortest
// name that no name used inside its scope from around it has, nor any global; nothing is renamed where a direct eval()
// or a with statement could reach it.
import { ts } from './transform.js';
import { analyze } from './scope.js';

// Characters of names (and numbers): ASCII ones, \ of escapes, # of private names, and all past ASCII.
const isWord = (char) => char > '\x7f' || /[\w$\\#]/.test(char);

// Whether `next` written right after `previous` would be read otherwise.
function needsSpace(previous, next) {
  const last = previous[previous.length - 1];
  const first = next[0];
  if (isWord(last) && isWord(first)) return true;
  if ((last === '+' || last === '-') && first === last) return true;
  // a / /re/ (a comment), x < !--y and x-- >y (HTML comments in scripts).
  if (last === '/' && (first === '/' || first === '*')) return true;
  if (last === '<' && first === '!') return true;
  if (last === '-' && first === '>') return true;
  // 1 .toString()
  if (first === '.' && /^\d+$/.test(previous)) return true;
  return false;
}

function statementEnds(t) {
  const k = t.SyntaxKind;
  return new Set([
    k.ExpressionStatement,
    k.VariableStatement,
    k.ReturnStatement,
    k.ThrowStatement,
    k.BreakStatement,
    k.ContinueStatement,
    k.DoStatement,
    k.DebuggerStatement,
    k.ImportDeclaration,
    k.ExportDeclaration,
    k.ExportAssignment,
    k.PropertyDeclaration,
  ]);
}

const RESERVED = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'yield let static implements interface package private protected public await async of get set arguments eval ' +
    'undefined NaN Infinity'
  ).split(' ')
);
// The first characters of names, the most frequent letters of minified code first (they compress better), and the rest.
const FIRST = 'etnsriaoclupdfmhgbvyxwkqjzETNSRIAOCLUPDFMHGBVYXWKQJZ_$';
const REST = `${FIRST}0123456789`;

function nameAt(index) {
  let name = FIRST[index % FIRST.length];
  index = Math.floor(index / FIRST.length);
  while (index > 0) {
    index -= 1;
    name += REST[index % REST.length];
    index = Math.floor(index / REST.length);
  }
  return name;
}

// New names for the bindings of the scopes: Map(identifier -> name), for those that change.
function mangle(t, source) {
  const { root, references, globals } = analyze(t, source);
  const names = new Map();
  const nameOf = (binding) => names.get(binding) ?? binding.name;
  const assign = (scope) => {
    if (scope !== root && !scope.unsafe && scope.bindings.size) {
      const taken = new Set([...scope.crossing].map(nameOf));
      const bindings = [...scope.bindings.values()].sort(
        (a, b) => b.references.length + b.declarations.length - (a.references.length + a.declarations.length)
      );
      let index = 0;
      for (const binding of bindings) {
        let name;
        do name = nameAt(index++);
        while (taken.has(name) || globals.has(name) || RESERVED.has(name));
        names.set(binding, name);
      }
    }
    scope.children.forEach(assign);
  };
  assign(root);
  const renamed = new Map();
  for (const [binding, name] of names) {
    if (name === binding.name) continue;
    for (const node of binding.declarations) renamed.set(node, name);
  }
  for (const [node, binding] of references) {
    if (binding && names.has(binding) && names.get(binding) !== binding.name) renamed.set(node, names.get(binding));
  }
  return renamed;
}

let ENDS = null;

/** JavaScript without comments and white space; `mangle` (true): local names made short. */
function minifyJs(code, { file = 'bundle.js', mangle: shorten = true } = {}) {
  const t = ts();
  ENDS ??= statementEnds(t);
  const source = t.createSourceFile(
    file,
    code,
    { languageVersion: t.ScriptTarget.Latest, jsDocParsingMode: t.JSDocParsingMode.ParseNone },
    shorten,
    t.ScriptKind.JS
  );
  const renamed = shorten ? mangle(t, source) : new Map();
  const out = [];
  let previous = '';
  // A semicolon that ends a statement waits for what follows: before } it is not needed.
  let semicolon = false;
  const write = (text) => {
    if (!text) return;
    if (semicolon) {
      semicolon = false;
      if (text !== '}') write(';');
    }
    if (previous && needsSpace(previous, text)) out.push(' ');
    out.push(text);
    previous = text;
  };
  const end = () => {
    semicolon = true;
  };
  const k = t.SyntaxKind;
  // true and false as !0 and !1, where they are not what a property, a call or a tag is of.
  const literal = (node) => {
    const parent = node.parent;
    const subject =
      (t.isPropertyAccessExpression(parent) || t.isElementAccessExpression(parent) || t.isCallExpression(parent)) &&
      parent.expression === node;
    if (subject || t.isTaggedTemplateExpression(parent)) return null;
    return node.kind === k.TrueKeyword ? '!0' : '!1';
  };
  const visit = (node) => {
    // { a } with a renamed: { a: b } (an object, or a pattern).
    if (
      (t.isShorthandPropertyAssignment(node) ||
        (t.isBindingElement(node) &&
          !node.propertyName &&
          !node.dotDotDotToken &&
          t.isObjectBindingPattern(node.parent))) &&
      renamed.has(node.name)
    ) {
      write(node.name.text);
      write(':');
    }
    // (JSDoc comments are not code.)
    let children = node.getChildren(source).filter((child) => !t.isJSDoc(child));
    if (children.length === 0) {
      if (node.kind === k.EndOfFileToken) return;
      if (node.kind === k.SemicolonToken && ENDS.has(node.parent?.kind)) return end();
      if ((node.kind === k.TrueKeyword || node.kind === k.FalseKeyword) && node.parent) {
        const short = literal(node);
        if (short) return write(short);
      }
      return write(renamed.get(node) ?? node.getText(source));
    }
    // A trailing comma, but the one of a hole at the end of an array ([a, ,]).
    if (node.kind === k.SyntaxList && children.length > 1 && children[children.length - 1].kind === k.CommaToken) {
      if (children[children.length - 2].kind !== k.OmittedExpression) children = children.slice(0, -1);
    }
    for (const child of children) visit(child);
    if (ENDS.has(node.kind) && !semicolon) end();
  };
  visit(source);
  return out.join('');
}

// The parts of CSS: strings and comments, and the rest.
const CSS_PARTS = /("(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*')|(\/\*[\s\S]*?\*\/)|([^"'/]+|\/)/g;

/** CSS without comments (but /*! ones) and white space that changes nothing. */
function minifyCss(css) {
  let text = '';
  for (const [, string, comment, rest] of css.matchAll(CSS_PARTS)) {
    text += string ?? (comment ? (comment.startsWith('/*!') ? comment : ' ') : rest);
  }
  let out = '';
  for (const [, string, comment, rest] of text.matchAll(CSS_PARTS)) {
    if (string || comment) out += string ?? comment;
    else {
      out += rest
        .replace(/\s+/g, ' ')
        .replace(/ ?([{};,>]) ?/g, '$1')
        .replace(/: /g, ':')
        .replace(/;}/g, '}');
    }
  }
  return out.trim();
}

export { minifyJs, minifyCss };
