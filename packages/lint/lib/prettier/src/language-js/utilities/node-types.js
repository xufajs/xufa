import { createTypeCheckFunction } from './create-type-check-function.js';

/**
@import {
  Node,
  NodeMap,
  Comment,
  NumericLiteral,
  StringLiteral,
  RegExpLiteral,
  BigIntLiteral,
} from "../types/estree.js";
*/

export const isBinaryCastExpression = createTypeCheckFunction([
  // TS
  'TSAsExpression',
  'TSSatisfiesExpression',
]);

export const isSatisfiesExpression = createTypeCheckFunction(['TSSatisfiesExpression']);

export const isUnionType = createTypeCheckFunction(['TSUnionType']);

export const isIntersectionType = createTypeCheckFunction(['TSIntersectionType']);

export const isTupleType = createTypeCheckFunction(['TSTupleType']);

export const isConditionalType = createTypeCheckFunction(['TSConditionalType']);

export const isTypeAlias = createTypeCheckFunction(['TSTypeAliasDeclaration']);

export const isReturnOrThrowStatement = createTypeCheckFunction(['ReturnStatement', 'ThrowStatement']);

export const isExportDeclaration = createTypeCheckFunction([
  'ExportDefaultDeclaration',

  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

// These two functions exists because we used support `recordAndTuple`
// Feel free to check `node.type` instead
// https://github.com/prettier/prettier/pull/17363
export const isArrayExpression = createTypeCheckFunction(['ArrayExpression']);
export const isObjectExpression = createTypeCheckFunction(['ObjectExpression']);

export const isLiteral = createTypeCheckFunction([
  'Literal',
  'BooleanLiteral',
  'BigIntLiteral', // Babel, flow use `BigIntLiteral` too

  'NullLiteral',
  'NumericLiteral',

  'StringLiteral',
]);

export const isObjectType = createTypeCheckFunction(['TSTypeLiteral', 'TSMappedType']);

export const isFunctionOrArrowExpression = createTypeCheckFunction(['FunctionExpression', 'ArrowFunctionExpression']);

export const isJsxElement = createTypeCheckFunction(['JSXElement', 'JSXFragment']);

export const isBinaryish = createTypeCheckFunction(['BinaryExpression', 'LogicalExpression']);

export const isCallExpression = createTypeCheckFunction(['CallExpression']);

export const isMemberExpression = createTypeCheckFunction(['MemberExpression']);

export const isCallOrNewExpression = createTypeCheckFunction(['CallExpression', 'NewExpression']);

export const isCallLikeExpression = createTypeCheckFunction(['CallExpression', 'NewExpression', 'ImportExpression']);

export const isChainElementWrapper = createTypeCheckFunction(['ChainExpression', 'TSNonNullExpression']);

export const isArrayType = createTypeCheckFunction(['TSArrayType']);

export const isTypeParameterInstantiation = createTypeCheckFunction(['TSTypeParameterInstantiation']);

export * from './literal.js';
