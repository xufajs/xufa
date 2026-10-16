import needsParentheses from '../parentheses/needs-parentheses.js';
import { shouldPrintParamsWithoutParens } from '../print/function.js';
import { getLeftSidePathName, hasNakedLeftSide } from '../utilities/left-side.js';
import { isJsxElement } from '../utilities/node-types.js';

function shouldExpressionStatementPrintLeadingSemicolon(path, options) {
  if (options.semi) {
    return false;
  }

  const { node } = path;

  if (node.type !== 'ExpressionStatement' || isSingleJsxExpressionStatementInMarkdown(path, options)) {
    return false;
  }

  const { key, parent } = path;
  if (
    // `Program.directives` don't need leading semicolon
    ((key === 'body' &&
      (parent.type === 'Program' ||
        parent.type === 'BlockStatement' ||
        parent.type === 'StaticBlock' ||
        parent.type === 'TSModuleBlock')) ||
      (key === 'consequent' && parent.type === 'SwitchCase')) &&
    path.call(() => expressionNeedsAsiProtection(path, options), 'expression')
  ) {
    return true;
  }

  return false;
}

function expressionNeedsAsiProtection(path, options) {
  const { node } = path;
  switch (node.type) {
    case 'ParenthesizedExpression':
    case 'TSTypeAssertion':
    case 'ArrayExpression':
    case 'ArrayPattern':
    case 'TemplateLiteral':
    case 'TemplateElement':
      return true;

    case 'ArrowFunctionExpression':
      if (!shouldPrintParamsWithoutParens(path, options)) {
        return true;
      }
      break;

    case 'UnaryExpression': {
      const { prefix, operator } = node;
      if (prefix && (operator === '+' || operator === '-')) {
        return true;
      }
      break;
    }

    case 'Literal':
      if (node.regex) {
        return true;
      }
      break;

    default:
      if (isJsxElement(node)) {
        return true;
      }
  }

  if (needsParentheses(path, options)) {
    return true;
  }

  if (!hasNakedLeftSide(node)) {
    return false;
  }

  return path.call(() => expressionNeedsAsiProtection(path, options), ...getLeftSidePathName(node));
}

const isSingleExpressionStatement = ({ node, parent }) =>
  node.type === 'ExpressionStatement' &&
  parent.type === 'Program' &&
  parent.body.length === 1 &&
  // In non-Babel parser, directives are `ExpressionStatement`s
  ((Array.isArray(parent.directives) && parent.directives.length === 0) || !parent.directives);

function isSingleJsxExpressionStatementInMarkdown(path, options) {
  return options.parentParser === 'markdown' && isSingleExpressionStatement(path) && isJsxElement(path.node.expression);
}

export { isSingleJsxExpressionStatementInMarkdown, shouldExpressionStatementPrintLeadingSemicolon };
