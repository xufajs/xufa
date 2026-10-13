// The globals @xufa/test gives test files (describe, it, expect, vi...), for projects that use them without imports:
// "types": ["@xufa/test/globals"] in tsconfig.json, or /// <reference types="@xufa/test/globals" />.
import type * as api from './index.js';

declare global {
  const describe: api.SuiteAPI;
  const suite: api.SuiteAPI;
  const it: api.TestAPI;
  const test: api.TestAPI;
  const beforeAll: typeof api.beforeAll;
  const afterAll: typeof api.afterAll;
  const beforeEach: typeof api.beforeEach;
  const afterEach: typeof api.afterEach;
  const onTestFinished: typeof api.onTestFinished;
  const onTestFailed: typeof api.onTestFailed;
  const expect: api.ExpectStatic;
  const vi: api.VitestUtils;
  const vitest: api.VitestUtils;
  const jest: api.VitestUtils;
  const expectTypeOf: typeof api.expectTypeOf;
  const assertType: typeof api.assertType;
  const bench: api.BenchAPI;
  /** Jasmine's fail(), which some Jest suites still use. */
  function fail(message?: string): never;
}

export {};
