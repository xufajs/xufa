// @xufa/xlsx: workbooks of Excel (.xlsx) with no dependencies. readXlsx() gives the values of every sheet;
// writeXlsx() writes sheets of values with styles, merged cells and widths; patchXlsx() sets some cells of a workbook
// and keeps the rest as it was. zip() and unzip() are the zip files they are made of.
//
//   import { readXlsx, writeXlsx } from '@xufa/xlsx';
//   const bytes = writeXlsx({ sheets: [{ name: 'Books', rows: [[{ value: 'Title', style: 'header' }], ['Dune']] }] });
//   readXlsx(bytes).sheets[0].rows; // [['Title'], ['Dune']]
export { readXlsx, writeXlsx, cellAt, columnName, refOf, excelDate } from './lib/xlsx.js';
export { patchXlsx } from './lib/patch.js';
export { zip, unzip } from './lib/zip.js';
export { XlsxError, ZipError } from './lib/errors.js';
