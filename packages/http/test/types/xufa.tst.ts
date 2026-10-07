// Type tests of what xufa has that fastify has not, or has otherwise (not ported: kept by tools/port-types).
import { expect } from 'tstyche';
import xufa, { plugin, errorCodes, type XufaInstance, type XufaPluginAsync, type PluginMetadata } from '../..';
import type { Serializer, ErrorObject } from '../../types/compilers';

// xufa.plugin(), fastify-plugin of xufa.
const routes: XufaPluginAsync<{ prefix: string }> = async (app, options) => {
  expect(app).type.toBe<XufaInstance>();
  expect(options.prefix).type.toBe<string>();
};
expect(plugin(routes, { name: 'routes', xufa: '0.x', decorators: { xufa: ['db'] } })).type.toBe(routes);
expect(plugin(routes, 'routes')).type.toBe(routes);
expect(plugin).type.not.toBeCallableWith(routes, { name: 1 });
const meta: PluginMetadata = { fastify: '5.x', decorators: { fastify: ['db'] } };
expect(meta).type.toBeAssignableTo<PluginMetadata>();

// The codes of the errors are XUFA_ERR_*.
expect(errorCodes.XUFA_ERR_NOT_FOUND).type.not.toBe<never>();
expect(errorCodes).type.not.toHaveProperty('FST_ERR_NOT_FOUND');

// The validator is @xufa/schema: ajv's options it shares, and no ajv plugins.
expect(xufa({ ajv: { customOptions: { coerceTypes: 'array', removeAdditional: 'all' }, plugins: [] } })).type.toBeAssignableTo<XufaInstance>();
expect(xufa).type.not.toBeCallableWith({ ajv: { plugins: [() => {}] } });
expect<ErrorObject>().type.toHaveProperty('instancePath');

// Response serializers may write bytes.
expect<Serializer['toBuffer']>().type.toBe<((doc: any) => Buffer) | undefined>();

// devErrors: the page of the errors for development, a plugin with its options.
xufa().register(xufa.devErrors, { enabled: true, context: 7, notFound: false });
expect(xufa().register).type.not.toBeCallableWith(xufa.devErrors, { context: 'many' });

// health and maintenance: the routes of the health of the app, and the maintenance mode.
xufa().register(xufa.health, {
  checks: {
    database: () => 1.5,
    queue: { check: async () => ({ status: 'degraded', failed: 2 }), critical: false, timeout: '1s' },
    pods: { check: () => true, heal: { after: '5m', run: (result) => result.error } },
  },
  interval: '10s',
  onChange: (status, previous, report) => {
    expect(status).type.toBe<'up' | 'degraded' | 'down'>();
    expect(report.checks.database.duration).type.toBe<number>();
  },
});
expect(xufa().register).type.not.toBeCallableWith(xufa.health, { checks: { database: 42 } });
xufa().register(xufa.maintenance, { file: false, store: { get: async () => ({ message: 'soon', retryAfter: 60 }) } });
expect(xufa().register).type.not.toBeCallableWith(xufa.maintenance, { store: { get: 1 } });
