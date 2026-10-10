// examples/locallibrary as the benchmark runs it: its project (xufa.yaml) on the database of the benchmark, in
// production (no debug pages), with no log of requests, no workers of the queue in the web processes (Django runs
// none either) and no audit log (Django's LogEntry is only for its admin).
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..', '..', 'examples', 'locallibrary');
const require = createRequire(path.join(ROOT, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);

async function buildApp({ databaseUrl, migrate = false }) {
  const { loadProject } = await load('xufa/project');
  const project = await loadProject(ROOT, {
    overrides: {
      // BENCH_POOL: the connections of each process (the pool's default otherwise).
      database: {
        url: databaseUrl,
        audit: false,
        ...(process.env.BENCH_POOL ? { max: Number(process.env.BENCH_POOL) } : {}),
        // BENCH_PIPELINE: the queries a connection takes before another is opened (the pool's default otherwise).
        ...(process.env.BENCH_PIPELINE ? { pipeline: Number(process.env.BENCH_PIPELINE) } : {}),
      },
      debug: false,
      secretKey: process.env.SECRET_KEY || 'bench-secret-key-of-the-xufa-side-of-the-benchmark-0123456789',
    },
  });
  const app = await project.build({ migrate, logger: false, work: false });
  return { app, project };
}

// The two pages of the benchmark that are not of the tutorial: a text, and a book as JSON.
function addBenchRoutes(app, project) {
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
}

export { buildApp, addBenchRoutes, ROOT };
