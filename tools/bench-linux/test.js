/* eslint-disable no-console */
// Runs the tests of the packages in the Linux of WSL, from Windows, in the copy of the repository that the benchmarks
// use (~/xufa, its own node_modules: see setup.sh): what Linux does differently (watching folders, file systems,
// sockets) shows before a release. The services the tests find on Windows (PostgreSQL, MongoDB...) are not reachable
// from there: their tests are skipped, as without them.
//
// node tools/bench-linux/test.js [--distro Ubuntu] [package...]      (pnpm test:linux)
//   node tools/bench-linux/test.js                 every package with tests
//   node tools/bench-linux/test.js orm faults      those
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, linuxPath, quote, wsl } = require('./run');

function main() {
  const args = process.argv.slice(2);
  let distro = 'Ubuntu';
  if (args[0] === '--distro') {
    distro = args[1];
    args.splice(0, 2);
  }
  if (process.platform !== 'win32') {
    throw new Error('This runs the tests in WSL from Windows: on Linux, run them in each package as they are');
  }
  const all = fs
    .readdirSync(path.join(ROOT, 'packages'))
    .filter((name) => fs.existsSync(path.join(ROOT, 'packages', name, 'test')))
    .sort();
  const unknown = args.filter((name) => !all.includes(name));
  if (unknown.length) throw new Error(`No package with tests: ${unknown.join(', ')} (${all.join(', ')})`);
  const packages = args.length ? args : all;

  const version = process.version;
  const setup = `bash ${quote(`${linuxPath(__dirname)}/setup.sh`)} ${quote(linuxPath(ROOT))} ${quote(version)}`;
  if (wsl(distro, setup) !== 0) throw new Error('Making the copy of the repository in WSL failed');

  const tests = `bash ${quote(`${linuxPath(__dirname)}/test.sh`)} ${quote(version)} ${packages.map(quote).join(' ')}`;
  const status = wsl(distro, tests);
  if (status !== 0) throw new Error('Tests failed in Linux (above)');
  console.log(`test-linux: ${packages.length} packages passed in Linux`);
}

try {
  main();
} catch (err) {
  console.error(`test-linux: ${err.message}`);
  process.exitCode = 1;
}
