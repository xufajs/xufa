// Ported from fastify (test/types/decorate-request-reply.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expect } from 'tstyche'
import xufa from '../..'

type TestType = void

declare module '../..' {
  interface XufaRequest {
    testProp: TestType;
  }
  interface XufaReply {
    testProp: TestType;
  }
}

xufa().get('/', (req, res) => {
  expect(req.testProp).type.toBe<TestType>()
  expect(res.testProp).type.toBe<TestType>()
})
