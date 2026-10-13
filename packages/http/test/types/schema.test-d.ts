// Ported from fastify (test/types/schema.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import Ajv from 'ajv'
import { expectTypeOf } from '@xufa/test';
import xufa, { XufaInstance, XufaSchema } from '../..'

const server = xufa()

expectTypeOf(server.get(
  '/full-schema',
  {
    schema: {
      body: { type: 'null' },
      querystring: { type: 'null' },
      params: { type: 'null' },
      headers: { type: 'null' },
      response: { type: 'null' }
    }
  },
  () => { }
)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.post(
  '/multiple-content-schema',
  {
    schema: {
      body: {
        content: {
          'application/json': {
            schema: { type: 'object' }
          },
          'text/plain': {
            schema: { type: 'string' }
          }
        }
      }
    }
  },
  () => { }
)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.get(
  '/empty-schema',
  {
    schema: {}
  },
  () => { }
)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.get(
  '/no-schema',
  {},
  () => { }
)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setValidatorCompiler(({ schema }) => {
  return new Ajv().compile(schema)
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setSerializerCompiler(() => {
  return data => JSON.stringify(data)
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.post('/test', {
  validatorCompiler: ({ schema }) => {
    return data => {
      if (!data || data.constructor !== Object) {
        return { error: new Error('value is not an object') }
      }
      return { value: data }
    }
  }
}, async req => req.body)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.post('/test', {
  validatorCompiler: ({ schema }) => {
    return data => {
      if (!data || data.constructor !== Object) {
        return {
          error: [
            {
              keyword: 'type',
              instancePath: '',
              schemaPath: '#/type',
              params: { type: 'object' },
              message: 'value is not an object'
            }
          ]
        }
      }
      return { value: data }
    }
  }
}, async req => req.body)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setValidatorCompiler<XufaSchema & { validate: Record<string, unknown> }>(
  function ({ schema }) {
    return new Ajv().compile(schema)
  }
)).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setSerializerCompiler<XufaSchema & { validate: string }>(
  () => data => JSON.stringify(data)
)).toEqualTypeOf<XufaInstance>();
