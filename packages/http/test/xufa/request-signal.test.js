// request.signal is aborted when the client goes away before the response is written, and only then. Not when the
// body has been read (the 'close' of the request, which fastify uses and which comes then, while the handler runs).
// Over a real socket: the case the bug is in.
const http = require('node:http');
const xufa = require('../..');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('request.signal', () => {
  let app;
  let port;
  const seen = {};

  beforeAll(async () => {
    app = xufa();
    const watch = (name) => async (request) => {
      const signal = request.signal;
      await wait(150);
      seen[name] = signal.aborted;
      return { aborted: signal.aborted };
    };
    app.post('/body', watch('body'));
    app.get('/leave', watch('leave'));
    app.post('/leave-after-body', watch('leaveAfterBody'));
    app.post('/upload', async (request) => ({ size: request.body.length }));
    app.get('/late', async (request) => {
      await wait(50);
      const signal = request.signal; // read late: after the client left
      seen.late = signal.aborted;
      return {};
    });
    app.get('/reused', async (request) => ({ aborted: request.signal.aborted }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = app.server.address().port;
  });

  afterAll(() => app.close());

  function send(method, path, body, { leaveAfter } = {}) {
    return new Promise((resolve) => {
      const req = http.request(
        { port, host: '127.0.0.1', method, path, headers: { 'content-type': 'application/json' } },
        (res) => {
          let text = '';
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () => resolve(text));
        }
      );
      req.on('error', () => resolve(null));
      if (leaveAfter !== undefined) setTimeout(() => req.destroy(), leaveAfter);
      req.end(body);
    });
  }

  it('is not aborted when the body has been read', async () => {
    expect(JSON.parse(await send('POST', '/body', JSON.stringify({ a: 1 })))).toEqual({ aborted: false });
    expect(seen.body).toBe(false);
  });

  it('is aborted when the client goes away', async () => {
    await send('GET', '/leave', undefined, { leaveAfter: 30 });
    await wait(200);
    expect(seen.leave).toBe(true);
  });

  it('is aborted when the client goes away after sending its body', async () => {
    await send('POST', '/leave-after-body', JSON.stringify({ a: 1 }), { leaveAfter: 30 });
    await wait(200);
    expect(seen.leaveAfterBody).toBe(true);
  });

  it('read after the client left, it is aborted already', async () => {
    await send('GET', '/late', undefined, { leaveAfter: 10 });
    await wait(150);
    expect(seen.late).toBe(true);
  });

  it('keep-alive requests do not keep listeners on the connection', async () => {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      for (let i = 0; i < 20; i += 1) {
        const text = await new Promise((resolve) => {
          http.get({ port, host: '127.0.0.1', path: '/reused', agent }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve(body));
          });
        });
        expect(JSON.parse(text)).toEqual({ aborted: false });
      }
      const [socket] = Object.values(agent.freeSockets)[0];
      expect(socket.listenerCount('close')).toBeLessThan(5);
    } finally {
      agent.destroy();
    }
  });

  it('with inject too', async () => {
    const res = await app.inject({ method: 'POST', url: '/body', payload: { a: 1 } });
    expect(res.json()).toEqual({ aborted: false });
  });
});
