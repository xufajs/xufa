// The list of a model: search, filters, order and pages in the address; its columns; and, for those who may delete,
// a selection to delete at once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, useApi } from '../api.js';
import { href, navigate } from '../router.js';
import { Icon } from '../icons.jsx';
import { Badge, Button, Dropdown, Empty, Failure, PageHead, Switch } from '../ui.jsx';
import { FilterSelect, Paginator, SkeletonRows, SortHead, useDebounced } from '../lists.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { count, day, humanize, when, fieldLabel, choiceLabel } from '../format.js';
import { t, tn } from '../i18n.js';

const NUMERIC = new Set(['integer', 'float', 'decimal', 'bigint', 'id']);

export function fieldOf(model, name) {
  return model.fields.find((field) => field.name === name);
}

// The columns of a list: its fields, and those the server computes (methods, paths across relations, many-to-many):
// { name, label, computed, sortable } with the field of a field.
export function columnsOf(model, skip = null) {
  const given = model.columns || model.list.map((name) => ({ name, label: null, computed: false, sortable: true }));
  return given
    .filter((column) => column.name !== skip)
    .map((column) => {
      if (column.computed) return { ...column, attname: null, type: 'computed' };
      const field = fieldOf(model, column.name);
      return field ? { ...field, sortable: column.sortable !== false } : null;
    })
    .filter(Boolean);
}

export function Cell({ field, item }) {
  const { meta } = useAdmin();
  if (field.computed) {
    const shown = item.columns ? item.columns[field.name] : null;
    if (shown === null || shown === undefined || shown === '') return <span className="muted">—</span>;
    if (typeof shown === 'boolean') {
      return shown ? (
        <Icon name="check" className="bool-yes" title={t('Yes')} />
      ) : (
        <Icon name="x" className="bool-no" title={t('No')} />
      );
    }
    return String(shown);
  }
  const value = item.values[field.attname];
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  switch (field.type) {
    case 'boolean':
      return value ? (
        <Icon name="check" className="bool-yes" title={t('Yes')} />
      ) : (
        <Icon name="x" className="bool-no" title={t('No')} />
      );
    case 'datetime':
      return <span title={String(value)}>{when(value)}</span>;
    case 'date':
      return day(value);
    case 'foreignKey': {
      const text = (item.related && item.related[field.name]) || String(value);
      return meta && meta.models.some((entry) => entry.name === field.target) ? (
        <a href={href([field.target, value])} onClick={(event) => event.stopPropagation()}>
          {text}
        </a>
      ) : (
        text
      );
    }
    case 'json':
      return <span className="mono">{JSON.stringify(value)}</span>;
    default:
      if (field.choices) return <Badge tone="">{choiceLabel(field, value)}</Badge>;
      return String(value);
  }
}

// A cell of a field of list_editable: a switch (booleans) or a select (choices), saved as it changes.
function EditableCell({ model, field, item, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(item.values[field.attname]);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(item.values[field.attname]), [item, field]);
  const save = async (next) => {
    const before = value;
    setValue(next);
    setSaving(true);
    try {
      await api(`${encodeURIComponent(model.name)}/${encodeURIComponent(item.pk)}`, {
        method: 'PATCH',
        body: { [field.attname]: next },
      });
      onSaved();
    } catch (err) {
      setValue(before);
      const messages = err.data && err.data.errors ? Object.values(err.data.errors).flat() : [];
      toast(`${item.label}: ${messages[0] || err.message}`, 'danger');
    } finally {
      setSaving(false);
    }
  };
  const label = t('{field} of {object}', { field: fieldLabel(field), object: item.label });
  if (field.type === 'boolean') {
    return (
      <span className="editable-cell" onClick={(event) => event.stopPropagation()}>
        <Switch checked={value} disabled={saving} onChange={save} label={null} id={`edit-${item.pk}-${field.name}`} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <select
      className="select sm editable-cell"
      aria-label={label}
      value={field.choices.indexOf(value) === -1 ? '' : String(field.choices.indexOf(value))}
      disabled={saving}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => save(event.target.value === '' ? null : field.choices[Number(event.target.value)])}
    >
      {field.null ? <option value="">(none)</option> : null}
      {field.choices.map((choice, index) => (
        <option key={String(choice)} value={String(index)}>
          {field.choiceLabels ? field.choiceLabels[index] : String(choice)}
        </option>
      ))}
    </select>
  );
}

// The columns a user hides in the list of a model, kept in this browser.
function useHiddenColumns(model) {
  const key = `xufa-admin.columns.${model.name}`;
  const read = () => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem(key) || '[]'));
    } catch {
      return new Set();
    }
  };
  const [hidden, setHidden] = useState(read);
  useEffect(() => setHidden(read()), [key]);
  const toggle = (name) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        window.localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Not kept: the columns are those of the page until it is closed.
      }
      return next;
    });
  return [hidden, toggle];
}

// The columns of the list shown or hidden (the first is always shown).
function ColumnPicker({ columns, hidden, onToggle }) {
  return (
    <Dropdown
      label={t('Columns')}
      button={({ open, toggle }) => (
        <button
          type="button"
          className="btn"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          title={t('The columns of the list')}
        >
          <Icon name="eye" /> {t('Columns')}
        </button>
      )}
    >
      {() => (
        <ul className="options" aria-label={t('Columns shown')}>
          {columns.map((column, index) => (
            <li key={column.name}>
              <label className={`option check-option ${index === 0 ? 'disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={!hidden.has(column.name)}
                  disabled={index === 0}
                  onChange={() => onToggle(column.name)}
                />
                {fieldLabel(column)}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}

// The options of a filter of a field: yes and no, its choices, or the objects of its foreign key (and none).
function useFilterOptions(field) {
  const { data } = useApi(field.type === 'foreignKey' ? `${encodeURIComponent(field.target)}/choices` : null);
  return useMemo(() => {
    let options;
    if (field.type === 'boolean') {
      options = [
        ['true', t('Yes')],
        ['false', t('No')],
      ];
    } else if (field.type === 'foreignKey') {
      options = (data || []).map((choice) => [choice.pk, choice.label]);
    } else options = (field.choices || []).map((choice) => [choice, choiceLabel(field, choice)]);
    if (field.null) options.push(['null', '(none)']);
    return options;
  }, [field, data]);
}

function Filter({ field, value, onChange }) {
  const options = useFilterOptions(field);
  return <FilterSelect label={fieldLabel(field)} value={value} options={options} onChange={onChange} />;
}

export function ModelList({ model, query }) {
  const { meta, refresh } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const size = meta.pageSizes.includes(Number(query.size)) ? Number(query.size) : null;
  const order = query.order || '';
  const filters = Object.fromEntries(
    model.filters.map((name) => [name, query[`f.${name}`] || '']).filter(([, value]) => value !== '')
  );
  const [text, setText] = useState(query.search || '');
  const search = useDebounced(text.trim(), 300);
  const box = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(null);

  // The query of the list in the address (a change goes back to its first page).
  const setQuery = (changes, keepPage = false) => {
    const next = { ...query, ...changes };
    if (!keepPage) delete next.page;
    navigate([model.name], next, { replace: true });
  };

  useEffect(() => {
    if ((query.search || '') !== search) setQuery({ search });
  }, [search]);

  // / searches.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
        event.preventDefault();
        box.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const params = new URLSearchParams();
  params.set('page', String(page));
  if (size) params.set('size', String(size));
  if (query.search) params.set('search', query.search);
  if (order) params.set('order', order);
  Object.entries(filters).forEach(([name, value]) => params.set(`filter.${name}`, value));
  const { data, error, loading, reload } = useApi(`${encodeURIComponent(model.name)}?${params.toString()}`);

  useEffect(() => setSelected(new Set()), [data]);

  const allColumns = columnsOf(model);
  const [hidden, toggleColumn] = useHiddenColumns(model);
  const columns = allColumns.filter((column, index) => index === 0 || !hidden.has(column.name));
  const editable = new Set(model.can && model.can.change ? model.editable || [] : []);
  const filtering = Boolean(query.search) || Object.keys(filters).length > 0;
  const canDelete = model.can && model.can.delete;
  const actions = model.actions || [];
  // Rows are selected to delete them, or for the actions of the model.
  const selectable = canDelete || actions.length > 0;
  const results = data ? data.results : [];
  const allChecked = results.length > 0 && results.every((item) => selected.has(item.pk));

  const toggle = (pk) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });

  const deleteSelected = async () => {
    const pks = [...selected];
    const yes = await confirm({
      title: tn(pks.length, 'Delete {count} object?', 'Delete {count} objects?'),
      message: model.softDelete
        ? t('They are marked as deleted and leave the list of {model}.', { model: model.label.toLowerCase() })
        : t('This cannot be undone.'),
      confirm: t('Delete'),
    });
    if (!yes) return;
    setDeleting(true);
    let done = 0;
    const failures = [];
    for (const pk of pks) {
      try {
        await api(`${encodeURIComponent(model.name)}/${encodeURIComponent(pk)}`, { method: 'DELETE' });
        done += 1;
      } catch (err) {
        failures.push(err.message);
      }
    }
    setDeleting(false);
    if (done) toast(tn(done, 'Deleted {count} object', 'Deleted {count} objects'));
    if (failures.length)
      toast(t('{count} could not be deleted: {error}', { count: failures.length, error: failures[0] }), 'danger');
    reload();
    refresh();
  };

  // An action of the model on the rows selected (declared on the server: its run, label and question).
  const runAction = async (action) => {
    const pks = [...selected];
    if (action.confirm) {
      const yes = await confirm({
        title: typeof action.confirm === 'string' ? action.confirm : `${action.label}?`,
        message: tn(pks.length, 'On {count} object of {model}.', 'On {count} objects of {model}.', {
          model: model.singular,
        }),
        confirm: action.label,
        tone: action.danger ? undefined : 'accent',
      });
      if (!yes) return;
    }
    setRunning(action.name);
    try {
      const answer = await api(`${encodeURIComponent(model.name)}/actions/${encodeURIComponent(action.name)}`, {
        method: 'POST',
        body: { pks },
      });
      toast(answer.message);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setRunning(null);
    }
    reload();
    refresh();
  };

  if (error && !data) return <Failure error={error} retry={reload} />;

  return (
    <>
      <PageHead
        title={model.label}
        sub={
          data
            ? filtering
              ? tn(data.count, '{count} object found', '{count} objects found', { count: count(data.count) })
              : tn(data.count, '{count} object', '{count} objects', { count: count(data.count) })
            : ' '
        }
        actions={
          <>
            {allColumns.length > 1 ? (
              <ColumnPicker columns={allColumns} hidden={hidden} onToggle={toggleColumn} />
            ) : null}
            {model.can && model.can.add ? (
              <a className="btn primary" href={href([model.name, 'new'])}>
                <Icon name="plus" /> {t('Add {model}', { model: model.singular })}
              </a>
            ) : null}
          </>
        }
      />
      <section className="card">
        {model.search.length || model.filters.length ? (
          <div className="toolbar">
            {model.search.length ? (
              <div className="search">
                <Icon name="search" />
                <input
                  ref={box}
                  className="input"
                  type="search"
                  placeholder={`Search ${model.search
                    .map((name) => humanize(name.replace(/^[\^=]/, '')))
                    .join(', ')
                    .toLowerCase()}`}
                  aria-label={`Search ${model.label.toLowerCase()}`}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                {!text ? <kbd className="hide-sm">/</kbd> : null}
              </div>
            ) : null}
            {model.filters.map((name) => {
              const field = fieldOf(model, name);
              return field ? (
                <Filter
                  key={name}
                  field={field}
                  value={filters[name]}
                  onChange={(value) => setQuery({ [`f.${name}`]: value })}
                />
              ) : null;
            })}
            {filtering ? (
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                onClick={() => {
                  setText('');
                  navigate([model.name], { size: query.size, order: query.order }, { replace: true });
                }}
              >
                {t('Clear')}
              </Button>
            ) : null}
            {loading && data ? (
              <span className="summary">
                <span className="spinner sm" />
              </span>
            ) : null}
          </div>
        ) : null}
        {selected.size ? (
          <div className="bulk">
            {t('{count} selected', { count: selected.size })}
            {actions.map((action) => (
              <Button
                key={action.name}
                size="sm"
                variant={action.danger ? 'danger' : ''}
                busy={running === action.name}
                disabled={running !== null || deleting}
                onClick={() => runAction(action)}
              >
                {action.label}
              </Button>
            ))}
            {canDelete ? (
              <Button size="sm" variant="danger" icon="trash" busy={deleting} onClick={deleteSelected}>
                {t('Delete')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('Clear selection')}
            </Button>
          </div>
        ) : null}
        {data && !results.length ? (
          filtering ? (
            <Empty
              icon="search"
              title={t('Nothing matches')}
              actions={
                <Button
                  icon="x"
                  onClick={() => {
                    setText('');
                    navigate([model.name], {}, { replace: true });
                  }}
                >
                  {t('Clear the search and filters')}
                </Button>
              }
            >
              {t('No {model} has what you are looking for.', { model: model.singular })}
            </Empty>
          ) : (
            <Empty
              title={t('No {model} yet', { model: model.label.toLowerCase() })}
              actions={
                model.can && model.can.add ? (
                  <a className="btn primary" href={href([model.name, 'new'])}>
                    <Icon name="plus" /> {t('Add the first one')}
                  </a>
                ) : null
              }
            />
          )
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {selectable ? (
                    <th className="check-cell">
                      <input
                        type="checkbox"
                        aria-label={t('Select all in this page')}
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? new Set() : new Set(results.map((item) => item.pk)))}
                      />
                    </th>
                  ) : null}
                  {columns.map((field) =>
                    field.sortable ? (
                      <SortHead
                        key={field.name}
                        name={field.name}
                        label={fieldLabel(field)}
                        order={order}
                        className={NUMERIC.has(field.type) ? 'num' : ''}
                        onOrder={(value) => setQuery({ order: value }, true)}
                      />
                    ) : (
                      <th key={field.name}>{fieldLabel(field)}</th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={columns.length + (selectable ? 1 : 0)} />
                ) : (
                  results.map((item) => {
                    const to = href([model.name, item.pk]);
                    return (
                      <tr
                        key={item.pk}
                        className={`link ${selected.has(item.pk) ? 'checked' : ''}`}
                        onClick={(event) => {
                          if (event.target.closest('input, a, select, label')) return;
                          window.location.hash = to;
                        }}
                      >
                        {selectable ? (
                          <td className="check-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.label}`}
                              checked={selected.has(item.pk)}
                              onChange={() => toggle(item.pk)}
                            />
                          </td>
                        ) : null}
                        {columns.map((field, index) => (
                          <td
                            key={field.name}
                            className={`${NUMERIC.has(field.type) ? 'num' : ''} ${index === 0 ? 'primary-cell' : ''}`}
                          >
                            {index === 0 ? (
                              <a href={to} style={{ color: 'inherit' }}>
                                <Cell field={field} item={item} />
                              </a>
                            ) : editable.has(field.name) ? (
                              <EditableCell
                                model={model}
                                field={field}
                                item={item}
                                onSaved={() => reload({ quiet: true })}
                              />
                            ) : (
                              <Cell field={field} item={item} />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.count ? (
          <Paginator
            count={data.count}
            page={data.page}
            size={data.size}
            sizes={meta.pageSizes}
            onPage={(value) => setQuery({ page: value }, true)}
            onSize={(value) => setQuery({ size: value })}
          />
        ) : null}
      </section>
    </>
  );
}
