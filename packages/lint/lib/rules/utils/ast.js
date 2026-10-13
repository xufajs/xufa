// What rules ask of nodes, tokens and scopes: kinds of nodes (functions, loops, null or undefined), the static names of
// properties and members, whether two expressions are the same reference, the precedence of an expression, whether an
// expression is constant, the head of a function, the name of a function with its kind, whether two tokens may touch.
// As ESLint's rules/utils/ast-utils.js answers them (what of it the rules use).

import { KEYS } from '../../ast/visitor-keys.js';
import { tokenize } from '../../parser.js';
import escapeRegExp from '../../util/escape-regexp.js';
import { lineBreakMatcher } from '../../util/text.js';
import { editionGlobals, LATEST_ECMA_VERSION } from '../../data/ecma-globals.js';

const FUNCTION = /^(?:Function(?:Declaration|Expression)|ArrowFunctionExpression)$/u;
const LOOP = /^(?:DoWhile|For|ForIn|ForOf|While)Statement$/u;
const LINEBREAKS = new Set(['\r\n', '\r', '\n', '\u2028', '\u2029']);
const ECMASCRIPT_GLOBALS = editionGlobals(LATEST_ECMA_VERSION);

// Nodes.

const isFunction = (node) => Boolean(node && FUNCTION.test(node.type));
const isLoop = (node) => Boolean(node && LOOP.test(node.type));

/** The function a node is in (or is), or null. */
function getUpperFunction(node) {
  for (let current = node; current; current = current.parent) if (FUNCTION.test(current.type)) return current;
  return null;
}

/** Whether a node is in a loop of its function. */
function isInLoop(node) {
  for (let current = node; current && !isFunction(current); current = current.parent) if (isLoop(current)) return true;
  return false;
}

const isNullLiteral = (node) => node.type === 'Literal' && node.value === null && !node.regex && !node.bigint;

const isNullOrUndefined = (node) =>
  isNullLiteral(node) ||
  (node.type === 'Identifier' && node.name === 'undefined') ||
  (node.type === 'UnaryExpression' && node.operator === 'void');

const isCallee = (node) => node.parent.type === 'CallExpression' && node.parent.callee === node;
const skipChainExpression = (node) => (node && node.type === 'ChainExpression' ? node.expression : node);
const isDirective = (node) => node.type === 'ExpressionStatement' && typeof node.directive === 'string';
const isStaticTemplateLiteral = (node) => node.type === 'TemplateLiteral' && node.expressions.length === 0;
const isLogicalExpression = (node) =>
  node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||');
const isCoalesceExpression = (node) => node.type === 'LogicalExpression' && node.operator === '??';
const isLogicalAssignmentOperator = (operator) => operator === '&&=' || operator === '||=' || operator === '??=';

/** Whether one is && or || and the other ?? (which may not be mixed without parentheses). */
const isMixedLogicalAndCoalesceExpressions = (left, right) =>
  (isLogicalExpression(left) && isCoalesceExpression(right)) ||
  (isCoalesceExpression(left) && isLogicalExpression(right));

/** The value of a literal or a template without expressions as a string, or null. */
function getStaticStringValue(node) {
  if (node.type === 'Literal') {
    if (node.value !== null) return String(node.value);
    if (isNullLiteral(node)) return 'null';
    if (node.regex) return `/${node.regex.pattern}/${node.regex.flags}`;
    if (node.bigint) return node.bigint;
  } else if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** The name of a property, method, field or member when it is known (`a.b`, `a['b']`, `{ 1: x }`), or null. */
function getStaticPropertyName(node) {
  let key;
  switch (node && node.type) {
    case 'ChainExpression':
      return getStaticPropertyName(node.expression);
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      key = node.key;
      break;
    case 'MemberExpression':
      key = node.property;
      break;
    default:
  }
  if (!key) return null;
  if (key.type === 'Identifier' && !node.computed) return key.name;
  return getStaticStringValue(key);
}

const matches = (text, expected) => (typeof expected === 'string' ? text === expected : expected.test(text));

/** Whether a node is an identifier of a name (a string, or a regular expression it matches). */
const isSpecificId = (node, name) => node.type === 'Identifier' && matches(node.name, name);

/** Whether a node is a member of an object of a name and a property of a name (either may be left out). */
function isSpecificMemberAccess(node, objectName, propertyName) {
  const member = skipChainExpression(node);
  if (member.type !== 'MemberExpression') return false;
  if (objectName && !isSpecificId(member.object, objectName)) return false;
  if (propertyName) {
    const name = getStaticPropertyName(member);
    if (typeof name !== 'string' || !matches(name, propertyName)) return false;
  }
  return true;
}

function equalLiteralValue(left, right) {
  if (left.regex || right.regex) {
    return Boolean(
      left.regex && right.regex && left.regex.pattern === right.regex.pattern && left.regex.flags === right.regex.flags
    );
  }
  if (left.bigint || right.bigint) return left.bigint === right.bigint;
  return left.value === right.value;
}

/** Whether two expressions are the same reference: `a.b` and `a['b']`, `this.x` and `this.x`, through `?.`. */
function isSameReference(left, right, disableStaticComputedKey = false) {
  if (left.type !== right.type) {
    if (left.type === 'ChainExpression') return isSameReference(left.expression, right, disableStaticComputedKey);
    if (right.type === 'ChainExpression') return isSameReference(left, right.expression, disableStaticComputedKey);
    return false;
  }
  switch (left.type) {
    case 'Super':
    case 'ThisExpression':
      return true;
    case 'Identifier':
    case 'PrivateIdentifier':
      return left.name === right.name;
    case 'Literal':
      return equalLiteralValue(left, right);
    case 'ChainExpression':
      return isSameReference(left.expression, right.expression, disableStaticComputedKey);
    case 'MemberExpression': {
      if (!disableStaticComputedKey) {
        const name = getStaticPropertyName(left);
        if (name !== null) {
          return (
            isSameReference(left.object, right.object, disableStaticComputedKey) &&
            name === getStaticPropertyName(right)
          );
        }
      }
      return (
        left.computed === right.computed &&
        isSameReference(left.object, right.object, disableStaticComputedKey) &&
        isSameReference(left.property, right.property, disableStaticComputedKey)
      );
    }
    default:
      return false;
  }
}

// Precedence of an expression's operator (higher binds tighter; 20 for other nodes, -1 for what is not one).
const BINARY_PRECEDENCE = {
  '|': 6,
  '^': 7,
  '&': 8,
  '==': 9,
  '!=': 9,
  '===': 9,
  '!==': 9,
  '<': 10,
  '<=': 10,
  '>': 10,
  '>=': 10,
  in: 10,
  instanceof: 10,
  '<<': 11,
  '>>': 11,
  '>>>': 11,
  '+': 12,
  '-': 12,
  '*': 13,
  '/': 13,
  '%': 13,
  '**': 15,
};

function getPrecedence(node) {
  switch (node.type) {
    case 'SequenceExpression':
      return 0;
    case 'AssignmentExpression':
    case 'ArrowFunctionExpression':
    case 'YieldExpression':
      return 1;
    case 'ConditionalExpression':
      return 3;
    case 'LogicalExpression':
      if (node.operator === '||' || node.operator === '??') return 4;
      if (node.operator === '&&') return 5;
      return BINARY_PRECEDENCE[node.operator] ?? 16;
    case 'BinaryExpression':
      return BINARY_PRECEDENCE[node.operator] ?? 16;
    case 'UnaryExpression':
    case 'AwaitExpression':
      return 16;
    case 'UpdateExpression':
      return 17;
    case 'CallExpression':
    case 'ChainExpression':
    case 'ImportExpression':
      return 18;
    case 'NewExpression':
      return 19;
    default:
      return node.type in KEYS ? 20 : -1;
  }
}

// Constants.

// The truthiness of a literal: false for null, true for a regular expression (or its value's), null when the value
// could not be made (a bigint or a regular expression the engine does not have).
function booleanValue(node) {
  if (node.value === null) {
    if (node.raw === 'null') return false;
    if (typeof node.regex === 'object') return true;
    return null;
  }
  return !!node.value;
}

// Whether an operand decides a logical expression whatever the other is (`x || true`, `x && false`, `x && void 0`).
function isLogicalIdentity(node, operator) {
  switch (node.type) {
    case 'Literal':
      return (operator === '||' && booleanValue(node) === true) || (operator === '&&' && booleanValue(node) === false);
    case 'UnaryExpression':
      return operator === '&&' && node.operator === 'void';
    case 'LogicalExpression':
      return (
        operator === node.operator &&
        (isLogicalIdentity(node.left, operator) || isLogicalIdentity(node.right, operator))
      );
    case 'AssignmentExpression':
      return (
        (node.operator === '||=' || node.operator === '&&=') &&
        operator === node.operator.slice(0, -1) &&
        isLogicalIdentity(node.right, operator)
      );
    default:
      return false;
  }
}

/** Whether an identifier refers to a global the code does not declare. */
function isReferenceToGlobalVariable(scope, node) {
  const reference = scope.references.find((ref) => ref.identifier === node);
  return Boolean(
    reference &&
    reference.resolved &&
    reference.resolved.scope.type === 'global' &&
    reference.resolved.defs.length === 0
  );
}

/** Whether an expression's value (or, inBooleanPosition, its truthiness) is always the same. */
function isConstant(scope, node, inBooleanPosition) {
  if (!node) return true;
  switch (node.type) {
    case 'Literal':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
    case 'ObjectExpression':
      return true;
    case 'TemplateLiteral':
      return (
        (inBooleanPosition && node.quasis.some((quasi) => quasi.value.cooked.length)) ||
        node.expressions.every((expression) => isConstant(scope, expression, false))
      );
    case 'ArrayExpression':
      return inBooleanPosition || node.elements.every((element) => isConstant(scope, element, false));
    case 'UnaryExpression':
      if (node.operator === 'void' || (node.operator === 'typeof' && inBooleanPosition)) return true;
      return isConstant(scope, node.argument, node.operator === '!');
    case 'BinaryExpression':
      return isConstant(scope, node.left, false) && isConstant(scope, node.right, false) && node.operator !== 'in';
    case 'LogicalExpression': {
      const left = isConstant(scope, node.left, inBooleanPosition);
      const right = isConstant(scope, node.right, inBooleanPosition);
      return (
        (left && right) ||
        (left && isLogicalIdentity(node.left, node.operator)) ||
        (inBooleanPosition && right && isLogicalIdentity(node.right, node.operator))
      );
    }
    case 'NewExpression':
      return inBooleanPosition;
    case 'AssignmentExpression':
      if (node.operator === '=') return isConstant(scope, node.right, inBooleanPosition);
      if ((node.operator === '||=' || node.operator === '&&=') && inBooleanPosition) {
        return isLogicalIdentity(node.right, node.operator.slice(0, -1));
      }
      return false;
    case 'SequenceExpression':
      return isConstant(scope, node.expressions.at(-1), inBooleanPosition);
    case 'SpreadElement':
      return isConstant(scope, node.argument, inBooleanPosition);
    case 'CallExpression':
      if (node.callee.type === 'Identifier' && node.callee.name === 'Boolean') {
        if (node.arguments.length === 0 || isConstant(scope, node.arguments[0], true)) {
          return isReferenceToGlobalVariable(scope, node.callee);
        }
      }
      return false;
    case 'Identifier':
      return node.name === 'undefined' && isReferenceToGlobalVariable(scope, node);
    default:
      return false;
  }
}

// Tokens.

const isPunctuator = (value) => (token) => token.value === value && token.type === 'Punctuator';
const isArrowToken = isPunctuator('=>');
const isCommaToken = isPunctuator(',');
const isSemicolonToken = isPunctuator(';');
const isOpeningParenToken = isPunctuator('(');
const isClosingParenToken = isPunctuator(')');
const isOpeningBraceToken = isPunctuator('{');

/** Whether a node is right inside parentheses (its own or the syntax's). */
function isParenthesised(sourceCode, node) {
  const before = sourceCode.getTokenBefore(node);
  const after = sourceCode.getTokenAfter(node);
  return (
    Boolean(before && after) &&
    before.value === '(' &&
    before.range[1] <= node.range[0] &&
    after.value === ')' &&
    after.range[0] >= node.range[1]
  );
}

/** Whether two nodes are written with the same tokens. */
function equalTokens(left, right, sourceCode) {
  const tokensLeft = sourceCode.getTokens(left);
  const tokensRight = sourceCode.getTokens(right);
  return (
    tokensLeft.length === tokensRight.length &&
    tokensLeft.every((token, i) => token.type === tokensRight[i].type && token.value === tokensRight[i].value)
  );
}

const NOT_CODE = Symbol('not code');

// The first or last token of a text of code (or a comment, if one comes first or last), or a token given; NOT_CODE
// when the text does not tokenize.
function edgeToken(value, last) {
  if (typeof value !== 'string') return value;
  let tokens;
  try {
    tokens = tokenize(value);
  } catch {
    return NOT_CODE;
  }
  const { comments } = tokens;
  let token = last ? tokens.at(-1) : tokens[0];
  if (comments.length) {
    const comment = last ? comments.at(-1) : comments[0];
    if (!token || (last ? comment.range[0] > token.range[0] : comment.range[0] < token.range[0])) token = comment;
  }
  return token;
}

const PLUS = new Set(['+', '++']);
const MINUS = new Set(['-', '--']);

/** Whether a token (or the end of a text of code) and another (or the start of one) may be written with no space. */
function canTokensBeAdjacent(leftValue, rightValue) {
  const left = edgeToken(leftValue, true);
  if (left === NOT_CODE) return false;
  if (left.type === 'Shebang' || left.type === 'Hashbang') return false;
  const right = edgeToken(rightValue, false);
  if (right === NOT_CODE) return false;
  if (left.type === 'Punctuator' || right.type === 'Punctuator') {
    if (left.type === 'Punctuator' && right.type === 'Punctuator') {
      return !((PLUS.has(left.value) && PLUS.has(right.value)) || (MINUS.has(left.value) && MINUS.has(right.value)));
    }
    if (left.type === 'Punctuator' && left.value === '/')
      return !['Block', 'Line', 'RegularExpression'].includes(right.type);
    return true;
  }
  if (left.type === 'String' || right.type === 'String' || left.type === 'Template' || right.type === 'Template')
    return true;
  if (left.type !== 'Numeric' && right.type === 'Numeric' && right.value.startsWith('.')) return true;
  if (left.type === 'Block' || right.type === 'Block' || right.type === 'Line') return true;
  return right.type === 'PrivateIdentifier';
}

// Functions.

/** The token `(` of a function's parameters (or its one parameter without parentheses). */
function getOpeningParenOfParams(node, sourceCode) {
  if (node.type === 'ArrowFunctionExpression' && node.params.length === 1) {
    const argument = sourceCode.getFirstToken(node.params[0]);
    const before = sourceCode.getTokenBefore(argument);
    return isOpeningParenToken(before) ? before : argument;
  }
  return node.id
    ? sourceCode.getTokenAfter(node.id, isOpeningParenToken)
    : sourceCode.getFirstToken(node, isOpeningParenToken);
}

/** A function's kind and name, as messages say it: "static async method 'a'", "arrow function", "getter 'b'". */
function getFunctionNameWithKind(node) {
  const { parent } = node;
  const words = [];
  const isMember = parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition';
  if (isMember) {
    if (parent.static) words.push('static');
    if (!parent.computed && parent.key?.type === 'PrivateIdentifier') words.push('private');
  }
  if (node.async) words.push('async');
  if (node.generator) words.push('generator');
  if (parent.type === 'Property' || parent.type === 'MethodDefinition') {
    if (parent.kind === 'constructor') return 'constructor';
    words.push(parent.kind === 'get' ? 'getter' : parent.kind === 'set' ? 'setter' : 'method');
  } else if (parent.type === 'PropertyDefinition') {
    words.push('method');
  } else {
    if (node.type === 'ArrowFunctionExpression') words.push('arrow');
    words.push('function');
  }
  if (parent.type === 'Property' || isMember) {
    if (!parent.computed && parent.key.type === 'PrivateIdentifier') {
      words.push(`#${parent.key.name}`);
    } else {
      const name = getStaticPropertyName(parent);
      if (name !== null) words.push(`'${name}'`);
      else if (node.id) words.push(`'${node.id.name}'`);
    }
  } else if (node.id) {
    words.push(`'${node.id.name}'`);
  }
  return words.join(' ');
}

/** The place of a function's head: its key and name up to `(`, or the arrow of an arrow function. */
function getFunctionHeadLoc(node, sourceCode) {
  const { parent } = node;
  let start;
  let end;
  if (parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') {
    start = parent.loc.start;
    end = getOpeningParenOfParams(node, sourceCode).loc.start;
  } else if (node.type === 'ArrowFunctionExpression') {
    const arrow = sourceCode.getTokenBefore(node.body, isArrowToken);
    start = arrow.loc.start;
    end = arrow.loc.end;
  } else {
    start = node.loc.start;
    end = getOpeningParenOfParams(node, sourceCode).loc.start;
  }
  return { start: { ...start }, end: { ...end } };
}

// Scopes.

/** The variable of a name, from a scope out, or null. */
function getVariableByName(initialScope, name) {
  for (let scope = initialScope; scope; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable) return variable;
  }
  return null;
}

/** The references that write (not in the declaration), one per identifier. */
function getModifyingReferences(references) {
  return references.filter(
    (reference, i) =>
      reference.identifier &&
      reference.init === false &&
      reference.isWrite() &&
      (i === 0 || references[i - 1].identifier !== reference.identifier)
  );
}

/** The place of a name in a `/* global *\/` comment (its first character, if not found). */
function getNameLocationInGlobalDirectiveComment(sourceCode, comment, name) {
  const pattern = new RegExp(`[\\s,]${escapeRegExp(name)}(?:$|[\\s,:])`, 'gu');
  pattern.lastIndex = comment.value.indexOf('global') + 'global'.length;
  const match = pattern.exec(comment.value);
  const start = sourceCode.getLocFromIndex(comment.range[0] + '/*'.length + (match ? match.index + 1 : 0));
  return { start, end: { line: start.line, column: start.column + (match ? name.length : 1) } };
}

export {
  LINEBREAKS,
  ECMASCRIPT_GLOBALS,
  lineBreakMatcher as createGlobalLinebreakMatcher,
  isFunction,
  isLoop,
  isInLoop,
  getUpperFunction,
  isNullLiteral,
  isNullOrUndefined,
  isCallee,
  skipChainExpression,
  isDirective,
  isStaticTemplateLiteral,
  isLogicalAssignmentOperator,
  isMixedLogicalAndCoalesceExpressions,
  getStaticPropertyName,
  isSpecificId,
  isSpecificMemberAccess,
  isSameReference,
  getPrecedence,
  isReferenceToGlobalVariable,
  isConstant,
  isCommaToken,
  isSemicolonToken,
  isOpeningParenToken,
  isClosingParenToken,
  isOpeningBraceToken,
  isParenthesised,
  equalTokens,
  canTokensBeAdjacent,
  getOpeningParenOfParams,
  getFunctionNameWithKind,
  getFunctionHeadLoc,
  getVariableByName,
  getModifyingReferences,
  getNameLocationInGlobalDirectiveComment,
};
