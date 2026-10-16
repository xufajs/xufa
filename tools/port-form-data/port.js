// Ports form-data's tests (MIT) to packages/http/test/form-data/upstream: they check @xufa/http/form-data (its own
// implementation of form-data's API) as they check form-data. As form-data runs them (test/run.js), each test is a
// script run in a process of its own, after its static server starts: test/form-data/form-data.test.js runs them.
// - require(common.dir.lib + '/form_data') is @xufa/http/form-data; fake, formidable, mime-types, hasown and request
//   are test/form-data/support's; the fixtures are next to the tests, and the folder of uploads in the system's temp;
// - skipped, with the reason: test-boundary-prediction (it guesses V8's Math.random with js-randomness-predictor and
//   z3; the boundary of @xufa/http/form-data is of crypto, which test/xufa/form-data.test.js checks).
//
// node tools/port-form-data/port.js <form-data>  (a checkout of github.com/form-data/form-data at a tag)
import fs from 'node:fs';
import path from 'node:path';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node tools/port-form-data/port.js <form-data>');
  process.exit(1);
}
const TESTS = path.join(import.meta.dirname, '../../packages/http/test/form-data');
const UPSTREAM = path.join(TESTS, 'upstream');
const SUPPORTED = ['fake', 'formidable', 'mime-types', 'hasown', 'request'];
const SKIPPED = {
  'test-boundary-prediction.js': 'it guesses Math.random with js-randomness-predictor (z3); the boundary is of crypto',
};

// The file at its place: requires of form-data and of the libraries of the tests to ours, relative to it.
function port(code, name, target) {
  const from = path.dirname(target);
  const relative = (file) => {
    const link = path.relative(from, file).replace(/\\/g, '/');
    return link.startsWith('.') ? link : `./${link}`;
  };
  let out = code.replace(/\r\n/g, '\n');
  out = out.replace(
    /require\(common\.dir\.lib \+ '\/form_data'\)/g,
    `require('${relative(path.join(TESTS, '../../form-data.js'))}')`
  );
  out = out.replace(/require\('([^']+)'\)/g, (whole, id) =>
    SUPPORTED.includes(id) ? `require('${relative(path.join(TESTS, 'support', `${id}.js`))}')` : whole
  );
  if (name === 'common.js') {
    out = out.replace("fixture: path.join(rootDir, '/test/fixture')", "fixture: path.join(__dirname, 'fixture')");
    out = out.replace(
      "tmp: path.join(rootDir, '/test/tmp')",
      "tmp: path.join(require('os').tmpdir(), 'xufa-form-data')"
    );
  }
  return `// Ported from form-data's test/${name} (MIT License) by tools/port-form-data/port.js: do not edit, change the tool.\n${out}`;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
fs.mkdirSync(path.join(UPSTREAM, 'integration'), { recursive: true });
fs.mkdirSync(path.join(UPSTREAM, 'fixture'), { recursive: true });
const test = path.join(source, 'test');
for (const name of ['common.js', 'static.js']) {
  const target = path.join(UPSTREAM, name);
  fs.writeFileSync(target, port(fs.readFileSync(path.join(test, name), 'utf8'), name, target));
}
for (const name of fs.readdirSync(path.join(test, 'fixture'))) {
  fs.copyFileSync(path.join(test, 'fixture', name), path.join(UPSTREAM, 'fixture', name));
}
let count = 0;
for (const name of fs.readdirSync(path.join(test, 'integration'))) {
  if (!name.endsWith('.js') || SKIPPED[name]) continue;
  const target = path.join(UPSTREAM, 'integration', name);
  fs.writeFileSync(
    target,
    port(fs.readFileSync(path.join(test, 'integration', name), 'utf8'), `integration/${name}`, target)
  );
  count += 1;
}
fs.writeFileSync(path.join(UPSTREAM, 'skipped.json'), `${JSON.stringify(SKIPPED, null, 2)}\n`);
fs.copyFileSync(path.join(source, 'License'), path.join(TESTS, 'LICENSE.form-data'));
console.log(`port-form-data: ${count} tests of form-data in ${path.relative(process.cwd(), UPSTREAM)}`);
