// SqlBackend: the backends of SQL databases. They compile the queries with SqlCompiler in their dialect and give
// the SQL to the driver through two methods of their own:
//
//   query(sql, params)    the rows (objects by column name)
//   execute(sql, params)  the number of rows changed
const { Backend } = require('../base');
const { SqlCompiler } = require('./compiler');

class SqlBackend extends Backend {
  constructor(options, dialect) {
    super(options);
    this.dialect = dialect;
    this.compiler = new SqlCompiler(dialect);
  }

  get name() {
    return this.dialect.name;
  }

  async query() {
    throw this.unsupported('query');
  }

  async execute() {
    throw this.unsupported('execute');
  }

  // Runs SQL of your own: the rows it gives.
  raw(sql, params = []) {
    return this.run(() => this.query(sql, params));
  }

  // limitPer() is a window of the query (ROW_NUMBER()).
  get limitPer() {
    return true;
  }

  async select(query) {
    const { sql, params, decode } = this.compiler.select(query);
    const rows = await this.run(() => this.query(sql, params));
    return rows.map(decode);
  }

  // The objects of the model of a query (not values()), made from the rows of the driver.
  async selectObjects(query, db) {
    const { sql, params, make } = this.compiler.select(query);
    const rows = await this.run(() => this.query(sql, params));
    const objects = new Array(rows.length);
    for (let i = 0; i < rows.length; i += 1) objects[i] = make(rows[i], db);
    return objects;
  }

  async count(query) {
    const { sql, params } = this.compiler.count(query);
    const rows = await this.run(() => this.query(sql, params));
    return Number(rows[0].n);
  }

  async aggregate(query, aggregates, groupBy) {
    const { sql, params, decode } = this.compiler.aggregate(query, aggregates, groupBy);
    const rows = await this.run(() => this.query(sql, params));
    return rows.map(decode);
  }

  // options.conflict: { fields, update } (see SqlCompiler.insert). The keys of rows ignored are null (the database
  // does not say which they are, unless it gave back every row).
  async insert(meta, rows, options = {}) {
    const statements = this.compiler.insert(meta, rows, options.conflict || null);
    const pks = new Array(rows.length);
    const insertAll = async () => {
      for (let i = 0; i < statements.length; i += 1) {
        const { sql, params, indexes, ignore } = statements[i];
        const result = await this.query(sql, params);
        // A model without a primary key gets none back.
        if (!meta.pk) return;
        const known = !ignore || result.length === indexes.length;
        indexes.forEach((index, j) => {
          pks[index] = known ? this.dialect.decode(meta.pkFields[0].dbType, result[j].pk) : null;
        });
      }
    };
    // Rows inserted with several statements are inserted all or none.
    if (statements.length > 1 && !this.inTransaction) await this.transaction(insertAll);
    else await this.run(insertAll);
    return pks;
  }

  async update(query, assignments) {
    const { sql, params } = this.compiler.update(query, assignments);
    return this.run(() => this.execute(sql, params));
  }

  async delete(query) {
    const { sql, params } = this.compiler.delete(query);
    return this.run(() => this.execute(sql, params));
  }

  // The tables of the database (their foreign keys can be referenced).
  async tables() {
    return [];
  }

  // Creates the tables (and indexes) that do not exist; their foreign keys reference the tables that exist and those
  // made before them.
  // The tables of the models that do not exist. Foreign keys to tables made later (cycles) are in the CREATE TABLE in
  // SQLite (it checks them when rows are written), and added after the tables in other databases.
  async createSchema(metas) {
    const existing = new Set(await this.run(() => this.tables()));
    const lazy = this.dialect.name === 'sqlite';
    const known = new Set(lazy ? [...existing, ...metas.map((meta) => meta.key)] : existing);
    const later = [];
    for (let i = 0; i < metas.length; i += 1) {
      const statements = this.compiler.createTable(metas[i], known);
      if (!existing.has(metas[i].key)) later.push(...this.compiler.laterForeignKeys(metas[i], known));
      known.add(metas[i].key);
      for (let j = 0; j < statements.length; j += 1) await this.run(() => this.execute(statements[j], []));
    }
    for (let i = 0; i < later.length; i += 1) await this.run(() => this.execute(later[i], []));
    this.forgetStatements();
  }

  async dropSchema(metas) {
    for (let i = 0; i < metas.length; i += 1) {
      const sql = this.compiler.dropTable(metas[i]);
      await this.run(() => this.execute(sql, []));
    }
    this.forgetStatements();
  }

  // After changes of the schema: statements the driver prepared are prepared again (their tables or types changed).
  forgetStatements() {}

  // Migrations: the names of those applied (in the table xufa_migrations), recording one, and their operations.
  async appliedMigrations() {
    const table = this.dialect.quote('xufa_migrations');
    await this.run(() =>
      this.execute(`CREATE TABLE IF NOT EXISTS ${table} ("name" TEXT PRIMARY KEY, "applied_at" TEXT NOT NULL)`, [])
    );
    const rows = await this.run(() => this.query(`SELECT "name" FROM ${table}`, []));
    return rows.map((row) => row.name);
  }

  async recordMigration(name) {
    const table = this.dialect.quote('xufa_migrations');
    const p = (i) => this.dialect.placeholder(i);
    await this.execute(`INSERT INTO ${table} ("name", "applied_at") VALUES (${p(1)}, ${p(2)})`, [
      name,
      new Date().toISOString(),
    ]);
  }

  migrationTransaction(fn) {
    return this.transaction(fn);
  }

  async migrationOperation(op, before, after) {
    const statements = this.compiler.migration(op, before, after);
    for (let i = 0; i < statements.length; i += 1) await this.execute(statements[i], []);
    this.forgetStatements();
  }

  begin() {
    return this.execute('BEGIN', []);
  }

  commit() {
    return this.execute('COMMIT', []);
  }

  rollback() {
    return this.execute('ROLLBACK', []);
  }

  savepoint(name) {
    return this.execute(`SAVEPOINT ${name}`, []);
  }

  releaseSavepoint(name) {
    return this.execute(`RELEASE SAVEPOINT ${name}`, []);
  }

  rollbackToSavepoint(name) {
    return this.execute(`ROLLBACK TO SAVEPOINT ${name}`, []);
  }
}

module.exports = { SqlBackend };
