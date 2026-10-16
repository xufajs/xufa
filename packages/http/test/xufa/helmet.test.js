// @xufa/http/helmet: the default export and require() are the middleware (helmet's tests, ported in test/helmet, check
// what it does), staticHeaders() gives what it sets on every response, and @xufa/express runs it as Express runs
// helmet.
import { createRequire } from 'node:module';
import express from '../../../express/index.js';
import helmet, { staticHeaders, contentSecurityPolicy, hsts, strictTransportSecurity } from '../../helmet.js';

const require = createRequire(import.meta.url);

describe('@xufa/http/helmet', () => {
  it('is the middleware, for import and require, with its middlewares and their old names', () => {
    expect(require('@xufa/http/helmet')).toBe(helmet);
    expect(hsts).toBe(strictTransportSecurity);
    expect(helmet.frameguard).toBe(helmet.xFrameOptions);
    expect(helmet.staticHeaders).toBe(staticHeaders);
  });

  it('gives the headers it sets on every response, or null when the policy is computed per request', () => {
    const headers = staticHeaders({ contentSecurityPolicy: { directives: { scriptSrc: ["'self'", 'cdn.example.com'] } } });
    expect(headers.removed).toEqual(['X-Powered-By']);
    expect(headers.set['Content-Security-Policy']).toContain("script-src 'self' cdn.example.com");
    expect(headers.set['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(Object.keys(staticHeaders({ contentSecurityPolicy: false, xFrameOptions: false }).set)).not.toContain(
      'X-Frame-Options'
    );
    expect(staticHeaders({ contentSecurityPolicy: { directives: { scriptSrc: [() => "'nonce-x'"] } } })).toBeNull();
    expect(() => staticHeaders({ referrerPolicy: { policy: 'nope' } })).toThrow('unexpected policy token');
    expect(contentSecurityPolicy.getDefaultDirectives()).not.toBe(contentSecurityPolicy.getDefaultDirectives());
  });

  it('sets the headers of an Express app (and a nonce per request)', async () => {
    const app = express();
    app.use((req, res, next) => {
      res.locals.nonce = 'abc123';
      next();
    });
    app.use(helmet({ contentSecurityPolicy: { directives: { scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`] } } }));
    app.get('/', (req, res) => res.send('hi'));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
      expect(res.headers.get('content-security-policy')).toContain("script-src 'self' 'nonce-abc123'");
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('x-powered-by')).toBeNull();
      expect(await res.text()).toBe('hi');
    } finally {
      server.close();
    }
  });
});
