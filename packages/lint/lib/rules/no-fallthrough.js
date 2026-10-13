// Switch cases that fall through: a case whose end is reachable, not the last one, with statements (or, without
// allowEmptyCase, empty but followed by a blank line), and no comment matching the fallthrough pattern (by default
// "falls through") just before the next case or, when its only statement is a block, at the end of that block. The
// next case is reported. With reportUnusedFallthroughComment, such a comment after a case that cannot fall through is
// reported too.

import { DIRECTIVE_LABEL } from '../source-code/comments.js';

const DEFAULT_FALLTHROUGH_COMMENT = /falls?\s?through/iu;

/** Whether any of the segments is reachable. */
function isAnySegmentReachable(segments) {
  for (const segment of segments) {
    if (segment.reachable) return true;
  }
  return false;
}

export const meta = {
  type: 'problem',
  defaultOptions: [{ allowEmptyCase: false, reportUnusedFallthroughComment: false }],
  docs: {
    description: 'Disallow fallthrough of `case` statements',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-fallthrough',
  },
  schema: [
    {
      type: 'object',
      properties: {
        commentPattern: { type: 'string' },
        allowEmptyCase: { type: 'boolean' },
        reportUnusedFallthroughComment: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    unusedFallthroughComment: 'Found a comment that would permit fallthrough, but case cannot fall through.',
    case: "Expected a 'break' statement before 'case'.",
    default: "Expected a 'break' statement before 'default'.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ allowEmptyCase, commentPattern, reportUnusedFallthroughComment }] = context.options;
  const pattern = commentPattern ? new RegExp(commentPattern, 'u') : DEFAULT_FALLTHROUGH_COMMENT;
  const segmentsStack = [];
  let segments = new Set();
  const enterSegment = (segment) => segments.add(segment);
  const exitSegment = (segment) => segments.delete(segment);

  // The case that just ended, checked when the next one starts: its leading comments are the ones that count
  // (trailing comments are wrong when semicolons are left out).
  let previous = null;

  /** Whether a comment permits fallthrough (and is not a directive). */
  const isFallthroughComment = (comment) => pattern.test(comment.value) && !DIRECTIVE_LABEL.test(comment.value.trim());

  /** The fallthrough comment of a case followed by `next`, or null. */
  function getFallthroughComment(node, next) {
    const [first] = node.consequent;
    if (node.consequent.length === 1 && first.type === 'BlockStatement') {
      const comment = sourceCode.getCommentsBefore(sourceCode.getLastToken(first)).at(-1);
      if (comment && isFallthroughComment(comment)) return comment;
    }
    const comment = sourceCode.getCommentsBefore(next).at(-1);
    return comment && isFallthroughComment(comment) ? comment : null;
  }

  return {
    onCodePathStart() {
      segmentsStack.push(segments);
      segments = new Set();
    },
    onCodePathEnd() {
      segments = segmentsStack.pop();
    },
    onCodePathSegmentStart: enterSegment,
    onUnreachableCodePathSegmentStart: enterSegment,
    onCodePathSegmentEnd: exitSegment,
    onUnreachableCodePathSegmentEnd: exitSegment,

    SwitchCase(node) {
      if (previous?.node.parent === node.parent) {
        const comment = getFallthroughComment(previous.node, node);
        if (previous.isFallthrough && !comment) {
          context.report({ messageId: node.test ? 'case' : 'default', node });
        } else if (reportUnusedFallthroughComment && !previous.isExitReachable && comment) {
          context.report({ messageId: 'unusedFallthroughComment', node: comment });
        }
      }
      previous = null;
    },

    'SwitchCase:exit'(node) {
      // The end of a case is unreachable after `break`, `return`, `throw`...
      const isExitReachable = isAnySegmentReachable(segments);
      const isFallthrough =
        isExitReachable &&
        (node.consequent.length > 0 ||
          (!allowEmptyCase && sourceCode.getTokenAfter(node).loc.start.line > node.loc.end.line + 1)) &&
        node.parent.cases.at(-1) !== node;
      previous = { node, isExitReachable, isFallthrough };
    },
  };
}
