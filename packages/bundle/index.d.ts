// The types of @xufa/bundle: modules as one script for browsers, one module as CommonJS, and smaller JavaScript and
// CSS.

export interface TransformOptions {
  /** Its name: .jsx and .tsx have JSX, .ts and .tsx TypeScript ('module.js' by default). */
  file?: string;
  /** JSX as calls of react/jsx-runtime ('automatic', the default), or of React.createElement ('classic'). */
  jsx?: 'automatic' | 'classic';
  /** Where the automatic JSX runtime is imported from ('react'). */
  jsxImportSource?: string;
  /** Values put in for names, as JSON or an identifier: { 'process.env.NODE_ENV': '"production"' }. */
  define?: Record<string, string>;
  /** TypeScript's helpers of modules in each module ('inline'), or left to the bundle ('external'). */
  helpers?: 'inline' | 'external';
  /** The syntax kept ('es2022'): es2020, es2021, es2022, es2023, esnext... */
  target?: string;
}

export interface TransformResult {
  /** The module as CommonJS. */
  code: string;
  /** What it imports (import, export from, import()). */
  imports: string[];
  /** All it requires as emitted: its imports, and the require() calls of CommonJS. */
  requires: string[];
  /** Its legal comments: /*! ... *\/, and those with @license or @preserve. */
  legal: string[];
}

export interface BundleOptions extends Omit<TransformOptions, 'file' | 'helpers'> {
  /** The "browser" condition of "exports" and the "browser" field (true). */
  browser?: boolean;
  /** What ES modules do not use of each other left out (true). */
  treeShaking?: boolean;
  /** Without comments and white space (false). */
  minify?: boolean;
  /** With minify: local names made short (true). */
  mangle?: boolean;
  /** The exports of the entry as this global variable. */
  globalName?: string;
  /** Modules given as CommonJS source, by name: { 'node:util': 'module.exports = ...' }. */
  shims?: Record<string, string>;
  /** Names left to a require() of the page. */
  external?: string[];
  /** Text before the script. */
  banner?: string;
  /** The legal comments of the modules at the end ('eof', the default), or left out ('none'). */
  legalComments?: 'eof' | 'none';
  /**
   * 'browser' (the default), or 'node': the modules of Node.js (and the external ones) are loaded by Node.js, and the
   * bundle is a module of CommonJS whose exports are the entry's (or, with format 'esm', an ES module).
   */
  platform?: 'browser' | 'node';
  /**
   * What modules export from others, read live (true, the default); false: as values, as fast to read as constants,
   * but an exported let changed later is not seen through them.
   */
  liveBindings?: boolean;
  /**
   * 'iife' (the default): the modules as functions, required on first use; 'esm': one ES module of them by scope
   * hoisting (their code in one scope, imports read as variables), which exports what the entry exports.
   */
  format?: 'iife' | 'esm';
}

export interface BundleResult {
  /** The script. */
  js: string;
  /** The stylesheets the modules import, in the order the modules run. */
  css: string;
  /** The files of the modules in it. */
  inputs: string[];
  /** The legal comments, by file. */
  legal: Map<string, string[]>;
}

/** Bundles `entry` and what it imports, as one script for browsers. */
export declare function bundle(entry: string, options?: BundleOptions): BundleResult;

/** One module (ES module, JSX, TypeScript or CommonJS) as CommonJS. */
export declare function transform(source: string, options?: TransformOptions): TransformResult;

/** JavaScript without comments and white space; `mangle` (true): local names made short. */
export declare function minifyJs(code: string, options?: { file?: string; mangle?: boolean }): string;

/** CSS without comments (but /*! ones) and white space that changes nothing. */
export declare function minifyCss(css: string): string;

export interface ResolveOptions {
  /** The condition of the request ('import'). */
  kind?: 'import' | 'require';
  /** The "browser" condition and field (true). */
  browser?: boolean;
  /** More conditions, first. */
  conditions?: string[];
}

/** Where `request` imported from the file `from` goes: a path, false (a module left empty by "browser"), or null. */
export declare function resolve(request: string, from: string, options?: ResolveOptions): string | false | null;
