// The types of @xufa/lint: ESLint's recommended rules on TypeScript's parser, with ESLint's API for what it has.

export type Severity = 0 | 1 | 2 | 'off' | 'warn' | 'error';
export type RuleSetting = Severity | [Severity, ...unknown[]];

export interface LanguageOptions {
  /** 'latest' (the default), or a year or number of ECMAScript: the globals it gives, and the scopes. */
  ecmaVersion?: number | 'latest';
  /** 'module' (the default), 'script' or 'commonjs'. */
  sourceType?: 'module' | 'script' | 'commonjs';
  /** Names the code may use: { name: 'readonly' | 'writable' | 'off' | boolean }. */
  globals?: Record<string, boolean | 'readonly' | 'readable' | 'writable' | 'writeable' | 'off'>;
  parserOptions?: { ecmaFeatures?: { jsx?: boolean; globalReturn?: boolean; impliedStrict?: boolean } };
}

export interface LinterOptions {
  /** Ignores the comments that configure and disable. */
  noInlineConfig?: boolean;
  /** Comments that disable what has no problems ('warn' by default). */
  reportUnusedDisableDirectives?: boolean | Severity;
}

/** A config object of xufa.lint.config.js, as one of ESLint's flat config. */
export interface Config {
  name?: string;
  /** The files it applies to (globs, relative to the config's folder); all when it has none. */
  files?: string[];
  /** Files it does not apply to; alone in an object, files ignored everywhere. */
  ignores?: string[];
  languageOptions?: LanguageOptions;
  linterOptions?: LinterOptions;
  rules?: Record<string, RuleSetting>;
  settings?: Record<string, unknown>;
  /** The formatter's options for these files; false leaves them unformatted. */
  format?: FormatOptions | false;
}

/** prettier's options (those of JavaScript, TypeScript, JSON and markdown). */
export interface FormatOptions {
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  semi?: boolean;
  singleQuote?: boolean;
  jsxSingleQuote?: boolean;
  quoteProps?: 'as-needed' | 'consistent' | 'preserve';
  trailingComma?: 'all' | 'es5' | 'none';
  bracketSpacing?: boolean;
  bracketSameLine?: boolean;
  objectWrap?: 'preserve' | 'collapse';
  arrowParens?: 'always' | 'avoid';
  proseWrap?: 'always' | 'never' | 'preserve';
  endOfLine?: 'lf' | 'crlf' | 'cr' | 'auto';
  experimentalTernaries?: boolean;
  experimentalOperatorPosition?: 'start' | 'end';
  embeddedLanguageFormatting?: 'auto' | 'off';
  singleAttributePerLine?: boolean;
  /** (In a config) files never formatted. */
  ignores?: string[];
}

export interface Fix {
  range: [number, number];
  text: string;
}

export interface LintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  messageId?: string;
  nodeType?: string | null;
  fatal?: true;
  fix?: Fix;
  suggestions?: Array<{ desc: string; messageId?: string; fix: Fix }>;
}

export interface LintResult {
  filePath: string;
  messages: LintMessage[];
  suppressedMessages: LintMessage[];
  errorCount: number;
  fatalErrorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  /** With fix: the text fixed, when anything was. */
  output?: string;
  source?: string;
}

/** A rule, as ESLint's: { meta, create(context) }. */
export interface Rule {
  meta?: {
    type?: 'problem' | 'suggestion' | 'layout';
    fixable?: 'code' | 'whitespace';
    hasSuggestions?: boolean;
    messages?: Record<string, string>;
    defaultOptions?: unknown[];
    schema?: unknown;
    docs?: Record<string, unknown>;
  };
  create(context: any): Record<string, (...args: any[]) => void>;
}

export declare class Linter {
  constructor(options?: { cwd?: string });
  /** The problems of a text with a config (one object: the merged config of a file). */
  verify(
    text: string,
    config?: Config,
    filename?: string | { filename?: string; physicalFilename?: string }
  ): LintMessage[];
  /** verify(), applying fixes again until nothing changes (10 times at most). */
  verifyAndFix(
    text: string,
    config?: Config,
    options?: string | { filename?: string; fix?: boolean }
  ): { fixed: boolean; output: string; messages: LintMessage[] };
  /** The problems of the last verify() that comments disabled. */
  getSuppressedMessages(): LintMessage[];
  getSourceCode(): any;
}

export declare class ConfigArray {
  constructor(configs: Array<Config | Config[]>, base?: string);
  isIgnored(file: string): boolean;
  isLinted(file: string): boolean;
  /** Whether a file is formatted: of a language the formatter has, and not ignored. */
  isFormatted(file: string): boolean;
  /** The objects that apply to a file, merged. */
  configFor(file: string): Config;
}

/** Loads xufa.lint.config.js (its default export: a list, or a function that gives one). */
export declare function loadConfig(file: string): Promise<ConfigArray>;
/** The config file of a folder or of the nearest one above it; null when none. */
export declare function findConfigFile(from?: string): string | null;
/** Lints the files of paths (folders walked); with fix, writes what is fixed. */
export declare function lintFiles(paths: string[], configs: ConfigArray, options?: { fix?: boolean }): LintResult[];
/** Lints a text with the config of a file. */
export declare function lintText(text: string, config: Config, file: string, options?: { fix?: boolean }): LintResult;
export declare function getRule(id: string): Rule | null;
/** Adds a rule of the project. */
export declare function defineRule(id: string, rule: Rule): void;
/** ESTree, as espree makes it (with tokens and comments). */
export declare function parse(
  text: string,
  options?: { sourceType?: 'module' | 'script' | 'commonjs'; jsx?: boolean; filePath?: string }
): any;
export declare function tokenize(text: string): any[] & { comments: any[] };
/** A text formatted as prettier formats the file filepath (its extension tells the language). */
export declare function format(text: string, options: FormatOptions & { filepath: string }): Promise<string>;
/** Formats the files of paths with their configs; with write, writes those that change. */
export declare function formatFiles(
  paths: string[],
  configs: ConfigArray,
  options?: { write?: boolean }
): Promise<Array<{ filePath: string; changed: boolean; error?: Error }>>;
export declare const formatters: {
  stylish(results: LintResult[], options?: { color?: boolean }): string;
  json(results: LintResult[]): string;
};
/** The globals of environments, as the package globals gives them. */
export declare const globals: Record<
  | 'builtin'
  | 'es5'
  | 'es2015'
  | 'es2016'
  | 'es2017'
  | 'es2018'
  | 'es2019'
  | 'es2020'
  | 'es2021'
  | 'es2022'
  | 'es2023'
  | 'es2024'
  | 'es2025'
  | 'es2026'
  | 'browser'
  | 'worker'
  | 'serviceworker'
  | 'sharedWorker'
  | 'node'
  | 'nodeBuiltin'
  | 'commonjs'
  | 'shared-node-browser'
  | 'jest'
  | 'vitest'
  | 'mocha',
  Record<string, boolean>
>;
export declare const configs: { recommended: Config };
