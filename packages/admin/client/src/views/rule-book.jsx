// A book of rules, edited as its sheets: a grid of cells as in Excel (arrows, Enter, Tab, typing, copy and paste of
// cells with Excel itself, undo), its tables outlined by kind, the messages of its tests as it changes, tries of its
// tables, and its versions (another one seen, made the active one, or downloaded). Saving makes a new version, tested
// first (kept anyway when its tests fail, if asked).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, useApi } from '../api.js';
import { href, navigate, setBlocker } from '../router.js';
import { Alert, Badge, Button, Failure, Loading, PageHead } from '../ui.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { ago, when } from '../format.js';
import { downloadBook } from './rules.jsx';
import { t } from '../i18n.js';
import { sheetDiff } from './sheet-diff.js';

const MIN_ROWS = 40;
const MIN_COLUMNS = 12;
const HISTORY = 100;

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// A1 -> [row, column] (from 0).
function cellAt(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let column = 0;
  for (const char of match[1]) column = column * 26 + (char.charCodeAt(0) - 64);
  return [Number(match[2]) - 1, column - 1];
}

const textOf = (value) => (value === null || value === undefined ? '' : String(value));
// What is typed in a cell: numbers as numbers (as Excel takes them), empty as no value, the rest as text.
const valueOf = (text) => {
  if (text === '') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text.trim())) return Number(text.trim());
  return text;
};

// Cells copied as Excel does (text separated by tabs and lines; cells with tabs, lines or quotes between quotes).
function toTsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = textOf(value);
          return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join('\t')
    )
    .join('\n');
}

function fromTsv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === '\t') {
      rows[rows.length - 1].push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      rows[rows.length - 1].push(cell);
      cell = '';
      rows.push([]);
    } else cell += char;
  }
  rows[rows.length - 1].push(cell);
  // (The line break at the end of what Excel copies is no row.)
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

const copySheets = (sheets) =>
  sheets.map((sheet) => ({ ...sheet, rows: sheet.rows.map((row) => [...row]), merges: sheet.merges || [] }));

// The sheets without empty rows and columns at their end (what is saved).
function trimmed(sheets) {
  return sheets.map((sheet) => {
    let rows = sheet.rows.map((row) => {
      let end = row.length;
      while (end > 0 && (row[end - 1] === null || row[end - 1] === undefined || row[end - 1] === '')) end -= 1;
      return row.slice(0, end);
    });
    let end = rows.length;
    while (end > 0 && !rows[end - 1].length) end -= 1;
    rows = rows.slice(0, end);
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    return {
      name: sheet.name,
      rows: rows.map((row) => [...row, ...Array(width - row.length).fill(null)]),
      merges: sheet.merges || [],
    };
  });
}

const KIND_LABELS = {
  Rules: 'Rules',
  Spreadsheet: 'Spreadsheet',
  Test: 'Test',
  Method: 'Method',
  Constants: 'Constants',
  Datatype: 'Datatype',
  Check: 'Check',
  Transform: 'Transform',
  SmartRules: 'SmartRules',
  SimpleRules: 'SimpleRules',
  SmartLookup: 'SmartLookup',
  SimpleLookup: 'SimpleLookup',
  Data: 'Data',
  Run: 'Run',
  Properties: 'Properties',
};
const RUNNABLE = new Set([
  'Rules',
  'Spreadsheet',
  'Method',
  'Transform',
  'SmartRules',
  'SimpleRules',
  'SmartLookup',
  'SimpleLookup',
  'Data',
]);
// (The colour of the kinds of OpenL: that of the kind they are like.)
const FAMILY = {
  SmartRules: 'rules',
  SimpleRules: 'rules',
  SmartLookup: 'rules',
  SimpleLookup: 'rules',
  Run: 'test',
  Data: 'constants',
  Properties: 'constants',
};

// New tables: the rows of an example of each kind, to change.
const SKELETONS = {
  SmartRules: [
    ['SmartRules Double Discount(String plan, Integer age)', null, null],
    ['Plan', 'Age', 'Discount'],
    ['basic', '<25', 0],
    ['basic, gold', '25 - 60', 0.05],
    [null, '60+', 0.1],
  ],
  SimpleRules: [
    ['SimpleRules String Band(Integer age)', null],
    ['Age', 'Band'],
    ['<18', 'minor'],
    ['18+', 'adult'],
  ],
  SmartLookup: [
    ['SmartLookup Double Rate(String region, Integer year)', null, null],
    ['Region', 2026, 2027],
    ['north', 1.1, 1.2],
    ['south', 1, 1.05],
  ],
  Rules: [
    ['Rules Float Premium(String plan, Integer age)', null, null, null],
    ['C1', 'HC1', 'RET', null],
    ['plan', 'age', null, null],
    ['String', 'IntRange', 'Float', null],
    [null, '<25', '[25..60)', '>=60'],
    ['basic', 120, 100, 150],
  ],
  Spreadsheet: [
    ['Spreadsheet SpreadsheetResult Quote(Double base)', null],
    ['Step', 'Formula'],
    ['net', '= base * 0.9'],
    ['total', '= $net * 1.21'],
  ],
  Datatype: [
    ['Datatype Customer', null],
    ['String', 'plan'],
    ['Integer', 'age'],
  ],
  Data: [
    ['Data Customer customers', null],
    ['plan', 'age'],
    ['Plan', 'Age'],
    ['basic', 30],
    ['gold', 45],
  ],
  Constants: [
    ['Constants Rates', null, null],
    ['Float', 'vat', 0.21],
  ],
  Method: [['Method Float Round2(Float value)'], ['return Math.round(value * 100) / 100']],
  Test: [
    ['Test Discount DiscountTest', null, null],
    ['plan', 'age', '_res_'],
    ['Plan', 'Age', 'Expected'],
    ['basic', 20, 0],
  ],
  Run: [
    ['Run Discount DiscountRun', null],
    ['plan', 'age'],
    ['Plan', 'Age'],
    ['gold', 30],
  ],
  Properties: [
    ['Properties', null],
    ['scope', 'Worksheet'],
    ['effectiveDate', '2026-01-01'],
  ],
};

const EMPTY_INSPECTION = { tables: [], errors: [], tests: [], analysis: [], lint: [], coverage: null };

// Rows (or columns) moved to make room for a new one at an index, within a span of columns (or rows): the cells of a
// table and those under (or right of) it, not those of tables beside it. Merges move with them.
function makeRoom(sheet, { row, column }, from, to) {
  if (row !== undefined) {
    for (let r = sheet.rows.length - 1; r >= row; r -= 1) {
      const cells = sheet.rows[r] || [];
      while (sheet.rows.length <= r + 1) sheet.rows.push([]);
      const below = sheet.rows[r + 1];
      for (let c = from; c <= to; c += 1) {
        while (below.length <= c) below.push(null);
        below[c] = cells[c] ?? null;
        if (c < cells.length) cells[c] = null;
      }
    }
    for (const merge of sheet.merges || []) {
      if (merge.top >= row && merge.left >= from && merge.right <= to) {
        merge.top += 1;
        merge.bottom += 1;
      }
    }
  } else {
    for (let r = from; r <= to; r += 1) {
      const cells = sheet.rows[r];
      if (cells && cells.length > column) cells.splice(column, 0, null);
    }
    for (const merge of sheet.merges || []) {
      if (merge.left >= column && merge.top >= from && merge.bottom <= to) {
        merge.left += 1;
        merge.right += 1;
      }
    }
  }
}

// The value of a condition of a gap for a cell that takes it (null: left empty, any value): no "not ...", lists and
// ranges only where the table takes them.
function conditionValue(shown, place) {
  if (shown === undefined || shown === null || shown === 'any') return null;
  if (typeof shown !== 'string') return shown;
  if (shown.startsWith('not ')) return null;
  if (shown.includes(', ') && !place.lists) return null;
  if (/^[<>[(]/.test(shown) && !place.ranges) return null;
  return shown;
}

// The cells with a value of rows of a sheet (all of them new, or gone), each { row, column, other: '' }.
const filledCells = (rows) =>
  rows.flatMap((row, r) =>
    (row || []).flatMap((value, c) => (textOf(value) === '' ? [] : [{ row: r, column: c, other: '' }]))
  );

// The cells that changed from some sheets to others, their rows lined up (rows inserted or deleted move none of the
// others): as the spots of the grid, where they are and what was there (note).
function changedCells(before, after) {
  const cells = [];
  for (const sheet of after) {
    const old = before.find((entry) => entry.name === sheet.name);
    const found = old ? sheetDiff(old.rows, sheet.rows).afterCells : filledCells(sheet.rows);
    for (const cell of found) {
      cells.push({
        sheet: sheet.name,
        row: cell.row,
        column: cell.column,
        note: t('Was: {value}', { value: cell.other || '∅' }),
      });
    }
  }
  return cells;
}

// Two versions side by side: the cells that differ in each (now: of these sheets, what was there; then: of the
// version beside, what is there now), how many changes, and of each sheet both have, its rows lined up (the row of
// each side shown on each line, null for a gap) with the rows inserted and deleted.
function besideDiffOf(oldSheets, sheets) {
  const now = [];
  const then = [];
  const layouts = new Map();
  let count = 0;
  const was = (sheet, cell) => ({
    sheet,
    row: cell.row,
    column: cell.column,
    note: t('Was: {value}', { value: cell.other || '∅' }),
  });
  const is = (sheet, cell) => ({
    sheet,
    row: cell.row,
    column: cell.column,
    note: t('Now: {value}', { value: cell.other || '∅' }),
  });
  for (const sheet of sheets) {
    const old = oldSheets.find((entry) => entry.name === sheet.name);
    if (!old) {
      const cells = filledCells(sheet.rows);
      now.push(...cells.map((cell) => was(sheet.name, cell)));
      count += cells.length;
      continue;
    }
    const diff = sheetDiff(old.rows, sheet.rows);
    now.push(...diff.afterCells.map((cell) => was(sheet.name, cell)));
    then.push(...diff.beforeCells.map((cell) => is(sheet.name, cell)));
    count += diff.afterCells.length + diff.beforeCells.filter((cell) => diff.removed.has(cell.row)).length;
    // (After the rows lined up, the rows of each side go on below them, to the height of a grid.)
    const left = diff.pairs.map((pair) => pair.before);
    const right = diff.pairs.map((pair) => pair.after);
    let nextLeft = Math.max(-1, ...left.filter((row) => row !== null)) + 1;
    let nextRight = Math.max(-1, ...right.filter((row) => row !== null)) + 1;
    const total = Math.max(
      MIN_ROWS,
      left.length + 10,
      left.length + old.rows.length - nextLeft,
      left.length + sheet.rows.length - nextRight
    );
    while (left.length < total) {
      left.push(nextLeft);
      right.push(nextRight);
      nextLeft += 1;
      nextRight += 1;
    }
    layouts.set(sheet.name, { left, right, removed: diff.removed, added: diff.added });
  }
  for (const old of oldSheets) {
    if (sheets.some((sheet) => sheet.name === old.name)) continue;
    const cells = filledCells(old.rows);
    then.push(...cells.map((cell) => is(old.name, cell)));
    count += cells.length;
  }
  return { now, then, layouts, count };
}

// The row on the other side of the line of a row (of a side lined up): that of its line, else of the next line that
// has one (or the one before).
function across(from, to, row) {
  const line = from.indexOf(row);
  if (line === -1) return row;
  for (let k = line; k < to.length; k += 1) if (to[k] !== null) return to[k];
  for (let k = line; k >= 0; k -= 1) if (to[k] !== null) return to[k];
  return row;
}

// The cells of a trace: those that gave the result of each call.
const traceCells = (node) => (node ? [...node.cells, ...node.children.flatMap(traceCells)] : []);

// The spots of cells of a sheet (changed ones, of two versions side by side).
function diffSpots(cells, sheetName) {
  const map = new Map();
  for (const cell of cells) {
    if (cell.sheet === sheetName) map.set(`${cell.row},${cell.column}`, { className: 'spot-diff', title: cell.note });
  }
  return map;
}

// The tables of two versions: those with changed cells (in these sheets, or in the version beside: rows deleted), and
// those of one alone (by kind and name); and the sheets of the other alone.
function tableChanges(before, after, cells, oldCells, oldSheets, sheets) {
  const keyOf = (table) => `${table.kind} ${table.name ?? ''}`;
  const inside = (position, cell) =>
    position &&
    cell.sheet === position.sheet &&
    cell.row >= position.row &&
    cell.row < position.row + (position.height ?? 1) &&
    cell.column >= position.column &&
    cell.column < position.column + (position.width ?? 1);
  const old = new Set(before.map(keyOf));
  const now = new Set(after.map(keyOf));
  return {
    changed: after.filter(
      (table) =>
        old.has(keyOf(table)) &&
        (cells.some((cell) => inside(table.position, cell)) ||
          before.some(
            (other) => keyOf(other) === keyOf(table) && oldCells.some((cell) => inside(other.position, cell))
          ))
    ),
    added: after.filter((table) => !old.has(keyOf(table))),
    removed: before.filter((table) => !now.has(keyOf(table))),
    sheets: oldSheets.filter((sheet) => !sheets.some((entry) => entry.name === sheet.name)).map((sheet) => sheet.name),
  };
}

const tableLabel = (table) => table.name || KIND_LABELS[table.kind] || table.kind;

export function RuleBookView({ name, query }) {
  const { meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const version = query.version ? Number(query.version) : null;
  const { data, error, reload } = useApi(`_rules/${encodeURIComponent(name)}${version ? `?version=${version}` : ''}`);
  const canChange = Boolean(meta.actions && meta.actions.rules && meta.actions.rules.change);
  const canDelete = Boolean(meta.actions && meta.actions.rules && meta.actions.rules.delete);

  const [sheets, setSheets] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [inspected, setInspected] = useState(EMPTY_INSPECTION);
  // Cells shown over the grid: those of a trace ({ kind: 'trace' }) or that changed from a version ({ kind: 'diff' }).
  const [highlight, setHighlight] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);
  const [comment, setComment] = useState('');
  const [panel, setPanel] = useState('messages');
  // A table and a runtime context to try (a version chosen in the tables).
  const [preset, setPreset] = useState(null);
  // Another version seen side by side: { version, sheets, tables }.
  const [beside, setBeside] = useState(null);
  const besideBox = useRef(null);
  const [select, setSelect] = useState({ row: 0, column: 0, row2: 0, column2: 0 });
  const history = useRef({ past: [], future: [] });

  useEffect(() => {
    if (!data) return;
    setSheets(copySheets(data.sheets.length ? data.sheets : [{ name: 'RULES', rows: [], merges: [] }]));
    setInspected({ ...EMPTY_INSPECTION, ...data, sheets: undefined });
    setDirty(false);
    history.current = { past: [], future: [] };
  }, [data]);

  // Leaving with changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    setBlocker(() =>
      confirm({
        title: t('Leave without saving?'),
        message: t('The changes of the book are lost.'),
        confirm: t('Leave'),
        icon: 'alert',
      })
    );
    const onUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setBlocker(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty, confirm]);

  // The tables and messages of the sheets as they change (a moment after the last change).
  useEffect(() => {
    if (!sheets || !dirty) return undefined;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        setInspected(
          await api(`_rules/${encodeURIComponent(name)}/inspect`, { method: 'POST', body: { sheets: trimmed(sheets) } })
        );
      } catch (err) {
        setInspected({ ...EMPTY_INSPECTION, errors: [err.message] });
      } finally {
        setChecking(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [sheets, dirty, name]);

  const change = useCallback((update) => {
    setSheets((current) => {
      history.current.past.push(current);
      if (history.current.past.length > HISTORY) history.current.past.shift();
      history.current.future = [];
      const next = copySheets(current);
      update(next);
      return next;
    });
    setDirty(true);
  }, []);

  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    setSheets((current) => {
      history.current.future.push(current);
      return previous;
    });
    setDirty(true);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    setSheets((current) => {
      history.current.past.push(current);
      return next;
    });
    setDirty(true);
  };

  // Whether a version may become the active one: when the books that import this one fail their tests with it, the
  // user says so (body: { version } or { sheets }).
  const breaksNone = async (body, what) => {
    if (!data.importedBy || !data.importedBy.length) return true;
    const { results } = await api(`_rules/${encodeURIComponent(name)}/impact`, { method: 'POST', body });
    const broken = results.filter((result) => result.errors.length);
    if (!broken.length) return true;
    // ('confirmed': the user said to go on; the store is told so, when it checks the books that import this one.)
    const yes = await confirm({
      title: what,
      message: t('These books import {name} and fail their tests with it:', { name }),
      details: broken.map((result) => `${result.name}: ${result.errors[0]}`),
      confirm: t('Do it anyway'),
      icon: 'alert',
    });
    return yes ? 'confirmed' : false;
  };

  const save = async (force = false) => {
    const breaking = await breaksNone(
      { sheets: trimmed(sheets) },
      t('Saving this version breaks books that import {name}', { name })
    );
    if (!breaking) return;
    setSaving(true);
    setFailed(null);
    try {
      const answer = await api(`_rules/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: { sheets: trimmed(sheets), comment: comment || null, force, breaking: breaking === 'confirmed' },
      });
      toast(t('Version {version} of {name} kept', { version: answer.version, name }));
      setDirty(false);
      setComment('');
      setBlocker(null);
      navigate(['_rules', name], {});
      reload();
    } catch (err) {
      if (err.status === 422) {
        setFailed(err.data.messages || []);
        setPanel('messages');
      } else toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const keepAnyway = async () => {
    const yes = await confirm({
      title: t('Keep a book whose tests fail?'),
      message: t('It becomes the active version: the rules that fail their tests run as they are.'),
      confirm: t('Keep it anyway'),
      icon: 'alert',
    });
    if (yes) save(true);
  };

  const activate = async (number) => {
    try {
      const what = t('Making version {version} the active one breaks books that import {name}', {
        version: number,
        name,
      });
      const breaking = await breaksNone({ version: number }, what);
      if (!breaking) return;
      await api(`_rules/${encodeURIComponent(name)}/active`, {
        method: 'PUT',
        body: { version: number, breaking: breaking === 'confirmed' },
      });
      toast(t('Version {version} is the active one', { version: number }));
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const remove = async () => {
    const yes = await confirm({
      title: t('Delete the book {name}?', { name }),
      message: t('Every version of it is deleted.'),
      confirm: t('Delete'),
      icon: 'trash',
    });
    if (!yes) return;
    try {
      await api(`_rules/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setDirty(false);
      setBlocker(null);
      navigate(['_rules'], {});
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  // The spots of the cells of the sheet shown: rows of tests (passed or failed), rules that never give a result, and
  // the highlight; each { className, title }.
  const sheetName = sheets ? sheets[Math.min(sheetIndex, sheets.length - 1)]?.name : null;
  // What differs between the version beside and the sheets, their rows lined up.
  const besideDiff = useMemo(() => (beside && sheets ? besideDiffOf(beside.sheets, sheets) : null), [beside, sheets]);
  const spots = useMemo(() => {
    const map = new Map();
    const put = (cell, className, title, width = 1) => {
      if (!cell || cell.sheet !== sheetName) return;
      for (let c = cell.column; c < cell.column + width; c += 1) map.set(`${cell.row},${c}`, { className, title });
    };
    if (inspected.coverage && inspected.coverage.tests) {
      for (const entry of inspected.coverage.tables) {
        for (const missed of entry.rules ? entry.rules.missed : []) {
          put(missed.cell, 'spot-untested', t('No test reaches this rule'));
        }
      }
    }
    for (const test of inspected.tests || []) {
      for (const row of test.rows) {
        const message = row.message || (row.messages ? row.messages.join('\n') : row.error);
        put(row.cell, row.passed ? 'spot-pass' : 'spot-fail', row.passed ? null : message, test.position?.width ?? 1);
      }
    }
    for (const report of inspected.analysis || []) {
      for (const axis of report.axes) {
        for (const rule of axis.rules) {
          if (axis.never.includes(rule.id)) put(rule.cell, 'spot-warn', t('No case reaches this rule'));
          else if (axis.shadowed.includes(rule.id))
            put(rule.cell, 'spot-warn', t('The rules before it take every case of this rule'));
        }
      }
    }
    for (const issue of inspected.lint || []) put(issue.cell, 'spot-lint', issue.message);
    for (const cell of highlight ? highlight.cells : []) {
      put(cell, highlight.kind === 'diff' ? 'spot-diff' : 'spot-hit', cell.note || null);
    }
    for (const cell of besideDiff ? besideDiff.now : []) put(cell, 'spot-diff', cell.note);
    return map;
  }, [inspected, highlight, sheetName, besideDiff]);

  // The two grids side by side scroll together.
  useEffect(() => {
    const boxes = besideBox.current ? [...besideBox.current.querySelectorAll('.grid-box')] : [];
    if (boxes.length !== 2) return undefined;
    const follow = (from, to) => () => {
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
    };
    const listeners = [follow(boxes[0], boxes[1]), follow(boxes[1], boxes[0])];
    boxes.forEach((box, i) => box.addEventListener('scroll', listeners[i], { passive: true }));
    return () => boxes.forEach((box, i) => box.removeEventListener('scroll', listeners[i]));
  }, [beside, sheetName]);

  if (error && !data) return <Failure error={error} retry={reload} />;
  if (!data || !sheets) return <Loading />;
  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)];
  const editable = canChange;
  const viewing = data.version;
  const goTo = (sheetName, row, column) => {
    const index = sheets.findIndex((entry) => entry.name === sheetName);
    if (index === -1) return;
    setSheetIndex(index);
    setSelect({ row, column, row2: row, column2: column });
  };
  // The next cell of the highlight after the cursor (the first again after the last).
  const nextSpot = () => {
    const order = (cell) => [sheets.findIndex((entry) => entry.name === cell.sheet), cell.row, cell.column];
    const after = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const here = [Math.min(sheetIndex, sheets.length - 1), select.row, select.column];
    const cells = [...highlight.cells].sort((a, b) => after(order(a), order(b)));
    const next = cells.find((cell) => after(order(cell), here) > 0) || cells[0];
    if (next) goTo(next.sheet, next.row, next.column);
  };
  const addRule = (report, axis, gap) => {
    const { add } = axis;
    const { position } = report;
    const index = sheets.findIndex((entry) => entry.name === position.sheet);
    if (!add || index === -1) return;
    change((next) => {
      const target = next[index];
      if (add.row !== undefined)
        makeRoom(target, { row: add.row }, position.column, position.column + position.width - 1);
      else makeRoom(target, { column: add.column }, position.row, position.row + position.height - 1);
      axis.dimensions.forEach((dimension, d) => {
        const place = add.cells[d];
        const value = place && conditionValue(gap[dimension], place);
        if (value === null || value === undefined) return;
        const row = add.row ?? place.row;
        const column = add.column ?? place.column;
        while (target.rows.length <= row) target.rows.push([]);
        while (target.rows[row].length <= column) target.rows[row].push(null);
        target.rows[row][column] = value;
      });
    });
    setSheetIndex(index);
    const row = add.row ?? add.focus.row;
    const column = add.column ?? add.focus.column;
    setSelect({ row, column, row2: row, column2: column });
    // (The grid takes the keys: the result is typed next.)
    requestAnimationFrame(() => document.querySelector('.grid-box')?.focus());
  };
  // The fix of a warning: a row added under the title of its table (properties | language | js), the cells of the
  // table below it (and those under the row's own cells) moved down a row.
  const applyFix = (fix) => {
    const index = sheets.findIndex((entry) => entry.name === fix.sheet);
    if (index === -1) return;
    change((next) => {
      const target = next[index];
      const last = fix.column + Math.max(fix.width, fix.cells.length) - 1;
      makeRoom(target, { row: fix.row }, fix.column, last);
      while (target.rows.length <= fix.row) target.rows.push([]);
      const row = target.rows[fix.row];
      fix.cells.forEach((value, i) => {
        while (row.length <= fix.column + i) row.push(null);
        row[fix.column + i] = value;
      });
    });
    setSheetIndex(index);
    setSelect({ row: fix.row, column: fix.column, row2: fix.row, column2: fix.column + fix.cells.length - 1 });
  };
  // A row of a test of a call (of the Try panel): under the Test tables of the table whose columns are the same, or a
  // new Test table of it under the cells of its sheet.
  // The fix of a warning for its whole sheet: rows that say the language of the sheet, inserted as whole rows (every
  // cell under them moved down, merges too).
  const applySheetFix = (fix) => {
    const index = sheets.findIndex((entry) => entry.name === fix.sheet);
    if (index === -1) return;
    const count = fix.rows.length;
    change((next) => {
      const target = next[index];
      while (target.rows.length < fix.row) target.rows.push([]);
      target.rows.splice(fix.row, 0, ...fix.rows.map((cells) => [...Array(fix.column).fill(null), ...cells]));
      for (const merge of target.merges || []) {
        if (merge.top >= fix.row) {
          merge.top += count;
          merge.bottom += count;
        } else if (merge.bottom >= fix.row) merge.bottom += count;
      }
    });
    setSheetIndex(index);
    const last = fix.rows.findLastIndex((cells) => cells.some((cell) => textOf(cell) !== ''));
    const row = fix.row + Math.max(last, 0);
    setSelect({ row, column: fix.column, row2: row, column2: fix.column + fix.rows[Math.max(last, 0)].length - 1 });
  };
  const writeTest = (table, written) => {
    const same = (inspected.tests || []).find((test) => {
      if (test.kind !== 'Test' || test.table !== table || !test.position) return false;
      const target = sheets.find((entry) => entry.name === test.position.sheet);
      const { row, column, height = 1 } = test.position;
      return (target?.rows || [])
        .slice(row + 1, row + height)
        .some((cells) => written.names.every((name, i) => textOf(cells[column + i]) === name));
    });
    const place = same
      ? same.position
      : (inspected.tables.find((entry) => entry.name === table && entry.position)?.position ?? {
          sheet: sheets[Math.min(sheetIndex, sheets.length - 1)].name,
          column: 0,
        });
    const index = sheets.findIndex((entry) => entry.name === place.sheet);
    if (index === -1) return;
    // (A new table: below the last row of the sheet that has a value, a row apart.)
    let last = sheets[index].rows.length - 1;
    while (last >= 0 && !(sheets[index].rows[last] || []).some((cell) => textOf(cell) !== '')) last -= 1;
    const at = same ? place.row + (place.height ?? 1) : last + 2;
    const lines = same ? [written.cells] : [[written.title], written.names, written.titles, written.cells];
    const row = at + lines.length - 1;
    change((next) => {
      const target = next[index];
      if (same) {
        makeRoom(
          target,
          { row: at },
          place.column,
          place.column + Math.max(place.width ?? 1, written.cells.length) - 1
        );
      }
      lines.forEach((line, r) => {
        while (target.rows.length <= at + r) target.rows.push([]);
        const cells = target.rows[at + r];
        line.forEach((value, c) => {
          while (cells.length <= place.column + c) cells.push(null);
          cells[place.column + c] = value;
        });
      });
    });
    setSheetIndex(index);
    setSelect({ row, column: place.column, row2: row, column2: place.column + written.cells.length - 1 });
    toast(
      same
        ? t('A row added to the test {name}', { name: same.name })
        : t('A new test {name}', { name: written.title.split(/\s+/)[2] })
    );
  };
  // Side by side: the rows of the sheet shown lined up with those of the version beside, and as many columns in both.
  const besideSheet = beside ? beside.sheets.find((entry) => entry.name === sheet.name) : null;
  const lines = besideSheet ? besideDiff.layouts.get(sheet.name) : null;
  const columns = besideSheet
    ? Math.max(...[...besideSheet.rows, ...sheet.rows].map((row) => (row ? row.length : 0)), 0) + 4
    : null;
  const sideBySide = async (other) => {
    try {
      const old = await api(`_rules/${encodeURIComponent(name)}?version=${other}`);
      setBeside({ version: other, sheets: copySheets(old.sheets || []), tables: old.tables || [] });
      setHighlight(null);
    } catch (err) {
      toast(err.message, 'danger');
    }
  };
  const compare = async (other) => {
    try {
      const old = await api(`_rules/${encodeURIComponent(name)}?version=${other}`);
      const cells = changedCells(old.sheets || [], sheets);
      setHighlight({
        kind: 'diff',
        label: t('Cells that differ from version {version}: {count}', { count: cells.length, version: other }),
        cells,
      });
      if (cells.length) goTo(cells[0].sheet, cells[0].row, cells[0].column);
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  return (
    <>
      <PageHead
        title={name}
        sub={
          viewing === data.active
            ? t('Version {version}, the active one', { version: viewing })
            : t('Version {version} (the active one is {active})', { version: viewing, active: data.active ?? '—' })
        }
        badge={dirty ? <Badge tone="warning">{t('Not saved')}</Badge> : null}
        actions={
          <>
            <Button
              icon="save"
              variant="ghost"
              onClick={() => downloadBook(name, viewing).catch((err) => toast(err.message, 'danger'))}
            >
              {t('Download')}
            </Button>
            {canChange && viewing !== data.active ? (
              <Button icon="check" onClick={() => activate(viewing)}>
                {t('Make it the active one')}
              </Button>
            ) : null}
            {canDelete ? (
              <Button icon="trash" variant="danger" onClick={remove}>
                {t('Delete')}
              </Button>
            ) : null}
          </>
        }
      />
      {editable ? (
        <div className="rule-toolbar">
          <input
            className="input"
            placeholder={t('What changed (a comment of the version)')}
            aria-label={t('Comment')}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button variant="primary" icon="save" busy={saving} disabled={!dirty} onClick={() => save(false)}>
            {t('Save a new version')}
          </Button>
        </div>
      ) : null}
      {(inspected.imports && inspected.imports.length) || (data.importedBy && data.importedBy.length) ? (
        <p className="rule-imports muted note">
          {inspected.imports && inspected.imports.length ? (
            <span>
              {t('Imports')}:{' '}
              {inspected.imports.map((other, i) => (
                <span key={other}>
                  {i ? ', ' : ''}
                  <a href={href(['_rules', other], {})}>{other}</a>
                </span>
              ))}
            </span>
          ) : null}
          {data.importedBy && data.importedBy.length ? (
            <span className="rule-imported-by">
              {t('Imported by')}:{' '}
              {data.importedBy.map((other, i) => (
                <span key={other.name}>
                  {i ? ', ' : ''}
                  <a href={href(['_rules', other.name], {})}>{other.name}</a>
                  {other.direct ? '' : ` (${t('through others')})`}
                </span>
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
      {failed ? (
        <Alert>
          <strong>{t('The book does not pass its tests')}</strong>
          <ul className="rule-messages">
            {failed.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <Button size="sm" variant="danger" onClick={keepAnyway}>
            {t('Keep it anyway')}
          </Button>
        </Alert>
      ) : null}
      <div className={`rule-book${beside ? ' wide' : ''}`}>
        <section className="card rule-sheets">
          <SheetTabs
            sheets={sheets}
            index={sheetIndex}
            editable={editable}
            onChoose={setSheetIndex}
            onAdd={() => {
              const sheetName = window.prompt(t('The name of the sheet'), `Sheet${sheets.length + 1}`);
              if (!sheetName || sheets.some((entry) => entry.name === sheetName)) return;
              change((next) => next.push({ name: sheetName, rows: [], merges: [] }));
              setSheetIndex(sheets.length);
            }}
            onRename={(index) => {
              const sheetName = window.prompt(t('The name of the sheet'), sheets[index].name);
              if (!sheetName || sheets.some((entry, i) => i !== index && entry.name === sheetName)) return;
              change((next) => {
                next[index].name = sheetName;
              });
            }}
            onDelete={async (index) => {
              const yes = await confirm({
                title: t('Delete the sheet {name}?', { name: sheets[index].name }),
                confirm: t('Delete'),
                icon: 'trash',
              });
              if (!yes || sheets.length < 2) return;
              change((next) => next.splice(index, 1));
              setSheetIndex(0);
            }}
          />
          {highlight ? (
            <div className="rule-highlight" aria-live="polite">
              <span>{highlight.label}</span>
              {highlight.cells.length ? (
                <Button size="sm" variant="ghost" onClick={nextSpot}>
                  {t('Next')}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setHighlight(null)}>
                {t('Clear')}
              </Button>
            </div>
          ) : null}
          {beside ? (
            <Beside
              beside={beside}
              changes={tableChanges(
                beside.tables,
                inspected.tables,
                besideDiff.now,
                besideDiff.then,
                beside.sheets,
                sheets
              )}
              count={besideDiff.count}
              onGo={goTo}
              onClose={() => setBeside(null)}
            />
          ) : null}
          <div className={beside ? 'rule-beside' : undefined} ref={besideBox}>
            {beside ? (
              <div className="rule-beside-side">
                <div className="rule-beside-head">{t('Version {version}', { version: beside.version })}</div>
                {beside.sheets.some((entry) => entry.name === sheet.name) ? (
                  <Grid
                    key={`beside-${sheet.name}`}
                    sheet={beside.sheets.find((entry) => entry.name === sheet.name)}
                    tables={beside.tables.filter((table) => table.position && table.position.sheet === sheet.name)}
                    spots={diffSpots(besideDiff.then, sheet.name)}
                    editable={false}
                    layout={lines ? lines.left : null}
                    rowMarks={lines ? lines.removed : null}
                    mark="row-removed"
                    columns={columns}
                    select={
                      lines
                        ? {
                            ...select,
                            row: across(lines.right, lines.left, select.row),
                            row2: across(lines.right, lines.left, select.row2),
                          }
                        : select
                    }
                    onSelect={(chosen) =>
                      setSelect(
                        lines
                          ? {
                              ...chosen,
                              row: across(lines.left, lines.right, chosen.row),
                              row2: across(lines.left, lines.right, chosen.row2),
                            }
                          : chosen
                      )
                    }
                    onChange={() => {}}
                    onUndo={() => {}}
                    onRedo={() => {}}
                  />
                ) : (
                  <p className="muted note rule-beside-none">
                    {t('Version {version} has no sheet {name}', { version: beside.version, name: sheet.name })}
                  </p>
                )}
              </div>
            ) : null}
            <div className="rule-beside-side">
              {beside ? (
                <div className="rule-beside-head">
                  {dirty ? t('These sheets (not saved)') : t('Version {version}', { version: viewing })}
                </div>
              ) : null}
              <Grid
                key={sheet.name}
                tools={!beside}
                layout={lines ? lines.right : null}
                rowMarks={lines ? lines.added : null}
                mark="row-added"
                columns={columns}
                sheet={sheet}
                tables={inspected.tables.filter((table) => table.position && table.position.sheet === sheet.name)}
                spots={spots}
                editable={editable}
                select={select}
                onSelect={setSelect}
                onChange={(update) =>
                  change((next) => {
                    update(next[Math.min(sheetIndex, next.length - 1)]);
                  })
                }
                onUndo={undo}
                onRedo={redo}
              />
            </div>
          </div>
        </section>
        <aside className="card rule-side">
          <div className="tabs" role="tablist">
            {[
              [
                'messages',
                inspected.errors.length ? t('Messages ({count})', { count: inspected.errors.length }) : t('Messages'),
              ],
              ['tables', t('Tables')],
              ['tests', t('Tests')],
              ['try', t('Try a table')],
              ['versions', t('Versions')],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                className={`tab ${panel === id ? 'active' : ''}`}
                onClick={() => setPanel(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === 'messages' ? (
            <Messages
              onFix={editable ? applyFix : null}
              onSheetFix={editable ? applySheetFix : null}
              errors={inspected.errors}
              lint={inspected.lint || []}
              checking={checking}
              tables={inspected.tables}
              onGo={goTo}
            />
          ) : panel === 'tables' ? (
            <Tables
              tables={inspected.tables}
              analysis={inspected.analysis || []}
              coverage={inspected.coverage}
              onGo={goTo}
              onAddRule={editable ? addRule : null}
              onTry={(entry) => {
                setPreset({ table: entry.name, context: JSON.stringify(entry.context || {}), at: Date.now() });
                setPanel('try');
              }}
            />
          ) : panel === 'tests' ? (
            <Tests
              tests={inspected.tests || []}
              tdz={Boolean(data.tdz)}
              checkImporters={Boolean(data.checkImporters)}
              onGo={goTo}
            />
          ) : panel === 'try' ? (
            <Try
              key={preset ? preset.at : 'try'}
              preset={preset}
              name={name}
              tables={inspected.tables}
              sheets={dirty ? trimmed(sheets) : null}
              version={viewing}
              onGo={goTo}
              onWriteTest={editable ? writeTest : null}
              onTrace={(table, trace) =>
                setHighlight(
                  trace
                    ? {
                        kind: 'trace',
                        label: t('The cells that gave the results of {table}', { table }),
                        cells: traceCells(trace),
                      }
                    : null
                )
              }
            />
          ) : (
            <Versions
              versions={data.versions}
              viewing={viewing}
              active={data.active}
              name={name}
              canChange={canChange}
              onActivate={activate}
              onCompare={compare}
              onBeside={sideBySide}
              beside={beside ? beside.version : null}
            />
          )}
        </aside>
      </div>
    </>
  );
}

// What differs from the version beside: how many cells, the tables changed, new and gone (links to them), the sheets
// it has that these do not.
function Beside({ beside, changes, count, onGo, onClose }) {
  const links = (tables) =>
    tables.map((table, i) => (
      <button
        key={`${table.kind}${table.name}${i}`}
        type="button"
        className="link"
        onClick={() => table.position && onGo(table.position.sheet, table.position.row, table.position.column)}
      >
        {tableLabel(table)}
      </button>
    ));
  return (
    <div className="rule-highlight rule-beside-bar" aria-live="polite">
      <span>
        {t('Side by side with version {version}. Cells that differ: {count}', { version: beside.version, count })}
        {changes.changed.length ? (
          <span className="rule-beside-list">
            {t('Tables changed')}: {links(changes.changed)}
          </span>
        ) : null}
        {changes.added.length ? (
          <span className="rule-beside-list">
            {t('New tables')}: {links(changes.added)}
          </span>
        ) : null}
        {changes.removed.length ? (
          <span className="rule-beside-list">
            {t('Tables gone')}: {changes.removed.map(tableLabel).join(', ')}
          </span>
        ) : null}
        {changes.sheets.length ? (
          <span className="rule-beside-list">
            {t('Sheets gone')}: {changes.sheets.join(', ')}
          </span>
        ) : null}
      </span>
      <Button size="sm" variant="ghost" onClick={onClose}>
        {t('Close')}
      </Button>
    </div>
  );
}

function SheetTabs({ sheets, index, editable, onChoose, onAdd, onRename, onDelete }) {
  return (
    <div className="rule-tabs" role="tablist" aria-label={t('Sheets')}>
      {sheets.map((entry, i) => (
        <span key={entry.name} className={`rule-tab ${i === index ? 'active' : ''}`}>
          <button
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => onChoose(i)}
            onDoubleClick={() => editable && onRename(i)}
          >
            {entry.name}
          </button>
          {editable && i === index && sheets.length > 1 ? (
            <button
              type="button"
              className="rule-tab-x"
              aria-label={t('Delete the sheet {name}?', { name: entry.name })}
              onClick={() => onDelete(i)}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <button type="button" className="rule-tab add" onClick={onAdd} aria-label={t('Add a sheet')}>
          +
        </button>
      ) : null}
    </div>
  );
}

// The grid of a sheet. The selection is a range (row, column to row2, column2); typing edits its first cell.
// Side by side, the rows it shows are a layout (the row of each line, null for a gap: a row the other side has), some
// marked (rowMarks, with the class mark: rows inserted or deleted), and its columns as many as the other's.
function Grid({
  sheet,
  tables,
  spots,
  editable,
  tools = true,
  layout = null,
  rowMarks = null,
  mark = '',
  columns = null,
  select,
  onSelect,
  onChange,
  onUndo,
  onRedo,
}) {
  const [editing, setEditing] = useState(null);
  const box = useRef(null);
  const height = Math.max(MIN_ROWS, sheet.rows.length + 10);
  const width = Math.max(MIN_COLUMNS, sheet.rows.reduce((max, row) => Math.max(max, row.length), 0) + 4, columns ?? 0);
  const order = layout ?? Array.from({ length: height }, (_, r) => r);
  const top = Math.min(select.row, select.row2);
  const bottom = Math.max(select.row, select.row2);
  const left = Math.min(select.column, select.column2);
  const right = Math.max(select.column, select.column2);

  // The table of each cell (its kind, whether it is the title row), and the label of each table at its title.
  const marks = useMemo(() => {
    const map = new Map();
    for (const table of tables) {
      const { row, column, height: rows = 1, width: columns = 1 } = table.position;
      for (let r = row; r < row + rows; r += 1) {
        for (let c = column; c < column + columns; c += 1) {
          map.set(`${r},${c}`, {
            kind: table.kind,
            title: r === row,
            edge: `${r === row ? ' e-top' : ''}${r === row + rows - 1 ? ' e-bottom' : ''}${c === column ? ' e-left' : ''}${c === column + columns - 1 ? ' e-right' : ''}`,
            label:
              r === row && c === column + columns - 1
                ? `${KIND_LABELS[table.kind] || table.kind}${table.name ? ` · ${table.name}` : ''}`
                : null,
          });
        }
      }
    }
    return map;
  }, [tables]);

  const setCells = (row, column, values) =>
    onChange((target) => {
      values.forEach((line, r) => {
        const at = row + r;
        while (target.rows.length <= at) target.rows.push([]);
        const cells = target.rows[at];
        line.forEach((value, c) => {
          while (cells.length <= column + c) cells.push(null);
          cells[column + c] = value;
        });
      });
    });

  const commit = (text, move) => {
    if (!editing) return;
    setCells(editing.row, editing.column, [[valueOf(text)]]);
    setEditing(null);
    if (move) moveBy(move[0], move[1], false);
    box.current?.focus();
  };

  const moveBy = (dr, dc, extend) => {
    const row = Math.max(0, Math.min(height - 1, (extend ? select.row2 : select.row) + dr));
    const column = Math.max(0, Math.min(width - 1, (extend ? select.column2 : select.column) + dc));
    onSelect(extend ? { ...select, row2: row, column2: column } : { row, column, row2: row, column2: column });
  };

  const clear = () =>
    onChange((target) => {
      for (let r = top; r <= bottom; r += 1) {
        const cells = target.rows[r];
        if (!cells) continue;
        for (let c = left; c <= right; c += 1) if (c < cells.length) cells[c] = null;
      }
    });

  const onKeyDown = (event) => {
    if (editing) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      moveBy(...moves[event.key], event.shiftKey);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      moveBy(0, event.shiftKey ? -1 : 1, false);
    } else if (event.key === 'Enter' && editable) {
      event.preventDefault();
      setEditing({ row: select.row, column: select.column, text: textOf(sheet.rows[select.row]?.[select.column]) });
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && editable) {
      event.preventDefault();
      clear();
    } else if (ctrl && event.key.toLowerCase() === 'z' && editable) {
      event.preventDefault();
      if (event.shiftKey) onRedo();
      else onUndo();
    } else if (ctrl && event.key.toLowerCase() === 'y' && editable) {
      event.preventDefault();
      onRedo();
    } else if (!ctrl && !event.altKey && event.key.length === 1 && editable) {
      event.preventDefault();
      setEditing({ row: select.row, column: select.column, text: event.key });
    }
  };

  const onCopy = (event) => {
    if (editing) return;
    const rows = [];
    for (let r = top; r <= bottom; r += 1) {
      const line = [];
      for (let c = left; c <= right; c += 1) line.push(sheet.rows[r]?.[c] ?? null);
      rows.push(line);
    }
    event.clipboardData.setData('text/plain', toTsv(rows));
    event.preventDefault();
  };

  const onPaste = (event) => {
    if (editing || !editable) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const rows = fromTsv(text).map((line) => line.map(valueOf));
    setCells(top, left, rows);
    const lastRow = top + rows.length - 1;
    const lastColumn = left + Math.max(...rows.map((line) => line.length)) - 1;
    onSelect({ row: top, column: left, row2: lastRow, column2: lastColumn });
  };

  const insertRow = () =>
    onChange((target) => {
      while (target.rows.length < top) target.rows.push([]);
      target.rows.splice(top, 0, []);
    });
  const deleteRows = () => onChange((target) => target.rows.splice(top, bottom - top + 1));
  const insertColumn = () =>
    onChange((target) => target.rows.forEach((row) => row.length > left && row.splice(left, 0, null)));
  const deleteColumns = () => onChange((target) => target.rows.forEach((row) => row.splice(left, right - left + 1)));
  // A new table of a kind at the cursor (its example, to change), over empty cells or if the user says so.
  const newTable = (kind) => {
    const rows = SKELETONS[kind];
    if (!rows) return;
    const used = rows.some((line, r) =>
      line.some((_, c) => textOf(sheet.rows[select.row + r]?.[select.column + c]) !== '')
    );
    if (used && !window.confirm(t('The cells of the new table are not empty. Write over them?'))) return;
    setCells(select.row, select.column, rows);
    onSelect({
      row: select.row,
      column: select.column,
      row2: select.row + rows.length - 1,
      column2: select.column + Math.max(...rows.map((line) => line.length)) - 1,
    });
  };

  return (
    <>
      {editable && tools ? (
        <div className="grid-tools">
          <span className="mono note">
            {columnName(select.column)}
            {select.row + 1}
          </span>
          <input
            className="input grid-formula"
            aria-label={t('Value of the cell')}
            value={editing ? editing.text : textOf(sheet.rows[select.row]?.[select.column])}
            onFocus={() =>
              !editing &&
              setEditing({
                row: select.row,
                column: select.column,
                text: textOf(sheet.rows[select.row]?.[select.column]),
              })
            }
            onChange={(event) => setEditing({ row: select.row, column: select.column, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(event.target.value, [1, 0]);
              if (event.key === 'Escape') {
                setEditing(null);
                box.current?.focus();
              }
            }}
            onBlur={(event) => editing && commit(event.target.value, null)}
          />
          <Button size="sm" variant="ghost" onClick={insertRow}>
            {t('Insert row')}
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteRows}>
            {t('Delete rows')}
          </Button>
          <Button size="sm" variant="ghost" onClick={insertColumn}>
            {t('Insert column')}
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteColumns}>
            {t('Delete columns')}
          </Button>
          <select
            className="input grid-new"
            aria-label={t('New table')}
            value=""
            onChange={(event) => {
              newTable(event.target.value);
              box.current?.focus();
            }}
          >
            <option value="">{t('New table…')}</option>
            {Object.keys(SKELETONS).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind] || kind}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div
        className="grid-box"
        ref={box}
        tabIndex={0}
        role="grid"
        aria-label={sheet.name}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
      >
        <table className="sheet-grid">
          <thead>
            <tr>
              <th className="corner" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} className={c >= left && c <= right ? 'on' : ''}>
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((r, line) =>
              r === null ? (
                <tr key={`gap-${line}`} className="row-gap" aria-hidden="true">
                  <th />
                  {Array.from({ length: width }, (_, c) => (
                    <td key={c} />
                  ))}
                </tr>
              ) : (
                <tr key={r} className={rowMarks && rowMarks.has(r) ? mark : undefined}>
                  <th className={r >= top && r <= bottom ? 'on' : ''}>{r + 1}</th>
                  {Array.from({ length: width }, (_, c) => {
                    const mark = marks.get(`${r},${c}`);
                    const selected = r >= top && r <= bottom && c >= left && c <= right;
                    const cursor = r === select.row && c === select.column;
                    const value = sheet.rows[r]?.[c];
                    const spot = spots.get(`${r},${c}`);
                    const classes = [
                      spot ? spot.className : '',
                      mark
                        ? `k-${FAMILY[mark.kind] || mark.kind.toLowerCase()}${mark.title ? ' title' : ''}${mark.edge}${mark.label ? ' has-label' : ''}`
                        : '',
                      // (A text goes on over the empty cells at its right, as in Excel.)
                      value !== null && value !== undefined && value !== '' && (sheet.rows[r]?.[c + 1] ?? null) === null
                        ? 'spill'
                        : '',
                      selected ? 'selected' : '',
                      cursor ? 'cursor' : '',
                      typeof value === 'number' ? 'num' : '',
                      typeof value === 'string' && value.trim().startsWith('=') ? 'formula' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <td
                        key={c}
                        className={classes}
                        title={spot && spot.title ? spot.title : undefined}
                        onMouseDown={(event) => {
                          if (editing) commit(editing.text, null);
                          if (event.shiftKey) onSelect({ ...select, row2: r, column2: c });
                          else onSelect({ row: r, column: c, row2: r, column2: c });
                        }}
                        onMouseEnter={(event) => {
                          if (event.buttons === 1 && !editing) onSelect({ ...select, row2: r, column2: c });
                        }}
                        onDoubleClick={() => editable && setEditing({ row: r, column: c, text: textOf(value) })}
                      >
                        {editing && editing.row === r && editing.column === c ? (
                          <input
                            className="cell-input"
                            autoFocus
                            value={editing.text}
                            aria-label={`${columnName(c)}${r + 1}`}
                            onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commit(event.target.value, [1, 0]);
                              } else if (event.key === 'Tab') {
                                event.preventDefault();
                                commit(event.target.value, [0, event.shiftKey ? -1 : 1]);
                              } else if (event.key === 'Escape') {
                                setEditing(null);
                                box.current?.focus();
                              }
                            }}
                            onBlur={(event) => commit(event.target.value, null)}
                          />
                        ) : (
                          <span className="cell-text">{textOf(value)}</span>
                        )}
                        {mark && mark.label ? <span className="table-label">{mark.label}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// The messages of the book (the place of a cell they name is a link to it), or that it passes.
function Messages({ errors, lint, checking, tables, onGo, onFix, onSheetFix }) {
  const link = (message) => {
    const match = /([^\s!]+)!([A-Z]+\d+)/.exec(message);
    const at = match && cellAt(match[2]);
    if (at) return () => onGo(match[1], at[0], at[1]);
    const table = tables.find((entry) => entry.name && entry.position && message.includes(` ${entry.name}`));
    return table ? () => onGo(table.position.sheet, table.position.row, table.position.column) : null;
  };
  return (
    <div className="rule-panel" aria-live="polite">
      {checking ? <p className="muted note">{t('Checking…')}</p> : null}
      {!errors.length ? (
        <p className="rule-ok">
          <Badge status="done" /> {t('Every test passes')}
        </p>
      ) : (
        <ul className="rule-messages">
          {errors.map((message) => {
            const go = link(message);
            return (
              <li key={message}>
                {go ? (
                  <button type="button" className="link" onClick={go}>
                    {message}
                  </button>
                ) : (
                  message
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lint.length ? (
        <>
          <div className="label">{t('Warnings of the formulas ({count})', { count: lint.length })}</div>
          <ul className="rule-messages rule-lint">
            {lint.map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="link"
                  onClick={() => onGo(issue.cell.sheet, issue.cell.row, issue.cell.column)}
                >
                  {issue.table} · {columnName(issue.cell.column)}
                  {issue.cell.row + 1}: {issue.message}
                </button>
                {onFix && issue.fix ? (
                  <button type="button" className="link rule-add" onClick={() => onFix(issue.fix)}>
                    {t('Add the row {row}', { row: issue.fix.cells.join(' | ') })}
                  </button>
                ) : null}
                {onSheetFix && issue.sheetFix ? (
                  <button type="button" className="link rule-add" onClick={() => onSheetFix(issue.sheetFix)}>
                    {t('Say {language} for the whole sheet {sheet}', {
                      language: LANGUAGES[issue.fix.cells[2]] || issue.fix.cells[2],
                      sheet: issue.sheetFix.sheet,
                    })}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="muted note">{t('{count} tables', { count: tables.length })}</p>
    </div>
  );
}

const placeOf = (position) => (position ? `${position.sheet}!${columnName(position.column)}${position.row + 1}` : '');
// (Values as conditions: age = 30, age >=18, plan not basic, gold.)
const shownValues = (values) =>
  Object.entries(values)
    .map(([key, value]) => (/^([<>[(]|not |any$)/.test(String(value)) ? `${key} ${value}` : `${key} = ${value}`))
    .join('; ');

// The tables of the book, found by name or kind, each a link to its place, and the gaps and overlaps of the decision
// tables.
function Tables({ tables, analysis, coverage, onGo, onAddRule, onTry }) {
  const [find, setFind] = useState('');
  const reports = new Map(analysis.map((report) => [placeOf(report.position), report]));
  const reached = new Map(
    coverage && coverage.tests ? coverage.tables.map((entry) => [placeOf(entry.position), entry]) : []
  );
  const needle = find.trim().toLowerCase();
  const shown = tables.filter((table) => !needle || `${table.name ?? ''} ${table.kind}`.toLowerCase().includes(needle));
  return (
    <div className="rule-panel">
      <input
        className="input"
        type="search"
        placeholder={t('Find a table')}
        aria-label={t('Find a table')}
        value={find}
        onChange={(event) => setFind(event.target.value)}
      />
      <ul className="rule-tables">
        {shown.map((table, i) => {
          const report = reports.get(placeOf(table.position));
          const covered = reached.get(placeOf(table.position));
          return (
            <li key={placeOf(table.position) || i}>
              <button
                type="button"
                className="link"
                onClick={() => table.position && onGo(table.position.sheet, table.position.row, table.position.column)}
              >
                {table.name || '—'}
              </button>{' '}
              <span className="muted note">
                {KIND_LABELS[table.kind] || table.kind} · {placeOf(table.position)}
              </span>{' '}
              <Language table={table} />
              {table.versions ? (
                <div className="rule-version">
                  <Badge tone="info">{t('One of {count} versions', { count: table.versions })}</Badge>
                  {RUNNABLE.has(table.kind) ? (
                    <button type="button" className="link" onClick={() => onTry(table)}>
                      {t('Try this version')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {table.properties ? <Properties table={table} /> : null}
              {covered ? <Coverage entry={covered} onGo={onGo} onTry={onTry} /> : null}
              {report ? <Analysis report={report} onGo={onGo} onAddRule={onAddRule} /> : null}
            </li>
          );
        })}
      </ul>
      {!shown.length ? <p className="muted note">{t('No table matches')}</p> : null}
    </div>
  );
}

const LANGUAGES = { openl: 'OpenL', js: 'JavaScript' };

// The language of the code of a table, and what told it (its property, its code, the book).
function Language({ table }) {
  if (!table.language) return null;
  const from = {
    property: t('Its property language says it'),
    properties: t('A Properties table says it'),
    code: t('Only this language reads its code'),
    book: t('The language of the book'),
  }[table.languageFrom];
  return (
    <span className={`rule-lang ${table.language}`} title={from}>
      {LANGUAGES[table.language] || table.language}
    </span>
  );
}

// The properties of a table: its own, and those of Properties tables (apart); the scope of a Properties table.
function Properties({ table }) {
  const day = (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(value) ? value.slice(0, 10) : value;
  return (
    <div className="rule-props">
      {table.scope ? <span className="rule-prop">{t('Scope: {scope}', { scope: table.scope })}</span> : null}
      {Object.entries(table.properties).map(([key, value]) => {
        const own = !table.own || table.own.includes(key);
        return (
          <span
            key={key}
            className={`rule-prop mono ${own ? '' : 'inherited'}`}
            title={own ? undefined : t('From a Properties table')}
          >
            {key} = {String(day(value))}
          </span>
        );
      })}
    </div>
  );
}

// What the tests of the book reach of a table: whether one runs it, and its rules that none reaches.
function Coverage({ entry, onGo, onTry }) {
  if (!entry.tested) {
    return (
      <div className="note rule-untested">
        {t('No test runs this table')}
        {RUNNABLE.has(entry.kind) ? (
          <button type="button" className="link rule-add" onClick={() => onTry({ name: entry.table })}>
            {t('Try it to write a test')}
          </button>
        ) : null}
      </div>
    );
  }
  if (!entry.rules || !entry.rules.missed.length) return null;
  return (
    <div className="note rule-untested">
      {t('Tests reach {covered} of {total} rules; not', { covered: entry.rules.covered, total: entry.rules.total })}{' '}
      {entry.rules.missed.map((missed) => (
        <button
          key={`${missed.axis}${missed.id}`}
          type="button"
          className="link"
          onClick={() => onGo(missed.cell.sheet, missed.cell.row, missed.cell.column)}
        >
          #{missed.id}
        </button>
      ))}
    </div>
  );
}

// The gaps (cases of no rule), overlaps (of several rules), rules that never give a result and empty cells of a
// decision table.
function Analysis({ report, onGo, onAddRule }) {
  const total = (key) =>
    report.axes.reduce((sum, axis) => sum + (Array.isArray(axis[key]) ? axis[key].length : axis[key]), 0);
  const gaps = total('gapCount');
  const overlaps = total('overlaps');
  const unreachable = total('shadowed') + total('never');
  const holes = report.holes ? report.holes.length : 0;
  if (!gaps && !overlaps && !unreachable && !holes) {
    return (
      <div className="note">
        <Badge status="done" /> {t('No gaps or overlaps')}
      </div>
    );
  }
  const go = (cell) => () => onGo(cell.sheet, cell.row, cell.column);
  const links = (axis, ids) =>
    ids.map((id) => {
      const rule = axis.rules.find((entry) => entry.id === id);
      return (
        <button key={id} type="button" className="link" onClick={go(rule.cell)}>
          #{id}
          {rule.name ? ` ${rule.name}` : ''}
        </button>
      );
    });
  return (
    <details className="rule-analysis">
      <summary>
        {gaps ? <Badge tone="warning">{t('Gaps: {count}', { count: gaps })}</Badge> : null}
        {overlaps ? <Badge tone="info">{t('Overlaps: {count}', { count: overlaps })}</Badge> : null}
        {unreachable ? <Badge tone="danger">{t('Rules that never win: {count}', { count: unreachable })}</Badge> : null}
        {holes ? <Badge tone="warning">{t('Empty cells: {count}', { count: holes })}</Badge> : null}
      </summary>
      {report.axes.map((axis) => (
        <div key={axis.axis} className="rule-axis">
          {report.axes.length > 1 ? (
            <div className="label">{axis.axis === 'rows' ? t('Rows') : t('Columns')}</div>
          ) : null}
          {axis.partial ? (
            <p className="note muted">{t('Conditions written as expressions are taken as met')}</p>
          ) : null}
          {axis.gaps.length ? (
            <>
              <div className="note">{t('No rule for')}</div>
              <ul className="mono note">
                {axis.gaps.map((gap, i) => (
                  <li key={i}>
                    {shownValues(gap)}
                    {onAddRule && axis.add ? (
                      <button type="button" className="link rule-add" onClick={() => onAddRule(report, axis, gap)}>
                        {t('Add a rule')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {axis.moreGaps ? <p className="note muted">{t('And more')}</p> : null}
            </>
          ) : null}
          {axis.overlaps.length ? (
            <>
              <div className="note">{t('Several rules for')}</div>
              <ul className="note">
                {axis.overlaps.map((overlap) => (
                  <li key={overlap.rules.join()}>
                    {links(axis, overlap.rules)} <span className="mono">{shownValues(overlap.example)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {axis.shadowed.length ? (
            <p className="note">
              {t('The rules before them take every case of')} {links(axis, axis.shadowed)}
            </p>
          ) : null}
          {axis.never.length ? (
            <p className="note">
              {t('No case reaches')} {links(axis, axis.never)}
            </p>
          ) : null}
        </div>
      ))}
      {holes ? (
        <p className="note">
          {t('Empty cells')}{' '}
          {report.holes.map((hole) => (
            <button key={`${hole.row},${hole.column}`} type="button" className="link mono" onClick={go(hole.cell)}>
              {columnName(hole.cell.column)}
              {hole.cell.row + 1}
            </button>
          ))}
        </p>
      ) : null}
    </details>
  );
}

// The checks of the store a book is subject to: tdz (a let or const of a Method used before its declaration is an
// error) and checkImporters (a version that breaks the books importing it is not made active, unless forced).
function StoreChecks({ tdz, checkImporters }) {
  return (
    <div className="note muted rule-checks">
      <p className="rule-tdz">
        <Badge tone={tdz ? 'info' : ''}>{tdz ? t('tdz on') : t('tdz off')}</Badge>{' '}
        {tdz
          ? t('In Methods, a let or const used before its declaration is an error, as in JavaScript.')
          : t(
              'In Methods, a let or const used before its declaration is undefined (the store option tdz makes it an error).'
            )}
      </p>
      <p className="rule-importers">
        <Badge tone={checkImporters ? 'info' : ''}>
          {checkImporters ? t('checkImporters on') : t('checkImporters off')}
        </Badge>{' '}
        {checkImporters
          ? t('A version that breaks the books importing this one is not made active, unless forced.')
          : t('A version that breaks the books importing this one can still be made active, after a warning.')}
      </p>
    </div>
  );
}

// How each row of the tests of the book went (a link to its row), as the book changes; and the checks of its store.
function Tests({ tests, tdz, checkImporters, onGo }) {
  if (!tests.length) {
    return (
      <div className="rule-panel">
        <StoreChecks tdz={tdz} checkImporters={checkImporters} />
        <p className="muted">{t('The book has no tests')}</p>
      </div>
    );
  }
  return (
    <div className="rule-panel">
      <StoreChecks tdz={tdz} checkImporters={checkImporters} />
      {tests.map((test) => {
        const failed = test.rows.filter((row) => !row.passed).length;
        return (
          <section key={placeOf(test.position) || test.name} className="rule-test">
            <h4>
              <button
                type="button"
                className="link"
                onClick={() => test.position && onGo(test.position.sheet, test.position.row, test.position.column)}
              >
                {test.name}
              </button>{' '}
              <span className="muted note">→ {test.table}</span>{' '}
              {failed ? (
                <Badge tone="danger">{t('{count} failed', { count: failed })}</Badge>
              ) : (
                <Badge tone="success">{t('Passed: {count}', { count: test.rows.length })}</Badge>
              )}
            </h4>
            <ul className="rule-test-rows">
              {test.rows.map((row) => (
                <li key={row.row} className={row.passed ? 'pass' : 'fail'}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => row.cell && onGo(row.cell.sheet, row.cell.row, row.cell.column)}
                  >
                    {row.description || t('Row {row}', { row: row.row })}
                  </button>
                  {test.kind === 'Run' && row.passed ? (
                    <span className="mono"> → {JSON.stringify(row.actual ?? null)}</span>
                  ) : null}
                  {!row.passed ? (
                    <div className="note">{row.message || (row.messages ? row.messages.join('; ') : row.error)}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// A call of a trace: its table, arguments and result (or error), the version chosen, and the calls it made.
function TraceNode({ node, onGo }) {
  const at = node.cells[0] || node.position;
  return (
    <li>
      <button type="button" className="link mono" onClick={() => at && onGo(at.sheet, at.row, at.column)}>
        {node.table}({node.args.map((arg) => JSON.stringify(arg)).join(', ')})
      </button>{' '}
      <span className="muted note">{KIND_LABELS[node.kind] || node.kind}</span> →{' '}
      {node.error ? (
        <span className="rule-error">{node.error}</span>
      ) : (
        <span className="mono">{JSON.stringify(node.result ?? null)}</span>
      )}
      {node.version ? (
        <div className="muted note">{t('Version of {properties}', { properties: shownValues(node.version) })}</div>
      ) : null}
      {node.children.length ? (
        <ul>
          {node.children.map((child, i) => (
            <TraceNode key={i} node={child} onGo={onGo} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// A table of the book run with arguments (those of the sheets being edited, if they changed) and a runtime context
// (for versions): its result, how it went (the calls made, the cells that gave each result), or how fast it runs.
function Try({ name, tables, sheets, version, preset, onGo, onTrace, onWriteTest }) {
  const runnable = tables.filter((table) => table.name && RUNNABLE.has(table.kind));
  const names = [...new Set(runnable.map((table) => table.name))];
  const [table, setTable] = useState(preset && names.includes(preset.table) ? preset.table : names[0] || '');
  const [args, setArgs] = useState('[]');
  const [context, setContext] = useState(preset ? preset.context : '');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  // The arguments and the context of what was run (what its test is of).
  const [ran, setRan] = useState(null);
  const run = async (benchmark) => {
    let parsed;
    let runtime;
    try {
      parsed = JSON.parse(args);
    } catch {
      setAnswer({ error: t('The arguments are a list of JSON: ["basic", 30]') });
      return;
    }
    try {
      runtime = context.trim() ? JSON.parse(context) : undefined;
      if (runtime !== undefined && (typeof runtime !== 'object' || Array.isArray(runtime))) throw new Error();
    } catch {
      setAnswer({ error: t('The context is an object of JSON: {"usState": "NY"}') });
      return;
    }
    setBusy(true);
    try {
      const result = await api(`_rules/${encodeURIComponent(name)}/try${sheets ? '' : `?version=${version}`}`, {
        method: 'POST',
        body: {
          table,
          args: Array.isArray(parsed) ? parsed : [parsed],
          ...(runtime ? { context: runtime } : {}),
          ...(sheets ? { sheets } : {}),
          ...(benchmark ? { benchmark: true } : {}),
        },
      });
      setAnswer(result);
      setRan({ table, args: Array.isArray(parsed) ? parsed : [parsed], context: runtime });
      if (!benchmark) onTrace(table, result.trace);
    } catch (err) {
      setAnswer({ error: err.message });
      setRan(null);
      onTrace(table, null);
    } finally {
      setBusy(false);
    }
  };
  // Its test: a row of its arguments and what it gave, written into the sheets.
  const writeTest = async () => {
    try {
      const written = await api(`_rules/${encodeURIComponent(name)}/test-case${sheets ? '' : `?version=${version}`}`, {
        method: 'POST',
        body: { ...ran, ...(sheets ? { sheets } : {}) },
      });
      onWriteTest(ran.table, written);
    } catch (err) {
      setAnswer({ error: err.message });
    }
  };
  if (!runnable.length) return <p className="rule-panel muted">{t('The book has no table to run')}</p>;
  return (
    <div className="rule-panel">
      <label className="label" htmlFor="rule-try-table">
        {t('Table')}
      </label>
      <select id="rule-try-table" className="input" value={table} onChange={(event) => setTable(event.target.value)}>
        {names.map((entry) => {
          const kinds = [...new Set(runnable.filter((item) => item.name === entry).map((item) => item.kind))];
          return (
            <option key={entry} value={entry}>
              {entry} ({kinds.map((kind) => KIND_LABELS[kind] || kind).join(', ')})
            </option>
          );
        })}
      </select>
      <div className="rule-props">
        {runnable
          .filter((entry) => entry.name === table && entry.language)
          .filter((entry, i, all) => all.findIndex((other) => other.language === entry.language) === i)
          .map((entry) => (
            <Language key={entry.language} table={entry} />
          ))}
      </div>
      <label className="label" htmlFor="rule-try-args">
        {t('Arguments (a list of JSON)')}
      </label>
      <textarea
        id="rule-try-args"
        className="input mono"
        rows={4}
        value={args}
        onChange={(event) => setArgs(event.target.value)}
      />
      <label className="label" htmlFor="rule-try-context">
        {t('Context (versions: currentDate, usState…)')}
      </label>
      <input
        id="rule-try-context"
        className="input mono"
        placeholder='{"currentDate": "2026-06-01"}'
        value={context}
        onChange={(event) => setContext(event.target.value)}
      />
      <div className="rule-try-actions">
        <Button variant="primary" icon="play" busy={busy} onClick={() => run(false)}>
          {t('Run')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(true)}>
          {t('Benchmark')}
        </Button>
      </div>
      {answer ? (
        answer.error ? (
          <Alert>{answer.error}</Alert>
        ) : (
          <>
            <pre className="rule-result mono">{JSON.stringify(answer.result, null, 2)}</pre>
            {answer.perSecond ? (
              <p className="muted note">
                {t('{count} calls a second ({runs} runs)', {
                  count: answer.perSecond.toLocaleString(),
                  runs: answer.runs.toLocaleString(),
                })}
              </p>
            ) : (
              <p className="muted note">{t('in {ms} ms', { ms: answer.ms.toFixed(3) })}</p>
            )}
            {onWriteTest && ran && !answer.perSecond ? (
              <div className="rule-try-actions">
                <Button size="sm" variant="ghost" icon="check" onClick={writeTest}>
                  {t('Write a test of this result')}
                </Button>
              </div>
            ) : null}
            {answer.trace ? (
              <>
                <div className="label">{t('How it went')}</div>
                <ul className="rule-trace">
                  <TraceNode node={answer.trace} onGo={onGo} />
                </ul>
              </>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

function Versions({ versions, viewing, active, name, canChange, onActivate, onCompare, onBeside, beside }) {
  return (
    <ul className="rule-versions">
      {versions.map((entry) => (
        <li key={entry.version} className={entry.version === viewing ? 'on' : ''}>
          <div>
            <a href={href(['_rules', name], entry.version === active ? {} : { version: entry.version })}>
              <strong>v{entry.version}</strong>
            </a>{' '}
            {entry.version === active ? <Badge tone="success">{t('active')}</Badge> : null}
            {entry.errors.length ? (
              <Badge tone="danger">{t('{count} failed', { count: entry.errors.length })}</Badge>
            ) : null}
          </div>
          <div className="muted note">
            <span title={when(entry.createdAt)}>{ago(entry.createdAt)}</span>
            {entry.author ? ` · ${entry.author}` : ''}
            {entry.fileName ? ` · ${entry.fileName}` : ''}
          </div>
          {entry.comment ? <div className="note">{entry.comment}</div> : null}
          {canChange && entry.version !== active ? (
            <Button size="sm" variant="ghost" icon="check" onClick={() => onActivate(entry.version)}>
              {t('Make it the active one')}
            </Button>
          ) : null}
          {entry.version !== viewing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => onCompare(entry.version)}>
                {t('Compare with this one')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={beside === entry.version}
                onClick={() => onBeside(entry.version)}
              >
                {t('Side by side')}
              </Button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
