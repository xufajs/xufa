const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Bus } = require('..');

const fixture = path.join(__dirname, 'fixtures', 'app.js');

function run(workers) {
  const result = spawnSync(process.execPath, [fixture], {
    env: { ...process.env, WORKERS: String(workers) },
    timeout: 30000,
  });
  return {
    status: result.status,
    lines: result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

describe('cluster', () => {
  it('runs workers that ask the primary, restarts those that die, and stops', () => {
    const { status, lines } = run(2);
    expect(status).toBe(0);
    const ready = lines.filter((line) => line.ready !== undefined);
    // Workers 1 and 2, and 3: the one forked again after a worker died.
    expect(ready.map((line) => line.ready).sort()).toEqual([1, 2, 3]);
    ready.forEach((line) => {
      expect(line.sum).toBe(line.ready + 40);
      expect(line.error).toBe('E_NOPE:nope');
      expect(line.types).toBe(true);
    });
    // The broadcast reached the two workers alive.
    expect(lines).toContainEqual({ greetings: 2 });
    expect(lines[lines.length - 1]).toEqual({ stopped: true });
  }, 40000);

  it('runs the same code in one process', () => {
    const { status, lines } = run(0);
    expect(status).toBe(0);
    expect(lines).toEqual([
      { ready: 0, sum: 40, error: 'E_NOPE:nope', types: true },
      { greetings: 1 },
      { stopped: true },
    ]);
  }, 20000);
});

describe('bus in one process', () => {
  it('delivers events, requests and broadcasts to its handlers', async () => {
    const bus = new Bus();
    const seen = [];
    bus.on('event', (data) => seen.push(data));
    bus.on('double', (n) => n * 2);
    bus.send('event', 1);
    bus.broadcast('event', 2);
    bus.broadcast('event', 3, { others: true });
    expect(await bus.request('double', 21)).toBe(42);
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toEqual([1, 2]);
    const handler = () => 'x';
    bus.on('once', handler).off('once', handler);
    expect(await bus.request('once')).toBeUndefined();
    bus.on('fails', () => {
      throw new Error('bad');
    });
    await expect(bus.request('fails')).rejects.toThrow('bad');
  });
});
