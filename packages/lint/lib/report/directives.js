// eslint-disable comments on problems: a problem after a disable (of its rule, or of all) and not after an enable is
// suppressed (it gets `suppressions`); disable-line and disable-next-line are a disable and an enable around their
// line. With reportUnusedDisableDirectives, the directives that suppress nothing (and the enables that end no
// disable) are reported, with a fix that removes them (their rule from the list, or the whole comment).
//
//   applyDisableDirectives({ language, sourceCode, directives, problems, disableFixes, configuredRules, ruleFilter,
//     reportUnusedDisableDirectives: 'off' | 'warn' | 'error' }) -> problems
//
// A directive: { type, line, column, ruleId (null: all), justification, parentDirective: { node, value, ruleIds } }.

import escapeRegExp from '../util/escape-regexp.js';
import { normalizeSeverityToNumber } from '../util/severity.js';

const byLocation = (a, b) => a.line - b.line || a.column - b.column;

// The severity of a rule's setting as a number (0 when it is not one).
function severityOf(setting) {
  try {
    return normalizeSeverityToNumber(Array.isArray(setting) ? setting[0] : setting);
  } catch {
    return 0;
  }
}

// The fixes that remove unused directives: their rules from the comment's list, or the whole comment if none is left.
function removalsOf(unused, sourceCode) {
  const byComment = new Map();
  for (const directive of unused) {
    const { parentDirective } = directive.unprocessedDirective;
    if (byComment.has(parentDirective)) byComment.get(parentDirective).push(directive);
    else byComment.set(parentDirective, [directive]);
  }
  return [...byComment.values()].flatMap((directives) => {
    const { parentDirective } = directives[0].unprocessedDirective;
    const remaining = new Set(parentDirective.ruleIds);
    for (const directive of directives) remaining.delete(directive.ruleId);
    return remaining.size
      ? ruleRemovals(directives, parentDirective, sourceCode)
      : [commentRemoval(directives, parentDirective.node, sourceCode)];
  });
}

// Rules removed from a comment's list (with one of their commas).
function ruleRemovals(directives, parentDirective, sourceCode) {
  const listText = parentDirective.value.trim();
  const listStart = sourceCode.text.indexOf(listText, sourceCode.getRange(parentDirective.node)[0]);
  return directives.map((directive) => {
    const { ruleId } = directive;
    const pattern = new RegExp(
      String.raw`(?:^|\s*,\s*)(?<quote>['"]?)${escapeRegExp(ruleId)}\k<quote>(?:\s*,\s*|$)`,
      'u'
    );
    const match = pattern.exec(listText);
    const matchStart = listStart + match.index;
    const firstComma = match[0].indexOf(',');
    const lastComma = match[0].lastIndexOf(',');
    // Between commas, one of them stays.
    const range =
      firstComma !== lastComma
        ? [matchStart + firstComma, matchStart + lastComma]
        : [matchStart, matchStart + match[0].length];
    return {
      description: `'${ruleId}'`,
      fix: { range, text: '' },
      unprocessedDirective: directive.unprocessedDirective,
    };
  });
}

// A comment removed (a space for it).
function commentRemoval(directives, node, sourceCode) {
  const ruleIds = directives.filter((directive) => directive.ruleId).map((directive) => `'${directive.ruleId}'`);
  return {
    description:
      ruleIds.length <= 2 ? ruleIds.join(' or ') : `${ruleIds.slice(0, -1).join(', ')}, or ${ruleIds.at(-1)}`,
    fix: { range: sourceCode.getRange(node), text: ' ' },
    unprocessedDirective: directives[0].unprocessedDirective,
  };
}

// The enables that end a disable (walking from the end: an enable is used by a disable before it of its rule).
function usedEnables(directives) {
  const enabled = new Map();
  const used = new Set();
  for (let i = directives.length - 1; i >= 0; i--) {
    const directive = directives[i];
    if (directive.type === 'disable') {
      if (enabled.size === 0) continue;
      if (directive.ruleId === null) {
        for (const enable of enabled.values()) used.add(enable);
        enabled.clear();
      } else {
        const enable = enabled.get(directive.ruleId) ?? enabled.get(null);
        if (enable) used.add(enable);
      }
    } else if (directive.type === 'enable') {
      if (directive.ruleId === null) enabled.clear();
      enabled.set(directive.ruleId, directive);
    }
  }
  return used;
}

// Directives (in order) on problems: the problems with their suppressions, and the problems of unused directives.
function applyDirectives({
  language,
  sourceCode,
  problems,
  directives,
  disableFixes,
  reportUnusedDisableDirectives,
  rulesToIgnore,
}) {
  const out = [];
  const usedDisables = new Set();
  for (const problem of problems) {
    let disables = [];
    for (let i = 0; i < directives.length && byLocation(directives[i], problem) <= 0; i++) {
      const directive = directives[i];
      if (directive.ruleId !== null && directive.ruleId !== problem.ruleId) continue;
      if (directive.type === 'disable') disables.push(directive);
      else if (directive.type === 'enable') disables = [];
    }
    if (disables.length > 0) {
      const suppressions = disables.map((directive) => ({
        kind: 'directive',
        justification: directive.unprocessedDirective.justification,
      }));
      if (problem.suppressions) {
        problem.suppressions = problem.suppressions.concat(suppressions);
      } else {
        problem.suppressions = suppressions;
        usedDisables.add(disables.at(-1));
      }
    }
    out.push(problem);
  }
  const unusedDisables = directives.filter(
    (directive) => directive.type === 'disable' && !usedDisables.has(directive) && !rulesToIgnore.has(directive.ruleId)
  );
  const unusedEnables = new Set(
    directives.filter(
      (directive) => directive.unprocessedDirective.type === 'enable' && !rulesToIgnore.has(directive.ruleId)
    )
  );
  if (unusedEnables.size > 0) for (const directive of usedEnables(directives)) unusedEnables.delete(directive);
  const columnOffset = language.columnStart === 1 ? 0 : 1;
  const lineOffset = language.lineStart === 1 ? 0 : 1;
  const unused = removalsOf(unusedDisables, sourceCode)
    .concat(removalsOf(unusedEnables, sourceCode))
    .map(({ description, fix, unprocessedDirective }) => {
      const { parentDirective, type, line, column } = unprocessedDirective;
      let message;
      if (type === 'enable') {
        message = description
          ? `Unused eslint-enable directive (no matching eslint-disable directives were found for ${description}).`
          : 'Unused eslint-enable directive (no matching eslint-disable directives were found).';
      } else {
        message = description
          ? `Unused eslint-disable directive (no problems were reported from ${description}).`
          : 'Unused eslint-disable directive (no problems were reported).';
      }
      const loc = sourceCode.getLoc(parentDirective.node);
      const nextLine = type === 'disable-next-line';
      return {
        ruleId: null,
        message,
        line: nextLine ? loc.start.line + lineOffset : line,
        column: nextLine ? loc.start.column + columnOffset : column,
        severity: reportUnusedDisableDirectives === 'warn' ? 1 : 2,
        nodeType: null,
        ...(disableFixes ? {} : { fix }),
      };
    });
  return { problems: out, unusedDirectives: unused };
}

// A disable-line or disable-next-line as a disable and an enable around its line.
function lineDirectivesOf(directive) {
  switch (directive.type) {
    case 'disable':
    case 'enable':
      return [];
    case 'disable-line':
    case 'disable-next-line': {
      const line = directive.type === 'disable-line' ? directive.line : directive.line + 1;
      const { ruleId } = directive;
      return [
        { type: 'disable', line, column: 1, ruleId, unprocessedDirective: directive },
        { type: 'enable', line: line + 1, column: 0, ruleId, unprocessedDirective: directive },
      ];
    }
    default:
      throw new TypeError(`Unrecognized directive type '${directive.type}'`);
  }
}

function applyDisableDirectives({
  language,
  sourceCode,
  directives,
  disableFixes,
  problems,
  configuredRules,
  ruleFilter,
  reportUnusedDisableDirectives = 'off',
}) {
  const blockDirectives = directives
    .filter((directive) => directive.type === 'disable' || directive.type === 'enable')
    .map((directive) => ({ ...directive, unprocessedDirective: directive }))
    .sort(byLocation);
  const lineDirectives = directives.flatMap(lineDirectivesOf).sort(byLocation);
  // Rules a filter leaves out: their directives are not reported unused.
  const rulesToIgnore =
    configuredRules && ruleFilter
      ? new Set(
          Object.keys(configuredRules).filter((ruleId) => {
            const severity = severityOf(configuredRules[ruleId]);
            return severity !== 0 && !ruleFilter({ severity, ruleId });
          })
        )
      : new Set();
  if (rulesToIgnore.size > 0) rulesToIgnore.add(null);
  const common = { language, sourceCode, disableFixes, reportUnusedDisableDirectives, rulesToIgnore };
  const block = applyDirectives({ ...common, problems, directives: blockDirectives });
  const line = applyDirectives({ ...common, problems: block.problems, directives: lineDirectives });
  if (reportUnusedDisableDirectives === 'off') return line.problems;
  return line.problems.concat(block.unusedDirectives).concat(line.unusedDirectives).sort(byLocation);
}

export { applyDisableDirectives };
