// The objects of other models that point to an object (an author's books): a card of each relation in its page, with
// their columns, a link to each, to add another that points to it, and to see them all in their list.
import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, useApi } from '../api.js';
import { href } from '../router.js';
import { Icon } from '../icons.jsx';
import { Alert, Button, Card, Spinner } from '../ui.jsx';
import { Paginator } from '../lists.jsx';
import { count, fieldLabel } from '../format.js';
import { useToast } from '../feedback.jsx';
import { FieldInput, fromForm, toForm } from '../inputs.jsx';
import { Cell, columnsOf } from './model-list.jsx';
import { t } from '../i18n.js';

// A row of an inline: its values as the form holds them (and the labels of its foreign keys).
function rowOf(fields, item) {
  const values = {};
  const labels = {};
  for (const field of fields) {
    values[field.attname] = toForm(field, item ? item.values[field.attname] : field.default);
    if (field.input === 'select' && item && item.related) labels[field.attname] = item.related[field.name] || null;
  }
  return {
    pk: item ? item.pk : null,
    values,
    labels,
    delete: false,
    key: item ? `pk-${item.pk}` : `new-${Math.random()}`,
  };
}

// Django's TabularInline: the objects of a relation edited in rows (its fields), with empty rows to add others and
// a box to delete each, saved at once (every row is checked first; the errors are shown by row). For a new object
// (pending), its rows are sent with it: register(name, collect) gives the form what to send, and rowErrors the errors
// of the server by the rows sent.
export function InlineEditor({ model, pk, relation, other, pending = false, register = null, rowErrors = null }) {
  const toast = useToast();
  const fields = relation.fields.map((name) => other.fields.find((field) => field.name === name)).filter(Boolean);
  const path = `${encodeURIComponent(model.name)}/${encodeURIComponent(pk)}/related/${encodeURIComponent(relation.name)}`;
  const { data, error, reload } = useApi(pending ? null : `${path}?size=100`);
  const sentIndexes = useRef([]);
  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [saving, setSaving] = useState(false);
  const can = other.can || {};

  const reset = (results) => {
    const blanks = can.add ? Array.from({ length: relation.extra }, () => rowOf(fields, null)) : [];
    setRows([...results.map((item) => rowOf(fields, item)), ...blanks]);
    setErrors({});
    setGeneral(null);
  };
  useEffect(() => {
    if (data) reset(data.results);
  }, [data]);
  useEffect(() => {
    if (pending) reset([]);
  }, [pending]);
  // The errors of the server for the rows sent with the new object.
  useEffect(() => {
    if (!rowErrors) return;
    const byRow = {};
    Object.entries(rowErrors).forEach(([at, messages]) => {
      if (/^\d+$/.test(at)) byRow[sentIndexes.current[Number(at)]] = messages;
    });
    setErrors(byRow);
  }, [rowErrors]);

  const change = (index, field, value, label) => {
    // The error of the field goes once it is changed.
    setErrors((current) => {
      const row = current[index];
      if (!row || !(row[field.name] || row[field.attname])) return current;
      const rest = { ...row };
      delete rest[field.name];
      delete rest[field.attname];
      const next = { ...current, [index]: rest };
      if (!Object.keys(rest).length) delete next[index];
      return next;
    });
    setRows((current) =>
      current.map((row, at) =>
        at === index
          ? {
              ...row,
              values: { ...row.values, [field.attname]: value },
              labels: label === undefined ? row.labels : { ...row.labels, [field.attname]: label },
            }
          : row
      )
    );
  };
  const toggle = (index) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, delete: !row.delete } : row)));

  // Rows that are new and left empty are not sent (as Django's extra forms).
  const isBlank = (row) =>
    row.pk === null &&
    fields.every((field) => {
      const value = row.values[field.attname];
      const initial = toForm(field, field.default);
      return value === initial || value === '' || value === null;
    });

  // The rows to send ({ sent, indexes }), or null when some lack a field required (their errors shown).
  const collect = () => {
    const sent = [];
    const indexes = [];
    // As the form of an object: the fields required, before anything is sent.
    const local = {};
    rows.forEach((row, index) => {
      if (isBlank(row) || row.delete) return;
      for (const field of fields) {
        const raw = row.values[field.attname];
        if (field.required && (raw === '' || raw === null || raw === undefined)) {
          local[index] = { ...local[index], [field.name]: t('This field is required.') };
        }
      }
    });
    if (Object.keys(local).length) {
      setErrors(local);
      setGeneral(null);
      return null;
    }
    rows.forEach((row, index) => {
      if (isBlank(row)) return;
      const values = {};
      for (const field of fields) values[field.attname] = fromForm(field, row.values[field.attname]);
      sent.push({ pk: row.pk, values, delete: row.delete });
      indexes.push(index);
    });
    sentIndexes.current = indexes;
    return { sent, indexes };
  };
  // A new object: the form asks for the rows when it saves.
  if (register) register(relation.name, rows ? collect : () => ({ sent: [], indexes: [] }));

  const save = async () => {
    const collected = collect();
    if (!collected) return;
    const { sent, indexes } = collected;
    setSaving(true);
    try {
      const result = await api(path, { method: 'POST', body: { rows: sent } });
      toast(
        t('Saved {model}: {saved} saved, {deleted} deleted', {
          model: other.label,
          saved: result.saved,
          deleted: result.deleted,
        })
      );
      reload({ quiet: true });
    } catch (err) {
      const byRow = {};
      const given = (err.data && err.data.errors) || {};
      Object.entries(given).forEach(([at, messages]) => {
        if (/^\d+$/.test(at)) byRow[indexes[Number(at)]] = messages;
      });
      setErrors(byRow);
      setGeneral(Object.keys(byRow).length ? null : (err.data && err.data.error) || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      bodyless
      title={
        <h2>
          {other.label}
          {data ? <span className="badge">{count(data.count)}</span> : null}
        </h2>
      }
      actions={
        rows && !pending ? (
          <>
            {can.add ? (
              <Button size="sm" icon="plus" onClick={() => setRows((current) => [...current, rowOf(fields, null)])}>
                {t('Add another {model}', { model: other.singular })}
              </Button>
            ) : null}
            <Button size="sm" variant="primary" icon="check" busy={saving} onClick={save}>
              {t('Save {model}', { model: other.label.toLowerCase() })}
            </Button>
          </>
        ) : rows && can.add ? (
          <Button size="sm" icon="plus" onClick={() => setRows((current) => [...current, rowOf(fields, null)])}>
            {t('Add another {model}', { model: other.singular })}
          </Button>
        ) : null
      }
    >
      {error ? (
        <div className="card-body muted">{error.message}</div>
      ) : !rows ? (
        <div className="card-body">
          <Spinner small />
        </div>
      ) : (
        <>
          {general ? (
            <div className="card-body">
              <Alert>{general}</Alert>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="table inline-table">
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field.name}>
                      {fieldLabel(field)}
                      {field.required ? <span className="req"> *</span> : null}
                    </th>
                  ))}
                  {can.delete ? <th className="check-cell">{t('Delete')}</th> : null}
                  <th aria-label={t('Open')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const problems = errors[index] || {};
                  return (
                    <tr
                      key={row.key}
                      className={`${row.delete ? 'deleting' : ''} ${errors[index] ? 'invalid-row' : ''}`}
                    >
                      {fields.map((field) => {
                        const problem = problems[field.name] || problems[field.attname];
                        return (
                          <td key={field.name} className={problem ? 'invalid' : ''}>
                            <FieldInput
                              field={field}
                              id={`inline-${relation.name}-${index}-${field.name}`}
                              value={row.values[field.attname]}
                              label={row.labels[field.attname]}
                              disabled={row.delete || (row.pk === null ? !can.add : !can.change)}
                              invalid={Boolean(problem)}
                              onChange={(value, label) => change(index, field, value, label)}
                            />
                            {problem ? <div className="error">{[].concat(problem).join(' ')}</div> : null}
                          </td>
                        );
                      })}
                      {can.delete ? (
                        <td className="check-cell">
                          {row.pk !== null ? (
                            <input
                              type="checkbox"
                              aria-label={t('Delete {model} {key}', { model: other.singular, key: row.pk })}
                              checked={row.delete}
                              onChange={() => toggle(index)}
                            />
                          ) : null}
                        </td>
                      ) : null}
                      <td className="check-cell">
                        {row.pk !== null ? (
                          <a href={href([other.name, row.pk])} title={t('Open the {model}', { model: other.singular })}>
                            <Icon name="chevronRight" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && data.count > data.size ? (
            <div className="card-body muted">
              {t('The first {count} are shown; the others are in their list.', { count: data.size })}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function RelatedCard({ model, pk, relation }) {
  const { meta } = useAdmin();
  const editable = relation.editable && meta.models.find((entry) => entry.name === relation.model);
  if (editable) return <InlineEditor model={model} pk={pk} relation={relation} other={editable} />;
  return <RelatedList model={model} pk={pk} relation={relation} />;
}

function RelatedList({ model, pk, relation }) {
  const { meta } = useAdmin();
  const [page, setPage] = useState(1);
  const other = meta.models.find((entry) => entry.name === relation.model);
  const { data, error } = useApi(
    other
      ? `${encodeURIComponent(model.name)}/${encodeURIComponent(pk)}/related/${encodeURIComponent(relation.name)}?page=${page}`
      : null
  );
  if (!other) return null;
  // Its columns, but the one that points back here.
  const columns = columnsOf(other, relation.field);
  const canAdd = other.can && other.can.add;
  const filtered = other.filters.includes(relation.field);
  return (
    <Card
      bodyless
      title={
        <h2>
          {other.label}
          {data ? <span className="badge">{count(data.count)}</span> : null}
        </h2>
      }
      actions={
        <>
          {filtered && data && data.count ? (
            <a className="btn sm ghost" href={href([other.name], { [`f.${relation.field}`]: pk })}>
              {t('In their list')} <Icon name="chevronRight" />
            </a>
          ) : null}
          {canAdd ? (
            <a className="btn sm" href={href([other.name, 'new'], { [relation.field]: pk })}>
              <Icon name="plus" /> {t('Add {model}', { model: other.singular })}
            </a>
          ) : null}
        </>
      }
    >
      {error ? (
        <div className="card-body muted">{error.message}</div>
      ) : !data ? (
        <div className="card-body">
          <Spinner small />
        </div>
      ) : !data.results.length ? (
        <div className="card-body muted">{t('None yet.')}</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((field) => (
                    <th key={field.name}>{fieldLabel(field)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.results.map((item) => {
                  const to = href([other.name, item.pk]);
                  return (
                    <tr
                      key={item.pk}
                      className="link"
                      onClick={(event) => !event.target.closest('a') && (window.location.hash = to)}
                    >
                      {columns.map((field, index) => (
                        <td key={field.name} className={index === 0 ? 'primary-cell' : ''}>
                          {index === 0 ? (
                            <a href={to} style={{ color: 'inherit' }}>
                              <Cell field={field} item={item} />
                            </a>
                          ) : (
                            <Cell field={field} item={item} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.count > data.size ? (
            <Paginator count={data.count} page={data.page} size={data.size} onPage={setPage} />
          ) : null}
        </>
      )}
    </Card>
  );
}

export function RelatedLists({ model, pk }) {
  if (!model.related || !model.related.length) return null;
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {model.related.map((relation) => (
        <RelatedCard key={relation.name} model={model} pk={pk} relation={relation} />
      ))}
    </div>
  );
}
