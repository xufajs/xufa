// The rows of two versions of a sheet lined up as a diff shows them: the rows both have, in order (a longest common
// subsequence), and between them the rows of one alone (inserted, deleted) or of both, changed (paired by the cells
// they share). Then the cells that differ: those of rows paired, and those of rows of one side alone.

const textOf = (value) => (value === null || value === undefined ? '' : String(value));
// (The texts of a row without its empty cells at the end.)
const keyOf = (row) => {
  const texts = (row || []).map(textOf);
  while (texts.length && texts[texts.length - 1] === '') texts.pop();
  return texts.length ? JSON.stringify(texts) : '';
};

// (Larger middles than this are paired row by row: a diff of them would take too much memory.)
const MAX_CELLS = 4e6;

// The pairs of indices of a longest common subsequence of two lists of keys, in order.
function common(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m || n * m > MAX_CELLS) return [];
  // lengths[i][j]: of a[i..], b[j..].
  const lengths = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[at(i, j)] =
        a[i] === b[j] ? lengths[at(i + 1, j + 1)] + 1 : Math.max(lengths[at(i + 1, j)], lengths[at(i, j + 1)]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (lengths[at(i + 1, j)] >= lengths[at(i, j + 1)]) i += 1;
    else j += 1;
  }
  return pairs;
}

// How alike two rows are: their equal cells that have a value, column by column.
function likeness(a, b) {
  let same = 0;
  for (let c = 0; c < Math.max(a.length, b.length); c += 1) {
    const text = textOf(a[c]);
    if (text !== '' && text === textOf(b[c])) same += 1;
  }
  return same;
}

// The rows of one run of each side (between rows both have): paired where they are alike (most alike first, in order),
// the others alone. Each { before, after }, null on the side that lacks the row.
function pairRun(before, after, olds, nows) {
  const n = olds.length;
  const m = nows.length;
  if (!n || !m)
    return [...olds.map((i) => ({ before: i, after: null })), ...nows.map((j) => ({ before: null, after: j }))];
  // (Long runs: row by row.)
  if (n * m > MAX_CELLS / 16) {
    const pairs = [];
    for (let k = 0; k < Math.max(n, m); k += 1) pairs.push({ before: olds[k] ?? null, after: nows[k] ?? null });
    return pairs;
  }
  // best[i][j]: the most likeness of pairs of olds[i..] and nows[j..], in order.
  const best = new Float64Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  const score = (i, j) => likeness(before[olds[i]] || [], after[nows[j]] || []);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const like = score(i, j);
      best[at(i, j)] = Math.max(best[at(i + 1, j)], best[at(i, j + 1)], like > 0 ? like + best[at(i + 1, j + 1)] : 0);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const like = score(i, j);
    if (like > 0 && best[at(i, j)] === like + best[at(i + 1, j + 1)]) {
      pairs.push({ before: olds[i], after: nows[j] });
      i += 1;
      j += 1;
    } else if (best[at(i + 1, j)] >= best[at(i, j + 1)]) {
      pairs.push({ before: olds[i], after: null });
      i += 1;
    } else {
      pairs.push({ before: null, after: nows[j] });
      j += 1;
    }
  }
  for (; i < n; i += 1) pairs.push({ before: olds[i], after: null });
  for (; j < m; j += 1) pairs.push({ before: null, after: nows[j] });
  return zipped(pairs);
}

// Rows of one side alone and of the other between the same rows paired: paired in order, as changed rows (a rule
// written anew is a row changed; the rows left over are those inserted or deleted).
function zipped(pairs) {
  const result = [];
  let olds = [];
  let nows = [];
  const flush = () => {
    for (let k = 0; k < Math.max(olds.length, nows.length); k += 1) {
      result.push({ before: olds[k] ?? null, after: nows[k] ?? null });
    }
    olds = [];
    nows = [];
  };
  for (const pair of pairs) {
    if (pair.before !== null && pair.after !== null) {
      flush();
      result.push(pair);
    } else if (pair.before !== null) olds.push(pair.before);
    else nows.push(pair.after);
  }
  flush();
  return result;
}

// The rows of two sheets (their rows of cells) lined up: [{ before, after }], the index of the row on each side, null
// on the side that lacks it.
function alignRows(before, after) {
  const end = (rows) => {
    let last = rows.length;
    while (last > 0 && keyOf(rows[last - 1]) === '') last -= 1;
    return last;
  };
  const a = before.slice(0, end(before)).map(keyOf);
  const b = after.slice(0, end(after)).map(keyOf);
  const pairs = [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    pairs.push({ before: start, after: start });
    start += 1;
  }
  let tail = 0;
  while (tail < a.length - start && tail < b.length - start && a[a.length - 1 - tail] === b[b.length - 1 - tail])
    tail += 1;
  const middle = common(a.slice(start, a.length - tail), b.slice(start, b.length - tail)).map(([i, j]) => [
    i + start,
    j + start,
  ]);
  let i = start;
  let j = start;
  for (const [ci, cj] of [...middle, [a.length - tail, b.length - tail]]) {
    const olds = [];
    const nows = [];
    for (; i < ci; i += 1) olds.push(i);
    for (; j < cj; j += 1) nows.push(j);
    pairs.push(...pairRun(before, after, olds, nows));
    if (ci < a.length - tail) pairs.push({ before: ci, after: cj });
    i = ci + 1;
    j = cj + 1;
  }
  for (let k = 0; k < tail; k += 1) pairs.push({ before: a.length - tail + k, after: b.length - tail + k });
  return pairs;
}

// What differs between two sheets: the rows lined up (pairs), the rows of one side alone (removed: of before, added:
// of after), and the cells that differ on each side ({ row, column, other: the text of the other side }): of rows
// paired, those whose texts differ; of rows alone, those with a value.
function sheetDiff(before, after) {
  const pairs = alignRows(before, after);
  const beforeCells = [];
  const afterCells = [];
  const removed = new Set();
  const added = new Set();
  for (const { before: i, after: j } of pairs) {
    const old = i === null ? [] : before[i] || [];
    const now = j === null ? [] : after[j] || [];
    if (i === null) added.add(j);
    if (j === null) removed.add(i);
    for (let c = 0; c < Math.max(old.length, now.length); c += 1) {
      const then = textOf(old[c]);
      const text = textOf(now[c]);
      if (then === text) continue;
      if (j !== null && (i !== null || text !== '')) afterCells.push({ row: j, column: c, other: then });
      if (i !== null && (j !== null || then !== '')) beforeCells.push({ row: i, column: c, other: text });
    }
  }
  return { pairs, removed, added, beforeCells, afterCells };
}

export { alignRows, sheetDiff };
