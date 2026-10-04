// MongoDB drivers: @xufa/mongo against the official driver (mongodb), on the same server and workloads. Every driver
// runs every round in a process of its own, the drivers taking turns, and the median of the rounds is shown.
//
// node mongo.js [--url mongodb://127.0.0.1:27017/xufa_bench] [--rounds 5] [--scale 1] [--only a,b] [--pool 10]
//
// It uses the collection bench_mongo of the database of the url, dropped before and after.
const { fork } = require('node:child_process');

const WORKLOADS = {
  // CPU only: encoding and decoding a document of mixed types.
  'bson serialize': { ops: 200000, unit: 'docs' },
  'bson deserialize': { ops: 200000, unit: 'docs' },
  // One command after another: the round trip of the driver.
  'insertOne (serial)': { ops: 3000, unit: 'ops' },
  'findOne by _id (serial)': { ops: 5000, unit: 'ops' },
  // Many commands at the same time: the pool and the pipelining.
  'findOne by _id (64 concurrent)': { ops: 20000, unit: 'ops' },
  // Bulk: large messages to write and read.
  'insertMany (1000 per batch)': { ops: 50000, unit: 'docs' },
  // One call with every document: the driver splits it (unordered, it can send parts at the same time).
  'insertMany (50k in one call, ordered)': { ops: 50000, unit: 'docs' },
  'insertMany (50k in one call, unordered)': { ops: 50000, unit: 'docs' },
  'find toArray (all docs)': { ops: 50000, unit: 'docs' },
  'aggregate $group': { ops: 200, unit: 'ops' },
  'updateMany $inc': { ops: 200, unit: 'ops' },
};

function parseArgs(argv) {
  const args = { url: 'mongodb://127.0.0.1:27017/xufa_bench', rounds: 5, scale: 1, only: null, pool: 10 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    args[name] = name === 'url' ? argv[i + 1] : name === 'only' ? argv[i + 1].split(',') : Number(argv[i + 1]);
  }
  return args;
}

function makeDoc(i) {
  return {
    i,
    name: `user ${i}`,
    email: `user${i}@example.com`,
    active: i % 2 === 0,
    score: i * 1.5,
    createdAt: new Date(1700000000000 + i * 1000),
    tags: ['a', 'b', `t${i % 10}`],
    address: { street: `${i} Main St`, city: 'Springfield', zip: String(10000 + (i % 1000)) },
  };
}

async function worker(name, args) {
  const lib = name === 'xufa' ? require('@xufa/mongo') : require('mongodb');
  const bson = name === 'xufa' ? lib : require('mongodb').BSON;
  const client = new lib.MongoClient(args.url, { maxPoolSize: args.pool });
  await client.connect();
  const collection = client.db().collection('bench_mongo');
  const results = {};
  const scaled = (workload) => Math.max(1, Math.round(WORKLOADS[workload].ops * args.scale));
  const run = async (workload, setup, fn) => {
    if (args.only && !args.only.some((part) => workload.includes(part))) return;
    const ops = scaled(workload);
    const context = setup ? await setup(ops) : undefined;
    const start = process.hrtime.bigint();
    await fn(ops, context);
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    results[workload] = ops / seconds;
  };
  const fill = async (count) => {
    await collection.deleteMany({});
    const docs = Array.from({ length: count }, (_, i) => makeDoc(i));
    for (let i = 0; i < docs.length; i += 1000) await collection.insertMany(docs.slice(i, i + 1000));
    return (await collection.find({}, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id);
  };

  const doc = { _id: new lib.ObjectId(), ...makeDoc(42) };
  const encoded = bson.serialize(doc);
  await run('bson serialize', null, (ops) => {
    for (let i = 0; i < ops; i += 1) bson.serialize(doc);
  });
  await run('bson deserialize', null, (ops) => {
    for (let i = 0; i < ops; i += 1) bson.deserialize(encoded);
  });
  await run(
    'insertOne (serial)',
    () => collection.deleteMany({}),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await collection.insertOne(makeDoc(i));
    }
  );
  await run('findOne by _id (serial)', fill, async (ops, ids) => {
    for (let i = 0; i < ops; i += 1) await collection.findOne({ _id: ids[i % ids.length] });
  });
  await run(
    'findOne by _id (64 concurrent)',
    () => fill(5000),
    async (ops, ids) => {
      let next = 0;
      const lane = async () => {
        while (next < ops) {
          const i = next;
          next += 1;
          await collection.findOne({ _id: ids[i % ids.length] });
        }
      };
      await Promise.all(Array.from({ length: 64 }, lane));
    }
  );
  await run(
    'insertMany (1000 per batch)',
    async (ops) => {
      await collection.deleteMany({});
      return Array.from({ length: ops }, (_, i) => makeDoc(i));
    },
    async (ops, docs) => {
      for (let i = 0; i < docs.length; i += 1000) await collection.insertMany(docs.slice(i, i + 1000));
    }
  );
  for (const ordered of [true, false]) {
    await run(
      `insertMany (50k in one call, ${ordered ? 'ordered' : 'unordered'})`,
      async (ops) => {
        await collection.deleteMany({});
        return Array.from({ length: ops }, (_, i) => makeDoc(i));
      },
      async (ops, docs) => {
        await collection.insertMany(docs, { ordered });
      }
    );
  }
  await run('find toArray (all docs)', fill, async (ops) => {
    const docs = await collection.find({}).toArray();
    if (docs.length !== ops) throw new Error(`find gave ${docs.length} documents instead of ${ops}`);
  });
  await run(
    'aggregate $group',
    () => fill(10000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) {
        await collection
          .aggregate([{ $group: { _id: '$address.zip', n: { $sum: 1 }, s: { $avg: '$score' } } }])
          .toArray();
      }
    }
  );
  await run(
    'updateMany $inc',
    () => fill(10000),
    async (ops) => {
      for (let i = 0; i < ops; i += 1) await collection.updateMany({ active: i % 2 === 0 }, { $inc: { score: 1 } });
    }
  );

  await collection.drop();
  await client.close();
  return results;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runWorker(name, argv) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['--worker', name, ...argv], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.once('message', resolve);
    child.once('exit', (code) => code && reject(new Error(`${name} exited with ${code}`)));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') {
    const results = await worker(argv[1], parseArgs(argv.slice(2)));
    // Run alone (to profile it: node --cpu-prof mongo.js --worker xufa), it prints its results.
    if (process.send) process.send(results, () => process.exit(0));
    else console.log(results);
    return;
  }
  const args = parseArgs(argv);
  const drivers = ['xufa', 'mongodb'];
  const rounds = { xufa: [], mongodb: [] };
  console.log(`MongoDB drivers: @xufa/mongo against mongodb ${require('mongodb/package.json').version}`);
  console.log(
    `${args.url}, ${args.rounds} rounds, scale ${args.scale}, maxPoolSize ${args.pool}, Node.js ${process.version}`
  );
  for (let round = 0; round < args.rounds; round += 1) {
    // The order of the drivers alternates, so neither always runs on a warmer server.
    const order = round % 2 ? [...drivers].reverse() : drivers;
    for (const name of order) rounds[name].push(await runWorker(name, argv));
    process.stdout.write(`round ${round + 1}/${args.rounds} done\n`);
  }
  const rows = Object.keys(rounds.xufa[0]).map((workload) => {
    const xufa = rounds.xufa.map((result) => result[workload]);
    const official = rounds.mongodb.map((result) => result[workload]);
    const spread = (values) => (Math.max(...values) - Math.min(...values)) / median(values);
    return {
      workload,
      unit: WORKLOADS[workload].unit,
      xufa: median(xufa),
      mongodb: median(official),
      noisy: spread(xufa) > 0.1 || spread(official) > 0.1,
    };
  });
  const format = (value) => Math.round(value).toLocaleString('en-US');
  console.log('\n| Workload | @xufa/mongo | mongodb | xufa / mongodb |');
  console.log('| --- | ---: | ---: | ---: |');
  rows.forEach((row) => {
    const ratio = `${(row.xufa / row.mongodb).toFixed(2)}x${row.noisy ? ' ⚠' : ''}`;
    console.log(
      `| ${row.workload} | ${format(row.xufa)} ${row.unit}/s | ${format(row.mongodb)} ${row.unit}/s | ${ratio} |`
    );
  });
  console.log('\nMedians of the rounds.');
  if (rows.some((row) => row.noisy)) console.log('⚠: the rounds of a driver are more than 10% apart (noise).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
