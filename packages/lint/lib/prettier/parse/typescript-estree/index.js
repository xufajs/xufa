// TypeScript's ESTree of a file: TypeScript's parser, its tree converted (./convert.js, typescript-estree's converter
// as @xufa/lint's code) and its comments. parse() takes typescript-estree's options that prettier gives it.
//
// JavaScript is had as prettier has it from Babel: the expressions in parentheses are marked extra.parenthesized, and
// those after a type cast comment (/** @type {T} */ (value)) are ParenthesizedExpression nodes.
//
// Locations (loc) are made only when asked for (locations: true): prettier reads ranges.

import ts, { takeSourceFile } from '#typescript';
import { Converter, convertError } from './convert.js';
import { addOpaqueToken, convertComments } from './comments.js';
import { AST_NODE_TYPES } from './node-types.js';
import { loadTypeScript, ScriptKind } from './version.js';

const JAVASCRIPT = /\.(?:[cm]?js|jsx)$/i;
const EXTENSIONS = {
  '.js': 'JS',
  '.mjs': 'JS',
  '.cjs': 'JS',
  '.jsx': 'JSX',
  '.ts': 'TS',
  '.mts': 'TS',
  '.cts': 'TS',
  '.tsx': 'TSX',
  '.json': 'JSON',
};

// The kind of script of a file, by its extension (jsx: for others).
function scriptKind(filePath, jsx) {
  const extension = /\.[^./\\]+$/.exec(filePath)?.[0].toLowerCase();
  return ScriptKind[EXTENSIONS[extension] ?? (jsx ? 'TSX' : 'TS')];
}

/**
 * TypeScript's ESTree of `code`. Options: filePath (its extension: TypeScript, JSX, JavaScript, JSON), jsx (for
 * other extensions), sourceType ('module' or 'script'), comment (false: no comments), locations (true: loc too;
 * prettier asks for loc, but reads ranges only).
 */
export function parse(code, options = {}) {
  loadTypeScript();
  const filePath = options.filePath ?? (options.jsx ? 'estree.tsx' : 'estree.ts');
  const isModule = options.sourceType === 'module' || (options.sourceType == null && /\.m[jt]s$/i.test(filePath));
  const kind = scriptKind(filePath, options.jsx === true);
  // The linter's SourceFile of this text, when it has just parsed it (xufa-check), or a new one.
  const source =
    takeSourceFile(code, kind, isModule) ??
    ts.createSourceFile(
      filePath,
      code,
      {
        languageVersion: ts.ScriptTarget.Latest,
        jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
        setExternalModuleIndicator: isModule
          ? (file) => {
              file.externalModuleIndicator = true;
            }
          : undefined,
      },
      // (Parents are set below, with the parentheses: TypeScript's way of setting them takes more than twice as long.)
      false,
      kind
    );
  if (source.parseDiagnostics.length) throw convertError(source.parseDiagnostics[0]);
  // JavaScript: its parentheses, whose expressions are mapped to their nodes (the rest is not).
  const opaque = [];
  const parentheses = setParents(source, JAVASCRIPT.test(filePath), options.comment !== false ? opaque : null);
  const converter = new Converter(source, {
    allowInvalidAST: false,
    errorOnUnknownASTType: false,
    loc: options.locations === true,
    shouldPreserveNodeMaps: false,
    trackedNodes: parentheses.length ? new Set(parentheses.map((parenthesis) => parenthesis.expression)) : undefined,
    suppressDeprecatedPropertyWarnings: true,
    postprocessed: options.postprocessed,
  });
  const estree = converter.convertProgram();
  if (options.comment !== false) {
    estree.comments = convertComments(source, { loc: options.locations === true, opaque });
  }
  if (parentheses.length) {
    addParentheses(source, estree, parentheses, converter.tsNodeToESTreeNodeMap, options.postprocessed);
  }
  return estree;
}

// The parents of the nodes of a file set; its parenthesized expressions, innermost first (when asked for); and in
// `opaque` (when given), the tokens the finding of comments skips ([start, end, ...], by start).
function setParents(source, withParentheses, opaque) {
  const parentheses = [];
  let sorted = true;
  const add = (start, end) => {
    if (opaque.length && start < opaque[opaque.length - 2]) sorted = false;
    opaque.push(start, end);
  };
  let parent = source;
  const visit = (node) => {
    node.parent = parent;
    if (opaque) addOpaqueToken(node, source, add);
    parent = node;
    ts.forEachChild(node, visit);
    parent = node.parent;
    if (withParentheses && node.kind === ts.SyntaxKind.ParenthesizedExpression) parentheses.push(node);
  };
  ts.forEachChild(source, visit);
  if (!sorted) {
    const pairs = [];
    for (let index = 0; index < opaque.length; index += 2) pairs.push([opaque[index], opaque[index + 1]]);
    pairs.sort((a, b) => a[0] - b[0]);
    opaque.length = 0;
    for (const [start, end] of pairs) opaque.push(start, end);
  }
  return parentheses;
}

// The parenthesized expressions of a JavaScript file: their expression marked extra.parenthesized (what prettier's
// postprocessing makes of Babel's ParenthesizedExpression nodes), or, after a type cast comment, a
// ParenthesizedExpression node.
function addParentheses(source, estree, parentheses, nodes, postprocessed) {
  const castEnds = (estree.comments ?? [])
    .filter((comment) => comment.type === 'Block' && comment.value[0] === '*' && isCast(comment.value))
    .map((comment) => comment.range[1]);
  const followsCast = (start) => {
    let end = -1;
    for (const candidate of castEnds) {
      if (candidate > start) break;
      end = candidate;
    }
    return end >= 0 && source.text.slice(end, start).trim().length === 0;
  };
  const casts = [];
  for (const parenthesis of parentheses) {
    if (castEnds.length && followsCast(parenthesis.getStart(source))) {
      casts.push(parenthesis);
      continue;
    }
    const inner = nodes.get(parenthesis.expression);
    if (inner) inner.extra = { ...inner.extra, parenthesized: true };
  }
  if (casts.length) wrapCasts(source, estree, nodes, casts, postprocessed);
}

// A comment that casts: @type or @satisfies (Closure's and TypeScript's), as prettier's isTypeCastComment.
function isCast(value) {
  return /@(?:type|satisfies)(?![\w$])/.test(value);
}

// Type casts: ParenthesizedExpression nodes in the tree, innermost first.
function wrapCasts(source, estree, nodes, casts, postprocessed) {
  // Where each node of the tree is: its parent and key (and index in a list).
  const places = new Map();
  const walk = (node) => {
    for (const key in node) {
      if (key === 'parent' || key === 'loc' || key === 'range' || key === 'extra') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
          const item = value[index];
          if (item && typeof item.type === 'string') {
            places.set(item, [node, key, index]);
            walk(item);
          }
        }
      } else if (value && typeof value.type === 'string') {
        places.set(value, [node, key]);
        walk(value);
      }
    }
  };
  walk(estree);
  const wrappers = new Map();
  for (const parenthesis of casts) {
    const inner = wrappers.get(parenthesis.expression) ?? nodes.get(parenthesis.expression);
    const place = inner && places.get(inner);
    if (!place) continue;
    const wrapper = {
      type: AST_NODE_TYPES.ParenthesizedExpression ?? 'ParenthesizedExpression',
      expression: inner,
      range: [parenthesis.getStart(source), parenthesis.end],
    };
    postprocessed?.push(wrapper);
    const [parent, key, index] = place;
    if (index === undefined) parent[key] = wrapper;
    else parent[key][index] = wrapper;
    places.set(wrapper, place);
    places.delete(inner);
    wrappers.set(parenthesis, wrapper);
  }
}
