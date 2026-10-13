// The linter: a file's text and a config to the problems of its rules, as ESLint 9's Linter (flat config) makes them:
// the file parsed (TypeScript's parser into ESTree) into its SourceCode (lib/source-code: scopes, globals, tokens), the
// rules' listeners run over its traversal (lib/ast/listeners.js, with the events of code paths, lib/code-path), their
// reports made problems (lib/report), the disable directives applied, the fixes. createDisableDirectives and the
// order of the steps follow ESLint's lib/linter/linter.js (MIT).

import * as jslang from './source-code/language.js';
import { FileReport } from './report/report.js';
import { FileContext } from './rule-context.js';
import { Listeners } from './ast/listeners.js';
import { applyDisableDirectives } from './report/directives.js';
import { applyFixes } from './report/apply-fixes.js';
import { deepMergeArrays } from './util/deep-merge.js';
import { normalizeSeverityToNumber } from './util/severity.js';
import { parseList } from './source-code/comments.js';
import { defaultParser } from './parser.js';
import { getRule, isKnownRule } from './rules/index.js';

const MAX_FIX_PASSES = 10;
const BOM = String.fromCharCode(0xfeff);
const NO_GLOBALS = Object.freeze({});

const severityOf = (setting) => {
  const value = Array.isArray(setting) ? setting[0] : setting;
  try {
    return normalizeSeverityToNumber(value);
  } catch {
    throw new TypeError(`Invalid severity for a rule: ${JSON.stringify(value)}`);
  }
};

// The language options of a config, with ESLint's defaults (the latest ECMAScript, modules).
function languageOptionsOf(config) {
  const given = config.languageOptions ?? {};
  const options = {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ...given,
    parser: defaultParser,
    parserOptions: { ...given.parserOptions },
    // Read only: shared by the files of a config (its globals are merged once, source-code/globals.js).
    globals: given.globals ?? NO_GLOBALS,
  };
  if (options.sourceType === 'commonjs') {
    options.parserOptions.ecmaFeatures = { ...options.parserOptions.ecmaFeatures, globalReturn: true };
  }
  return jslang.normalizeLanguageOptions(options);
}

// The disable directives of a comment (createDisableDirectives of ESLint's linter.js).
function createDisableDirectives({ type, value, justification, node }, report, sourceCode) {
  const ruleIds = Object.keys(parseList(value));
  const directiveRules = ruleIds.length ? ruleIds : [null];
  const directives = [];
  const parentDirective = { node, value, ruleIds };
  for (const ruleId of directiveRules) {
    const loc = sourceCode.getLoc(node);
    if (ruleId === null || isKnownRule(ruleId)) {
      const where = type === 'disable-next-line' ? loc.end : loc.start;
      directives.push({ parentDirective, type, line: where.line, column: where.column + 1, ruleId, justification });
    } else {
      report.addError({ ruleId, loc });
    }
  }
  return directives;
}

function directivesOf(sourceCode, report) {
  const { directives, problems } = sourceCode.getDisableDirectives();
  problems.forEach((problem) => report.addError(problem));
  return directives.flatMap((directive) => createDisableDirectives(directive, report, sourceCode));
}

// The comments that configure: /* global a, b:writable */ and /* exported a */ (SourceCode keeps them), and
// /* eslint rule: "error" */, whose rules join those of the config (with the config's options when they give only a
// severity), as ESLint's linter.js has them.
function applyInlineConfig(sourceCode, config, rules, report) {
  const result = sourceCode.applyInlineConfig();
  result.problems.forEach((problem) => report.addFatal(problem));
  const inline = new Set();
  for (const { config: inlineConfig, loc } of result.configs) {
    for (const [ruleId, value] of Object.entries(inlineConfig.rules)) {
      const rule = getRule(ruleId);
      if (!rule) {
        // A rule of ESLint not ported may be turned off; turning it on says it is not here.
        if (isKnownRule(ruleId)) {
          let off = false;
          try {
            off = severityOf(value) === 0;
          } catch {
            off = false;
          }
          if (!off) report.addError({ ruleId, message: `Rule "${ruleId}" is not in @xufa/lint.`, loc });
        } else {
          report.addError({ ruleId, loc });
        }
        continue;
      }
      if (inline.has(ruleId)) {
        report.addError({
          message: `Rule "${ruleId}" is already configured by another configuration comment in the preceding code. This configuration is ignored.`,
          loc,
        });
        continue;
      }
      let options = Array.isArray(value) ? value : [value];
      try {
        severityOf(options);
      } catch {
        report.addError({
          ruleId,
          message: `Inline configuration for rule "${ruleId}" is invalid:\n\tExpected severity of "off", 0, "warn", 1, "error", or 2. You passed "${JSON.stringify(options[0])}".\n`,
          loc,
        });
        continue;
      }
      if (options.length === 1 && Array.isArray(config.rules?.[ruleId])) {
        options = [options[0], ...config.rules[ruleId].slice(1)];
      }
      inline.add(ruleId);
      rules[ruleId] = options;
    }
  }
}

// A rule's options: those of the config over its meta.defaultOptions.
function optionsOf(setting, rule) {
  const given = Array.isArray(setting) ? setting.slice(1) : [];
  return deepMergeArrays(rule.meta?.defaultOptions, given);
}

function runRules(sourceCode, rules, languageOptions, settings, filename, physicalFilename, cwd, report) {
  const visitor = new Listeners();
  const fileContext = new FileContext({
    cwd,
    filename,
    physicalFilename,
    sourceCode,
    parserOptions: { ...languageOptions.parserOptions },
    parserPath: undefined,
    languageOptions,
    settings,
  });
  const steps = sourceCode.traverse();
  for (const [ruleId, setting] of Object.entries(rules)) {
    const severity = severityOf(setting);
    if (severity === 0) continue;
    const rule = getRule(ruleId);
    if (!rule) {
      report.addError({ ruleId });
      continue;
    }
    const context = fileContext.extend({
      id: ruleId,
      options: optionsOf(setting, rule),
      report(...args) {
        const problem = report.addRuleMessage(ruleId, severity, ...args);
        if (problem.fix && !rule.meta?.fixable) {
          throw new Error('Fixable rules must set the `meta.fixable` property to "code" or "whitespace".');
        }
        if (problem.suggestions && rule.meta?.hasSuggestions !== true) {
          throw new Error('Rules with suggestions must set the `meta.hasSuggestions` property to `true`.');
        }
      },
    });
    let listeners;
    try {
      listeners = rule.create(context);
    } catch (error) {
      error.message = `Error while loading rule '${ruleId}': ${error.message}`;
      throw error;
    }
    // Its errors say the rule (the listeners put ruleId on them).
    for (const [selector, listener] of Object.entries(listeners)) visitor.add(selector, listener, ruleId);
  }
  visitor.run(steps);
  return report;
}

class Linter {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
    this.lastSourceCode = null;
  }

  /**
   * The problems of `text`: [{ ruleId, severity, message, line, column, endLine, endColumn, messageId, fix,
   * suggestions, ... }]. `config`: { languageOptions, rules, settings, linterOptions }.
   */
  verify(text, config = {}, filenameOrOptions = {}) {
    const options = typeof filenameOrOptions === 'string' ? { filename: filenameOrOptions } : filenameOrOptions;
    const filename = options.filename ?? '<input>';
    const physicalFilename = options.physicalFilename ?? filename;
    const hasBOM = text.startsWith(BOM);
    const body = hasBOM ? text.slice(1) : text;
    const languageOptions = languageOptionsOf(config);
    const file = { body, path: filename, physicalPath: physicalFilename, bom: hasBOM };
    const parsed = jslang.parse(file, { languageOptions });
    if (!parsed.ok) {
      this.lastSourceCode = null;
      return parsed.errors.map((error) => ({
        ruleId: null,
        fatal: true,
        severity: 2,
        message: `Parsing error: ${error.message}`,
        line: error.line,
        column: error.column,
        nodeType: null,
      }));
    }
    const sourceCode = jslang.createSourceCode(file, parsed, { languageOptions });
    this.lastSourceCode = sourceCode;
    const report = new FileReport({ ruleMapper: getRule, language: jslang, sourceCode, disableFixes: false });
    sourceCode.applyLanguageOptions(languageOptions);
    const linterOptions = config.linterOptions ?? {};
    const rules = { ...config.rules };
    if (!linterOptions.noInlineConfig) applyInlineConfig(sourceCode, config, rules, report);
    const directives = linterOptions.noInlineConfig ? [] : directivesOf(sourceCode, report);
    sourceCode.finalize();
    try {
      runRules(sourceCode, rules, languageOptions, config.settings ?? {}, filename, physicalFilename, this.cwd, report);
    } catch (error) {
      error.message += `\nOccurred while linting ${filename}`;
      if (error.currentNode) error.message += `:${sourceCode.getLoc(error.currentNode).start.line}`;
      if (error.ruleId) error.message += `\nRule: "${error.ruleId}"`;
      throw error;
    }
    let unused = linterOptions.reportUnusedDisableDirectives ?? 'warn';
    if (typeof unused === 'boolean') unused = unused ? 'warn' : 'off';
    if (typeof unused === 'number') unused = ['off', 'warn', 'error'][unused];
    const problems = applyDisableDirectives({
      language: jslang,
      sourceCode,
      directives,
      disableFixes: false,
      problems: report.messages.sort((a, b) => a.line - b.line || a.column - b.column),
      reportUnusedDisableDirectives: unused,
      configuredRules: rules,
    });
    // Those that comments disable are kept apart (getSuppressedMessages()), as ESLint keeps them.
    this.suppressedMessages = problems.filter((problem) => problem.suppressions?.length);
    return problems.filter((problem) => !problem.suppressions?.length);
  }

  /** The problems of the last verify() that comments disabled. */
  getSuppressedMessages() {
    return this.suppressedMessages ?? [];
  }

  /** verify(), fixing what rules can fix, again until nothing changes (10 times at most): { fixed, output, messages }. */
  verifyAndFix(text, config = {}, options = {}) {
    const filename = typeof options === 'string' ? options : options.filename;
    let output = text;
    let fixed = false;
    let messages;
    for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
      messages = this.verify(output, config, { ...(typeof options === 'object' ? options : {}), filename });
      const result = applyFixes(output, messages, options.fix ?? true);
      if (!result.fixed) break;
      fixed = true;
      output = result.output;
      if (pass === MAX_FIX_PASSES - 1) messages = this.verify(output, config, { filename });
    }
    return { fixed, output, messages };
  }

  getSourceCode() {
    return this.lastSourceCode;
  }
}

export { Linter, severityOf };
