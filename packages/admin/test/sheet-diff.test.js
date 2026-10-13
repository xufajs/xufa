// The rows of two versions of a sheet lined up (the editor's side by side and its comparison): rows both have, rows
// inserted and deleted, rows changed paired by the cells they share, and the cells that differ on each side.
import { alignRows, sheetDiff } from '../client/src/views/sheet-diff.js';

const pairsOf = (before, after) => alignRows(before, after).map(({ before: i, after: j }) => [i, j]);

describe('rows of two versions of a sheet, lined up', () => {
  it('a row inserted, one deleted: the others lined up, not moved', () => {
    const before = [['Rules'], ['a', 1], ['b', 2], ['c', 3], [], ['x']];
    expect(pairsOf(before, [['Rules'], ['a', 1], ['new', 9], ['b', 2], ['c', 3], [], ['x']])).toEqual([
      [0, 0],
      [1, 1],
      [null, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ]);
    expect(pairsOf(before, [['Rules'], ['b', 2], ['c', 3], [], ['x']])).toEqual([
      [0, 0],
      [1, null],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
    ]);
  });

  it('rows changed among rows inserted: paired with the row they share most cells with', () => {
    const before = [['T'], ['gold', '25+', 0.05], ['end']];
    const after = [['T'], ['silver', '<25', 0.02], ['gold', '25+', 0.1], ['end']];
    expect(pairsOf(before, after)).toEqual([
      [0, 0],
      [null, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('rows written anew between the same rows: paired in order, as changed rows; the ones left over inserted', () => {
    expect(pairsOf([['T'], ['x', 1], ['end']], [['T'], ['y', 2], ['z', 3], ['end']])).toEqual([
      [0, 0],
      [1, 1],
      [null, 2],
      [2, 3],
    ]);
  });

  it('the cells that differ: of rows paired on both sides, of rows of one side those with a value', () => {
    const before = [['T'], ['a', 1], ['b', 2], ['gone', 7]];
    const after = [['T'], ['a', 1], ['new', null, 'x'], ['b', 3]];
    const diff = sheetDiff(before, after);
    expect(diff.pairs.map(({ before: i, after: j }) => [i, j])).toEqual([
      [0, 0],
      [1, 1],
      [null, 2],
      [2, 3],
      [3, null],
    ]);
    expect([...diff.added]).toEqual([2]);
    expect([...diff.removed]).toEqual([3]);
    expect(diff.afterCells).toEqual([
      { row: 2, column: 0, other: '' },
      { row: 2, column: 2, other: '' },
      { row: 3, column: 1, other: '2' },
    ]);
    expect(diff.beforeCells).toEqual([
      { row: 2, column: 1, other: '3' },
      { row: 3, column: 0, other: '' },
      { row: 3, column: 1, other: '' },
    ]);
  });

  it('empty rows at the end count for nothing; sheets alike are rows alike', () => {
    const rows = [
      ['a', 1],
      [null, null],
      ['b', 2],
    ];
    expect(pairsOf(rows, [...rows, [], [null]])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(sheetDiff(rows, [...rows]).afterCells).toEqual([]);
  });
});
