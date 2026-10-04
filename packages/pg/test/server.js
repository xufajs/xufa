// The PostgreSQL server of the integration tests: XUFA_PG_URL ('off' to skip them), or a local server with the role
// and database of the tests (postgres://xufa:xufa@127.0.0.1:5432/xufa_test). The tests that need it are skipped when
// they cannot log in (checked once, synchronously, so describe.skipIf can use it).
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const url = process.env.XUFA_PG_URL || 'postgres://xufa:xufa@127.0.0.1:5432/xufa_test';

function reachable() {
  if (url === 'off') return false;
  const script = [
    `const { Client } = require(${JSON.stringify(path.join(__dirname, '..'))});`,
    `const client = new Client(${JSON.stringify(url)});`,
    'client.connect().then(() => client.end()).then(() => process.exit(0), () => process.exit(1));',
  ].join('\n');
  return spawnSync(process.execPath, ['-e', script], { timeout: 5000 }).status === 0;
}

module.exports = { url, available: reachable() };
