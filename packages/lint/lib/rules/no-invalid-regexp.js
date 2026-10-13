// Invalid `RegExp(pattern, flags)` and `new RegExp(...)` calls: unknown flags (beyond dgimsuvy and the
// allowConstructorFlags), duplicate flags, both `u` and `v`, and a string pattern that does not parse with the flags
// (when they are not a string literal, one that parses with neither `u`, `v` nor none of them).

import { RegExpValidator } from '../regexp/index.js';

const validator = new RegExpValidator();
const VALID_FLAGS = 'dgimsuvy';
const VALID_FLAG_CHARS = new RegExp(`[${VALID_FLAGS}]`, 'gu');
const UNICODE = { unicode: true, unicodeSets: false };
const UNICODE_SETS = { unicode: false, unicodeSets: true };
const NON_UNICODE = { unicode: false, unicodeSets: false };

/** Whether a node is a string literal. */
const isString = (node) => node?.type === 'Literal' && typeof node.value === 'string';

/** The syntax error of a pattern with the flags, or null. */
function validatePattern(pattern, flags) {
  try {
    validator.validatePattern(pattern, undefined, undefined, flags);
    return null;
  } catch (error) {
    return error.message;
  }
}

export const meta = {
  type: 'problem',
  defaultOptions: [{}],
  docs: {
    description: 'Disallow invalid regular expression strings in `RegExp` constructors',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-invalid-regexp',
  },
  schema: [
    {
      type: 'object',
      properties: {
        allowConstructorFlags: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    regexMessage: '{{message}}.',
  },
};

export function create(context) {
  const [{ allowConstructorFlags }] = context.options;
  const extraFlags = allowConstructorFlags?.join('').replace(VALID_FLAG_CHARS, '');
  const allFlags = [...VALID_FLAGS, ...new Set(extraFlags)];

  /** The error in the flags (a string, or null when unknown), or null. */
  function validateFlags(flags) {
    if (!flags) return null;
    // What is left after taking each known flag once: duplicates and unknown flags.
    let rest = flags;
    for (const flag of allFlags) rest = rest.replace(flag, '');
    // regexpp checks `u` with `v` while parsing the pattern, but the pattern may not be known.
    if (flags.includes('u') && flags.includes('v')) return "Regex 'u' and 'v' flags cannot be used together";
    const duplicates = [...rest].filter((flag) => allFlags.includes(flag));
    if (duplicates.length) return `Duplicate flags ('${duplicates.join('')}') supplied to RegExp constructor`;
    return rest ? `Invalid flags supplied to RegExp constructor '${rest}'` : null;
  }

  /** The error in a pattern with the flags (with unknown flags, the error without `u`, if `v` and `u` fail too). */
  function validatePatternWithFlags(pattern, flags) {
    if (flags !== null) {
      return validatePattern(pattern, { unicode: flags.includes('u'), unicodeSets: flags.includes('v') });
    }
    return (
      validatePattern(pattern, UNICODE) &&
      validatePattern(pattern, UNICODE_SETS) &&
      validatePattern(pattern, NON_UNICODE)
    );
  }

  /** Reports a `RegExp(...)` call with invalid flags or pattern. */
  function check(node) {
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') return;
    const { arguments: args } = node;
    let flags = '';
    if (args.length >= 2) flags = isString(args[1]) ? args[1].value : null;
    const message = validateFlags(flags) || (isString(args[0]) ? validatePatternWithFlags(args[0].value, flags) : null);
    if (message) context.report({ node, messageId: 'regexMessage', data: { message } });
  }

  return {
    CallExpression: check,
    NewExpression: check,
  };
}
