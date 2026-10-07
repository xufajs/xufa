// Runs a benchmark of bench/ in the Linux of WSL, from Windows: Linux shows the cost of the frameworks better (its
// loopback is fast), and so do servers in production. The repository is copied to the home of that Linux (with
// Node.js for Linux of the version running this), the benchmark runs there, and its report comes back to
// bench/results.
//
// node tools/bench-linux/run.js [--distro Ubuntu] <script of bench/> [its options]
//   node tools/bench-linux/run.js inproc --rounds 5 --duration 2 --out results/inproc-linux-3
//   node tools/bench-linux/run.js run --duration 6 --warmup 2 --out results/full-linux-3
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

// A path of Windows as WSL mounts it: C:\work\xufa is /mnt/c/work/xufa.
function linuxPath(windowsPath) {
  const full = path.resolve(windowsPath);
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(full);
  if (!match) throw new Error(`${full} is not a path of a Windows drive`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

// A word for bash, quoted.
const quote = (word) => `'${String(word).replace(/'/g, `'\\''`)}'`;

function wsl(distro, command) {
  const result = spawnSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status;
}

function main() {
  const args = process.argv.slice(2);
  let distro = 'Ubuntu';
  if (args[0] === '--distro') {
    distro = args[1];
    args.splice(0, 2);
  }
  const [script, ...options] = args;
  if (process.platform !== 'win32') {
    throw new Error('This runs the benchmarks in WSL from Windows: on Linux, run them in bench/ as they are');
  }
  if (!script || !fs.existsSync(path.join(ROOT, 'bench', `${script.replace(/\.js$/, '')}.js`))) {
    throw new Error('Usage: node tools/bench-linux/run.js [--distro Ubuntu] <script of bench/> [its options]');
  }
  const version = process.version;
  const setup = `bash ${quote(`${linuxPath(__dirname)}/setup.sh`)} ${quote(linuxPath(ROOT))} ${quote(version)}`;
  if (wsl(distro, setup) !== 0) throw new Error('Making the copy of the repository in WSL failed');

  const run = [
    // Quoted: the PATH of WSL has the folders of Windows, with spaces and parentheses.
    `export PATH="$HOME/node-${version}/bin:$PATH"`,
    'cd ~/xufa/bench',
    `node ${quote(`${script.replace(/\.js$/, '')}.js`)} ${options.map(quote).join(' ')}`,
  ].join(' && ');
  const status = wsl(distro, run);
  if (status !== 0) throw new Error(`The benchmark failed in WSL (exit code ${status})`);

  // The report, back in bench/results.
  const outIndex = options.indexOf('--out');
  if (outIndex !== -1 && options[outIndex + 1]) {
    const out = options[outIndex + 1];
    const target = path.join(ROOT, 'bench', path.dirname(out));
    // One line: wsl.exe does not pass commands of several lines as they are.
    const from = `"$HOME/xufa/bench/"${quote(out)}`;
    wsl(distro, `cp ${from}.md ${from}.json ${quote(`${linuxPath(target)}/`)}`);
    if (!fs.existsSync(path.join(ROOT, 'bench', `${out}.md`))) throw new Error(`No report ${out}.md was made`);
    console.log(`bench-linux: the report is in bench/${out}.md`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`bench-linux: ${err.message}`);
    process.exitCode = 1;
  }
}

// For test.js: the same copy of the repository, to run the tests there.
module.exports = { ROOT, linuxPath, quote, wsl };
