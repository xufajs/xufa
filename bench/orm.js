// ORMs: @xufa/orm against Sequelize 6, on the same models and workloads, on PostgreSQL and SQLite. The stacks:
//   xufa                 @xufa/orm on @xufa/pg (PostgreSQL) or node:sqlite
//   sequelize            Sequelize on pg (PostgreSQL) or sqlite3, as installed by default
//   sequelize-xufa-pg    Sequelize on @xufa/pg (PostgreSQL only): the gain of the driver alone
//   xufa-sequelize       the same Sequelize code on @xufa/sequelize (the API of Sequelize over @xufa/orm)
// Every stack runs every round in a process of its own, the stacks taking turns, and the median of the rounds is
// shown, with the ratio of each stack to sequelize.
//
// node orm.js [--dialects postgres,sqlite] [--rounds 5] [--scale 1] [--only a,b] [--pool 10]
//             [--orms xufa,sequelize,sequelize-xufa-pg,xufa-sequelize] [--url postgres://xufa:xufa@127.0.0.1:5432/xufa_test]
//
// It uses the tables bench_author and bench_book, dropped before and after.
const { fork } = require('node:child_process');

const WORKLOADS = {
  'create (serial)': { ops: 2000, unit: 'ops' },
  'findByPk (serial)': { ops: 5000, unit: 'ops' },
  'findByPk (64 concurrent)': { ops: 20000, unit: 'ops' },
  'findAll where/order/limit 100': { ops: 500, unit: 'ops' },
  'findAll 10k rows': { ops: 10000, unit: 'rows' },
  'findAll with author (join), 1k rows': { ops: 20000, unit: 'rows' },
  'bulkCreate 1000 per call': { ops: 20000, unit: 'rows' },
  'update where': { ops: 200, unit: 'ops' },
  'count where': { ops: 1000, unit: 'ops' },
};

function parseArgs(argv) {
  const args = {
    dialects: ['postgres', 'sqlite'],
    rounds: 5,
    scale: 1,
    only: null,
    pool: 10,
    orms: ['xufa', 'sequelize', 'sequelize-xufa-pg', 'xufa-sequelize'],
    url: 'postgres://xufa:xufa@127.0.0.1:5432/xufa_test',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    const value = argv[i + 1];
    if (name === 'only' || name === 'dialects' || name === 'orms') args[name] = value.split(',');
    else args[name] = name === 'url' ? value : Number(value);
  }
  return args;
}

const book = (i, authorId) => ({
  title: `Book ${i}`,
  pages: 100 + (i % 500),
  rating: (i % 50) / 10,
  publishedAt: new Date(1700000000000 + i * 1000),
  data: { tags: ['a', `t${i % 10}`], n: i },
  authorId,
});

// The same operations for each ORM: { setup(), close(), reset(), create(data), findByPk(id), list(...), ... }.
async function xufaAdapter(dialect, args) {
  const { Database, Model, fields } = require('@xufa/orm');
  class Author extends Model {
    static fields = { name: fields.string({ maxLength: 100 }) };

    static options = { table: 'bench_author' };
  }
  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 200 }),
      pages: fields.integer(),
      rating: fields.float(),
      publishedAt: fields.datetime(),
      data: fields.json({ null: true }),
      author: fields.foreignKey(Author, { relatedName: 'books' }),
    };

    static options = { table: 'bench_book' };
  }
  const db =
    dialect === 'postgres'
      ? new Database({ backend: 'postgres', url: args.url, max: args.pool })
      : new Database({ backend: 'sqlite', filename: ':memory:' });
  db.register(Author, Book);
  await db.connect();
  return {
    async reset() {
      await db.drop();
      await db.sync();
    },
    createAuthor: (name) => Author.objects.create({ name }),
    createBook: (data) => Book.objects.create(data),
    bulkCreate: (rows) => Book.objects.bulkCreate(rows),
    findByPk: (id) => Book.objects.get({ pk: id }),
    list: () => Book.objects.filter({ pages__gte: 300, rating__lt: 4 }).orderBy('-publishedAt').limit(100),
    all: () => Book.objects.all(),
    withAuthor: () => Book.objects.selectRelated('author').limit(1000),
    update: (flag) => Book.objects.filter({ pages__gte: flag ? 300 : 200 }).update({ rating: flag ? 1 : 2 }),
    count: () => Book.objects.filter({ pages__gte: 300 }).count(),
    close: async () => {
      await db.drop();
      await db.close();
    },
  };
}

async function sequelizeAdapter(dialect, args, dialectModule, module = 'sequelize') {
  const { Sequelize, DataTypes, Op } = require(module);
  const sequelize =
    dialect === 'postgres'
      ? new Sequelize(args.url, { logging: false, pool: { max: args.pool }, dialectModule })
      : new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const Author = sequelize.define(
    'Author',
    { name: DataTypes.STRING(100) },
    { tableName: 'bench_author', timestamps: false }
  );
  const Book = sequelize.define(
    'Book',
    {
      title: DataTypes.STRING(200),
      pages: DataTypes.INTEGER,
      rating: DataTypes.DOUBLE,
      publishedAt: DataTypes.DATE,
      data: dialect === 'postgres' ? DataTypes.JSONB : DataTypes.JSON,
    },
    // The same schema as @xufa/orm, which indexes foreign keys.
    { tableName: 'bench_book', timestamps: false, indexes: [{ fields: ['authorId'] }] }
  );
  Book.belongsTo(Author, { as: 'author', foreignKey: 'authorId' });
  Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' });
  await sequelize.authenticate();
  return {
    async reset() {
      await sequelize.drop();
      await sequelize.sync({ force: true });
    },
    createAuthor: (name) => Author.create({ name }),
    createBook: (data) => Book.create(data),
    bulkCreate: (rows) => Book.bulkCreate(rows),
    findByPk: (id) => Book.findByPk(id),
    list: () =>
      Book.findAll({
        where: { pages: { [Op.gte]: 300 }, rating: { [Op.lt]: 4 } },
        order: [['publishedAt', 'DESC']],
        limit: 100,
      }),
    all: () => Book.findAll(),
    withAuthor: () => Book.findAll({ include: [{ model: Author, as: 'author' }], limit: 1000 }),
    update: (flag) => Book.update({ rating: flag ? 1 : 2 }, { where: { pages: { [Op.gte]: flag ? 300 : 200 } } }),
    count: () => Book.count({ where: { pages: { [Op.gte]: 300 } } }),
    close: async () => {
      await sequelize.drop();
      await sequelize.close();
    },
  };
}

async function worker(orm, dialect, args) {
  const db =
    orm === 'xufa'
      ? await xufaAdapter(dialect, args)
      : orm === 'xufa-sequelize'
        ? await sequelizeAdapter(dialect, args, undefined, '@xufa/sequelize')
        : await sequelizeAdapter(dialect, args, orm === 'sequelize-xufa-pg' ? require('./lib/pg-shim') : undefined);
  const results = {};
  const scaled = (workload) => Math.max(1, Math.round(WORKLOADS[workload].ops * args.scale));
  const run = async (workload, setup, fn) => {
    if (args.only && !args.only.some((part) => workload.includes(part))) return;
    const ops = scaled(workload);
    const context = setup ? await setup(ops) : undefined;
    const start = process.hrtime.bigint();
    await fn(ops, context);
    results[workload] = ops / (Number(process.hrtime.bigint() - start) / 1e9);
  };
  // Authors and `count` books (bulk created), and the keys of the books.
  const fill = async (count) => {
    await db.reset();
    const authors = [];
    for (let i = 0; i < 10; i += 1) authors.push((await db.createAuthor(`Author ${i}`)).id);
    for (let start = 0; start < count; start += 1000) {
      const rows = [];
      for (let i = start; i < Math.min(count, start + 1000); i += 1) rows.push(book(i, authors[i % 10]));
      await db.bulkCreate(rows);
    }
    return { authors, count };
  };

  await run(
    'create (serial)',
    () => fill(0),
    async (ops, { authors }) => {
      for (let i = 0; i < ops; i += 1) await db.createBook(book(i, authors[i % 10]));
    }
  );
  await run(
    'findByPk (serial)',
    () => fill(5000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await db.findByPk((i % 5000) + 1);
    }
  );
  await run(
    'findByPk (64 concurrent)',
    () => fill(5000),
    async (ops) => {
      let next = 0;
      const lane = async () => {
        while (next < ops) {
          const i = next;
          next += 1;
          await db.findByPk((i % 5000) + 1);
        }
      };
      await Promise.all(Array.from({ length: 64 }, lane));
    }
  );
  await run(
    'findAll where/order/limit 100',
    () => fill(10000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await db.list();
    }
  );
  await run('findAll 10k rows', fill, async (ops) => {
    const rows = await db.all();
    if (rows.length !== ops) throw new Error(`findAll gave ${rows.length} rows`);
  });
  await run(
    'findAll with author (join), 1k rows',
    () => fill(1000),
    async (ops) => {
      for (let i = 0; i < ops / 1000; i += 1) {
        const rows = await db.withAuthor();
        if (rows.length !== 1000 || !rows[0].author) throw new Error('the join gave no authors');
      }
    }
  );
  await run(
    'bulkCreate 1000 per call',
    async (ops) => {
      const { authors } = await fill(0);
      const batches = [];
      for (let start = 0; start < ops; start += 1000) {
        batches.push(Array.from({ length: 1000 }, (_, i) => book(start + i, authors[(start + i) % 10])));
      }
      return batches;
    },
    async (ops, batches) => {
      for (let i = 0; i < batches.length; i += 1) await db.bulkCreate(batches[i]);
    }
  );
  await run(
    'update where',
    () => fill(10000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await db.update(i % 2 === 0);
    }
  );
  await run(
    'count where',
    () => fill(10000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await db.count();
    }
  );
  await db.close();
  return results;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runWorker(orm, dialect, argv) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker', orm, dialect, ...argv], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.once('message', resolve);
    child.once('exit', (code) => code && reject(new Error(`${orm} on ${dialect} exited with ${code}`)));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') {
    const results = await worker(argv[1], argv[2], parseArgs(argv.slice(3)));
    // Run alone (to profile it: node --cpu-prof orm.js --worker xufa sqlite), it prints its results.
    if (process.send) process.send(results, () => process.exit(0));
    else console.log(results);
    return;
  }
  const args = parseArgs(argv);
  console.log(`ORMs: @xufa/orm against sequelize ${require('sequelize/package.json').version}`);
  console.log(`${args.rounds} rounds, scale ${args.scale}, pool ${args.pool}, Node.js ${process.version}`);
  for (const dialect of args.dialects) {
    // Sequelize on @xufa/pg is a PostgreSQL stack only.
    const orms = args.orms.filter((orm) => dialect === 'postgres' || orm !== 'sequelize-xufa-pg');
    const rounds = Object.fromEntries(orms.map((orm) => [orm, []]));
    for (let round = 0; round < args.rounds; round += 1) {
      // The order of the stacks rotates, so none always runs on a warmer server.
      const order = orms.map((_, i) => orms[(i + round) % orms.length]);
      for (const orm of order) rounds[orm].push(await runWorker(orm, dialect, argv));
      process.stdout.write(`${dialect}: round ${round + 1}/${args.rounds} done
`);
    }
    const format = (value) => Math.round(value).toLocaleString('en-US');
    const spread = (values) => (Math.max(...values) - Math.min(...values)) / median(values);
    const others = orms.filter((orm) => orm !== 'sequelize');
    const base = orms.includes('sequelize') ? 'sequelize' : null;
    const ratios = base ? others.map((orm) => ` ${orm} / sequelize |`).join('') : '';
    console.log(`
### ${dialect}

| Workload |${orms.map((orm) => ` ${orm} |`).join('')}${ratios}`);
    console.log(`| --- |${orms.map(() => ' ---: |').join('')}${base ? others.map(() => ' ---: |').join('') : ''}`);
    Object.keys(rounds[orms[0]][0]).forEach((workload) => {
      const medians = {};
      let noisy = false;
      for (const orm of orms) {
        const values = rounds[orm].map((result) => result[workload]);
        medians[orm] = median(values);
        if (spread(values) > 0.1) noisy = true;
      }
      const unit = WORKLOADS[workload].unit;
      const cells = orms.map((orm) => ` ${format(medians[orm])} ${unit}/s |`).join('');
      const ratioCells = base
        ? others.map((orm) => ` ${(medians[orm] / medians.sequelize).toFixed(2)}x${noisy ? ' ⚠' : ''} |`).join('')
        : '';
      console.log(`| ${workload} |${cells}${ratioCells}`);
    });
    console.log('');
  }
  console.log('Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
