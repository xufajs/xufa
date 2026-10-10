// The data model of the admin (GET /api/_schema, for _schema.view): every model it shows, those of the tenants, and
// those they point to, each with its spec (@xufa/orm's specOf: fields, relations, options), its app and its place: the
// database of the project, or that of each tenant. The page draws them as a diagram of entities and relations.
//
// With a designer (the option designer: xufa's, in development), the models of the apps' models.yaml are edited there
// for _schema.change: POST /api/_schema/preview gives the migration of a draft, POST /api/_schema/publish writes it
// with the models.yaml of its apps. The designer: { apps(), editable(model), preview(draft), publish(draft) }.
import * as ormModule from '@xufa/orm';

// The models of the schema: those given, and those they point to (relations), without the through models the ORM
// made for many-to-many relations (drawn as the relation itself).
function modelsOf(given) {
  const found = new Set();
  const made = new Set();
  const visit = (model) => {
    if (!model || found.has(model)) return;
    found.add(model);
    for (const field of model.meta.fields) {
      if (field.type === 'foreignKey') visit(field.target);
    }
    for (const field of model.meta.manyToMany || []) {
      visit(field.target);
      if (field.through && !field.throughOption) made.add(field.through);
      else if (field.through) visit(field.through);
    }
  };
  given.forEach(visit);
  return [...found].filter((model) => !made.has(model));
}

// The entry of a model: its name, label, app (appOf, or null), place (project or tenant), table, whether the admin
// lists it, and its spec (a model the ORM cannot describe is left with no fields, its error said).
function entryOf(model, { appOf, tenantModels, listed, designer }) {
  const { specOf } = ormModule;
  let spec;
  let error = null;
  try {
    spec = specOf(model);
  } catch (err) {
    spec = { fields: {} };
    error = err.message;
  }
  const { meta } = model;
  return {
    name: model.name,
    label: meta.labelPlural ? meta.labelPlural.charAt(0).toUpperCase() + meta.labelPlural.slice(1) : model.name,
    app: (appOf && appOf(model)) || null,
    place: tenantModels.has(model) ? 'tenant' : 'project',
    table: meta.table,
    pk: meta.pk ? [].concat(meta.pk.composite ? meta.pk.fields.map((field) => field.name) : meta.pk.name) : [],
    listed: listed.has(model.name),
    editable: Boolean(designer && designer.editable(model)),
    spec,
    error,
  };
}

function registerSchema(app, { byName, schemaModels, tenants, appOf, designer, can }) {
  app.get('/api/_schema', async (request) => {
    const tenantModels = new Set(tenants && tenants.tenants ? tenants.tenants.models || [] : []);
    const shown = [...byName.values()].map((entry) => entry.model).concat(schemaModels ? schemaModels() : []);
    const models = modelsOf([...shown, ...tenantModels]);
    // A model of the tenants that the admin also lists is the same class: its place is the tenant.
    const listed = new Set(byName.keys());
    const designs = Boolean(designer) && can(request, '_schema.change');
    return {
      tenants: Boolean(tenants),
      // What can be edited: the apps of models.yaml, with their models as data.
      design: designs
        ? {
            apps: designer.apps(),
            // Where the models go: files (models.yaml and migrations), or database (versions there).
            store: designer.store || 'files',
            pending: typeof designer.pending === 'function' ? designer.pending() : null,
          }
        : null,
      models: models.map((model) =>
        entryOf(model, { appOf, tenantModels, listed, designer: designs ? designer : null })
      ),
    };
  });
  if (!designer) return;
  // A draft tried, and written: its errors (a model that cannot be, a migration that cannot be made) are 400.
  const send = (fn) => async (request, reply) => {
    try {
      return await fn(request.body || {});
    } catch (err) {
      // (409: another version was published since the draft was made.)
      if (err.statusCode === 400 || err.statusCode === 409) {
        return reply.code(err.statusCode).send({ error: err.message, errors: {} });
      }
      throw err;
    }
  };
  app.post(
    '/api/_schema/preview',
    send((draft) => designer.preview(draft))
  );
  app.post(
    '/api/_schema/publish',
    send((draft) => designer.publish(draft))
  );
}

export { registerSchema, modelsOf };
