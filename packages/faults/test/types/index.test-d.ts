import { assertType, expectTypeOf } from '@xufa/test';
import { Faults, FaultError, FaultRule, cacheFaults, CacheFaults, isFault, wrap } from '../..';

const faults = new Faults<'get' | 'set' | 'read'>({ operations: ['get', 'set'], groups: { read: ['get'] }, filters: { keys: { field: 'key', prefixes: true } } });
const rule: FaultRule = faults.fail({ operations: 'read', keys: ['user:'], rate: 0.5, times: 2 });
expectTypeOf(rule.hits).toEqualTypeOf<number>();
faults.delay({ ms: 100, jitter: 50 });
// @ts-expect-error
faults.delay({});
// @ts-expect-error
faults.fail({ operations: 'publish' });
expectTypeOf(faults.apply({ operation: 'get', key: 'a' }, () => 1)).toEqualTypeOf<Promise<number>>();
expectTypeOf(faults.pick({ operation: 'get' })).toEqualTypeOf<Array<{ rule: FaultRule; kind: string; ms: number }>>();
faults.add('answer', { operations: 'get' }, { replace: () => 'instead' });
expectTypeOf(isFault(new FaultError('x'))).toEqualTypeOf<boolean>();
expectTypeOf(cacheFaults({}, 'cache')).toEqualTypeOf<CacheFaults>();
wrap(faults, { read: () => 1 }, ['read'], (operation) => ({ operation }));

// Clearing every fault.
import { activeFaults, clearFaults, useFaults } from '../..';
expectTypeOf(activeFaults()).toEqualTypeOf<Faults[]>();
expectTypeOf(clearFaults()).toEqualTypeOf<number>();
useFaults({ afterEach: (fn: () => void) => fn() });

// The plugin.
import { plugin } from '../..';
import xufaHttp from '@xufa/http';
xufaHttp().register(plugin, { targets: { cache: faults }, token: 'a-long-enough-token', maxDuration: '30m' });
// @ts-expect-error
plugin({}, { token: 'x' });

// Scenarios.
import { scenario, Scenario, ScenarioStatus } from '../..';
const timeline = scenario({
  name: 'brownout',
  targets: { db: new Faults() },
  steps: [
    { at: 0, target: 'db', kind: 'delay', options: { ms: 300 }, for: '2m' },
    { at: '30s', target: new Faults(), kind: 'down' },
  ],
  onEvent: (event) => assertType<string>(event.type),
});
expectTypeOf(timeline.start()).toEqualTypeOf<Scenario>();
expectTypeOf(timeline.run()).toEqualTypeOf<Promise<Scenario>>();
expectTypeOf(timeline.status()).toEqualTypeOf<ScenarioStatus>();
// @ts-expect-error
scenario({ steps: [{ target: 'db', kind: 'explode' }] });
