// The language of the linter, JavaScript: its options (ecmaVersion as a year, the parser's options), the parsing of
// a file (TypeScript's parser into ESTree, lib/parser.js), and its SourceCode with its scopes. Lines
// are 1-based and columns 0-based, as reports count them.

import { SourceCode } from './source-code.js';
import { KEYS } from '../ast/visitor-keys.js';
import { analyze } from '../scope/index.js';
import { SHEBANG } from '../util/text.js';
import { defaultParser } from '../parser.js';
import { LATEST_ECMA_VERSION } from '../data/ecma-globals.js';

// What RuleTester puts on the parser it wraps: the default parser, wrapped, is the default parser.
const RULE_TESTER_PARSER = Symbol.for('eslint.RuleTester.parser');
const DEFAULT_ECMA_VERSION = 5;

// An ecmaVersion as a year: 3 and 5 as they are, 6 to 17 as 2015 to 2026; "latest" (or anything else) the latest.
function normalizeEcmaVersion(ecmaVersion) {
  if (ecmaVersion === 3) return 3;
  if (ecmaVersion === 5 || ecmaVersion === undefined) return 5;
  if (typeof ecmaVersion === 'number') return ecmaVersion >= 2015 ? ecmaVersion : ecmaVersion + 2009;
  return LATEST_ECMA_VERSION;
}

// The scopes of a tree, with the options of a config (as ESLint analyzes them: no eval, globalReturn as a scope).
function analyzeScope(ast, languageOptions) {
  const ecmaFeatures = languageOptions.parserOptions.ecmaFeatures || {};
  const ecmaVersion = languageOptions.ecmaVersion || DEFAULT_ECMA_VERSION;
  return analyze(ast, {
    ignoreEval: true,
    nodejsScope: ecmaFeatures.globalReturn,
    impliedStrict: ecmaFeatures.impliedStrict,
    ecmaVersion: typeof ecmaVersion === 'number' ? ecmaVersion : 6,
    sourceType: languageOptions.sourceType || 'script',
  });
}

export const fileType = 'text';
export const lineStart = 1;
export const columnStart = 0;
export const nodeTypeKey = 'type';

export const defaultLanguageOptions = {
  sourceType: 'module',
  ecmaVersion: 'latest',
  parser: defaultParser,
  parserOptions: {},
};

export function normalizeLanguageOptions(languageOptions) {
  languageOptions.ecmaVersion = normalizeEcmaVersion(languageOptions.ecmaVersion);
  const { parser } = languageOptions;
  if ((parser === defaultParser || parser?.[RULE_TESTER_PARSER] === defaultParser) && languageOptions.sourceType) {
    const { parserOptions } = languageOptions;
    parserOptions.sourceType = languageOptions.sourceType;
    // A module has no return outside functions.
    if (parserOptions.sourceType === 'module' && parserOptions.ecmaFeatures?.globalReturn) {
      parserOptions.ecmaFeatures.globalReturn = false;
    }
  }
  return languageOptions;
}

export function parse(file, { languageOptions }) {
  const { body: text, path: filePath } = file;
  // A shebang is read as a line comment.
  const textToParse = text.replace(SHEBANG, (match, captured) => `//${captured}`);
  const { ecmaVersion, sourceType, parser } = languageOptions;
  const parserOptions = {
    ecmaVersion,
    sourceType,
    ...languageOptions.parserOptions,
    loc: true,
    range: true,
    raw: true,
    tokens: true,
    comment: true,
    eslintVisitorKeys: true,
    eslintScopeManager: true,
    filePath,
  };
  try {
    const result =
      typeof parser.parseForESLint === 'function'
        ? parser.parseForESLint(textToParse, parserOptions)
        : { ast: parser.parse(textToParse, parserOptions) };
    const { ast, services: parserServices = {}, visitorKeys = KEYS, scopeManager } = result;
    return { ok: true, ast, parserServices, visitorKeys, scopeManager };
  } catch (error) {
    const message = error.message.replace(/^line \d+:/iu, '').trim();
    return { ok: false, errors: [{ message, line: error.lineNumber, column: error.column }] };
  }
}

export function createSourceCode(file, parseResult, { languageOptions }) {
  const { body: text, bom: hasBOM } = file;
  const { ast, parserServices, visitorKeys } = parseResult;
  const scopeManager = parseResult.scopeManager || analyzeScope(ast, languageOptions);
  return new SourceCode({ text, ast, hasBOM, parserServices, scopeManager, visitorKeys });
}

export { KEYS as visitorKeys };
