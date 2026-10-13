// Conditions, Returns and Actions tables of OpenL Tablets: elements of SmartRules written apart, each a column (or
// columns, of a merged expression) of Inputs (the arguments it reads), Expression, Parameter (what its cells give) and
// Title; a SmartRules column whose title is the title of an element is that element (before any argument it could
// be). Conditions hold as those of decision tables; returns and actions run their expression with their parameters.
import { RulesError } from '../values.js';
import { holdsOf, giveOf, declarationOf, valueOf } from './decision.js';

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const KEYWORDS = ['inputs', 'expression', 'parameter', 'title'];
const ROLES = { conditions: 'condition', returns: 'return', actions: 'action' };

class ExternalElementsTable {
  constructor(book) {
    this.book = book;
  }

  get className() {
    return 'ExternalElementsTable';
  }

  build({ rows, merges = [], position }) {
    this.rows = rows;
    this.merges = merges;
    this.position = position;
    const [keyword, name] = text(rows[0][0]).split(/\s+/);
    this.kind = keyword;
    this.role = ROLES[keyword.toLowerCase()];
    this.name = name ?? null;
    // The rows of each keyword (the default order when the first column has none of them).
    const keyed = rows.slice(1).some((row) => KEYWORDS.includes(text(row[0]).toLowerCase()));
    const rowOf = {};
    const first = keyed ? 1 : 0;
    rows.slice(1).forEach((row, r) => {
      const key = keyed ? text(row[0]).toLowerCase() : KEYWORDS[r];
      if (KEYWORDS.includes(key)) rowOf[key] = r + 1;
    });
    if (rowOf.expression === undefined || rowOf.title === undefined) {
      throw new RulesError(`${keyword} table needs Expression and Title rows`);
    }
    const width = Math.max(...rows.map((row) => row.length));
    const spanOf = (r, c) => merges.find((merge) => merge.top === r && merge.left === c)?.right ?? c;
    this.elements = [];
    for (let c = first; c < width; c += 1) {
      const code = text(rows[rowOf.expression]?.[c]);
      if (!code) continue;
      const last = spanOf(rowOf.expression, c);
      this.elements.push({
        role: this.role,
        title: text(rows[rowOf.title]?.[c]),
        code: code.replace(/^return\s+/, '').replace(/;\s*$/, ''),
        inputs: text(rows[rowOf.inputs]?.[c]),
        params: Array.from({ length: last - c + 1 }, (_, i) => declarationOf(rows[rowOf.parameter]?.[c + i])),
        columns: last - c + 1,
      });
      c = last;
    }
    return this;
  }

  // The function of the code of an element (compiled once): the types of its parameters known.
  runOf(element) {
    if (!element.run) {
      const types = Object.fromEntries(
        element.params.filter((param) => param.name && param.type).map((param) => [param.name, param.type])
      );
      element.run = this.book.compileFor(this, element.code, `${this.kind}, ${element.title}`, { types });
    }
    return element.run;
  }

  // The values of the cells of an element in a row (from its first column).
  values(element, row, column) {
    return element.params.map((param, i) => valueOf(row[column + i], param.type));
  }

  holds(element, values, context) {
    return holdsOf(this.runOf(element), element, values, context);
  }

  give(element, values, context) {
    return giveOf(this.runOf(element), element, values, context);
  }

  toJSON() {
    return {
      className: this.className,
      rows: this.rows,
      merges: this.merges,
      ...(this.position ? { position: this.position } : {}),
    };
  }

  fromJSON(data) {
    return this.build({ rows: data.rows, merges: data.merges || [], position: data.position });
  }

  toRows() {
    return this.rows.map((row, r) => row.map((value) => ({ value, style: r === 0 ? 'title' : 'value' })));
  }
}

export { ExternalElementsTable };
