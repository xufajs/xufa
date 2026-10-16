// @xufa/test/supertest: supertest 7's API on a request handler, a server, an instance with ready() and server (as
// fastify and @xufa/http), and a URL; its bodies (JSON, forms, multipart, streamed), cookies of agents, redirects,
// timeouts and the messages of its assertions. (tools: the same requests to supertest 7.2.2 gave the same answers.)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const request = require('../src/supertest/index.js');

// Answers what it was sent: method, url, headers and body (as text).
function echo(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    if (req.url === '/slow') return setTimeout(() => res.end('late'), 500);
    if (req.url === '/login') {
      res.setHeader('Set-Cookie', ['sid=abc; Path=/; HttpOnly', 'old=1; Max-Age=0']);
      return res.end('in');
    }
    if (req.url.startsWith('/moved')) {
      res.writeHead(302, { Location: '/landed?from=moved' });
      return res.end();
    }
    if (req.url === '/file') {
      res.setHeader('Content-Type', 'image/png');
      return res.end(Buffer.from([1, 2, 3]));
    }
    if (req.url === '/form') {
      res.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      return res.end('a=1&b[c]=2&d=3&d=4');
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Link', '<http://x/2>; rel="next"');
    return res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        type: req.headers['content-type'],
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      })
    );
  });
}

describe('@xufa/test/supertest', () => {
  it('serves a request handler on a server of its own, closed after the request', async () => {
    const test = request(echo).get('/a?b=1');
    expect(test._server.listening).toBe(true);
    const res = await test.expect(200).expect('Content-Type', /json/);
    expect(res.body).toMatchObject({ method: 'GET', url: '/a?b=1' });
    expect(res.type).toBe('application/json');
    expect(res.links).toEqual({ next: 'http://x/2' });
    expect(test._server.listening).toBe(false);
  });

  it('uses a server that listens as it is, and leaves it listening', async () => {
    const server = http.createServer(echo);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      await request(server).delete('/x').expect(200);
      await request(server).del('/x').expect(200);
      expect(server.listening).toBe(true);
    } finally {
      server.close();
    }
  });

  it('makes an instance with ready() and a server ready first (fastify, @xufa/http)', async () => {
    let ready = false;
    const instance = {
      server: http.createServer(echo),
      ready: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            ready = true;
            resolve();
          }, 20);
        }),
    };
    const res = await request(instance).post('/ready').send({ a: 1 });
    expect(ready).toBe(true);
    expect(res.body).toMatchObject({ type: 'application/json', body: '{"a":1}' });
    expect(instance.server.listening).toBe(false);
    // (a body written before it is ready is sent once it is.)
    const streamed = request(instance).post('/stream').set('Content-Type', 'text/plain');
    streamed.write('one ');
    streamed.write('two');
    expect((await streamed).body.body).toBe('one two');
  });

  it('sends to a URL', async () => {
    const server = http.createServer(echo);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const res = await request(`http://127.0.0.1:${server.address().port}`).get('/u').expect(200);
      expect(res.body.url).toBe('/u');
    } finally {
      server.close();
    }
  });

  it('sends JSON, forms, queries and basic authorization as superagent', async () => {
    const json = await request(echo).post('/').send({ a: 1 }).send({ b: [1, 2] });
    expect(json.body).toMatchObject({ type: 'application/json', body: '{"a":1,"b":[1,2]}' });
    const form = await request(echo).post('/').send('a=1').send('b=2');
    expect(form.body).toMatchObject({ type: 'application/x-www-form-urlencoded', body: 'a=1&b=2' });
    const object = await request(echo).post('/').type('form').send({ pet: { name: 'Rex' }, tags: ['a', 'b'], none: null });
    expect(object.body.body).toBe('pet%5Bname%5D=Rex&tags=a&tags=b&none');
    const query = await request(echo).get('/q').query('raw=1').query({ a: 1, b: [1, 2], d: { e: 'f g' } });
    expect(query.body.url).toBe('/q?raw=1&a=1&b=1&b=2&d%5Be%5D=f%20g');
    const auth = await request(echo).get('/').auth('ada', 'p@ss');
    expect(auth.body.authorization).toBe(`Basic ${Buffer.from('ada:p@ss').toString('base64')}`);
  });

  it('sends fields and files as multipart/form-data', async () => {
    const file = path.join(os.tmpdir(), `xufa-supertest-${process.pid}.png`);
    fs.writeFileSync(file, Buffer.from([137, 80, 78, 71]));
    try {
      const res = await request(echo)
        .post('/upload')
        .field('name', 'photo')
        .field({ tags: ['a', 'b'], count: 2 })
        .attach('image', file)
        .attach('sheet', Buffer.from('xx'), 'data.xlsx');
      const { type, body } = res.body;
      const boundary = type.match(/^multipart\/form-data; boundary=(-{26}[0-9a-f]{24})$/)[1];
      expect(body.split(`--${boundary}`).map((part) => part.split('\r\n').filter(Boolean))).toEqual([
        [],
        ['Content-Disposition: form-data; name="name"', 'photo'],
        ['Content-Disposition: form-data; name="tags"', 'a'],
        ['Content-Disposition: form-data; name="tags"', 'b'],
        ['Content-Disposition: form-data; name="count"', '2'],
        [`Content-Disposition: form-data; name="image"; filename="${path.basename(file)}"`, 'Content-Type: image/png', '\x89PNG'.replace('\x89', '�')],
        [
          'Content-Disposition: form-data; name="sheet"; filename="data.xlsx"',
          'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'xx',
        ],
        ['--'],
      ]);
      expect(() => request(echo).post('/').send({ a: 1 }).field('b', 'c')).toThrow(/can't be used if .send\(\)/);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('reads bodies as superagent: binary types a Buffer, forms parsed, responseType a Buffer', async () => {
    const png = await request(echo).get('/file');
    expect(png.body).toEqual(Buffer.from([1, 2, 3]));
    expect(png.text).toBeUndefined();
    const form = await request(echo).get('/form');
    expect(form.body).toEqual({ a: '1', b: { c: '2' }, d: ['3', '4'] });
    const blob = await request(echo).get('/').responseType('blob');
    expect(Buffer.isBuffer(blob.body)).toBe(true);
    expect(JSON.parse(blob.body.toString()).method).toBe('GET');
  });

  it("sends paths as superagent 10 (WHATWG's URL), or as supertest 6 with legacyPaths", async () => {
    const path10 = (await request(echo).get("/a/../b/./c d/'e'\\f?q=a b#frag")).body.url;
    expect(path10).toBe("/b/c%20d/'e'/f?q=a%20b");
    const path6 = (await request(echo, { legacyPaths: true }).get("/a/../b/./c d/'e'\\f?q=a b#frag")).body.url;
    expect(path6).toBe('/a/../b/./c%20d/%27e%27/f?q=a%20b');
  });

  it('follows no redirect unless asked', async () => {
    const res = await request(echo).post('/moved').send({ a: 1 }).expect(302);
    expect(res.redirect).toBe(true);
    expect(res.headers.location).toBe('/landed?from=moved');
    const followed = await request(echo).post('/moved').send({ a: 1 }).redirects(1).expect(200);
    expect(followed.body).toMatchObject({ method: 'GET', url: '/landed?from=moved', body: '' });
    expect(followed.redirects).toHaveLength(1);
  });

  it('keeps the cookies of an agent, and what was set on it', async () => {
    const agent = request.agent(echo).set('X-Agent', 'yes');
    await agent.get('/login').expect(200);
    const res = await agent.get('/me');
    expect(res.body.cookie).toBe('sid=abc');
    expect((await request(echo).get('/me')).body.cookie).toBeUndefined();
  });

  it('ends with a timeout', async () => {
    await expect(request(echo).get('/slow').timeout(50)).rejects.toThrow('Timeout of 50ms exceeded');
  });

  it("fails with supertest's messages", async () => {
    await expect(request(echo).get('/').expect(201)).rejects.toThrow('expected 201 "Created", got 200 "OK"');
    await expect(request(echo).get('/').expect([201, 204])).rejects.toThrow('expected one of "201, 204", got 200 "OK"');
    await expect(request(echo).get('/').expect('Content-Type', 'text/html')).rejects.toThrow(
      'expected "Content-Type" of "text/html", got "application/json"'
    );
    await expect(request(echo).get('/').expect('X-None', /a/)).rejects.toThrow('expected "X-None" header field');
    await expect(request(echo).get('/file').expect('nope')).rejects.toThrow("expected 'nope' response body, got undefined");
    await expect(request(echo).get('/form').expect({ a: '2' })).rejects.toThrow("expected { a: '2' } response body");
    await expect(
      request(echo)
        .get('/')
        .expect(() => {
          throw new Error('mine');
        })
    ).rejects.toThrow('mine');
    const refused = http.createServer();
    await new Promise((resolve) => {
      refused.listen(0, '127.0.0.1', resolve);
    });
    const { port } = refused.address();
    await new Promise((resolve) => {
      refused.close(resolve);
    });
    await expect(request(`http://127.0.0.1:${port}`).get('/')).rejects.toThrow('ECONNREFUSED: Connection refused');
  });

  it('ends with a callback as supertest: expect(..., done) and end(fn)', (done) => {
    request(echo)
      .get('/')
      .expect(200, (err, res) => {
        if (err) return done(err);
        expect(res.status).toBe(200);
        return done();
      });
  });
});
