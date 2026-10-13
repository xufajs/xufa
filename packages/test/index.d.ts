// The types of @xufa/test: the API of Jest and Vitest it gives (describe, it, expect, vi...), and expectTypeOf and
// assertType, the checks of the type tests (*.test-d.ts) that `xufa-test --typecheck` runs through tsc.

export type Awaitable<T> = T | PromiseLike<T>;
type Procedure = (...args: any[]) => any;
type Constructable = abstract new (...args: any[]) => any;

// ----------------------------------------------------------------------------------------------- tests and suites

/** What `inject(key)` gives: what a globalSetup provided. Declared by the project:
 * `declare module '@xufa/test' { interface ProvidedContext { url: string } }`. */
export interface ProvidedContext {}

/** The context of a test: its first parameter, also the `done` callback of Jest's tests that take one. */
export interface TestContext {
  /** Ends a test that takes a callback (with an error: fails it). */
  (error?: unknown): void;
  task: { name: string; id?: string; file?: { name: string } };
  /** The expect of this test (for concurrent tests). */
  expect: ExpectStatic;
  /** Skips the test from inside it. */
  skip(note?: string): never;
  signal: AbortSignal;
  onTestFinished(fn: () => Awaitable<unknown>): void;
  onTestFailed(fn: (context: TestContext) => Awaitable<unknown>): void;
  /** Jest's done.fail(). */
  fail(error?: unknown): void;
}

export interface TestOptions {
  timeout?: number;
  retry?: number;
  repeats?: number;
  concurrent?: boolean;
  sequential?: boolean;
  skip?: boolean;
  only?: boolean;
  todo?: boolean;
  fails?: boolean;
}

export type TestFunction<ExtraContext = {}> = (context: ExtraContext & TestContext) => Awaitable<unknown>;

/** Fixtures of test.extend: values, or functions that give them to `use` (and clean up after it). */
export type Fixtures<T, ExtraContext = {}> = {
  [K in keyof T]:
    | T[K]
    | ((context: Omit<T, K> & ExtraContext & TestContext, use: (value: T[K]) => Promise<void>) => Promise<void>)
    | [
        (context: Omit<T, K> & ExtraContext & TestContext, use: (value: T[K]) => Promise<void>) => Promise<void>,
        { auto?: boolean; scope?: 'test' | 'file' | 'worker' },
      ];
};

type EachTitle = string | Function;

interface Each<Callback extends (...args: any[]) => any> {
  /** test.each`a | b ${1} | ${2}`: one test of each row, its values by the names of the header. */
  (
    strings: TemplateStringsArray,
    ...values: any[]
  ): (name: EachTitle, fn: (row: any) => ReturnType<Callback>, options?: number | TestOptions) => void;
  /** Rows that are arrays: their items are the arguments. */
  <T extends readonly any[] | [any]>(
    cases: readonly T[]
  ): (name: EachTitle, fn: (...args: T) => ReturnType<Callback>, options?: number | TestOptions) => void;
  /** Rows of other values: each is the argument. */
  <T>(
    cases: readonly T[]
  ): (name: EachTitle, fn: (arg: T) => ReturnType<Callback>, options?: number | TestOptions) => void;
}

export interface TestAPI<ExtraContext = {}> {
  (name: EachTitle, fn?: TestFunction<ExtraContext>, options?: number | TestOptions): void;
  (name: EachTitle, options: TestOptions, fn?: TestFunction<ExtraContext>): void;
  skip: TestAPI<ExtraContext>;
  only: TestAPI<ExtraContext>;
  concurrent: TestAPI<ExtraContext>;
  sequential: TestAPI<ExtraContext>;
  /** A test that must fail. */
  fails: TestAPI<ExtraContext>;
  todo: (name: EachTitle, fn?: TestFunction<ExtraContext>) => void;
  skipIf(condition: unknown): TestAPI<ExtraContext>;
  runIf(condition: unknown): TestAPI<ExtraContext>;
  each: Each<TestFunction<ExtraContext>>;
  /** As each, with the context of the test as the second argument (rows are never spread). */
  for<T>(
    cases: readonly T[]
  ): (
    name: EachTitle,
    fn: (arg: T, context: ExtraContext & TestContext) => Awaitable<unknown>,
    options?: number | TestOptions
  ) => void;
  /** Tests whose context has these fixtures. */
  extend<T extends Record<string, any>>(fixtures: Fixtures<T, ExtraContext>): TestAPI<ExtraContext & T>;
  /** Fixtures of the tests of the suite around, over those of extend. */
  scoped(fixtures: Partial<Fixtures<ExtraContext>>): void;
}

export type SuiteFactory = () => Awaitable<unknown>;

export interface SuiteAPI {
  (name: EachTitle, fn?: SuiteFactory, options?: number | TestOptions): void;
  (name: EachTitle, options: TestOptions, fn?: SuiteFactory): void;
  skip: SuiteAPI;
  only: SuiteAPI;
  concurrent: SuiteAPI;
  sequential: SuiteAPI;
  fails: SuiteAPI;
  todo: (name: EachTitle, fn?: SuiteFactory) => void;
  skipIf(condition: unknown): SuiteAPI;
  runIf(condition: unknown): SuiteAPI;
  each: Each<SuiteFactory>;
  for<T>(
    cases: readonly T[]
  ): (name: EachTitle, fn: (arg: T) => Awaitable<unknown>, options?: number | TestOptions) => void;
}

export declare const test: TestAPI;
export declare const it: TestAPI;
export declare const describe: SuiteAPI;
export declare const suite: SuiteAPI;

export type HookCleanup = () => Awaitable<unknown>;

export declare function beforeAll(fn: () => Awaitable<unknown | HookCleanup>, timeout?: number): void;
export declare function afterAll(fn: () => Awaitable<unknown>, timeout?: number): void;
export declare function beforeEach(
  fn: (context: TestContext) => Awaitable<unknown | HookCleanup>,
  timeout?: number
): void;
export declare function afterEach(fn: (context: TestContext) => Awaitable<unknown>, timeout?: number): void;
export declare function onTestFinished(fn: (context: TestContext) => Awaitable<unknown>, timeout?: number): void;
export declare function onTestFailed(fn: (context: TestContext) => Awaitable<unknown>, timeout?: number): void;

export interface BenchOptions {
  time?: number;
  iterations?: number;
  warmupTime?: number;
  warmupIterations?: number;
}
export interface BenchAPI {
  (name: EachTitle, fn: () => Awaitable<unknown>, options?: BenchOptions): void;
  skip: BenchAPI;
  only: BenchAPI;
  todo: (name: EachTitle) => void;
}
export declare const bench: BenchAPI;

export declare function inject<K extends keyof ProvidedContext>(key: K): ProvidedContext[K];

// ------------------------------------------------------------------------------------------------------- expect

/** The matchers of expect(value): R is what each gives (void, or a promise after resolves and rejects). Matchers of
 * the project (expect.extend) are declared by merging: `declare module '@xufa/test' { interface Matchers<R, T> {
 * toBeEven(): R } }`. */
export interface Matchers<R = void, T = unknown> {
  toBe(expected: unknown): R;
  toEqual(expected: unknown): R;
  toStrictEqual(expected: unknown): R;
  toMatchObject(expected: object | readonly object[]): R;
  toContain(item: unknown): R;
  toContainEqual(item: unknown): R;
  toHaveLength(length: number): R;
  toHaveProperty(path: string | readonly (string | number)[], value?: unknown): R;
  toBeCloseTo(expected: number, digits?: number): R;
  toBeDefined(): R;
  toBeUndefined(): R;
  toBeNull(): R;
  toBeNaN(): R;
  toBeTruthy(): R;
  toBeFalsy(): R;
  toBeGreaterThan(expected: number | bigint): R;
  toBeGreaterThanOrEqual(expected: number | bigint): R;
  toBeLessThan(expected: number | bigint): R;
  toBeLessThanOrEqual(expected: number | bigint): R;
  toBeInstanceOf(expected: Function): R;
  toBeTypeOf(type: 'bigint' | 'boolean' | 'function' | 'number' | 'object' | 'string' | 'symbol' | 'undefined'): R;
  toBeOneOf(expected: readonly unknown[]): R;
  toMatch(expected: string | RegExp): R;
  /** A predicate the value satisfies (with @xufa/test-ai: a claim in words, judged by a model). */
  toSatisfy(predicate: ((value: T) => boolean) | string, message?: string): R;
  toThrow(expected?: string | RegExp | Error | Constructable | object): R;
  toThrowError(expected?: string | RegExp | Error | Constructable | object): R;
  toMatchSnapshot(hint?: string): R;
  toMatchSnapshot(properties: object, hint?: string): R;
  toMatchInlineSnapshot(snapshot?: string): R;
  toMatchInlineSnapshot(properties: object, snapshot?: string): R;
  toThrowErrorMatchingSnapshot(hint?: string): R;
  toThrowErrorMatchingInlineSnapshot(snapshot?: string): R;
  /** Mocks. */
  toHaveBeenCalled(): R;
  toHaveBeenCalledOnce(): R;
  toHaveBeenCalledTimes(times: number): R;
  toHaveBeenCalledWith(...args: unknown[]): R;
  toHaveBeenCalledExactlyOnceWith(...args: unknown[]): R;
  toHaveBeenLastCalledWith(...args: unknown[]): R;
  toHaveBeenNthCalledWith(n: number, ...args: unknown[]): R;
  toHaveReturned(): R;
  toHaveReturnedTimes(times: number): R;
  toHaveReturnedWith(value: unknown): R;
  toHaveLastReturnedWith(value: unknown): R;
  toHaveNthReturnedWith(n: number, value: unknown): R;
  toBeCalled(): R;
  toBeCalledOnce(): R;
  toBeCalledTimes(times: number): R;
  toBeCalledWith(...args: unknown[]): R;
  lastCalledWith(...args: unknown[]): R;
  nthCalledWith(n: number, ...args: unknown[]): R;
  toReturn(): R;
  toReturnTimes(times: number): R;
  toReturnWith(value: unknown): R;
  lastReturnedWith(value: unknown): R;
  nthReturnedWith(n: number, value: unknown): R;
  /** Responses of API tests. */
  toHaveStatus(status: number): R;
  toHaveHeader(name: string, value?: string | RegExp): R;
  /** Valid by a JSON Schema. */
  toMatchSchema(schema: object): R;
}

export type Assertion<T = any> = Matchers<void, T> & {
  not: Assertion<T>;
  resolves: PromisifyAssertion<Awaited<T>>;
  rejects: PromisifyAssertion<any>;
};

export type PromisifyAssertion<T> = Matchers<Promise<void>, T> & { not: PromisifyAssertion<T> };

export interface MatcherState {
  isNot: boolean;
  promise: string;
  equals(a: unknown, b: unknown, testers?: Tester[], strict?: boolean): boolean;
  utils: Record<string, (...args: any[]) => any>;
  assertionCalls?: number;
  expectedAssertionsNumber?: number | null;
  currentTestName?: string;
  testPath?: string;
}

export interface ExpectationResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

export type Tester = (a: unknown, b: unknown, testers: Tester[]) => boolean | undefined;

export interface SnapshotSerializer {
  test(value: unknown): boolean;
  serialize?(
    value: unknown,
    config: unknown,
    indentation: string,
    depth: number,
    refs: unknown,
    printer: Function
  ): string;
  print?(value: unknown, serialize: (value: unknown) => string, indent: (text: string) => string): string;
}

/** expect.any(String), expect.objectContaining({ ... })...: values that match what they describe. */
export interface AsymmetricMatchersContaining {
  any(constructor: unknown): any;
  anything(): any;
  objectContaining<T = any>(expected: T): any;
  arrayContaining<T = unknown>(expected: readonly T[]): any;
  stringContaining(expected: string): any;
  stringMatching(expected: string | RegExp): any;
  closeTo(expected: number, digits?: number): any;
}

export interface ExpectPollOptions {
  interval?: number;
  timeout?: number;
  message?: string;
}

export interface ExpectStatic extends AsymmetricMatchersContaining {
  <T>(actual: T, message?: string): Assertion<T>;
  /** Fails the test at its end, not at once. */
  soft<T>(actual: T, message?: string): Assertion<T>;
  /** Asserts again until the matcher passes or the time is up. */
  poll<T>(fn: () => T, options?: number | ExpectPollOptions): PromisifyAssertion<Awaited<T>>;
  not: AsymmetricMatchersContaining;
  extend(
    matchers: Record<string, (this: MatcherState, received: any, ...expected: any[]) => Awaitable<ExpectationResult>>
  ): void;
  assertions(count: number): void;
  hasAssertions(): void;
  fail(message?: string): never;
  unreachable(message?: string): never;
  getState(): MatcherState;
  setState(state: Partial<MatcherState>): void;
  addEqualityTesters(testers: Tester[]): void;
  addSnapshotSerializer(serializer: SnapshotSerializer): void;
}

export declare const expect: ExpectStatic;

// ------------------------------------------------------------------------------------------------------- mocks

export type MockResult<T> =
  { type: 'return'; value: T } | { type: 'throw'; value: unknown } | { type: 'incomplete'; value: undefined };

export interface MockContext<T extends Procedure = Procedure> {
  calls: Parameters<T>[];
  results: MockResult<ReturnType<T>>[];
  settledResults: ({ type: 'fulfilled'; value: Awaited<ReturnType<T>> } | { type: 'rejected'; value: unknown })[];
  instances: ReturnType<T>[];
  contexts: unknown[];
  invocationCallOrder: number[];
  lastCall: Parameters<T> | undefined;
}

export interface MockInstance<T extends Procedure = Procedure> {
  mock: MockContext<T>;
  _isMockFunction: true;
  getMockName(): string;
  mockName(name: string): this;
  getMockImplementation(): T | undefined;
  mockClear(): this;
  mockReset(): this;
  mockRestore(): void;
  mockImplementation(fn: T): this;
  mockImplementationOnce(fn: T): this;
  /** The implementation while the callback runs, the one before it after. */
  withImplementation(fn: T, callback: () => void): this;
  withImplementation(fn: T, callback: () => Promise<void>): Promise<this>;
  mockReturnValue(value: ReturnType<T>): this;
  mockReturnValueOnce(value: ReturnType<T>): this;
  mockResolvedValue(value: Awaited<ReturnType<T>>): this;
  mockResolvedValueOnce(value: Awaited<ReturnType<T>>): this;
  mockRejectedValue(error: unknown): this;
  mockRejectedValueOnce(error: unknown): this;
  mockReturnThis(): this;
}

export interface Mock<T extends Procedure = Procedure> extends MockInstance<T> {
  (...args: Parameters<T>): ReturnType<T>;
  new (...args: Parameters<T>): ReturnType<T>;
}

type Methods<T> = { [K in keyof T]-?: T[K] extends Procedure ? K : never }[keyof T];
type Properties<T> = { [K in keyof T]-?: T[K] extends Procedure ? never : K }[keyof T];

/** vi.mocked(value): the type of what was mocked, its functions as mocks. */
export type Mocked<T> = (T extends Procedure ? Mock<T> : {}) & {
  [K in keyof T]: T[K] extends Procedure ? Mock<T[K]> & T[K] : T[K];
} & T;

export interface FakeTimersConfig {
  now?: number | Date;
  toFake?: readonly string[];
  loopLimit?: number;
  shouldAdvanceTime?: boolean;
  advanceTimeDelta?: number;
  shouldClearNativeTimers?: boolean;
}

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

export interface VitestUtils {
  fn<T extends Procedure = Procedure>(implementation?: T): Mock<T>;
  spyOn<T, K extends Properties<Required<T>>>(object: T, property: K, accessType: 'get'): Mock<() => T[K]>;
  spyOn<T, K extends Properties<Required<T>>>(object: T, property: K, accessType: 'set'): Mock<(value: T[K]) => void>;
  spyOn<T, K extends Methods<Required<T>>>(
    object: T,
    method: K
  ): Required<T>[K] extends Procedure ? Mock<Required<T>[K]> : never;
  isMockFunction(fn: unknown): fn is Mock;
  mocked<T>(item: T, deep?: boolean | { partial?: boolean; deep?: boolean }): Mocked<T>;
  clearAllMocks(): VitestUtils;
  resetAllMocks(): VitestUtils;
  restoreAllMocks(): VitestUtils;
  /** Modules. */
  mock(path: string, factory?: (importOriginal: <T = any>() => Promise<T>) => any): void;
  doMock(path: string, factory?: (importOriginal: <T = any>() => Promise<T>) => any): void;
  unmock(path: string): void;
  doUnmock(path: string): void;
  dontMock(path: string): VitestUtils;
  deepUnmock(path: string): VitestUtils;
  enableAutomock(): VitestUtils;
  disableAutomock(): VitestUtils;
  hoisted<T>(factory: () => T): T;
  importActual<T = any>(path: string): Promise<T>;
  importMock<T = any>(path: string): Promise<Mocked<T>>;
  requireActual<T = any>(path: string): T;
  requireMock<T = any>(path: string): Mocked<T>;
  resetModules(): VitestUtils;
  isolateModules(fn: () => void): void;
  isolateModulesAsync(fn: () => Promise<void>): Promise<void>;
  dynamicImportSettled(): Promise<void>;
  /** Timers. */
  useFakeTimers(config?: FakeTimersConfig): VitestUtils;
  useRealTimers(): VitestUtils;
  isFakeTimers(): boolean;
  advanceTimersByTime(ms: number): VitestUtils;
  advanceTimersByTimeAsync(ms: number): Promise<VitestUtils>;
  advanceTimersToNextTimer(steps?: number): VitestUtils;
  advanceTimersToNextTimerAsync(steps?: number): Promise<VitestUtils>;
  runAllTimers(): VitestUtils;
  runAllTimersAsync(): Promise<VitestUtils>;
  runOnlyPendingTimers(): VitestUtils;
  runOnlyPendingTimersAsync(): Promise<VitestUtils>;
  runAllTicks(): VitestUtils;
  clearAllTimers(): VitestUtils;
  getTimerCount(): number;
  setSystemTime(time: number | string | Date): VitestUtils;
  getMockedSystemTime(): Date | null;
  getRealSystemTime(): number;
  /** Environment and globals. */
  stubEnv(name: string, value: string | boolean | undefined): VitestUtils;
  unstubAllEnvs(): VitestUtils;
  stubGlobal(name: string | symbol | number, value: unknown): VitestUtils;
  unstubAllGlobals(): VitestUtils;
  /** Waiting. */
  waitFor<T>(callback: () => T, options?: number | WaitForOptions): Promise<Awaited<T>>;
  waitUntil<T>(
    callback: () => T,
    options?: number | WaitForOptions
  ): Promise<Exclude<Awaited<T>, false | 0 | '' | null | undefined>>;
  /** Jest's. */
  setTimeout(ms: number): VitestUtils;
  retryTimes(times: number, options?: { logErrorsBeforeRetry?: boolean }): VitestUtils;
  setConfig(config: Record<string, unknown>): void;
}

export declare const vi: VitestUtils;
export declare const vitest: VitestUtils;
export declare const jest: VitestUtils;

// ------------------------------------------------------------------------------------------------------ types

/** The same type, to TypeScript itself: true or false (any is only any). */
export type IsIdentical<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
type Extends<A, B> = IsNever<A> extends true ? IsNever<B> : [A] extends [B] ? true : false;
type Not<B extends boolean> = B extends true ? false : true;

/** The keys of an object by kind: optional ones ({} has them), and readonly ones (a copy without readonly differs). */
type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type ReadonlyKeys<T> = {
  [K in keyof T]-?: IsIdentical<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }> extends true ? never : K;
}[keyof T];

/** What a type is made of, in one form: two types that are the same in it have the same members (each of the same
 * type, with the same optional and readonly keys), parameters, results and items, whatever their names (an interface
 * and the object type of its members; an intersection and the object it makes). Unions are compared member by
 * member. */
export type Shape<T> =
  IsNever<T> extends true
    ? { kind: 'never' }
    : IsAny<T> extends true
      ? { kind: 'any' }
      : IsUnknown<T> extends true
        ? { kind: 'unknown' }
        : T extends string | number | boolean | bigint | symbol | null | undefined | void
          ? { kind: 'primitive'; type: T }
          : T extends abstract new (...args: infer P) => infer I
            ? { kind: 'constructor'; params: Shape<P>; instance: Shape<I> }
            : T extends (...args: infer P) => infer R
              ? { kind: 'function'; params: Shape<P>; result: Shape<R>; this: Shape<ThisParameterType<T>> }
              : T extends readonly any[]
                ? { kind: 'array'; readonly: T extends any[] ? false : true; items: { [K in keyof T]: Shape<T[K]> } }
                : {
                    kind: 'object';
                    members: { [K in keyof T]-?: Shape<T[K]> };
                    optional: OptionalKeys<T>;
                    readonly: ReadonlyKeys<T>;
                  };

/** The same type: identical, else the same in Shape (as Vitest's expectTypeOf tells them; tsd and tstyche only
 * take identical ones). */
export type IsEqual<A, B> =
  IsIdentical<A, B> extends true
    ? true
    : IsAny<A> extends true
      ? false
      : IsAny<B> extends true
        ? false
        : [Shape<A>] extends [Shape<B>]
          ? [Shape<B>] extends [Shape<A>]
            ? true
            : false
          : false;

/** What a type check that fails shows in its error: the two types. */
export interface Mismatch<Actual, Expected> {
  'the types differ': { actual: Actual; expected: Expected };
}

/** A check passes with no argument; one that fails asks for an argument, which makes tsc report it. */
type CheckArgs<Result extends boolean, Positive extends boolean> = Result extends Positive ? [] : [never];

/** For a check given its type argument (<T>): one that fails, by its constraint, says what the types are. */
type Expecting<Result extends boolean, Positive extends boolean, Actual, Expected> = Result extends Positive
  ? unknown
  : Mismatch<Actual, Expected>;

/**
 * The constraint of toEqualTypeOf<T> (a cheap check: a deep one there would be circular), which says what the types
 * are when it fails: they must be assignable both ways (to be equal), or, with not, not identical.
 */
type EqualHint<Actual, Expected, Positive extends boolean> = Positive extends true
  ? [Actual] extends [Expected]
    ? [Expected] extends [Actual]
      ? unknown
      : Mismatch<Actual, Expected>
    : Mismatch<Actual, Expected>
  : IsIdentical<Actual, Expected> extends true
    ? Mismatch<Actual, Expected>
    : unknown;

export interface ExpectTypeOf<Actual, Positive extends boolean = true> {
  /** The type is exactly this one. */
  toEqualTypeOf<Expected extends EqualHint<Actual, Expected, Positive>>(
    ...check: CheckArgs<IsEqual<Actual, Expected>, Positive>
  ): void;
  toEqualTypeOf<Expected extends EqualHint<Actual, Expected, Positive>>(
    expected: Expected,
    ...check: CheckArgs<IsEqual<Actual, Expected>, Positive>
  ): void;
  /** The type is assignable to this one. */
  toMatchTypeOf<Expected extends Expecting<Extends<Actual, Expected>, Positive, Actual, Expected>>(
    ...check: CheckArgs<Extends<Actual, Expected>, Positive>
  ): void;
  toMatchTypeOf<Expected extends Expecting<Extends<Actual, Expected>, Positive, Actual, Expected>>(
    expected: Expected,
    ...check: CheckArgs<Extends<Actual, Expected>, Positive>
  ): void;
  /** Another name of toMatchTypeOf. */
  toExtend<Expected extends Expecting<Extends<Actual, Expected>, Positive, Actual, Expected>>(
    ...check: CheckArgs<Extends<Actual, Expected>, Positive>
  ): void;
  toHaveProperty<K extends PropertyKey>(
    key: K,
    ...check: CheckArgs<K extends keyof Actual ? true : false, Positive>
  ): K extends keyof Actual ? ExpectTypeOf<Actual[K], Positive> : void;
  toBeAny(...check: CheckArgs<IsAny<Actual>, Positive>): void;
  toBeUnknown(...check: CheckArgs<IsUnknown<Actual>, Positive>): void;
  toBeNever(...check: CheckArgs<IsNever<Actual>, Positive>): void;
  toBeFunction(...check: CheckArgs<Extends<Actual, Procedure>, Positive>): void;
  toBeObject(...check: CheckArgs<Extends<Actual, object>, Positive>): void;
  toBeArray(...check: CheckArgs<Extends<Actual, readonly any[]>, Positive>): void;
  toBeString(...check: CheckArgs<Extends<Actual, string>, Positive>): void;
  toBeNumber(...check: CheckArgs<Extends<Actual, number>, Positive>): void;
  toBeBoolean(...check: CheckArgs<Extends<Actual, boolean>, Positive>): void;
  toBeBigInt(...check: CheckArgs<Extends<Actual, bigint>, Positive>): void;
  toBeSymbol(...check: CheckArgs<Extends<Actual, symbol>, Positive>): void;
  toBeVoid(...check: CheckArgs<Extends<Actual, void>, Positive>): void;
  toBeNull(...check: CheckArgs<Extends<Actual, null>, Positive>): void;
  toBeUndefined(...check: CheckArgs<Extends<Actual, undefined>, Positive>): void;
  toBeNullable(...check: CheckArgs<Not<IsEqual<Actual, NonNullable<Actual>>>, Positive>): void;
  /** Calls with these arguments type-check (of the last signature, for overloads: a call itself checks them all). */
  toBeCallableWith(...args: Actual extends (...args: infer A) => any ? A : never): void;
  toBeConstructibleWith(...args: Actual extends abstract new (...args: infer A) => any ? A : never): void;
  parameters: ExpectTypeOf<Actual extends (...args: infer A) => any ? A : never, Positive>;
  parameter<N extends number>(n: N): ExpectTypeOf<Actual extends (...args: infer A) => any ? A[N] : never, Positive>;
  returns: ExpectTypeOf<Actual extends (...args: any[]) => infer R ? R : never, Positive>;
  resolves: ExpectTypeOf<Awaited<Actual>, Positive>;
  items: ExpectTypeOf<Actual extends readonly (infer I)[] ? I : never, Positive>;
  instance: ExpectTypeOf<Actual extends abstract new (...args: any[]) => infer I ? I : never, Positive>;
  constructorParameters: ExpectTypeOf<Actual extends abstract new (...args: infer A) => any ? A : never, Positive>;
  exclude<U>(): ExpectTypeOf<Exclude<Actual, U>, Positive>;
  extract<U>(): ExpectTypeOf<Extract<Actual, U>, Positive>;
  pick<K extends keyof Actual>(): ExpectTypeOf<Pick<Actual, K>, Positive>;
  omit<K extends PropertyKey>(): ExpectTypeOf<Omit<Actual, K>, Positive>;
  /** The checks reversed. */
  not: ExpectTypeOf<Actual, Not<Positive>>;
}

/** expectTypeOf(value), or expectTypeOf<Type>(): checks of types, for tsc (at run time it does nothing). */
export declare function expectTypeOf<Actual>(actual: Actual): ExpectTypeOf<Actual>;
export declare function expectTypeOf<Actual>(): ExpectTypeOf<Actual>;

/** The value is assignable to the type: assertType<string>(value). */
export declare function assertType<T>(value: T): void;

/** Makes the API globals (describe, it, expect, vi...) of this object: the runner does it for test files. */
export declare function installGlobals(target?: object): void;

declare const xufaTest: {
  test: TestAPI;
  it: TestAPI;
  describe: SuiteAPI;
  suite: SuiteAPI;
  beforeAll: typeof beforeAll;
  afterAll: typeof afterAll;
  beforeEach: typeof beforeEach;
  afterEach: typeof afterEach;
  onTestFinished: typeof onTestFinished;
  onTestFailed: typeof onTestFailed;
  bench: BenchAPI;
  expect: ExpectStatic;
  vi: VitestUtils;
  vitest: VitestUtils;
  jest: VitestUtils;
  inject: typeof inject;
  expectTypeOf: typeof expectTypeOf;
  assertType: typeof assertType;
  installGlobals: typeof installGlobals;
};
export default xufaTest;
