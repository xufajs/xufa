// Marks how xufa fares in the charts of a page, for their colors: green where it is ahead, red where it is behind,
// grey where the difference is under 5%.
// - A pair card (div.pair) takes `win`, `lose` or `even` from its badge (how many times ours is the other's).
// - In a chart (div.chart), each row of ours (chart-row us) takes it from its bar against the best of the other rows
//   (their widths are their values). data-better="lower" for times and sizes; data-compare="previous" compares a row
//   with the one before it only (two ways of ours, as whole and streamed pages); data-compare="compilers" leaves out the
//   rows that interpret (chart-row interprets), for charts of compiling, where they have nothing to compile.
const AHEAD = 1.05;
const OUTCOMES = /\s+(?:win|lose|even)(?=["\s]|$)/g;

const outcomeOf = (times) => {
  if (!(times > 0)) return 'even';
  if (times >= AHEAD) return 'win';
  if (times <= 1 / AHEAD) return 'lose';
  return 'even';
};

function markPairs(html) {
  return html.replace(/<div class="pair[^"]*">(\s*<div class="head">[\s\S]*?<\/div>)/g, (whole, head) => {
    const badge = /<span class="times[^"]*">\s*([\d.]+)&times;/.exec(head);
    // A pair without a badge (nothing to compare) is left as it is.
    if (!badge) return whole.replace(/<div class="pair[^"]*">/, '<div class="pair">');
    return `<div class="pair ${outcomeOf(Number(badge[1]))}">${head.replace(/<span class="times[^"]*">/, '<span class="times">')}`;
  });
}

const widthOf = (row) => {
  const match = /class="fill" style="width:\s*([\d.]+)%/.exec(row);
  return match ? Number(match[1]) : 0;
};

// The index after the </div> closing the div that starts at `start`.
function closingOf(html, start) {
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match !== null; match = tags.exec(html)) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

const ROW = /<div class="chart-row([^"]*)">[\s\S]*?<\/span><\/div>/g;
const isOurs = (kind) => /(^|\s)us(\s|$)/.test(kind);

// The rows of ours in one chart, marked.
function markChart(chart) {
  const open = /^<div class="chart"([^>]*)>/.exec(chart);
  const lower = /data-better="lower"/.test(open[1]);
  const previous = /data-compare="previous"/.test(open[1]);
  const compilers = /data-compare="compilers"/.test(open[1]);
  const rows = [...chart.matchAll(ROW)].map((match) => ({ text: match[0], kind: match[1].replace(OUTCOMES, '') }));
  const others = rows
    .filter((row) => !isOurs(row.kind) && !(compilers && /(^|\s)interprets(\s|$)/.test(row.kind)))
    .map((row) => widthOf(row.text));
  let index = 0;
  return chart.replace(ROW, (text, kind) => {
    const i = index;
    index += 1;
    const clean = kind.replace(OUTCOMES, '');
    if (!isOurs(clean)) return text;
    const against = previous ? (i > 0 ? [widthOf(rows[i - 1].text)] : []) : others;
    const ours = widthOf(text);
    let outcome = 'even';
    if (against.length && ours > 0) {
      const best = lower ? Math.min(...against) : Math.max(...against);
      outcome = outcomeOf(lower ? best / ours : ours / best);
    }
    return text.replace(/class="chart-row[^"]*"/, `class="chart-row${clean} ${outcome}"`);
  });
}

function markCharts(html) {
  let out = '';
  let from = 0;
  const starts = /<div class="chart"[\s>]/g;
  for (let match = starts.exec(html); match !== null; match = starts.exec(html)) {
    const end = closingOf(html, match.index);
    out += html.slice(from, match.index) + markChart(html.slice(match.index, end));
    from = end;
    starts.lastIndex = end;
  }
  return out + html.slice(from);
}

function markOutcomes(html) {
  return markCharts(markPairs(html));
}

export { markOutcomes, outcomeOf };
