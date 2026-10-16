// Workbooks changed in place (patchXlsx, RuleBook.applyMatrix): only the cells set change, merged ranges cut by them are
// split, a cell that loses its formula takes the calculation chain with it; and the blocks of a sheet in its order.
import { RuleBook, readXlsx, writeXlsx, patchXlsx, blocksOf, RulesError } from '../index.js';
import { unzip, zip } from '@xufa/xlsx';

const sheetXml = (bytes, n = 1) => String(unzip(bytes).get(`xl/worksheets/sheet${n}.xml`));

// A rules table at A1 (its matrix from B6) and a sheet of notes.
function book() {
  return writeXlsx({
    sheets: [
      {
        name: 'RULES',
        rows: [
          [{ value: 'Rules Float BasePremium(String plan, Integer age)', style: 'title' }, null, null, null],
          ['C1', 'HC1', 'RET', null],
          ['plan', 'age', null, null],
          ['String', 'IntRange', 'Float', null],
          [null, '<25', '[25..60)', '>=60'],
          ['basic', { value: 120, style: 'value' }, 100, 150],
          ['premium', 220, 180, 260],
        ],
        merges: [{ top: 0, left: 0, bottom: 0, right: 3 }],
      },
      { name: 'NOTES', rows: [['kept', 1]] },
    ],
  });
}

describe('patchXlsx', () => {
  it('sets the cells given (new rows and cells too), keeping their styles and the rest of the workbook', () => {
    const bytes = book();
    const patched = patchXlsx(bytes, 'RULES', { B6: 125, D7: 'n/a', B9: true, C3: null });
    const [rules, notes] = readXlsx(patched).sheets;
    expect(rules.rows[5].slice(0, 4)).toEqual(['basic', 125, 100, 150]);
    expect(rules.rows[6][3]).toBe('n/a');
    expect(rules.rows[8][1]).toBe(true);
    expect(rules.rows[2][2] ?? null).toBe(null);
    expect(notes.rows).toEqual([['kept', 1]]);
    expect(rules.merges).toEqual(readXlsx(bytes).sheets[0].merges);
    // (The style of B6 is kept.)
    const style = (xml, ref) => new RegExp(`<c r="${ref}"[^>]*?\\bs="(\\d+)"`).exec(xml)?.[1];
    expect(style(sheetXml(patched), 'B6')).toBe(style(sheetXml(bytes), 'B6'));
    expect(sheetXml(patched, 2)).toBe(sheetXml(bytes, 2));
  });

  it('splits a merged range whose cells get different values, each keeping what the range showed', () => {
    const bytes = writeXlsx({
      sheets: [{ name: 'S', rows: [['a', 'b', null], ['x', null, null]], merges: [{ top: 1, left: 0, bottom: 1, right: 2 }] }],
    });
    const same = patchXlsx(bytes, 'S', { A2: 'y' }, { whole: { A2: 'y', B2: 'y', C2: 'y' } });
    expect(readXlsx(same).sheets[0].merges).toHaveLength(1);
    const cut = patchXlsx(bytes, 'S', { C2: 'z' }, { whole: { A2: 'x', B2: 'x', C2: 'z' } });
    const sheet = readXlsx(cut).sheets[0];
    expect(sheet.merges).toEqual([]);
    expect(sheet.rows[1]).toEqual(['x', 'x', 'z']);
  });

  it('drops the calculation chain when a cell with a formula is set', () => {
    const files = unzip(book());
    const path = 'xl/worksheets/sheet1.xml';
    files.set(path, String(files.get(path)).replace(/<c r="C6"[^>]*>[\s\S]*?<\/c>/, '<c r="C6"><f>B6-20</f><v>100</v></c>'));
    files.set('xl/calcChain.xml', '<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="C6" i="1"/></calcChain>');
    const rels = String(files.get('xl/_rels/workbook.xml.rels'));
    files.set(
      'xl/_rels/workbook.xml.rels',
      rels.replace('</Relationships>', '<Relationship Id="rIdCalc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>')
    );
    const withFormula = zip([...files]);
    expect(String(unzip(patchXlsx(withFormula, 'RULES', { B6: 1 })).get('xl/_rels/workbook.xml.rels'))).toContain('calcChain');
    const patched = unzip(patchXlsx(withFormula, 'RULES', { C6: 99 }));
    expect(patched.has('xl/calcChain.xml')).toBe(false);
    expect(String(patched.get('xl/_rels/workbook.xml.rels'))).not.toContain('calcChain');
    expect(String(patched.get(path))).not.toContain('<f>');
  });

  it('refuses a sheet the workbook does not have', () => {
    expect(() => patchXlsx(book(), 'NOPE', { A1: 1 })).toThrow(/no sheet NOPE/);
  });
});

describe('RuleBook.applyMatrix', () => {
  it('writes the cells of the matrix that change, and the book read again has it', () => {
    const bytes = book();
    const rules = RuleBook.fromXlsx(bytes);
    const matrix = [
      [120, 105, 150],
      [220, 180, 300],
    ];
    const changed = rules.applyMatrix(bytes, 'BasePremium', matrix);
    const again = RuleBook.fromXlsx(changed);
    expect(again.table('BasePremium').matrix).toEqual(matrix);
    expect(again.call('BasePremium', 'basic', 30)).toBe(105);
    expect(again.call('BasePremium', 'premium', 70)).toBe(300);
    expect(sheetXml(changed, 2)).toBe(sheetXml(bytes, 2));
    // (The same matrix: the same bytes.)
    expect(Buffer.compare(rules.applyMatrix(bytes, 'BasePremium', rules.table('BasePremium').matrix), bytes)).toBe(0);
  });

  it('refuses an unknown table, or a matrix of another size', () => {
    const bytes = book();
    const rules = RuleBook.fromXlsx(bytes);
    expect(() => rules.applyMatrix(bytes, 'Nope', [[1]])).toThrow('Table Nope not found');
    expect(() => rules.applyMatrix(bytes, 'BasePremium', [[1, 2, 3]])).toThrow('Matrix size does not match');
  });
});

describe('blocksOf', () => {
  it('gives the blocks of a sheet in its order: those split apart by columns before those below them', () => {
    const sheet = {
      name: 'S',
      rows: [
        ['A', 1, null, 'B', 2],
        [1, 2, null, 3, 4],
        [null, null, null, null, null],
        ['C', 3, null, null, null],
      ],
    };
    expect(blocksOf(sheet).map((block) => [block.rows[0][0], block.row, block.column])).toEqual([
      ['A', 0, 0],
      ['B', 0, 3],
      ['C', 3, 0],
    ]);
  });
});

describe('errors building a table', () => {
  it('say where, and keep what was wrong (reason) and the cell apart', () => {
    let error;
    try {
      RuleBook.fromSheets([
        {
          name: 'S',
          rows: [
            [null, null],
            [null, 'Rules A(String x)', null],
            [null, 'C1', 'RET'],
            [null, 'x', null],
            [null, 'String', 'String'],
            [null, 'a', '1'],
            [null, 'a', '2'],
          ],
        },
      ]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(RulesError);
    expect(error.message).toMatch(/^Error building table at S!B2: Duplicated combination/);
    expect(error.reason).toMatch(/^Duplicated combination at table A/);
    expect(error.cell).toEqual({ sheet: 'S', row: 1, column: 1 });
  });
});
