// Ported from fastify (test/types/schema.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import Ajv from 'ajv'
import { expect } from 'tstyche'
import xufa, { XufaInstance, XufaSchema } from '../..'

const server = xufa()

expect(server.get(
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
)).type.toBe<XufaInstance>()

expect(server.post(
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
)).type.toBe<XufaInstance>()

expect(server.get(
  '/empty-schema',
  {
    schema: {}
  },
  () => { }
)).type.toBe<XufaInstance>()

expect(server.get(
  '/no-schema',
  {},
  () => { }
)).type.toBe<XufaInstance>()

expect(server.setValidatorCompiler(({ schema }) => {
  return new Ajv().compile(schema)
})).type.toBe<XufaInstance>()

expect(server.setSerializerCompiler(() => {
  return data => JSON.stringify(data)
})).type.toBe<XufaInstance>()

expect(server.post('/test', {
  validatorCompiler: ({ schema }) => {
    return data => {
      if (!data || data.constructor !== Object) {
        return { error: new Error('value is not an object') }
      }
      return { value: data }
    }
  }
}, async req => req.body)).type.toBe<XufaInstance>()

expect(server.post('/test', {
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
}, async req => req.body)).type.toBe<XufaInstance>()

expect(server.setValidatorCompiler<XufaSchema & { validate: Record<string, unknown> }>(
  function ({ schema }) {
    return new Ajv().compile(schema)
  }
)).type.toBe<XufaInstance>()

expect(server.setSerializerCompiler<XufaSchema & { validate: string }>(
  () => data => JSON.stringify(data)
)).type.toBe<XufaInstance>()
