// From typescript-estree 8.70.0 (src/node-utils.ts, BSD-2-Clause: see NOTICE.md), as @xufa/lint's code.
import ts from '../typescript.cjs';
import { getModifiers } from './get-modifiers.js';
import { xhtmlEntities } from './xhtml-entities.js';
import { AST_NODE_TYPES, AST_TOKEN_TYPES } from './node-types.js';
import { isAtLeast50, SyntaxKind } from './version.js';

// The kinds of operators, made when first used: SyntaxKind is TypeScript's, there once a file is parsed.
let LOGICAL_OPERATORS;
let ASSIGNMENT_OPERATORS;
let BINARY_OPERATORS;
function makeOperators() {
  LOGICAL_OPERATORS = new Set([
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.QuestionQuestionToken,
  ]);
  ASSIGNMENT_OPERATORS = new Set([
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.AmpersandEqualsToken,
    ts.SyntaxKind.AsteriskAsteriskEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.BarEqualsToken,
    ts.SyntaxKind.CaretEqualsToken,
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
    ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
    ts.SyntaxKind.LessThanLessThanEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.PercentEqualsToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
  ]);
  BINARY_OPERATORS = new Set([
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.AmpersandToken,
    SyntaxKind.AsteriskAsteriskToken,
    SyntaxKind.AsteriskToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.BarToken,
    SyntaxKind.CaretToken,
    SyntaxKind.EqualsEqualsEqualsToken,
    SyntaxKind.EqualsEqualsToken,
    SyntaxKind.ExclamationEqualsEqualsToken,
    SyntaxKind.ExclamationEqualsToken,
    SyntaxKind.GreaterThanEqualsToken,
    SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
    SyntaxKind.GreaterThanGreaterThanToken,
    SyntaxKind.GreaterThanToken,
    SyntaxKind.InKeyword,
    SyntaxKind.InstanceOfKeyword,
    SyntaxKind.LessThanEqualsToken,
    SyntaxKind.LessThanLessThanToken,
    SyntaxKind.LessThanToken,
    SyntaxKind.MinusToken,
    SyntaxKind.PercentToken,
    SyntaxKind.PlusToken,
    SyntaxKind.SlashToken,
  ]);
}
/**
 * Returns true if the given ts.Token is the assignment operator
 */
function isAssignmentOperator(operator) {
  if (!ASSIGNMENT_OPERATORS) makeOperators();
  return ASSIGNMENT_OPERATORS.has(operator.kind);
}
/**
 * Returns true if the given ts.Token is a logical operator
 */
export function isLogicalOperator(operator) {
  if (!LOGICAL_OPERATORS) makeOperators();
  return LOGICAL_OPERATORS.has(operator.kind);
}
export function isESTreeBinaryOperator(operator) {
  if (!BINARY_OPERATORS) makeOperators();
  return BINARY_OPERATORS.has(operator.kind);
}
/**
 * Returns the string form of the given TSToken SyntaxKind
 */
export function getTextForTokenKind(kind) {
  return ts.tokenToString(kind);
}
/**
 * Returns true if the given ts.Node is a valid ESTree class member
 */
export function isESTreeClassMember(node) {
  return node.kind !== SyntaxKind.SemicolonClassElement;
}
/**
 * Checks if a ts.Node has a modifier
 */
export function hasModifier(modifierKind, node) {
  const modifiers = getModifiers(node);
  return modifiers?.some((modifier) => modifier.kind === modifierKind) === true;
}
/**
 * Get last last modifier in ast
 * @returns returns last modifier if present or null
 */
export function getLastModifier(node) {
  const modifiers = getModifiers(node);
  if (modifiers == null) {
    return null;
  }
  return modifiers[modifiers.length - 1] ?? null;
}
/**
 * Returns true if the given ts.Token is a comma
 */
export function isComma(token) {
  return token.kind === SyntaxKind.CommaToken;
}
/**
 * Returns true if the given ts.Node is a comment
 */
export function isComment(node) {
  return node.kind === SyntaxKind.SingleLineCommentTrivia || node.kind === SyntaxKind.MultiLineCommentTrivia;
}
/**
 * Returns true if the given ts.Node is a JSDoc comment
 */
function isJSDocComment(node) {
  return node.kind === SyntaxKind.JSDocComment;
}
/**
 * Returns the binary expression type of the given ts.Token
 */
export function getBinaryExpressionType(operator) {
  if (isAssignmentOperator(operator)) {
    return {
      type: AST_NODE_TYPES.AssignmentExpression,
      operator: getTextForTokenKind(operator.kind),
    };
  }
  if (isLogicalOperator(operator)) {
    return {
      type: AST_NODE_TYPES.LogicalExpression,
      operator: getTextForTokenKind(operator.kind),
    };
  }
  if (isESTreeBinaryOperator(operator)) {
    return {
      type: AST_NODE_TYPES.BinaryExpression,
      operator: getTextForTokenKind(operator.kind),
    };
  }
  throw new Error(`Unexpected binary operator ${ts.tokenToString(operator.kind)}`);
}
/**
 * Returns line and column data for the given positions
 */
export function getLineAndCharacterFor(pos, ast) {
  const loc = ast.getLineAndCharacterOfPosition(pos);
  return {
    column: loc.character,
    line: loc.line + 1,
  };
}
/**
 * Returns line and column data for the given start and end positions,
 * for the given AST
 */
export function getLocFor(range, ast) {
  const [start, end] = range.map((pos) => getLineAndCharacterFor(pos, ast));
  return { end, start };
}
/**
 * Check whatever node can contain directive
 */
export function canContainDirective(node) {
  if (node.kind === ts.SyntaxKind.Block) {
    switch (node.parent.kind) {
      case ts.SyntaxKind.Constructor:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
        return true;
      default:
        return false;
    }
  }
  return true;
}
/**
 * Returns range for the given ts.Node
 */
export function getRange(node, ast) {
  // (What node.getStart() does for nodes of code, without its checks: JSDoc is not parsed here. Missing nodes and
  // JSX text, which it treats otherwise, go through it.)
  if (node.pos !== node.end && node.kind !== SyntaxKind.JsxText) return [ts.skipTrivia(ast.text, node.pos), node.end];
  return [node.getStart(ast), node.getEnd()];
}
/**
 * Returns true if a given ts.Node is a token
 */
function isToken(node) {
  return node.kind >= SyntaxKind.FirstToken && node.kind <= SyntaxKind.LastToken;
}
/**
 * Returns true if a given ts.Node is a JSX token
 */
export function isJSXToken(node) {
  return node.kind >= SyntaxKind.JsxElement && node.kind <= SyntaxKind.JsxAttribute;
}
/**
 * Returns the declaration kind of the given ts.Node
 */
export function getDeclarationKind(node) {
  if (node.flags & ts.NodeFlags.Let) {
    return 'let';
  }
  if ((node.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing) {
    return 'await using';
  }
  if (node.flags & ts.NodeFlags.Const) {
    return 'const';
  }
  if (node.flags & ts.NodeFlags.Using) {
    return 'using';
  }
  return 'var';
}
/**
 * Gets a ts.Node's accessibility level
 */
export function getTSNodeAccessibility(node) {
  const modifiers = getModifiers(node);
  if (modifiers == null) {
    return undefined;
  }
  for (const modifier of modifiers) {
    switch (modifier.kind) {
      case SyntaxKind.PublicKeyword:
        return 'public';
      case SyntaxKind.ProtectedKeyword:
        return 'protected';
      case SyntaxKind.PrivateKeyword:
        return 'private';
      default:
        break;
    }
  }
  return undefined;
}
/**
 * Finds the next token based on the previous one and its parent
 * Had to copy this from TS instead of using TS's version because theirs doesn't pass the ast to getChildren
 */
export function findNextToken(previousToken, parent, ast) {
  return find(parent);
  function find(n) {
    if (ts.isToken(n) && n.pos === previousToken.end) {
      // this is token that starts at the end of previous token - return it
      return n;
    }
    return firstDefined(n.getChildren(ast), (child) => {
      const shouldDiveInChildNode =
        // previous token is enclosed somewhere in the child
        (child.pos <= previousToken.pos && child.end > previousToken.end) ||
        // previous token ends exactly at the beginning of child
        child.pos === previousToken.end;
      return shouldDiveInChildNode && nodeHasTokens(child, ast) ? find(child) : undefined;
    });
  }
}
/**
 * Find the first matching ancestor based on the given predicate function.
 * @param node The current ts.Node
 * @param predicate The predicate function to apply to each checked ancestor
 * @returns a matching parent ts.Node
 */
export function findFirstMatchingAncestor(node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}
/**
 * Returns true if a given ts.Node has a JSX token within its hierarchy
 */
export function hasJSXAncestor(node) {
  return !!findFirstMatchingAncestor(node, isJSXToken);
}
/**
 * Unescape the text content of string literals, e.g. &amp; -> &
 * @param text The escaped string literal text.
 * @returns The unescaped string literal text.
 */
export function unescapeStringLiteralText(text) {
  return text.replaceAll(/&(?:#\d+|#x[\da-fA-F]+|[0-9a-zA-Z]+);/g, (entity) => {
    const item = entity.slice(1, -1);
    if (item[0] === '#') {
      const codePoint = item[1] === 'x' ? parseInt(item.slice(2), 16) : parseInt(item.slice(1), 10);
      return codePoint > 0x10ffff // RangeError: Invalid code point
        ? entity
        : String.fromCodePoint(codePoint);
    }
    return xhtmlEntities[item] || entity;
  });
}
/**
 * Returns true if a given ts.Node is a computed property
 */
export function isComputedProperty(node) {
  return node.kind === SyntaxKind.ComputedPropertyName;
}
/**
 * Returns true if a given ts.Node is optional (has QuestionToken)
 * @param node ts.Node to be checked
 */
export function isOptional(node) {
  return !!node.questionToken;
}
/**
 * Returns true if the node is an optional chain node
 */
export function isChainExpression(node) {
  return node.type === AST_NODE_TYPES.ChainExpression;
}
/**
 * Returns true of the child of property access expression is an optional chain
 */
export function isChildUnwrappableOptionalChain(node, child) {
  return (
    isChainExpression(child) &&
    // (x?.y).z is semantically different, and as such .z is no longer optional
    node.expression.kind !== ts.SyntaxKind.ParenthesizedExpression
  );
}
/**
 * Returns the type of a given ts.Token
 */
export function getTokenType(token) {
  if (token.kind === SyntaxKind.NullKeyword) {
    return AST_TOKEN_TYPES.Null;
  }
  if (token.kind >= SyntaxKind.FirstKeyword && token.kind <= SyntaxKind.LastFutureReservedWord) {
    if (token.kind === SyntaxKind.FalseKeyword || token.kind === SyntaxKind.TrueKeyword) {
      return AST_TOKEN_TYPES.Boolean;
    }
    return AST_TOKEN_TYPES.Keyword;
  }
  if (token.kind >= SyntaxKind.FirstPunctuation && token.kind <= SyntaxKind.LastPunctuation) {
    return AST_TOKEN_TYPES.Punctuator;
  }
  if (token.kind >= SyntaxKind.NoSubstitutionTemplateLiteral && token.kind <= SyntaxKind.TemplateTail) {
    return AST_TOKEN_TYPES.Template;
  }
  switch (token.kind) {
    case SyntaxKind.NumericLiteral:
    case SyntaxKind.BigIntLiteral:
      return AST_TOKEN_TYPES.Numeric;
    case SyntaxKind.PrivateIdentifier:
      return AST_TOKEN_TYPES.PrivateIdentifier;
    case SyntaxKind.JsxText:
      return AST_TOKEN_TYPES.JSXText;
    case SyntaxKind.StringLiteral:
      // A TypeScript-StringLiteral token with a TypeScript-JsxAttribute or TypeScript-JsxElement parent,
      // must actually be an ESTree-JSXText token
      if (token.parent.kind === SyntaxKind.JsxAttribute || token.parent.kind === SyntaxKind.JsxElement) {
        return AST_TOKEN_TYPES.JSXText;
      }
      return AST_TOKEN_TYPES.String;
    case SyntaxKind.RegularExpressionLiteral:
      return AST_TOKEN_TYPES.RegularExpression;
    case SyntaxKind.Identifier:
    case SyntaxKind.ConstructorKeyword:
    case SyntaxKind.GetKeyword:
    case SyntaxKind.SetKeyword:
    // intentional fallthrough
    default:
  }
  // Some JSX tokens have to be determined based on their parent
  if (token.kind === SyntaxKind.Identifier) {
    if (isJSXToken(token.parent)) {
      return AST_TOKEN_TYPES.JSXIdentifier;
    }
    if (token.parent.kind === SyntaxKind.PropertyAccessExpression && hasJSXAncestor(token)) {
      return AST_TOKEN_TYPES.JSXIdentifier;
    }
  }
  return AST_TOKEN_TYPES.Identifier;
}
/**
 * Extends and formats a given ts.Token, for a given AST
 */
export function convertToken(token, ast) {
  const start = token.kind === SyntaxKind.JsxText ? token.getFullStart() : token.getStart(ast);
  const end = token.getEnd();
  const value = ast.text.slice(start, end);
  const tokenType = getTokenType(token);
  const range = [start, end];
  const loc = getLocFor(range, ast);
  if (tokenType === AST_TOKEN_TYPES.RegularExpression) {
    return {
      type: tokenType,
      loc,
      range,
      regex: {
        flags: value.slice(value.lastIndexOf('/') + 1),
        pattern: value.slice(1, value.lastIndexOf('/')),
      },
      value,
    };
  }
  if (tokenType === AST_TOKEN_TYPES.PrivateIdentifier) {
    return {
      type: tokenType,
      loc,
      range,
      value: value.slice(1),
    };
  }
  // @ts-expect-error TS is complaining about `value` not being the correct
  // type but it is
  return {
    type: tokenType,
    loc,
    range,
    value,
  };
}
/**
 * Converts all tokens for the given AST
 * @param ast the AST object
 * @returns the converted Tokens
 */
export function convertTokens(ast) {
  const result = [];
  /**
   * @param node the ts.Node
   */
  function walk(node) {
    // TypeScript generates tokens for types in JSDoc blocks. Comment tokens
    // and their children should not be walked or added to the resulting tokens list.
    if (isComment(node) || isJSDocComment(node)) {
      return;
    }
    if (isToken(node) && node.kind !== SyntaxKind.EndOfFileToken) {
      result.push(convertToken(node, ast));
    } else {
      node.getChildren(ast).forEach(walk);
    }
  }
  walk(ast);
  return result;
}
export class TSError extends Error {
  fileName;
  location;
  name = 'TSError';
  constructor(message, fileName, location) {
    super(message);
    this.fileName = fileName;
    this.location = location;
  }
  // For old version of ESLint https://github.com/typescript-eslint/typescript-eslint/pull/6556#discussion_r1123237311
  get index() {
    return this.location.start.offset;
  }
  // https://github.com/eslint/eslint/blob/b09a512107249a4eb19ef5a37b0bd672266eafdb/lib/linter/linter.js#L853
  get lineNumber() {
    return this.location.start.line;
  }
  // https://github.com/eslint/eslint/blob/b09a512107249a4eb19ef5a37b0bd672266eafdb/lib/linter/linter.js#L854
  get column() {
    return this.location.start.column;
  }
}
export function createError(node, message, sourceFile) {
  let startIndex;
  let endIndex;
  if (Array.isArray(node)) {
    [startIndex, endIndex] = node;
  } else if (typeof node === 'number') {
    startIndex = endIndex = node;
  } else {
    sourceFile ??= node.getSourceFile();
    startIndex = node.getStart(sourceFile);
    endIndex = node.getEnd();
  }
  if (!sourceFile) {
    throw new Error('`sourceFile` is required.');
  }
  const [start, end] = [startIndex, endIndex].map((offset) => {
    const { character: column, line } = sourceFile.getLineAndCharacterOfPosition(offset);
    return { column, line: line + 1, offset };
  });
  return new TSError(message, sourceFile.fileName, { end, start });
}
export function nodeHasTokens(n, ast) {
  // If we have a token or node that has a non-zero width, it must have tokens.
  // Note: getWidth() does not take trivia into account.
  return n.kind === SyntaxKind.EndOfFileToken ? !!n.jsDoc : n.getWidth(ast) !== 0;
}
/**
 * Like `forEach`, but suitable for use with numbers and strings (which may be falsy).
 */
export function firstDefined(array, callback) {
  if (array === undefined) {
    return undefined;
  }
  for (let i = 0; i < array.length; i++) {
    const result = callback(array[i], i);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}
export function identifierIsThisKeyword(id) {
  return (
    (isAtLeast50
      ? ts.identifierToKeywordKind(id)
      : // @ts-expect-error -- intentional fallback for older TS versions <=4.9
        id.originalKeywordKind) === SyntaxKind.ThisKeyword
  );
}
export function isThisIdentifier(node) {
  return !!node && node.kind === SyntaxKind.Identifier && identifierIsThisKeyword(node);
}
export function isThisInTypeQuery(node) {
  if (!isThisIdentifier(node)) {
    return false;
  }
  while (ts.isQualifiedName(node.parent) && node.parent.left === node) {
    node = node.parent;
  }
  return node.parent.kind === SyntaxKind.TypeQuery;
}
export function isValidAssignmentTarget(node) {
  switch (node.kind) {
    case SyntaxKind.Identifier:
      return true;
    case SyntaxKind.PropertyAccessExpression:
    case SyntaxKind.ElementAccessExpression:
      if (node.flags & ts.NodeFlags.OptionalChain) {
        return false;
      }
      return true;
    case SyntaxKind.ParenthesizedExpression:
    case SyntaxKind.TypeAssertionExpression:
    case SyntaxKind.AsExpression:
    case SyntaxKind.SatisfiesExpression:
    case SyntaxKind.ExpressionWithTypeArguments:
    case SyntaxKind.NonNullExpression:
      return isValidAssignmentTarget(node.expression);
    default:
      return false;
  }
}
export function getNamespaceModifiers(node) {
  // For following nested namespaces, use modifiers given to the topmost namespace
  //   export declare namespace foo.bar.baz {}
  let modifiers = getModifiers(node);
  let moduleDeclaration = node;
  while ((!modifiers || modifiers.length === 0) && ts.isModuleDeclaration(moduleDeclaration.parent)) {
    const parentModifiers = getModifiers(moduleDeclaration.parent);
    if (parentModifiers?.length) {
      modifiers = parentModifiers;
    }
    moduleDeclaration = moduleDeclaration.parent;
  }
  return modifiers;
}
// `ts.declarationNameToString`
export function declarationNameToString(node) {
  const text = node.getSourceFile().text.slice(node.pos, node.end).trimStart();
  return text || '(Missing)';
}
function isPropertyAccessEntityNameExpression(node) {
  return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && isEntityNameExpression(node.expression);
}
export function isEntityNameExpression(node) {
  return node.kind === SyntaxKind.Identifier || isPropertyAccessEntityNameExpression(node);
}
