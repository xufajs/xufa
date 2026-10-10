// The Performance section of docs/logger.html, from bench/results/logger-2.md: included in pages/logger.page.html.
import fs from 'node:fs';
import path from 'node:path';

const REPORT = 'logger-2.md';

// [case, pino, xufa, times] of the report.
function loggerResults() {
  const text = fs.readFileSync(path.join(import.meta.dirname, '../../../bench/results', REPORT), 'utf8');
  return text
    .trim()
    .split('\n')
    .slice(2)
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return [
        cells[0],
        Number(cells[1].replace(/,/g, '')),
        Number(cells[2].replace(/,/g, '')),
        Number(cells[3].replace('x', '')),
      ];
    });
}

const LABELS = {
  'disabled level': 'a call at a disabled level',
  'disabled level, child': 'a call at a disabled level, child',
  'child + message': 'a child made, and a message',
};

const label = (name) => LABELS[name] || name;

// What the numbers mean, the same on the logger page and on the benchmarks page.
function loggerNotes(results) {
  const times = (name) => results.find((row) => row[0] === name)[3].toFixed(2);
  return `          The rows of a child logger are what a server sees, its <code>request.log</code> being a child. There, a line
          costs about the same in both (${times('message, child')}&times;), and so does a call at a disabled level, which
          V8 makes into nothing in both. pino's root logger is slower than its children (it has many properties of its
          own, and V8 keeps them as a dictionary): that is most of the difference on the rows of a root logger.
          A child is made at ${times('child + message')}&times; pino: as in pino, its parent is its prototype, so it copies
          nothing but its bindings, written once when it is made; a logger set at a level has a prototype shared with
          every logger at that level, with the functions of the level. A line
          adds its level, made once for each level, and its time, made once a millisecond: <code>Date.now()</code> alone
          is close to half of the cost of a line on this machine.`;
}

const fmt = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${Math.round(n / 1e3)}k`;
};
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;

function loggerPerformance() {
  const results = loggerResults();
  const pairs = results
    .map(([name, pino, xufa, times]) => {
      const top = Math.max(pino, xufa);
      const even = times < 1.05 ? ' even' : '';
      return (
        `          <div class="pair">\n` +
        `            <div class="head"><span>${label(name)}</span><span class="times${even}">${times.toFixed(2)}&times;</span></div>\n` +
        `            <div class="chart-row us"><span class="name">@xufa/logger</span><span class="track"><span class="fill" style="width: ${pct(xufa, top)}"></span></span><span class="value">${fmt(xufa)}</span></div>\n` +
        `            <div class="chart-row"><span class="name">pino</span><span class="track"><span class="fill" style="width: ${pct(pino, top)}"></span></span><span class="value">${fmt(pino)}</span></div>\n` +
        `          </div>\n`
      );
    })
    .join('');
  return `        <h2 id="performance">Performance</h2>
        <p>
          Lines a second, to a stream that discards them (<code>node bench/micro/logger.js</code>,
          <code>bench/results/${REPORT}</code>; each logger and case in a process of its own, best of 5 rounds):
        </p>
        <div class="pairs">
${pairs}        </div>
        <p>
${loggerNotes(results)}
        </p>
`;
}

export { loggerPerformance, loggerResults, loggerNotes, label, REPORT };
