'use strict'


const fastify = require('../..')()
fastify.addHttpMethod('PROPFIND', { hasBody: true })

const bodySample = `<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
          <D:prop xmlns:R="http://ns.fastify.test/boxschema/">
            <R:bigbox/> <R:author/> <R:DingALing/> <R:Random/>
          </D:prop>
        </D:propfind>
      `

test('can be created - propfind', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'PROPFIND',
      url: '*',
      handler: function (req, reply) {
        return reply.code(207)
          .send(`<?xml version="1.0" encoding="utf-8"?>
            <D:multistatus xmlns:D="DAV:">
              <D:response xmlns:lp1="DAV:">
                <D:href>/</D:href>
                <D:propstat>
                  <D:prop>
                    <lp1:resourcetype>
                      <D:collection/>
                    </lp1:resourcetype>
                    <lp1:creationdate>2022-04-13T12:35:30Z</lp1:creationdate>
                    <lp1:getlastmodified>Wed, 13 Apr 2022 12:35:30 GMT</lp1:getlastmodified>
                    <lp1:getetag>"e0-5dc8869b53ef1"</lp1:getetag>
                    <D:supportedlock>
                      <D:lockentry>
                        <D:lockscope>
                          <D:exclusive/>
                        </D:lockscope>
                        <D:locktype>
                          <D:write/>
                        </D:locktype>
                      </D:lockentry>
                      <D:lockentry>
                        <D:lockscope>
                          <D:shared/>
                        </D:lockscope>
                        <D:locktype>
                          <D:write/>
                        </D:locktype>
                      </D:lockentry>
                    </D:supportedlock>
                    <D:lockdiscovery/>
                    <D:getcontenttype>httpd/unix-directory</D:getcontenttype>
                  </D:prop>
                  <D:status>HTTP/1.1 200 OK</D:status>
                </D:propstat>
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

describe('propfind test', () => {
afterAll(() => {
    fastify.close()
  })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('request - propfind', async () => {
    expect.assertions(3)
    const result = await fetch(`http://localhost:${fastify.server.address().port}/`, {
      method: 'PROPFIND'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request with other path - propfind', async () => {
    expect.assertions(3)
    const result = await fetch(`http://localhost:${fastify.server.address().port}/test`, {
      method: 'PROPFIND'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request with body - propfind', async () => {
    expect.assertions(3)
    const result = await fetch(`http://localhost:${fastify.server.address().port}/test`, {
      method: 'PROPFIND',
      headers: { 'content-type': 'text/plain' },
      body: bodySample
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request with body and no content type (415 error) - propfind', async () => {
    expect.assertions(3)
    const result = await fetch(`http://localhost:${fastify.server.address().port}/test`, {
      method: 'PROPFIND',
      body: bodySample,
      headers: { 'content-type': '' }
    })
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(415)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
test('request without body - propfind', async () => {
    expect.assertions(3)
    const result = await fetch(`http://localhost:${fastify.server.address().port}/test`, {
      method: 'PROPFIND'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(207)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
  })
})
