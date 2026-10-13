// Gaps and overlaps of decision tables, as OpenL Tablets analyses them: the values of the parameters that no rule
// meets (gaps), those that several meet (overlaps: the first wins, unless the table collects), and the rules that
// never give a result (shadowed by the rules before them, or with conditions that no value meets).
//
// Conditions only change at their values and the ends of their ranges, so one value of each interval between those
// (and below and above them all, and one text of none of the listed) stands for all of it: the combinations of those
// values are every case of the table. Conditions written as expressions are not analysed: they are taken as met (the
// table's analysis is then partial: a gap is certain, an overlap possible).
import { pointsOf, kindOf } from './conditions.js';

// A text that no condition lists ("any other").
const OTHER = `${String.fromCharCode(0)}other`;
const DAY = 86400000;
const INTEGER = /^(integer|int|long|short|byte|biginteger|intrange)$/i;
const LIMIT = 100000;
const EXAMPLES = 20;
// (The most gaps merged into ranges.)
const MERGED = 10000;

const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// The values that stand for every case of a dimension, each with how it is shown: { value, show }.
function samplesOf({ kind, points, integer }) {
  if (kind === 'boolean') {
    return [
      { value: true, show: true },
      { value: false, show: false },
    ];
  }
  if (kind === 'text') {
    const listed = [...new Set(points.map(String))];
    return [
      ...listed.map((value) => ({ value, show: value })),
      { value: OTHER, show: listed.length ? `not ${listed.join(', ')}` : 'any' },
    ];
  }
  // (Numbers and dates: each the interval it stands for, lo..hi, its ends in or not.)
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const date = kind === 'date';
  const valueOf = (time) => (date ? new Date(time) : time);
  const shown = (time) => (date ? new Date(time).toISOString().slice(0, 10) : time);
  const sample = (value, lo, hi, closed) => ({
    value: valueOf(value),
    lo,
    hi,
    closed,
    show: intervalText({ lo, hi, loIn: closed, hiIn: closed }, shown),
    shown,
  });
  if (!sorted.length) return [{ ...sample(0, -Infinity, Infinity, false), show: 'any' }];
  const step = date ? DAY : integer ? 1 : null;
  const samples = [sample(sorted[0] - (step ?? 1), -Infinity, sorted[0], false)];
  sorted.forEach((point, i) => {
    samples.push(sample(point, point, point, true));
    const next = sorted[i + 1];
    if (next === undefined || (step && next - point <= step)) return;
    samples.push(sample(step ? point + step : (point + next) / 2, point, next, false));
  });
  samples.push(sample(sorted.at(-1) + (step ?? 1), sorted.at(-1), Infinity, false));
  return samples;
}

// An interval as the conditions write it (it can be pasted in a rule): 18, <18, <=64, >=18, (18..64], any.
function intervalText({ lo, hi, loIn, hiIn }, shown) {
  if (lo === -Infinity && hi === Infinity) return 'any';
  if (lo === hi) return shown(lo);
  if (lo === -Infinity) return `${hiIn ? '<=' : '<'}${shown(hi)}`;
  if (hi === Infinity) return `${loIn ? '>=' : '>'}${shown(lo)}`;
  return `${loIn ? '[' : '('}${shown(lo)}..${shown(hi)}${hiIn ? ']' : ')'}`;
}

// How a run of samples of a dimension is shown (from..to, their indexes): a range of numbers or dates, a list of
// texts (or those they are not), any.
function runText(list, from, to) {
  if (from === to) return list[from].show;
  if (from === 0 && to === list.length - 1) return 'any';
  const first = list[from];
  const last = list[to];
  if (first.shown) {
    return intervalText({ lo: first.lo, hi: last.hi, loIn: first.closed, hiIn: last.closed }, first.shown);
  }
  const run = list.slice(from, to + 1);
  if (run.some((item) => item.value === OTHER)) {
    return `not ${list
      .filter((_, i) => i < from || i > to)
      .map((item) => item.show)
      .join(', ')}`;
  }
  return run.map((item) => item.show).join(', ');
}

// Gaps (the indexes of their samples) merged: those the same but in one dimension, with consecutive samples of it,
// are one gap of the run of them; dimension by dimension. Each gap: [from, to] of each dimension.
function mergeGaps(gaps, dimensions) {
  let merged = gaps.map((gap) => gap.map((index) => [index, index]));
  for (let d = 0; d < dimensions; d += 1) {
    const groups = new Map();
    for (const gap of merged) {
      const key = gap.map((range, e) => (e === d ? '' : range.join('-'))).join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(gap);
    }
    merged = [];
    for (const group of groups.values()) {
      group.sort((a, b) => a[d][0] - b[d][0]);
      let current = null;
      for (const gap of group) {
        if (current && gap[d][0] === current[d][1] + 1) current[d] = [current[d][0], gap[d][1]];
        else {
          current = gap.map((range) => [...range]);
          merged.push(current);
        }
      }
    }
  }
  return merged;
}

// The cases of an axis: each combination of the samples of its dimensions, the rules that meet it.
function analyseAxis(axis, collect) {
  const samples = axis.dimensions.map(samplesOf);
  const total = samples.reduce((product, list) => product * list.length, 1);
  const report = {
    axis: axis.name,
    dimensions: axis.dimensions.map((dimension) => dimension.name),
    rules: axis.rules.map(({ id, name, cell }) => ({ id, ...(name ? { name } : {}), cell })),
    ...(axis.add ? { add: axis.add } : {}),
    cases: Math.min(total, LIMIT),
    truncated: total > LIMIT,
    partial: axis.rules.some((rule) => rule.expressions),
    gaps: [],
    gapCount: 0,
    overlaps: [],
    shadowed: [],
    never: [],
  };
  const met = new Set();
  const first = new Set();
  const overlaps = new Map();
  const gaps = [];
  const indexes = samples.map(() => 0);
  for (let n = 0; n < report.cases; n += 1) {
    const values = indexes.map((index, d) => samples[d][index]);
    const matching = [];
    for (const rule of axis.rules) {
      if (rule.empty) continue;
      if (rule.tests.every((test, d) => test(values[d].value))) matching.push(rule.id);
    }
    const shown = () => Object.fromEntries(values.map((sample, d) => [report.dimensions[d], sample.show]));
    if (!matching.length) {
      report.gapCount += 1;
      if (gaps.length < MERGED) gaps.push([...indexes]);
    } else {
      matching.forEach((id) => met.add(id));
      first.add(matching[0]);
      if (matching.length > 1 && !collect) {
        const key = matching.join(',');
        const overlap = overlaps.get(key);
        if (overlap) overlap.count += 1;
        else overlaps.set(key, { rules: matching, count: 1, example: shown() });
      }
    }
    // (The next combination, the last dimension first.)
    for (let d = indexes.length - 1; d >= 0; d -= 1) {
      indexes[d] += 1;
      if (indexes[d] < samples[d].length) break;
      indexes[d] = 0;
    }
  }
  // (gapCount: the cases; gaps: those merged into ranges, as many as EXAMPLES; moreGaps: there are more.)
  const merged = mergeGaps(gaps, samples.length);
  report.moreGaps = merged.length > EXAMPLES || gaps.length === MERGED;
  report.gaps = merged
    .slice(0, EXAMPLES)
    .map((gap) =>
      Object.fromEntries(gap.map(([from, to], d) => [report.dimensions[d], runText(samples[d], from, to)]))
    );
  report.overlaps = [...overlaps.values()].slice(0, EXAMPLES);
  for (const rule of axis.rules) {
    if (rule.empty || !met.has(rule.id)) report.never.push(rule.id);
    else if (!collect && !first.has(rule.id)) report.shadowed.push(rule.id);
  }
  return report;
}

// The axes of a SmartRules/SimpleRules table: one, its rules over its conditions.
function smartRulesAxes(table) {
  const dimensions = [];
  const at = [];
  const { position } = table;
  const places = [];
  table.conditions.forEach((condition, c) => {
    if (condition.expression) return;
    const { group } = condition;
    // (A range of two columns takes no value of a gap: from and to are left to write.)
    places.push(group.last > group.first ? null : group.first);
    const cells = table.rows
      .slice(table.bodyStart ?? 2)
      .flatMap((row) => (group.last > group.first ? [row[group.first], row[group.last]] : [row[group.first]]));
    dimensions.push({
      name: condition.path.join('.'),
      kind: kindOf(condition.type),
      integer: INTEGER.test(condition.type),
      points: cells.flatMap((cell) => pointsOf(cell, condition.type)),
    });
    at.push(c);
  });
  const rules = table.rules.map((rule, r) => ({
    id: r + 1,
    name: rule.name ?? undefined,
    cell: table.sheetCell((table.bodyStart ?? 2) + r, 0),
    tests: at.map((c) => rule.tests[c]),
    expressions: rule.tests.some((test) => test.context),
    empty: rule.cells.every((cell) => !cell.run && isEmpty(cell.value)),
  }));
  const add = position && {
    row: table.sheetCell((table.bodyStart ?? 2) + rules.length, 0).row,
    cells: places.map((column) =>
      column === null ? null : { column: position.column + column, lists: true, ranges: true }
    ),
    focus: { column: position.column + table.results[0].first },
  };
  return [{ name: 'rules', dimensions, rules, add }];
}

// The axes of a SmartLookup/SimpleLookup table: its rows (the arguments down) and columns (across).
function lookupAxes(table) {
  const across = table.horizontal.length;
  const top = table.rows.slice(1, 1 + across);
  const body = table.rows.slice(1 + across);
  const dimension = (param, cells) => ({
    name: param.name,
    kind: kindOf(param.type),
    integer: INTEGER.test(param.type),
    points: cells.flatMap((cell) => pointsOf(cell, param.type)),
  });
  const { position } = table;
  const firstRow = table.sheetCell(1 + across, 0).row;
  const axes = [
    {
      name: 'rows',
      add: position && {
        row: table.sheetCell(1 + across + table.lookupRows.length, 0).row,
        cells: table.vertical.map((_, i) => ({ column: position.column + i, lists: true, ranges: true })),
        focus: { column: position.column + (table.columns[0]?.column ?? table.vertical.length) },
      },
      dimensions: table.vertical.map((param, i) =>
        dimension(
          param,
          body.map((row) => row[i])
        )
      ),
      rules: table.lookupRows.map((row, r) => ({
        id: r + 1,
        cell: table.sheetCell(1 + across + r, 0),
        tests: row.tests,
        empty: row.cells.every((cell) => !cell.run && isEmpty(cell.value)),
      })),
    },
  ];
  if (across) {
    axes.push({
      name: 'columns',
      add: position && {
        column: position.column + position.width,
        cells: table.horizontal.map((_, i) => ({ row: table.sheetCell(1 + i, 0).row, lists: true, ranges: true })),
        focus: { row: firstRow },
      },
      dimensions: table.horizontal.map((param, i) =>
        dimension(
          param,
          table.columns.map(({ column }) => top[i]?.[column])
        )
      ),
      rules: table.columns.map((column, c) => ({
        id: c + 1,
        cell: table.sheetCell(1, column.column),
        tests: column.tests,
        empty: table.lookupRows.every((row) => !row.cells[c].run && isEmpty(row.cells[c].value)),
      })),
    });
  }
  return axes;
}

// The axes of a Rules/Multi table: the rows of its C parameters and the columns of its HC ones.
function rulesAxes(table) {
  const axis = (name, params, cellOf, addOf) => {
    const plain = params.filter((param) => param.type !== 'Nested');
    if (!plain.length) return null;
    const count = plain[0].headers.length;
    return {
      name,
      // (Texts of one value: these tables take no lists; ranges in the types of ranges.)
      add:
        position &&
        addOf(
          count,
          plain.map((param) => ({ index: params.indexOf(param), ranges: /range$/i.test(param.positionType) }))
        ),
      dimensions: plain.map((param) => ({
        name: param.name,
        kind: ['String', 'Nested', 'Code'].includes(param.positionType) ? 'text' : 'number',
        integer: /^int/i.test(param.positionType),
        points: param.headers.flatMap((condition) =>
          [condition.value, condition.valueLeft, condition.valueRight].filter(
            (value) => value !== undefined && (typeof value === 'string' || Number.isFinite(value))
          )
        ),
      })),
      rules: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        cell: cellOf(i),
        tests: plain.map((param) => table.tests.get(param)[i]),
      })),
    };
  };
  const { position } = table;
  const width = table.columnParams.length;
  return [
    axis(
      'rows',
      table.columnParams,
      (i) => ({ ...table.sheetCell(i, 0), column: position?.column ?? 0 }),
      (count, places) => ({
        row: table.sheetCell(count, 0).row,
        cells: places.map(({ index, ranges }) => ({ column: position.column + index, lists: false, ranges })),
        focus: { column: position.column + width },
      })
    ),
    axis(
      'columns',
      table.rowParams,
      (i) => table.sheetCell(-table.rowParams.length, i),
      (count, places) => ({
        column: table.sheetCell(0, count).column,
        cells: places.map(({ index, ranges }) => ({
          row: table.sheetCell(index - table.rowParams.length, 0).row,
          lists: false,
          ranges,
        })),
        focus: { row: table.sheetCell(0, 0).row },
      })
    ),
  ].filter(Boolean);
}

// The analysis of a decision table (null for tables of other kinds).
function analyse(table) {
  let axes;
  let collect = false;
  if (table.className === 'SmartTable') {
    table.prepare();
    axes = table.isLookup ? lookupAxes(table) : smartRulesAxes(table);
    collect = table.collect;
  } else if (table.className === 'RulesTable') {
    table.prepare();
    axes = rulesAxes(table);
    collect = table.isMulti;
  } else return null;
  return {
    table: table.name,
    kind: table.kind ?? (table.isMulti ? 'Multi' : 'Rules'),
    position: table.position ?? null,
    ...(table.properties ? { properties: table.properties } : {}),
    collect,
    axes: axes.map((axis) => analyseAxis(axis, collect)),
    ...(table.isLookup ? { holes: holesOf(table) } : {}),
  };
}

// The cells of a lookup without a result: the row and the column met, nothing given.
function holesOf(table) {
  const across = table.horizontal.length;
  const holes = [];
  table.lookupRows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.run && isEmpty(cell.value)) {
        holes.push({ row: r + 1, column: c + 1, cell: table.sheetCell(1 + across + r, table.columns[c].column) });
      }
    })
  );
  return holes;
}

export { analyse, samplesOf };
