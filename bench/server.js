// Starts the server of one framework for one scenario, and tells the parent its port.
// node server.js <framework> <scenario>
const path = require('node:path');

const FRAMEWORKS = {
  xufa: () => require('@xufa/http'),
  fastify: () => require('fastify'),
};

async function main() {
  const [framework, scenarioName] = process.argv.slice(2);
  const scenario = require(path.join(__dirname, 'scenarios', `${scenarioName}.js`));
  let port;
  if (framework === 'node') {
    if (!scenario.node) throw new Error(`Scenario ${scenarioName} has no node:http version`);
    const server = scenario.node(require('node:http'));
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  } else {
    const load = FRAMEWORKS[framework];
    if (!load) throw new Error(`Unknown framework ${framework}`);
    const app = await scenario.build(load(), framework);
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = app.server.address().port;
  }
  // The parent measures the processor time the server spends: between "cpu-start" and "cpu-stop".
  let started = null;
  process.on('message', (message) => {
    if (message === 'cpu-start') {
      started = process.cpuUsage();
    } else if (message === 'cpu-stop') {
      const used = process.cpuUsage(started);
      process.send({ cpu: used.user + used.system });
    } else if (message === 'exit') {
      // A normal exit, so that a --cpu-prof profile is written.
      process.exit(0);
    }
  });
  process.send({ port });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
