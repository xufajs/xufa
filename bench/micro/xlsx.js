// @xufa/xlsx against exceljs 4.4.0: a workbook of a catalog written (2 sheets of 2,500 rows and 8 columns: texts,
// numbers, dates, a bold header with a fill and borders, merged title cells, widths) and read back to its values, in
// workbooks a second.
// node bench/micro/xlsx.js [rounds]
const { versus, rate } = require('../lib/versus.js');

const COLUMNS = ['Code', 'Title', 'Author', 'Pages', 'Price', 'Published', 'Stock', 'Shelf'];

function rowsOf(sheet) {
  const rows = [];
  for (let i = 0; i < 2500; i += 1) {
    rows.push([
      `B-${sheet}-${String(i).padStart(5, '0')}`,
      `A title of a book number ${i}`,
      `Author ${i % 300}`,
      100 + ((i * 37) % 900),
      Math.round(((i * 7.31) % 80) * 100) / 100 + 5,
      new Date(Date.UTC(1990 + (i % 30), i % 12, 1 + (i % 28))),
      (i * 13) % 50,
      `S${i % 40}`,
    ]);
  }
  return rows;
}

const SHEETS = [
  { name: 'Fiction', rows: rowsOf(1) },
  { name: 'Essays', rows: rowsOf(2) },
];
const HEADER = { bold: true, fill: 'DDEBF7', border: 'thin', align: 'center' };

function writeOurs() {
  const { writeXlsx } = require('@xufa/xlsx');
  return writeXlsx({
    sheets: SHEETS.map(({ name, rows }) => ({
      name,
      rows: [
        [{ value: `Catalog: ${name}`, style: { bold: true, size: 14 } }],
        COLUMNS.map((value) => ({ value, style: HEADER })),
        ...rows,
      ],
      merges: [{ top: 0, left: 0, bottom: 0, right: 7 }],
      widths: [12, 32, 16, 8, 8, 12, 8, 8],
    })),
  });
}

async function writeTheirs() {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows } of SHEETS) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [12, 32, 16, 8, 8, 12, 8, 8].map((width) => ({ width }));
    sheet.addRow([`Catalog: ${name}`]).getCell(1).font = { bold: true, size: 14 };
    sheet.mergeCells('A1:H1');
    const header = sheet.addRow(COLUMNS);
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center' };
    });
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function measure(library, caseName) {
  if (caseName.startsWith('write')) {
    return rate(library === 'theirs' ? writeTheirs : writeOurs, { ms: 3000, warm: 3 });
  }
  const bytes = writeOurs();
  if (library === 'ours') {
    const { readXlsx } = require('@xufa/xlsx');
    return rate(() => readXlsx(bytes), { ms: 3000, warm: 3 });
  }
  const ExcelJS = require('exceljs');
  return rate(
    async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      const values = [];
      workbook.eachSheet((sheet) => sheet.eachRow((row) => values.push(row.values)));
      return values;
    },
    { ms: 3000, warm: 3 }
  );
}

versus({
  file: __filename,
  theirs: 'exceljs 4.4.0',
  ours: '@xufa/xlsx',
  unit: 'workbooks/s',
  cases: { 'write a workbook of 5,000 rows': {}, 'read it back': {} },
  measure,
});
