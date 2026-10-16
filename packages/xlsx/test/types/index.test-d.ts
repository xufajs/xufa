import { expectTypeOf } from '@xufa/test';
import { readXlsx, writeXlsx, patchXlsx, unzip, zip, cellAt, XlsxError, ZipError } from '@xufa/xlsx';
import type { Cell, CellStyle, CellValue } from '@xufa/xlsx';

const bytes = writeXlsx({
  sheets: [
    {
      name: 'Books',
      rows: [
        [{ value: 'Title', style: 'header' }, { value: 'Pages', style: { bold: true, align: 'center', border: 'thin' } }],
        ['Dune', 412],
        [new Date(), null, true],
      ],
      merges: [{ top: 0, left: 0, bottom: 0, right: 1 }],
      widths: [30],
      defaultWidth: 12,
    },
  ],
});
expectTypeOf(bytes).toEqualTypeOf<Buffer>();
expectTypeOf(readXlsx(bytes).sheets[0].rows[0][0]).toEqualTypeOf<CellValue>();
expectTypeOf(readXlsx(bytes).sheets[0].merges).toEqualTypeOf<{ top: number; left: number; bottom: number; right: number }[]>();
expectTypeOf(patchXlsx(bytes, 'Books', { B2: 500 })).toEqualTypeOf<Buffer>();
expectTypeOf(unzip(bytes).get('xl/workbook.xml')).toEqualTypeOf<Buffer | undefined>();
expectTypeOf(zip([['a.txt', 'x']])).toEqualTypeOf<Buffer>();
expectTypeOf(cellAt('B2')).toEqualTypeOf<{ row: number; column: number }>();
expectTypeOf(new ZipError('x')).toMatchTypeOf<XlsxError>();
const style: CellStyle = { border: { top: 'medium' }, valign: 'middle', format: '0.00%', fill: '#FFFF00' };
const cell: Cell = { value: 1, style };
expectTypeOf(cell).toMatchTypeOf<Cell>();

// @ts-expect-error: a style by name is title, header or value
writeXlsx({ sheets: [{ name: 'A', rows: [[{ value: 'x', style: 'bold' }]] }] });
// @ts-expect-error: valign is top, middle or bottom
writeXlsx({ sheets: [{ name: 'A', rows: [[{ value: 'x', style: { valign: 'center' } }]] }] });
