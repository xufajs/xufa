// The xufa side of the benchmark: examples/locallibrary in N processes that share the port (node:cluster, as
// gunicorn's workers), with the two pages of the benchmark: a text, and a book as JSON.
//
//   NODE_ENV=production node xufa-server.mjs <port> <workers> <database url>
import cluster from 'node:cluster';
import { buildApp, addBenchRoutes } from './xufa-app.mjs';

const [port, workers, databaseUrl] = process.argv.slice(2);

if (cluster.isPrimary && Number(workers) > 1) {
  // The young generation of V8 of @xufa/cluster's workers (its default, 32 MB; --semi-space of django.js).
  const semiSpace = Number(process.env.BENCH_SEMI_SPACE) || 32;
  const flags = (process.env.BENCH_XUFA_FLAGS || '').split(',').filter(Boolean);
  cluster.setupPrimary({ execArgv: [...process.execArgv, `--max-semi-space-size=${semiSpace}`, ...flags] });
  let ready = 0;
  for (let i = 0; i < Number(workers); i += 1) {
    cluster.fork().on('message', (message) => {
      if (message === 'listening' && (ready += 1) === Number(workers)) console.log(`xufa: listening on ${port}`);
    });
  }
  cluster.on('exit', (worker, code) => {
    if (code) console.error(`xufa: a worker exited with ${code}`);
  });
  const stop = () => {
    for (const worker of Object.values(cluster.workers)) worker.kill();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} else {
  const { app, project } = await buildApp({ databaseUrl });
  addBenchRoutes(app, project);
  if (process.env.BENCH_HEAP_LOG) {
    // The memory of this worker, every 2 s (django.js --heap-log 1).
    const v8 = await import('node:v8');
    const fs = await import('node:fs');
    const file = `${process.env.BENCH_HEAP_LOG}/heap-${process.pid}.json`;
    const mb = (bytes) => Math.round(bytes / 1048576);
    setInterval(() => {
      const usage = Object.fromEntries(Object.entries(process.memoryUsage()).map(([key, value]) => [key, mb(value)]));
      const spaces = Object.fromEntries(
        v8
          .getHeapSpaceStatistics()
          .map((space) => [space.space_name, [mb(space.space_size), mb(space.space_used_size)]])
      );
      fs.writeFileSync(file, JSON.stringify({ usage, spaces }));
    }, 2000).unref();
  }
  await app.listen({ port: Number(port), host: '127.0.0.1' });
  if (process.send) process.send('listening');
  else console.log(`xufa: listening on ${port}`);
  process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
}
