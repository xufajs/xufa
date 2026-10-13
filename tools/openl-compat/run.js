// Runs the example workbooks of OpenL Tablets (fetched into workbooks/) with @xufa/rules: each is loaded, and the rows
// of its own Test tables are run against the results OpenL gives (what its examples expect). Prints, for each
// workbook, how its tables were read and how many rows pass, and the causes of the failures, most common first;
// results/summary.json keeps it all.
//
//   node run.js                 # every workbook
//   node run.js Tutorial8 -v    # those whose path has Tutorial8, with each failing row
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleBook, readXlsx, parseProperties } from '../../packages/rules/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = JSON.parse(fs.readFileSync(path.join(here, 'files.json'), 'utf8'));
const filter = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
const verbose = process.argv.includes('-v');

// The causes of failures, by their messages (the first that matches).
const CAUSES = [
  ['Results that differ from those of OpenL', /failed at row \d+\. Expected/],
  ['OpenL Rules layout (expression conditions)', /Param not found|Duplicated combination/],
  ['Methods in Java', /statements of JavaScript/],
  ['OpenL expression syntax', /Expected |Unexpected |is not allowed in expressions|Invalid number|Unterminated/],
  ['Spreadsheet values that are no formula', /is no formula/],
  ['Runtime context of tests', /Ambiguous versions|No version of/],
  ['Values of cells', /Invalid (Integer|Float|Double)/],
  ['Missing names (functions of OpenL)', /is not a function|Cannot read|undefined/],
];
const causeOf = (message) => CAUSES.find(([, pattern]) => pattern.test(message))?.[0] ?? 'Other';
// Tables of OpenL this engine does not take (deprecated, or of the Java world).
const UNSUPPORTED = /^(ColumnMatch|TBasic|Table ?Part|Environment|Algorithm|Tabular|Calc|Constructor)\b/i;

// The messages of a workbook's project (msg()): the .properties files of the i18n folder of the first folder above it
// that has one, by locale (message.properties '', message_fr.properties 'fr', message_de_DE.properties 'de_DE').
function messagesOf(workbook) {
  for (let dir = path.dirname(workbook); dir.startsWith(path.join(here, 'workbooks')); dir = path.dirname(dir)) {
    const i18n = path.join(dir, 'i18n');
    if (!fs.existsSync(i18n)) continue;
    const bundles = {};
    for (const file of fs.readdirSync(i18n)) {
      const match = /^[^_.]+(?:_(.+))?\.properties$/.exec(file);
      if (match) bundles[match[1] ?? ''] = parseProperties(fs.readFileSync(path.join(i18n, file), 'utf8'));
    }
    return bundles;
  }
  return undefined;
}

const summary = { files: [], causes: {}, unsupported: {}, rows: { passed: 0, total: 0 } };
for (const file of files) {
  if (filter && !file.includes(filter)) continue;
  const full = path.join(here, 'workbooks', file);
  if (!fs.existsSync(full)) {
    console.error(`missing ${file}: run node fetch.js first`);
    process.exit(1);
  }
  const name = file.replace(/^DEV\/org\.openl\.rules\.demo\/src\/org\.openl\.rules\.demo\./, '');
  const entry = { file: name, kinds: {}, unsupported: [], passed: 0, total: 0, errors: [] };
  // (Each message once in a workbook: a formula that does not compile is told each time it runs.)
  const seen = new Set();
  const note = (message) => {
    if (seen.has(message)) return;
    seen.add(message);
    entry.errors.push(message);
    const cause = causeOf(message);
    summary.causes[cause] = (summary.causes[cause] || 0) + 1;
  };
  try {
    // A workbook of tests is run with the workbooks of rules of its project (they are one module in OpenL).
    const sheets = readXlsx(fs.readFileSync(full)).sheets;
    if (/\/tests\//.test(file)) {
      const rules = files.filter(
        (other) => other.startsWith(file.slice(0, file.indexOf('/tests/'))) && other.includes('/rules/')
      );
      for (const other of rules) sheets.push(...readXlsx(fs.readFileSync(path.join(here, 'workbooks', other))).sheets);
    }
    const book = RuleBook.fromSheets(sheets, { onError: (err) => note(err.message), messages: messagesOf(full) });
    for (const table of book.tables) {
      if (!table) continue;
      if (Array.isArray(table)) {
        const first = String(table[0]?.[0] ?? '').trim();
        if (UNSUPPORTED.test(first)) {
          const kind = first.split(/\s+/)[0];
          entry.unsupported.push(kind);
          summary.unsupported[kind] = (summary.unsupported[kind] || 0) + 1;
        }
        continue;
      }
      const kind = table.kind ?? table.className.replace(/Table$/, '');
      entry.kinds[kind] = (entry.kinds[kind] || 0) + 1;
    }
    for (const test of book.testResults()) {
      for (const row of test.rows) {
        entry.total += 1;
        if (row.passed) entry.passed += 1;
        else {
          const message = row.message || (row.messages || []).join('; ') || row.error || 'failed';
          note(message);
          if (verbose) console.log(`  ${test.name} row ${row.row}: ${message.slice(0, 200)}`);
        }
      }
    }
  } catch (err) {
    entry.loadError = err.message;
    note(err.message);
  }
  summary.rows.passed += entry.passed;
  summary.rows.total += entry.total;
  summary.files.push(entry);
  const state = entry.loadError
    ? `does not load: ${entry.loadError.slice(0, 110)}`
    : `${entry.passed}/${entry.total} rows pass`;
  console.log(
    `${name}: ${state}${entry.unsupported.length ? ` (not supported: ${[...new Set(entry.unsupported)].join(', ')})` : ''}`
  );
}

const loaded = summary.files.filter((entry) => !entry.loadError);
const green = loaded.filter((entry) => entry.total && entry.passed === entry.total);
console.log(
  `\n${summary.files.length} workbooks: ${loaded.length} load, ${green.length} pass every test; ` +
    `${summary.rows.passed}/${summary.rows.total} rows of tests pass`
);
console.log('Causes of failures:');
for (const [cause, count] of Object.entries(summary.causes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${cause}`);
}
if (Object.keys(summary.unsupported).length) {
  console.log(
    `Tables not supported: ${Object.entries(summary.unsupported)
      .map(([kind, n]) => `${kind} ${n}`)
      .join(', ')}`
  );
}
fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'summary.json'), JSON.stringify(summary, null, 2));
