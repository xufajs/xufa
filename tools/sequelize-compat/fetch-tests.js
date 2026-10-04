// Gets the tests of Sequelize 6 (test/ and .mocharc.jsonc of its v6 branch, at the commit below) into this folder.
//   node fetch-tests.js               from GitHub (git fetches that commit only)
//   node fetch-tests.js <clone>       from a local clone of sequelize (checked out at any commit: the files are read
//                                     from the pinned one)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const COMMIT = 'c8ba82b28d1ecf181ee889a8d53dec43949f69d9';
const REPOSITORY = 'https://github.com/sequelize/sequelize.git';

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

let source = process.argv[2] && path.resolve(process.argv[2]);
let temporary = null;
if (!source) {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sequelize-tests-'));
  source = temporary;
  git(source, 'init', '--quiet');
  git(source, 'remote', 'add', 'origin', REPOSITORY);
  console.log(`fetching ${REPOSITORY} ${COMMIT}`);
  git(source, 'fetch', '--quiet', '--depth', '1', 'origin', COMMIT);
}
try {
  const target = path.join(__dirname, 'test');
  fs.rmSync(target, { recursive: true, force: true });
  // The files of that commit written here, through an index of its own (the clone's index and files stay as they are).
  const index = path.join(os.tmpdir(), `sequelize-tests-${process.pid}.index`);
  execFileSync('git', ['--work-tree', __dirname, 'checkout', COMMIT, '--', 'test', '.mocharc.jsonc'], {
    cwd: source,
    env: { ...process.env, GIT_INDEX_FILE: index },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  fs.rmSync(index, { force: true });
  console.log(`tests of sequelize ${COMMIT.slice(0, 8)} in ${target}`);
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
