// The sections of docs/benchmarks.html from the PostgreSQL driver to "Run them yourself": charts from the numbers of
// bench/results, with the tables under "All numbers". The rest of the page (the summary, the ORM, how they are
// measured, how to run them) is written by hand in the page.
import fs from 'node:fs';
import path from 'node:path';

const RESULTS = path.join(import.meta.dirname, '../../../bench/results/');
import * as logger from './logger-performance.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 1 : 0 });
};
const pct = (value, max) => `${Math.max(0.5, (value / max) * 100).toFixed(1)}%`;

// A row of a chart: kind 'us' (ours), 'interprets' (not a sandbox: hatched) or ''.
function row(name, value, max, kind = '', label = fmt(value)) {
  const cls = kind ? `chart-row ${kind}` : 'chart-row';
  return `<div class="${cls}"><span class="name">${name}</span><span class="track"><span class="fill" style="width: ${pct(value, max)}"></span></span><span class="value">${label}</span></div>`;
}

// A card of two (or three) bars and how many times ours is the other's.
function pair(title, rows, times, warn = false) {
  const max = Math.max(...rows.map((r) => r.value));
  // The badge: accent when xufa is ahead (by 5% or more), plain when even or behind.
  const level = times >= 1.05 ? 'times' : 'times even';
  const badge = times === null ? '' : `<span class="${level}">${times.toFixed(2)}&times;${warn ? ' ⚠' : ''}</span>`;
  return [
    '          <div class="pair">',
    `            <div class="head"><span>${title}</span>${badge}</div>`,
    ...rows.map((r) => `            ${row(r.name, r.value, max, r.kind, r.label)}`),
    '          </div>',
  ].join('\n');
}

// `attributes`: data-better="lower" (times, sizes) and data-compare="previous" (lib/outcomes.js).
function chart(title, subtitle, rows, attributes = '') {
  const max = Math.max(...rows.map((r) => r.value));
  return [
    `          <div class="chart"${attributes}>`,
    `            <h3>${title}</h3>`,
    `            <p class="subtitle">${subtitle}</p>`,
    ...rows.map((r) => `            ${row(r.name, r.value, max, r.kind, r.label)}`),
    '          </div>',
  ].join('\n');
}

const raw = (summary, html) =>
  `        <details class="raw">\n          <summary>${summary}</summary>\n${html}\n        </details>`;

// --- Data, from bench/results (postgres-7, mongo-8, inproc-3, full-3, expression-5, expression-programs-3,
// template-5, view-1).

const pg = [
  ['select $1, one at a time', 13895, 10837, 'ops/s', true],
  ['select by id, one at a time', 13042, 7702, 'ops/s', true],
  ['insert one row, one at a time', 6612, 5039, 'ops/s', true],
  ['select $1, 64 at once', 151905, 29847, 'ops/s', true],
  ['select by id, 64 at once', 116172, 24623, 'ops/s', true],
  ['encode 64 params of 8 types', 11885, 5100, 'ops/s', true],
  ['decode 1000 rows of 8 types', 563294, 285982, 'rows/s', true],
  ['text of 1 MB, sent and read', 230, 156, 'ops/s', true],
  ['bytea of 1 MB, sent and read', 215, 95, 'ops/s', true],
  ['insert 1000 rows per statement', 122182, 62787, 'rows/s', true],
  ['copy rows (50k)', 216846, 112657, 'rows/s', true],
  ['select all rows (50k)', 512305, 249052, 'rows/s', true],
];
const pgServer = [
  ['aggregate group by (10k rows)', 340, 289, 'ops/s', true],
  ['update many (5k of 10k rows)', 72, 66, 'ops/s', true],
];
const mongo = [
  ['BSON serialize', 1221242, 671890, 'docs/s', false],
  ['BSON deserialize', 1200957, 526476, 'docs/s', false],
  ['insertOne, one at a time', 9583, 5721, 'ops/s', true],
  ['findOne by _id, one at a time', 9438, 5293, 'ops/s', true],
  ['findOne by _id, 64 at once', 51877, 12794, 'ops/s', false],
  ['insertMany, 1000 per batch', 225780, 179204, 'docs/s', true],
  ['insertMany, 50k in one call, ordered', 214502, 141729, 'docs/s', true],
  ['insertMany, 50k in one call, unordered', 524144, 143933, 'docs/s', false],
  ['find toArray, all docs', 550008, 263292, 'docs/s', true],
  ['aggregate $group (server-bound)', 106, 109, 'ops/s', true],
  ['updateMany $inc (server-bound)', 15, 15, 'ops/s', true],
];
// [scenario, xufa, fastify, node | null] requests a second.
// HTTP, from the reports of bench/inproc.js and bench/run.js: [scenario, xufa, fastify, node:http or null, noisy],
// best ratio first. Noisy: the rounds of xufa or fastify more than 10% apart, as the reports mark them.
// Linux (the charts) and Windows (a table), on the same machine.
const INPROC = 'inproc-linux-2';
const LOOPBACK = 'full-linux-2';
const INPROC_WINDOWS = 'inproc-7';
const LOOPBACK_WINDOWS = 'full-6';
function httpResults(report, spreadOf) {
  const { results } = JSON.parse(fs.readFileSync(RESULTS + report + '.json', 'utf8'));
  return results
    .map(({ name, summary }) => [
      name,
      summary.xufa.rps,
      summary.fastify.rps,
      summary.node ? summary.node.rps : null,
      spreadOf(summary.xufa) > 0.1 || spreadOf(summary.fastify) > 0.1,
    ])
    .sort((x, y) => y[1] / y[2] - x[1] / x[2]);
}
const spreadOfTimes = (s) => {
  const times = s.rounds.map((r) => r.cpuPerReq);
  return (Math.max(...times) - Math.min(...times)) / Math.min(...times);
};
const inproc = httpResults(INPROC, spreadOfTimes);
const loopback = httpResults(LOOPBACK, (s) => (s.max - s.min) / s.rps);
const inprocWindows = httpResults(INPROC_WINDOWS, spreadOfTimes);
const loopbackWindows = httpResults(LOOPBACK_WINDOWS, (s) => (s.max - s.min) / s.rps);

// The ratios of a run, as cells of a table: xufa / fastify, ⚠ for noisy rounds.
const ratioCell = (row) => {
  if (!row) return '<td>-</td>';
  const r = row[1] / row[2];
  return `<td>${r >= 1.1 ? '<strong>' : ''}${r.toFixed(2)}&times;${r >= 1.1 ? '</strong>' : ''}${row[4] ? ' ⚠' : ''}</td>`;
};
const ratioTable = (inprocRows, loopbackRows) =>
  [
    '          <div class="table-wrap">',
    '            <table class="numbers">',
    '              <thead><tr><th>Scenario</th><th>In the process: xufa / fastify</th><th>Over the loopback: xufa / fastify</th></tr></thead>',
    '              <tbody>',
    ...inprocRows.map(
      (row) =>
        `                <tr><td>${row[0]}</td>${ratioCell(row)}${ratioCell(loopbackRows.find((item) => item[0] === row[0]))}</tr>`
    ),
    '              </tbody>',
    '            </table>',
    '          </div>',
  ].join('\n');

// What the HTTP numbers say, from them.
function httpNotes() {
  const times = (row) => row[1] / row[2];
  const x = (n) => `${n.toFixed(2)}&times;`;
  const find = (list, name) => list.find((row) => row[0] === name);
  // Behind: by more than 1%, as even is within the noise.
  const behind = inproc.filter((row) => times(row) < 0.99);
  const special = ['big-json', 'post-validate'];
  const rest = inproc.filter((row) => !special.includes(row[0]) && times(row) >= 0.99).map(times);
  const hello = find(inproc, 'hello');
  const behindText =
    behind.length === 0
      ? 'in every scenario'
      : `in every scenario but ${behind.map((row) => `<code>${row[0]}</code> (${x(times(row))})`).join(' and ')}${
          behind.some((row) => row[0] === 'error')
            ? ', where both spend most of the time making the stack trace of the error'
            : ''
        }`;
  const loopTimes = loopback.filter((row) => !row[4]).map(times);
  const noisy = loopback.filter((row) => row[4]).length;
  const vsNode = hello[1] / hello[3];
  let nodeText;
  if (vsNode >= 1.02) nodeText = `faster than <code>node:http</code> answering by hand (${x(vsNode)} on hello)`;
  else if (vsNode >= 0.98) nodeText = 'level with <code>node:http</code> answering by hand on hello';
  else nodeText = `at ${Math.round(vsNode * 100)}% of <code>node:http</code> answering by hand`;
  return `          In the process, xufa is ahead ${behindText}: ${x(times(find(inproc, 'big-json')))} on large JSON responses
          (written as bytes), ${x(times(find(inproc, 'post-validate')))} on bodies parsed and validated, and from
          ${x(Math.min(...rest))} to ${x(Math.max(...rest))} on the rest, ${nodeText}: xufa writes the head of most
          responses itself (<code>fastHead</code>), where Node.js checks and assembles every header. Over the loopback, the
          socket and the HTTP parser of Node.js are a part of each response that is the same for both, so the frameworks
          come closer: from ${x(Math.min(...loopTimes))} to ${x(Math.max(...loopTimes))} where the rounds agree${
            noisy ? ` (${noisy} scenarios marked ⚠, their rounds more than 10% apart)` : ''
          }.`;
}
// OpenAPI routes, from bench/run.js (the scenarios openapi-*): the routes of openapi.operations of @xufa/openapi on
// @xufa/http and on fastify, over the loopback on Linux. [scenario, title, xufa, fastify, noisy].
// Two runs of the same scenarios: the median of their rounds together (10 for each server), as one run on a shared
// machine varies more.
const OPENAPI = ['openapi-linux-1', 'openapi-linux-2'];
const OPENAPI_TITLES = {
  'openapi-get': 'A book by id (path and query validated)',
  'openapi-list': 'A list of 20 books',
  'openapi-list-validated': 'A list of 20 books, its reply validated',
  'openapi-post': 'A create (its body validated)',
  'openapi-post-validated': 'A create, its body and its reply validated',
  'openapi-invalid': 'An id the document refuses (400)',
};
function openapiResults() {
  const reports = OPENAPI.map((report) => JSON.parse(fs.readFileSync(RESULTS + report + '.json', 'utf8')).results);
  const median = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  // The rounds of a framework in every report, its median and whether they are more than 10% apart.
  const of = (name, framework) => {
    const rounds = reports.flatMap((results) =>
      results.find((item) => item.name === name).summary[framework].runs.map((run) => run.rps)
    );
    const rps = median(rounds);
    return { rps, noisy: (Math.max(...rounds) - Math.min(...rounds)) / rps > 0.1 };
  };
  return reports[0].map(({ name }) => {
    const ours = of(name, 'xufa');
    const theirs = of(name, 'fastify');
    return [name, OPENAPI_TITLES[name] || name, ours.rps, theirs.rps, ours.noisy || theirs.noisy];
  });
}

// The section of @xufa/schema (its results are in bench/results/schema, its pages written by bench/schema/report.js).
function schemaSection() {
  return require('../../../bench/schema/report.js').section(); // eslint-disable-line global-require
}

function openapiSection() {
  const rows = openapiResults();
  const find = (name) => rows.find((item) => item[0] === name);
  const x = (n) => `${n.toFixed(2)}&times;`;
  const ratios = rows.map((item) => item[2] / item[3]);
  const noisy = rows.filter((item) => item[4]).length;
  // The cost of validating replies: the requests a second lost, on each framework.
  const cost = (plain, validated, index) => 1 - find(validated)[index] / find(plain)[index];
  // Within what the rounds vary (under 3%, or less work validated): none measurable.
  const percent = (n) => (n < 0.03 ? 'none measurable' : `${Math.round(n * 100)}%`);
  const costs = [
    [
      'A list of 20 books',
      cost('openapi-list', 'openapi-list-validated', 2),
      cost('openapi-list', 'openapi-list-validated', 3),
    ],
    ['A create', cost('openapi-post', 'openapi-post-validated', 2), cost('openapi-post', 'openapi-post-validated', 3)],
  ];
  return `        <h2 id="openapi">OpenAPI routes</h2>
        <p>
          The routes of an OpenAPI 3 document, made by <code>openapi.operations</code> of <code>@xufa/openapi</code>: the
          same layer on <code>@xufa/http</code> and on fastify 5, the same document and handlers. Requests a second over
          the loopback on Linux (autocannon, 100 connections, pipelining 10), more is better; each server runs in a
          process of its own; the median of 10 rounds (two runs of 5).
        </p>
        <div class="pairs">
${rows
  .map(([, title, ours, fastify, warn]) =>
    pair(
      title,
      [
        { name: 'xufa', value: ours, kind: 'us', label: fmt(ours) },
        { name: 'fastify', value: fastify, label: fmt(fastify) },
      ],
      ours / fastify,
      warn
    )
  )
  .join('\n')}
        </div>
        <p>
          On <code>@xufa/http</code>, the routes of the document answer from ${x(Math.min(...ratios))} to
          ${x(Math.max(...ratios))} the requests of the same routes on fastify${
            noisy
              ? ` (${noisy} of ${rows.length} marked ⚠: their rounds more than 10% apart, so read them as approximate)`
              : ''
          }. Validating the
          replies against the document too (<code>validateResponses</code>) costs what the table says: each reply is
          checked as plain data before it is serialized (the larger the reply, the more), and the validators are made on
          the first request of each route, not before (which slows a whole process: see
          <a href="benchmarks.html#how">How they are measured</a>).
        </p>
        <div class="table-wrap">
          <table class="numbers">
            <thead><tr><th>Replies validated</th><th>Requests a second lost, xufa</th><th>Requests a second lost, fastify</th></tr></thead>
            <tbody>
${costs.map(([name, ours, theirs]) => `              <tr><td>${name}</td><td>${percent(ours)}</td><td>${percent(theirs)}</td></tr>`).join('\n')}
            </tbody>
          </table>
        </div>
${OPENAPI.map((report) => rawTable(`${report}.md`)).join('\n')}
`;
}

// Expressions: [expression, xufa, jexl, expr-eval, filtrex, sandboxjs, new Function] (runs a second, compiled once).
const expressions = [
  ['a + b * 2', 138.38e6, 1.09e6, 5.49e6, 18.28e6, 235.7e3, 391.67e6],
  ['user.address.city', 140.03e6, 2.65e6, 16.71e6, 15.37e6, 263.5e3, 502.06e6],
  ["a &gt; 2 &amp;&amp; b == 4 ? 'big' : 'small'", 131.47e6, 752.0e3, 2.2e6, 14.18e6, 204.7e3, 413.9e6],
  ['user.name.toUpperCase()', 25.91e6, null, null, null, 208.5e3, 29.33e6],
  ['items.map(i =&gt; i.price * i.quantity).reduce(...)', 37.39e6, null, null, null, 43.8e3, 52.35e6],
  ['`${user.name} lives in ${user.address.city}`', 49.79e6, null, null, null, 156.4e3, 60.6e6],
];
const expressionsOnce = [
  ['a + b * 2', 706.4e3, 84.1e3, 656.5e3, 105.6e3, 4.6e3, 1.58e6],
  ['user.address.city', 734.3e3, 94.7e3, 251.6e3, 112.5e3, 4.5e3, 1.48e6],
  ['map and reduce', 178.7e3, null, null, null, 3.1e3, 1.22e6],
];
// Programs (statements: true): [case, xufa, SandboxJS, node:vm, new Function] (runs a second), compiled once and run,
// and compiled and run each time (bench/results/expression-programs-3).
const programs = [
  ['if / else if', 44.45e6, 106.9e3, 44.04e6, 51.47e6],
  ['switch', 133.93e6, 144.4e3, 145.57e6, 373.06e6],
  ['for...of (4 turns)', 65.52e6, 30.3e3, 16.25e6, 112.7e6],
  ['for (100 turns)', 7.95e6, 3.8e3, 16.08e6, 17.29e6],
  ['function and while', 42.29e6, 34.8e3, 67.54e6, 87.73e6],
  ['object built', 4.36e6, 31.2e3, 5.67e6, 7.26e6],
  ['try / throw', 234.2e3, 43.5e3, 232.5e3, 198.0e3],
];
const programsEach = [
  ['if / else if', 120.2e3, 2.8e3, 736.8e3, 1.16e6],
  ['switch', 142.3e3, 3.1e3, 751.9e3, 1.18e6],
  ['for...of (4 turns)', 136.6e3, 2.7e3, 600.8e3, 1.25e6],
  ['for (100 turns)', 97.5e3, 1.7e3, 490.8e3, 1.23e6],
  ['function and while', 98.3e3, 2.6e3, 587.0e3, 1.15e6],
  ['object built', 125.9e3, 2.7e3, 490.9e3, 1.03e6],
  ['try / throw', 76.3e3, 2.7e3, 218.5e3, 168.2e3],
];
const PROGRAM_ENGINES = [
  ['@xufa/expression', 'us'],
  ['SandboxJS', ''],
];
// A chart of a program: xufa against SandboxJS; node:vm and new Function (no sandbox) told in its subtitle.
const programChart = (title, [name, ...values]) =>
  chart(
    `<code>${name}</code>${title}`,
    `Runs a second. Without a sandbox: node:vm ${fmt(values[2])}, new Function ${fmt(values[3])}.`,
    values.slice(0, 2).map((value, i) => ({ name: PROGRAM_ENGINES[i][0], value, kind: PROGRAM_ENGINES[i][1] }))
  );
const ENGINES = [
  ['@xufa/expression', 'us'],
  ['jexl', ''],
  ['expr-eval', ''],
  ['filtrex', ''],
  ['SandboxJS', ''],
  ['new Function', 'interprets'],
];
// Templates: [case, xufa, handlebars, mustache, nunjucks, eta, ejs] (renders a second).
const templates = [
  ['One line, compiled once', 14.07e6, 1.41e6, 1.65e6, 2.15e6, 11.59e6, 850.5e3],
  ['A list of 20 (each, if), compiled once', 239.7e3, 68.8e3, 73.6e3, 40.2e3, 113.9e3, 46.0e3],
  ['One line, compiled each time', 667.5e3, 18.6e3, 203.8e3, 56.1e3, 176.4e3, 87.2e3],
  ['A list of 20, compiled each time', 97.7e3, 5.7e3, 49.6e3, 12.8e3, 57.3e3, 24.9e3],
];
const TEMPLATE_ENGINES = [
  ['@xufa/template', 'us'],
  ['Handlebars', ''],
  ['Mustache', ''],
  ['Nunjucks', ''],
  ['Eta', 'interprets'],
  ['EJS', 'interprets'],
];
// Large pages: [rows, MB, whole first, whole total, whole memory, stream first, stream total, stream memory].
const views = [
  [10000, 0.9, 8.0, 9.2, 2, 2.2, 8.5, 1],
  [50000, 4.8, 52.1, 57.5, 10, 2.4, 35.9, 2],
  [200000, 19.6, 264.9, 286.4, 40, 2.3, 127.4, 3],
];

// --- Sections.

// The scenarios of the HTTP benchmarks: [name, what it does], from bench/scenarios.
function scenarios() {
  const dir = path.join(import.meta.dirname, '../../../bench/scenarios');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js') && !file.startsWith('openapi-'))
    .map((file) => [file.slice(0, -3), require(path.join(dir, file)).description]); // eslint-disable-line global-require
}

// HTTP: @xufa/http against fastify and node:http, and the OpenAPI routes (benchmarks.html, and the page of benchmarks of
// @xufa/http with the scenarios explained: `scenarios: true`).
function httpSection({ scenarios: explained = false } = {}) {
  const list = explained
    ? `        <h3 id="scenarios">The scenarios</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Scenario</th><th>What each request does</th></tr></thead>
            <tbody>
${scenarios()
  .map(([name, description]) => `              <tr><td><code>${esc(name)}</code></td><td>${esc(description)}</td></tr>`)
  .join('\n')}
            </tbody>
          </table>
        </div>
`
    : '';
  return `        <h2 id="http">HTTP</h2>
        <p>
          <code>@xufa/http</code> against fastify 5.12.5 and <code>node:http</code> (where it can answer the same), in
          requests a second (more is better), on Linux (Ubuntu 26.04 on WSL2, on the same machine; Windows below). In the
          process, without sockets, the numbers are the cost of the framework alone; over the loopback (autocannon, 100
          connections, pipelining 10), the socket and Node.js's HTTP parser are part of the cost of every response.
        </p>
${list}        <h3>In the process: the cost of the framework</h3>
        <div class="pairs">
${inproc
  .map(([name, ours, fastify, node, warn]) =>
    pair(
      name,
      [
        { name: 'xufa', value: ours, kind: 'us', label: fmt(ours) },
        { name: 'fastify', value: fastify, label: fmt(fastify) },
        ...(node ? [{ name: 'node:http', value: node, label: fmt(node) }] : []),
      ],
      ours / fastify,
      warn
    )
  )
  .join('\n')}
        </div>
        <h3>Over the loopback</h3>
        <div class="pairs">
${loopback
  .map(([name, ours, fastify, node, warn]) =>
    pair(
      name,
      [
        { name: 'xufa', value: ours, kind: 'us', label: fmt(ours) },
        { name: 'fastify', value: fastify, label: fmt(fastify) },
        ...(node ? [{ name: 'node:http', value: node, label: fmt(node) }] : []),
      ],
      ours / fastify,
      warn
    )
  )
  .join('\n')}
        </div>
        <p>
${httpNotes()}
        </p>
${raw(`All numbers on Linux (bench/results/${INPROC}.md; over the loopback, ${LOOPBACK}.md)`, ratioTable(inproc, loopback))}
        <h3>On Windows</h3>
        <p>
          The same runs on Windows 11, on the same machine (<code>bench/results/${INPROC_WINDOWS}.md</code> and
          <code>${LOOPBACK_WINDOWS}.md</code>). Its loopback is slower, so the socket is most of the cost of a small
          response there, and the frameworks come closer.
        </p>
${ratioTable(inprocWindows, loopbackWindows)}

${openapiSection()}`;
}

const twoWayTable = (head, other, list) =>
  [
    '          <div class="table-wrap">',
    '            <table class="numbers">',
    `              <thead><tr><th>${head}</th><th>xufa</th><th>${other}</th><th>xufa / ${other}</th></tr></thead>`,
    '              <tbody>',
    ...list.map(
      ([name, ours, theirs, unit, warn]) =>
        `                <tr><td>${name}</td><td>${ours.toLocaleString('en-US')} ${unit}</td><td>${theirs.toLocaleString('en-US')} ${unit}</td><td>${ours / theirs >= 1.1 ? '<strong>' : ''}${(ours / theirs).toFixed(2)}&times;${ours / theirs >= 1.1 ? '</strong>' : ''}${warn ? ' ⚠' : ''}</td></tr>`
    ),
    '              </tbody>',
    '            </table>',
    '          </div>',
  ].join('\n');

const pairsOf = (list, ourName, otherName) =>
  [
    '        <div class="pairs">',
    ...list.map(([name, ours, theirs, , warn]) =>
      pair(
        name,
        [
          { name: ourName, value: ours, kind: 'us', label: fmt(ours) },
          { name: otherName, value: theirs, label: fmt(theirs) },
        ],
        ours / theirs,
        warn
      )
    ),
    '        </div>',
  ].join('\n');

// --- The parts of @xufa/http: router-2, logger-2, serializer-1; and jwt-2 (markdown tables of bench/micro).
function table(file) {
  const lines = fs
    .readFileSync(RESULTS + file, 'utf8')
    .trim()
    .split('\n');
  const num = (cell) => {
    const n = Number(cell.replace(/,/g, '').replace(/[MKx]$/, ''));
    if (cell.endsWith('M')) return n * 1e6;
    if (cell.endsWith('K')) return n * 1e3;
    return n;
  };
  return lines.slice(2).map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    return [cells[0], ...cells.slice(1).map(num)];
  });
}
const rawTable = (file) =>
  raw(
    `All numbers (bench/results/${file})`,
    `          <pre><code>${esc(fs.readFileSync(RESULTS + file, 'utf8').trim())}</code></pre>`
  );

const routerLabels = {
  'static /': 'the root (/)',
  'static deep': 'a deep static path',
  'one param': 'one parameter',
  'two params': 'two parameters',
  wildcard: 'a wildcard',
  'multi param': 'two parameters in a segment',
  'regex param': 'a regular expression',
  'with query': 'with a query string',
  'encoded param': 'an encoded parameter',
  'not found': 'not found',
};
// [case, find-my-way find, xufa find, xufa match]
const router = table('router-2.md');
const loggerRows = table(logger.REPORT); // [case, pino, xufa, times]
const serializer = table('serializer-1.md'); // [case, JSON.stringify, fjs, xufa]
const jwt = table('jwt-2.md'); // [case, jsonwebtoken (NaN: it has no EdDSA), xufa, times]
// [case, xufa, xufa + bufferutil, ws, ws + bufferutil, times without bufferutil, times with it]
const websocket = table('websocket-4.md');
const websocketLabels = {
  'text 64 B': 'text, 64 B',
  'text 16 KB': 'text, 16 KB',
  'binary 16 KB': 'binary, 16 KB',
  'binary 1 MB': 'binary, 1 MB',
  'text 16 KB, deflate': 'text, 16 KB, deflate',
  'binary 1 MB, fragments': 'binary, 1 MB in 16 fragments',
  'binary 256 KB, deflate': 'binary, 256 KB, deflate',
};
// xufa without bufferutil against ws with it: what is left to a native module.
const jsAgainstNative = websocket.map(([, xufa, , , native]) => xufa / native);
const websocketPairs = (column) =>
  websocket
    .map((r) =>
      pair(
        websocketLabels[r[0]] || r[0],
        [
          { name: '@xufa/websocket', value: r[column], kind: 'us', label: fmt(r[column]) },
          { name: 'ws', value: r[column + 2], label: fmt(r[column + 2]) },
        ],
        r[column + 4]
      )
    )
    .join('\n');

// Express apps: @xufa/express against Express 5.2.1 on the same app (bench/express.js, run express-6, Windows):
// [scenario, @xufa/express, Express] requests a second, the ratio the median of the rounds' pairs.
const EXPRESS_RUN = 'express-6';
const EXPRESS_LABELS = {
  hello: 'Hello (text)',
  json: 'Small JSON',
  params: 'Two params',
  query: 'Query string',
  body: 'JSON body (1 KB)',
  middleware: 'Ten middlewares first',
  'large-first': 'Large app, first router',
  'large-last': 'Large app, 40th router',
  nested: 'Router in a router',
  'big-json': '200 objects as JSON',
  static: 'Static file',
  'not-found': 'Not found (404)',
  error: 'Thrown error (500)',
};
const expressRows = JSON.parse(fs.readFileSync(`${RESULTS}${EXPRESS_RUN}.json`, 'utf8')).rows;
const expressSection = `        <h2 id="express">Express apps</h2>
        <p>
          <code>@xufa/express</code> (Express 5's API, written anew, Express's own 1,238 tests passing) against Express
          5.2.1, on the same app: a route for each case, ten middlewares, a router in a router, and a large app of 40
          routers of 10 routes mounted on <code>/api</code>. Requests a second over the loopback on Windows (more is better),
          each case on one and the other in turn; the badge is the median of five rounds' pairs (run ${EXPRESS_RUN}). The
          same code on both sides reads 0.92 to 1.07 here, the noise of the machine.
        </p>
        <p class="legend"><span class="us">@xufa/express</span><span>Express 5.2.1</span></p>
        <div class="pairs">
${expressRows
  .map((r) =>
    pair(
      EXPRESS_LABELS[r.scenario] || r.scenario,
      [
        { name: '@xufa/express', value: r['@xufa/express'], kind: 'us' },
        { name: 'Express', value: r['Express 5'] },
      ],
      r.ratio
    )
  )
  .join('\n')}
        </div>
        <p>
          Profiled under load, a small request over the loopback costs the server about 30 µs of processor on Windows and 15
          µs on Linux (Ubuntu in WSL 2, the same laptop): the write of the response to the socket is 15 to 22 µs of it on
          Windows (its loopback runs the whole TCP stack in that system call) and 4 to 11 µs on Linux; Node.js's HTTP is 5 to
          7 µs on both, and @xufa/express's own code 1.5 to 4 µs. Its router tries only the layers a request can meet (found
          with @xufa/router first), so the 40th router of the large app costs what the first does, where Express walks every
          layer before it. Params are objects V8 keeps fast (not <code>Object.create(null)</code>), the types of
          <code>res.type()</code> and the ETag of the last text sent are kept, and <code>req.fresh</code> reads no response
          header for a request that is not conditional.
        </p>
`;

// The rows of a table of bench/lib/versus.js: [case, theirs, ours, times] (n/a as NaN).
function versusRows(file) {
  const number = (text) => Number(text.replace(/,/g, ''));
  return fs
    .readFileSync(RESULTS + file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Case') && !line.startsWith('| ---'))
    .map((line) => {
      const [name, theirs, ours, times] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return [name, number(theirs), number(ours), Number(times.replace('x', ''))];
    });
}

// Libraries of npm that xufa's own code replaced (bench/micro, each with bench/lib/versus.js): what each measures, and
// what makes the difference.
const REPLACED = [
  {
    id: 'replaced-multer',
    title: 'Uploads: @xufa/http/multer against multer',
    file: 'multer-2.md',
    more: ['multer-1.md'],
    ours: '@xufa/http/multer',
    theirs: 'multer 2.1.1',
    text: `Uploads of multipart/form-data over the loopback to a server of the same process (memoryStorage,
          <code>.single()</code>, 8 at a time, the body sent in chunks of 64 KiB), and the parsers alone on a body of 5 MB:
          busboy 1.6.0, multer's, against @xufa/http's. The parser scans each chunk where it is, keeps only a tail that
          really begins a boundary, and looks characters up in a table instead of a regular expression: 2.0 to 2.3
          times as fast in every run. Over HTTP the socket takes most of the time of an upload, and the client and the
          server share the process, so the runs differ: the one before this (results/multer-1) read 1.44&times; for 1 KB
          and 0.94&times; for 100 KB.`,
  },
  {
    id: 'replaced-xlsx',
    title: 'Excel workbooks: @xufa/xlsx against exceljs',
    file: 'xlsx-1.md',
    ours: '@xufa/xlsx',
    theirs: 'exceljs 4.4.0',
    text: `A catalog of 2 sheets of 2,500 rows and 8 columns (texts, numbers, dates; a bold header with a fill and borders,
          a merged title, widths) written to a .xlsx, and read back to its values. @xufa/xlsx writes the XML of the
          sheets as text and zips it with node:zlib; exceljs builds an object for every cell, row and style first.`,
  },
  {
    id: 'replaced-form-data',
    title: 'Forms sent: @xufa/http/form-data against form-data',
    file: 'form-data-1.md',
    ours: '@xufa/http/form-data',
    theirs: 'form-data 4.0.5',
    text: `A form of 10 text fields and a file of 64 KB from a Buffer, and the same with a file of 1 MB read from the disk:
          built, its length counted and streamed to its end. The same work: even, as it should be (it was written for
          its API, its 27 tests and its types of files, not for speed).`,
  },
  {
    id: 'replaced-purify',
    title: 'Sanitizing HTML: @xufa/purify against DOMPurify on jsdom',
    file: 'purify-1.md',
    ours: '@xufa/purify',
    theirs: 'DOMPurify 3.3.3 + jsdom 27.4.0',
    text: `DOMPurify needs a DOM, and in Node.js that is jsdom. @xufa/purify is DOMPurify's own code (its tests pass) on the
          DOM of @xufa/html: parse5's parser and the parts of the DOM standard DOMPurify reads, no more. With a
          configuration that keeps the text only: the first call (loaded, a window made, one text sanitized: ms, less
          is better), and calls a second on texts of 60 characters, 1 KB and 10 KB. jsdom also slows down as it works:
          its calls take longer and its heap grows over thousands of them; @xufa/purify keeps its time and memory.`,
  },
  {
    id: 'replaced-axios',
    title: 'HTTP calls: @xufa/client/axios against axios',
    file: 'axios-1.md',
    ours: '@xufa/client/axios',
    theirs: 'axios 1.14.0',
    text: `The work of the library alone (an instance with a base URL, a header and two interceptors, and an adapter that
          answers at once: the config merged, the headers, the transforms), GETs over the loopback (keep-alive, 8 at a
          time, 2 KB of JSON), where the socket is most of the time, and loading it (ms, less is better): it has no
          dependencies, axios loads follow-redirects, form-data and proxy-from-env.`,
  },
  {
    id: 'replaced-helmet',
    title: 'Security headers: @xufa/http/helmet against helmet',
    file: 'helmet-1.md',
    ours: '@xufa/http/helmet',
    theirs: 'helmet 8.3.0',
    text: `The middleware on a response (node:http's, no network): its defaults, a policy of its own, and a policy with a
          nonce made for each request. Headers known when it is made are set in one loop instead of a chain of 13
          middlewares; with a nonce, only the directive that has it is computed for each request (helmet writes all of
          them again). Node.js's checks of each header in <code>setHeader</code> are most of the time of both.`,
  },
  {
    id: 'replaced-compression',
    title: 'Compressed answers: @xufa/http/compression against compression',
    file: 'compression-1.md',
    ours: '@xufa/http/compression',
    theirs: 'compression 1.8.2',
    text: `The work of the middleware for one response, on a response whose socket drops what it is given: JSON of 3 KB
          compressed with brotli and with gzip (zlib is most of it, the same on both), an answer under the threshold,
          and a request that accepts no encoding. Under the threshold it is faster: it keeps what the filter said of each
          type of content, and sets Vary at once when the response has none.`,
  },
];

function replacedSection() {
  const parts = REPLACED.map(({ id, title, file, more = [], ours, theirs, text }) => {
    const cards = versusRows(file).map(([name, theirsValue, oursValue, times]) => {
      const lower = /\(ms\)$/.test(name);
      const label = (value) => (lower ? `${fmt(value)} ms` : fmt(value));
      return pair(
        esc(name),
        [
          { name: ours, value: oursValue, kind: 'us', label: label(oursValue) },
          { name: theirs, value: theirsValue, label: label(theirsValue) },
        ],
        Number.isNaN(times) ? null : times
      );
    });
    return `        <h3 id="${id}">${title}</h3>
        <p>
          ${text}
        </p>
        <div class="pairs">
${cards.join('\n')}
        </div>
${[file, ...more].map((name) => rawTable(name)).join('\n')}`;
  });
  return `        <h2 id="replaced">Packages replaced</h2>
        <p>
          Libraries of npm that xufa's packages replace, with the same API, each measured against the one it replaces
          (<code>bench/micro</code>): each library and case in a process of its own, the libraries taking
          turns, the best of 5 rounds, on the P-cores of the laptop. A badge is the times xufa's is as fast; in the cases
          in ms (less is better), it is the other's time over xufa's.
        </p>
${parts.join('\n\n')}
`;
}

const partsSections = `${expressSection}
        <h2 id="router">Router</h2>
        <p>
          <code>@xufa/router</code> against find-my-way 9.9.0 on the routes of a typical API (10 resources, 74 routes),
          in routes found a second (more is better): <code>match()</code>, what xufa calls for every request, and
          <code>find()</code>, find-my-way's API, which parses the query string as find-my-way's does. Each router and case
          runs in a process of its own; best of 5 rounds.
        </p>
        <p class="legend"><span class="us">@xufa/router</span><span>find-my-way</span></p>
        <div class="pairs">
${router
  .map(([name, fmw, find, match, , matchTimes]) =>
    pair(
      routerLabels[name] || name,
      [
        { name: 'match()', value: match, kind: 'us', label: fmt(match) },
        { name: 'find()', value: find, kind: 'us', label: fmt(find) },
        { name: 'find-my-way', value: fmw, label: fmt(fmw) },
      ],
      matchTimes
    )
  )
  .join('\n')}
        </div>
        <p>
          The badge is <code>match()</code> against find-my-way. Static paths are found with one lookup in a map; a tree
          walked often is compiled into one function, with comparisons of character codes for its static parts and slices
          for its parameters, and no call per node. The root is answered before any work on the URL.
        </p>
${rawTable('router-2.md')}

        <h2 id="logger">Logger</h2>
        <p>
          <code>@xufa/logger</code> against pino 10.3, both writing JSON lines to a stream that drops them, so only the
          cost of the loggers is measured, in lines a second (more is better). Each logger and case runs in a process of
          its own; best of 5 rounds.
        </p>
        <div class="pairs">
${loggerRows
  .map(([name, pino, xufa, times]) =>
    pair(
      logger.label(name),
      [
        { name: '@xufa/logger', value: xufa, kind: 'us', label: fmt(xufa) },
        { name: 'pino', value: pino, label: fmt(pino) },
      ],
      times
    )
  )
  .join('\n')}
        </div>
        <p>
${logger.loggerNotes(loggerRows)}
        </p>
${rawTable(logger.REPORT)}

        <h2 id="serializer">Serializer</h2>
        <p>
          <code>@xufa/serializer</code> against fast-json-stringify 7.0.1, which fastify uses, and
          <code>JSON.stringify</code>, in objects serialized a second with their JSON schema (more is better). Each serializer
          and case runs in a process of its own; best of 3 rounds.
        </p>
        <p class="legend"><span class="us">xufa: @xufa/serializer</span><span>fjs: fast-json-stringify; JSON: JSON.stringify</span></p>
        <div class="pairs">
${serializer
  .map(([name, json, fjs, xufa, times]) =>
    pair(
      name,
      [
        { name: 'xufa', value: xufa, kind: 'us', label: fmt(xufa) },
        { name: 'fjs', value: fjs, label: fmt(fjs) },
        { name: 'JSON', value: json, label: fmt(json) },
      ],
      times
    )
  )
  .join('\n')}
        </div>
        <p>
          The badge is against fast-json-stringify. Three cases are even with it: hello world (0.97&times;), a long string
          full of characters to escape (0.99&times;, and a little behind <code>JSON.stringify</code>, whose escaping is
          native) and required + nullable + date (1.02&times;). The others are from 1.27&times; to 2.39&times;, and ahead of
          <code>JSON.stringify</code> too.
        </p>
${rawTable('serializer-1.md')}

${schemaSection()}
        <h2 id="jwt">JWT</h2>
        <p>
          <code>@xufa/jwt</code> against jsonwebtoken 9.0.3, in tokens signed, verified or decoded a second (more is better),
          with the same claims and options (<code>expiresIn</code>, <code>issuer</code>, <code>audience</code>) and the same
          keys, given as PEM text as most applications give them. Each library and case runs in a process of its own; best
          of 5 rounds.
        </p>
        <div class="pairs">
${jwt
  .map(([name, theirs, xufa, times]) =>
    pair(
      name,
      [
        { name: '@xufa/jwt', value: xufa, kind: 'us', label: fmt(xufa) },
        Number.isNaN(theirs)
          ? { name: 'jsonwebtoken', value: 0, label: 'no EdDSA' }
          : { name: 'jsonwebtoken', value: theirs, label: fmt(theirs) },
      ],
      Number.isNaN(times) ? null : times
    )
  )
  .join('\n')}
        </div>
        <p>
          The signatures are the same work, done by <code>node:crypto</code>; the difference is the key. jsonwebtoken tries
          a secret as a PEM key first, which throws (two thirds of the time of HS256), and parses a PEM key again on each
          call; @xufa/jwt does not try what has no <code>-----BEGIN</code>, and keeps the KeyObject of each key given as a
          string. Given a KeyObject, nothing is parsed by either, and they are even. Decoding, which verifying does first,
          parses the header once and splits the token once (jws does each two and three times). On Linux
          (<code>bench/results/jwt-linux-2.md</code>), where a key that fails to parse costs less, the gains are a little
          smaller: 3.78&times; and 4.12&times; for HS256, 1.63&times; and 1.71&times; for RS256, 2.60&times; and 1.45&times;
          for ES256, 1.34&times; for decoding.
        </p>
${rawTable('jwt-2.md')}
${rawTable('jwt-linux-2.md')}

        <h2 id="websocket">WebSocket</h2>
        <p>
          <code>@xufa/websocket</code> against ws 8.22.0, in messages echoed a second over the loopback (more is better): a
          client sends to a server that sends each message back, 64 in flight, both ends of the library measured. Both use
          bufferutil 4.1.0, the native masking, when the application has installed it, so each is measured without it, as
          they install, and with it. Every echo of the warm-up is checked against what was sent. Each library and case runs
          in a process of its own; best of 5 rounds.
        </p>
        <h3>Without bufferutil</h3>
        <div class="pairs">
${websocketPairs(1)}
        </div>
        <h3>With bufferutil</h3>
        <div class="pairs">
${websocketPairs(2)}
        </div>
        <p>
          Two differences, both in what a client sends, whose frames are masked. Without bufferutil, ws masks byte by byte in
          JavaScript, and @xufa/websocket from 384 bytes copies natively and masks 8 bytes at a time: about as fast as ws
          with bufferutil, with no native module to build
          (${Math.min(...jsAgainstNative).toFixed(2)}&times; to ${Math.max(...jsAgainstNative).toFixed(2)}&times; of it).
          And a masked frame is a copy of the message, which ws writes into a buffer allocated for it; @xufa/websocket uses
          the buffers of the frames already written again, as copying into new memory costs from 6 to 22 times more (on
          Linux, from 2 to 18). That is the gain of 16 KB with bufferutil too; at 1 MB the copy is a smaller part of the
          time. Small messages are not masked enough to tell, and with deflate zlib takes the time. Received, a message over
          several chunks of the socket is copied into a buffer of its own by both, as it is the application's.
        </p>
${rawTable('websocket-4.md')}

${replacedSection()}
`;

const sections = `        <h2 id="pg">PostgreSQL driver</h2>
        <p>
          <code>@xufa/pg</code> against <code>pg</code> 8.23.1, both through a pool of 10 connections, in operations or rows
          a second (more is better). Driver-bound workloads are those where the server does little, so the driver's own
          work decides; in server-bound ones, PostgreSQL does most of the work and both drivers wait for it.
        </p>
${pairsOf(pg, '@xufa/pg', 'pg')}
        <h3>Server-bound</h3>
${pairsOf(pgServer, '@xufa/pg', 'pg')}
        <p>
          What makes the difference: queries are prepared the second time their text runs, values are read and sent in
          the binary format, and queries are pipelined, so 64 queries at once do not wait for each other on a connection.
          For tables updated often, the ORM's <code>fillfactor</code> option helps more than any driver: an update of 5,000
          rows went from 10.5 ms to 6.3 ms with <code>fillfactor: 50</code>.
        </p>
${raw('All numbers (bench/results/postgres-7.md)', `${twoWayTable('Driver-bound workload', 'pg', pg)}\n${twoWayTable('Server-bound workload', 'pg', pgServer)}`)}

        <h2 id="mongo">MongoDB driver</h2>
        <p>
          <code>@xufa/mongo</code> against the official <code>mongodb</code> driver 7.7.0, both with 10 connections, in
          operations or documents a second (more is better). The last two are server-bound: MongoDB does the work, and both
          drivers wait for it.
        </p>
${pairsOf(mongo, '@xufa/mongo', 'mongodb')}
${raw('All numbers (bench/results/mongo-8.md)', twoWayTable('Workload', 'mongodb', mongo))}

${httpSection()}
${partsSections}        <h2 id="expressions">Expressions</h2>
        <p>
          <code>@xufa/expression</code> against the evaluators of expressions that run without access to the process
          (jexl 2.3, expr-eval 2.0, filtrex 3.1, SandboxJS 0.9) and against <code>new Function</code>, which is JavaScript
          compiled by V8 and no sandbox: the bound. Runs a second of each expression compiled once (more is better), on
          four contexts of different values in turn, so that V8 does not fold the expression on values that do not change.
          Expressions start as closures, and those run often become one function of JavaScript, whose arrow functions are
          arrow functions of JavaScript; what must be checked (names, members, calls, keys) is checked there as in the
          closures, and nothing of the source is code in it.
        </p>
        <p class="legend"><span class="us">@xufa/expression</span><span>other sandboxes</span></p>
        <div class="charts">
${expressions
  .map(([name, ...values]) =>
    chart(
      `<code>${name}</code>`,
      `Runs a second. JavaScript itself (new Function, no sandbox): ${fmt(values[5])}.${
        values.slice(1, 4).some((v) => v === null) ? ' jexl, expr-eval and filtrex cannot write it.' : ''
      }`,
      values
        .slice(0, 5)
        .map((value, i) => (value === null ? null : { name: ENGINES[i][0], value, kind: ENGINES[i][1] }))
        .filter(Boolean)
    )
  )
  .join('\n')}
        </div>
        <p>
          Method calls run at 88% of the speed of JavaScript, <code>map</code> and <code>reduce</code> with arrow functions
          at 71%; for the smallest expressions, about a third, where the call of the function is most of the cost. Compiled and
          run each time (one-off expressions), it is ahead of the other sandboxes too:
        </p>
        <div class="charts">
${expressionsOnce
  .map(([name, ...values]) =>
    chart(
      `<code>${esc(name) === name ? name : esc(name)}</code>, compiled each time`,
      `Runs a second. JavaScript itself: ${fmt(values[5])}.`,
      values
        .slice(0, 5)
        .map((value, i) => (value === null ? null : { name: ENGINES[i][0], value, kind: ENGINES[i][1] }))
        .filter(Boolean)
    )
  )
  .join('\n')}
        </div>
${raw('All numbers (bench/results/expression-5.md)', '          <pre><code>' + esc(fs.readFileSync(RESULTS + 'expression-5.md', 'utf8').trim()) + '</code></pre>')}

        <h3 id="expression-programs">Programs</h3>
        <p>
          An engine with <code>statements: true</code> runs programs: branches, loops, functions, objects built and
          exceptions. Its rival is SandboxJS 0.9, the other sandbox that runs statements; <code>node:vm</code> (a function
          compiled in another context, not a security boundary) and <code>new Function</code> are JavaScript without a
          sandbox, the bound. Programs also become one function of JavaScript, with their checks (members changed,
          steps of loops and calls, depth) in it. Compiled once, they run 140 to 2,200 times as fast as SandboxJS (5 times
          with exceptions thrown), from a third of the speed of JavaScript to as fast:
        </p>
        <p class="legend"><span class="us">@xufa/expression</span><span>SandboxJS</span></p>
        <div class="charts">
${programs.map((row) => programChart('', row)).join('\n')}
        </div>
        <p>
          Compiled and run each time, 28 to 57 times as fast as SandboxJS; compiling one takes about 10 microseconds.
        </p>
        <div class="charts">
${programsEach.map((row) => programChart(', compiled each time', row)).join('\n')}
        </div>
${raw('All numbers (bench/results/expression-programs-3.md)', '          <pre><code>' + esc(fs.readFileSync(RESULTS + 'expression-programs-3.md', 'utf8').trim()) + '</code></pre>')}

        <h2 id="templates">Templates</h2>
        <p>
          <code>@xufa/template</code> against Handlebars 4.7, Mustache 4.2 and Nunjucks 3.2, whose expressions are
          sandboxed as ours, and Eta 4.6 and EJS 7.0, templates of JavaScript that run whatever code they hold. All escape
          HTML, and each output is checked against ours before it is measured; four contexts of different values in turn.
          Renders a second (more is better).
        </p>
        <p class="legend"><span class="us">@xufa/template</span><span>other sandboxed engines</span><span class="interprets">not a sandbox (runs JavaScript)</span></p>
        <div class="charts">
${templates
  .map(([name, ...values]) =>
    chart(
      name,
      'Renders a second.',
      values.map((value, i) => ({ name: TEMPLATE_ENGINES[i][0], value, kind: TEMPLATE_ENGINES[i][1] }))
    )
  )
  .join('\n')}
        </div>
        <p>
          Templates start as closures; the parts of a template rendered often become one function of JavaScript, with
          their paths (<code>{{ user.name }}</code>) read inline, from names the expression engine checked. Templates
          rendered a few times do not pay for making it.
        </p>
${raw('All numbers (bench/results/template-5.md)', '          <pre><code>' + esc(fs.readFileSync(RESULTS + 'template-5.md', 'utf8').trim()) + '</code></pre>')}

        <h2 id="views">Large pages</h2>
        <p>
          A table of customers in a layout, sent by <code>reply.view</code> on a real server: rendered whole, and with
          <code>stream: true</code>, in chunks made as the client reads them. Median of 7 requests over the loopback; less
          is better.
        </p>
        <p class="legend"><span class="us">streamed</span><span>rendered whole</span></p>
        <div class="charts">
${[
  ['First byte', 'Milliseconds until the client has the first byte.', 2, 5, (v) => `${v} ms`],
  ['Whole page', 'Milliseconds until the client has all of it.', 3, 6, (v) => `${v} ms`],
  ['Memory of the server', 'Megabytes over its start, at the peak.', 4, 7, (v) => `+${v} MB`],
]
  .map(([title, subtitle, whole, stream, label]) =>
    chart(
      title,
      subtitle,
      views.flatMap((v) => [
        { name: `${(v[0] / 1000).toLocaleString('en-US')}k rows, whole`, value: v[whole], label: label(v[whole]) },
        {
          name: `${(v[0] / 1000).toLocaleString('en-US')}k rows, stream`,
          value: v[stream],
          kind: 'us',
          label: label(v[stream]),
        },
      ]),
      ' data-better="lower" data-compare="previous"'
    )
  )
  .join('\n')}
        </div>
        <p>
          Streamed, the first byte goes at once whatever the size, the memory does not grow with the page, and a large page
          is done sooner too: its items are rendered while the first chunks travel.
        </p>
${raw(
  'All numbers (bench/results/view-1.md)',
  '          <pre><code>' + esc(fs.readFileSync(RESULTS + 'view-1.md', 'utf8').trim()) + '</code></pre>'
)}

`;

// The page with its sections made again.
function buildBenchmarks(page) {
  const start = page.indexOf('        <h2 id="pg">PostgreSQL driver</h2>');
  const end = page.indexOf('        <h2 id="run">Run them yourself</h2>');
  if (start < 0 || end < 0) throw new Error('benchmarks.html: the sections to replace were not found');
  return page.slice(0, start) + sections + page.slice(end);
}

export { buildBenchmarks, httpSection, pair, chart, fmt, esc, raw };
