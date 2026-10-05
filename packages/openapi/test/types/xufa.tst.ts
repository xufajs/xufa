// The types of what @xufa/openapi adds to @fastify/swagger: the explorer, config.openapi of routes and `xufa`.
import { expect } from 'tstyche';
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
expect(app.register).type.not.toBeCallableWith(ui, { ui: 'graphiql' });
expect(app.register).type.not.toBeCallableWith(ui, { csp: 1 });
expect(ui.VERSIONS.swagger).type.toBe<string>();

app.get('/health', { config: { openapi: { summary: 'Alive', tags: ['ops'] } } }, async () => ({ ok: true }));
expect(app.get).type.not.toBeCallableWith('/x', { config: { openapi: 'docs' } }, async () => ({}));

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
expect(app.register).type.not.toBeCallableWith(operations, { missing: 'ignore' });
expect(new OpenapiError('x')).type.toBeAssignableTo<Error>();

// Responses checked, request.operation, and the options of operations.
app.register(operations, {
  path: './openapi.yaml',
  validateResponses: true,
  missingStatus: 404,
  requestIdHeader: 'x-request-id',
  handlers: { listBooks: { validateResponse: false, attachValidation: true, handler: async () => [] } },
});
expect(app.register).type.not.toBeCallableWith(operations, { missingStatus: 500 });
app.get('/manual', async (request) => {
  expect(request.operation).type.toBe<{
    id: string;
    validateRequest(): void;
    validateResponse(payload: unknown, status?: number): void;
  } | null>();
  return {};
});

// Documents split in files, and Swagger 2.0.
import { bundle, fromSwagger2 } from '../..';
app.register(operations, { path: './openapi.yaml', baseDir: '.', remote: true });
expect(bundle('./openapi.yaml', { remote: true })).type.toBeAssignableTo<Promise<{ openapi: string }>>();
expect(fromSwagger2({ swagger: '2.0', info: { title: 'T', version: '1' }, paths: {} }).openapi).type.toBe<string>();
