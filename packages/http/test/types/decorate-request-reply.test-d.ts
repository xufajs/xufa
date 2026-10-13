// Ported from fastify (test/types/decorate-request-reply.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf } from '@xufa/test';
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
  expectTypeOf(req.testProp).toEqualTypeOf<TestType>();
  expectTypeOf(res.testProp).toEqualTypeOf<TestType>();
})
