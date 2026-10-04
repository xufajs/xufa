'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('LOCK', { hasBody: true })

const bodySample = `<?xml version="1.0" encoding="utf-8" ?>
        <D:lockinfo xmlns:D='DAV:'>
          <D:lockscope> <D:exclusive/> </D:lockscope>
          <D:locktype> <D:write/> </D:locktype>
          <D:owner>
            <D:href>http://fastify.test/~ejw/contact.html</D:href>
          </D:owner>
        </D:lockinfo> `

test('can be created - lock', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'LOCK',
      url: '*',
      handler: function (req, reply) {
        reply
          .code(200)
          .send(`<?xml version="1.0" encoding="utf-8" ?>
            <D:prop xmlns:D="DAV:">
              <D:lockdiscovery>
                <D:activelock>
                  <D:locktype>
                    <D:write/>
                  </D:locktype>
                  <D:lockscope>
                    <D:exclusive/>
                  </D:lockscope>
                  <D:depth>infinity</D:depth>
                  <D:owner>
                    <D:href>http://fastify.test/~ejw/contact.html</D:href>
                  </D:owner>
                  <D:timeout>Second-604800</D:timeout>
                  <D:locktoken>
                    <D:href>urn:uuid:e71d4fae-5dec-22d6-fea5-00a0c91e6be4</:href>
                  </D:locktoken>
                  <D:lockroot>
                    <D:href>http://fastify.test/workspace/webdav/proposal.oc</D:href>
                  </D:lockroot>
                </D:activelock>
              </D:lockdiscovery>
            </D:prop>`
          )
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('lock test', () => {
let fastifyServer;
afterAll(() => {
    fastify.close()
  })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('request with body - lock', async () => {
    expect.assertions(3)

    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'LOCK',
      headers: { 'content-type': 'text/plain' },
      body: bodySample
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request with body and no content type (415 error) - lock', async () => {
    expect.assertions(3)

    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'LOCK',
      body: bodySample,
      headers: { 'content-type': undefined }
    })

    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(415)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request without body - lock', async () => {
    expect.assertions(3)

    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'LOCK',
      headers: { 'content-type': 'text/plain' }
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
})
