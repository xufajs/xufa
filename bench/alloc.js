'use strict';

// What linting (or formatting the JavaScript of) the repository allocates, by function: V8's sampling heap profiler
// (one sample in 4 KB), the objects collected since counted too, which is what the garbage collector spends on. One
// pass first, so that what is measured is a warm pass.
//
//   node bench/alloc.js [lint | format] [count]
const fs = require('fs');
const path = require('path');
const { Session } = require('inspector');
const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const what = process.argv[2] || 'lint';
(async () => {
  const { corpus, repositoryConfig } = require('./lint');
  const { ConfigArray, format } = require(LINT);
  const { lintText } = require(path.join(LINT, 'lib/engine'));
  const configs = new ConfigArray(await repositoryConfig(true), ROOT);
  let files, run;
  if (what === 'lint') {
    files = await corpus(true);
    run = async (t, f) => lintText(t, configs.configFor(f), f);
  } else {
    const { formattedFiles } = require(path.join(LINT, 'lib/format'));
    files = formattedFiles([ROOT], configs).filter((f) => /\.(c|m)?js$/.test(f));
    run = (t, f) => format(t, { singleQuote: true, trailingComma: 'es5', printWidth: 120, filepath: f });
  }
  const texts = files.map((f) => fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < files.length; i++) await run(texts[i], files[i]); // warm
  const s = new Session();
  s.connect();
  const post = (m, p) => new Promise((r, j) => s.post(m, p, (e, v) => (e ? j(e) : r(v))));
  await post('HeapProfiler.startSampling', {
    samplingInterval: 4096,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  for (let i = 0; i < files.length; i++) await run(texts[i], files[i]);
  const { profile } = await post('HeapProfiler.stopSampling');
  const self = new Map();
  let total = 0;
  const walk = (n) => {
    const cf = n.callFrame;
    const k =
      (cf.functionName || '(anon)') + ' ' + cf.url.replace(/.*packages\/lint\//, '') + ':' + (cf.lineNumber + 1);
    const size = n.selfSize;
    total += size;
    self.set(k, (self.get(k) || 0) + size);
    n.children.forEach(walk);
  };
  walk(profile.head);
  console.log(what, files.length, 'files; sampled allocations', (total / 1e6).toFixed(0), 'MB');
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, +process.argv[3] || 30))
    console.log((v / 1e6).toFixed(1).padStart(7), 'MB', k);
})();
