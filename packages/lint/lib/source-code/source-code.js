// A file as rules see it (context.sourceCode): its text and lines, its tree, tokens and comments (token-store.js),
// locations and indexes, its scopes, the comments that speak to the linter, and the steps of its traversal. Its
// methods and fields are ESLint's SourceCode's: rules call them.

import { TokenStore } from './token-store.js';
import { parseDirective, parseList, parseNames, parseRules, DIRECTIVE_LABEL } from './comments.js';
import { visitStep, callStep } from './steps.js';
import { configGlobalsOf, normalizeConfigGlobal, addDeclaredGlobals, markExportedVariables } from './globals.js';
import { KEYS } from '../ast/visitor-keys.js';
import { traverse } from '../ast/traverse.js';
import { isCommentToken } from '../ast/tokens.js';
import { SHEBANG, lineBreakMatcher } from '../util/text.js';
import { CodePathAnalyzer } from '../code-path/analyzer.js';

const LINE_DIRECTIVE = /^eslint-disable-(?:next-)?line$/u;

function validate(ast) {
  if (!ast) throw new TypeError(`Unexpected empty AST. (${ast})`);
  if (!ast.tokens) throw new TypeError('AST is missing the tokens array.');
  if (!ast.comments) throw new TypeError('AST is missing the comments array.');
  if (!ast.loc) throw new TypeError('AST is missing location information.');
  if (!ast.range) throw new TypeError('AST is missing range information');
}

// Tokens and comments, in the order of the text.
function sortedMerge(tokens, comments) {
  const merged = [];
  let t = 0;
  let c = 0;
  while (t < tokens.length || c < comments.length) {
    if (c >= comments.length || (t < tokens.length && tokens[t].range[0] < comments[c].range[0]))
      merged.push(tokens[t++]);
    else merged.push(comments[c++]);
  }
  return merged;
}

const looksLikeExport = (node) =>
  node.type === 'ExportDefaultDeclaration' ||
  node.type === 'ExportNamedDeclaration' ||
  node.type === 'ExportAllDeclaration' ||
  node.type === 'ExportSpecifier';

const overlap = (first, second) =>
  (first.range[0] <= second.range[0] && first.range[1] >= second.range[0]) ||
  (second.range[0] <= first.range[0] && second.range[1] >= first.range[0]);

// Whether there is space between two nodes or tokens (not overlapping): between any two of the tokens and comments
// from one to the other; with checkInsideOfJSXText, also white space in a JSX text between them.
function isSpaceBetween(sourceCode, first, second, checkInsideOfJSXText) {
  if (overlap(first, second)) return false;
  const [before, after] = first.range[1] <= second.range[0] ? [first, second] : [second, first];
  const firstToken = sourceCode.getLastToken(before) || before;
  const finalToken = sourceCode.getFirstToken(after) || after;
  for (let current = firstToken; current !== finalToken;) {
    const next = sourceCode.getTokenAfter(current, { includeComments: true });
    if (
      current.range[1] !== next.range[0] ||
      (checkInsideOfJSXText && next !== finalToken && next.type === 'JSXText' && /\s/u.test(next.value))
    ) {
      return true;
    }
    current = next;
  }
  return false;
}

// The line (1-based) of an index: the number of line starts at or before it.
function lineOf(lineStartIndices, index) {
  let low = 0;
  let high = lineStartIndices.length;
  while (low < high) {
    const middle = ((low + high) / 2) | 0;
    if (index < lineStartIndices[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}

class SourceCode extends TokenStore {
  #steps;
  #scopes = new WeakMap();
  #globalReferences = new WeakMap();
  #configNodes;
  #disableDirectives;
  #configGlobals;
  #inlineGlobals;
  #exportedVariables;

  /** new SourceCode({ text, ast, hasBOM, parserServices, scopeManager, visitorKeys }), or new SourceCode(text, ast). */
  constructor(textOrConfig, astIfNoConfig) {
    let text;
    let hasBOM;
    let ast;
    let parserServices;
    let scopeManager;
    let visitorKeys;
    if (typeof textOrConfig === 'string') {
      text = textOrConfig;
      ast = astIfNoConfig;
      hasBOM = false;
    } else if (typeof textOrConfig === 'object' && textOrConfig !== null) {
      ({ text, ast, hasBOM, parserServices, scopeManager, visitorKeys } = textOrConfig);
    }
    validate(ast);
    super(ast.tokens, ast.comments);
    this.isESTree = ast.type === 'Program';
    const textHasBOM = text.charCodeAt(0) === 0xfeff;
    this.hasBOM = textHasBOM || !!hasBOM;
    this.text = textHasBOM ? text.slice(1) : text;
    this.ast = ast;
    this.parserServices = parserServices || {};
    this.scopeManager = scopeManager || null;
    this.visitorKeys = visitorKeys || KEYS;
    // The shebang the parser saw as a comment (the language makes `#!x` a `//x`).
    const shebang = this.text.match(SHEBANG);
    if (shebang && ast.comments.length && ast.comments[0].value === shebang[1]) ast.comments[0].type = 'Shebang';
    this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);
    this.lines = [];
    this.lineStartIndices = [0];
    const lineBreaks = lineBreakMatcher();
    let match;
    while ((match = lineBreaks.exec(this.text))) {
      this.lines.push(this.text.slice(this.lineStartIndices.at(-1), match.index));
      this.lineStartIndices.push(match.index + match[0].length);
    }
    this.lines.push(this.text.slice(this.lineStartIndices.at(-1)));
    Object.freeze(this);
    Object.freeze(this.lines);
  }

  static splitLines(text) {
    return text.split(lineBreakMatcher());
  }

  /** The text of a node, with characters before and after it; or the whole text. */
  getText(node, beforeCount, afterCount) {
    if (!node) return this.text;
    return this.text.slice(Math.max(node.range[0] - (beforeCount || 0), 0), node.range[1] + (afterCount || 0));
  }

  getLines() {
    return this.lines;
  }

  getAllComments() {
    return this.ast.comments;
  }

  /** The JSDoc comment (/** ... *\/ right before, a line apart at most) of a function or a class, or null. */
  getJSDocComment(node) {
    const jsDocBefore = (astNode) => {
      const before = this.getTokenBefore(astNode, { includeComments: true });
      if (
        before &&
        isCommentToken(before) &&
        before.type === 'Block' &&
        before.value.charAt(0) === '*' &&
        astNode.loc.start.line - before.loc.end.line <= 1
      ) {
        return before;
      }
      return null;
    };
    let { parent } = node;
    switch (node.type) {
      case 'ClassDeclaration':
      case 'FunctionDeclaration':
        return jsDocBefore(looksLikeExport(parent) ? parent : node);
      case 'ClassExpression':
        return jsDocBefore(parent.parent);
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        if (parent.type !== 'CallExpression' && parent.type !== 'NewExpression') {
          while (
            !this.getCommentsBefore(parent).length &&
            !/Function/u.test(parent.type) &&
            parent.type !== 'MethodDefinition' &&
            parent.type !== 'Property'
          ) {
            parent = parent.parent;
            if (!parent) break;
          }
          if (parent && parent.type !== 'FunctionDeclaration' && parent.type !== 'Program') return jsDocBefore(parent);
        }
        return jsDocBefore(node);
      default:
        return null;
    }
  }

  /** The deepest node whose range holds an index, or null. */
  getNodeByRangeIndex(index) {
    let result = null;
    traverse(this.ast, {
      enter(node) {
        if (node.range[0] <= index && index < node.range[1]) result = node;
        else this.skip();
      },
      leave(node) {
        if (node === result) this.break();
      },
    });
    return result;
  }

  isSpaceBetween(first, second) {
    return isSpaceBetween(this, first, second, false);
  }

  isSpaceBetweenTokens(first, second) {
    return isSpaceBetween(this, first, second, true);
  }

  /** The { line (1-based), column (0-based) } of an index of the text. */
  getLocFromIndex(index) {
    if (typeof index !== 'number') throw new TypeError('Expected `index` to be a number.');
    if (index < 0 || index > this.text.length) {
      throw new RangeError(
        `Index out of range (requested index ${index}, but source text has length ${this.text.length}).`
      );
    }
    if (index === this.text.length) return { line: this.lines.length, column: this.lines.at(-1).length };
    const line =
      index >= this.lineStartIndices.at(-1) ? this.lineStartIndices.length : lineOf(this.lineStartIndices, index);
    return { line, column: index - this.lineStartIndices[line - 1] };
  }

  /** The index of the text of a { line, column }. */
  getIndexFromLoc(loc) {
    if (loc === null || typeof loc !== 'object' || typeof loc.line !== 'number' || typeof loc.column !== 'number') {
      throw new TypeError('Expected `loc` to be an object with numeric `line` and `column` properties.');
    }
    const lineCount = this.lineStartIndices.length;
    if (loc.line <= 0) {
      throw new RangeError(`Line number out of range (line ${loc.line} requested). Line numbers should be 1-based.`);
    }
    if (loc.line > lineCount) {
      throw new RangeError(
        `Line number out of range (line ${loc.line} requested, but only ${lineCount} lines present).`
      );
    }
    if (loc.column < 0) throw new RangeError(`Invalid column number (column ${loc.column} requested).`);
    const lineStart = this.lineStartIndices[loc.line - 1];
    const lineEnd = loc.line === lineCount ? this.text.length : this.lineStartIndices[loc.line];
    const index = lineStart + loc.column;
    if ((loc.line === lineCount && index > lineEnd) || (loc.line < lineCount && index >= lineEnd)) {
      throw new RangeError(
        `Column number out of range (column ${loc.column} requested, but the length of line ${loc.line} is ${lineEnd - lineStart}).`
      );
    }
    return index;
  }

  /** The innermost scope of a node (of a named function expression, its function's, not its name's). */
  getScope(currentNode) {
    if (!currentNode) throw new TypeError('Missing required argument: node.');
    const cached = this.#scopes.get(currentNode);
    if (cached) return cached;
    const inner = currentNode.type !== 'Program';
    let found = this.scopeManager.scopes[0];
    for (let node = currentNode; node; node = node.parent) {
      const scope = this.scopeManager.acquire(node, inner);
      if (scope) {
        found = scope.type === 'function-expression-name' ? scope.childScopes[0] : scope;
        break;
      }
    }
    this.#scopes.set(currentNode, found);
    return found;
  }

  getDeclaredVariables(node) {
    return this.scopeManager.getDeclaredVariables(node);
  }

  /** The ancestors of a node, the root first. */
  getAncestors(node) {
    if (!node) throw new TypeError('Missing required argument: node.');
    const ancestors = [];
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) ancestors.push(ancestor);
    return ancestors.reverse();
  }

  /** Whether an identifier is a reference to a global that the code does not declare. */
  isGlobalReference(node) {
    if (!node) throw new TypeError('Missing required argument: node.');
    if (this.#globalReferences.has(node)) return this.#globalReferences.get(node);
    let result = false;
    if (node.type === 'Identifier') {
      const variable = this.scopeManager.scopes[0].set.get(node.name);
      result =
        Boolean(variable) &&
        variable.defs.length === 0 &&
        variable.references.some(({ identifier }) => identifier === node);
    }
    this.#globalReferences.set(node, result);
    return result;
  }

  getLoc(nodeOrToken) {
    return nodeOrToken.loc;
  }

  getRange(nodeOrToken) {
    return nodeOrToken.range;
  }

  /** Marks the variable of a name, from a node's scope out, used (eslintUsed); whether there was one. */
  markVariableAsUsed(name, refNode = this.ast) {
    const currentScope = this.getScope(refNode);
    let initialScope = currentScope;
    // In a module or with globalReturn, the code's own scope is the one inside the global one.
    if (
      currentScope.type === 'global' &&
      currentScope.childScopes.length > 0 &&
      currentScope.childScopes[0].block === this.ast
    ) {
      initialScope = currentScope.childScopes[0];
    }
    for (let scope = initialScope; scope; scope = scope.upper) {
      const variable = scope.variables.find((candidate) => candidate.name === name);
      if (variable) {
        variable.eslintUsed = true;
        return true;
      }
    }
    return false;
  }

  /** The comments that speak to the linter (line comments only to disable a line). */
  getInlineConfigNodes() {
    this.#configNodes ??= this.ast.comments.filter((comment) => {
      if (comment.type === 'Shebang') return false;
      const directive = parseDirective(comment.value);
      if (!directive || !DIRECTIVE_LABEL.test(directive.label)) return false;
      return comment.type !== 'Line' || LINE_DIRECTIVE.test(directive.label);
    });
    return this.#configNodes;
  }

  /** The eslint-disable/-enable comments as directives, and the problems of those that are wrong. */
  getDisableDirectives() {
    if (this.#disableDirectives) return this.#disableDirectives;
    const problems = [];
    const directives = [];
    for (const comment of this.getInlineConfigNodes()) {
      const { label, value, justification } = parseDirective(comment.value);
      if (comment.type === 'Line' && !LINE_DIRECTIVE.test(label)) continue;
      if (label === 'eslint-disable-line' && comment.loc.start.line !== comment.loc.end.line) {
        problems.push({ ruleId: null, message: `${label} comment should not span multiple lines.`, loc: comment.loc });
        continue;
      }
      if (
        label === 'eslint-disable' ||
        label === 'eslint-enable' ||
        label === 'eslint-disable-next-line' ||
        label === 'eslint-disable-line'
      ) {
        directives.push({ type: label.slice('eslint-'.length), node: comment, value, justification });
      }
    }
    this.#disableDirectives = { problems, directives };
    return this.#disableDirectives;
  }

  /** The globals the language options give (applied by finalize()). */
  applyLanguageOptions(languageOptions) {
    this.#configGlobals = configGlobalsOf(languageOptions);
  }

  /** The configuration comments: their rules ({ configs: [{ config: { rules }, loc }] }), their problems; and their globals and exported variables (applied by finalize()). */
  applyInlineConfig() {
    const problems = [];
    const configs = [];
    const exportedVariables = {};
    const inlineGlobals = Object.create(null);
    for (const comment of this.getInlineConfigNodes()) {
      const { label, value } = parseDirective(comment.value);
      if (label === 'exported') {
        Object.assign(exportedVariables, parseList(value));
      } else if (label === 'globals' || label === 'global') {
        for (const [name, setting] of Object.entries(parseNames(value))) {
          let normalized;
          try {
            normalized = normalizeConfigGlobal(setting);
          } catch (error) {
            problems.push({ ruleId: null, loc: comment.loc, message: error.message });
            continue;
          }
          if (inlineGlobals[name]) {
            inlineGlobals[name].comments.push(comment);
            inlineGlobals[name].value = normalized;
          } else {
            inlineGlobals[name] = { comments: [comment], value: normalized };
          }
        }
      } else if (label === 'eslint') {
        const result = parseRules(value);
        if (result.ok) configs.push({ config: { rules: result.config }, loc: comment.loc });
        else problems.push({ ruleId: null, loc: comment.loc, message: result.error.message });
      }
    }
    this.#inlineGlobals = inlineGlobals;
    this.#exportedVariables = exportedVariables;
    return { configs, problems };
  }

  /** The globals of the config and the comments into the global scope; exported variables marked used. */
  finalize() {
    const globalScope = this.scopeManager.scopes[0];
    addDeclaredGlobals(globalScope, this.#configGlobals, this.#inlineGlobals);
    if (this.#exportedVariables) markExportedVariables(globalScope, this.#exportedVariables);
  }

  /**
   * The steps of a traversal of the tree (kept: the tree does not change): entering and leaving each node, and the
   * events of code paths between them. Each node gets its parent on the way.
   */
  traverse() {
    if (this.#steps) return this.#steps;
    const steps = (this.#steps = []);
    let analyzer = {
      enterNode: (node) => steps.push(visitStep(node, 1)),
      leaveNode: (node) => steps.push(visitStep(node, 2)),
      emit: (eventName, args) => steps.push(callStep(eventName, args)),
    };
    if (this.isESTree) analyzer = new CodePathAnalyzer(analyzer);
    traverse(this.ast, {
      enter(node, parent) {
        node.parent = parent;
        analyzer.enterNode(node);
      },
      leave(node) {
        analyzer.leaveNode(node);
      },
    });
    return steps;
  }
}

export { SourceCode };
