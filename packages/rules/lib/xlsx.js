// Workbooks of Excel (.xlsx) read into sheets of values, and written from them. Reading: every sheet in order, as rows
// of cells from A1 (null where empty), values as Excel shows them: texts (shared, inline, rich), numbers, booleans,
// dates (numbers of a date format, as Date), the last result of formulas, errors as their text (#N/A). Writing: sheets
// of rows of values or { value, style } (title, header, value), merged ranges and widths of columns.
import { unzip, zip } from './zip.js';
import { parseXml, child, children, descendants, escapeXml } from './xml.js';
import { RulesError } from './values.js';

// The formats of numbers that are dates or times in Excel: the built-in ones, and custom codes with d, m, y, h or s
// out of quotes, brackets and escapes ("0.00" is not one; "dd/mm/yyyy" and "[$-409]mmm-yy" are).
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateCode(code) {
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[dmyhs]/i.test(bare) && !/^General$/i.test(bare);
}

const DAY_MS = 86400000;
// Days from 1899-12-30 (Excel's day 0, its leap year 1900 included), or from 1904-01-01 in workbooks of that system.
const excelDate = (serial, date1904) => new Date(Math.round((serial + (date1904 ? 1462 : 0) - 25569) * DAY_MS));
const toSerial = (date) => date.getTime() / DAY_MS + 25569;

// A1 -> { row: 0, column: 0 }.
function cellAt(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) throw new RulesError(`Invalid reference of a cell: ${ref}`, 'XUFA_RULES_ERR_XLSX');
  let column = 0;
  for (const char of match[1]) column = column * 26 + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, column: column - 1 };
}

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const refOf = (row, column) => `${columnName(column)}${row + 1}`;

// The text of an <si> or <is>: its <t>, or the <t> of each run (<r>) of a rich text.
function textOf(element) {
  if (!element) return '';
  const plain = child(element, 't');
  if (plain) return plain.text;
  return children(element, 'r')
    .map((run) => child(run, 't')?.text ?? '')
    .join('');
}

function readStyles(files) {
  const xml = files.get('xl/styles.xml');
  if (!xml) return [];
  const doc = parseXml(xml);
  const custom = new Map(
    descendants(doc, 'numFmt').map((format) => [Number(format.attrs.numFmtId), format.attrs.formatCode])
  );
  const cellXfs = descendants(doc, 'cellXfs')[0];
  return children(cellXfs, 'xf').map((xf) => {
    const id = Number(xf.attrs.numFmtId || 0);
    return DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id)));
  });
}

function readSheet(xml, sharedStrings, dateStyles, date1904) {
  const doc = parseXml(xml);
  const rows = [];
  for (const row of descendants(doc, 'row')) {
    let column = -1;
    const rowIndex = row.attrs.r ? Number(row.attrs.r) - 1 : rows.length;
    for (const cell of children(row, 'c')) {
      const at = cell.attrs.r ? cellAt(cell.attrs.r) : { row: rowIndex, column: column + 1 };
      column = at.column;
      const type = cell.attrs.t;
      const raw = child(cell, 'v')?.text;
      let value = null;
      if (type === 's') value = raw === undefined ? null : sharedStrings[Number(raw)];
      else if (type === 'inlineStr') value = textOf(child(cell, 'is'));
      else if (type === 'str' || type === 'e') value = raw ?? null;
      else if (type === 'b') value = raw === undefined ? null : raw === '1';
      else if (type === 'd') value = raw === undefined ? null : new Date(raw);
      else if (raw !== undefined && raw !== '') {
        const number = Number(raw);
        value = dateStyles[Number(cell.attrs.s || 0)] ? excelDate(number, date1904) : number;
      }
      // (An empty text is a value: Excel keeps it, and it joins cells into a table as any other.)
      if (value === null) continue;
      while (rows.length <= at.row) rows.push([]);
      const target = rows[at.row];
      while (target.length < at.column) target.push(null);
      target[at.column] = value;
    }
  }
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  for (const row of rows) while (row.length < width) row.push(null);
  const merges = descendants(doc, 'mergeCell').map((merge) => {
    const [from, to = from] = merge.attrs.ref.split(':');
    const start = cellAt(from);
    const end = cellAt(to);
    return { top: start.row, left: start.column, bottom: end.row, right: end.column };
  });
  return { rows, merges };
}

// { sheets: [{ name, rows, merges }] } of the bytes of a .xlsx.
function readXlsx(buffer) {
  const files = unzip(buffer);
  const workbookXml = files.get('xl/workbook.xml');
  if (!workbookXml) throw new RulesError('Not a workbook of Excel (no xl/workbook.xml)', 'XUFA_RULES_ERR_XLSX');
  const workbook = parseXml(workbookXml);
  const date1904 = ['1', 'true'].includes(descendants(workbook, 'workbookPr')[0]?.attrs.date1904);
  const relations = new Map(
    descendants(parseXml(files.get('xl/_rels/workbook.xml.rels') || '<Relationships/>'), 'Relationship').map(
      (relation) => [relation.attrs.Id, relation.attrs.Target]
    )
  );
  const sharedXml = files.get('xl/sharedStrings.xml');
  const sharedStrings = sharedXml ? descendants(parseXml(sharedXml), 'si').map(textOf) : [];
  const dateStyles = readStyles(files);
  const sheets = descendants(workbook, 'sheet').map((sheet) => {
    const target = relations.get(sheet.attrs.id) || `worksheets/sheet${sheet.attrs.sheetId}.xml`;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = files.get(path);
    if (!xml)
      throw new RulesError(`The sheet ${sheet.attrs.name} is not in the workbook (${path})`, 'XUFA_RULES_ERR_XLSX');
    return { name: sheet.attrs.name, ...readSheet(xml, sharedStrings, dateStyles, date1904) };
  });
  return { sheets };
}

// Styles of written cells: 0 none, 1 title, 2 header, 3 value, 4 a date value (and 5-7 the same with dates).
const STYLE_IDS = { title: 1, header: 2, value: 3 };
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>' +
  '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="14" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="14" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function cellXml(row, column, cell) {
  const { value, style } =
    cell !== null && typeof cell === 'object' && !(cell instanceof Date) ? cell : { value: cell };
  const styleId = STYLE_IDS[style] || 0;
  if (value === null || value === undefined) {
    return styleId ? `<c r="${refOf(row, column)}" s="${styleId}"/>` : '';
  }
  const ref = refOf(row, column);
  if (value instanceof Date) return `<c r="${ref}" s="${styleId + 4}"><v>${toSerial(value)}</v></c>`;
  const s = styleId ? ` s="${styleId}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml({ rows = [], merges = [], widths = [] }) {
  const cols = widths
    .map((width, i) => (width ? `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>` : ''))
    .join('');
  const body = rows
    .map((row, r) => {
      const cells = (row || []).map((cell, c) => cellXml(r, c, cell)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  const merged = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((m) => `<mergeCell ref="${refOf(m.top, m.left)}:${refOf(m.bottom, m.right)}"/>`)
        .join('')}</mergeCells>`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${merged}</worksheet>`
  );
}

const SHEET_NAME = /^[^\\/?*[\]:]{1,31}$/;

// The bytes of a .xlsx of { sheets: [{ name, rows, merges, widths }] }.
function writeXlsx({ sheets }) {
  if (!sheets?.length) throw new RulesError('A workbook needs a sheet', 'XUFA_RULES_ERR_XLSX');
  const names = new Set();
  for (const { name } of sheets) {
    if (!SHEET_NAME.test(name) || names.has(name.toLowerCase()))
      throw new RulesError(`Invalid name of a sheet: ${name}`, 'XUFA_RULES_ERR_XLSX');
    names.add(name.toLowerCase());
  }
  const sheetEntries = sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)]);
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    '</Types>';
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets
      .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets></workbook>';
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';
  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', STYLES_XML],
    ...sheetEntries,
  ]);
}

export { readXlsx, writeXlsx, cellAt, columnName, refOf, excelDate };
