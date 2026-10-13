/** The context of an expression: its names and their values. */
export type ExpressionContext = Record<string, unknown> | object | null | undefined;

/** An expression compiled: it gives its value for a context. */
export interface CompiledExpression<T = unknown> {
  (context?: ExpressionContext): T;
  /** The source it was compiled from. */
  readonly source: string;
}

export type Filter = (value: any, ...args: any[]) => unknown;

export interface EngineOptions {
  /** Names over the default globals (Math, JSON, Number...). */
  globals?: Record<string, unknown>;
  /** false: no default globals, only those given. */
  builtins?: boolean;
  /** Functions by name: `|` separates them in expressions (`price | round(2)`, the value first). */
  filters?: Record<string, Filter> | null;
  /** Members of null or undefined, and calls of what is not a function, give undefined (not errors). */
  lenient?: boolean;
  /** Names that are not in the context nor the globals are errors (not undefined). */
  strict?: boolean;
  /**
   * Programs: a `let`, `const` or class used before its declaration runs is an error (`XUFA_EXPR_ERR_RUNTIME`), as
   * in JavaScript; by default it is undefined.
   */
  tdz?: boolean;
  /** The longest source compiled (10000). */
  maxLength?: number;
  /** How many expressions compiled are kept (1000; 0 for none). */
  cacheSize?: number;
  /** false: expressions stay closures (by default, those run often become one function of JavaScript). */
  inline?: boolean;
  /** Runs before an expression becomes one function of JavaScript (64; 0: at once). */
  inlineAfter?: number;
  /**
   * Sources are programs: statements (let, const, if, for, for...of, while, switch, return, throw, try, functions),
   * assignments of names and of members of plain objects and arrays, ++, --, delete, new and comments. Their value is
   * that of their return, or of the last expression statement run.
   */
  statements?: boolean;
  /** The loop turns and calls of functions of a run of a program (10 million): past them, XUFA_EXPR_ERR_LIMIT. */
  maxSteps?: number;
  /** How deep calls of a program's functions can nest (1000): deeper, XUFA_EXPR_ERR_LIMIT. */
  maxDepth?: number;
  /** What `new` makes in programs, by name, over the default ones (Date, Map, Set, Error, TypeError, RangeError). */
  constructors?: Record<string, new (...args: any[]) => unknown>;
  /** What `import` of programs takes: the source of a module (a string: a program run for each import, with a context
   * of its own) or what it exports (an object given by the host), or undefined (no such module). */
  modules?: ModuleResolver;
}

/** A resolver of the modules programs import, by name. */
export type ModuleResolver = (name: string) => string | Record<string, unknown> | undefined | null;

export declare class Engine {
  constructor(options?: EngineOptions);
  readonly globals: Readonly<Record<string, unknown>>;
  readonly filters: Readonly<Record<string, Filter>> | null;
  readonly lenient: boolean;
  readonly strict: boolean;
  readonly statements: boolean;
  readonly maxSteps: number;
  readonly maxDepth: number;
  readonly constructors: Readonly<Record<string, new (...args: any[]) => unknown>>;
  parse(source: string): ExpressionNode;
  /** `modules`: a resolver of its imports of its own (over the engine's). */
  compile<T = unknown>(source: string, options?: { modules?: ModuleResolver }): CompiledExpression<T>;
  /** The names of the modules a program imports. */
  imports(source: string): string[];
  evaluate<T = unknown>(source: string, context?: ExpressionContext): T;
  /**
   * The function of a tree made by another parser (of another language), with the nodes parse() gives: compiled with
   * the same checks as sources. `source`: the text the positions of its nodes are in.
   */
  compileTree<T = unknown>(tree: ExpressionNode | TreeNode, source?: string): (context?: ExpressionContext) => T;
}

export type ExpressionErrorCode =
  | 'XUFA_EXPR_ERR_SYNTAX'
  | 'XUFA_EXPR_ERR_FORBIDDEN'
  | 'XUFA_EXPR_ERR_RUNTIME'
  | 'XUFA_EXPR_ERR_LENGTH'
  | 'XUFA_EXPR_ERR_LIMIT';

export declare class ExpressionError extends Error {
  constructor(message: string, options?: { code?: ExpressionErrorCode; source?: string; position?: number });
  code: ExpressionErrorCode;
  /** Where in the source (from 0), and its line and column (from 1). */
  position?: number;
  line?: number;
  column?: number;
}

/** A node of the tree of an expression (as those of ESTree). */
export interface ExpressionNode {
  type:
    | 'Literal'
    | 'Identifier'
    | 'TemplateLiteral'
    | 'ArrayExpression'
    | 'ObjectExpression'
    | 'MemberExpression'
    | 'CallExpression'
    | 'ChainExpression'
    | 'UnaryExpression'
    | 'BinaryExpression'
    | 'LogicalExpression'
    | 'ConditionalExpression'
    | 'ArrowFunctionExpression'
    | 'Filter'
    | 'AssignmentExpression'
    | 'UpdateExpression'
    | 'NewExpression'
    | 'Program'
    | 'ExpressionStatement'
    | 'BlockStatement'
    | 'EmptyStatement'
    | 'VariableDeclaration'
    | 'FunctionDeclaration'
    | 'IfStatement'
    | 'ForStatement'
    | 'ForOfStatement'
    | 'WhileStatement'
    | 'DoWhileStatement'
    | 'ReturnStatement'
    | 'BreakStatement'
    | 'ContinueStatement'
    | 'ThrowStatement'
    | 'TryStatement'
    | 'SwitchStatement';
  start: number;
  end: number;
  [key: string]: unknown;
}

/** A node of a tree made by another parser: as ExpressionNode, its positions optional. */
export interface TreeNode {
  type: ExpressionNode['type'];
  start?: number;
  end?: number;
  [key: string]: unknown;
}

/** The default globals of expressions. */
export declare const GLOBALS: Readonly<Record<string, unknown>>;
/** The names of properties expressions cannot reach (__proto__, constructor, prototype...). */
export declare const FORBIDDEN: ReadonlySet<string>;
/** What `new` makes in programs by default (Date, Map, Set, Error, TypeError, RangeError). */
export declare const CONSTRUCTORS: Readonly<Record<string, new (...args: any[]) => unknown>>;

export declare function parse(source: string, options?: { filters?: boolean; statements?: boolean }): ExpressionNode;
export declare function compile<T = unknown>(source: string): CompiledExpression<T>;
export declare function evaluate<T = unknown>(source: string, context?: ExpressionContext): T;
/** The line and column (from 1) of a position of a source. */
export declare function locate(source: string, position: number): { line: number; column: number };
