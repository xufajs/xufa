declare const entries: {
    <T>(
      o:
        | {
            [s: string]: T;
          }
        | ArrayLike<T>
    ): [string, T][];
    (o: {}): [string, any][];
  },
  setPrototypeOf: (o: any, proto: object | null) => any,
  isFrozen: (o: any) => boolean,
  getPrototypeOf: (o: any) => any,
  getOwnPropertyDescriptor: (o: any, p: PropertyKey) => PropertyDescriptor | undefined;
declare let freeze: {
    <T extends Function>(f: T): T;
    <
      T extends {
        [idx: string]: U | null | undefined | object;
      },
      U extends string | bigint | number | boolean | symbol,
    >(
      o: T
    ): Readonly<T>;
    <T>(o: T): Readonly<T>;
  },
  seal: <T>(o: T) => T,
  create: {
    (o: object | null): any;
    (o: object | null, properties: PropertyDescriptorMap & ThisType<any>): any;
  };
declare const arrayForEach: (thisArg: any, ...args: any[]) => void;
declare const arrayIndexOf: (thisArg: any, ...args: any[]) => number;
declare const arrayLastIndexOf: (thisArg: any, ...args: any[]) => number;
declare const arrayPop: (thisArg: any, ...args: any[]) => any;
declare const arrayPush: (thisArg: any, ...args: any[]) => number;
declare const arraySlice: (thisArg: any, ...args: any[]) => any[];
declare const arraySplice: (thisArg: any, ...args: any[]) => any[];
declare const stringToLowerCase: (thisArg: any, ...args: any[]) => string;
declare const stringToString: (thisArg: any, ...args: any[]) => string;
declare const stringMatch: (thisArg: any, ...args: any[]) => RegExpMatchArray;
declare const stringReplace: (thisArg: any, ...args: any[]) => string;
declare const stringIndexOf: (thisArg: any, ...args: any[]) => number;
declare const stringTrim: (thisArg: any, ...args: any[]) => string;
declare const objectHasOwnProperty: (thisArg: any, ...args: any[]) => boolean;
declare const regExpTest: (thisArg: any, ...args: any[]) => boolean;
declare const typeErrorCreate: (...args: any[]) => Error;
/**
 * Creates a new function that calls the given function with a specified thisArg and arguments.
 *
 * @param func - The function to be wrapped and called.
 * @returns A new function that calls the given function with a specified thisArg and arguments.
 */
declare function unapply<T>(func: (thisArg: any, ...args: any[]) => T): (thisArg: any, ...args: any[]) => T;
/**
 * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
 *
 * @param func - The constructor function to be wrapped and called.
 * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
 */
declare function unconstruct<T>(Func: new (...args: any[]) => T): (...args: any[]) => T;
/**
 * Add properties to a lookup table
 *
 * @param set - The set to which elements will be added.
 * @param array - The array containing elements to be added to the set.
 * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
 * @returns The modified set with added elements.
 */
declare function addToSet(
  set: Record<string, any>,
  array: readonly any[],
  transformCaseFunc?: ReturnType<typeof unapply<string>>
): Record<string, any>;
/**
 * Shallow clone an object
 *
 * @param object - The object to be cloned.
 * @returns A new object that copies the original.
 */
declare function clone<T extends Record<string, any>>(object: T): T;
/**
 * This method automatically checks if the prop is function or getter and behaves accordingly.
 *
 * @param object - The object to look up the getter function in its prototype chain.
 * @param prop - The property name for which to find the getter function.
 * @returns The getter function found in the prototype chain or a fallback function.
 */
declare function lookupGetter<T extends Record<string, any>>(
  object: T,
  prop: string
): ReturnType<typeof unapply<any>> | (() => null);
export {
  arrayForEach,
  arrayIndexOf,
  arrayLastIndexOf,
  arrayPop,
  arrayPush,
  arraySlice,
  arraySplice,
  entries,
  freeze,
  getPrototypeOf,
  getOwnPropertyDescriptor,
  isFrozen,
  setPrototypeOf,
  seal,
  clone,
  create,
  objectHasOwnProperty,
  regExpTest,
  stringIndexOf,
  stringMatch,
  stringReplace,
  stringToLowerCase,
  stringToString,
  stringTrim,
  typeErrorCreate,
  lookupGetter,
  addToSet,
  unapply,
  unconstruct,
};
