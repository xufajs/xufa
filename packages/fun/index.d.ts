// Types of @xufa/fun. Functions take values of any kind (lists, strings, objects, iterables, one item), so most
// values are `unknown` or `any`; curried functions take their arguments at once, a few at a time, or with `_`.

/** What holds an argument's place in a curried function: `subtract(_, 1)(5)` is 4. */
export declare const _: { readonly '@@fun/_': true };
export type Placeholder = typeof _;

/** A curried function of two arguments (more go to it as they are). */
export interface Curried2<A, B, R> {
  (): Curried2<A, B, R>;
  (a: A): (b: B, ...rest: any[]) => R;
  (a: Placeholder, b: B): (a: A, ...rest: any[]) => R;
  (a: A, b: B, ...rest: any[]): R;
}

/** A curried function of three arguments. */
export interface Curried3<A, B, C, R> {
  (): Curried3<A, B, C, R>;
  (a: A): Curried2<B, C, R>;
  (a: A, b: B): (c: C, ...rest: any[]) => R;
  (a: A, b: B, c: C, ...rest: any[]): R;
  (a: Placeholder, b: B, c?: C): (...rest: any[]) => any;
}

/** fn(value, index or key, the value walked). */
export type Visitor<R = unknown> = (value: any, index: any, source: any) => R;

export declare function isPlaceholder(value: unknown): boolean;
export declare function curry2<A, B, R>(fn: (a: A, b: B, ...rest: any[]) => R): Curried2<A, B, R>;
export declare function curry3<A, B, C, R>(fn: (a: A, b: B, c: C, ...rest: any[]) => R): Curried3<A, B, C, R>;
/** A function of `length` arguments, curried: the arguments given fill the places held first. */
export declare const curryN: Curried2<number, (...args: any[]) => any, (...args: any[]) => any>;
/** A function curried by the arguments it declares. */
export declare function curry(fn: (...args: any[]) => any): (...args: any[]) => any;

/** The tags of the static methods classes define to take part in the operators. */
export declare const PLACEHOLDER_TAG: '@@fun/_';
export declare const ADD_TAG: '@@fun/add';
export declare const AND_TAG: '@@fun/and';
export declare const OR_TAG: '@@fun/or';
export declare const APPROVE_TAG: '@@fun/approve';
export declare const NEGATE_TAG: '@@fun/negate';
export declare const NOT_TAG: '@@fun/not';
export declare const SUBTRACT_TAG: '@@fun/subtract';
export declare const MULT_TAG: '@@fun/mult';
export declare const DIV_TAG: '@@fun/div';
export declare const MOD_TAG: '@@fun/mod';
export declare const POW_TAG: '@@fun/pow';

/** Values. */
export declare const isArray: (value: unknown) => value is any[];
/** An array, or an object with a length whose first and last items are its own. */
export declare function isArrayLike(value: unknown): boolean;
export declare const isInteger: (value: unknown) => boolean;
export declare function isIterable(value: unknown): boolean;
export declare function isNull(value: unknown): value is null;
/** A plain object (or of a class): its toString tag is Object. */
export declare function isObject(value: unknown): value is Record<string, any>;
export declare function isString(value: unknown): value is string;
export declare function isFunction(value: unknown): value is (...args: any[]) => any;
export declare function isPromise(value: unknown): boolean;
export declare const has: Curried2<object, PropertyKey, boolean>;
export declare function identity<T>(value: T): T;
/** Items of lists, keys of objects, size or count, items of iterables, else the length of its text. */
export declare function len(value: unknown): number;
/** The position of an index in a list of a length (negative from the end; out of it: -1). */
export declare const atIndex: Curried2<number, number | string, number>;
/** The parts of a path: 'a.b[0]' is ['a', 'b', '[0]']. */
export declare function atPath(path: string): string[];
export declare function asArrayLike(value: unknown): ArrayLike<any> | string;
export declare function boolDict(value: unknown): Record<string, true>;
/** The numbers from `from` (0) up to `to` (not included), by `step` (1). */
export declare function range(to: number): Iterable<number>;
export declare function range(from: number, to: number, step?: number): Iterable<number>;

/** Walking and lists. */
export declare const forEach: Curried2<unknown, Visitor, void>;
export declare const forEachRight: Curried2<unknown, Visitor, void>;
/** forEach until fn gives false. */
export declare const forWhile: Curried2<unknown, Visitor, void>;
export declare const map: Curried2<unknown, Visitor, any[]>;
export declare const mapRight: Curried2<unknown, Visitor, any[]>;
/** map giving what the source is: a string, an object of the same keys, an array-like of its class. */
export declare const mapSrc: Curried2<unknown, Visitor, any>;
export declare const mapRightSrc: Curried2<unknown, Visitor, any>;
export declare const filter: Curried2<unknown, Visitor, any[]>;
export declare const filterSrc: Curried2<unknown, Visitor, any>;
/** fn(accumulated, value, index, source) from the initial value. */
export declare const reduce: Curried3<
  unknown,
  (accumulated: any, value: any, index: any, source: any) => any,
  unknown,
  any
>;
export declare const reduceRight: Curried3<
  unknown,
  (accumulated: any, value: any, index: any, source: any) => any,
  unknown,
  any
>;
export declare const every: Curried2<unknown, Visitor, boolean>;
export declare const some: Curried2<unknown, Visitor, boolean>;
export declare const none: Curried2<unknown, Visitor, boolean>;
export declare const allowIndexes: Curried2<unknown, unknown, any[]>;
export declare const allowIndexesSrc: Curried2<unknown, unknown, any>;
export declare const denyIndexes: Curried2<unknown, unknown, any[]>;
export declare const denyIndexesSrc: Curried2<unknown, unknown, any>;
export declare const concat: Curried2<unknown, unknown, any[]>;
export declare function fromPairs(
  pairs: Iterable<[PropertyKey, any]> | ArrayLike<[PropertyKey, any]>
): Record<string, any>;
export declare const zip: Curried2<unknown, unknown, [any, any][]>;
export declare const zipObj: Curried2<unknown, unknown, Record<string, any>>;
export declare const zipWith: Curried3<unknown, unknown, (a: any, b: any) => any, any[]>;

/** Paths. */
export declare const getAt: Curried2<unknown, number | string, any>;
/** The value at a path ('a.b[0].c', or its parts); undefined when a step has none. */
export declare const getAtPath: Curried2<unknown, string | string[], any>;
export declare const setAt: Curried2<unknown, number | string, any>;
/** A copy with a value at a path, the objects and arrays on the way made. */
export declare const setAtPath: Curried3<unknown, string | string[], unknown, any>;
/** The object itself with a value at a path. */
export declare const setAtPathMut: Curried3<unknown, string | string[], unknown, any>;

/** Operators: of any number of values (add(1, 2, 3)), classes taking part by the tags. */
export declare const add: Curried2<any, any, any>;
export declare const subtract: Curried2<any, any, any>;
export declare const mult: Curried2<any, any, any>;
export declare const div: Curried2<any, any, any>;
export declare const mod: Curried2<any, any, any>;
export declare const pow: Curried2<any, any, any>;
export declare function subtractOp(a: any, b: any): any;
export declare function multOp(a: any, b: any): any;
export declare function divOp(a: any, b: any): any;
export declare function modOp(a: any, b: any): any;
export declare function powOp(a: any, b: any): any;
export declare const inc: (value: any) => any;
export declare const dec: (value: any) => any;
export declare function negate(value: any): any;
export declare const and: Curried2<any, any, boolean>;
export declare const or: Curried2<any, any, boolean>;
export declare function andOp(a: any, b: any): any;
export declare function orOp(a: any, b: any): any;
/** A function true when every one of the functions (or values) is, for the same arguments. */
export declare const andFn: Curried2<unknown, unknown, (...args: any[]) => boolean>;
export declare const orFn: Curried2<unknown, unknown, (...args: any[]) => boolean>;
export declare function not(value: any): any;
/** A copy of the value, or what its class approves of it. */
export declare function approve<T>(value: T): T;
export declare const gt: Curried2<any, any, boolean>;
export declare const gte: Curried2<any, any, boolean>;
export declare const lt: Curried2<any, any, boolean>;
export declare const lte: Curried2<any, any, boolean>;

// Numbers and composition.
/** The sum of the values given, or of the items of the one given. */
export declare function sum(...values: unknown[]): number;
export declare function mean(...values: unknown[]): number;
export declare function median(...values: unknown[]): number;
export declare const max: Curried2<unknown, unknown, number>;
export declare const min: Curried2<unknown, unknown, number>;
export declare const clamp: Curried3<number, number, number, number>;
/** The functions one after the other: the first takes the arguments, each next one the result. */
export declare function pipe(...fns: ((...args: any[]) => any)[]): (...args: any[]) => any;
export declare function always<T>(value: T): () => T;
/** A copy of the first object with the others merged into it, deeply. */
export declare function merge<T>(first: T, ...others: unknown[]): T;
