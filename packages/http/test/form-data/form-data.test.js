// form-data's tests (upstream/integration, ported by tools/port-form-data) on @xufa/http/form-data, run as form-data
// runs them: each script in a process of its own, one after the other (they take the same ports), with the static
// server of their fixtures listening in this process (so the processes are started without blocking it); a test
// passes when its process ends well. The tests left out, and why, are in upstream/skipped.json.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const startStatic = require('./upstream/static.js');

const DIR = path.join(__dirname, 'upstream/integration');
const files = fs.readdirSync(DIR).filter((name) => /^test-.*\.js$/.test(name));

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: DIR, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => child.kill(), 30000);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, output });
    });
  });
}

describe("form-data's tests", () => {
  let server;

  beforeAll(async () => {
    server = await new Promise((resolve) => startStatic(resolve));
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  for (const name of files) {
    it(name, async () => {
      const { status, signal, output } = await run(path.join(DIR, name));
      if (status !== 0) throw new Error(`${name} ended with ${status ?? signal}\n${output}`);
    }, 40000);
  }
});
