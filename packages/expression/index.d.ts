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
  /** The longest source compiled (10000). */
  maxLength?: number;
  /** How many expressions compiled are kept (1000; 0 for none). */
  cacheSize?: number;
  /** false: expressions stay closures (by default, those run often become one function of JavaScript). */
  inline?: boolean;
  /** Runs before an expression becomes one function of JavaScript (64; 0: at once). */
  inlineAfter?: number;
}

export declare class Engine {
  constructor(options?: EngineOptions);
  readonly globals: Readonly<Record<string, unknown>>;
  readonly filters: Readonly<Record<string, Filter>> | null;
  readonly lenient: boolean;
  readonly strict: boolean;
  parse(source: string): ExpressionNode;
  compile<T = unknown>(source: string): CompiledExpression<T>;
  evaluate<T = unknown>(source: string, context?: ExpressionContext): T;
}

export type ExpressionErrorCode =
  'XUFA_EXPR_ERR_SYNTAX' | 'XUFA_EXPR_ERR_FORBIDDEN' | 'XUFA_EXPR_ERR_RUNTIME' | 'XUFA_EXPR_ERR_LENGTH';

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
    | 'Filter';
  start: number;
  end: number;
  [key: string]: unknown;
}

/** The default globals of expressions. */
export declare const GLOBALS: Readonly<Record<string, unknown>>;
/** The names of properties expressions cannot reach (__proto__, constructor, prototype...). */
export declare const FORBIDDEN: ReadonlySet<string>;

export declare function parse(source: string, options?: { filters?: boolean }): ExpressionNode;
export declare function compile<T = unknown>(source: string): CompiledExpression<T>;
export declare function evaluate<T = unknown>(source: string, context?: ExpressionContext): T;
/** The line and column (from 1) of a position of a source. */
export declare function locate(source: string, position: number): { line: number; column: number };
