import { expectTypeOf } from '@xufa/test';
import { loadConfig, parseDotenv, ConfigError, Config } from '../..';

const config = loadConfig({
  envPrefix: 'APP',
  schema: {
    server: {
      port: { type: 'port', default: 3000, env: 'PORT' },
      host: { type: 'string' },
    },
    db: {
      url: { type: 'url', required: true, sensitive: true },
      replica: { type: 'url', nullable: true, default: null },
      pool: { max: { type: 'integer', default: 10 } },
    },
    level: { type: 'string', values: ['debug', 'info'] as const, default: 'info' },
    tags: { type: 'array', items: 'string', default: [] },
    timeout: { type: 'duration', default: '30s' },
    debug: { type: 'boolean', default: false },
  },
});
expectTypeOf(config.server.port).toEqualTypeOf<number>();
expectTypeOf(config.server.host).toEqualTypeOf<string | undefined>();
expectTypeOf(config.db.url).toEqualTypeOf<string>();
expectTypeOf(config.db.replica).toEqualTypeOf<string | null>();
expectTypeOf(config.db.pool.max).toEqualTypeOf<number>();
expectTypeOf(config.level).toEqualTypeOf<'debug' | 'info'>();
expectTypeOf(config.tags).toEqualTypeOf<readonly string[]>();
expectTypeOf(config.timeout).toEqualTypeOf<number>();
expectTypeOf(config.debug).toEqualTypeOf<boolean>();
// @ts-expect-error
(config.server.port = 1);
expectTypeOf(config.sources).toEqualTypeOf<readonly string[]>();
expectTypeOf(config.get<number>('server.port')).toEqualTypeOf<number>();
expectTypeOf(config.has(['db', 'url'])).toEqualTypeOf<boolean>();
expectTypeOf(config.redacted()).toEqualTypeOf<Record<string, unknown>>();

interface AppConfig {
  name: string;
  features: string[];
}
const typed = loadConfig<AppConfig>({ dir: 'settings', env: 'production', dotenv: ['.env'], overrides: { name: 'x' } });
expectTypeOf(typed).toEqualTypeOf<Config<AppConfig>>();
expectTypeOf(typed.name).toEqualTypeOf<string>();
expectTypeOf(typed.features).toEqualTypeOf<readonly string[]>();
expectTypeOf(loadConfig().anything).toEqualTypeOf<any>();

expectTypeOf(parseDotenv('A=1')).toEqualTypeOf<Record<string, string>>();
expectTypeOf(new ConfigError('x').errors).toEqualTypeOf<{ path: string; message: string }[]>();
expectTypeOf(new ConfigError('x').code).toEqualTypeOf<'XUFA_CONFIG_ERR'>();

// Remote sources.
import { loadRemoteConfig, watchConfig, sources, type RemoteSource } from '../..';
(async () => {
  const remote = await loadRemoteConfig({
    schema: { server: { port: { type: 'port', default: 3000 } } },
    remote: [
      sources.http({ url: 'https://config.internal/shop.json', optional: true }),
      sources.consul({ prefix: 'apps/shop', timeout: 2000 }),
      sources.vault({ path: 'shop/production', at: 'secrets', roleId: 'r', secretId: 's' }),
      sources.ssm({ path: '/shop/production', region: 'eu-west-1' }),
      sources.secretsManager({ secretId: 'shop/api', at: 'api', endpoint: 'http://localhost:4566' }),
      sources.directory({ dir: '/run/secrets', sensitive: true }),
    ],
    cacheFile: '.config-cache.json',
  });
  expectTypeOf(remote.server.port).toEqualTypeOf<number>();
  const own: RemoteSource = {
    name: 'mine',
    load: async ({ env, signal }) => ({ region: env.REGION, aborted: signal.aborted }),
  };
  await loadRemoteConfig({ remote: [own] });
  // @ts-expect-error
  sources.consul({ prefix: 'a', key: 'b' });
  // @ts-expect-error
  sources.http({ headers: {} });
  const watcher = await watchConfig(
    { schema: { level: { type: 'string', values: ['info', 'debug'] as const, default: 'info' } }, remote: [own] },
    { interval: '30s', onChange: (config, previous, changed) => expectTypeOf(changed).toEqualTypeOf<string[]>() }
  );
  expectTypeOf(watcher.current.level).toEqualTypeOf<'info' | 'debug'>();
  watcher.stop();
})();

// Blocking queries: the option of watchConfig, and watch() of sources that can wait.
(async () => {
  const followed = await watchConfig({ remote: [sources.consul({ prefix: 'apps/shop' })] }, { blocking: false });
  followed.stop();
  const consul: RemoteSource = sources.consul({ key: 'apps/doc.yaml' });
  if (consul.watch)
    expectTypeOf(consul.watch({ env: {}, name: 'x', signal: new AbortController().signal, index: null })).toEqualTypeOf<Promise<{ index: number | null }>>();
})();
