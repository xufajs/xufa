// Ported from fastify (test/types/using.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expect, test } from 'tstyche'
import xufa, { XufaInstance } from '../..'

test("has 'Symbol.dispose' when declared with 'using'", async () => {
  await using app = xufa()
  expect(app).type.toBeAssignableTo<XufaInstance>()
  expect(app[Symbol.asyncDispose]).type.toBe<() => Promise<undefined>>()
})

test("has 'Symbol.dispose'", async () => {
  await using app = xufa()
  expect(app).type.toBeAssignableTo<XufaInstance>()
  expect(app[Symbol.asyncDispose]).type.toBe<() => Promise<undefined>>()
})
