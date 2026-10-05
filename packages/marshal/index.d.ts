// Type definitions for @xufa/marshal.

/** The nodes marshal() writes: plain JSON data. */
export type Marshalled = unknown[];

export interface MarshalOptions {
  /** The classes whose instances come back as themselves (the default registry when not given). */
  registry?: Registry;
  /** Deeper values are a MarshalError (1000). */
  maxDepth?: number;
  /** Instances of classes not registered: their fields as a plain object ('object', the default), or an error. */
  unknown?: 'object' | 'error';
  /** A function as a value: an error ('throw', the default), or left out ('skip'). */
  functions?: 'throw' | 'skip';
  /** The stack of errors is written (true). */
  stack?: boolean;
}

export interface UnmarshalOptions {
  registry?: Registry;
  maxDepth?: number;
  /** More nodes are a MarshalError (10,000,000). */
  maxNodes?: number;
  /** A class that is not registered: a plain object ('object', the default), or an error. */
  unknown?: 'object' | 'error';
}

export interface CloneOptions {
  registry?: Registry;
  maxDepth?: number;
}

export interface ClassOptions<T, D = unknown> {
  /** The name it is written with (the name of the class by default). */
  name?: string;
  /** The data written for an instance (with decode: for state in private fields). */
  encode?(instance: T): D;
  /** The instance again, from that data. */
  decode?(data: D): T;
}

export declare class Registry {
  constructor();
  register<T>(Class: abstract new (...args: any[]) => T, options?: ClassOptions<T>): this;
  register(...classes: Array<abstract new (...args: any[]) => unknown>): this;
  unregister(Class: abstract new (...args: any[]) => unknown): this;
  has(Class: abstract new (...args: any[]) => unknown): boolean;
}

/** The registry used when none is given. */
export declare const registry: Registry;
/** A static method of a class: the data written for an instance. */
export declare const ENCODE: unique symbol;
/** A static method of a class: the instance again, from that data. */
export declare const DECODE: unique symbol;

export declare function marshal(value: unknown, options?: MarshalOptions): Marshalled;
export declare function unmarshal<T = unknown>(nodes: Marshalled, options?: UnmarshalOptions): T;
export declare function stringify(value: unknown, options?: MarshalOptions): string;
export declare function parse<T = unknown>(text: string, options?: UnmarshalOptions): T;
/** A deep copy that keeps classes, references and cycles. */
export declare function clone<T>(value: T, options?: CloneOptions): T;

export declare class MarshalError extends Error {
  code:
    | 'XUFA_MARSHAL_ERR_INPUT'
    | 'XUFA_MARSHAL_ERR_TYPE'
    | 'XUFA_MARSHAL_ERR_CLASS'
    | 'XUFA_MARSHAL_ERR_DEPTH'
    | 'XUFA_MARSHAL_ERR_SIZE'
    | 'XUFA_MARSHAL_ERR_CYCLE'
    | 'XUFA_MARSHAL_ERR_REGISTER';
}
