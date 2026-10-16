// ESLint's rule no-useless-concat, ported from ESLint 9.39.5 (MIT, see NOTICE.md): ES modules, and what it required replaced by @xufa/lint's.
import __ast_utils122 from './utils/ast-utils.js';
const astUtils = __ast_utils122;
/**
 * @fileoverview disallow unnecessary concatenation of template strings
 * @author Henry Zhu
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether or not a given node is a concatenation.
 * @param {ASTNode} node A node to check.
 * @returns {boolean} `true` if the node is a concatenation.
 */
function isConcatenation(node) {
  return node.type === 'BinaryExpression' && node.operator === '+';
}

/**
 * Checks if the given token is a `+` token or not.
 * @param {Token} token The token to check.
 * @returns {boolean} `true` if the token is a `+` token.
 */
function isConcatOperatorToken(token) {
  return token.value === '+' && token.type === 'Punctuator';
}

/**
 * Get's the right most node on the left side of a BinaryExpression with + operator.
 * @param {ASTNode} node A BinaryExpression node to check.
 * @returns {ASTNode} node
 */
function getLeft(node) {
  let left = node.left;

  while (isConcatenation(left)) {
    left = left.right;
  }
  return left;
}

/**
 * Get's the left most node on the right side of a BinaryExpression with + operator.
 * @param {ASTNode} node A BinaryExpression node to check.
 * @returns {ASTNode} node
 */
function getRight(node) {
  let right = node.right;

  while (isConcatenation(right)) {
    right = right.left;
  }
  return right;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule = {
  meta: {
    type: 'suggestion',

    docs: {
      description: 'Disallow unnecessary concatenation of literals or template literals',
      recommended: false,
      frozen: true,
      url: 'https://eslint.org/docs/latest/rules/no-useless-concat',
    },

    schema: [],

    messages: {
      unexpectedConcat: 'Unexpected string concatenation of literals.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      BinaryExpression(node) {
        // check if not concatenation
        if (node.operator !== '+') {
          return;
        }

        // account for the `foo + "a" + "b"` case
        const left = getLeft(node);
        const right = getRight(node);

        if (
          astUtils.isStringLiteral(left) &&
          astUtils.isStringLiteral(right) &&
          astUtils.isTokenOnSameLine(left, right)
        ) {
          const operatorToken = sourceCode.getFirstTokenBetween(left, right, isConcatOperatorToken);

          context.report({
            node,
            loc: operatorToken.loc,
            messageId: 'unexpectedConcat',
          });
        }
      },
    };
  },
};

export const { meta, create } = rule;
