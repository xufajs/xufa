// Workbooks written and read back (values, dates, merged ranges, widths), the styles of written cells as their XML says
// them, cells patched in place, the zip they are made of, and the errors.
import { readXlsx, writeXlsx, patchXlsx, zip, unzip, cellAt, columnName, refOf, XlsxError, ZipError } from '../index.js';

const part = (bytes, name) => String(unzip(bytes).get(name));
const sheetXml = (bytes, n = 1) => part(bytes, `xl/worksheets/sheet${n}.xml`);
// The <xf> of the cell format of a cell of the first sheet.
function xfOf(bytes, ref) {
  const match = new RegExp(`<c r="${ref}"(?: s="(\\d+)")?`).exec(sheetXml(bytes));
  const xfs = /<cellXfs[^>]*>(.*)<\/cellXfs>/.exec(part(bytes, 'xl/styles.xml'))[1].match(/<xf [^>]*?(\/>|>.*?<\/xf>)/g);
  return xfs[Number(match[1] || 0)];
}
// The n-th element of a kind of styles.xml (fonts, fills, borders).
function styleItem(bytes, kind, index) {
  const list = new RegExp(`<${kind}s count="\\d+">(.*?)</${kind}s>`).exec(part(bytes, 'xl/styles.xml'))[1];
  return list.match(new RegExp(`<${kind}>.*?</${kind}>`, 'g'))[index];
}
const idOf = (xf, name) => Number(new RegExp(`${name}="(\\d+)"`).exec(xf)[1]);

describe('writeXlsx and readXlsx', () => {
  it('give back the values (texts, numbers, booleans, dates, empty cells), merged ranges and the sheets in order', () => {
    const date = new Date(Date.UTC(2026, 9, 15, 12, 30));
    const bytes = writeXlsx({
      sheets: [
        {
          name: 'Books',
          rows: [
            ['Title', 'Pages', 'Read', 'Since'],
            ['Dune', 412, true, date],
            ['<a & "b">', -1.5, false, null],
          ],
          merges: [{ top: 0, left: 0, bottom: 0, right: 1 }],
        },
        { name: 'Notes é', rows: [[], ['', 'x']] },
      ],
    });
    const [books, notes] = readXlsx(bytes).sheets;
    expect(books).toEqual({
      name: 'Books',
      rows: [
        ['Title', 'Pages', 'Read', 'Since'],
        ['Dune', 412, true, date],
        ['<a & "b">', -1.5, false, null],
      ],
      merges: [{ top: 0, left: 0, bottom: 0, right: 1 }],
    });
    expect(notes).toEqual({ name: 'Notes é', rows: [[null, null], ['', 'x']], merges: [] });
  });

  it('writes the styles of cells: fonts, fills, borders, alignment, formats; each once in the workbook', () => {
    const centered = { align: 'center', valign: 'middle', border: 'thin' };
    const bytes = writeXlsx({
      sheets: [
        {
          name: 'S',
          rows: [
            [
              { value: 'a', style: centered },
              { value: 'b', style: { ...centered } },
              { value: 'c', style: { bold: true, italic: true, size: 14, color: '#FF0000', fill: 'FFFF00', wrap: true } },
              { value: 0.25, style: { format: '0.00%' } },
              { value: new Date(Date.UTC(2026, 0, 1)), style: { border: { top: 'medium', bottom: 'double' } } },
              { value: 'h', style: 'header' },
              'plain',
            ],
          ],
        },
      ],
    });
    const a = xfOf(bytes, 'A1');
    expect(a).toBe(xfOf(bytes, 'B1'));
    expect(a).toContain('<alignment horizontal="center" vertical="center"/>');
    expect(styleItem(bytes, 'border', idOf(a, 'borderId'))).toBe(
      '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>'
    );
    const c = xfOf(bytes, 'C1');
    expect(styleItem(bytes, 'font', idOf(c, 'fontId'))).toBe(
      '<font><b/><i/><sz val="14"/><color rgb="FFFF0000"/><name val="Calibri"/></font>'
    );
    expect(styleItem(bytes, 'fill', idOf(c, 'fillId'))).toContain('<fgColor rgb="FFFFFF00"/>');
    expect(c).toContain('wrapText="1"');
    const d = xfOf(bytes, 'D1');
    expect(part(bytes, 'xl/styles.xml')).toContain(`<numFmt numFmtId="${idOf(d, 'numFmtId')}" formatCode="0.00%"/>`);
    const e = xfOf(bytes, 'E1');
    expect(idOf(e, 'numFmtId')).toBe(14);
    expect(styleItem(bytes, 'border', idOf(e, 'borderId'))).toBe(
      '<border><left/><right/><top style="medium"/><bottom style="double"/><diagonal/></border>'
    );
    expect(styleItem(bytes, 'font', idOf(xfOf(bytes, 'F1'), 'fontId'))).toBe(
      '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    );
    expect(xfOf(bytes, 'G1')).toBe('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    // (Read back: the date is a date, by its format.)
    expect(readXlsx(bytes).sheets[0].rows[0][4]).toEqual(new Date(Date.UTC(2026, 0, 1)));
  });

  it('writes widths of columns and a default width', () => {
    const xml = sheetXml(writeXlsx({ sheets: [{ name: 'S', rows: [['a', 'b']], widths: [30, 0, 12], defaultWidth: 15 }] }));
    expect(xml).toContain('<sheetFormatPr defaultRowHeight="15" defaultColWidth="15"/>');
    expect(xml).toContain('<cols><col min="1" max="1" width="30" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/></cols>');
  });

  it('errors: a workbook without sheets, a bad name of a sheet, a style, a color; bytes that are not a workbook', () => {
    const write = (sheets) => () => writeXlsx({ sheets });
    expect(write([])).toThrow(new XlsxError('A workbook needs a sheet'));
    expect(write([{ name: 'a/b', rows: [] }])).toThrow('Invalid name of a sheet: a/b');
    expect(write([{ name: 'A', rows: [] }, { name: 'a', rows: [] }])).toThrow('Invalid name of a sheet: a');
    // A merge is { top, left, bottom, right } (an A1 reference is not one: it was written as NaN, which Excel refuses).
    expect(write([{ name: 'A', rows: [], merges: ['A1:B1'] }])).toThrow('Invalid merge');
    expect(write([{ name: 'A', rows: [], merges: [{ top: 1, left: 0, bottom: 0, right: 1 }] }])).toThrow('Invalid merge');
    expect(write([{ name: 'S', rows: [[{ value: 1, style: 'bold' }]] }])).toThrow('Invalid style of a cell: bold');
    expect(write([{ name: 'S', rows: [[{ value: 1, style: { fill: 'red' } }]] }])).toThrow('Invalid color: red');
    expect(write([{ name: 'S', rows: [[{ value: 1, style: { border: 'wavy' } }]] }])).toThrow('Invalid border: wavy');
    let error;
    try {
      readXlsx(Buffer.from('not a zip'));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ZipError);
    expect(error).toBeInstanceOf(XlsxError);
    expect(error.code).toBe('XUFA_XLSX_ERR_ZIP');
    expect(() => readXlsx(zip([['a.txt', 'x']]))).toThrow(
      expect.objectContaining({ code: 'XUFA_XLSX_ERR', message: 'Not a workbook of Excel (no xl/workbook.xml)' })
    );
  });
});

describe('patchXlsx', () => {
  it('sets cells of a sheet and keeps the rest: styles, other sheets', () => {
    const bytes = writeXlsx({
      sheets: [
        { name: 'S', rows: [[{ value: 'Title', style: 'title' }, 1], ['x', 2]] },
        { name: 'T', rows: [['kept']] },
      ],
    });
    const patched = patchXlsx(bytes, 'S', { B1: 10, A3: 'new' });
    const [s, t] = readXlsx(patched).sheets;
    expect(s.rows).toEqual([
      ['Title', 10],
      ['x', 2],
      ['new', null],
    ]);
    expect(t.rows).toEqual([['kept']]);
    expect(xfOf(patched, 'A1')).toBe(xfOf(bytes, 'A1'));
    expect(() => patchXlsx(bytes, 'Nope', { A1: 1 })).toThrow(new XlsxError('The workbook has no sheet Nope'));
  });
});

describe('zip, unzip and references', () => {
  it('zip and unzip: entries of texts and bytes, the same bytes for the same entries', () => {
    const entries = [
      ['a.txt', 'héllo'],
      ['b/c.bin', Buffer.from([0, 1, 2, 255])],
    ];
    const files = unzip(zip(entries));
    expect([...files.keys()]).toEqual(['a.txt', 'b/c.bin']);
    expect(files.get('a.txt').toString('utf8')).toBe('héllo');
    expect([...files.get('b/c.bin')]).toEqual([0, 1, 2, 255]);
    expect(zip(entries).equals(zip(entries))).toBe(true);
  });

  it('cellAt, columnName and refOf', () => {
    expect(cellAt('AB12')).toEqual({ row: 11, column: 27 });
    expect([columnName(0), columnName(25), columnName(26), columnName(701), columnName(702)]).toEqual([
      'A',
      'Z',
      'AA',
      'ZZ',
      'AAA',
    ]);
    expect(refOf(11, 27)).toBe('AB12');
    expect(() => cellAt('12A')).toThrow(new XlsxError('Invalid reference of a cell: 12A'));
  });
});
