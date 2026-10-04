'use strict'


const Fastify = require('..')

test('Should export withTypeProvider function', (done) => {
  expect.assertions(1)
  try {
    Fastify().withTypeProvider()
    expect('pass').toBeTruthy()
    done()
  } catch (e) {
    expect.fail(e)
  }
})

test('Should return same instance', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  expect(fastify).toBe(fastify.withTypeProvider())
  done()
})
