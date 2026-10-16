// Workbooks of Excel (.xlsx) read into sheets of values, and written from them. Reading: every sheet in order, as rows
// of cells from A1 (null where empty), values as Excel shows them: texts (shared, inline, rich), numbers, booleans,
// dates (numbers of a date format, as Date), the last result of formulas, errors as their text (#N/A). Writing: sheets
// of rows of values or { value, style } (a style by name or of font, fill, border, alignment and format), merged
// ranges, widths of columns and a default width.
import { unzip, zip } from './zip.js';
import { parseXml, child, children, descendants, escapeXml } from './xml.js';
import { XlsxError } from './errors.js';

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
  if (!match) throw new XlsxError(`Invalid reference of a cell: ${ref}`);
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
  if (!workbookXml) throw new XlsxError('Not a workbook of Excel (no xl/workbook.xml)');
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
    if (!xml) throw new XlsxError(`The sheet ${sheet.attrs.name} is not in the workbook (${path})`);
    return { name: sheet.attrs.name, ...readSheet(xml, sharedStrings, dateStyles, date1904) };
  });
  return { sheets };
}

// Styles of written cells: a name (title, header, value: the looks of the tables of @xufa/rules) or an object of
// { bold, italic, underline, size, font, color, fill, border, align, valign, wrap, format }. Colors are RGB hex
// ('1F4E78', '#1F4E78' or with alpha 'FF1F4E78'); border is true (thin), a style of line (thin, medium, thick, dashed,
// dotted, double, hair) or one by side ({ top, right, bottom, left }); align is left, center, right, fill or justify,
// valign top, middle or bottom; format a code of numbers ('0.00%', 'yyyy-mm-dd') or the id of a built-in one. Dates
// take the format yyyy-mm-dd (14) unless they have one.
const NAMED_STYLES = {
  title: { bold: true, color: 'FFFFFF', fill: '1F4E78', border: 'thin' },
  header: { bold: true, fill: 'DDEBF7', border: 'thin' },
  value: { border: 'thin' },
};
const LINES = new Set(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair']);
const ALIGNS = new Set(['left', 'center', 'right', 'fill', 'justify']);
const VALIGNS = { top: 'top', middle: 'center', center: 'center', bottom: 'bottom' };
const SIDES = ['left', 'right', 'top', 'bottom'];
const DATE_FORMAT = 14;

function argb(color) {
  const hex = String(color).replace(/^#/, '').toUpperCase();
  if (!/^([0-9A-F]{6}|[0-9A-F]{8})$/.test(hex)) throw new XlsxError(`Invalid color: ${color}`);
  return hex.length === 6 ? `FF${hex}` : hex;
}

function lineOf(line) {
  const style = line === true ? 'thin' : line;
  if (!LINES.has(style)) throw new XlsxError(`Invalid border: ${line}`);
  return style;
}

// The fonts, fills, borders, formats and cell formats of a workbook: each style once.
class Styles {
  constructor() {
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    this.fills = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
    ];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.formats = new Map();
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.ids = new Map();
  }

  // The index of the cell format of a style (0: none); a date takes a date format.
  idOf(style, date) {
    if ((style === undefined || style === null) && !date) return 0;
    const spec = typeof style === 'string' ? NAMED_STYLES[style] : (style ?? {});
    if (!spec || typeof spec !== 'object') throw new XlsxError(`Invalid style of a cell: ${style}`);
    const key = typeof style === 'string' ? `${style}|${date}` : `${JSON.stringify(spec)}|${date}`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.add(this.xfs, this.xfOf(spec, date));
      this.ids.set(key, id);
    }
    return id;
  }

  add(list, xml) {
    let index = list.indexOf(xml);
    if (index === -1) index = list.push(xml) - 1;
    return index;
  }

  xfOf(spec, date) {
    const { bold, italic, underline, size, font, color, fill, border, align, valign, wrap, format } = spec;
    const fontId =
      bold || italic || underline || size || font || color
        ? this.add(
            this.fonts,
            `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}${underline ? '<u/>' : ''}<sz val="${Number(size) || 11}"/>` +
              `${color ? `<color rgb="${argb(color)}"/>` : ''}<name val="${escapeXml(font || 'Calibri')}"/></font>`
          )
        : 0;
    const fillId = fill
      ? this.add(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="${argb(fill)}"/><bgColor indexed="64"/></patternFill></fill>`
        )
      : 0;
    let borderId = 0;
    if (border) {
      const lines = typeof border === 'object' ? border : { left: border, right: border, top: border, bottom: border };
      borderId = this.add(
        this.borders,
        `<border>${SIDES.map((side) => (lines[side] ? `<${side} style="${lineOf(lines[side])}"/>` : `<${side}/>`)).join('')}` +
          '<diagonal/></border>'
      );
    }
    const numFmtId = this.formatOf(format ?? (date ? DATE_FORMAT : 0));
    if (align !== undefined && !ALIGNS.has(align)) throw new XlsxError(`Invalid align: ${align}`);
    if (valign !== undefined && !VALIGNS[valign]) throw new XlsxError(`Invalid valign: ${valign}`);
    const alignment =
      align || valign || wrap
        ? `<alignment${align ? ` horizontal="${align}"` : ''}${valign ? ` vertical="${VALIGNS[valign]}"` : ''}${wrap ? ' wrapText="1"' : ''}/>`
        : '';
    const applies =
      (numFmtId ? ' applyNumberFormat="1"' : '') +
      (fontId ? ' applyFont="1"' : '') +
      (fillId ? ' applyFill="1"' : '') +
      (borderId ? ' applyBorder="1"' : '') +
      (alignment ? ' applyAlignment="1"' : '');
    const attrs = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${applies}`;
    return alignment ? `<xf ${attrs}>${alignment}</xf>` : `<xf ${attrs}/>`;
  }

  // The id of a format of numbers: a built-in one by its id, a code from 164 on.
  formatOf(format) {
    if (typeof format === 'number') return format;
    let id = this.formats.get(format);
    if (id === undefined) {
      id = 164 + this.formats.size;
      this.formats.set(format, id);
    }
    return id;
  }

  xml() {
    const formats = [...this.formats].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`);
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (formats.length ? `<numFmts count="${formats.length}">${formats.join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    );
  }
}

function cellXml(row, column, cell, styles) {
  const { value, style } =
    cell !== null && typeof cell === 'object' && !(cell instanceof Date) ? cell : { value: cell };
  const date = value instanceof Date;
  const styleId = styles.idOf(style, date);
  const ref = refOf(row, column);
  if (value === null || value === undefined) return styleId ? `<c r="${ref}" s="${styleId}"/>` : '';
  const s = styleId ? ` s="${styleId}"` : '';
  if (date) return `<c r="${ref}"${s}><v>${toSerial(value)}</v></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml({ rows = [], merges = [], widths = [], defaultWidth }, styles) {
  const cols = widths
    .map((width, i) => (width ? `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>` : ''))
    .join('');
  const body = rows
    .map((row, r) => {
      const cells = (row || []).map((cell, c) => cellXml(r, c, cell, styles)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  // A merge is { top, left, bottom, right }: rows and columns from 0, as readXlsx() gives them.
  for (const m of merges) {
    const sides = m && [m.top, m.left, m.bottom, m.right];
    if (!sides || !sides.every((n) => Number.isInteger(n) && n >= 0) || m.bottom < m.top || m.right < m.left) {
      throw new XlsxError(`Invalid merge (it is { top, left, bottom, right }, from 0): ${JSON.stringify(m)}`);
    }
  }
  const merged = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((m) => `<mergeCell ref="${refOf(m.top, m.left)}:${refOf(m.bottom, m.right)}"/>`)
        .join('')}</mergeCells>`
    : '';
  const format = defaultWidth ? `<sheetFormatPr defaultRowHeight="15" defaultColWidth="${Number(defaultWidth)}"/>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${format}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${merged}</worksheet>`
  );
}

const SHEET_NAME = /^[^\\/?*[\]:]{1,31}$/;

// The bytes of a .xlsx of { sheets: [{ name, rows, merges, widths, defaultWidth }] }.
function writeXlsx({ sheets }) {
  if (!sheets?.length) throw new XlsxError('A workbook needs a sheet');
  const names = new Set();
  for (const { name } of sheets) {
    if (!SHEET_NAME.test(name) || names.has(name.toLowerCase()))
      throw new XlsxError(`Invalid name of a sheet: ${name}`);
    names.add(name.toLowerCase());
  }
  const styles = new Styles();
  const sheetEntries = sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, styles)]);
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
    ['xl/styles.xml', styles.xml()],
    ...sheetEntries,
  ]);
}

export { readXlsx, writeXlsx, cellAt, columnName, refOf, excelDate };
