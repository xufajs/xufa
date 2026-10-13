// The problems of a file: what rules report (context.report(node, message, data, fix), or a descriptor { node or loc,
// message or messageId, data, fix, suggest }), as ESLint makes problems of them — their message (from the rule's
// meta.messages, with {{ data }} put in), their place (lines 1-based, columns 1-based), fix and suggestions — and the
// problems of the linter itself (a rule not found, a wrong comment). A wrong report is a TypeError with ESLint's
// message.

import { fixOf } from './fixer.js';
import replacements from '../data/replacements.json' with { type: 'json' };

const DEFAULT_LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
const PLACEHOLDER = /\{\{([^{}]+)\}\}/gu;

/** A message with its {{ placeholders }} replaced by the data of their names (others kept). */
function interpolate(text, data) {
  if (!data) return text;
  return text.replace(PLACEHOLDER, (placeholder, name) => {
    const key = name.trim();
    return key in data ? data[key] : placeholder;
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// The place of a problem from 0-based columns (what the JavaScript language counts) to 1-based ones.
function place({ line, column, endLine, endColumn }, language) {
  const columnOffset = language.columnStart === 1 ? 0 : 1;
  const lineOffset = language.lineStart === 1 ? 0 : 1;
  return {
    line: line + lineOffset,
    column: column + columnOffset,
    endLine: endLine === undefined ? endLine : endLine + lineOffset,
    endColumn: endColumn === undefined ? endColumn : endColumn + columnOffset,
  };
}

const missingRuleMessage = (ruleId) =>
  Object.hasOwn(replacements.rules, ruleId)
    ? `Rule '${ruleId}' was removed and replaced by: ${replacements.rules[ruleId].join(', ')}`
    : `Definition for rule '${ruleId}' was not found.`;

// A problem of the linter: { ruleId, loc, message } (no message: the rule was not found).
function lintingProblem(options, severity, language) {
  const { ruleId = null, loc = DEFAULT_LOC, message = missingRuleMessage(options.ruleId) } = options;
  const { start, end } = loc;
  return {
    ruleId,
    message,
    ...place({ line: start.line, column: start.column, endLine: end.line, endColumn: end.column }, language),
    severity,
    nodeType: null,
  };
}

// The arguments of context.report() as a descriptor.
function descriptorOf(args) {
  if (args.length === 1) return { ...args[0] };
  if (typeof args[1] === 'string') return { node: args[0], message: args[1], data: args[2], fix: args[3] };
  return { node: args[0], loc: args[1], message: args[2], data: args[3], fix: args[4] };
}

function messageOf(descriptor, messages) {
  if (descriptor.messageId) {
    if (!messages) {
      throw new TypeError(
        'context.report() called with a messageId, but no messages were present in the rule metadata.'
      );
    }
    const id = descriptor.messageId;
    if (descriptor.message) {
      throw new TypeError('context.report() called with a message and a messageId. Please only pass one.');
    }
    if (!Object.hasOwn(messages, id)) {
      throw new TypeError(
        `context.report() called with a messageId of '${id}' which is not present in the 'messages' config: ${JSON.stringify(messages, null, 2)}`
      );
    }
    return messages[id];
  }
  if (descriptor.message) return descriptor.message;
  throw new TypeError('Missing `message` property in report() call; add a message that describes the linting problem.');
}

function checkSuggestions(suggest, messages) {
  if (!suggest || !Array.isArray(suggest)) return;
  for (const suggestion of suggest) {
    if (suggestion.messageId) {
      const { messageId } = suggestion;
      if (!messages) {
        throw new TypeError(
          `context.report() called with a suggest option with a messageId '${messageId}', but no messages were present in the rule metadata.`
        );
      }
      if (!messages[messageId]) {
        throw new TypeError(
          `context.report() called with a suggest option with a messageId '${messageId}' which is not present in the 'messages' config: ${JSON.stringify(messages, null, 2)}`
        );
      }
      if (suggestion.desc) {
        throw new TypeError(
          "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one."
        );
      }
    } else if (!suggestion.desc) {
      throw new TypeError(
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`"
      );
    }
    if (typeof suggestion.fix !== 'function') {
      throw new TypeError(
        `context.report() called with a suggest option without a fix function. See: ${JSON.stringify(suggestion, null, 2)}`
      );
    }
  }
}

// The suggestions of a report with a fix each (their description from desc or messages, with data put in).
function suggestionsOf(descriptor, sourceCode, messages) {
  if (!descriptor.suggest || !Array.isArray(descriptor.suggest)) return [];
  return descriptor.suggest
    .map((suggestion) => ({
      ...suggestion,
      desc: interpolate(suggestion.desc || messages[suggestion.messageId], suggestion.data),
      fix: fixOf(suggestion, sourceCode),
    }))
    .filter(({ fix }) => fix);
}

class FileReport {
  messages = [];
  #ruleMapper;
  #sourceCode;
  #language;
  #disableFixes;

  constructor({ ruleMapper, sourceCode, language, disableFixes = false }) {
    this.#ruleMapper = ruleMapper;
    this.#sourceCode = sourceCode;
    this.#language = language;
    this.#disableFixes = disableFixes;
  }

  /** A rule's report (the arguments of context.report()) as a problem; returns it. */
  addRuleMessage(ruleId, severity, ...args) {
    const descriptor = descriptorOf(args);
    const messages = this.#ruleMapper(ruleId)?.meta?.messages;
    if (descriptor.node) check(typeof descriptor.node === 'object', 'Node must be an object');
    else check(descriptor.loc, 'Node must be provided when reporting error if location is not provided');
    const template = messageOf(descriptor, messages);
    checkSuggestions(descriptor.suggest, messages);
    // In ESLint's order: the message, the place, the fix, the suggestions.
    const message = interpolate(template, descriptor.data);
    let loc;
    if (!descriptor.loc) loc = this.#sourceCode.getLoc(descriptor.node);
    else loc = descriptor.loc.start ? descriptor.loc : { start: descriptor.loc, end: null };
    const fix = this.#disableFixes ? null : fixOf(descriptor, this.#sourceCode);
    const suggestions = this.#disableFixes ? [] : suggestionsOf(descriptor, this.#sourceCode, messages);
    const columnOffset = this.#language.columnStart === 1 ? 0 : 1;
    const lineOffset = this.#language.lineStart === 1 ? 0 : 1;
    const problem = {
      ruleId,
      severity,
      message,
      line: loc.start.line + lineOffset,
      column: loc.start.column + columnOffset,
      nodeType: (descriptor.node && descriptor.node.type) || null,
    };
    if (descriptor.messageId) problem.messageId = descriptor.messageId;
    if (loc.end) {
      problem.endLine = loc.end.line + lineOffset;
      problem.endColumn = loc.end.column + columnOffset;
    }
    if (fix) problem.fix = fix;
    if (suggestions.length > 0) problem.suggestions = suggestions;
    this.messages.push(problem);
    return problem;
  }

  addError(descriptor) {
    const problem = lintingProblem(descriptor, 2, this.#language);
    this.messages.push(problem);
    return problem;
  }

  addFatal(descriptor) {
    const problem = lintingProblem(descriptor, 2, this.#language);
    problem.fatal = true;
    this.messages.push(problem);
    return problem;
  }

  addWarning(descriptor) {
    const problem = lintingProblem(descriptor, 1, this.#language);
    this.messages.push(problem);
    return problem;
  }
}

export { FileReport, interpolate };
