// The pages of the benchmarks of @xufa/schema, from the results of bench/results/schema (written by isolated.js,
// features.js, legacy.js and machine.js: `pnpm run schema:all` in bench/). The build of the docs uses it:
//
// - article(): the content of docs/schema/benchmarks.html;
// - section(): the section of @xufa/schema in docs/benchmarks.html.
const fs = require('fs');
const path = require('path');

const RESULTS = path.join(__dirname, '../results/schema');
// The same benchmarks run on Linux (SCHEMA_RESULTS=results/schema-linux), shown in a part of their own.
const LINUX = path.join(__dirname, '../results/schema-linux');

// The results of a run, or undefined when the folder has none.
function load(dir) {
  if (!fs.existsSync(path.join(dir, 'machine.json'))) return undefined;
  const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  // Draft-04 and draft-06, run by @xufa/schema and ajv only.
  const legacy = read('legacy.json');
  return {
    suites: {
      'draft-07': read('suite.json'),
      '2019-09': read('suite-draft2019-09.json'),
      '2020-12': read('suite-draft2020-12.json'),
    },
    payloads: read('object.json'),
    features: read('features.json'),
    machine: read('machine.json'),
    draft04: { total: legacy.draft4.total, '@xufa/schema': legacy.draft4.ours, ajv: legacy.draft4.ajv },
    draft06: { total: legacy.draft6.total, '@xufa/schema': legacy.draft6.ours, ajv: legacy.draft6.ajv },
  };
}

const main = load(RESULTS);
// The results the parts of the page show: those of results/schema, or of another run while its part is written (see
// withRun()). Their ids then start with the prefix of the run, so that both can be on one page.
let { suites, payloads, features, machine, draft04, draft06 } = main;
let idPrefix = '';
function withRun(run, prefix, write) {
  const saved = { suites, payloads, features, machine, draft04, draft06, idPrefix };
  ({ suites, payloads, features, machine, draft04, draft06 } = run);
  idPrefix = prefix;
  try {
    return write();
  } finally {
    ({ suites, payloads, features, machine, draft04, draft06, idPrefix } = saved);
  }
}

// ------------------------------------------------------------------------------------------------ formatting
const escape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[^\x20-\x7E]/g, (c) => `&#${c.codePointAt(0)};`);

function fmt(n) {
  if (n === undefined || n === null) return '&ndash;';
  if (n >= 1e8) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e7) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e5) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
  return String(Math.round(n));
}

const isOurs = (name) => name.startsWith('@xufa/schema');
const libraryOf = (name) => name.replace(/ \(.*\)$/, '');

function table(headers, rows, className = 'numbers') {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n              ');
  return `<div class="table-wrap">
          <table class="${className}">
            <thead>
              <tr>${head}</tr>
            </thead>
            <tbody>
              ${body}
            </tbody>
          </table>
        </div>`;
}

const bold = (text, condition) => (condition ? `<strong>${text}</strong>` : text);

// ------------------------------------------------------------------------------------------------ sections
const LIBRARIES = [
  '@xufa/schema',
  'ajv',
  '@exodus/schemasafe',
  '@cfworker/json-schema',
  'json-schema-library',
  'is-my-json-valid',
  'jsen',
  'djv',
  'jsonschema',
  'tv4',
  'z-schema',
];
const versionOf = (name) => {
  if (name === '@xufa/schema') return require('@xufa/schema/package.json').version; // eslint-disable-line global-require
  try {
    return require(`${name}/package.json`).version; // eslint-disable-line global-require
  } catch (e) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../node_modules', name, 'package.json'), 'utf8')).version;
  }
};

// Speed on the test suite, by validator and draft.
function suiteSpeedTable() {
  const names = [...new Set(Object.values(suites).flatMap((s) => s.validators.map((v) => v.name)))];
  const speed = (name, draft) => {
    const row = suites[draft].validators.find((v) => v.name === name);
    return row ? row.opsPerSec : undefined;
  };
  const best = (draft) => Math.max(...suites[draft].validators.map((v) => v.opsPerSec || 0));
  const rows = names
    .sort((a, b) => (speed(b, 'draft-07') || 0) - (speed(a, 'draft-07') || 0))
    .map((name) => [
      bold(escape(name), isOurs(name)),
      ...Object.keys(suites).map((d) => bold(fmt(speed(name, d)), speed(name, d) === best(d))),
    ]);
  return table(['Runs per second', 'draft-07', '2019-09', '2020-12'], rows);
}

const PAYLOADS = [
  ['moltar strict', 'The flat object of typescript-runtime-type-benchmarks, with no extra keys allowed.'],
  [
    'order (20 lines)',
    'A business object with 20 order lines: pattern, enum, const, number ranges, anyOf, nullable types, uniqueItems.',
  ],
  [
    'order 2020-12, unevaluatedProperties (20 lines)',
    'The same order in draft 2020-12, with $ref, allOf and unevaluatedProperties.',
  ],
  [
    'payment 2020-12, oneOf + unevaluatedProperties',
    'A payment whose variant (oneOf) decides the keys it may have (unevaluatedProperties).',
  ],
  [
    'shapes, discriminator (8 kinds)',
    'A shape among 8, picked by an OpenAPI discriminator (ajv with its option discriminator: true).',
  ],
];

function payloadSection([name, description]) {
  const valid = payloads[`${name} · valid`];
  const invalid = payloads[`${name} · invalid`];
  const names = [...new Set([...valid.rows, ...invalid.rows].map((r) => r.name))];
  const opsOf = (result, n) => (result.rows.find((r) => r.name === n) || {}).ops;
  const best = (result) => Math.max(...result.rows.map((r) => r.ops));
  const rows = names
    .sort((a, b) => (opsOf(valid, b) || 0) - (opsOf(valid, a) || 0))
    .map((n) => [
      bold(escape(n), isOurs(n)),
      bold(fmt(opsOf(valid, n)), opsOf(valid, n) === best(valid)),
      bold(fmt(opsOf(invalid, n)), opsOf(invalid, n) === best(invalid)),
    ]);
  const skipped = [...new Set([...(valid.skipped || []), ...(invalid.skipped || [])])];
  const id = name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+$/, '')
    .toLowerCase();
  return `<h3 id="${idPrefix}${id}">${escape(name)}</h3>
        <p>${escape(description)}</p>
        ${table(['Validations per second', 'valid', 'invalid'], rows)}${
          skipped.length ? `\n        <p class="note">Left out: ${escape(skipped.join('; '))}.</p>` : ''
        }`;
}

function compileTable() {
  const rows = payloads['compile order schema'].rows
    .slice()
    .sort((a, b) => b.ops - a.ops)
    .map((r) => [bold(escape(r.name), isOurs(r.name)), fmt(r.ops)]);
  return table(['Schemas per second', 'order schema'], rows);
}

function featuresTable() {
  const rows = Object.entries(features).map(([name, { rows: r }]) => {
    const ops = (n) => (r.find((x) => x.name === n) || {}).ops;
    const ratio = (a, b) => (ops(a) && ops(b) ? `${(ops(a) / ops(b)).toFixed(1)}&times;` : '&ndash;');
    return [
      escape(name),
      `<strong>${fmt(ops('@xufa/schema (all errors)'))}</strong>`,
      fmt(ops('ajv (all errors)')),
      `<strong>${fmt(ops('@xufa/schema (first error)'))}</strong>`,
      fmt(ops('ajv (first error)')),
      ratio('@xufa/schema (all errors)', 'ajv (all errors)'),
    ];
  });
  return table(
    [
      'Validations per second',
      '@xufa/schema, all errors',
      'ajv, all errors',
      '@xufa/schema, first error',
      'ajv, first error',
      '@xufa/schema / ajv',
    ],
    rows
  );
}

const yes = '&#10003;';
const FEATURES = [
  [
    'JSON Schema drafts',
    'draft-04, draft-06, draft-07, 2019-09, 2020-12',
    'draft-06 to 2020-12; draft-04 with ajv-draft-04',
  ],
  [
    'JSON-Schema-Test-Suite, all five drafts',
    `${draft04['@xufa/schema'] + draft06['@xufa/schema'] + ['draft-07', '2019-09', '2020-12'].reduce((n, d) => n + suites[d].validators[0].testsOk, 0)} tests passed, all of them`,
    `${draft04.ajv + draft06.ajv + ['draft-07', '2019-09', '2020-12'].reduce((n, d) => n + (suites[d].validators.find((v) => v.name.startsWith('ajv')) || {}).testsOk, 0)} tests passed`,
  ],
  ['JSON Type Definition (JTD)', '&ndash;', yes],
  ['Schema DSL for JavaScript', `${yes} (String(), Integer()...), with inferred TypeScript types`, '&ndash;'],
  [
    'Messages with the path of the field',
    `${yes} (lines[3].price must be at least 0)`,
    'messages without the path; instancePath apart',
  ],
  ['Error objects', yes, yes],
  ['Every error, first error, or true/false', yes, yes],
  ['Standalone code', `${yes} (no dependency at all)`, `${yes} (requires parts of ajv for some keywords)`],
  ['Formats', `${yes} built in, idn-hostname and idn-email included`, 'with ajv-formats'],
  ['Optional format tests passed (2020-12)', '874 / 874', '733 / 874 (with ajv-formats)'],
  ['formatMinimum, formatMaximum', yes, 'with ajv-formats'],
  ['Keywords of your own: validate, compile, macro', yes, yes],
  ['Keywords of your own that write generated code', '&ndash;', yes],
  ['ajv-keywords', `${yes} built in (13 of them)`, 'with ajv-keywords'],
  ['$merge and $patch (ajv-merge-patch)', `${yes} built in`, 'with ajv-merge-patch'],
  ['useDefaults, removeAdditional, coerceTypes', yes, yes],
  ['$data references', '&ndash;', yes],
  ['Asynchronous validation ($async)', '&ndash;', yes],
  ['Loading referenced documents (compileAsync)', `${yes} compileJsonSchemaAsync`, yes],
  ['OpenAPI discriminator', `${yes} with mapping and implicit names`, 'const and enum only'],
  ['Tagged oneOf detected without discriminator', yes, '&ndash;'],
  ['strict mode', yes, yes],
  ['Translated messages, errorMessage', '&ndash;', 'with ajv-i18n, ajv-errors'],
  ['Dependencies', '0', '4'],
];

function featureMatrix() {
  return table(
    ['', `@xufa/schema ${versionOf('@xufa/schema')}`, `ajv ${versionOf('ajv')}`],
    FEATURES,
    'features-matrix'
  );
}

function modesTable() {
  const names = [...new Set(Object.values(suites).flatMap((s) => s.validators.map((v) => v.name)))];
  // The modes a library is benchmarked in: its rows, or true/false for a library with a single row.
  const modes = (library) => {
    const own = names.filter((n) => libraryOf(n) === library);
    const listed = own.map((n) => (n === library ? 'true/false' : n.slice(library.length + 2, -1)));
    return listed.map((mode) => (mode === 'boolean' ? 'true/false' : mode)).join(', ');
  };
  const drafts = (library) =>
    Object.keys(suites)
      .filter((d) => suites[d].validators.some((v) => libraryOf(v.name) === library))
      .join(', ');
  const rows = LIBRARIES.map((library) => [escape(library), versionOf(library), drafts(library), modes(library)]);
  return table(['Library', 'Version', 'Drafts benchmarked', 'Modes benchmarked'], rows);
}

// ------------------------------------------------------------------------------------------------ charts
// The modes a validator row is in: the one in parentheses, or true/false for a library with a single row.
const MODES = [
  ['true/false', 'boolean'],
  ['first error', 'first error'],
  ['all errors', 'all errors'],
];
const modeOf = (name) => {
  const match = / \((.*)\)$/.exec(name);
  if (!match) return 'true/false';
  return match[1] === 'boolean' ? 'true/false' : match[1];
};
const INTERPRETERS = ['jsonschema', 'tv4', '@cfworker/json-schema'];

const times = (ratio) => (ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio)));

// A bar chart: one row per { name, value }, sorted, the bars relative to the largest value, and next to each value how
// many times slower than @xufa/schema it is. `compare` is the data-compare of the chart (see tools/docs/lib/outcomes.js).
function chart(title, subtitle, rows, unit = '', compare = '') {
  const sorted = rows.filter((r) => r.value).sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((r) => r.value));
  const ours = (sorted.find((r) => isOurs(r.name)) || {}).value;
  const lines = sorted
    .map((r) => {
      const us = isOurs(r.name);
      const ratio = ours && !us ? ours / r.value : undefined;
      const note = ratio && ratio >= 1.05 ? `<small>${times(ratio)}&times; slower</small>` : '';
      const classes = ['chart-row', us ? 'us' : '', INTERPRETERS.includes(libraryOf(r.name)) ? 'interprets' : '']
        .filter(Boolean)
        .join(' ');
      return `<div class="${classes}"><span class="name" title="${escape(r.name)}">${escape(libraryOf(r.name))}</span><div class="track"><div class="fill" style="width: ${Math.max(0.5, (100 * r.value) / max).toFixed(1)}%"></div></div><span class="value">${fmt(r.value)}${unit}${note}</span></div>`;
    })
    .join('\n            ');
  return `<div class="chart"${compare ? ` data-compare="${compare}"` : ''}>
            <h3>${title}</h3>
            ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
            ${lines}
          </div>`;
}

// Mode switches: a segmented control over one panel per mode.
function modeTabs(name, panels, selected = 1) {
  const id = idPrefix + name;
  const list = panels
    .map(
      ({ label }, i) =>
        `<button role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${i === selected ? 'true' : 'false'}">${label}</button>`
    )
    .join('');
  const bodies = panels
    .map(
      ({ html }, i) =>
        `<div class="tab-panel" id="${id}-panel-${i}" role="tabpanel" aria-labelledby="${id}-tab-${i}"${i === selected ? '' : ' hidden'}>
          ${html}
        </div>`
    )
    .join('\n        ');
  return `<div class="tabs segmented">
        <div class="tab-list" role="tablist">${list}</div>
        ${bodies}
      </div>`;
}

const inMode = (rows, mode) => rows.filter((r) => modeOf(r.name) === mode);
const valueRows = (rows) => rows.map((r) => ({ name: r.name, value: r.opsPerSec ?? r.ops }));

function suiteCharts() {
  return modeTabs(
    'suite',
    MODES.map(([label]) => ({
      label,
      html: `<div class="charts">
          ${Object.entries(suites)
            .map(([draft, s]) =>
              chart(
                draft === 'draft-07' ? 'Draft-07' : `Draft ${draft}`,
                `runs per second over ${s.commonTests} tests`,
                valueRows(inMode(s.validators, label))
              )
            )
            .join('\n          ')}
        </div>`,
    }))
  );
}

function payloadCharts() {
  return modeTabs(
    'payloads',
    MODES.map(([label]) => ({
      label,
      html: PAYLOADS.map(([name, description]) => {
        const id = name
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/-+$/, '')
          .toLowerCase();
        const one = (kind) =>
          chart(
            `${escape(name)}, ${kind}`,
            `validations per second`,
            valueRows(inMode(payloads[`${name} · ${kind}`].rows, label))
          );
        return `<h3 id="${idPrefix}${id}-${label.replace(/[^a-z]/g, '')}">${escape(name)}</h3>
          <p>${escape(description)}</p>
          <div class="charts">
          ${one('valid')}
          ${one('invalid')}
          </div>`;
      }).join('\n          '),
    }))
  );
}

function compileChart() {
  const rows = payloads['compile order schema'].rows.filter((r) =>
    ['true/false', 'first error'].includes(modeOf(r.name))
  );
  // One row per library: its first-error row when it has one.
  const byLibrary = new Map();
  rows.forEach((r) => {
    const library = libraryOf(r.name);
    if (!byLibrary.has(library) || modeOf(r.name) === 'first error') byLibrary.set(library, r);
  });
  return `<div class="legend"><span class="us">@xufa/schema</span><span>compiles the schema</span><span class="interprets">interprets it at every validation</span></div>
        <div class="charts">
          ${chart('Compiling the order schema', 'schemas per second, first error', valueRows([...byLibrary.values()]), '', 'compilers')}
        </div>`;
}

// Features: @xufa/schema and ajv side by side, with @xufa/schema's speed in times ajv's.
function featurePairs() {
  return modeTabs(
    'features',
    // Measured building errors, in the two modes of ajv.
    MODES.slice(1).map(([label]) => {
      const pairs = Object.entries(features).map(([name, { rows }]) => {
        const s = rows.find((r) => r.name === `@xufa/schema (${label})`).ops;
        const a = rows.find((r) => r.name === `ajv (${label})`).ops;
        const max = Math.max(s, a);
        const row = (who, value, us) =>
          `<div class="chart-row${us ? ' us' : ''}"><span class="name">${who}</span><div class="track"><div class="fill" style="width: ${Math.max(0.5, (100 * value) / max).toFixed(1)}%"></div></div><span class="value">${fmt(value)}</span></div>`;
        return `<div class="pair">
            <div class="head"><span>${escape(name)}</span><span class="times">${times(s / a)}&times;</span></div>
            ${row('@xufa/schema', s, true)}
            ${row('ajv', a, false)}
          </div>`;
      });
      return {
        label,
        html: `<div class="pairs">
          ${pairs.join('\n          ')}
        </div>`,
      };
    }),
    0
  );
}

// Tests passed as progress bars, by library and draft.
function conformanceProgress() {
  const drafts = Object.keys(suites);
  const passed = (library, draft) => {
    const row = suites[draft].validators.find((v) => libraryOf(v.name) === library);
    return row ? row.testsOk : undefined;
  };
  const totals = [draft04.total, draft06.total, ...drafts.map((d) => suites[d].totalTests)];
  const cell = (count, total) => {
    if (count === undefined) return '<span class="count">not run</span>';
    const percent = (100 * count) / total;
    return `<div class="progress${count === total ? ' full' : ''}"><div class="track"><div class="fill" style="width: ${percent.toFixed(1)}%"></div></div><span class="count">${count} / ${total}</span></div>`;
  };
  const rows = LIBRARIES.map((library) => {
    const legacy = (d) => (library === '@xufa/schema' || library === 'ajv' ? d[library] : undefined);
    const counts = [legacy(draft04), legacy(draft06), ...drafts.map((d) => passed(library, d))];
    return [bold(escape(library), library === '@xufa/schema'), ...counts.map((c, i) => cell(c, totals[i]))];
  });
  return table(['', 'draft-04', 'draft-06', 'draft-07', '2019-09', '2020-12'], rows, 'progress-table');
}

// Summary figures: @xufa/schema against ajv, of the results of a run (those of this page, or those of another system).
const ajvRow = (rows, mode) => rows.find((r) => r.name === `ajv (${mode})`);
const oursRow = (rows, mode) => rows.find((r) => r.name === `@xufa/schema (${mode})`);
const geometricMean = (values) => Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length);
// What the results say, checked against them (the summary states only what holds): the benchmarks where another
// library is as fast or faster in the same mode (libraries of one mode count as true/false), the compilers faster
// at compiling (not the interpreters), the features where ajv is as fast or faster.
// Ahead by less than this is level (as the colors of the charts: tools/docs/lib/outcomes.js): said as such.
const AHEAD = 1.05;
const CHART_MODES = ['true/false', 'first error', 'all errors'];
function beaten(label, rows, value, list, skip = () => false, level = []) {
  for (const mode of CHART_MODES) {
    const us = rows.find((r) => isOurs(r.name) && modeOf(r.name) === mode);
    if (!us) continue;
    rows
      .filter((r) => !isOurs(r.name) && modeOf(r.name) === mode && !skip(r.name))
      .forEach((r) => {
        if (value(r) >= value(us)) list.push(`${r.name} on ${label} (${mode})`);
        else if (value(us) / value(r) < AHEAD) level.push(`${r.name} on ${label} (${mode})`);
      });
  }
}

function summarize(run) {
  const totalTests = (library) =>
    run.draft04[library] +
    run.draft06[library] +
    Object.values(run.suites).reduce(
      (n, s) => n + (s.validators.find((v) => libraryOf(v.name) === library) || {}).testsOk,
      0
    );
  const allTests =
    run.draft04.total + run.draft06.total + Object.values(run.suites).reduce((n, s) => n + s.totalTests, 0);
  const suiteRatio =
    oursRow(run.suites['draft-07'].validators, 'first error').opsPerSec /
    ajvRow(run.suites['draft-07'].validators, 'first error').opsPerSec;
  const payloadRatio = geometricMean(
    PAYLOADS.flatMap(([name]) =>
      ['valid', 'invalid'].map((kind) => {
        const { rows } = run.payloads[`${name} · ${kind}`];
        return oursRow(rows, 'first error').ops / ajvRow(rows, 'first error').ops;
      })
    )
  );
  const compileRows = run.payloads['compile order schema'].rows;
  const compileRatio = oursRow(compileRows, 'first error').ops / ajvRow(compileRows, 'first error').ops;
  const slower = { validating: [], compiling: [], features: [] };
  const level = { validating: [], compiling: [], features: [] };
  Object.entries(run.suites).forEach(([draft, suite]) =>
    beaten(`the ${draft} test suite`, suite.validators, (r) => r.opsPerSec, slower.validating)
  );
  Object.entries(run.payloads).forEach(([name, { rows }]) => {
    if (!rows) return;
    if (name.startsWith('compile'))
      beaten(
        name,
        rows,
        (r) => r.ops,
        slower.compiling,
        (n) => INTERPRETERS.includes(n),
        level.compiling
      );
    else beaten(name, rows, (r) => r.ops, slower.validating, undefined, level.validating);
  });
  Object.entries(run.features).forEach(([name, { rows }]) => {
    ['all errors', 'first error'].forEach((mode) => {
      const ajv = rows.find((r) => r.name === `ajv (${mode})`);
      const us = rows.find((r) => r.name === `@xufa/schema (${mode})`);
      if (ajv && us && ajv.ops >= us.ops) slower.features.push(`${name} (${mode})`);
      else if (ajv && us && us.ops / ajv.ops < AHEAD) level.features.push(`${name} (${mode})`);
    });
  });
  const passesAll =
    Object.values(run.suites).every((suite) => suite.validators[0].testsOk === suite.totalTests) &&
    run.draft04['@xufa/schema'] === run.draft04.total &&
    run.draft06['@xufa/schema'] === run.draft06.total;
  const featureRatio = geometricMean(
    Object.values(run.features).map(({ rows }) => oursRow(rows, 'all errors').ops / ajvRow(rows, 'all errors').ops)
  );
  const stats = [
    [
      `${allTests.toLocaleString('en')}`,
      `tests of the JSON-Schema-Test-Suite, draft-04 to 2020-12: all passed (ajv: ${totalTests('ajv').toLocaleString('en')})`,
    ],
    [`${times(suiteRatio)}&times;`, "ajv's speed on the draft-07 test suite, first error"],
    [`${times(payloadRatio)}&times;`, "ajv's speed on the payloads below, on average (geometric mean), first error"],
    [`${times(compileRatio)}&times;`, "ajv's speed compiling a schema"],
  ];
  return { stats, slower, level, featureRatio, passesAll };
}

const except = (list) => (list.length ? ` (except ${escape(list.join('; '))})` : '');
// Results ahead by less than 5%: level, not faster.
const levelWith = (list) => (list.length ? `, level (within 5%) with ${escape(list.join('; '))}` : '');
const atLeast = (list) => (list.length ? 'as fast as or faster than' : 'faster than');
const statCardsOf = ({ stats }) =>
  stats
    .map(
      ([value, label]) =>
        `<div class="stat"><span class="value">${value}</span><span class="label">${label}</span></div>`
    )
    .join('\n          ');
const calloutOf = ({ slower, level, featureRatio, passesAll }) => `<div class="callout">
          <p>
            ${passesAll ? '@xufa/schema passes every test of the five drafts it supports.' : '@xufa/schema passes the tests counted below.'}
            In the same mode, it validates ${atLeast(level.validating)} every other library in every benchmark on this
            page${except(slower.validating)}${levelWith(level.validating)}, compiles ${atLeast(level.compiling)} every other library that compiles
            schemas${except(slower.compiling)}${levelWith(level.compiling)}, and is ${atLeast(level.features)} ajv on every feature they
            share${except(slower.features)}${levelWith(level.features)} (${times(featureRatio)}&times; on average).
          </p>
        </div>`;

const summary = summarize(main);
const statCards = statCardsOf(summary);
// The same benchmarks run on Linux (results/schema-linux), when there are.
const linux = load(LINUX);
const linuxSummary = linux && summarize(linux);

const rawTable = (summary, html) => `<details class="raw">
          <summary>${summary}</summary>
          ${html}
        </details>`;

// The figures of the summary on each system the benchmarks ran on (when they ran on Linux too), side by side.
function systemsTable() {
  if (!linux) return '';
  const name = (run) => `${escape(run.machine.os === 'Windows_NT' ? 'Windows' : run.machine.os)}`;
  const rows = summary.stats.map(([value, label], i) => [label, value, linuxSummary.stats[i][0]]);
  const body = rows
    .map(([label, here, there]) => `<tr><td>${label}</td><td>${here}</td><td>${there}</td></tr>`)
    .join('\n              ');
  return `        <div class="table-wrap">
          <table class="numbers">
            <thead>
              <tr><th></th><th>${name(main)}</th><th><a href="#linux">${name(linux)}</a></th></tr>
            </thead>
            <tbody>
              ${body}
            </tbody>
          </table>
        </div>
`;
}

// The part of the page for the run on Linux: its summary and every result, as the parts above show those of the first
// run (its tabs and headings have ids of their own, starting with linux-).
function linuxPart() {
  if (!linux) return '';
  return withRun(
    linux,
    'linux-',
    () => `        <h2 id="linux">On Linux</h2>
        <p>
          The same benchmarks, run on Linux (WSL 2) on the same machine: ${escape(machine.cpu)}, ${machine.cores} cores,
          Node.js ${escape(machine.node)}, on ${machine.date}. The summary is checked against the results of this run, in
          the same way as the one at the top of the page.
        </p>
        <div class="stats">
          ${statCardsOf(linuxSummary)}
        </div>
        ${calloutOf(linuxSummary)}

        <h3 id="linux-conformance">Tests passed</h3>
        ${conformanceProgress()}

        <h3 id="linux-suite-speed">Speed on the test suite</h3>
        ${suiteCharts()}
        ${rawTable('All the numbers', suiteSpeedTable())}

        <h3 id="linux-payloads">Speed on payloads</h3>
        ${payloadCharts()}
        ${rawTable('All the numbers', PAYLOADS.map(payloadSection).join('\n        '))}

        <h3 id="linux-compiling">Compiling</h3>
        ${compileChart()}
        ${rawTable('All the numbers', compileTable())}

        <h3 id="linux-features">Speed of the features</h3>
        ${featurePairs()}
        ${rawTable('All the numbers', featuresTable())}

`
  );
}

// ------------------------------------------------------------------------------------------------ pages
// The content of docs/schema/benchmarks.html.
function article() {
  return `        <h1>Benchmarks</h1>
        <p class="intro">
          @xufa/schema compared with ajv and nine other JSON Schema validators: how many tests of the JSON-Schema-Test-Suite
          each one passes, how fast it validates the suite and realistic payloads, how fast it compiles a schema, and how
          fast the features beyond validating are.
        </p>

        <h2 id="summary">Summary</h2>
        <div class="stats">
          ${statCards}
        </div>
        ${calloutOf(summary)}
${systemsTable()}        <p>
          Every chart compares libraries doing the same work: pick the mode above it. <em>true/false</em> only tells
          whether the value is valid; <em>first error</em> stops at the first failing check and builds its error;
          <em>all errors</em> builds every error. Longer is faster, and next to each library is how many times slower
          than @xufa/schema it is.
        </p>

        <h2 id="conformance">Tests passed</h2>
        <p>
          Tests of the <a href="https://github.com/json-schema-org/JSON-Schema-Test-Suite">JSON-Schema-Test-Suite</a>
          each library gets right, draft by draft (a schema it cannot compile counts as wrong for every test of its
          group). Only @xufa/schema and ajv run draft-04 and draft-06 here; drafts 2019-09 and 2020-12 run with the libraries
          that implement them.
        </p>
        ${conformanceProgress()}

        <h2 id="suite-speed">Speed on the test suite</h2>
        <p>
          How many times per second each library validates every test of the groups all the libraries of the draft pass,
          so that each one does the same work.
        </p>
        ${suiteCharts()}
        <p class="note">
          ajv's speed on drafts 2019-09 and 2020-12 changes a lot from one process to the next (between about 4k and 15k
          runs per second in our runs).
        </p>
        ${rawTable('All the numbers', suiteSpeedTable())}

        <h2 id="payloads">Speed on payloads</h2>
        <p>
          Validations per second of one value, valid and invalid, by each library that compiles the schema and gives the
          right answer for it. The schemas are in
          <a href="https://github.com/xufajs/xufa/blob/main/bench/schema/lib/cases.js">bench/schema/lib/cases.js</a>.
        </p>
        ${payloadCharts()}
        ${rawTable('All the numbers', PAYLOADS.map(payloadSection).join('\n        '))}

        <h2 id="compiling">Compiling</h2>
        <p>
          Schemas per second, from the order schema to a function that validates it. jsonschema, tv4 and
          @cfworker/json-schema interpret the schema instead of compiling it: their "compiling" only builds an object,
          and they pay for it at every validation, which is why they are the slowest on the payloads above.
        </p>
        ${compileChart()}
        ${rawTable('All the numbers', compileTable())}

        <h2 id="features">Speed of the features</h2>
        <p>
          @xufa/schema and ajv on the features beyond validating JSON Schema, each with the same options and plugins
          (ajv-keywords, ajv-formats, ajv-draft-04, ajv's standalone code), with @xufa/schema's speed in times ajv's. With the
          options that change the data, each call validates a new object, made the same way for both. The cases are in
          <a href="https://github.com/xufajs/xufa/blob/main/bench/schema/features.js">bench/schema/features.js</a>.
        </p>
        ${featurePairs()}
        ${rawTable('All the numbers', featuresTable())}

        <h2 id="comparison">@xufa/schema and ajv, feature by feature</h2>
        ${featureMatrix()}
        <p>
          See <a href="schema-ajv.html">Migrating from ajv</a> for the options, errors and APIs of each one.
        </p>

        <h2 id="libraries">Libraries</h2>
        <p>
          Every library of <a href="https://github.com/ebdrup/json-schema-benchmark">json-schema-benchmark</a> that runs
          on current Node.js, with the drafts and modes each one is benchmarked in. (ajv always returns true or false,
          and builds the first error, or all of them, on the way.)
        </p>
        ${modesTable()}

${linuxPart()}        <h2 id="method">Method</h2>
        <ul>
          <li>
            Every measurement runs in a new Node.js process with a single library, as a service uses it, so libraries
            cannot slow each other down through the state of the JIT they would share. Each one is timed for 1 second
            after a warm-up, in 3 processes, and the median is kept.
          </li>
          <li>
            Measured on ${escape(machine.cpu)}, ${machine.cores} cores, ${escape(machine.os)}, Node.js ${escape(machine.node)},
            on ${machine.date}. Benchmarks depend on the machine and on what else runs on it: compare the libraries with each
            other, not these numbers with another machine's.
          </li>
        </ul>
        <pre><code class="language-sh">pnpm install
cd bench
pnpm run schema:all                        # test suite, payloads, features, draft-04 and -06, the machine
SCHEMA_RESULTS=results/schema-linux pnpm run schema:all   # the same, for the part on Linux
pnpm run schema:conformance draft2020-12   # tests passed by @xufa/schema and ajv, file by file
pnpm run schema:quick                      # every validator in one process (about a minute: less exact)
cd .. && pnpm docs                         # writes this page from bench/results/schema</code></pre>
`;
}

// The section of @xufa/schema in docs/benchmarks.html: the summary, the tests passed and the speed on the suite.
function section() {
  return `        <h2 id="schema">Schema validation: @xufa/schema</h2>
        <p>
          <a href="schema-benchmarks.html">@xufa/schema</a> compared with ajv and nine other JSON Schema validators, each
          measured in its own process (Node.js ${escape(machine.node)}, ${escape(machine.os)}, ${machine.date}). Every
          library, payload and feature is on <a href="schema-benchmarks.html">the page of its benchmarks</a>.
        </p>
        <div class="stats">
          ${statCards}
        </div>
        <h3 id="schema-conformance">Tests passed</h3>
        ${conformanceProgress()}
        <h3 id="schema-suite">Speed on the test suite</h3>
        ${suiteCharts()}
`;
}

module.exports = { article, section };
