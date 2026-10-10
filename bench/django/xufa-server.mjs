// The xufa side of the benchmark: examples/locallibrary in N processes that share the port (node:cluster, as
// gunicorn's workers), with the two pages of the benchmark: a text, and a book as JSON.
//
//   NODE_ENV=production node xufa-server.mjs <port> <workers> <database url>
import cluster from 'node:cluster';
import { buildApp } from './xufa-app.mjs';

const [port, workers, databaseUrl] = process.argv.slice(2);

if (cluster.isPrimary && Number(workers) > 1) {
  // The young generation of V8 of @xufa/cluster's workers (its default).
  cluster.setupPrimary({ execArgv: [...process.execArgv, '--max-semi-space-size=32'] });
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
  const Book = project.model('Book');
  app.get('/bench/hello', async (request, reply) => reply.type('text/plain; charset=utf-8').send('Hello, World!'));
  app.get('/bench/book/:pk.json', async (request, reply) => {
    const book = await Book.objects
      .selectRelated('author', 'language')
      .prefetchRelated('genre')
      .filter({ pk: Number(request.params.pk) })
      .first();
    if (!book) return reply.code(404).send({ error: 'Not found' });
    return {
      id: book.pk,
      title: book.title,
      isbn: book.isbn,
      author: { id: book.author.pk, firstName: book.author.firstName, lastName: book.author.lastName },
      language: book.language ? book.language.name : null,
      genres: (await book.genre.all()).map((genre) => genre.name),
    };
  });
  await app.listen({ port: Number(port), host: '127.0.0.1' });
  if (process.send) process.send('listening');
  else console.log(`xufa: listening on ${port}`);
  process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
}
