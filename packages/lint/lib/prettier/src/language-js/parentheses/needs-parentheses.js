import { hasComment } from '../utilities/comments.js';
import { createTypeCheckFunction } from '../utilities/create-type-check-function.js';
import { getPrecedence } from '../utilities/get-precedence.js';
import { isBitwiseOperator } from '../utilities/is-bitwise-operator.js';
import { isNullishCoalescing } from '../utilities/is-nullish-coalescing.js';
import { isObjectProperty } from '../utilities/is-object-property.js';
import {
  isArrayExpression,
  isBinaryCastExpression,
  isCallOrNewExpression,
  isConditionalType,
  isIntersectionType,
  isMemberExpression,
  isNumericLiteral,
  isObjectExpression,
  isReturnOrThrowStatement,
  isUnionType,
} from '../utilities/node-types.js';
import { shouldFlatten } from '../utilities/should-flatten.js';
import { startsWithNoLookaheadToken } from '../utilities/starts-with-no-lookahead-token.js';
import { shouldAddParenthesesToChainElement } from './chain-expression.js';
import { shouldAddParenthesesToIdentifier } from './identifier.js';
import { parentNeedsParentheses } from './parent-needs-parentheses.js';

/**
 * @import AstPath from "../../common/ast-path.js"
 */

/**
 * @param {AstPath} path
 * @returns {boolean}
 */
function needsParentheses(path, options) {
  if (path.isRoot) {
    return false;
  }

  const { node, key, parent } = path;

  // to avoid unexpected `}}` in HTML interpolations
  if (
    options.__isInHtmlInterpolation &&
    !options.bracketSpacing &&
    endsWithRightBracket(node) &&
    isFollowedByRightBracket(path)
  ) {
    return true;
  }

  // Only statements don't need parentheses.
  if (isStatement(node)) {
    return false;
  }

  if (node.type === 'Identifier') {
    return shouldAddParenthesesToIdentifier(path);
  }

  if (node.type === 'ObjectExpression' || node.type === 'FunctionExpression' || node.type === 'ClassExpression') {
    const expression = path.findAncestor((node) => node.type === 'ExpressionStatement')?.expression;
    if (expression && startsWithNoLookaheadToken(expression, (leftmostNode) => leftmostNode === node)) {
      return true;
    }
  }

  if (node.type === 'ObjectExpression') {
    const arrowFunctionBody = path.findAncestor((node) => node.type === 'ArrowFunctionExpression')?.body;
    if (
      arrowFunctionBody &&
      arrowFunctionBody.type !== 'SequenceExpression' && // these have parens added anyway
      arrowFunctionBody.type !== 'AssignmentExpression' &&
      startsWithNoLookaheadToken(arrowFunctionBody, (leftmostNode) => leftmostNode === node)
    ) {
      return true;
    }
  }

  const parentCheckResult = parentNeedsParentheses(path, options, needsParentheses);
  if (typeof parentCheckResult === 'boolean') {
    return parentCheckResult;
  }

  switch (node.type) {
    case 'UpdateExpression':
      if (parent.type === 'UnaryExpression') {
        return (
          node.prefix &&
          ((node.operator === '++' && parent.operator === '+') || (node.operator === '--' && parent.operator === '-'))
        );
      }
    // else fallthrough
    case 'UnaryExpression':
      switch (parent.type) {
        case 'UnaryExpression':
          return node.operator === parent.operator && (node.operator === '+' || node.operator === '-');

        case 'MemberExpression':
          return key === 'object';

        case 'TaggedTemplateExpression':
          return true;

        case 'NewExpression':
        case 'CallExpression':
          return key === 'callee';

        case 'BinaryExpression':
          // A user typing `!foo instanceof Bar` probably intended
          // `!(foo instanceof Bar)`, so format to `(!foo) instance Bar` to what is
          // really happening
          if (
            key === 'left' &&
            node.type === 'UnaryExpression' &&
            (parent.operator === 'in' || parent.operator === 'instanceof')
          ) {
            return true;
          }

          return key === 'left' && parent.operator === '**';

        case 'TSNonNullExpression':
          return true;

        default:
          return false;
      }

    case 'BinaryExpression':
      if (parent.type === 'UpdateExpression') {
        return true;
      }

      // We add parentheses to any `a in b` inside `ForStatement` initializer
      // https://github.com/prettier/prettier/issues/907#issuecomment-284304321
      if (node.operator === 'in' && isPathInForStatementInitializer(path)) {
        return true;
      }
      if (node.operator === '|>' && node.extra?.parenthesized) {
        const grandParent = path.grandparent;
        if (grandParent.type === 'BinaryExpression' && grandParent.operator === '|>') {
          return true;
        }
      }

    // fallthrough
    case 'TSTypeAssertion':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'LogicalExpression':
      switch (parent.type) {
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
          // examples:
          //   foo as unknown as Bar
          //   foo satisfies unknown satisfies Bar
          //   foo satisfies unknown as Bar
          //   foo as unknown satisfies Bar
          return !isBinaryCastExpression(node);

        case 'ConditionalExpression':
          return isBinaryCastExpression(node) || isNullishCoalescing(node);

        case 'CallExpression':
        case 'NewExpression':
          return key === 'callee';

        case 'ClassExpression':
        case 'ClassDeclaration':
          return key === 'superClass';

        case 'TSTypeAssertion':
        case 'TaggedTemplateExpression':
        case 'JSXSpreadAttribute':
        case 'SpreadElement':
        case 'AwaitExpression':
        case 'TSNonNullExpression':
        case 'UpdateExpression':
          return true;
        case 'UnaryExpression':
          // `UnaryExpression` adds parentheses and indention when argument has comment
          if (!hasComment(node)) {
            return true;
          }
          break;

        case 'MemberExpression':
          return key === 'object';

        case 'AssignmentExpression':
        case 'AssignmentPattern':
          return key === 'left' && (node.type === 'TSTypeAssertion' || isBinaryCastExpression(node));

        case 'LogicalExpression':
          if (node.type === 'LogicalExpression') {
            return parent.operator !== node.operator;
          }
        // else fallthrough

        case 'BinaryExpression': {
          const { operator, type } = node;
          if (!operator && type !== 'TSTypeAssertion') {
            return true;
          }

          const precedence = getPrecedence(operator);
          const parentOperator = parent.operator;
          const parentPrecedence = getPrecedence(parentOperator);

          if (parentPrecedence > precedence) {
            return true;
          }

          if (key === 'right' && parentPrecedence === precedence) {
            return true;
          }

          if (parentPrecedence === precedence && !shouldFlatten(parentOperator, operator)) {
            return true;
          }

          if (parentPrecedence < precedence && operator === '%' && (parentOperator === '+' || parentOperator === '-')) {
            return true;
          }

          // Add parenthesis when working with bitwise operators
          // It's not strictly needed but helps with code understanding
          if (isBitwiseOperator(parentOperator)) {
            return true;
          }

          return false;
        }

        default:
          return false;
      }
      break;

    case 'SequenceExpression':
      // Although parentheses wouldn't hurt around sequence
      // expressions in the head of for loops, traditional style
      // dictates that e.g. i++, j++ should not be wrapped with
      // parentheses.
      if (parent.type === 'ForStatement') {
        return false;
      }

      // Otherwise err on the side of overparenthesization, adding
      // explicit exceptions above if this proves overzealous.
      return true;

    case 'YieldExpression':
      if (parent.type === 'AwaitExpression' || parent.type === 'TSTypeAssertion') {
        return true;
      }
    // else fallthrough
    case 'AwaitExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'UnaryExpression':
        case 'LogicalExpression':
        case 'SpreadElement':
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
          return true;

        case 'MemberExpression':
          return key === 'object';

        case 'NewExpression':
        case 'CallExpression':
          return key === 'callee';

        case 'ConditionalExpression':
          return key === 'test';

        case 'BinaryExpression':
          if (!node.argument && parent.operator === '|>') {
            return false;
          }

          return true;

        default:
          return false;
      }

    case 'TSFunctionType':
      if (
        path.match(
          (node) => node.type === 'TSFunctionType',
          (node, key) => key === 'typeAnnotation' && node.type === 'TSTypeAnnotation',
          (node, key) => key === 'returnType' && node.type === 'ArrowFunctionExpression'
        )
      ) {
        return true;
      }
    // fallthrough
    case 'TSConditionalType':
    case 'TSConstructorType':
      if (key === 'extendsType' && isConditionalType(node) && parent.type === node.type) {
        return true;
      }

      // `const foo = <Foo extends (Bar extends Baz ? A : B)>() => true;`
      //                            ^^^^^^^^^^^^^^^^^^^^^^^
      if (key === 'constraint' && node.type === 'TSConditionalType' && parent.type === 'TSTypeParameter') {
        return true;
      }

      if (key === 'checkType' && isConditionalType(parent)) {
        return true;
      }

      if (key === 'extendsType' && parent.type === 'TSConditionalType') {
        let { typeAnnotation } = node.returnType || node.typeAnnotation;

        if (typeAnnotation.type === 'TSTypePredicate' && typeAnnotation.typeAnnotation) {
          typeAnnotation = typeAnnotation.typeAnnotation.typeAnnotation;
        }

        if (typeAnnotation.type === 'TSInferType' && typeAnnotation.typeParameter.constraint) {
          return true;
        }
      }

    // fallthrough
    case 'TSUnionType':
    case 'TSIntersectionType':
      if (isUnionType(parent) || isIntersectionType(parent)) {
        return true;
      }
    // fallthrough
    case 'TSInferType':
      if (node.type === 'TSInferType') {
        if (parent.type === 'TSRestType') {
          return false;
        }

        if (
          key === 'types' &&
          (parent.type === 'TSUnionType' || parent.type === 'TSIntersectionType') &&
          node.typeParameter.type === 'TSTypeParameter' &&
          node.typeParameter.constraint
        ) {
          return true;
        }
      }
    // fallthrough
    case 'TSTypeOperator':
      return (
        parent.type === 'TSArrayType' ||
        parent.type === 'TSOptionalType' ||
        parent.type === 'TSRestType' ||
        (key === 'objectType' && parent.type === 'TSIndexedAccessType') ||
        parent.type === 'TSTypeOperator' ||
        (parent.type === 'TSTypeAnnotation' && path.grandparent.type.startsWith('TSJSDoc'))
      );
    case 'TSTypeQuery':
      return (
        (key === 'objectType' && parent.type === 'TSIndexedAccessType') ||
        (key === 'elementType' && parent.type === 'TSArrayType')
      );
    // Same as `TSTypeOperator`, but for Flow syntax
    // Same as `TSTypeQuery`, but for Flow syntax

    // fallthrough

    case 'StringLiteral':
    case 'NumericLiteral':
    case 'Literal':
      if (
        typeof node.value === 'string' &&
        parent.type === 'ExpressionStatement' &&
        typeof parent.directive !== 'string'
      ) {
        // To avoid becoming a directive
        const grandParent = path.grandparent;

        return grandParent.type === 'Program' || grandParent.type === 'BlockStatement';
      }

      return key === 'object' && isMemberExpression(parent) && isNumericLiteral(node);

    case 'AssignmentExpression':
      if ((key === 'init' || key === 'update') && parent.type === 'ForStatement') {
        return false;
      }

      if (key === 'expression' && node.left.type !== 'ObjectPattern' && parent.type === 'ExpressionStatement') {
        return false;
      }

      if (key === 'key' && parent.type === 'TSPropertySignature') {
        return false;
      }

      if (parent.type === 'AssignmentExpression') {
        return false;
      }

      if (
        key === 'expressions' &&
        parent.type === 'SequenceExpression' &&
        path.match(
          undefined,
          undefined,
          (node, name) => (name === 'init' || name === 'update') && node.type === 'ForStatement'
        )
      ) {
        return false;
      }

      if (
        key === 'value' &&
        parent.type === 'Property' &&
        path.match(undefined, undefined, (node, name) => name === 'properties' && node.type === 'ObjectPattern')
      ) {
        return false;
      }

      return true;

    case 'ConditionalExpression':
      switch (parent.type) {
        case 'TaggedTemplateExpression':
        case 'UnaryExpression':
        case 'SpreadElement':
        case 'BinaryExpression':
        case 'LogicalExpression':
        case 'AwaitExpression':
        case 'JSXSpreadAttribute':
        case 'TSTypeAssertion':
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
          return true;

        case 'NewExpression':
        case 'CallExpression':
          return key === 'callee';

        case 'ConditionalExpression':
          // TODO remove this case entirely once we've removed this flag.
          if (!options.experimentalTernaries) {
            return key === 'test';
          }
          return false;

        case 'MemberExpression':
          return key === 'object';

        default:
          return false;
      }

    case 'FunctionExpression':
      switch (parent.type) {
        case 'NewExpression':
        case 'CallExpression':
          // Not always necessary, but it's clearer to the reader if IIFEs are wrapped in parentheses.
          // Is necessary if it is `expression` of `ExpressionStatement`.
          return key === 'callee';
        case 'TaggedTemplateExpression':
          return true; // This is basically a kind of IIFE.
        case 'ExportDefaultDeclaration':
          return key === 'declaration';
        default:
          return false;
      }

    case 'ArrowFunctionExpression':
      switch (parent.type) {
        case 'BinaryExpression':
          return parent.operator !== '|>' || node.extra?.parenthesized;
        case 'NewExpression':
        case 'CallExpression':
          return key === 'callee';

        case 'MemberExpression':
          return key === 'object';

        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
        case 'TaggedTemplateExpression':
        case 'UnaryExpression':
        case 'LogicalExpression':
        case 'AwaitExpression':
        case 'TSTypeAssertion':
          return true;

        case 'TSInstantiationExpression':
          return key === 'expression';

        case 'ConditionalExpression':
          return key === 'test';

        default:
          return false;
      }

    case 'ClassExpression':
      switch (parent.type) {
        case 'NewExpression':
          return key === 'callee';
        case 'ExportDefaultDeclaration':
          return key === 'declaration';
        default:
          return false;
      }
    case 'ChainExpression':
    case 'TSNonNullExpression':
      if (shouldAddParenthesesToChainElement(path)) {
        return true;
      }

    // fallthrough
    case 'CallExpression':
    case 'MemberExpression':
    case 'TaggedTemplateExpression':
    case 'ImportExpression':
      if (key === 'callee' && parent.type === 'NewExpression') {
        let object = node;
        while (object) {
          switch (object.type) {
            case 'CallExpression':
            case 'ImportExpression':
              return true;
            case 'MemberExpression':
              object = object.object;
              break;
            // tagged templates are basically member expressions from a grammar perspective
            // see https://tc39.github.io/ecma262/#prod-MemberExpression
            case 'TaggedTemplateExpression':
              object = object.tag;
              break;
            case 'TSNonNullExpression':
              object = object.expression;
              break;
            default:
              return false;
          }
        }
      }

      return false;

    case 'JSXFragment':
    case 'JSXElement':
      return (
        key === 'callee' ||
        (key === 'left' && parent.type === 'BinaryExpression' && parent.operator === '<') ||
        (!isArrayExpression(parent) &&
          parent.type !== 'ArrowFunctionExpression' &&
          parent.type !== 'AssignmentExpression' &&
          parent.type !== 'AssignmentPattern' &&
          parent.type !== 'BinaryExpression' &&
          parent.type !== 'ConditionalExpression' &&
          parent.type !== 'ExpressionStatement' &&
          parent.type !== 'JSXAttribute' &&
          parent.type !== 'JSXElement' &&
          parent.type !== 'JSXExpressionContainer' &&
          parent.type !== 'JSXFragment' &&
          parent.type !== 'LogicalExpression' &&
          !isCallOrNewExpression(parent) &&
          !isObjectProperty(parent) &&
          !isReturnOrThrowStatement(parent) &&
          parent.type !== 'VariableDeclarator' &&
          parent.type !== 'YieldExpression' &&
          !(key === 'declaration' && parent.type === 'ExportDefaultDeclaration'))
      );

    case 'TSInstantiationExpression':
      return key === 'object' && isMemberExpression(parent);
  }

  return false;
}

const isStatement = createTypeCheckFunction([
  'BlockStatement',
  'BreakStatement',

  'ClassBody',
  'ClassDeclaration',

  'PropertyDefinition',

  'ContinueStatement',
  'DebuggerStatement',

  'DoWhileStatement',

  'ExportAllDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'ExpressionStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'FunctionDeclaration',

  'IfStatement',
  'ImportDeclaration',

  'LabeledStatement',
  'MethodDefinition',
  'ReturnStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TryStatement',
  'TSDeclareFunction',
  'TSEnumDeclaration',
  'TSImportEqualsDeclaration',
  'TSInterfaceDeclaration',
  'TSModuleDeclaration',
  'TSNamespaceExportDeclaration',

  'VariableDeclaration',
  'WhileStatement',
  'WithStatement',
]);

/**
 * @param {AstPath} path
 * @returns {boolean}
 */
function isPathInForStatementInitializer(path) {
  let i = 0;
  let { node } = path;
  while (node) {
    const parent = path.getParentNode(i++);
    if (parent?.type === 'ForStatement' && parent.init === node) {
      return true;
    }
    node = parent;
  }

  return false;
}

function endsWithRightBracket(node) {
  return isObjectExpression(node);
}

/**
 * @param {AstPath} path
 * @returns {boolean}
 */
function isFollowedByRightBracket(path) {
  const { parent, key } = path;
  switch (parent.type) {
    case 'ObjectProperty':
      if (key === 'value') {
        return path.callParent(() => path.key === 'properties' && path.isLast);
      }
      break;
    case 'BinaryExpression':
    case 'LogicalExpression':
      if (key === 'right') {
        return path.callParent(isFollowedByRightBracket);
      }
      break;
    case 'ConditionalExpression':
      if (key === 'alternate') {
        return path.callParent(isFollowedByRightBracket);
      }
      break;
    case 'UnaryExpression':
      if (parent.prefix && path.callParent(isFollowedByRightBracket)) {
        return true;
      }
      break;
  }
  return false;
}

export default needsParentheses;
