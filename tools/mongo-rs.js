// The MongoDB replica set of the tests (rs3: three members on 127.0.0.1:27031-27033, where transactions are real), as
// the ORM and @xufa/mongo suites find it (or XUFA_MONGO_RS_URL): started when it is not running, initiated the first
// time, and waited for until it has a primary. Its data is in .mongo-rs/ (git ignores it); `stop` ends the members.
//
//   node tools/mongo-rs.js            # start (MONGOD=<path of mongod> when it is not found)
//   node tools/mongo-rs.js stop
//   node tools/mongo-rs.js status
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const NAME = 'rs3';
const PORTS = [27031, 27032, 27033];
const HOST = '127.0.0.1';
const ROOT = path.join(import.meta.dirname, '..', '.mongo-rs');

// The mongod to run: MONGOD, the one in the PATH, or that of the usual installs.
function mongodPath() {
  if (process.env.MONGOD) return process.env.MONGOD;
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['mongod'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (found.trim()) return found.trim().split(/\r?\n/)[0];
  } catch {
    // Not in the PATH.
  }
  const roots = ['C:\\Program Files\\MongoDB\\Server', '/usr/local/opt', '/opt/homebrew/opt'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const version of fs.readdirSync(root).sort().reverse()) {
      for (const file of [path.join(root, version, 'bin', 'mongod.exe'), path.join(root, version, 'bin', 'mongod')]) {
        if (fs.existsSync(file)) return file;
      }
    }
  }
  return null;
}

const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, HOST);
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// The admin database of the first member, connected directly (before the set has a primary).
async function admin(fn) {
  const { MongoClient } = require('../packages/mongo/index.js'); // eslint-disable-line global-require
  const client = new MongoClient(`mongodb://${HOST}:${PORTS[0]}/admin?directConnection=true`);
  await client.connect();
  try {
    return await fn(client.db('admin'));
  } finally {
    await client.close();
  }
}

async function primary() {
  const status = await admin((db) => db.command({ replSetGetStatus: 1 })).catch(() => null);
  const found = status && (status.members || []).find((member) => member.stateStr === 'PRIMARY');
  return found ? found.name : null;
}

async function start() {
  const mongod = mongodPath();
  for (const port of PORTS) {
    if (await listening(port)) continue;
    if (!mongod) throw new Error('No mongod found: install MongoDB, or give its path in MONGOD');
    const dir = path.join(ROOT, String(port));
    fs.mkdirSync(dir, { recursive: true });
    const child = spawn(
      mongod,
      [
        '--replSet',
        NAME,
        '--port',
        String(port),
        '--bind_ip',
        HOST,
        '--dbpath',
        dir,
        '--logpath',
        path.join(dir, 'mongod.log'),
      ],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.unref();
    console.log(`started mongod on ${port}`);
  }
  for (let i = 0; i < 60 && !(await Promise.all(PORTS.map(listening))).every(Boolean); i += 1) await sleep(500);
  if (!(await primary())) {
    const members = PORTS.map((port, index) => ({ _id: index, host: `${HOST}:${port}` }));
    await admin((db) => db.command({ replSetInitiate: { _id: NAME, members } })).catch((err) => {
      // Initiated already (its members still electing).
      if (!/already initialized/i.test(err.message)) throw err;
    });
  }
  for (let i = 0; i < 60; i += 1) {
    const name = await primary();
    if (name) {
      console.log(
        `${NAME} is up: primary ${name} (mongodb://${PORTS.map((port) => `${HOST}:${port}`).join(',')}/?replicaSet=${NAME})`
      );
      return;
    }
    await sleep(1000);
  }
  throw new Error(`${NAME} has no primary after a minute (see ${ROOT}/*/mongod.log)`);
}

async function stop() {
  for (const port of PORTS) {
    if (!(await listening(port))) continue;
    const { MongoClient } = require('../packages/mongo/index.js'); // eslint-disable-line global-require
    const client = new MongoClient(`mongodb://${HOST}:${port}/admin?directConnection=true`);
    try {
      await client.connect();
      // The member closes the connection as it shuts down.
      await client
        .db('admin')
        .command({ shutdown: 1, force: true })
        .catch(() => {});
    } finally {
      await client.close().catch(() => {});
    }
    console.log(`stopped mongod on ${port}`);
  }
}

async function status() {
  const up = await Promise.all(PORTS.map(listening));
  PORTS.forEach((port, index) => console.log(`${port}: ${up[index] ? 'running' : 'not running'}`));
  if (up[0]) console.log(`primary: ${(await primary()) || 'none'}`);
}

const command = process.argv[2] || 'start';
const commands = { start, stop, status };
if (!commands[command]) {
  console.error(`node tools/mongo-rs.js [start|stop|status]: no command ${command}`);
  process.exit(1);
}
commands[command]().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
