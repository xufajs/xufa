import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Bus, start } from '../index.js';

const fixture = path.join(import.meta.dirname, 'fixtures', 'app.js');

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

  it('requestThen() answers to a callback: at once for a handler that answers at once, else with its promise', async () => {
    const bus = new Bus();
    bus.on('double', (n) => n * 2);
    bus.on('later', async (n) => n + 1);
    bus.on('fails', () => {
      throw new Error('bad');
    });
    bus.on('two', () => 1).on('two', async () => 2);
    const answers = [];
    bus.requestThen('double', 21, {}, (err, value) => answers.push(['double', err, value]));
    // (At once: before this line.)
    expect(answers).toEqual([['double', null, 42]]);
    const settled = (event, data) =>
      new Promise((resolve) => {
        bus.requestThen(event, data, {}, (err, value) => resolve([err && err.message, value]));
      });
    expect(await settled('later', 1)).toEqual([null, 2]);
    expect(await settled('fails')).toEqual(['bad', undefined]);
    expect(await settled('two')).toEqual([null, 2]);
    expect(await settled('nobody')).toEqual([null, undefined]);
  });
});

describe('start({ marshal })', () => {
  it('sends instances of registered classes, and errors of handlers, as themselves', () => {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'fixtures', 'marshal.js')], { timeout: 30000 });
    const lines = result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .sort((a, b) => a.worker - b.worker);
    expect(result.status).toBe(0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatchObject({
        scaledIsPoint: true,
        scaled: [3, 6],
        errorIsNotFound: true,
        error: ['NotFound', 'book not found', 'book'],
        sharedKept: true,
      });
    }
  });
});

describe('start({ marshal: options })', () => {
  it("writes what is not registered as JSON would, with unknown 'json' and functions 'skip'", () => {
    const fixture = path.join(import.meta.dirname, 'fixtures', 'marshal-options.js');
    const result = spawnSync(process.execPath, [fixture], { timeout: 30000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.toString().trim())).toEqual({
      dateIsDate: true,
      time: 0,
      id: 'id:ab',
      hasFn: false,
      list: [1, null],
    });
  });
});

describe('start({ serialization })', () => {
  const run = (serialization) => {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'fixtures', 'serialization.js'), serialization], {
      timeout: 30000,
    });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.toString().trim());
  };

  it("'advanced' (the default) keeps Dates; 'json' makes them strings, on the bus and in the app's own messages", () => {
    expect(run('advanced')).toEqual({ bus: 'Date', own: 'Date' });
    expect(run('json')).toEqual({ bus: 'string', own: 'string' });
  });

  it('refuses other values', async () => {
    await expect(start({ serialization: 'yaml', workers: 0 })).rejects.toThrow(TypeError);
  });
});
