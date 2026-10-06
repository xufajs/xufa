// The faults of the bus (bus.faults), in one process: events lost (fail, down, drop), late (delay) or held until
// released (hang); requests failed (a BusError), without a reply (drop: their timeout), late or held; by event.
const { bus, BusError } = require('..');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('bus.faults', () => {
  const got = [];
  const onHit = (data) => got.push(data);
  const onSum = ({ a, b }) => a + b;

  beforeEach(() => {
    got.length = 0;
    bus.on('hit', onHit);
    bus.on('sum', onSum);
  });
  afterEach(() => {
    bus.faults.clear();
    bus.off('hit', onHit);
    bus.off('sum', onSum);
  });

  it('events: lost (drop, fail, down), by name; the others delivered', async () => {
    bus.faults.drop({ events: 'hit', times: 1 });
    bus.send('hit', 1);
    bus.send('hit', 2);
    await tick();
    expect(got).toEqual([2]);
    bus.faults.fail({ operations: 'events', events: [/^hi/] });
    bus.broadcast('hit', 3);
    bus.send('hit', 4);
    await tick();
    expect(got).toEqual([2]);
    bus.faults.clear();
    bus.faults.down();
    bus.send('hit', 5);
    await tick();
    expect(got).toEqual([2]);
    bus.faults.up();
    bus.send('hit', 6);
    await tick();
    expect(got).toEqual([2, 6]);
  });

  it('events: late (delay), and held until released (hang)', async () => {
    bus.faults.delay({ operations: 'send', ms: 40 });
    bus.send('hit', 'late');
    await wait(10);
    expect(got).toEqual([]);
    await wait(60);
    expect(got).toEqual(['late']);
    bus.faults.clear();
    const hang = bus.faults.hang({ events: 'hit' });
    bus.send('hit', 'held');
    await wait(20);
    expect(got).toEqual(['late']);
    hang.release();
    await tick();
    expect(got).toEqual(['late', 'held']);
  });

  it('requests: failed (a BusError), without a reply (their timeout), late; the others answered', async () => {
    bus.faults.fail({ operations: 'request', events: 'sum', times: 1 });
    const failed = await bus.request('sum', { a: 1, b: 2 }).catch((e) => e);
    expect([failed instanceof BusError, failed.code, failed.message]).toEqual([true, 'XUFA_FAULT', 'A fault of the bus (injected): request sum']);
    expect(await bus.request('sum', { a: 1, b: 2 })).toBe(3);
    bus.faults.drop({ operations: 'request', times: 1 });
    const started = Date.now();
    const lost = await bus.request('sum', { a: 1, b: 2 }, { timeout: 50 }).catch((e) => e);
    expect(lost.message).toBe('The request sum had no reply in 50 ms');
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    bus.faults.delay({ operations: 'request', ms: 30, times: 1 });
    const begun = Date.now();
    expect(await bus.request('sum', { a: 2, b: 2 })).toBe(4);
    expect(Date.now() - begun).toBeGreaterThanOrEqual(25);
    expect(() => bus.faults.fail({ operations: 'publish' })).toThrow(/send, sendTo, broadcast, request, events/);
  });
});
