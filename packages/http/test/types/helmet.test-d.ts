import http from 'node:http';
import { expectTypeOf } from '@xufa/test';
// (test/ is a package of its own, with no name: helmet.d.cts by its path, as helmet.cjs.)
import helmet = require('../../helmet.cjs');

const middleware = helmet({
  contentSecurityPolicy: {
    directives: { scriptSrc: ["'self'", (req, res) => `'nonce-${res.getHeader('x-nonce')}'`], objectSrc: null },
  },
  hsts: { maxAge: 60 * 60 * 24, preload: true },
  frameguard: { action: 'deny' },
  crossOriginEmbedderPolicy: true,
});
expectTypeOf(middleware).toEqualTypeOf<helmet.Middleware>();
helmet.contentSecurityPolicy({ useDefaults: false, directives: { defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc } });
expectTypeOf(helmet.staticHeaders()).toEqualTypeOf<{ set: Record<string, string>; removed: string[] } | null>();
// @ts-expect-error
helmet({ hsts: true, strictTransportSecurity: true });
// @ts-expect-error
helmet({ frameguard: { action: 'allow-from' } });
// @ts-expect-error
helmet.contentSecurityPolicy({ useDefaults: false });

http.createServer((req, res) => middleware(req, res, () => res.end()));
