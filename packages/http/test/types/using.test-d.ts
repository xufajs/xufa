// Ported from fastify (test/types/using.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf, test } from '@xufa/test';
import xufa, { XufaInstance } from '../..'

test("has 'Symbol.dispose' when declared with 'using'", async () => {
  await using app = xufa()
  expectTypeOf(app).toMatchTypeOf<XufaInstance>();
  expectTypeOf(app[Symbol.asyncDispose]).toEqualTypeOf<() => Promise<undefined>>();
})

test("has 'Symbol.dispose'", async () => {
  await using app = xufa()
  expectTypeOf(app).toMatchTypeOf<XufaInstance>();
  expectTypeOf(app[Symbol.asyncDispose]).toEqualTypeOf<() => Promise<undefined>>();
})
