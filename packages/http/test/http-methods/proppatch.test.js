'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('PROPPATCH', { hasBody: true })

const bodySample = `<?xml version="1.0" encoding="utf-8" ?>
        <D:propertyupdate xmlns:D="DAV:"
          xmlns:Z="http://ns.fastify.test/standards/z39.50/">
          <D:set>
            <D:prop>
              <Z:Authors>
                <Z:Author>Jim Whitehead</Z:Author>
                <Z:Author>Roy Fielding</Z:Author>
              </Z:Authors>
            </D:prop>
          </D:set>
          <D:remove>
            <D:prop>
              <Z:Copyright-Owner/>
            </D:prop>
          </D:remove>
        </D:propertyupdate>`

test('shorthand - proppatch', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'PROPPATCH',
      url: '*',
      handler: function (req, reply) {
        reply
          .code(207)
          .send(`<?xml version="1.0" encoding="utf-8" ?>
            <D:multistatus xmlns:D="DAV:"
              xmlns:Z="http://ns.fastify.test/standards/z39.50/">
              <D:response>
                <D:href>http://www.fastify.test/bar.html</D:href>
                <D:propstat>
                  <D:prop>
                    <Z:Authors/>
                  </D:prop>
                  <D:status>HTTP/1.1 424 Failed Dependency</D:status>
                </D:propstat>
                <D:propstat>
                  <D:prop>
                    <Z:Copyright-Owner/>
                  </D:prop>
                  <D:status>HTTP/1.1 409 Conflict</D:status>
                </D:propstat>
                <D:responsedescription> Copyright Owner cannot be deleted or altered.</D:responsedescription>
              </D:response>
            </D:multistatus>`
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

describe('proppatch test', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('request with body - proppatch', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'PROPPATCH',
      headers: { 'content-type': 'text/plain' },
      body: bodySample
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request with body and no content type (415 error) - proppatch', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'PROPPATCH',
      body: bodySample,
      headers: { 'content-type': undefined }
    })
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(415)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request without body - proppatch', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'PROPPATCH'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
})
