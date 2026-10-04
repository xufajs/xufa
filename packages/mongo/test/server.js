// The MongoDB server of the integration tests: XUFA_MONGO_URL ('off' to skip them), or a local server. The tests
// that need it are skipped when it cannot be reached (checked once, synchronously, so describe.skipIf can use it).
const { spawnSync } = require('node:child_process');
const { parseUrl } = require('..');

const url = process.env.XUFA_MONGO_URL || 'mongodb://127.0.0.1:27017/xufa_test';

function reachable() {
  if (url === 'off') return false;
  const [{ host, port }] = parseUrl(url).hosts;
  const script = [
    `const socket = require('node:net').connect(${port}, ${JSON.stringify(host)});`,
    'socket.on("connect", () => process.exit(0)).on("error", () => process.exit(1));',
    'socket.setTimeout(1000, () => process.exit(1));',
  ].join('');
  return spawnSync(process.execPath, ['-e', script], { timeout: 3000 }).status === 0;
}

module.exports = { url, available: reachable() };
