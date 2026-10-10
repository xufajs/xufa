import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database, Model, fields } from '../index.js';
import { defineSuite } from './suite.js';

defineSuite('sqlite', () => new Database({ backend: 'sqlite', filename: ':memory:' }));

describe('sqlite values', () => {
  it('writes once rows whose keys are beyond the safe integers (and reads them as bigints)', async () => {
    class Big extends Model {
      static fields = { id: fields.bigint({ primaryKey: true }), name: fields.string() };
    }
    const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Big);
    await db.connect();
    await db.sync();
    const key = 9007199254740993n;
    await Big.objects.create({ id: key, name: 'big' });
    const found = await Big.objects.get({ pk: key });
    expect(found.id).toBe(key);
    expect(await Big.objects.count()).toBe(1);
    // A safe key is a number, also given back by the insert.
    const small = await Big.objects.create({ id: 5, name: 'small' });
    expect(small.id).toBe(5);
    await db.close();
  });
});

describe('sqlite files', () => {
  it('gives transactions a connection of their own: the queries outside do not wait for them', async () => {
    class Item extends Model {
      static fields = { name: fields.string() };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-sqlite-'));
    const db = new Database({ backend: 'sqlite', filename: path.join(dir, 'db.sqlite') }).register(Item);
    await db.connect();
    await db.sync();
    await Item.objects.create({ name: 'before' });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const running = db.transaction(async () => {
      await Item.objects.create({ name: 'inside' });
      expect(await Item.objects.count()).toBe(2);
      await gate;
    });
    await new Promise((resolve) => setImmediate(resolve));
    // Outside: what is committed, at once.
    expect(await Item.objects.count()).toBe(1);
    release();
    await running;
    expect(await Item.objects.count()).toBe(2);
    await expect(
      db.transaction(async () => {
        await Item.objects.create({ name: 'lost' });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await Item.objects.count()).toBe(2);
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the lock of another process: writes, BEGIN IMMEDIATE and COMMIT wait for it (busyTimeout), without blocking', async () => {
    class Shared extends Model {
      static fields = { name: fields.string() };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-sqlite-'));
    const filename = path.join(dir, 'db.sqlite');
    const db = new Database({ backend: 'sqlite', filename }).register(Shared);
    await db.connect();
    await db.sync();
    // Another process writes in a transaction and keeps the lock for 300 ms.
    const holdLock = (ms) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            '--no-warnings',
            '-e',
            `const { DatabaseSync } = require('node:sqlite');
             // (it waits for locks too: the attempts of the test take a read lock for a moment)
             const db = new DatabaseSync(process.argv[1], { timeout: 5000 });
             db.exec('BEGIN IMMEDIATE');
             db.exec("INSERT INTO ${Shared.meta.table} (name) VALUES ('other')");
             process.stdout.write('locked');
             setTimeout(() => { db.exec('COMMIT'); db.close(); }, ${ms});`,
            filename,
          ],
          { stdio: ['ignore', 'pipe', 'inherit'] }
        );
        const exited = new Promise((done) => child.once('exit', done));
        // (in an object: a promise given to resolve() would be waited for)
        child.stdout.once('data', () => resolve({ exited }));
        exited.then((code) => reject(new Error(`the other process ended (${code}) before it locked`)));
        child.once('error', reject);
      });
    let { exited: ended } = await holdLock(300);
    let ticks = 0;
    const ticking = setInterval(() => {
      ticks += 1;
    }, 10);
    const started = Date.now();
    await Shared.objects.create({ name: 'mine' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    // The process went on meanwhile (node:sqlite's own timeout would have blocked it).
    expect(ticks).toBeGreaterThan(5);
    await ended;
    ({ exited: ended } = await holdLock(300));
    await db.transaction(async () => Shared.objects.create({ name: 'in a transaction' }), { mode: 'immediate' });
    await ended;
    clearInterval(ticking);
    expect((await Shared.objects.orderBy('id')).map((item) => item.name)).toEqual([
      'other',
      'mine',
      'other',
      'in a transaction',
    ]);
    await db.close();
    // busyTimeout: 0 fails at once (SQLITE_BUSY).
    class Impatient extends Model {
      static fields = { name: fields.string() };

      static options = { table: Shared.meta.table };
    }
    const impatient = new Database({ backend: 'sqlite', filename, busyTimeout: 0 }).register(Impatient);
    await impatient.connect();
    ({ exited: ended } = await holdLock(300));
    await expect(Impatient.objects.create({ name: 'refused' })).rejects.toThrow(/locked|busy/i);
    await ended;
    await impatient.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 20000);

  it('writes outside wait for the transactions of the process, and transactions for each other', async () => {
    class Item extends Model {
      static fields = { name: fields.string() };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-sqlite-'));
    const db = new Database({ backend: 'sqlite', filename: path.join(dir, 'db.sqlite') }).register(Item);
    await db.connect();
    await db.sync();
    const order = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = db.transaction(async () => {
      await Item.objects.create({ name: 'first' });
      await gate;
      order.push('first');
    });
    await new Promise((resolve) => setImmediate(resolve));
    // Both meet the lock of the first: they are made when it commits (not SQLITE_BUSY).
    const second = db.transaction(async () => {
      await Item.objects.create({ name: 'second' });
      order.push('second');
    });
    const outside = Item.objects.create({ name: 'outside' }).then(() => order.push('outside'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);
    release();
    await Promise.all([first, second, outside]);
    expect(order[0]).toBe('first');
    expect((await Item.objects.valuesList('name', { flat: true })).sort()).toEqual(['first', 'outside', 'second']);
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
