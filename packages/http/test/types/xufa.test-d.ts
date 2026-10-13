// Type tests of what xufa has that fastify has not, or has otherwise (not ported: kept by tools/port-types).
import { expectTypeOf } from '@xufa/test';
import xufa, { plugin, errorCodes, type XufaInstance, type XufaPluginAsync, type PluginMetadata, type HealthReport, type MaintenanceState } from '../..';
import type { Serializer, ErrorObject } from '../../types/compilers';

// xufa.plugin(), fastify-plugin of xufa.
const routes: XufaPluginAsync<{ prefix: string }> = async (app, options) => {
  expectTypeOf(app).toEqualTypeOf<XufaInstance>();
  expectTypeOf(options.prefix).toEqualTypeOf<string>();
};
expectTypeOf(plugin(routes, { name: 'routes', xufa: '0.x', decorators: { xufa: ['db'] } })).toEqualTypeOf(routes);
expectTypeOf(plugin(routes, 'routes')).toEqualTypeOf(routes);
// @ts-expect-error
plugin(routes, { name: 1 });
const meta: PluginMetadata = { fastify: '5.x', decorators: { fastify: ['db'] } };
expectTypeOf(meta).toMatchTypeOf<PluginMetadata>();

// The codes of the errors are XUFA_ERR_*.
expectTypeOf(errorCodes.XUFA_ERR_NOT_FOUND).not.toEqualTypeOf<never>();
expectTypeOf(errorCodes).not.toHaveProperty('FST_ERR_NOT_FOUND');

// The validator is @xufa/schema: ajv's options it shares, and no ajv plugins.
expectTypeOf(xufa({ ajv: { customOptions: { coerceTypes: 'array', removeAdditional: 'all' }, plugins: [] } })).toMatchTypeOf<XufaInstance>();
// @ts-expect-error
xufa({ ajv: { plugins: [() => {}] } });
expectTypeOf<ErrorObject>().toHaveProperty('instancePath');

// Response serializers may write bytes.
expectTypeOf<Serializer['toBuffer']>().toEqualTypeOf<((doc: any) => Buffer) | undefined>();

// devErrors: the page of the errors for development, a plugin with its options.
xufa().register(xufa.devErrors, { enabled: true, context: 7, notFound: false });
// @ts-expect-error
(xufa().register)(xufa.devErrors, { context: 'many' });

// health and maintenance: the routes of the health of the app, and the maintenance mode.
xufa().register(xufa.health, {
  checks: {
    database: () => 1.5,
    queue: { check: async () => ({ status: 'degraded', failed: 2 }), critical: false, timeout: '1s' },
    pods: { check: () => true, heal: { after: '5m', run: (result) => result.error } },
  },
  interval: '10s',
  onChange: (status, previous, report) => {
    expectTypeOf(status).toEqualTypeOf<'up' | 'degraded' | 'down'>();
    expectTypeOf(report.checks.database.duration).toEqualTypeOf<number>();
  },
});
// @ts-expect-error
(xufa().register)(xufa.health, { checks: { database: 42 } });
xufa().register(xufa.maintenance, { file: false, store: { get: async () => ({ message: 'soon', retryAfter: 60 }) } });
// @ts-expect-error
(xufa().register)(xufa.maintenance, { store: { get: 1 } });

// app.health and app.maintenance: what those plugins decorate the app with.
const app = xufa();
expectTypeOf(app.health.check()).toEqualTypeOf<Promise<HealthReport>>();
expectTypeOf(app.health.report).toEqualTypeOf<HealthReport | null>();
expectTypeOf(app.health.status).toEqualTypeOf<'up' | 'degraded' | 'down'>();
expectTypeOf(app.maintenance.state()).toEqualTypeOf<Promise<MaintenanceState | null>>();
expectTypeOf(app.health).not.toHaveProperty('run');

// formBody: the bodies of HTML forms.
xufa().register(xufa.formBody, { fileSize: 1024, multipart: true });
// @ts-expect-error
(xufa().register)(xufa.formBody, { files: 'many' });

// staticFiles: static files, and app.staticUrl().
xufa().register(xufa.staticFiles, { root: ['static'], prefix: '/assets/' });
expectTypeOf(xufa().staticUrl('css/site.css')).toEqualTypeOf<string>();
// @ts-expect-error
(xufa().register)(xufa.staticFiles, { prefix: '/static/' });

// Routes by name, and reverse().
const named = xufa();
named.get('/books/:id', { name: 'book' }, async () => 'ok');
expectTypeOf(named.reverse('book', { id: 7 }, { query: { page: 2 } })).toEqualTypeOf<string>();
expectTypeOf(named.routeNames().book.methods).toEqualTypeOf<string[]>();
// @ts-expect-error
named.get('/x', { name: 7 }, async () => 'x');
