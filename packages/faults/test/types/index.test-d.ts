import { expectType, expectError, expectAssignable } from 'tsd';
import { Faults, FaultError, FaultRule, cacheFaults, CacheFaults, isFault, wrap } from '../..';

const faults = new Faults<'get' | 'set' | 'read'>({ operations: ['get', 'set'], groups: { read: ['get'] }, filters: { keys: { field: 'key', prefixes: true } } });
const rule: FaultRule = faults.fail({ operations: 'read', keys: ['user:'], rate: 0.5, times: 2 });
expectType<number>(rule.hits);
faults.delay({ ms: 100, jitter: 50 });
expectError(faults.delay({}));
expectError(faults.fail({ operations: 'publish' }));
expectType<Promise<number>>(faults.apply({ operation: 'get', key: 'a' }, () => 1));
expectType<Array<{ rule: FaultRule; kind: string; ms: number }>>(faults.pick({ operation: 'get' }));
faults.add('answer', { operations: 'get' }, { replace: () => 'instead' });
expectType<boolean>(isFault(new FaultError('x')));
expectType<CacheFaults>(cacheFaults({}, 'cache'));
wrap(faults, { read: () => 1 }, ['read'], (operation) => ({ operation }));

// Clearing every fault.
import { activeFaults, clearFaults, useFaults } from '../..';
expectType<Faults[]>(activeFaults());
expectType<number>(clearFaults());
useFaults({ afterEach: (fn: () => void) => fn() });

// The plugin.
import { plugin } from '../..';
import xufaHttp from '@xufa/http';
xufaHttp().register(plugin, { targets: { cache: faults }, token: 'a-long-enough-token', maxDuration: '30m' });
expectError(plugin({}, { token: 'x' }));

// Scenarios.
import { scenario, Scenario, ScenarioStatus } from '../..';
const timeline = scenario({
  name: 'brownout',
  targets: { db: new Faults() },
  steps: [
    { at: 0, target: 'db', kind: 'delay', options: { ms: 300 }, for: '2m' },
    { at: '30s', target: new Faults(), kind: 'down' },
  ],
  onEvent: (event) => expectAssignable<string>(event.type),
});
expectType<Scenario>(timeline.start());
expectType<Promise<Scenario>>(timeline.run());
expectType<ScenarioStatus>(timeline.status());
expectError(scenario({ steps: [{ target: 'db', kind: 'explode' }] }));
