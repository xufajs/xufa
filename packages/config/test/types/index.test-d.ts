import { expectType, expectError } from 'tsd';
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
expectType<number>(config.server.port);
expectType<string | undefined>(config.server.host);
expectType<string>(config.db.url);
expectType<string | null>(config.db.replica);
expectType<number>(config.db.pool.max);
expectType<'debug' | 'info'>(config.level);
expectType<readonly string[]>(config.tags);
expectType<number>(config.timeout);
expectType<boolean>(config.debug);
expectError((config.server.port = 1));
expectType<readonly string[]>(config.sources);
expectType<number>(config.get<number>('server.port'));
expectType<boolean>(config.has(['db', 'url']));
expectType<Record<string, unknown>>(config.redacted());

interface AppConfig {
  name: string;
  features: string[];
}
const typed = loadConfig<AppConfig>({ dir: 'settings', env: 'production', dotenv: ['.env'], overrides: { name: 'x' } });
expectType<Config<AppConfig>>(typed);
expectType<string>(typed.name);
expectType<readonly string[]>(typed.features);
expectType<any>(loadConfig().anything);

expectType<Record<string, string>>(parseDotenv('A=1'));
expectType<{ path: string; message: string }[]>(new ConfigError('x').errors);
expectType<'XUFA_CONFIG_ERR'>(new ConfigError('x').code);

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
  expectType<number>(remote.server.port);
  const own: RemoteSource = {
    name: 'mine',
    load: async ({ env, signal }) => ({ region: env.REGION, aborted: signal.aborted }),
  };
  await loadRemoteConfig({ remote: [own] });
  expectError(sources.consul({ prefix: 'a', key: 'b' }));
  expectError(sources.http({ headers: {} }));
  const watcher = await watchConfig(
    { schema: { level: { type: 'string', values: ['info', 'debug'] as const, default: 'info' } }, remote: [own] },
    { interval: '30s', onChange: (config, previous, changed) => expectType<string[]>(changed) }
  );
  expectType<'info' | 'debug'>(watcher.current.level);
  watcher.stop();
})();

// Blocking queries: the option of watchConfig, and watch() of sources that can wait.
(async () => {
  const followed = await watchConfig({ remote: [sources.consul({ prefix: 'apps/shop' })] }, { blocking: false });
  followed.stop();
  const consul: RemoteSource = sources.consul({ key: 'apps/doc.yaml' });
  if (consul.watch)
    expectType<Promise<{ index: number | null }>>(
      consul.watch({ env: {}, name: 'x', signal: new AbortController().signal, index: null })
    );
})();
