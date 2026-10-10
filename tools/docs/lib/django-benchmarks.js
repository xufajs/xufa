// The page of xufa against Django (django-benchmarks.html): made from the report of bench/django.js
// (bench/results/django-<n>.json). For each scenario, xufa and every server of Django that ran it; the cards compare xufa
// with the fastest of them.
import fs from 'node:fs';
import path from 'node:path';
import { pair, fmt, esc, raw } from './benchmarks.js';

const REPORT = 'django-5';
const RESULTS = path.join(import.meta.dirname, '../../../bench/results/');

const NAMES = {
  xufa: 'xufa',
  'gunicorn-sync': 'gunicorn (sync)',
  'gunicorn-gthread': 'gunicorn (gthread)',
  'granian-wsgi': 'granian (WSGI)',
  'uvicorn-asgi': 'uvicorn (ASGI)',
};
const TITLES = {
  hello: 'Plain text',
  json: 'A book as JSON',
  index: 'Home page',
  books: 'Book list',
  book: 'Book detail',
  mybooks: 'Loans of the user',
  'author-update': 'Edit an author',
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
// (autocannon measures whole milliseconds: 0 is under one)
const ms = (n) => (n < 1 ? '&lt;1 ms' : `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`);

function summaryOf(runs) {
  const rps = runs.map((r) => r.rps);
  return {
    rps: median(rps),
    p50: median(runs.map((r) => r.p50)),
    p99: median(runs.map((r) => r.p99)),
    spread: Math.max(...rps) / Math.min(...rps) - 1,
    errors: runs.reduce((sum, r) => sum + r.errors, 0),
  };
}

function djangoBenchmarks() {
  const { args, meta, results } = JSON.parse(fs.readFileSync(path.join(RESULTS, `${REPORT}.json`), 'utf8'));
  const servers = args.servers.filter((name) => results[name]);
  const django = servers.filter((name) => name !== 'xufa');
  const rows = args.scenarios.map((scenario) => {
    const of = Object.fromEntries(
      servers.filter((name) => results[name][scenario]).map((name) => [name, summaryOf(results[name][scenario])])
    );
    const best = django.filter((name) => of[name]).sort((a, b) => of[b].rps - of[a].rps)[0];
    return { scenario, of, best };
  });
  const v = meta.versions;

  const cards = rows
    .filter((row) => row.of.xufa && row.best)
    .map(({ scenario, of, best }) =>
      pair(
        // The server of Django in the title (the names of the bars are short).
        `${esc(TITLES[scenario] || scenario)} <small>· Django on ${NAMES[best]}</small>`,
        [
          { name: 'xufa', value: of.xufa.rps, kind: 'us', label: fmt(of.xufa.rps) },
          { name: 'Django', value: of[best].rps, label: fmt(of[best].rps) },
        ],
        of.xufa.rps / of[best].rps
      )
    );

  const cell = (s) =>
    s
      ? `${Math.round(s.rps).toLocaleString('en-US')}<br><small>${ms(s.p50)} / ${ms(s.p99)}${s.spread > 0.1 ? ' ⚠' : ''}${s.errors ? `, ${s.errors} errors` : ''}</small>`
      : '—';
  const everyServer = [
    '          <div class="table-wrap">',
    '            <table>',
    `              <thead><tr><th>Scenario</th>${servers.map((name) => `<th>${NAMES[name] || name}</th>`).join('')}</tr></thead>`,
    '              <tbody>',
    ...rows.map(
      ({ scenario, of }) =>
        `                <tr><td>${esc(TITLES[scenario] || scenario)}</td>${servers.map((name) => `<td>${cell(of[name])}</td>`).join('')}</tr>`
    ),
    '              </tbody>',
    '            </table>',
    '          </div>',
  ].join('\n');

  const memory = [
    '          <div class="table-wrap">',
    '            <table>',
    `              <thead><tr>${servers.map((name) => `<th>${NAMES[name] || name}</th>`).join('')}</tr></thead>`,
    `              <tbody><tr>${servers.map((name) => `<td>${meta.memory[name] && meta.memory[name].length ? `${median(meta.memory[name])} MB` : '—'}</td>`).join('')}</tr></tbody>`,
    '            </table>',
    '          </div>',
  ].join('\n');

  return `        <p>
          ${esc(meta.date)}: ${esc(meta.cpu)} (${meta.cores} cores), Linux in WSL 2. ${args.processes} processes on each
          side, ${args.connections} connections, ${args.rounds} rounds of ${args.duration} s after ${args.warmup} s of
          warm-up; the median of the rounds. Node.js ${esc(meta.node.replace(/^v/, ''))}; Python ${esc(v.python)},
          Django ${esc(v.django)}, gunicorn ${esc(v.gunicorn)}, granian ${esc(v.granian)}, uvicorn ${esc(v.uvicorn)},
          psycopg ${esc(v.psycopg)}; PostgreSQL ${esc(String(meta.pg).split(' ')[0])}.
        </p>
        <div class="pairs">
${cards.join('\n')}
        </div>
${raw(`Every server: requests a second, latency p50 / p99 (bench/results/${REPORT}.md)`, everyServer)}
        <h3>Memory</h3>
        <p>
          The resident memory of all the processes of each server after the scenarios (xufa: the primary and its four
          workers).
        </p>
${memory}
`;
}

export { djangoBenchmarks };
