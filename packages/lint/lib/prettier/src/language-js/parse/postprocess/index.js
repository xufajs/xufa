import { commentsPropertyInOptions } from '../../../constants.js';
import { locEnd, locEndWithFullText, locStart, shouldAddContentEnd } from '../../location/index.js';
import { isTypeCastComment } from '../../utilities/is-type-cast-comment.js';
import { stripComments } from '../../utilities/strip-comments.js';
import { mergeNestledJsdocComments } from './merge-nestled-jsdoc-comments.js';

/**
@import {Node, Comment, NodeMap} from "../../types/estree.js"
*/

/**
@param {{
  text: string,
  astType?:
    | "espree"
    | "flow"
    | "hermes"
    | "meriyah"
    | "oxc-js"
    | "oxc-ts"
    | "yuku-js"
    | "yuku-ts"
    | "typescript"
}} options
*/
function postprocess(ast, options) {
  const { text, astType } = options;
  const { comments } = ast;

  mergeNestledJsdocComments(comments);

  // `InterpreterDirective` from babel parser and flow parser
  // Other parsers parse it as comment, babel treat it as comment too
  // https://github.com/babel/babel/issues/15116
  const program = ast;
  if (program.interpreter) {
    comments.unshift(program.interpreter);
    delete program.interpreter;
  }

  if (ast.hashbang) {
    if (astType === 'oxc-ts' || astType === 'yuku-js' || astType === 'yuku-ts') {
      comments.unshift(ast.hashbang);
    }
    delete ast.hashbang;
  }

  // In `typescript` and `flow`, `Program` doesn't count whitespace and comments
  // See https://github.com/typescript-eslint/typescript-eslint/issues/11026
  // See https://github.com/facebook/flow/issues/8537
  if (ast.type === 'Program') {
    ast.range = [0, text.length];
  }

  let typeCastCommentsEnds;

  // @xufa/lint: the nodes to change, as the converter lists them while it makes them (children first: prettier's walk
  // of the tree, which this replaces, left them in that order); what replaces a node takes its place in the same object.
  for (const node of options.postprocessed) {
    setContentEnd(node, comments, text);
    switch (node.type) {
      case 'ParenthesizedExpression': {
        const { expression } = node;
        const start = locStart(node);
        if (!typeCastCommentsEnds) {
          typeCastCommentsEnds = [];
          for (const comment of comments) {
            if (isTypeCastComment(comment)) {
              typeCastCommentsEnds.push(locEnd(comment));
            }
          }
        }
        const previousCommentEnd = typeCastCommentsEnds.findLast((end) => end <= start);
        const shouldKeepParenthesizedExpression =
          previousCommentEnd && text.slice(previousCommentEnd, start).trim().length === 0;
        if (!shouldKeepParenthesizedExpression) {
          expression.extra = { ...expression.extra, parenthesized: true };
          replaceWith(node, expression);
        }
        break;
      }
      case 'TemplateElement': {
        const start = locStart(node) + 1;
        const end = locEnd(node) - (node.tail ? 1 : 2);
        node.range = [start, end];
        break;
      }
      case 'TSUnionType':
      case 'TSIntersectionType':
        if (node.types.length === 1) {
          replaceWith(node, node.types[0]);
        }
        break;
      case 'LogicalExpression':
        if (isUnbalancedLogicalTree(node)) {
          replaceWith(node, rebalanceLogicalTree(node));
        }
        break;
    }
  }
  return ast;
}

// What replaces a node, in its object: the tree keeps the object, with the other's properties only.
function replaceWith(node, replacement) {
  for (const key of Object.keys(node)) {
    delete node[key];
  }
  Object.assign(node, replacement);
}

function isUnbalancedLogicalTree(node) {
  return (
    node.type === 'LogicalExpression' &&
    node.right.type === 'LogicalExpression' &&
    node.operator === node.right.operator
  );
}

function rebalanceLogicalTree(node) {
  if (!isUnbalancedLogicalTree(node)) {
    return node;
  }

  return rebalanceLogicalTree({
    type: 'LogicalExpression',
    operator: node.operator,
    left: rebalanceLogicalTree({
      type: 'LogicalExpression',
      operator: node.operator,
      left: node.left,
      right: node.right.left,
      range: [locStart(node.left), locEnd(node.right.left)],
    }),
    right: node.right.right,
    range: [locStart(node), locEnd(node)],
  });
}

/**
@param {Node} node
@param {Comment[]} comments
@param {string} originalText
*/
function setContentEnd(node, comments, originalText) {
  if (!shouldAddContentEnd(node)) {
    return;
  }

  let end = locEndWithFullText(node);
  if (originalText[end - 1] !== ';') {
    return;
  }

  const text = stripComments({
    [commentsPropertyInOptions]: comments,
    originalText,
  });

  end -= 1;
  const textBeforeSemicolon = text.slice(locStart(node), end);
  const cleaned = textBeforeSemicolon.trimEnd();

  node.__contentEnd = end - (textBeforeSemicolon.length - cleaned.length);
}

export default postprocess;
