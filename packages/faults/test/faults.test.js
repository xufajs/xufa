// The rules of faults: operations and groups, filters (names, prefixes, regular expressions, classes), match, rate,
// after, times, hits; what they do (fail, delay, hang, down, kinds of their own); waits cut short by signals; pick()
// for operations that cannot wait; wrap(); and the faults of caches.
import { Faults, FaultError, wrap, cacheFaults } from '../index.js';
import * as indexModule from '../index.js';

const failure = (promise) => promise.then(() => null, (err) => err);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function make() {
  return new Faults({
    operations: ['get', 'set', 'send'],
    groups: { read: ['get'], write: ['set'] },
    defaults: ['get', 'set'],
    filters: { keys: { field: 'key', prefixes: true }, models: 'model' },
  });
}

describe('rules', () => {
  it('operations (names, groups, defaults), filters and match', async () => {
    const faults = make();
    const rule = faults.fail({ operations: 'read', keys: ['user:', /^session-\d+$/] });
    expect(await failure(faults.apply({ operation: 'get', key: 'user:1' }, () => 'ok'))).toBeInstanceOf(FaultError);
    expect(await failure(faults.apply({ operation: 'get', key: 'session-42' }, () => 'ok'))).toBeInstanceOf(FaultError);
    expect(await faults.apply({ operation: 'get', key: 'order:1' }, () => 'ok')).toBe('ok');
    expect(await faults.apply({ operation: 'set', key: 'user:1' }, () => 'ok')).toBe('ok');
    expect(rule.hits).toBe(2);
    faults.clear();
    class Order {}
    faults.fail({ models: [Order, 'Customer'] }); // classes by their names; exact names (no prefixes)
    expect(await failure(faults.apply({ operation: 'set', model: 'Order' }, () => 1))).toBeInstanceOf(FaultError);
    expect(await faults.apply({ operation: 'set', model: 'OrderLine' }, () => 1)).toBe(1);
    expect(await faults.apply({ operation: 'send', model: 'Order' }, () => 1)).toBe(1); // not of the defaults
    faults.clear();
    faults.fail({ operations: ['send'], match: (context) => context.size > 10 });
    expect(await faults.apply({ operation: 'send', size: 5 }, () => 'small')).toBe('small');
    expect(await failure(faults.apply({ operation: 'send', size: 50 }, () => 'big'))).toBeInstanceOf(FaultError);
    faults.clear();
  });

  it('after, times, rate (faults.random), and the errors of fail', async () => {
    const faults = make();
    const rule = faults.fail({ after: 1, times: 2 });
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await failure(faults.apply({ operation: 'get' }, () => 1))) ? 'x' : 'ok');
    expect(results).toEqual(['ok', 'x', 'x', 'ok']);
    expect([rule.hits, rule.active, faults.rules.length]).toEqual([2, false, 0]);
    const draws = [0.2, 0.8];
    faults.random = () => draws.shift();
    faults.fail({ rate: 0.5 });
    expect(await failure(faults.apply({ operation: 'get' }, () => 1))).toBeInstanceOf(FaultError);
    expect(await faults.apply({ operation: 'get' }, () => 1)).toBe(1);
    faults.clear();
    const own = new Error('mine');
    faults.fail({ error: own, times: 1 });
    expect(await failure(faults.apply({ operation: 'get' }, () => 1))).toBe(own);
    faults.fail({ error: (context) => new Error(`of ${context.operation}`), times: 1 });
    expect((await failure(faults.apply({ operation: 'set' }, () => 1))).message).toBe('of set');
    faults.fail({ message: 'said so', times: 1 });
    const said = await failure(faults.apply({ operation: 'get' }, () => 1));
    expect([said.message, said.code, said.statusCode, said.operation]).toEqual(['said so', 'XUFA_FAULT', 503, 'get']);
  });

  it('delay and hang: cut short by the signal of the operation; a hang of its last time still holds', async () => {
    const faults = make();
    faults.delay({ ms: 50 });
    let started = Date.now();
    await faults.apply({ operation: 'get' }, () => 1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    const controller = new AbortController();
    started = Date.now();
    setTimeout(() => controller.abort(new Error('gave up')), 10);
    faults.clear();
    faults.delay({ ms: 5000 });
    expect((await failure(faults.apply({ operation: 'get', signal: controller.signal }, () => 1))).message).toBe('gave up');
    expect(Date.now() - started).toBeLessThan(1000);
    faults.clear();
    const hang = faults.hang({ times: 1 });
    let done = false;
    const held = faults.apply({ operation: 'get' }, () => 'released').then((value) => {
      done = value;
    });
    await wait(20);
    expect([done, faults.rules.length]).toEqual([false, 0]); // removed after its time, still holding
    faults.clear(); // releases what it holds
    await held;
    expect(done).toBe('released');
    expect(hang.hits).toBe(1);
    const stop = new AbortController();
    faults.hang();
    const aborted = faults.apply({ operation: 'get', signal: stop.signal }, () => 1);
    stop.abort(new Error('timeout'));
    expect((await failure(aborted)).message).toBe('timeout');
    faults.clear();
  });

  it('down and up; kinds of their own; pick() for what cannot wait', async () => {
    const faults = make();
    faults.down();
    expect((await failure(faults.apply({ operation: 'send' }, () => 1))).message).toBe('It is down (a fault injected)');
    faults.up();
    expect(await faults.apply({ operation: 'send' }, () => 1)).toBe(1);
    faults.add('answer', { operations: 'get', times: 1 }, { replace: (context) => `instead of ${context.operation}` });
    expect(await faults.apply({ operation: 'get' }, () => 'real')).toBe('instead of get');
    expect(await faults.apply({ operation: 'get' }, () => 'real')).toBe('real');
    faults.delay({ ms: 10 });
    faults.fail({ operations: 'set' });
    expect(faults.pick({ operation: 'set' }).map((action) => action.kind)).toEqual(['delay', 'fail']);
    expect(faults.pick({ operation: 'get' }).map((action) => action.kind)).toEqual(['delay']);
    faults.clear();
  });

  it('errors of the options', () => {
    const faults = make();
    expect(() => faults.fail({ operations: 'drop' })).toThrow('A fault is of get, set, send, read, write (not drop)');
    expect(() => faults.fail({ rate: -1 })).toThrow(/from 0 to 1/);
    expect(() => faults.delay({})).toThrow(/has ms/);
    expect(() => faults.fail({ match: 'x' })).toThrow(/match of a fault is a function/);
  });
});

describe('wrap and the faults of caches', () => {
  it('wrap(): the methods of an object go through the faults (as they were without rules)', async () => {
    const store = { value: 1, async read() { return this.value; } };
    const faults = wrap(new Faults({ operations: ['read'] }), store, ['read'], (operation) => ({ operation }));
    expect(await store.read()).toBe(1);
    faults.fail({ times: 1 });
    expect(await failure(store.read())).toBeInstanceOf(FaultError);
    expect(await store.read()).toBe(1);
  });

  it('cacheFaults(): get, set, delete, clear; read and write; keys by prefix', async () => {
    const map = new Map();
    const cache = {
      async get(key) { return map.get(key); },
      async set(key, value) { map.set(key, value); },
      async delete(keys) { [].concat(keys).forEach((key) => map.delete(key)); },
      async clear() { map.clear(); },
    };
    const faults = cacheFaults(cache, 'session cache');
    await cache.set('session:1', 'a');
    faults.fail({ operations: 'read', keys: 'session:' });
    const err = await failure(cache.get('session:1'));
    expect(err.message).toBe('A fault of the session cache (injected): get of session:1');
    await cache.set('user:1', 'b');
    expect(await cache.get('user:1')).toBe('b');
    faults.clear();
    faults.down();
    expect((await failure(cache.delete(['user:1']))).message).toBe('The session cache is down (a fault injected)');
    faults.up();
    await cache.delete(['user:1']);
    expect(await cache.get('user:1')).toBe(undefined);
  });
});

describe('every fault: activeFaults, clearFaults, useFaults', () => {
  it('the faults with rules are active; clearFaults() clears them all (and what they hold)', async () => {
    const { activeFaults, clearFaults } = indexModule;
    clearFaults();
    const a = make();
    const b = make();
    expect(activeFaults()).toEqual([]);
    a.fail({ operations: 'get' });
    a.delay({ ms: 1 });
    const hang = b.hang({ operations: 'set' });
    expect(activeFaults()).toEqual([a, b]);
    let released = false;
    const held = b.apply({ operation: 'set' }, () => {
      released = true;
    });
    expect(clearFaults()).toBe(3);
    await held;
    expect([released, activeFaults(), a.rules.length, hang.active]).toEqual([true, [], 0, false]);
  });

  it('a faults leaves the active ones when its rules are gone: removed, of their times, up(), clear()', async () => {
    const { activeFaults } = indexModule;
    const faults = make();
    const rule = faults.fail();
    rule.remove();
    expect(activeFaults()).not.toContain(faults);
    faults.fail({ times: 1 });
    await failure(faults.apply({ operation: 'get' }, () => 1));
    expect(activeFaults()).not.toContain(faults);
    const hang = faults.hang({ times: 1 });
    const held = faults.apply({ operation: 'get' }, () => 1);
    expect(activeFaults()).toContain(faults); // its last time, still holding
    hang.release();
    await held;
    expect(activeFaults()).not.toContain(faults);
    faults.down();
    faults.up();
    expect(activeFaults()).not.toContain(faults);
  });

  it('useFaults(): clearFaults() after each test, with the hooks of the runner', () => {
    const { useFaults, activeFaults } = indexModule;
    const hooks = [];
    useFaults({ afterEach: (fn) => hooks.push(fn) });
    make().fail();
    expect(activeFaults()).toHaveLength(1);
    hooks[0]();
    expect(activeFaults()).toEqual([]);
    expect(() => useFaults({ hooks: {} })).toThrow(/no afterEach/);
  });

  it('strict: a test that ends with faults still set fails (named, cleared all the same); a clean one does not', () => {
    const { useFaults, activeFaults } = indexModule;
    const hooks = [];
    useFaults({ afterEach: (fn) => hooks.push(fn) }, { strict: true });
    useFaults({ strict: true, hooks: { afterEach: (fn) => hooks.push(fn) } });
    const cache = cacheFaults({ async get() {}, async set() {}, async delete() {}, async clear() {} }, 'session cache');
    cache.fail({ operations: 'read' });
    const hang = make().hang({ times: 1 });
    hang.faults.apply({ operation: 'get' }, () => 1); // its last time: holding
    expect(hooks[0]).toThrow(
      [
        'The test ended with faults still set (cleared now):',
        '  - session cache: fail of get (hits 0)',
        '  - faults: hang of get, set (hits 1, holding)',
      ].join('\n')
    );
    expect(activeFaults()).toEqual([]);
    expect(() => hooks[1]()).not.toThrow();
  });
});
