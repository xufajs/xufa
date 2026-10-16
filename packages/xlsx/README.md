# @xufa/xlsx

Workbooks of Excel (.xlsx) with no dependencies: `readXlsx()` gives the values of every sheet, `writeXlsx()` writes
sheets of values with styles, merged cells and widths, and `patchXlsx()` sets some cells of a workbook people keep
editing and leaves the rest as it was. It is what [@xufa/rules](../rules) reads its books with.

```sh
npm install @xufa/xlsx
```

```js
import { readXlsx, writeXlsx } from '@xufa/xlsx';

const header = { bold: true, fill: 'DDEBF7', border: 'thin', align: 'center' };
const bytes = writeXlsx({
  sheets: [
    {
      name: 'Books',
      rows: [
        [
          { value: 'Title', style: header },
          { value: 'Pages', style: header },
        ],
        ['Dune', 412],
      ],
      widths: [30],
      defaultWidth: 12,
    },
  ],
});
readXlsx(bytes).sheets[0].rows; // [['Title', 'Pages'], ['Dune', 412]]
```

## Reading

`readXlsx(bytes)` gives `{ sheets: [{ name, rows, merges }] }`, the sheets in their order: rows of cells from A1 (`null`
where empty), values as Excel shows them: texts (shared, inline, rich), numbers, booleans, dates (numbers of a date
format, as `Date`; the 1904 system too), the last result of formulas, errors as their text (`#N/A`). Merged ranges are
`{ top, left, bottom, right }` from 0.

## Writing

`writeXlsx({ sheets })` gives a Buffer. A sheet has a `name` (31 characters at most, without `\ / ? * [ ] :`, one of its
kind), `rows` of cells, `merges`, `widths` of its columns (in characters) and a `defaultWidth`. A cell is a value (text,
number, boolean, `Date`, `null`) or `{ value, style }`; the same values give the same bytes.

A style is `{ bold, italic, underline, size, font, color, fill, border, align, valign, wrap, format }`: colors in RGB hex
(`'1F4E78'`, `'#1F4E78'`), `border` true (thin), a line (`thin`, `medium`, `thick`, `dashed`, `dotted`, `double`,
`hair`) or one by side (`{ top, right, bottom, left }`), `align` left, center, right, fill or justify, `valign` top,
middle or bottom, `format` a code of numbers (`'0.00%'`) or the id of a built-in one (dates take `yyyy-mm-dd` unless
they have one). Each style is written once. `'title'`, `'header'` and `'value'` are the looks of the tables of
@xufa/rules.

Measured against exceljs 4.4 on the exports of a backend (5,000 products in sheets by language with merged headers;
20,000 documents of a collection): 4.2× and 3.4× faster, a third and a half of the memory; the same values, merges,
styles of every cell and widths on 3,000 random workbooks. Texts are written inline (exceljs shares them), so files of
many repeated texts are a little bigger (8% on those documents).

## Patching

`patchXlsx(bytes, sheet, { C7: 0.5 })` (or a `Map`) sets those cells and nothing else: styles, other sheets, formats,
comments and drawings are kept, and a cell keeps its style. A merged range whose cells get different values is split
(`{ whole }`: the values of the whole area, which tells which merges are cut); a cell that loses its formula takes the
calculation chain with it (Excel rebuilds it).

## Zip and references

`unzip(bytes)` gives the files of a zip (name to Buffer) and `zip([[name, bytes or text], ...])` makes one (deflated, a
fixed date: the same entries give the same bytes), with `node:zlib` only. `cellAt('C7')` is `{ row: 6, column: 2 }`,
`refOf(6, 2)` is `'C7'`, `columnName(27)` is `'AB'`, `excelDate(serial, date1904)` the date of a serial number.

## Errors

`XlsxError` (`code: 'XUFA_XLSX_ERR'`): bytes that are not a workbook, a sheet that is not there, a name of a sheet, a
style, a color or a border Excel would not take. Bytes that are not a zip: `ZipError` (`XUFA_XLSX_ERR_ZIP`, an
`XlsxError` too). @xufa/rules gives them as `RulesError` (`XUFA_RULES_ERR_XLSX`, `XUFA_RULES_ERR_ZIP`).
