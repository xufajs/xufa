// The Performance section of docs/router.html, from bench/results/router-2.md: included in pages/router.page.html.
const fs = require('node:fs');
const path = require('node:path');

const results = fs.readFileSync(path.join(__dirname, '../../../bench/results/router-2.md'), 'utf8');
const rows = {};
for (const line of results.split('\n').slice(2)) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 6) continue;
  const num = (s) => Number(s.replace('M', '')) * 1e6;
  rows[cells[1]] = {
    fmw: num(cells[2]),
    find: num(cells[3]),
    match: num(cells[4]),
    findTimes: Number(cells[5].replace('x', '')),
    matchTimes: Number(cells[6].replace('x', '')),
  };
}

const labels = {
  'static deep': 'a deep static path',
  'with query': 'with a query string',
  'two params': 'two parameters',
  'one param': 'one parameter',
  wildcard: 'a wildcard',
  'regex param': 'a parameter with a regular expression',
  'multi param': 'two parameters in a segment (:name.:ext)',
  'static /': 'the root (/)',
  'not found': 'not found',
  'encoded param': 'an encoded parameter',
};

const fmt = (n) => `${(n / 1e6).toFixed(1)}M`;
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
const pairs = Object.keys(labels)
  .map((k) => ({ k, ...rows[k], times: rows[k].matchTimes }))
  .sort((a, b) => b.times - a.times)
  .map(({ k, fmw, match, times }) => {
    const top = Math.max(fmw, match);
    const even = times < 1.05 ? ' even' : '';
    return (
      `          <div class="pair">\n` +
      `            <div class="head"><span>${labels[k]}</span><span class="times${even}">${times.toFixed(2)}&times;</span></div>\n` +
      `            <div class="chart-row us"><span class="name">match()</span><span class="track"><span class="fill" style="width: ${pct(match, top)}"></span></span><span class="value">${fmt(match)}</span></div>\n` +
      `            <div class="chart-row"><span class="name">find-my-way</span><span class="track"><span class="fill" style="width: ${pct(fmw, top)}"></span></span><span class="value">${fmt(fmw)}</span></div>\n` +
      `          </div>\n`
    );
  })
  .join('');

const findTimes = Object.keys(labels).map((k) => rows[k].findTimes);
const section = `        <h2 id="performance">Performance</h2>
        <p>
          Routes found a second on the routes of a typical API (<code>node bench/micro/router.js</code>,
          <code>bench/results/router-2.md</code>): <code>match()</code>, what xufa calls for every request, against
          find-my-way's <code>find()</code>.
        </p>
        <div class="pairs">
${pairs}        </div>
        <p>
          Static paths are found with one lookup in a map, before the tree is walked. Once a tree has been walked a few
          times (<code>Router.COMPILE_AFTER</code>, 16), it is compiled into one function: each static part becomes
          comparisons of character codes, each parameter a slice, and backtracking falls through to the next child to
          try, with no call per node. <code>match()</code> leaves the query string to be parsed only if it is read;
          <code>find()</code>, which parses it as find-my-way's does, is from ${Math.min(...findTimes).toFixed(2)}&times; to
          ${Math.max(...findTimes).toFixed(2)}&times; find-my-way's.
        </p>
`;

module.exports = { routerPerformance: () => section };
