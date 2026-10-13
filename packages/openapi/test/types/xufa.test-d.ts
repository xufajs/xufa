// The types of what @xufa/openapi adds to @fastify/swagger: the explorer, config.openapi of routes and `xufa`.
import { expectTypeOf } from '@xufa/test';
import xufa from '@xufa/http';
import openapi, { operations, OpenapiError } from '../..';
import ui = require('../../ui');

const app = xufa();
app.register(openapi, { openapi: { info: { title: 'Books', version: '1.0.0' } }, xufa: false });
app.register(ui, { routePrefix: '/docs', ui: 'scalar', uiConfig: { theme: 'purple' }, csp: true });
app.register(ui, {
  assets: './node_modules/swagger-ui-dist',
  initOAuth: { clientId: 'web' },
  transformSpecification: (document, request) => ({ ...document, host: request.hostname }),
  uiHooks: { onRequest: async () => {} },
});
// @ts-expect-error
app.register(ui, { ui: 'graphiql' });
// @ts-expect-error
app.register(ui, { csp: 1 });
expectTypeOf(ui.VERSIONS.swagger).toEqualTypeOf<string>();

app.get('/health', { config: { openapi: { summary: 'Alive', tags: ['ops'] } } }, async () => ({ ok: true }));
// @ts-expect-error
app.get('/x', { config: { openapi: 'docs' } }, async () => ({}));

// Routes from a document (design first).
app.register(operations, {
  path: './openapi.yaml',
  handlers: {
    listBooks: async () => [],
    getBook: { preHandler: async () => {}, handler: async () => ({}) },
  },
  security: { bearer: 'jwt' },
  missing: 'throw',
  prefix: '/api',
});
app.register(operations, { document: { openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} } });
// @ts-expect-error
app.register(operations, { missing: 'ignore' });
expectTypeOf(new OpenapiError('x')).toMatchTypeOf<Error>();

// Responses checked, request.operation, and the options of operations.
app.register(operations, {
  path: './openapi.yaml',
  validateResponses: true,
  missingStatus: 404,
  requestIdHeader: 'x-request-id',
  handlers: { listBooks: { validateResponse: false, attachValidation: true, handler: async () => [] } },
});
// @ts-expect-error
app.register(operations, { missingStatus: 500 });
app.get('/manual', async (request) => {
  expectTypeOf(request.operation).toEqualTypeOf<{
    id: string;
    validateRequest(): void;
    validateResponse(payload: unknown, status?: number): void;
  } | null>();
  return {};
});

// Documents split in files, and Swagger 2.0.
import { bundle, fromSwagger2 } from '../..';
app.register(operations, { path: './openapi.yaml', baseDir: '.', remote: true });
expectTypeOf(bundle('./openapi.yaml', { remote: true })).toMatchTypeOf<Promise<{ openapi: string }>>();
expectTypeOf(fromSwagger2({ swagger: '2.0', info: { title: 'T', version: '1' }, paths: {} }).openapi).toEqualTypeOf<string>();
