// Cells of a workbook changed in place: the bytes of a .xlsx with some cells of one sheet set, and nothing else of it
// changed (its styles, other sheets, formats, comments and drawings are kept as they were). A cell keeps its style; a
// text is written as an inline string, a number, a boolean, null (empty). A merged range whose cells get different
// values is split (each of its cells takes the style of its first one), as a table's matrix needs when one of its merged
// cells is set apart from the rest. A cell that had a formula loses it, and the workbook's calculation chain goes with
// it (Excel rebuilds it).
//
//   const bytes = patchXlsx(fs.readFileSync('book.xlsx'), 'RULES', { C7: 0.5, D7: 'gold' });
import { unzip, zip } from './zip.js';
import { descendants, escapeXml, parseXml } from './xml.js';
import { XlsxError } from './errors.js';
import { cellAt, refOf } from './xlsx.js';

const fail = (message) => new XlsxError(message);

// The path in the zip of the sheet of a name.
function sheetPath(files, name) {
  const workbookXml = files.get('xl/workbook.xml');
  if (!workbookXml) throw fail('Not a workbook of Excel (no xl/workbook.xml)');
  const sheet = descendants(parseXml(workbookXml), 'sheet').find((one) => one.attrs.name === name);
  if (!sheet) throw fail(`The workbook has no sheet ${name}`);
  const relations = descendants(
    parseXml(files.get('xl/_rels/workbook.xml.rels') || '<Relationships/>'),
    'Relationship'
  );
  const id = sheet.attrs.id ?? sheet.attrs['r:id'];
  const target = relations.find((relation) => relation.attrs.Id === id)?.attrs.Target;
  if (!target) return `xl/worksheets/sheet${sheet.attrs.sheetId}.xml`;
  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
}

// The XML of a cell: its reference, its style, and its value.
function cellXml(ref, style, value) {
  const s = style === undefined ? '' : ` s="${style}"`;
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  // (A date as Excel keeps it: days since 1899-12-30, the cell's style showing it as a date.)
  if (value instanceof Date) return `<c r="${ref}"${s}><v>${value.getTime() / 86400000 + 25569}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

const ROW = /<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL = /<c\b[^>]*?\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const STYLE = /\bs="(\d+)"/;

// The sheet's XML with the cells set (cells: Map of reference -> { value, style? }); the references whose old cell had
// a formula are added to formulas.
function setCells(xml, cells, formulas) {
  if (/<\w+:sheetData\b/.test(xml)) throw fail('Sheets whose elements have a prefix are not supported');
  const byRow = new Map();
  for (const [ref, cell] of cells) {
    const { row } = cellAt(ref);
    if (!byRow.has(row + 1)) byRow.set(row + 1, new Map());
    byRow.get(row + 1).set(ref, cell);
  }
  const done = new Set();
  // Cells of rows that are there.
  let out = xml.replace(ROW, (whole, number, inner) => {
    const wanted = byRow.get(Number(number));
    if (!wanted) return whole;
    done.add(Number(number));
    const seen = new Set();
    let body = (inner ?? '').replace(CELL, (cellWhole, ref) => {
      const cell = wanted.get(ref);
      if (!cell) return cellWhole;
      seen.add(ref);
      if (/<f\b/.test(cellWhole)) formulas.add(ref);
      const style = cell.style ?? STYLE.exec(cellWhole.slice(0, cellWhole.indexOf('>') + 1))?.[1];
      return cellXml(ref, style, cell.value);
    });
    // Cells the row did not have, in the order of their columns.
    for (const [ref, cell] of wanted) {
      if (seen.has(ref)) continue;
      const column = cellAt(ref).column;
      const added = cellXml(ref, cell.style, cell.value);
      let placed = false;
      body = body.replace(CELL, (cellWhole, other) => {
        if (placed || cellAt(other).column < column) return cellWhole;
        placed = true;
        return added + cellWhole;
      });
      if (!placed) body += added;
    }
    const open = whole.slice(0, whole.indexOf('>') + 1).replace(/\s*\/>$/, '>');
    return `${open}${body}</row>`;
  });
  // Rows the sheet did not have, in the order of their numbers.
  const missing = [...byRow.keys()].filter((number) => !done.has(number)).sort((a, b) => a - b);
  for (const number of missing) {
    const cellsOfRow = [...byRow.get(number)]
      .sort(([a], [b]) => cellAt(a).column - cellAt(b).column)
      .map(([ref, cell]) => cellXml(ref, cell.style, cell.value))
      .join('');
    const added = `<row r="${number}">${cellsOfRow}</row>`;
    let placed = false;
    out = out.replace(ROW, (whole, other) => {
      if (placed || Number(other) < number) return whole;
      placed = true;
      return added + whole;
    });
    if (!placed) {
      if (/<sheetData\s*\/>/.test(out)) out = out.replace(/<sheetData\s*\/>/, `<sheetData>${added}</sheetData>`);
      else out = out.replace('</sheetData>', `${added}</sheetData>`);
    }
  }
  return out;
}

// The merged ranges of a sheet: [{ ref, top, left, bottom, right }].
function mergesOf(xml) {
  return descendants(parseXml(xml), 'mergeCell').map((merge) => {
    const [from, to = from] = merge.attrs.ref.split(':');
    const start = cellAt(from);
    const end = cellAt(to);
    return { ref: merge.attrs.ref, top: start.row, left: start.column, bottom: end.row, right: end.column };
  });
}

// The style of a cell of the sheet (its s), or undefined.
function styleOf(xml, ref) {
  const match = new RegExp(`<c\\b[^>]*?\\br="${ref}"[^>]*?>`).exec(xml);
  return match ? STYLE.exec(match[0])?.[1] : undefined;
}

// The sheet's XML without the merged ranges given (and their count right).
function removeMerges(xml, refs) {
  let out = xml;
  for (const ref of refs) out = out.replace(new RegExp(`<mergeCell\\b[^>]*\\bref="${ref}"[^>]*/>`), '');
  const left = (out.match(/<mergeCell\b/g) || []).length;
  if (left === 0) return out.replace(/<mergeCells\b[^>]*>\s*<\/mergeCells>|<mergeCells\b[^>]*\/>/, '');
  return out.replace(/(<mergeCells\b[^>]*?\bcount=")\d+(")/, `$1${left}$2`);
}

// The calculation chain left out (it lists the cells with formulas, and one of them has none now).
function dropCalcChain(files) {
  if (!files.has('xl/calcChain.xml')) return;
  files.delete('xl/calcChain.xml');
  const rels = files.get('xl/_rels/workbook.xml.rels');
  if (rels) {
    files.set(
      'xl/_rels/workbook.xml.rels',
      String(rels).replace(/<Relationship\b[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/, '')
    );
  }
  const types = files.get('[Content_Types].xml');
  if (types) {
    files.set(
      '[Content_Types].xml',
      String(types).replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '')
    );
  }
}

// The bytes of a .xlsx with cells of a sheet set: cells { 'C7': value } or a Map. Merged ranges whose cells get more
// than one value are split first; options.whole: the values of a whole area the cells are of (a table's matrix, its
// cells not changed too), which tells which merges are cut (one cell of a merge changed, the others not).
function patchXlsx(buffer, sheetName, values, { whole } = {}) {
  const files = unzip(buffer);
  const path = sheetPath(files, sheetName);
  const original = files.get(path);
  if (!original) throw fail(`The sheet ${sheetName} is not in the workbook (${path})`);
  let xml = String(original);
  const entries = values instanceof Map ? [...values] : Object.entries(values);
  const cells = new Map(entries.map(([ref, value]) => [ref, { value }]));
  // Merges cut by values that differ: split, their cells styled as their first one.
  const seen = whole ? (whole instanceof Map ? [...whole] : Object.entries(whole)) : entries;
  const area = new Map(seen);
  const broken = mergesOf(xml).filter((merge) => {
    const inside = seen.filter(([ref]) => {
      const { row, column } = cellAt(ref);
      return row >= merge.top && row <= merge.bottom && column >= merge.left && column <= merge.right;
    });
    return new Set(inside.map(([, value]) => (value instanceof Date ? value.getTime() : value))).size > 1;
  });
  for (const merge of broken) {
    const style = styleOf(xml, refOf(merge.top, merge.left));
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let column = merge.left; column <= merge.right; column += 1) {
        const ref = refOf(row, column);
        if (row === merge.top && column === merge.left) continue;
        const cell = cells.get(ref);
        // (Each cell of the split range keeps what the range showed, as Excel does when cells are unmerged: its
        // value in the area given, else the value of the range's first cell there.)
        if (cell) cell.style = style;
        else cells.set(ref, { value: area.get(ref) ?? area.get(refOf(merge.top, merge.left)) ?? null, style });
      }
    }
  }
  if (broken.length)
    xml = removeMerges(
      xml,
      broken.map((merge) => merge.ref)
    );
  const formulas = new Set();
  xml = setCells(xml, cells, formulas);
  files.set(path, xml);
  if (formulas.size) dropCalcChain(files);
  return zip([...files]);
}

export { patchXlsx };
