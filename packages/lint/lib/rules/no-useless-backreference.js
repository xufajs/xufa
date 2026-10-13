// Backreferences that always match the empty string, in regex literals and in RegExp() calls with a constant
// pattern: those to a group they are inside of, to a group that comes later (or earlier, inside a lookbehind), to a
// group in another alternative, and to a group in a negative lookaround they are not inside of. A backreference
// to several groups (duplicate names) is reported only when every one of them is useless.

import { CALL, CONSTRUCT, ReferenceTracker } from '../ast/reference-tracker.js';
import { getStringIfConstant } from '../ast/static-value.js';
import { RegExpParser, visitRegExpAST } from '../regexp/index.js';

const parser = new RegExpParser();
const TRACE_MAP = { RegExp: { [CALL]: true, [CONSTRUCT]: true } };

/** The node and its ancestors, up to the pattern. */
function getPathToRoot(node) {
  const path = [];
  for (let current = node; current; current = current.parent) path.push(current);
  return path;
}

const isLookaround = (node) => node.type === 'Assertion' && (node.kind === 'lookahead' || node.kind === 'lookbehind');
const isNegativeLookaround = (node) => isLookaround(node) && node.negate;

/** Why a backreference to `group` is useless (a messageId), or null when it is not. */
function getProblem(bref, brefPath, group) {
  // The group has not matched yet while matching its own content.
  if (brefPath.includes(group)) return 'nested';

  // Walk down from the root while both paths agree, to find the lowest common ancestor.
  const groupPath = getPathToRoot(group);
  let i = brefPath.length - 1;
  let j = groupPath.length - 1;
  do {
    i--;
    j--;
  } while (brefPath[i] === groupPath[j]);

  // groupPath[0..j] is the group's side below the common ancestor, groupPath[j + 1..] the common path.
  if (groupPath[j].type === 'Alternative') return 'disjunctive';
  let backward = false;
  for (let k = j + 1; k < groupPath.length; k++) {
    if (isLookaround(groupPath[k])) {
      backward = groupPath[k].kind === 'lookbehind';
      break;
    }
  }
  if (!backward && bref.end <= group.start) return 'forward';
  if (backward && group.end <= bref.start) return 'backward';
  for (let k = 0; k <= j; k++) if (isNegativeLookaround(groupPath[k])) return 'intoNegativeLookaround';
  return null;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow useless backreferences in regular expressions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-useless-backreference',
  },
  schema: [],
  messages: {
    nested:
      "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}'{{ otherGroups }} from within that group.",
    forward:
      "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}'{{ otherGroups }} which appears later in the pattern.",
    backward:
      "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}'{{ otherGroups }} which appears before in the same lookbehind.",
    disjunctive:
      "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}'{{ otherGroups }} which is in another alternative.",
    intoNegativeLookaround:
      "Backreference '{{ bref }}' will be ignored. It references group '{{ group }}'{{ otherGroups }} which is in a negative lookaround.",
  },
};

export function create(context) {
  const { sourceCode } = context;

  function onBackreference(node, bref) {
    const brefPath = getPathToRoot(bref);
    const problems = [];
    for (const group of [bref.resolved].flat()) {
      const messageId = getProblem(bref, brefPath, group);
      // Useful through one of its groups.
      if (!messageId) return;
      problems.push({ messageId, group });
    }
    if (!problems.length) return;

    // Groups in other alternatives matter only when all of them are.
    const sameDisjunction = problems.filter((problem) => problem.messageId !== 'disjunctive');
    const [{ messageId, group }, ...other] = sameDisjunction.length ? sameDisjunction : problems;
    let otherGroups = '';
    if (other.length === 1) otherGroups = ' and another group';
    else if (other.length > 1) otherGroups = ` and other ${other.length} groups`;
    context.report({ node, messageId, data: { bref: bref.raw, group: group.raw, otherGroups } });
  }

  function checkRegex(node, pattern, flags) {
    let ast;
    try {
      ast = parser.parsePattern(pattern, 0, pattern.length, {
        unicode: flags.includes('u'),
        unicodeSets: flags.includes('v'),
      });
    } catch {
      return;
    }
    visitRegExpAST(ast, { onBackreferenceEnter: (bref) => onBackreference(node, bref) });
  }

  return {
    Literal(node) {
      if (node.regex) checkRegex(node, node.regex.pattern, node.regex.flags);
    },

    Program(node) {
      const scope = sourceCode.getScope(node);
      const tracker = new ReferenceTracker(scope);
      for (const { node: refNode } of tracker.iterateGlobalReferences(TRACE_MAP)) {
        const [patternNode, flagsNode] = refNode.arguments;
        const pattern = getStringIfConstant(patternNode, scope);
        if (typeof pattern === 'string') checkRegex(refNode, pattern, getStringIfConstant(flagsNode, scope) || '');
      }
    },
  };
}
