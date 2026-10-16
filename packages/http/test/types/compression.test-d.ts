import http from 'node:http';
import { expectTypeOf } from '@xufa/test';
// (test/ is a package of its own, with no name: compression.d.cts by its path, as compression.cjs.)
import compression = require('../../compression.cjs');

const middleware = compression({ threshold: '1kb', level: 6, brotli: { params: {} }, enforceEncoding: 'gzip' });
expectTypeOf(middleware).toEqualTypeOf<compression.RequestHandler>();
compression({
  filter: (req, res) => !req.headers['x-no-compression'] && compression.filter(req, res),
  threshold: 0,
});
// @ts-expect-error
compression({ enforceEncoding: 'zstd' });
// @ts-expect-error
compression({ threshold: true });

http.createServer((req, res) => {
  middleware(req, res, () => {
    res.write('data: 1\n\n');
    res.flush();
  });
});
