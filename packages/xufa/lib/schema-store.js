// The models kept in the database (designer: database in xufa.yaml): each version of them is a row of xufa_schema,
// with the models of each app (their specs, as models.yaml has them) and the migrations made for them so far (by
// app: [{ name, operations }], after those of the app's files). A process runs the last version there when it
// starts, and starts again when there is a newer one (the designer of the admin publishes them).
//
//   const store = schemaStore(db);   // its model registered in db (that of the project)
//   await store.sync();              // its table
//   const last = await store.latest(); // { version, apps, migrations, note, createdAt } or null
async function noop() {}

function schemaStore(db, { table = 'xufa_schema' } = {}) {
  const { Model, fields } = db.orm;
  class SchemaVersion extends Model {
    static fields = {
      version: fields.integer({ unique: true }),
      apps: fields.json({ default: () => ({}) }),
      migrations: fields.json({ default: () => ({}) }),
      note: fields.string({ maxLength: 200, null: true }),
      createdAt: fields.datetime({ default: () => new Date() }),
    };

    static options = { table, ordering: ['-version'] };
  }
  db.register(SchemaVersion);

  const rowOf = (row) =>
    row
      ? {
          version: row.version,
          apps: row.apps || {},
          migrations: row.migrations || {},
          note: row.note,
          createdAt: row.createdAt,
        }
      : null;

  return {
    model: SchemaVersion,
    // Creates its table (when it is not there).
    async sync() {
      await db.backend.createSchema([SchemaVersion.meta]);
    },
    // The last version, or null (none published yet: the models are those of the files).
    async latest() {
      return rowOf(await SchemaVersion.objects.orderBy('-version').first());
    },
    // The number of the last version (0: none).
    async version() {
      const last = await SchemaVersion.objects.orderBy('-version').first();
      return last ? last.version : 0;
    },
    // A new version after `after` (the version the draft was made from): its number, or an error (409) when another
    // was published since (two people publishing at once: its number is unique). apply(version) runs then (the
    // migrations, each in a transaction of its own: those of SQLite cannot be inside another); when it fails, the
    // version goes.
    async add({ after, apps, migrations, note }, apply = noop) {
      const last = await this.version();
      const stale = () => {
        const err = new Error(`The models changed meanwhile (version ${last}, not ${after}): review them again`);
        err.statusCode = 409;
        return err;
      };
      if (last !== after) throw stale();
      const version = last + 1;
      let row;
      try {
        row = await SchemaVersion.objects.create({ version, apps, migrations, note: note || null });
      } catch (err) {
        if (err.name === 'UniqueError') throw stale();
        throw err;
      }
      try {
        await apply(version);
      } catch (err) {
        await row.delete();
        throw err;
      }
      return version;
    },
  };
}

export { schemaStore };
