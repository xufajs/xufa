// Tests of xufa (not ported from fastify): formBody, the bodies of HTML forms (urlencoded and multipart, with files).
import xufa from '../../index.js';

function makeApp(options) {
  const app = xufa();
  app.register(xufa.formBody, options);
  app.post('/form', async (request) => {
    const body = { ...request.body };
    for (const [key, value] of Object.entries(body)) {
      if (value && value.data) body[key] = { ...value, data: value.data.toString('utf8') };
    }
    return { body, proto: Object.getPrototypeOf(request.body) === Object.prototype };
  });
  return app;
}

// A multipart body of parts: [name, value] or [name, { filename, type, data }].
function multipart(parts, boundary = '----xufa-boundary-7') {
  const chunks = [];
  for (const [name, value] of parts) {
    chunks.push(`--${boundary}\r\n`);
    if (typeof value === 'string') {
      chunks.push(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    } else {
      chunks.push(
        `Content-Disposition: form-data; name="${name}"; filename="${value.filename}"\r\nContent-Type: ${value.type}\r\n\r\n`
      );
      chunks.push(value.data);
      chunks.push('\r\n');
    }
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('formBody', () => {
  it('urlencoded: fields, lists (a name again, or name[]), and no keys of prototypes', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/form',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'title=Dune+Messiah&genre=1&genre=3&tags%5B%5D=sf&__proto__=x&note=caf%C3%A9',
    });
    expect(res.json()).toEqual({
      body: { title: 'Dune Messiah', genre: ['1', '3'], tags: ['sf'], note: 'café' },
      proto: true,
    });
  });

  it('multipart: fields and files ({ filename, contentType, size, data }); an empty input of a file is no file', async () => {
    const app = makeApp();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { payload, headers } = multipart([
      ['title', 'Dune'],
      ['genre', '1'],
      ['genre', '2'],
      ['notes', { filename: 'notes.txt', type: 'text/plain', data: Buffer.from('line 1\r\nline 2') }],
      ['cover', { filename: 'cover.png', type: 'image/png', data: png }],
      ['empty', { filename: '', type: 'application/octet-stream', data: Buffer.alloc(0) }],
    ]);
    const app2 = xufa();
    app2.register(xufa.formBody);
    app2.post('/form', async (request) => ({
      title: request.body.title,
      genre: request.body.genre,
      notes: request.body.notes.data.toString('utf8'),
      cover: [request.body.cover.filename, request.body.cover.contentType, request.body.cover.size, request.body.cover.data.equals(png)],
      empty: Object.hasOwn(request.body, 'empty'),
    }));
    expect((await app2.inject({ method: 'POST', url: '/form', headers, payload })).json()).toEqual({
      title: 'Dune',
      genre: ['1', '2'],
      notes: 'line 1\r\nline 2',
      cover: ['cover.png', 'image/png', 8, true],
      empty: false,
    });
    expect((await app.inject({ method: 'POST', url: '/form', headers, payload })).statusCode).toBe(200);
  });

  it('limits: files too large or too many (413), too many fields (400), a body not well made (400)', async () => {
    const app = makeApp({ fileSize: 10, files: 1, fields: 2 });
    const big = multipart([['a', { filename: 'a.txt', type: 'text/plain', data: Buffer.alloc(11) }]]);
    const tooBig = await app.inject({ method: 'POST', url: '/form', ...big });
    expect([tooBig.statusCode, tooBig.json().message]).toEqual([413, 'A file has at most 10 bytes']);
    const two = multipart([
      ['a', { filename: 'a.txt', type: 'text/plain', data: Buffer.from('x') }],
      ['b', { filename: 'b.txt', type: 'text/plain', data: Buffer.from('y') }],
    ]);
    expect((await app.inject({ method: 'POST', url: '/form', ...two })).statusCode).toBe(413);
    const fields = multipart([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
    expect((await app.inject({ method: 'POST', url: '/form', ...fields })).statusCode).toBe(400);
    const broken = await app.inject({
      method: 'POST',
      url: '/form',
      headers: { 'content-type': 'multipart/form-data; boundary=zzz' },
      payload: '--zzz\r\nContent-Disposition: form-data; name="a"\r\n\r\nno end',
    });
    expect(broken.statusCode).toBe(400);
    const noBoundary = await app.inject({ method: 'POST', url: '/form', headers: { 'content-type': 'multipart/form-data' }, payload: 'x' });
    expect(noBoundary.statusCode).toBe(400);
    // The limit of a body: 413.
    const small = makeApp({ bodyLimit: 10 });
    const long = await small.inject({
      method: 'POST',
      url: '/form',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a='.padEnd(40, 'x'),
    });
    expect(long.statusCode).toBe(413);
  });

  it('names of files with quotes and in UTF-8 (filename*), and multipart off', async () => {
    const app = xufa();
    app.register(xufa.formBody);
    app.post('/form', async (request) => [request.body.a.filename, request.body.b.filename]);
    const boundary = 'b0';
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="a"; filename="say \\"hi\\".txt"\r\n\r\n1\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="b"; filename="x.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9.txt\r\n\r\n2\r\n` +
        `--${boundary}--\r\n`
    );
    const res = await app.inject({ method: 'POST', url: '/form', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    expect(res.json()).toEqual(['say "hi".txt', 'résumé.txt']);
    const off = makeApp({ multipart: false });
    const { payload: body, headers } = multipart([['a', '1']]);
    expect((await off.inject({ method: 'POST', url: '/form', headers, payload: body })).statusCode).toBe(415);
  });
});
