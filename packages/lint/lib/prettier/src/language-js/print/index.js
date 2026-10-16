import { group, indent, inheritLabel, softline } from '../../document/index.js';
import { printComments } from '../../main/comments/print.js';
import isNonEmptyArray from '../../utilities/is-non-empty-array.js';
import needsParentheses from '../parentheses/needs-parentheses.js';
import { CommentCheckFlags, hasComment } from '../utilities/comments.js';
import { createTypeCheckFunction } from '../utilities/create-type-check-function.js';
import isIgnored from '../utilities/is-ignored.js';
import { isIifeCalleeOrTaggedTemplateExpressionTag } from '../utilities/is-iife-callee-or-tagged-template-expression-tag.js';
import { printDecorators } from './decorators.js';
import { printEstree } from './estree.js';
import { printIgnored } from './ignored.js';
import { printJsx } from './jsx.js';
import { printTypescript } from './typescript.js';

/**
 * @import AstPath from "../../common/ast-path.js"
 * @import {Doc} from "../../document/index.js"
 */

const PRINTERS = [printJsx, printTypescript, printEstree];
// @xufa/lint: the printer of each type of node, from the first node of it printed. Which printer prints a node
// depends on its type only (JSX and TypeScript by its prefix, estree the rest), so
// the others need not be asked again: they were asked for every node, a million times a round.
const printerOfType = new Map();

function printWithoutParentheses(path, options, print, args) {
  const { type } = path.node;
  const known = printerOfType.get(type);
  if (known !== undefined) {
    return known(path, options, print, args);
  }
  for (const printer of PRINTERS) {
    const doc = printer(path, options, print, args);
    if (doc !== undefined) {
      printerOfType.set(type, printer);
      return doc;
    }
  }
}

// Their decorators are handled themselves, and they don't need parentheses or leading semicolons
const shouldPrintDirectly = createTypeCheckFunction([
  'AccessorProperty',
  'TSAbstractAccessorProperty',
  'PropertyDefinition',
  'TSAbstractPropertyDefinition',

  'MethodDefinition',
  'TSAbstractMethodDefinition',
]);

/**
 * @param {AstPath} path
 * @param {*} options
 * @param {*} print
 * @param {*} [args]
 * @returns {Doc}
 */
function print(path, options, print, args) {
  if (path.isRoot) {
    options.__onHtmlBindingRoot?.(path.node, options);
  }

  const { node } = path;

  let doc = isIgnored(path) ? printIgnored(path, options) : printWithoutParentheses(path, options, print, args);
  if (!doc) {
    return '';
  }

  if (shouldPrintDirectly(node)) {
    return doc;
  }

  doc = printCommentsForFunction(path, options, doc);

  const decoratorsDoc =
    // `ClassExpression` prints own decorators
    node.type !== 'ClassExpression' && isNonEmptyArray(node.decorators) ? printDecorators(path, options, print) : '';

  const needsParens = needsParentheses(path, options);

  if (!decoratorsDoc && !needsParens) {
    return doc;
  }

  return inheritLabel(doc, (doc) => [
    needsParens ? '(' : '',
    decoratorsDoc ? group([decoratorsDoc, doc]) : doc,
    needsParens ? ')' : '',
  ]);
}

function printCommentsForFunction(path, options, doc) {
  const { node } = path;

  if (
    (hasComment(node, CommentCheckFlags.Leading) || hasComment(node, CommentCheckFlags.Trailing)) &&
    isIifeCalleeOrTaggedTemplateExpressionTag(path)
  ) {
    return [indent([softline, printComments(path, doc, options)]), softline];
  }

  return doc;
}

export { print as printEstree };
