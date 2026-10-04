'use strict'


const Fastify = require('..')

describe('Buffer test', () => {
const fastify = Fastify()
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, fastify.getDefaultJsonParser('error', 'ignore'))
fastify.delete('/', async (request) => {
    return request.body
  })
test('should return 200 if the body is not empty', async () => {
    expect.assertions(3)

    const response = await fastify.inject({
      method: 'DELETE',
      url: '/',
      payload: Buffer.from('{"hello":"world"}'),
      headers: {
        'content-type': 'application/json'
      }
    })

    expect(response.error).toBeFalsy()
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toEqual('{"hello":"world"}')
  })
test('should return 400 if the body is empty', async () => {
    expect.assertions(3)

    const response = await fastify.inject({
      method: 'DELETE',
      url: '/',
      payload: Buffer.alloc(0),
      headers: {
        'content-type': 'application/json'
      }
    })

    expect(response.error).toBeFalsy()
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload.toString())).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
      message: 'Body cannot be empty when content-type is set to \'application/json\'',
      statusCode: 400
    })
  })
test('should return 400 if the body is invalid json', async () => {
    expect.assertions(3)

    const response = await fastify.inject({
      method: 'DELETE',
      url: '/',
      payload: Buffer.from(']'),
      headers: {
        'content-type': 'application/json'
      }
    })

    expect(response.error).toBeFalsy()
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload.toString())).toEqual({
      error: 'Bad Request',
      code: 'XUFA_ERR_CTP_INVALID_JSON_BODY',
      message: 'Body is not valid JSON but content-type is set to \'application/json\'',
      statusCode: 400
    })
  })
})
