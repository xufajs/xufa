// A cluster of 2 workers with start({ marshal }): instances of registered classes, and errors of the handlers,
// arrive as themselves. The workers report what they got to the primary, which prints it (JSON lines).
const { Registry } = require('@xufa/marshal');
const xufa = require('../..');

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  scale(k) {
    return new Point(this.x * k, this.y * k);
  }
}

class NotFound extends Error {
  constructor(what) {
    super(`${what} not found`);
    this.name = 'NotFound';
    this.what = what;
  }
}

const registry = new Registry().register(Point, NotFound);
const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);
const WORKERS = 2;

xufa.start({
  workers: WORKERS,
  marshal: registry,
  async primary({ bus }) {
    let reports = 0;
    bus.on('scale', ({ point, k }) => point.scale(k)); // a method of Point: it arrived as a Point
    bus.on('find', ({ what }) => {
      throw new NotFound(what);
    });
    bus.on('report', async (data) => {
      // One object sent twice is one object here.
      const { shared, ...rest } = data;
      report({ ...rest, sharedKept: shared[0] === shared[1] });
      reports += 1;
      if (reports === WORKERS) {
        await xufa.stop();
        process.exit(0);
      }
    });
  },
  async worker({ bus, id }) {
    const scaled = await bus.request('scale', { point: new Point(1, 2), k: 3 });
    let error;
    try {
      await bus.request('find', { what: 'book' });
    } catch (err) {
      error = err;
    }
    const shared = { n: 1 };
    bus.send('report', {
      worker: id,
      scaledIsPoint: scaled instanceof Point,
      scaled: [scaled.x, scaled.y],
      errorIsNotFound: error instanceof NotFound,
      error: [error.name, error.message, error.what],
      shared: [shared, shared],
    });
  },
});
