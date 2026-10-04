// Profiles the server of one framework on one scenario under load over the network: the .cpuprofile is written to
// the given directory.
// node profile.js <framework> <scenario> <dir> [seconds]
const { fork } = require('node:child_process');
const path = require('node:path');
const autocannon = require('autocannon');

const [framework, scenarioName, dir, seconds = '6'] = process.argv.slice(2);
const scenario = require(path.join(__dirname, 'scenarios', `${scenarioName}.js`));

const child = fork(path.join(__dirname, 'server.js'), [framework, scenarioName], {
  execArgv: ['--cpu-prof', `--cpu-prof-dir=${path.resolve(dir)}`],
});
child.once('message', ({ port }) => {
  const { request } = scenario;
  autocannon(
    {
      url: `http://127.0.0.1:${port}${request.path}`,
      method: request.method,
      headers: request.headers,
      body: request.body,
      connections: 100,
      pipelining: 10,
      duration: Number(seconds),
      workers: 4,
    },
    (err, result) => {
      if (err) throw err;
      process.stdout.write(`${framework} ${scenarioName}: ${Math.round(result.requests.average)} req/s\n`);
      child.send('exit');
    }
  );
});
