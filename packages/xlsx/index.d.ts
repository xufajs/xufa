// @xufa/xlsx: workbooks of Excel (.xlsx) read, written and patched.

/** A value of a cell, as readXlsx gives it. */
export type CellValue = string | number | boolean | Date | null;

/** A line of a border. */
export type BorderLine = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'hair';

/** The look of a cell. Colors are RGB hex: '1F4E78', '#1F4E78', or with alpha 'FF1F4E78'. */
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** In points (11). */
  size?: number;
  /** The name of the font (Calibri). */
  font?: string;
  color?: string;
  /** The color it is filled with. */
  fill?: string;
  /** true is thin on every side. */
  border?: boolean | BorderLine | { top?: BorderLine; right?: BorderLine; bottom?: BorderLine; left?: BorderLine };
  align?: 'left' | 'center' | 'right' | 'fill' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  /** A code of a format of numbers ('0.00%', 'yyyy-mm-dd') or the id of a built-in one; dates take 14 by default. */
  format?: string | number;
}

/**
 * A cell to write: a value, or a value and its style: one of its own, or the looks of the tables of @xufa/rules
 * (title, header, value).
 */
export type Cell = CellValue | { value: CellValue; style?: 'title' | 'header' | 'value' | CellStyle };

/** Cells from (top, left) to (bottom, right), from 0. */
export interface Range {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface Sheet<C = CellValue> {
  name: string;
  /** Rows of cells from A1 (null where empty). */
  rows: C[][];
  merges?: Range[];
}

export interface WritableSheet extends Sheet<Cell> {
  /** Widths of the columns, in characters. */
  widths?: number[];
  /** The width of the columns without one. */
  defaultWidth?: number;
}

/** The sheets of the bytes of a .xlsx. */
export function readXlsx(bytes: Uint8Array): { sheets: Required<Sheet>[] };

/** The bytes of a .xlsx of these sheets. */
export function writeXlsx(workbook: { sheets: WritableSheet[] }): Buffer;

/**
 * The bytes of a .xlsx with some cells of one sheet set ({ C7: 0.5 } or a Map), nothing else of it changed (styles,
 * other sheets, comments are kept). Merged ranges whose cells get different values are split; whole: the values of the
 * whole area the cells are of (a table's matrix), which tells which merges are cut.
 */
export function patchXlsx(
  bytes: Uint8Array,
  sheetName: string,
  values: Record<string, CellValue> | Map<string, CellValue>,
  options?: { whole?: Record<string, CellValue> | Map<string, CellValue> }
): Buffer;

/** 'C7' -> { row: 6, column: 2 }. */
export function cellAt(ref: string): { row: number; column: number };
/** 2 -> 'C'. */
export function columnName(index: number): string;
/** (6, 2) -> 'C7'. */
export function refOf(row: number, column: number): string;
/** The date of a serial number of Excel (of the 1904 system with date1904). */
export function excelDate(serial: number, date1904?: boolean): Date;

/** The files of a zip: name -> its bytes (folders left out). */
export function unzip(bytes: Uint8Array): Map<string, Buffer>;
/** A zip of entries [name, bytes or text (UTF-8)], deflated (the same entries give the same bytes). */
export function zip(entries: readonly (readonly [string, Buffer | string])[]): Buffer;

export class XlsxError extends Error {
  name: 'XlsxError' | 'ZipError';
  code: 'XUFA_XLSX_ERR' | 'XUFA_XLSX_ERR_ZIP';
}

/** Bytes that are not a zip (an .xlsx is one). */
export class ZipError extends XlsxError {
  name: 'ZipError';
  code: 'XUFA_XLSX_ERR_ZIP';
}
