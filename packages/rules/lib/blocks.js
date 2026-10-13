// The tables of a sheet: blocks of cells apart from the others by empty rows or columns. A block is split at its first
// empty rows, else at its first empty columns, again and again, as the engine this one follows does (a table is a
// block whose first cell names it: "Rules ...", "Spreadsheet ...").

// Empty: no value (an empty text is one, as in the engine this one follows: it keeps a table together).
const isEmpty = (value) => value === null || value === undefined;

// The cells of merged ranges take the value of their first one, as Excel shows them (a title merged over a table is
// in every cell of its row: the table is not split under it).
function fillMerges(rows, merges = []) {
  for (const { top, left, bottom, right } of merges) {
    const value = rows[top]?.[left];
    if (isEmpty(value)) continue;
    for (let r = top; r <= bottom; r += 1) {
      if (!rows[r]) continue;
      for (let c = left; c <= right; c += 1) if (c < rows[r].length) rows[r][c] = value;
    }
  }
  return rows;
}

const emptyRow = (rows, r) => !rows[r] || rows[r].every(isEmpty);
const emptyColumn = (rows, c) => rows.every((row) => isEmpty(row[c]));

function split(block) {
  const { rows } = block;
  const height = rows.length;
  for (let r = 0; r < height; r += 1) {
    if (!emptyRow(rows, r)) continue;
    let next = r;
    while (next + 1 < height && emptyRow(rows, next + 1)) next += 1;
    return [
      { rows: rows.slice(0, r), row: block.row, column: block.column },
      { rows: rows.slice(next + 1), row: block.row + next + 1, column: block.column },
    ].filter((part) => part.rows.length > 0);
  }
  const width = rows[0]?.length ?? 0;
  for (let c = 0; c < width; c += 1) {
    if (!emptyColumn(rows, c)) continue;
    let next = c;
    while (next + 1 < width && emptyColumn(rows, next + 1)) next += 1;
    return [
      { rows: rows.map((row) => row.slice(0, c)), row: block.row, column: block.column },
      { rows: rows.map((row) => row.slice(next + 1)), row: block.row, column: block.column + next + 1 },
    ].filter((part) => part.rows[0]?.length > 0);
  }
  return [block];
}

// [{ rows, sheet, row, column }] of a sheet (rows of values, null where empty; row and column of its first cell, from 0).
function blocksOf(sheet) {
  const rows = fillMerges(
    sheet.rows.map((row) => row.map((value) => (isEmpty(value) ? null : value))),
    sheet.merges
  );
  let pending = [{ rows, row: 0, column: 0 }];
  const done = [];
  while (pending.length) {
    const next = [];
    for (const block of pending) {
      const parts = split(block);
      if (parts.length === 1 && parts[0] === block) done.push(block);
      else next.push(...parts);
    }
    pending = next;
  }
  // The merged ranges inside each block, from its first cell (a merge across a table says what its cells mean).
  const mergesOf = (block) => {
    const height = block.rows.length;
    const width = block.rows[0]?.length ?? 0;
    return (sheet.merges || [])
      .filter(
        (m) =>
          m.top >= block.row &&
          m.left >= block.column &&
          m.bottom < block.row + height &&
          m.right < block.column + width
      )
      .map((m) => ({
        top: m.top - block.row,
        left: m.left - block.column,
        bottom: m.bottom - block.row,
        right: m.right - block.column,
      }));
  };
  return done
    .filter((block) => block.rows.length > 0 && !isEmpty(block.rows[0][0]))
    .map((block) => ({ ...block, merges: mergesOf(block), sheet: sheet.name }));
}

export { blocksOf, fillMerges, isEmpty };
