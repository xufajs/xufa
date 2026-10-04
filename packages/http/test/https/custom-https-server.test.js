'use strict'


const Fastify = require('../..')
const https = require('node:https')
const dns = require('node:dns').promises
const { buildCertificate } = require('../build-certificate')
const { Agent, fetch } = require('undici')

async function setup () {
  await buildCertificate()

  const localAddresses = await dns.lookup('localhost', { all: true })

  test.skipIf(localAddresses.length < 1)('Should support a custom https server', async () => {
    expect.assertions(5)

    const fastify = Fastify({
      serverFactory: (handler, opts) => {
        expect(opts.serverFactory).toBeTruthy()

        const options = {
          key: global.context.key,
          cert: global.context.cert
        }

        const server = https.createServer(options, (req, res) => {
          req.custom = true
          handler(req, res)
        })

        return server
      }
    })

    onTestFinished(() => { fastify.close() })

    fastify.get('/', (req, reply) => {
      expect(req.raw.custom).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    await fastify.listen({ port: 0 })

    const result = await fetch('https://localhost:' + fastify.server.address().port, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ hello: 'world' })
  })
}

describe('server', async () => {
  await setup()
})
