// @xufa/rules: business rules in workbooks of Excel run as functions.

/** The workbooks of the books are @xufa/xlsx's (its errors come as RulesError: XUFA_RULES_ERR_XLSX and _ZIP). */
import type { CellValue, Range, Sheet, WritableSheet } from '@xufa/xlsx';
export type { CellValue, Cell, CellStyle, Range, Sheet, WritableSheet } from '@xufa/xlsx';
export { readXlsx, writeXlsx, patchXlsx } from '@xufa/xlsx';

/** A block of a sheet: cells apart from the others by empty rows or columns (a table when its first cell names one). */
export interface Block {
  /** Its rows of values (null where empty; the cells of a merged range have its value). */
  rows: CellValue[][];
  sheet: string;
  /** Its first cell, from 0. */
  row: number;
  column: number;
  /** The merged ranges inside it, from its first cell. */
  merges: Range[];
}

/** The blocks of a sheet, as books find their tables. */
export function blocksOf(sheet: Sheet): Block[];

export interface RuleBookOptions {
  /** Told of the steps of spreadsheets that fail (they are left). */
  onError?: (error: Error, info: { table: string; step: string }) => void;
  /**
   * The language of the formulas: OpenL Tablets' (`'openl'`) or JavaScript (`'js'`); `'auto'` (the default) tells
   * it by the sheets: a book with formulas or tables only OpenL has is of OpenL.
   */
  dialect?: 'auto' | 'openl' | 'js';
  /**
   * In the bodies of Methods of JavaScript, a `let` or `const` used before its declaration runs is an error (`x is
   * used before its declaration`), as in JavaScript; by default it is undefined.
   */
  tdz?: boolean;
  /**
   * Functions by name that values have as methods in the code of the book (JavaScript): `prices.sum()` is
   * `methods.sum(prices)` when prices has no sum (@xufa/expression's `methods`; @xufa/fun is made for it).
   */
  methods?: Record<string, unknown> | null;
  /**
   * The messages of msg(code, arguments...), by locale ('' the default, 'fr', 'de_DE'): code -> text with {0}, {1}...
   * (parseProperties gives them of the .properties files of OpenL's i18n folder). The locale is that of the runtime
   * context (`locale`: 'fr-CA' takes fr_CA, then fr, then the default).
   */
  messages?: Record<string, Record<string, string>>;
  /** What the Methods of JavaScript import (`import { Rate } from 'pricing'`): books (their tables) or objects of
   * exports, by name. A RuleStore links the active versions of the books of the tenant. */
  modules?: Record<string, RuleBook | Record<string, unknown>>;
}

/** Where a table is in its workbook (from 0). */
export interface Position {
  sheet: string;
  row: number;
  column: number;
}

export interface Table {
  readonly className: string;
  /** Of the tables of OpenL Tablets: SmartRules, SimpleRules, SmartLookup, SimpleLookup. */
  kind?: string;
  name?: string;
  position?: Position;
  /** Its properties (its own rows of properties over those of Properties tables of its sheet and of the book). */
  properties?: Record<string, unknown>;
  ownProperties?: Record<string, unknown>;
  /** The language of its code: its property `language` (or `dialect`), else what only one language reads, else the book's. */
  dialect?: 'openl' | 'js';
  /** What told its language: its own property, a Properties table (of its sheet, category or book), its code, the book. */
  languageFrom?: 'property' | 'properties' | 'code' | 'book';
  toJSON(): TableJson;
}

/** The runtime context of a call, that chooses the versions of tables (their properties) as OpenL Tablets does. */
export interface RuntimeContext {
  currentDate?: Date | string;
  requestDate?: Date | string;
  lob?: string;
  usState?: string;
  country?: string;
  [dimension: string]: unknown;
}

/** A cell of a sheet (from 0). */
export interface CellRef {
  sheet: string | null;
  row: number;
  column: number;
}

/** A call of a trace: its table, what it got and gave, the cells that gave its result, the calls it made. */
/** A row of a Test table of a call (RuleBook.testCase). */
export interface TestCase {
  /** The first cell of a new Test table of it: Test Discount DiscountTest (a name no table of the book has). */
  title: string;
  /** The names of its columns: plan, customer.age, _context_.usState, _res_, _res_.total, _error_. */
  names: string[];
  /** Their titles (the row under the names). */
  titles: string[];
  /** The cells of the row. */
  cells: unknown[];
  result: unknown;
  /** The message of the call that failed, or null. */
  error: string | null;
}

export interface TraceNode {
  table: string;
  kind: string | null;
  position?: (Position & { height?: number; width?: number }) | null;
  args: unknown[];
  result: unknown;
  error: string | null;
  cells: CellRef[];
  /** Of a table of versions: the properties of the one chosen. */
  version?: Record<string, unknown> | null;
  children: TraceNode[];
}

/** The cases of an axis of a decision table (its rules, or the rows or the columns of a lookup). */
export interface AxisAnalysis {
  axis: 'rules' | 'rows' | 'columns';
  dimensions: string[];
  rules: Array<{ id: number; name?: string; cell: CellRef }>;
  /** The cases tried (one value of each interval of each condition, combined), at most 100000 (truncated). */
  cases: number;
  truncated: boolean;
  /** Conditions written as expressions were taken as met. */
  partial: boolean;
  /** Values of no rule, merged into ranges as conditions write them (as many as 20), and the cases of them. */
  gaps: Array<Record<string, string | number | boolean>>;
  gapCount: number;
  moreGaps: boolean;
  /** Rules met by the same values (the first wins), but in tables that collect. */
  overlaps: Array<{ rules: number[]; count: number; example: Record<string, string | number | boolean> }>;
  /** Rules whose every case a rule before takes; rules that no case meets. */
  shadowed: number[];
  never: number[];
  /** Where a rule for a gap goes: a new row (or column) of the sheet, the cell of each dimension's condition (null:
   * none, a range of two columns), whether they take lists and ranges, and the cell of its result. */
  add?: {
    row?: number;
    column?: number;
    cells: Array<{ row?: number; column?: number; lists: boolean; ranges: boolean } | null>;
    focus: { row?: number; column?: number };
  };
}

/** A warning of the checks of the formulas of a book. */
export interface LintIssue {
  table: string;
  kind: string;
  cell: CellRef;
  code: 'unknown-name' | 'not-yet' | 'unknown-member' | 'arity' | 'not-callable' | 'cycle' | 'ambiguous-language';
  /** Of ambiguous-language: the row that says the language, to add under the title of the table (its columns, from
   * column, moved down a row). */
  fix?: { sheet: string; row: number; column: number; width: number; cells: CellValue[] };
  /** Of ambiguous-language: the rows that say the language of the whole sheet (of every table of it), when that
   * changes no other table of it, to insert as whole rows at row (their cells from column; the rows under them moved
   * down): a row at the end of its Properties table of scope Worksheet, or a new one at the top of the sheet. */
  sheetFix?: { sheet: string; row: number; column: number; rows: CellValue[][] };
  name: string;
  message: string;
}

/** What the tests of a book run. */
export interface Coverage {
  tests: number;
  tables: Array<{
    table: string;
    kind: string;
    position: Position | null;
    tested: boolean;
    rules?: { total: number; covered: number; missed: Array<{ axis: string; id: number; cell: CellRef }> };
  }>;
}

export interface TableAnalysis {
  table: string;
  kind: string;
  position: Position | null;
  properties?: Record<string, unknown>;
  collect: boolean;
  axes: AxisAnalysis[];
  /** Of lookups: the cells of no result. */
  holes?: Array<{ row: number; column: number; cell: CellRef }>;
}

/** How a row of a Test (or Run) table went. */
export interface TestRowResult {
  row: number;
  description?: string;
  input?: unknown;
  expected?: unknown;
  actual?: unknown;
  passed: boolean;
  message?: string;
  messages?: string[];
  error?: string;
  cell?: CellRef;
}

export interface TestTableResults {
  name: string;
  kind: 'Test' | 'Run';
  table: string;
  position: Position | null;
  rows: TestRowResult[];
}

/** The JSON of a table (the format of the engine this one follows, plus position). */
export interface TableJson {
  className: string;
  name?: string;
  [key: string]: unknown;
}

/** A check of a Check table: messages of what is wrong in the values a table can give. */
export type CheckFunction = (values: unknown[], tableName: string, checkName: string) => string[] | Promise<string[]>;

export class RuleBook {
  constructor(options?: RuleBookOptions);
  /** A book of the bytes of a .xlsx. */
  static fromXlsx(bytes: Uint8Array, options?: RuleBookOptions): RuleBook;
  /** A book of sheets of rows of values. */
  static fromSheets(sheets: Sheet[], options?: RuleBookOptions): RuleBook;
  /** A book of the JSON of toJSON(). */
  static fromJSON(json: Array<TableJson | CellValue[][]>, options?: RuleBookOptions): RuleBook;

  readonly options: RuleBookOptions;
  /** The language of its formulas: `'openl'` (OpenL Tablets') or `'js'`. */
  dialect: 'openl' | 'js';
  /** The tables, in order (blocks that are no table, as their rows). */
  readonly tables: Array<Table | CellValue[][]>;
  /** The names every expression of the book sees: Fun, the constants and the tables. */
  readonly context: Readonly<Record<string, unknown>>;
  /** The names of the tables that run (rules, spreadsheets, methods, transforms). */
  readonly names: string[];

  table(name: string): Table | undefined;
  /** A function of a table. */
  fn<R = unknown>(name: string): (...args: unknown[]) => R;
  call<R = unknown>(name: string, ...args: unknown[]): R;
  /** Calls in a runtime context (the versions of the tables it chooses, in every call they make). */
  withContext(context: RuntimeContext): {
    call<R = unknown>(name: string, ...args: unknown[]): R;
    fn<R = unknown>(name: string): (...args: unknown[]) => R;
  };
  /** How a call goes: the tables it calls, what each gives, and the cells that gave it. */
  trace(name: string, args?: unknown[], context?: RuntimeContext): TraceNode | undefined;
  /** A row of a Test table of a call as it goes now: its columns (the arguments, fields of objects, _context_ fields,
   * _res_ or _res_.field, _error_ of a call that fails), their titles and cells, and a title of a new table of it. */
  testCase(name: string, args?: unknown[], options?: { context?: RuntimeContext; testName?: string }): TestCase;
  /** The books (or objects of exports) its programs import, by name. */
  readonly modules: Map<string, RuleBook | Record<string, unknown>>;
  /** The names of the books its Methods of JavaScript import. */
  imports(): string[];
  /** What it exports to the programs that import it: its tables (functions of rules, spreadsheets and methods; values
   * of constants and data), frozen. */
  exports(): Readonly<Record<string, unknown>>;
  /** The gaps and overlaps of the decision tables (of a name: its versions). */
  analyze(name?: string): TableAnalysis[];
  /** How each row of each Test and Run table went. */
  testResults(): TestTableResults[];
  /** The checks of its formulas: names of nothing, steps read before they are computed, members helpers do not have,
   * arguments, calls of what is no table, cycles of grids. */
  lint(): LintIssue[];
  /** The tables and rules its tests reach. */
  coverage(): Coverage;
  /** Messages of what is wrong ([] when every test passes). */
  test(options?: { checks?: Record<string, CheckFunction> }): Promise<string[]>;
  toJSON(): Array<TableJson | CellValue[][]>;
  /** The sheets of the book, each table at its place. */
  toSheets(): WritableSheet[];
  toXlsx(): Buffer;
  /**
   * The workbook the book was read from (its bytes) with the matrix of a table changed in place (patchXlsx): only the
   * cells that change. The matrix must be of the table's size.
   */
  applyMatrix(bytes: Uint8Array, name: string, matrix: CellValue[][]): Buffer;
}

export class RulesError extends Error {
  code:
    | 'XUFA_RULES_ERR_TABLE'
    | 'XUFA_RULES_ERR_VALUE'
    | 'XUFA_RULES_ERR_EXPRESSION'
    | 'XUFA_RULES_ERR_NOT_FOUND'
    | 'XUFA_RULES_ERR_ZIP'
    | 'XUFA_RULES_ERR_RULE'
    | 'XUFA_RULES_ERR_NO_VERSION'
    | 'XUFA_RULES_ERR_AMBIGUOUS'
    | 'XUFA_RULES_ERR_MISS'
    | 'XUFA_RULES_ERR_TESTS'
    | (string & {});
  /** Of an error building a table: what was wrong, without where. */
  reason?: string;
  /** Of an error building a table: its first cell (row and column from 0). */
  cell?: { sheet: string; row: number; column: number };
}

/** Texts as tables compare them: without accents, zero-width spaces nor the spaces around. */
export function normalize(text: unknown): string;

/** A value as a type of a table says (Integer, Float, Double, Boolean, Date, Code, Codes, String). */
export function toValue(type: string | null | undefined, value: unknown): unknown;

/** The helpers of the expressions of a book (Fun.mean, Fun.sort...). */
export const Fun: Readonly<Record<string, (...args: any[]) => any>>;

export interface RuleStoreOptions {
  /** The table and model of the books (xufa_rule_books, XufaRuleBook). */
  table?: string;
  model?: string;
  /** Options of every RuleBook it makes (onError, dialect). */
  bookOptions?: RuleBookOptions;
  /** The check functions of the Check tables of its books. */
  checks?: Record<string, CheckFunction>;
  /** Ms an active version is trusted before it is asked again (2000). */
  refresh?: number;
  /** A version that makes the books importing its book fail their tests does not become the active one (save and
   * activate refuse it with XUFA_RULES_ERR_BREAKS, its .errors and .breaks), unless `force` or `breaking`. */
  checkImporters?: boolean;
  /** Every book (those it makes, and copies of those given made): tdz of RuleBookOptions. */
  tdz?: boolean;
  /** Books compiled kept (100). */
  cacheSize?: number;
}

export interface RuleBookVersion {
  version: number;
  status: 'active' | 'inactive';
  errors: string[];
  author: string | null;
  comment: string | null;
  fileName: string | null;
  createdAt: Date;
}

export interface SaveOptions {
  tenant?: string;
  /** The new version becomes the active one (true). */
  activate?: boolean;
  /** Kept even if its tests fail (and active even if it breaks the books importing it). */
  force?: boolean;
  /** Active even if it breaks the books importing it (with checkImporters). */
  breaking?: boolean;
  author?: string;
  comment?: string;
  fileName?: string;
}

/** Books of rules kept in a database of @xufa/orm, by name and tenant, in versions. */
export class RuleStore {
  constructor(db: { register(model: unknown): unknown; orm: unknown }, options?: RuleStoreOptions);
  readonly Model: any;
  readonly checks: Record<string, CheckFunction>;
  /** Makes its table. */
  sync(): Promise<void>;
  /** A book of bytes of a .xlsx, its JSON, or a RuleBook. */
  bookOf(input: Uint8Array | ArrayBuffer | Array<TableJson | CellValue[][]> | RuleBook): RuleBook;
  /** Tests a book and keeps it as the next version (an error with .errors when its tests fail, unless force). */
  save(
    name: string,
    input: Uint8Array | ArrayBuffer | Array<TableJson | CellValue[][]> | RuleBook,
    options?: SaveOptions
  ): Promise<{ version: number; errors: string[]; record: unknown }>;
  /** force or breaking: active even if it breaks the books importing it (with checkImporters). */
  activate(
    name: string,
    version: number,
    options?: { tenant?: string; force?: boolean; breaking?: boolean }
  ): Promise<number>;
  /** The active version (or the one asked for). */
  book(name: string, options?: { tenant?: string; version?: number }): Promise<RuleBook>;
  /** The RuleBook of a version (the active one by default), compiled once and kept; not linked to what it imports. */
  load(name: string, options?: { tenant?: string; version?: number }): Promise<RuleBook>;
  /** The books (active versions, of the tenant) that import a book: directly, or through others. */
  dependents(
    name: string,
    options?: { tenant?: string }
  ): Promise<Array<{ name: string; version: number; direct: boolean; imports: string[] }>>;
  /** What another version of a book (one kept, or a book being saved: input) does to the books that import it: the
   * messages of their tests run with it, on copies of them. */
  impact(
    name: string,
    options?: { tenant?: string; version?: number; input?: Parameters<RuleStore['bookOf']>[0] | { sheets: Sheet[] } }
  ): Promise<Array<{ name: string; version: number; direct: boolean; errors: string[] }>>;
  /** The books a book imports (their active versions, of the tenant) linked to it; cycles refused. */
  link(book: RuleBook, options?: { tenant?: string; chain?: string[] }): Promise<RuleBook>;
  call<R = unknown>(name: string, table: string, ...args: unknown[]): Promise<R>;
  list(options?: {
    tenant?: string;
  }): Promise<
    Array<{ name: string; tenant: string | null; active: number | null; last: number; updatedAt: Date | null }>
  >;
  versions(name: string, options?: { tenant?: string }): Promise<RuleBookVersion[]>;
  /** The .xlsx of a version: the workbook it came from, or one written of its tables. */
  xlsx(name: string, options?: { tenant?: string; version?: number }): Promise<Buffer>;
  /** The sheets of a version (the active one) to edit. */
  sheets(
    name: string,
    options?: { tenant?: string; version?: number }
  ): Promise<{ version: number; sheets: Array<Required<Sheet>> }>;
  /** What a book would be, not kept (for editors): its tables, the messages of its tests, how each row of its tests
   * went and the gaps and overlaps of its decision tables. */
  inspect(
    input: Parameters<RuleStore['bookOf']>[0] | { sheets: Sheet[] },
    options?: { tenant?: string; name?: string }
  ): Promise<{
    /** properties: its own (own: their names) and those of Properties tables; of versions, how many and a runtime
     * context that chooses this one; of Properties tables, their scope. */
    tables: Array<{
      kind: string;
      name: string | null;
      position: Position | null;
      properties?: Record<string, unknown>;
      own?: string[];
      scope?: string;
      versions?: number;
      context?: RuntimeContext;
      /** The language of its code (tables with code) and what told it. */
      language?: 'openl' | 'js';
      languageFrom?: 'property' | 'properties' | 'code' | 'book';
    }>;
    errors: string[];
    tests: TestTableResults[];
    analysis: TableAnalysis[];
    lint: LintIssue[];
    coverage: Coverage | null;
    /** The books it imports. */
    imports: string[];
  }>;
  remove(name: string, options?: { tenant?: string }): Promise<number>;
}

export interface RulesPluginOptions {
  store: RuleStore;
  /** Where its routes are ('/rules'). */
  prefix?: string;
  /** A hook (or hooks) before every route: a guard of who can see and change books. */
  onRequest?: unknown;
  /** The tenant of the books of a request. */
  tenantOf?: (request: any) => string | undefined | null;
  /** The largest workbook it takes, in bytes (20 MB). */
  bodyLimit?: number;
}

/** The routes of the books of a store, for @xufa/http (app.rules is the store). */
export function rulesPlugin(app: any, options: RulesPluginOptions, done: (err?: Error) => void): void;

/** The entries of the text of a .properties file (key = value, comments, \uXXXX escapes, continued lines). */
export function parseProperties(text: string): Record<string, string>;
