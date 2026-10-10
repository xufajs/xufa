// The form of an object (new, or one that is there): its fields by kind, the errors of the server by field, saving
// (and going back to the list, staying, or adding another, as Django's), deleting, Ctrl+S, and a question before
// leaving with changes not saved. Those who may only view it see its fields disabled.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin, useLeaf } from '../app.jsx';
import { api, useApi } from '../api.js';
import { href, navigate, setBlocker } from '../router.js';
import { Icon } from '../icons.jsx';
import { Alert, Badge, Button, Card, Facts, Failure, Loading, PageHead } from '../ui.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { checkForm, FieldInput, fromForm, toForm } from '../inputs.jsx';
import { Cell } from './model-list.jsx';
import { humanize, fieldLabel } from '../format.js';
import { InlineEditor, RelatedLists } from './related.jsx';
import { HistoryCard } from './history.jsx';
import { t } from '../i18n.js';

const WIDE = new Set(['textarea', 'json', 'multiselect', 'permissions', 'roles']);

// The values of the form: those of the object, or the defaults of a new one (and those of the address: Add Book from
// an author gives ?author=1).
function initialOf(model, item, given = {}) {
  const values = {};
  const labels = {};
  for (const field of model.fields) {
    if (field.readOnly) continue;
    const preset = given[field.name] !== undefined ? given[field.name] : given[field.attname];
    const value = item ? item.values[field.attname] : preset !== undefined ? preset : field.default;
    values[field.attname] = toForm(field, value);
    if (field.input === 'select' && item && item.related) labels[field.attname] = item.related[field.name] || null;
    // Many-to-many: the labels of its objects, by key.
    if (field.input === 'multiselect') {
      const keys = values[field.attname];
      const names = (item && item.related && item.related[field.name]) || [];
      labels[field.attname] = Object.fromEntries(keys.map((key, index) => [key, names[index] || null]));
    }
  }
  return { values, labels };
}

// The names of the fields of its form (those of its layout: fields, fieldsets), or null for all.
function layoutNames(model) {
  if (!model.layout) return null;
  return new Set(model.layout.flatMap((set) => set.rows.flat()));
}

export function ModelForm({ model, pk, query = {} }) {
  const { refresh, meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = pk === 'new';
  const path = `${encodeURIComponent(model.name)}/${encodeURIComponent(pk)}`;
  const { data: item, error, reload } = useApi(isNew ? null : path);
  const [form, setForm] = useState(() => (isNew ? initialOf(model, null, query) : null));
  const [saved, setSaved] = useState(() => (isNew ? JSON.stringify(initialOf(model, null, query).values) : null));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState([]);
  const [saving, setSaving] = useState(null);
  // A new object: the rows of its editable inlines, sent with it (their collect() by relation), and their errors.
  const pendingInlines = useRef({});
  const [inlineErrors, setInlineErrors] = useState({});
  // What the user may: of the model, and of this object (its rules).
  const can = { ...(model.can || {}), ...(item && item.can ? item.can : {}) };
  const editable = isNew ? can.add : can.change;

  useLeaf(isNew ? t('New {model}', { model: model.singular }) : item ? item.label : null);

  useEffect(() => {
    if (!item) return;
    const initial = initialOf(model, item);
    setForm(initial);
    setSaved(JSON.stringify(initial.values));
  }, [item, model]);

  const dirty = Boolean(form && saved !== null && JSON.stringify(form.values) !== saved && editable);

  // Before leaving with changes: a question (in the page), and the browser's own when the page itself goes.
  useEffect(() => {
    setBlocker(
      dirty
        ? () =>
            confirm({
              title: t('Leave without saving?'),
              message: t('The changes of this form are lost.'),
              confirm: t('Leave'),
              cancel: t('Stay'),
            })
        : null
    );
    const onUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      setBlocker(null);
    };
  }, [dirty, confirm]);

  // The fields of the form (with a layout, those it has), and those only shown (read only, out of the layout).
  const inLayout = useMemo(() => layoutNames(model), [model]);
  const fields = useMemo(
    () => model.fields.filter((field) => !field.readOnly && (!inLayout || inLayout.has(field.name))),
    [model, inLayout]
  );
  const details = useMemo(
    () => model.fields.filter((field) => field.readOnly && (!inLayout || !inLayout.has(field.name))),
    [model, inLayout]
  );

  const setValue = (field, value, label) => {
    setForm((current) => ({
      values: { ...current.values, [field.attname]: value },
      labels: label === undefined ? current.labels : { ...current.labels, [field.attname]: label },
    }));
    if (errors[field.name] || errors[field.attname]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field.name];
        delete next[field.attname];
        return next;
      });
    }
  };

  const showErrors = (data) => {
    const byField = {};
    const rest = [];
    const known = new Set(fields.flatMap((field) => [field.name, field.attname]));
    Object.entries((data && data.errors) || {}).forEach(([name, messages]) => {
      const text = [].concat(messages).join(' ');
      if (known.has(name)) byField[name] = text;
      else rest.push(name === '__all__' ? text : `${humanize(name)}: ${text}`);
    });
    if (!Object.keys((data && data.errors) || {}).length && data && data.error) rest.push(data.error);
    setErrors(byField);
    setGeneral(rest);
  };

  const save = useCallback(
    async (mode) => {
      if (!form || !editable || saving) return;
      const body = {};
      const local = {};
      for (const field of fields) {
        const raw = form.values[field.attname];
        const empty = raw === '' || raw === null || raw === undefined || (Array.isArray(raw) && !raw.length);
        const problem = field.required && empty ? t('This field is required.') : checkForm(field, raw);
        if (problem) local[field.name] = problem;
        else body[field.attname] = fromForm(field, form.values[field.attname]);
      }
      if (Object.keys(local).length) {
        setErrors(local);
        setGeneral([]);
        document.getElementById(`field-${Object.keys(local)[0]}`)?.focus();
        return;
      }
      if (isNew) {
        const inlines = {};
        for (const [name, collect] of Object.entries(pendingInlines.current)) {
          const collected = collect();
          if (!collected) return;
          if (collected.sent.length) inlines[name] = collected.sent;
        }
        if (Object.keys(inlines).length) body.inlines = inlines;
      }
      setSaving(mode);
      try {
        const result = isNew
          ? await api(encodeURIComponent(model.name), { method: 'POST', body })
          : await api(path, { method: 'PATCH', body });
        setErrors({});
        setGeneral([]);
        setInlineErrors({});
        setSaved(JSON.stringify(form.values));
        setBlocker(null);
        toast(`Saved ${result.label}`);
        if (isNew) refresh();
        if (mode === 'continue') {
          if (isNew) navigate([model.name, result.pk], undefined, { replace: true });
          else reload({ quiet: true });
        } else if (mode === 'another') {
          if (isNew) {
            const initial = initialOf(model, null);
            setForm(initial);
            setSaved(JSON.stringify(initial.values));
            window.scrollTo(0, 0);
          } else navigate([model.name, 'new']);
        } else navigate([model.name]);
      } catch (err) {
        showErrors(err.data && Object.keys(err.data).length ? err.data : { error: err.message });
        setInlineErrors((err.data && err.data.inlines) || {});
      } finally {
        setSaving(null);
      }
    },
    [form, editable, saving, fields, isNew, model, path, toast, refresh, reload]
  );

  // Ctrl+S (or ⌘S) saves and stays.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save('continue');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save]);

  const remove = async () => {
    const yes = await confirm({
      title: t('Delete {label}?', { label: item.label }),
      message: model.softDelete
        ? t('It is marked as deleted and leaves the list of {model}.', { model: model.label.toLowerCase() })
        : t('This cannot be undone.'),
      confirm: t('Delete'),
    });
    if (!yes) return;
    setSaving('delete');
    try {
      await api(path, { method: 'DELETE' });
      setBlocker(null);
      toast(`Deleted ${item.label}`);
      refresh();
      navigate([model.name]);
    } catch (err) {
      showErrors(err.data && Object.keys(err.data).length ? err.data : { error: err.message });
      setSaving(null);
    }
  };

  if (error && !item) return <Failure error={error} retry={reload} />;
  if (!form) return <Loading />;

  const renderField = (name) => {
    const field = model.fields.find((item) => item.name === name);
    if (!field) return null;
    const id = `field-${field.name}`;
    if (field.readOnly) {
      return (
        <div key={field.name} className="field">
          <span className="label">{fieldLabel(field)}</span>
          <div className="readonly">{item ? <Cell field={field} item={item} /> : <span className="muted">—</span>}</div>
          {field.help ? <div className="help">{field.help}</div> : null}
        </div>
      );
    }
    const problem = errors[field.name] || errors[field.attname];
    const value = form.values[field.attname];
    return (
      <div key={field.name} className={`field ${WIDE.has(field.input) ? 'wide' : ''} ${problem ? 'invalid' : ''}`}>
        <label htmlFor={id}>
          {fieldLabel(field)}
          {field.required ? (
            <span className="req" aria-label="required">
              *
            </span>
          ) : null}
          {field.type === 'foreignKey' &&
          value !== null &&
          value !== undefined &&
          value !== '' &&
          meta.models.some((entry) => entry.name === field.target) ? (
            <a
              className="hint"
              href={href([field.target, value])}
              title={t('Open the {model}', { model: field.target })}
            >
              {t('Open')} <Icon name="chevronRight" />
            </a>
          ) : null}
          {field.maxLength && typeof value === 'string' && editable ? (
            <span className="hint">
              {value.length} / {field.maxLength}
            </span>
          ) : field.input === 'json' ? (
            <span className="hint">{t('JSON')}</span>
          ) : null}
        </label>
        <FieldInput
          field={field}
          id={id}
          value={value}
          label={form.labels[field.attname]}
          disabled={!editable}
          invalid={Boolean(problem)}
          onChange={(next, label) => setValue(field, next, label)}
        />
        {field.help ? <div className="help">{field.help}</div> : null}
        {problem ? (
          <div className="error" role="alert">
            {problem}
          </div>
        ) : null}
      </div>
    );
  };

  const title = isNew ? t('New {model}', { model: model.singular }) : item.label;
  const side = !isNew && details.length;

  const formCard = (
    <form
      className="card"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save('list');
      }}
    >
      <div className="card-head">
        <h2>{isNew ? t('Details') : t('Edit')}</h2>
        {dirty ? (
          <span className="badge tone-warning">
            <span className="dot" />
            {t('Not saved')}
          </span>
        ) : null}
      </div>
      <div className="card-body">
        {general.length ? (
          <Alert>
            {general.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </Alert>
        ) : null}
        {model.layout ? (
          model.layout.map((set, index) => {
            const body = (
              <>
                {set.description ? <p className="muted fieldset-text">{set.description}</p> : null}
                <div className="form-grid stacked">
                  {set.rows.map((row) =>
                    row.length === 1 ? (
                      renderField(row[0])
                    ) : (
                      <div key={row.join(',')} className="form-row" style={{ '--columns': row.length }}>
                        {row.map((name) => renderField(name))}
                      </div>
                    )
                  )}
                </div>
              </>
            );
            const key = set.title || `set-${index}`;
            if (set.collapse) {
              return (
                <details key={key} className="fieldset">
                  <summary>{set.title || t('More')}</summary>
                  {body}
                </details>
              );
            }
            return (
              <section key={key} className="fieldset">
                {set.title ? <h3>{set.title}</h3> : null}
                {body}
              </section>
            );
          })
        ) : (
          <div className="form-grid">{fields.map((field) => renderField(field.name))}</div>
        )}
      </div>
      {editable ? (
        <div className="form-bar">
          <Button type="submit" variant="primary" icon="check" busy={saving === 'list'}>
            {t('Save')}
          </Button>
          <Button busy={saving === 'continue'} onClick={() => save('continue')} title={t('Ctrl+S')}>
            {t('Save and keep editing')}
          </Button>
          {can.add ? (
            <Button busy={saving === 'another'} onClick={() => save('another')} className="hide-sm">
              {t('Save and add another')}
            </Button>
          ) : null}
          <div className="grow" />
          <a className="btn ghost" href={href([model.name])}>
            {t('Cancel')}
          </a>
        </div>
      ) : null}
    </form>
  );

  return (
    <>
      <PageHead
        title={title}
        badge={!editable ? <Badge tone="">{t('View only')}</Badge> : null}
        sub={isNew ? t('A new object of {model}', { model: model.singular }) : `${model.singular} · #${item.pk}`}
        actions={
          !isNew && can.delete ? (
            <Button variant="danger" icon="trash" busy={saving === 'delete'} onClick={remove}>
              {t('Delete')}
            </Button>
          ) : null
        }
      />
      {side ? (
        <div className="grid main-side">
          {formCard}
          <Card title={t('Information')}>
            <Facts
              items={details.map((field) => [fieldLabel(field), <Cell key={field.name} field={field} item={item} />])}
            />
          </Card>
        </div>
      ) : (
        formCard
      )}
      {!isNew ? <RelatedLists model={model} pk={item.pk} /> : null}
      {isNew && editable ? (
        <div className="stack" style={{ marginTop: 16 }}>
          {(model.related || [])
            .filter((relation) => relation.editable)
            .map((relation) => {
              const other = meta.models.find((entry) => entry.name === relation.model);
              return other && other.can && other.can.add ? (
                <InlineEditor
                  key={relation.name}
                  model={model}
                  pk="new"
                  relation={relation}
                  other={other}
                  pending
                  register={(name, collect) => {
                    pendingInlines.current[name] = collect;
                  }}
                  rowErrors={inlineErrors[relation.name] || null}
                />
              ) : null;
            })}
        </div>
      ) : null}
      {!isNew && model.history ? (
        <div style={{ marginTop: 16 }}>
          {/* Read again after each save (its key). */}
          <HistoryCard key={saved} model={model} pk={item.pk} />
        </div>
      ) : null}
      {!editable && !isNew ? (
        <p className="muted" style={{ marginTop: 12 }}>
          <Icon name="lock" /> {t('You may view this {model}, not change it.', { model: model.singular })}
        </p>
      ) : null}
    </>
  );
}
