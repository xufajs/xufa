// Books of rules kept in a database of @xufa/orm (any backend), by name (and tenant), in versions: a book is tested
// before it is kept (refused when its tests fail, unless force), one version is the active one, the workbook it came
// from is kept to download it as it was. Books are compiled once a version, in each process; the active version is
// asked again after `refresh` ms (2 s), so a new one reaches every process in that time.
//
//   const rules = new RuleStore(db, { checks });
//   await rules.sync();                                     // its table (db.sync() and migrations make it too)
//   await rules.save('pricing', xlsxBytes, { author: 'ada' });   // { version: 1, errors: [] }
//   await rules.call('pricing', 'Quote', customer);
//   const book = await rules.book('pricing');                // a RuleBook (the active version)
import { RuleBook } from './book.js';
import { RulesError } from './values.js';
import { contextOf } from './versions.js';
import { hasCode } from './lint.js';
import { readXlsx, writeXlsx } from './xlsx.js';

const STATUSES = ['active', 'inactive'];
const isXlsx = (input) => input instanceof Uint8Array || input instanceof ArrayBuffer;

class RuleStore {
  // table, model: of the books (xufa_rule_books, XufaRuleBook); bookOptions: of every RuleBook (onError, dialect);
  // checks: the check functions of Check tables; refresh: ms an active version is trusted (2000); cacheSize: books
  // compiled kept (100); tdz: of every book, a let or const of its Methods used before its declaration is an error.
  constructor(db, options = {}) {
    if (!db || typeof db.register !== 'function' || !db.orm) {
      throw new TypeError('new RuleStore(db): db is a Database of @xufa/orm');
    }
    const { table = 'xufa_rule_books', model: modelName = 'XufaRuleBook' } = options;
    this.db = db;
    // (tdz: of the books it makes, and of those given made, on copies of them.)
    this.tdz = Boolean(options.tdz);
    this.bookOptions = { ...options.bookOptions, ...(this.tdz ? { tdz: true } : {}) };
    this.checks = options.checks || {};
    this.refresh = options.refresh ?? 2000;
    // (true: a version that breaks the books importing it does not become the active one, unless forced.)
    this.checkImporters = Boolean(options.checkImporters);
    this.cacheSize = options.cacheSize ?? 100;
    this.books = new Map();
    this.active = new Map();
    const { Model, fields } = db.orm;
    this.Model = {
      [modelName]: class extends Model {
        static fields = {
          name: fields.string({ maxLength: 200 }),
          tenant: fields.string({ maxLength: 200, null: true }),
          version: fields.integer(),
          status: fields.string({ maxLength: 20, default: 'inactive', choices: STATUSES }),
          json: fields.json(),
          xlsx: fields.bytes({ null: true }),
          fileName: fields.string({ maxLength: 255, null: true }),
          errors: fields.json({ null: true }),
          author: fields.string({ maxLength: 200, null: true }),
          comment: fields.text({ null: true }),
          createdAt: fields.datetime({ autoNowAdd: true }),
        };

        static options = {
          table,
          indexes: [{ fields: ['tenant', 'name', 'version'], unique: true }, { fields: ['tenant', 'name', 'status'] }],
        };
      },
    }[modelName];
    db.register(this.Model);
  }

  async sync() {
    await this.db.backend.createSchema([this.Model.meta]);
  }

  where(name, tenant) {
    return { name, tenant: tenant ?? null };
  }

  // A book of bytes of a .xlsx, the JSON of one, { sheets } (rows of values, as readXlsx gives them), or a RuleBook.
  bookOf(input) {
    if (input instanceof RuleBook) {
      if (!this.tdz || input.options.tdz) return input;
      return RuleBook.fromJSON(input.toJSON(), { ...input.options, tdz: true });
    }
    if (input && Array.isArray(input.sheets)) return RuleBook.fromSheets(input.sheets, this.bookOptions);
    if (isXlsx(input))
      return RuleBook.fromXlsx(input instanceof ArrayBuffer ? new Uint8Array(input) : input, this.bookOptions);
    if (Array.isArray(input)) return RuleBook.fromJSON(input, this.bookOptions);
    throw new RulesError('A book is the bytes of a .xlsx, its JSON or a RuleBook');
  }

  // Tests a book (its Test and Check tables) and keeps it as the next version of its name: the active one (activate:
  // false keeps the one there). Refused when a test fails (an error with .errors), unless force. Gives { version,
  // errors, record }.
  async save(
    name,
    input,
    { tenant, activate = true, force = false, breaking = false, author, comment, fileName } = {}
  ) {
    if (typeof name !== 'string' || !name.trim()) throw new RulesError('A book needs a name');
    const book = await this.link(this.bookOf(input), { tenant, chain: [name] });
    const errors = await book.test({ checks: this.checks });
    if (errors.length && !force) {
      const error = new RulesError(
        `The book ${name} does not pass its tests (${errors.length})`,
        'XUFA_RULES_ERR_TESTS'
      );
      error.errors = errors;
      throw error;
    }
    if (activate) await this.refuseBreaking(name, { tenant, input: book, override: force || breaking });
    const last = await this.Model.objects.filter(this.where(name, tenant)).orderBy('-version').first();
    const version = last ? last.version + 1 : 1;
    const record = await this.db.transaction(async () => {
      if (activate)
        await this.Model.objects
          .filter({ ...this.where(name, tenant), status: 'active' })
          .update({ status: 'inactive' });
      return this.Model.objects.create({
        ...this.where(name, tenant),
        version,
        status: activate ? 'active' : 'inactive',
        json: book.toJSON(),
        xlsx: isXlsx(input)
          ? Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input)
          : input && Array.isArray(input.sheets)
            ? writeXlsx({ sheets: input.sheets })
            : null,
        fileName: fileName ?? null,
        errors: errors.length ? errors : null,
        author: author ?? null,
        comment: comment ?? null,
      });
    });
    this.forget(name, tenant);
    if (activate) this.remember(`${tenant ?? ''}\u0000${name}\u0000${version}`, book);
    return { version, errors, record };
  }

  // Another version becomes the active one.
  async activate(name, version, { tenant, force = false, breaking = false } = {}) {
    const found = await this.Model.objects.filter({ ...this.where(name, tenant), version }).first();
    if (!found) throw new RulesError(`No version ${version} of the book ${name}`, 'XUFA_RULES_ERR_NOT_FOUND');
    await this.refuseBreaking(name, { tenant, version, override: force || breaking });
    await this.db.transaction(async () => {
      await this.Model.objects.filter({ ...this.where(name, tenant), status: 'active' }).update({ status: 'inactive' });
      await this.Model.objects.filter({ pk: found.pk }).update({ status: 'active' });
    });
    this.forget(name, tenant);
    return version;
  }

  // With checkImporters: an error (XUFA_RULES_ERR_BREAKS, .errors and .breaks) when a version that becomes the active
  // one makes books that import the book fail their tests (unless override: force, or breaking).
  async refuseBreaking(name, { tenant, version, input, override }) {
    if (!this.checkImporters || override) return;
    const broken = (await this.impact(name, { tenant, version, input })).filter((result) => result.errors.length);
    if (!broken.length) return;
    const error = new RulesError(
      `The new active version of ${name} breaks the books that import it: ${broken.map((item) => item.name).join(', ')}`,
      'XUFA_RULES_ERR_BREAKS'
    );
    error.errors = broken.flatMap((item) => item.errors.map((message) => `${item.name}: ${message}`));
    error.breaks = broken;
    throw error;
  }

  forget(name, tenant) {
    this.active.delete(`${tenant ?? ''}\u0000${name}`);
  }

  remember(key, book) {
    if (this.books.size >= this.cacheSize) this.books.delete(this.books.keys().next().value);
    this.books.set(key, book);
  }

  // The number of the active version (asked again after `refresh` ms), or undefined when there is none.
  async activeVersion(name, tenant) {
    const key = `${tenant ?? ''}\u0000${name}`;
    const known = this.active.get(key);
    if (known && Date.now() - known.at < this.refresh) return known.version;
    const found = await this.Model.objects
      .filter({ ...this.where(name, tenant), status: 'active' })
      .only('version')
      .first();
    const version = found ? found.version : undefined;
    this.active.set(key, { version, at: Date.now() });
    return version;
  }

  // The books a book imports (their active versions, of its tenant) linked to it: what its programs import. chain:
  // the books being linked (a book importing one of them: a cycle, refused).
  async link(book, { tenant, chain = [] } = {}) {
    for (const name of book.imports()) {
      if (chain.includes(name)) {
        throw new RulesError(`Books import each other: ${[...chain, name].join(' → ')}`, 'XUFA_RULES_ERR_IMPORT');
      }
      let imported;
      try {
        imported = await this.book(name, { tenant, chain });
      } catch (err) {
        if (err.code !== 'XUFA_RULES_ERR_NOT_FOUND') throw err;
        const by = chain.length ? ` (imported by ${chain[chain.length - 1]})` : '';
        throw new RulesError(`No active book ${name} to import${by}`, 'XUFA_RULES_ERR_IMPORT');
      }
      book.modules.set(name, imported);
    }
    return book;
  }

  // The RuleBook of a name: its active version, or the version asked for (linked to the books it imports).
  async book(name, { tenant, version, chain = [] } = {}) {
    const book = await this.load(name, { tenant, version });
    // (Each time: an imported book may have another active version since.)
    return this.link(book, { tenant, chain: [...chain, name] });
  }

  // The RuleBook of a name (its active version, or the version asked for), compiled once and kept; not linked.
  async load(name, { tenant, version } = {}) {
    const number = version ?? (await this.activeVersion(name, tenant));
    if (number === undefined) throw new RulesError(`No active book ${name}`, 'XUFA_RULES_ERR_NOT_FOUND');
    const key = `${tenant ?? ''}\u0000${name}\u0000${number}`;
    let book = this.books.get(key);
    if (!book) {
      const found = await this.Model.objects
        .filter({ ...this.where(name, tenant), version: number })
        .only('json')
        .first();
      if (!found) throw new RulesError(`No version ${number} of the book ${name}`, 'XUFA_RULES_ERR_NOT_FOUND');
      book = RuleBook.fromJSON(found.json, this.bookOptions);
      this.remember(key, book);
    }
    return book;
  }

  // The books (active versions, of a tenant) that import a book: [{ name, version, direct, imports }] (direct: it
  // imports the book itself; else through others it imports).
  async dependents(name, { tenant } = {}) {
    const imports = new Map();
    for (const entry of await this.list({ tenant: tenant ?? null })) {
      if (!entry.active || entry.name === name) continue;
      try {
        const book = await this.load(entry.name, { tenant, version: entry.active });
        imports.set(entry.name, { version: entry.active, imports: book.imports() });
      } catch {
        // (A version that does not build: it imports nothing that can be told.)
      }
    }
    const found = [];
    const seen = new Set([name]);
    let frontier = [name];
    for (let direct = true; frontier.length; direct = false) {
      const next = [];
      for (const [other, info] of imports) {
        if (seen.has(other) || !info.imports.some((item) => frontier.includes(item))) continue;
        seen.add(other);
        next.push(other);
        found.push({ name: other, version: info.version, direct, imports: info.imports });
      }
      frontier = next;
    }
    return found;
  }

  // What another version of a book (version: kept; input: a book being saved) would do to the books that import it:
  // their tests run with it, on copies of them (the books in use are not touched). [{ name, version, direct, errors }].
  async impact(name, { tenant, version, input } = {}) {
    const dependents = await this.dependents(name, { tenant });
    if (!dependents.length) return [];
    const copyOf = (book) => RuleBook.fromJSON(book.toJSON(), this.bookOptions);
    const candidate = input ? this.bookOf(input) : copyOf(await this.load(name, { tenant, version }));
    const copies = new Map([[name, candidate]]);
    // (A copy of each book with its imports, the candidate in place of the book.)
    const linked = async (book, chain) => {
      for (const other of book.imports()) {
        if (chain.includes(other)) {
          throw new RulesError(`Books import each other: ${[...chain, other].join(' → ')}`, 'XUFA_RULES_ERR_IMPORT');
        }
        if (!copies.has(other)) {
          copies.set(other, copyOf(await this.load(other, { tenant })));
          await linked(copies.get(other), [...chain, other]);
        }
        book.modules.set(other, copies.get(other));
      }
      return book;
    };
    await linked(candidate, [name]);
    const results = [];
    for (const dependent of dependents) {
      let errors;
      try {
        if (!copies.has(dependent.name)) {
          copies.set(dependent.name, copyOf(await this.load(dependent.name, { tenant, version: dependent.version })));
          await linked(copies.get(dependent.name), [dependent.name]);
        }
        errors = await copies.get(dependent.name).test({ checks: this.checks });
      } catch (err) {
        errors = [err.message];
      }
      results.push({ name: dependent.name, version: dependent.version, direct: dependent.direct, errors });
    }
    return results;
  }

  // A table of the active book of a name, run (tenant: { tenant } as the last argument is not possible: use book()).
  async call(name, table, ...args) {
    return (await this.book(name)).call(table, ...args);
  }

  // The books: name, tenant, active version, last version and when it was made.
  async list({ tenant } = {}) {
    const records = await this.Model.objects
      .filter(tenant === undefined ? {} : { tenant })
      .only('name', 'tenant', 'version', 'status', 'createdAt')
      .orderBy('name', 'version');
    const books = new Map();
    for (const record of records) {
      const key = `${record.tenant ?? ''}\u0000${record.name}`;
      const book = books.get(key) || {
        name: record.name,
        tenant: record.tenant,
        active: null,
        last: 0,
        updatedAt: null,
      };
      if (record.status === 'active') book.active = record.version;
      book.last = Math.max(book.last, record.version);
      book.updatedAt = record.createdAt;
      books.set(key, book);
    }
    return [...books.values()];
  }

  // The versions of a book, the last first (without their JSON and workbook).
  async versions(name, { tenant } = {}) {
    const records = await this.Model.objects
      .filter(this.where(name, tenant))
      .only('version', 'status', 'errors', 'author', 'comment', 'fileName', 'createdAt')
      .orderBy('-version');
    return records.map(({ version, status, errors, author, comment, fileName, createdAt }) => ({
      version,
      status,
      errors: errors || [],
      author,
      comment,
      fileName,
      createdAt,
    }));
  }

  // The .xlsx of a version (the active one): the workbook it came from, or one written of its tables.
  async xlsx(name, { tenant, version } = {}) {
    const number = version ?? (await this.activeVersion(name, tenant));
    const found =
      number === undefined
        ? null
        : await this.Model.objects.filter({ ...this.where(name, tenant), version: number }).first();
    if (!found)
      throw new RulesError(`No book ${name}${version ? ` of version ${version}` : ''}`, 'XUFA_RULES_ERR_NOT_FOUND');
    return found.xlsx ? Buffer.from(found.xlsx) : RuleBook.fromJSON(found.json, this.bookOptions).toXlsx();
  }

  // The sheets of a version (the active one) to edit: those of the workbook it came from, or written of its tables.
  // Gives { version, sheets: [{ name, rows, merges }] } (rows of values).
  async sheets(name, { tenant, version } = {}) {
    const number = version ?? (await this.activeVersion(name, tenant));
    const found =
      number === undefined
        ? null
        : await this.Model.objects.filter({ ...this.where(name, tenant), version: number }).first();
    if (!found)
      throw new RulesError(`No book ${name}${version ? ` of version ${version}` : ''}`, 'XUFA_RULES_ERR_NOT_FOUND');
    if (found.xlsx) return { version: number, sheets: readXlsx(found.xlsx).sheets };
    const sheets = RuleBook.fromJSON(found.json, this.bookOptions)
      .toSheets()
      .map(({ name: sheetName, rows, merges }) => ({
        name: sheetName,
        rows: rows.map((row) =>
          Array.from(row, (cell) =>
            cell !== null && typeof cell === 'object' && !(cell instanceof Date) ? cell.value : (cell ?? null)
          )
        ),
        merges,
      }));
    return { version: number, sheets };
  }

  // What a book would be, not kept: its tables (kind, name and place) and the messages of its tests (or of what keeps
  // it from being built). For editors, as their books change.
  async inspect(input, { tenant, name } = {}) {
    let book;
    try {
      book = this.bookOf(input);
      // (What it imports, linked: of the tenant; name, the book's, for cycles.)
      await this.link(book, { tenant, chain: name ? [name] : [] });
    } catch (err) {
      return { tables: [], errors: [err.message], tests: [], analysis: [], lint: [], coverage: null, imports: [] };
    }
    const tables = book.tables
      .filter((table) => table && !Array.isArray(table))
      .map((table) => {
        const entry = {
          kind: table.kind ?? table.className.replace(/Table$/, ''),
          name: table.name ?? null,
          position: table.position ?? null,
        };
        // Its properties (its own and those of Properties tables), and of versions: how many, a context of this one.
        if (table.className === 'PropertiesTable') {
          entry.scope = table.scope;
          entry.properties = table.properties;
          entry.own = Object.keys(table.properties);
        } else if (table.properties && Object.keys(table.properties).length) {
          entry.properties = table.properties;
          entry.own = Object.keys(table.ownProperties || {});
        }
        // The language of its code (openl, js) and what told it (its property, its code, the book).
        if (hasCode(table)) {
          entry.language = table.dialect;
          entry.languageFrom = table.languageFrom ?? 'book';
        }
        const versions = table.name ? book.versions?.get(table.name) : null;
        if (versions && versions.length > 1 && versions.includes(table)) {
          entry.versions = versions.length;
          entry.context = contextOf(table.properties);
        }
        return entry;
      });
    // (And how each row of its tests went, and the gaps and overlaps of its decision tables.)
    // The checks of its formulas (warnings) and what its tests reach.
    let analysis = [];
    let tests = [];
    let lint = [];
    let coverage = null;
    try {
      analysis = book.analyze();
      tests = book.testResults();
      lint = book.lint();
      coverage = book.coverage();
    } catch {
      // (The messages of the tests tell what fails.)
    }
    return {
      tables,
      errors: await book.test({ checks: this.checks }),
      tests,
      analysis,
      lint,
      coverage,
      imports: book.imports(),
    };
  }

  // Every version of a book out.
  async remove(name, { tenant } = {}) {
    const count = await this.Model.objects.filter(this.where(name, tenant)).delete();
    this.forget(name, tenant);
    for (const key of this.books.keys())
      if (key.startsWith(`${tenant ?? ''}\u0000${name}\u0000`)) this.books.delete(key);
    return count;
  }
}

export { RuleStore };
