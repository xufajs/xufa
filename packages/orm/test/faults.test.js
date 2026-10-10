// Faults: operations of databases made to fail, wait or hang (db.faults, dbs.faults, tenants.faults): which
// operations they match (operations, models, tenants, rate, after, times), their errors, hangs released, a database
// down and up, and what an app answers then (503).
import xufa from '@xufa/http';
import { Database, Databases, Tenants, Model, fields, FaultError, plugin } from '../index.js';

function models() {
  class Order extends Model {
    static fields = { total: fields.integer() };
  }
  class Customer extends Model {
    static fields = { name: fields.string() };

    static options = { cache: true };
  }
  return { Order, Customer };
}

async function open() {
  const { Order, Customer } = models();
  const db = new Database({ backend: 'memory' }).register(Order, Customer);
  await db.connect();
  await db.sync();
  return { db, Order, Customer };
}

const failure = (promise) => promise.then(() => null, (err) => err);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('faults', () => {
  it('fail: by operations (read, write, names) and models; FaultErrors of status 503', async () => {
    const { db, Order, Customer } = await open();
    await Order.objects.create({ total: 1 });
    const writes = db.faults.fail({ operations: 'write', models: [Order] });
    const err = await failure(Order.objects.create({ total: 2 }));
    expect(err).toBeInstanceOf(FaultError);
    expect([err.code, err.statusCode, err.operation, err.model, err.message]).toEqual([
      'XUFA_ORM_ERR_FAULT',
      503,
      'insert',
      'Order',
      'A fault of the database (injected): insert of Order',
    ]);
    expect(await Order.objects.count()).toBe(1); // reads are fine
    await Customer.objects.create({ name: 'ada' }); // other models too
    expect(await failure(Order.objects.filter({ total: 1 }).update({ total: 5 }))).toBeInstanceOf(FaultError);
    expect(await failure(Order.objects.all().delete())).toBeInstanceOf(FaultError);
    expect(writes.hits).toBe(3);
    writes.remove();
    await Order.objects.create({ total: 3 });
    db.faults.fail({ operations: ['count'], models: ['Order'] });
    expect(await failure(Order.objects.count())).toBeInstanceOf(FaultError);
    expect((await Order.objects.all()).length).toBe(2); // select is not count
    db.faults.clear();
  });

  it('after, times and rate (with a random of the test); errors of your own', async () => {
    const { db, Order } = await open();
    const rule = db.faults.fail({ operations: 'insert', after: 1, times: 2 });
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push((await failure(Order.objects.create({ total: i }))) ? 'fail' : 'ok');
    expect(results).toEqual(['ok', 'fail', 'fail', 'ok', 'ok']);
    expect([rule.hits, rule.active, db.faults.rules.length]).toEqual([2, false, 0]);
    // rate: a match fails when random() is below it.
    const draws = [0.1, 0.9, 0.4, 0.6];
    db.faults.random = () => draws.shift();
    db.faults.fail({ operations: 'select', rate: 0.5 });
    const reads = [];
    for (let i = 0; i < 4; i += 1) reads.push((await failure(Order.objects.all())) ? 'fail' : 'ok');
    expect(reads).toEqual(['fail', 'ok', 'fail', 'ok']);
    db.faults.clear();
    const lost = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    db.faults.fail({ operations: 'select', error: lost, times: 1 });
    expect(await failure(Order.objects.all())).toBe(lost);
    db.faults.fail({ operations: 'count', error: ({ operation, model }) => new Error(`${operation}/${model}`), times: 1 });
    expect((await failure(Order.objects.count())).message).toBe('count/Order');
  });

  it('delay: operations take longer (ms, and jitter)', async () => {
    const { db, Order } = await open();
    db.faults.delay({ operations: 'read', ms: 60 });
    let started = Date.now();
    await Order.objects.count();
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
    db.faults.clear();
    db.faults.random = () => 1;
    db.faults.delay({ operations: 'read', ms: 10, jitter: 60 });
    started = Date.now();
    await Order.objects.count();
    expect(Date.now() - started).toBeGreaterThanOrEqual(65);
    db.faults.clear();
    started = Date.now();
    await Order.objects.count();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('hang: operations wait until released (or the rule removed, or the faults cleared)', async () => {
    const { db, Order } = await open();
    const hung = db.faults.hang({ operations: 'insert' });
    let done = false;
    const insert = Order.objects.create({ total: 1 }).then(() => {
      done = true;
    });
    await wait(30);
    expect([done, hung.hits]).toEqual([false, 1]);
    hung.release();
    await insert;
    expect(done).toBe(true);
    // Still a rule: the next ones wait too, until the faults are cleared.
    let second = false;
    const next = Order.objects.create({ total: 2 }).then(() => {
      second = true;
    });
    await wait(20);
    expect(second).toBe(false);
    db.faults.clear();
    await next;
    expect(await Order.objects.count()).toBe(2);
  });

  it('down and up: every operation fails (transactions and connect too); objects of the cache of models are not read', async () => {
    const { db, Order, Customer } = await open();
    const ada = await Customer.objects.create({ name: 'ada' });
    await Customer.objects.get({ pk: ada.pk }); // in the cache
    db.faults.down();
    expect((await failure(Order.objects.count())).message).toBe('The database is down (a fault injected)');
    expect(await failure(db.transaction(async () => 1))).toBeInstanceOf(FaultError);
    expect(await failure(db.connect())).toBeInstanceOf(FaultError);
    expect((await Customer.objects.get({ pk: ada.pk })).name).toBe('ada'); // the cache answers
    db.faults.up();
    expect(await Order.objects.count()).toBe(0);
  });

  it('errors of the options', async () => {
    const { db } = await open();
    expect(() => db.faults.fail({ operations: 'drop' })).toThrow(/is of select, count, aggregate, insert/);
    expect(() => db.faults.fail({ rate: 2 })).toThrow(/from 0 to 1/);
    expect(() => db.faults.delay({})).toThrow(/has ms/);
  });
});

describe('faults of several databases and of tenants', () => {
  it('Databases: the faults of the database of a model', async () => {
    const { Order, Customer } = models();
    const dbs = new Databases({ default: { backend: 'memory' }, crm: { backend: 'memory' } }, { routes: { Customer: 'crm' } });
    dbs.register(Order, Customer);
    await dbs.connect();
    await dbs.sync();
    dbs.faults.fail({ models: ['Customer'] });
    expect(await failure(Customer.objects.count())).toBeInstanceOf(FaultError);
    expect(await Order.objects.count()).toBe(0);
    dbs.faults.clear();
    await dbs.close();
  });

  it('Tenants: rules by tenant, for the databases open and those opened after (connect too)', async () => {
    const { Order } = models();
    const tenants = new Tenants({ models: [Order], config: () => ({ backend: 'memory' }), setup: (tdb) => tdb.sync() });
    await tenants.run('acme', () => Order.objects.create({ total: 1 })); // open before the faults
    const down = tenants.faults.down({ tenants: ['acme'] });
    await new Promise((resolve) => setImmediate(resolve)); // installed in the database open
    expect(await failure(tenants.run('acme', () => Order.objects.count()))).toBeInstanceOf(FaultError);
    expect(await tenants.run('globex', () => Order.objects.count())).toBe(0); // opened after: no fault of acme
    const err = await failure(tenants.run('globex', () => Order.objects.count()).then(() => tenants.faults.fail({ tenants: 'globex', times: 1 })).then(() => tenants.run('globex', () => Order.objects.count())));
    expect([err.tenant, err.message]).toEqual(['globex', 'A fault of the database (injected): count of Order in the tenant globex']);
    tenants.faults.down({ tenants: ['initech'] });
    expect(await failure(tenants.run('initech', () => Order.objects.count()))).toBeInstanceOf(FaultError); // its connect
    down.remove();
    expect(await tenants.run('acme', () => Order.objects.count())).toBe(1);
    tenants.faults.clear();
    await tenants.close();
  });

  it('an app answers 503 while its database is down', async () => {
    const { db, Order } = await open();
    const app = xufa();
    app.register(plugin, { database: db, connect: false, close: false });
    app.get('/orders', async () => Order.objects.count());
    await app.ready();
    db.faults.down();
    const res = await app.inject('/orders');
    expect([res.statusCode, res.json().code]).toEqual([503, 'XUFA_ORM_ERR_FAULT']);
    db.faults.up();
    expect((await app.inject('/orders')).json()).toBe(0);
    await app.close();
  });
});
