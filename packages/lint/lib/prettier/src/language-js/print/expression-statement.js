import { printComments, printLeadingComments } from '../../main/comments/print.js';
import {
  isSingleJsxExpressionStatementInMarkdown,
  shouldExpressionStatementPrintLeadingSemicolon,
} from '../semicolon/semicolon.js';
import { CommentCheckFlags, getComments } from '../utilities/comments.js';
import { shouldExpressionStatementPrintOwnComments } from '../utilities/should-expression-statement-print-own-comments.js';

/**
@import {Doc} from "../../document/index.js"
*/

function shouldPrintSemicolon(path, options) {
  if (!options.semi) {
    return false;
  }

  // Do not append semicolon after the only JSX element in a program
  if (isSingleJsxExpressionStatementInMarkdown(path, options)) {
    return false;
  }

  return true;
}

function printExpressionStatement(path, options, print) {
  /** @type {Doc[]} */
  const parts = [print('expression')];

  if (shouldExpressionStatementPrintLeadingSemicolon(path, options)) {
    if (shouldExpressionStatementPrintOwnComments(path, options)) {
      const { node } = path;
      const typeCastComment = getComments(node, CommentCheckFlags.Leading).at(-1);

      // Print the type cast comment separately and print `;` before it
      const typeCastCommentDoc = printLeadingComments(path, options, {
        filter: (comment) => comment === typeCastComment,
      });

      return printComments(path, [';', typeCastCommentDoc, ...parts], options, {
        filter: (comment) => comment !== typeCastComment,
      });
    }

    parts.unshift(';');
  } else if (shouldPrintSemicolon(path, options)) {
    parts.push(';');
  }

  return parts;
}

export { printExpressionStatement };
