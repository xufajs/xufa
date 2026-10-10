// The editor of the data model page (with the designer of the server: in development): the models of the apps'
// models.yaml as a draft kept in this browser, edited in a panel (the model, its options and its fields) and on the
// diagram (a line drawn from a model to another is a foreign key); the changes are reviewed (the migration they make,
// what it drops) and published (models.yaml and the migration written in each app).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { Button, ErrorText } from '../ui.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { t, tn } from '../i18n.js';

const DRAFT_KEY = 'xufa-admin-schema-draft';
// The types the editor offers (others, of a models.yaml written by hand, are kept as they are).
export const TYPES = [
  'string',
  'text',
  'integer',
  'bigint',
  'float',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'json',
  'uuid',
  'foreignKey',
  'manyToMany',
];
const RELATIONS = new Set(['foreignKey', 'manyToMany']);
const ON_DELETE = ['cascade', 'setNull', 'protect', 'doNothing'];
// The options the editor shows for every field (more for some types); others are kept as they are.
const EDITED = new Set([
  'type',
  'to',
  'null',
  'blank',
  'unique',
  'index',
  'label',
  'help',
  'maxLength',
  'default',
  'onDelete',
  '$from',
]);
const MODEL_NAME = /^[A-Z][A-Za-z0-9_]*$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]*$/;

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const clone = (value) => JSON.parse(JSON.stringify(value));

function readDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}
function writeDraft(value) {
  try {
    if (value) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // (A browser that keeps nothing: the draft lives while the page is open.)
  }
}

// The specs of the server as the draft holds them: every field an object, models and fields with the names they had
// ($from: what tells a rename from a model or field dropped and another added).
function draftOf(apps) {
  const draft = {};
  for (const { app, spec } of apps) {
    draft[app] = {};
    for (const [name, model] of Object.entries(spec || {})) {
      const { fields = {}, ...options } = model || {};
      draft[app][name] = {
        ...options,
        $from: name,
        fields: Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [
            field,
            { ...(typeof value === 'string' ? { type: value } : value), $from: field },
          ])
        ),
      };
    }
  }
  return draft;
}

// What the server takes: the specs without $from, and the renames ({ app: { models, fields } }); only the apps changed.
export function requestOf(draft, base) {
  const apps = {};
  const renames = {};
  for (const [app, models] of Object.entries(draft)) {
    const spec = {};
    const moved = { models: {}, fields: {} };
    for (const [name, model] of Object.entries(models)) {
      const { $from, fields, ...options } = model;
      if ($from && $from !== name) moved.models[$from] = name;
      spec[name] = { ...options, fields: {} };
      for (const [field, value] of Object.entries(fields)) {
        const { $from: was, ...rest } = value;
        if (was && was !== field && $from) {
          moved.fields[name] = { ...(moved.fields[name] || {}), [was]: field };
        }
        spec[name].fields[field] = rest;
      }
    }
    if (JSON.stringify(models) === JSON.stringify(base[app])) continue;
    apps[app] = spec;
    if (Object.keys(moved.models).length || Object.keys(moved.fields).length) renames[app] = moved;
  }
  return { apps, renames };
}

// The draft: from the server's models.yaml of each app, kept in this browser while the files are as they were.
export function useDraft(design) {
  const base = useMemo(() => (design ? draftOf(design.apps) : null), [design]);
  const baseText = useMemo(() => JSON.stringify(base), [base]);
  const [draft, setDraftState] = useState(null);
  useEffect(() => {
    if (!base) return;
    const kept = readDraft();
    setDraftState(kept && kept.base === baseText ? kept.apps : clone(base));
  }, [base, baseText]);
  const setDraft = useCallback(
    (change) =>
      setDraftState((current) => {
        const next = change(clone(current));
        writeDraft(JSON.stringify(next) === baseText ? null : { base: baseText, apps: next });
        return next;
      }),
    [baseText]
  );
  const discard = useCallback(() => {
    writeDraft(null);
    setDraftState(clone(base));
  }, [base]);
  const changed = Boolean(draft && base) && JSON.stringify(draft) !== baseText;
  return { draft, base, setDraft, discard, changed };
}

// The models of the page while designing: those of code as the server gives them, those of the draft as they are.
export function designedModels(models, draft) {
  if (!draft) return models;
  // (Every model the designer edits is drawn from the draft.)
  const kept = models.filter((model) => !model.editable);
  const byName = new Map(models.map((model) => [model.name, model]));
  const made = [];
  for (const [app, specs] of Object.entries(draft)) {
    // A new model is where the others of its app are (the project's database, or each tenant's).
    const place = models.find((model) => model.app === app)?.place || 'project';
    for (const [name, spec] of Object.entries(specs)) {
      const { $from, fields, ...options } = spec;
      const before = byName.get($from || name);
      const own = Object.fromEntries(
        Object.entries(fields).map(([field, value]) => [
          field,
          Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$from')),
        ])
      );
      const keys = Object.entries(own)
        .filter(([, field]) => field.primaryKey)
        .map(([field]) => field);
      made.push({
        name,
        label: name,
        app,
        place: before ? before.place : place,
        table: options.table || `${app}_${name.toLowerCase()}`,
        pk: keys.length ? keys : ['id'],
        listed: Boolean(before && before.listed && before.name === name),
        editable: true,
        isNew: !before,
        spec: { ...options, fields: own },
        error: null,
      });
    }
  }
  return [...kept, ...made];
}

// The changes of the draft, by app (each a function of a copy of the draft that gives the next one).
export const edits = {
  addModel: (app, name) => (draft) => {
    draft[app][name] = { fields: { name: { type: 'string', maxLength: 100 } } };
    return draft;
  },
  renameModel: (app, from, to) => (draft) => {
    draft[app] = Object.fromEntries(
      Object.entries(draft[app]).map(([name, spec]) => [name === from ? to : name, spec])
    );
    // The relations that pointed to it, in every app.
    for (const models of Object.values(draft)) {
      for (const spec of Object.values(models)) {
        for (const field of Object.values(spec.fields)) {
          if (field.to === from) field.to = to;
          if (field.to === `${app}.${from}`) field.to = `${app}.${to}`;
        }
      }
    }
    return draft;
  },
  deleteModel: (app, name) => (draft) => {
    delete draft[app][name];
    return draft;
  },
  setOption: (app, model, key, value) => (draft) => {
    const spec = draft[app][model];
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) delete spec[key];
    else spec[key] = value;
    return draft;
  },
  addField: (app, model, field, value) => (draft) => {
    draft[app][model].fields[field] = value;
    return draft;
  },
  renameField: (app, model, from, to) => (draft) => {
    const spec = draft[app][model];
    spec.fields = Object.fromEntries(
      Object.entries(spec.fields).map(([name, value]) => [name === from ? to : name, value])
    );
    return draft;
  },
  setField: (app, model, field, key, value) => (draft) => {
    const spec = draft[app][model].fields[field];
    if (value === undefined || value === '' || value === false) delete spec[key];
    else spec[key] = value;
    return draft;
  },
  // A type changed: the options of the type before go (maxLength of a text, the model of a relation...).
  setType: (app, model, field, type) => (draft) => {
    const { $from, label, help, null: isNull } = draft[app][model].fields[field];
    const next = { type, ...(label ? { label } : {}), ...(help ? { help } : {}), ...($from ? { $from } : {}) };
    if (type === 'string') next.maxLength = 100;
    if (RELATIONS.has(type)) next.to = Object.keys(draft[app])[0];
    if (type === 'manyToMany') next.blank = true;
    else if (isNull || type !== 'boolean') next.null = true;
    draft[app][model].fields[field] = next;
    return draft;
  },
  deleteField: (app, model, field) => (draft) => {
    delete draft[app][model].fields[field];
    return draft;
  },
};

// A name not taken yet: base, base2, base3...
export function freeName(base, taken) {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base}${n}`)) return `${base}${n}`;
}

// A foreign key from a model of the draft to another (a line drawn on the diagram): named after the model it points
// to, empty allowed (rows that are there have none).
export const connect = (app, model, target) => (draft) => {
  const fields = draft[app][model].fields;
  const name = freeName(lowerFirst(target), Object.keys(fields));
  fields[name] = { type: 'foreignKey', to: target, null: true, onDelete: 'setNull' };
  return draft;
};

// A text input that changes its value when it is left (or Enter): names, which would rename at every key.
function LazyInput({ value, onCommit, check, ...props }) {
  const [text, setText] = useState(value);
  const [problem, setProblem] = useState(null);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text === value) return setProblem(null);
    const wrong = check ? check(text) : null;
    setProblem(wrong);
    if (!wrong) onCommit(text);
    return undefined;
  };
  return (
    <>
      <input
        className="input"
        {...props}
        value={text}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setText(value);
            setProblem(null);
          }
        }}
      />
      {problem ? <ErrorText text={problem} /> : null}
    </>
  );
}

// The value of a default as typed: a number for numbers, true or false for booleans, the text otherwise.
function defaultOf(type, text) {
  if (text === '') return undefined;
  if (['integer', 'bigint', 'float'].includes(type) && !Number.isNaN(Number(text))) return Number(text);
  if (type === 'boolean') return text === 'true';
  return text;
}

// A field of a model: its name and type, and, open, its options.
function FieldEditor({ app, model, name, field, names, models, change, open, onOpen }) {
  const edit = (key, value) => change(edits.setField(app, model, name, key, value));
  const known = TYPES.includes(field.type);
  const kept = Object.keys(field).filter((key) => !EDITED.has(key));
  const relation = RELATIONS.has(field.type);
  return (
    <li className={`design-field ${open ? 'open' : ''}`}>
      <div className="design-field-row">
        <LazyInput
          value={name}
          aria-label={t('Name of the field')}
          check={(text) =>
            !FIELD_NAME.test(text)
              ? t('A name of a field starts in lower case: letters, digits and _')
              : names.includes(text)
                ? t('There is a field {name} already', { name: text })
                : null
          }
          onCommit={(text) => change(edits.renameField(app, model, name, text))}
        />
        {known ? (
          <select
            className="select"
            aria-label={t('Type of {field}', { field: name })}
            value={field.type}
            onChange={(event) => change(edits.setType(app, model, name, event.target.value))}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        ) : (
          <code className="design-type">{field.type}</code>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={open ? 'chevronUp' : 'chevronDown'}
          aria-label={t('Options of {field}', { field: name })}
          aria-expanded={open}
          onClick={onOpen}
        />
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          aria-label={t('Delete the field {field}', { field: name })}
          onClick={() => change(edits.deleteField(app, model, name))}
        />
      </div>
      {open ? (
        <div className="design-options">
          {relation ? (
            <label>
              <span>{t('Points to')}</span>
              <select className="select" value={field.to} onChange={(event) => edit('to', event.target.value)}>
                {models.includes(field.to) ? null : <option value={field.to}>{field.to}</option>}
                {models.map((other) => (
                  <option key={other} value={other}>
                    {other}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {field.type === 'foreignKey' ? (
            <label>
              <span>{t('When it is deleted')}</span>
              <select
                className="select"
                value={field.onDelete || 'cascade'}
                onChange={(event) =>
                  edit('onDelete', event.target.value === 'cascade' ? undefined : event.target.value)
                }
              >
                {ON_DELETE.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {field.type === 'string' ? (
            <label>
              <span>{t('Longest')}</span>
              <input
                className="input"
                type="number"
                min="1"
                value={field.maxLength ?? ''}
                onChange={(event) => edit('maxLength', event.target.value ? Number(event.target.value) : undefined)}
              />
            </label>
          ) : null}
          {!relation && field.type !== 'json' ? (
            <label>
              <span>{t('Default')}</span>
              <LazyInput
                value={field.default === undefined ? '' : String(field.default)}
                onCommit={(text) => edit('default', defaultOf(field.type, text))}
              />
            </label>
          ) : null}
          <label>
            <span>{t('Label')}</span>
            <LazyInput value={field.label || ''} onCommit={(text) => edit('label', text)} />
          </label>
          <label>
            <span>{t('Help')}</span>
            <LazyInput value={field.help || ''} onCommit={(text) => edit('help', text)} />
          </label>
          <div className="design-checks">
            {field.type !== 'manyToMany' ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(field.null)}
                  onChange={(event) => edit('null', event.target.checked)}
                />
                {t('May be empty')}
              </label>
            ) : (
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(field.blank)}
                  onChange={(event) => edit('blank', event.target.checked)}
                />
                {t('May have none')}
              </label>
            )}
            {field.type !== 'manyToMany' ? (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(field.unique)}
                    onChange={(event) => edit('unique', event.target.checked)}
                  />
                  {t('Unique')}
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(field.index)}
                    onChange={(event) => edit('index', event.target.checked)}
                  />
                  {t('Indexed')}
                </label>
              </>
            ) : null}
          </div>
          {kept.length ? (
            <p className="muted">{t('Also, as written in models.yaml: {options}', { options: kept.join(', ') })}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// The panel of a model of the draft: its name, app, options and fields.
export function ModelEditor({ model, draft, change, onRenamed, onDeleted, onClose }) {
  const confirm = useConfirm();
  const [opened, setOpened] = useState(null);
  const { app, name } = model;
  const spec = draft[app][name];
  const fieldNames = Object.keys(spec.fields);
  const modelNames = Object.values(draft).flatMap((models) => Object.keys(models));
  const all = [...new Set(modelNames)].sort();
  const ordering = Array.isArray(spec.ordering) ? spec.ordering.join(', ') : '';

  const remove = async () => {
    const yes = await confirm({
      title: t('Delete the model {model}?', { model: name }),
      message: model.isNew
        ? t('It is only in this draft.')
        : t('Publishing drops its table {table} and its rows.', { table: model.table }),
      confirm: t('Delete'),
    });
    if (!yes) return;
    change(edits.deleteModel(app, name));
    onDeleted();
  };

  return (
    <aside className="card erd-panel design-panel" aria-label={t('The model {model}', { model: name })}>
      <div className="card-head">
        <h2>{name}</h2>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label={t('Close')} />
      </div>
      <div className="card-body">
        <label className="design-label">
          <span>{t('Name')}</span>
          <LazyInput
            value={name}
            check={(text) =>
              !MODEL_NAME.test(text)
                ? t('A name of a model starts with a capital: letters, digits and _')
                : modelNames.includes(text)
                  ? t('There is a model {name} already', { name: text })
                  : null
            }
            onCommit={(text) => {
              change(edits.renameModel(app, name, text));
              onRenamed(text);
            }}
          />
        </label>
        <p className="muted">
          {t('App {app}', { app })} · <code>{model.table}</code>
        </p>
        <label className="design-label">
          <span>{t('Ordering')}</span>
          <LazyInput
            value={ordering}
            placeholder="title, -published"
            onCommit={(text) =>
              change(
                edits.setOption(
                  app,
                  name,
                  'ordering',
                  text
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              )
            }
          />
        </label>
        <label className="design-label">
          <span>{t('Shown as')}</span>
          <LazyInput
            value={spec.display || ''}
            placeholder="{title}"
            onCommit={(text) => change(edits.setOption(app, name, 'display', text))}
          />
        </label>
        <h3>{tn(fieldNames.length, '{count} field', '{count} fields')}</h3>
        <ul className="design-fields">
          {fieldNames.map((field) => (
            <FieldEditor
              key={`${field}-${spec.fields[field].$from || 'new'}`}
              app={app}
              model={name}
              name={field}
              field={spec.fields[field]}
              names={fieldNames.filter((other) => other !== field)}
              models={all}
              change={change}
              open={opened === field}
              onOpen={() => setOpened(opened === field ? null : field)}
            />
          ))}
        </ul>
        <div className="design-actions">
          <Button
            icon="plus"
            onClick={() => {
              const field = freeName('field', fieldNames);
              change(edits.addField(app, name, field, { type: 'string', maxLength: 100, null: true }));
              setOpened(field);
            }}
          >
            {t('Add a field')}
          </Button>
          <Button variant="danger" icon="trash" onClick={remove}>
            {t('Delete the model')}
          </Button>
        </div>
      </div>
    </aside>
  );
}

// What an operation of a migration does, in words.
function operationText(op) {
  switch (op.op) {
    case 'createTable':
      return t('Creates the table {table}', { table: op.spec.table });
    case 'dropTable':
      return t('Drops the table {table}', { table: op.table });
    case 'renameTable':
      return t('Renames the table {from} to {to}', { from: op.from, to: op.to });
    case 'addColumn':
      return t('Adds the column {table}.{column}', { table: op.table, column: op.column });
    case 'dropColumn':
      return t('Drops the column {table}.{column}', { table: op.table, column: op.column });
    case 'renameColumn':
      return t('Renames the column {table}.{from} to {to}', { table: op.table, from: op.from, to: op.to });
    case 'alterColumn':
      return t('Changes the column {table}.{column}', { table: op.table, column: op.column });
    case 'createIndex':
      return t('Creates an index of {table}', { table: op.table });
    case 'dropIndex':
      return t('Drops an index of {table}', { table: op.table });
    default:
      return op.op;
  }
}

// What a risk of a migration is, in words.
function riskText(risk) {
  switch (risk.kind) {
    case 'dropTable':
      return t('The rows of {table} are lost', { table: risk.table });
    case 'dropColumn':
      return t('The values of {table}.{column} are lost', { table: risk.table, column: risk.column });
    case 'type':
      return t('{table}.{column} changes from {from} to {to}: a value that does not fit stops the migration', risk);
    case 'required':
      return t('{table}.{column} becomes required: a row without a value stops the migration', risk);
    default:
      return risk.text;
  }
}

// The review of the changes: the migration of each app (from the server), what it risks, its name; then published.
export function Review({ request, store = 'files', onClose, onPublished }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => {
    let live = true;
    api('_schema/preview', { method: 'POST', body: request }).then(
      (answer) => live && setPreview(answer),
      (err) => live && setError(err.message)
    );
    return () => {
      live = false;
    };
  }, [request]);
  useEffect(() => first.current?.focus(), [preview]);
  const dangers = preview ? preview.apps.flatMap((item) => item.risks.filter((risk) => risk.level === 'danger')) : [];

  const publish = async () => {
    setBusy(true);
    try {
      const answer = await api('_schema/publish', {
        method: 'POST',
        body: { ...request, ...(name.trim() ? { name: name.trim() } : {}) },
      });
      toast(
        answer.files
          ? t('Written: {files}', { files: answer.files.join(', ') })
          : t('Published as version {version}', { version: answer.version })
      );
      onPublished(answer);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="modal design-review" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="body">
          <div>
            <h2 id="review-title">{t('Review the changes')}</h2>
            {!preview && !error ? <p className="muted">{t('Finding the migration…')}</p> : null}
            {error ? <ErrorText text={error} /> : null}
            {preview
              ? preview.apps.map((item) => (
                  <section key={item.app} className="design-app">
                    <h3>
                      {item.app}
                      {item.migration ? (
                        <code className="muted"> {item.migration.file || item.migration.name}</code>
                      ) : (
                        <span className="muted"> · {t('no migration: nothing of the database changes')}</span>
                      )}
                    </h3>
                    {item.migration ? (
                      <ol className="design-ops">
                        {item.migration.operations.map((op, index) => (
                          <li key={index} className={/^drop/.test(op.op) ? 'danger' : ''}>
                            {operationText(op)}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {item.risks.map((risk) => (
                      <div key={risk.text} className={`design-risk ${risk.level}`}>
                        <Icon name="alert" /> {riskText(risk)}
                      </div>
                    ))}
                  </section>
                ))
              : null}
            {preview ? (
              <label className="design-label">
                <span>{t('Name of the migration')}</span>
                <input
                  ref={first}
                  className="input"
                  value={name}
                  placeholder="auto"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            ) : null}
            {preview ? (
              <p className="muted">
                {store === 'database'
                  ? t(
                      'Publishing keeps a new version of the models in the database and migrates it; every server starts again with it.'
                    )
                  : t(
                      'Publishing writes models.yaml and the migration of each app; the server starts again (xufa dev) and applies it.'
                    )}
              </p>
            ) : null}
          </div>
        </div>
        <div className="foot">
          <Button onClick={onClose} disabled={busy}>
            {t('Keep editing')}
          </Button>
          <Button
            variant={dangers.length ? 'danger solid' : 'primary'}
            disabled={!preview}
            busy={busy}
            onClick={publish}
          >
            {dangers.length ? t('Publish, dropping data') : t('Publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
