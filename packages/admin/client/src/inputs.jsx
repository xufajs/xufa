// The inputs of the fields of a form, by the kind the server gives each field (field.input), and how their values go
// to and from the form: texts, numbers, decimals, dates, switches, choices, JSON and foreign keys (a combobox that
// searches the objects of the model it points to); the permissions and roles of users and groups (a picker of those
// the admin knows, or any typed).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './api.js';
import { Icon } from './icons.jsx';
import { Spinner, Switch, useDismiss } from './ui.jsx';
import { useDebounced } from './lists.jsx';
import { t } from './i18n.js';

// The inputs whose value is a list (the form holds it as one).
const PICKED = new Set(['multiselect', 'permissions', 'roles']);

// The value of a field as the form holds it.
export function toForm(field, value) {
  if (PICKED.has(field.input)) return Array.isArray(value) ? value.map(String) : [];
  if (field.input === 'checkbox') return Boolean(value);
  if (value === null || value === undefined) return field.input === 'select' ? null : '';
  if (field.input === 'json') return JSON.stringify(value, null, 2);
  if (field.input === 'datetime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  if (field.input === 'date') return String(value).slice(0, 10);
  if (field.input === 'choices') return String(field.choices.indexOf(value));
  if (field.input === 'select') return value;
  return String(value);
}

// The value of the form to send (it throws on JSON that is not).
export function fromForm(field, raw) {
  switch (field.input) {
    case 'checkbox':
      return Boolean(raw);
    case 'multiselect':
    case 'permissions':
    case 'roles':
      return Array.isArray(raw) ? raw : [];
    case 'select':
      return raw === null || raw === '' ? null : raw;
    case 'choices':
      return raw === '' || raw === '-1' ? null : field.choices[Number(raw)];
    case 'json':
      return raw.trim() === '' ? null : JSON.parse(raw);
    case 'datetime':
      return raw ? new Date(raw).toISOString() : null;
    case 'number':
      return raw.trim() === '' ? null : Number(raw);
    default:
      if (raw === '') return field.null ? null : field.type === 'string' || field.type === 'text' ? '' : null;
      return raw;
  }
}

// What is wrong with a value before it is sent (JSON only), or null.
export function checkForm(field, raw) {
  if (field.input !== 'json' || !raw || !raw.trim()) return null;
  try {
    JSON.parse(raw);
    return null;
  } catch (err) {
    return t('Not JSON: {message}', { message: err.message });
  }
}

// Many-to-many: the objects chosen (chips that can be taken out) and a combobox that adds others. labels: { pk: label }.
function ManyToMany({ field, id, value, labels, onChange, disabled, invalid }) {
  const chosen = Array.isArray(value) ? value : [];
  const known = labels || {};
  const add = (pk, label) => {
    if (pk === null || chosen.some((item) => String(item) === String(pk))) return;
    onChange([...chosen, pk], { ...known, [pk]: label });
  };
  const remove = (pk) =>
    onChange(
      chosen.filter((item) => String(item) !== String(pk)),
      known
    );
  return (
    <div className="many">
      {chosen.length ? (
        <ul className="chips" aria-label={`${field.name} chosen`}>
          {chosen.map((pk) => (
            <li key={String(pk)} className="chip">
              <span>{known[pk] || `#${pk}`}</span>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={t('Remove {label}', { label: known[pk] || pk })}
                  onClick={() => remove(pk)}
                >
                  <Icon name="x" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled ? (
        <ForeignKey
          field={{ ...field, null: false }}
          id={id}
          value={null}
          label={null}
          invalid={invalid}
          placeholder={t('Add a {model}…', { model: field.target })}
          exclude={chosen}
          onChange={(pk, label) => add(pk, label)}
        />
      ) : null}
    </div>
  );
}

// The permissions of the admin's own pages (those under /api/_<area>), translated when shown.
const AREA_LABELS = {
  '_runs.view': () => t('View pipeline runs and schedules'),
  '_runs.change': () => t('Start, cancel and resume runs'),
  '_jobs.view': () => t('View jobs'),
  '_jobs.change': () => t('Retry, cancel and resume jobs'),
  '_jobs.delete': () => t('Delete jobs'),
  '_health.view': () => t('View the health of the app'),
  '_schema.view': () => t('View the data model'),
  '_schema.change': () => t('Edit the data model'),
  '_sessions.view': () => t('View the sessions of other users'),
  '_sessions.change': () => t('End the sessions of other users'),
};
// A pattern of permissions typed by hand: Model.action, Model.*, *.action or *.
const PATTERN = /^(\*|[A-Za-z_]\w*\.(\*|[A-Za-z_]\w*)|\*\.[A-Za-z_]\w*)$/;

// The text of a permission the server offers.
function permissionLabel(item) {
  if (item.kind === 'all') return t('Every permission');
  if (item.kind === 'viewAll') return t('View everything');
  if (item.kind === 'model') return t('Everything on {model}', { model: item.model });
  if (item.kind === 'area') return AREA_LABELS[item.name] ? AREA_LABELS[item.name]() : item.name;
  return item.label || item.name;
}

// Permissions or roles (field.input): chips of those chosen and a list to find others in (GET _permissions), each
// with its model; a pattern that is not in it (Book.*, *.view, a role of another app) is added as typed.
function Picker({ field, id, value, onChange, disabled, invalid }) {
  const roles = field.input === 'roles';
  const chosen = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(0);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const { data, loading } = useApi('_permissions');
  const known = useMemo(() => {
    if (!data) return [];
    if (roles) return data.roles.map((name) => ({ name, label: name, group: null }));
    return data.permissions.map((item) => ({
      name: item.name,
      label: permissionLabel(item),
      group: item.model || null,
    }));
  }, [data, roles]);
  const labelOf = (name) => (known.find((item) => item.name === name) || { label: name }).label;

  const options = useMemo(() => {
    const typed = text.trim();
    const lower = typed.toLowerCase();
    const taken = new Set(chosen);
    const list = known
      .filter((item) => !taken.has(item.name))
      .filter(
        (item) =>
          !lower ||
          item.label.toLowerCase().includes(lower) ||
          item.name.toLowerCase().includes(lower) ||
          (item.group !== null && item.group.toLowerCase().includes(lower))
      );
    const valid = roles ? typed.length > 0 : PATTERN.test(typed);
    const exact = known.some((item) => item.name === typed) || taken.has(typed);
    return valid && !exact ? [...list, { name: typed, label: t('Add “{text}”', { text: typed }), group: null }] : list;
  }, [known, chosen, text, roles]);
  useEffect(() => setFocus(0), [options]);

  const add = (name) => {
    onChange([...chosen, name]);
    setText('');
  };
  const remove = (name) => onChange(chosen.filter((item) => item !== name));
  const onKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocus((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocus((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (options[focus]) add(options[focus].name);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="many">
      {chosen.length ? (
        <ul className="chips" aria-label={`${field.name} chosen`}>
          {chosen.map((name) => (
            <li key={name} className="chip" title={name}>
              <span>{labelOf(name)}</span>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={t('Remove {label}', { label: labelOf(name) })}
                  onClick={() => remove(name)}
                >
                  <Icon name="x" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled ? (
        <div className={`combo ${open ? 'open' : ''}`} ref={ref}>
          <div
            id={id}
            className="combo-box"
            role="combobox"
            tabIndex={0}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={invalid || undefined}
            onClick={() => setOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span className="value placeholder">{roles ? t('Add a role…') : t('Add a permission…')}</span>
            <Icon name="chevronDown" className="muted" />
          </div>
          {open ? (
            <div className="popover">
              <input
                className="input"
                autoFocus
                placeholder={roles ? t('Find a role, or type one') : t('Find a permission, or type one (Book.*)')}
                aria-label={roles ? t('Find a role') : t('Find a permission')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKey}
              />
              <ul className="options" role="listbox" aria-label={field.name}>
                {loading && !data ? (
                  <li className="option-empty">
                    <Spinner small />
                  </li>
                ) : null}
                {options.map((option, index) => (
                  <li
                    key={option.name}
                    role="option"
                    aria-selected={false}
                    className={`option ${index === focus ? 'focused' : ''}`}
                    onMouseEnter={() => setFocus(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(option.name);
                    }}
                  >
                    <span className="option-text">
                      {option.group !== null && !roles ? <span className="muted">{option.group} · </span> : null}
                      {option.label}
                    </span>
                    {option.label !== option.name ? <code className="option-code">{option.name}</code> : null}
                  </li>
                ))}
                {data && !options.length ? <li className="option-empty">{t('Nothing found')}</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ForeignKey({ field, id, value, label, onChange, disabled, invalid, placeholder, exclude }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(0);
  const [known, setKnown] = useState(label || null);
  const search = useDebounced(text.trim(), 200);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const box = useRef(null);
  const target = encodeURIComponent(field.target);
  // The choices: those of the search while open; that of a value given without its label, to name it.
  const needLabel = value !== null && value !== undefined && !known;
  const { data, loading } = useApi(
    open
      ? `${target}/choices${search ? `?search=${encodeURIComponent(search)}` : ''}`
      : needLabel
        ? `${target}/choices?pk=${encodeURIComponent(value)}`
        : null
  );
  useEffect(() => {
    if (needLabel && data) {
      const found = data.find((choice) => String(choice.pk) === String(value));
      if (found) setKnown(found.label);
    }
  }, [data, needLabel, value]);
  useEffect(() => setKnown(label || null), [label]);

  // The choices of the server, narrowed at once by what is typed (the server's answer to it comes after).
  const options = useMemo(() => {
    const typed = text.trim().toLowerCase();
    const skip = new Set((exclude || []).map(String));
    const list = (data || [])
      .map((choice) => ({ pk: choice.pk, label: choice.label }))
      .filter((choice) => !skip.has(String(choice.pk)))
      .filter((choice) => !typed || choice.label.toLowerCase().includes(typed));
    return field.null && !typed ? [{ pk: null, label: t('(none)') }, ...list] : list;
  }, [data, field.null, text, exclude]);
  useEffect(() => setFocus(0), [options]);

  const choose = (option) => {
    onChange(option.pk, option.pk === null ? null : option.label);
    setKnown(option.pk === null ? null : option.label);
    setOpen(false);
    setText('');
    box.current?.focus();
  };
  const onKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocus((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocus((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (options[focus]) choose(options[focus]);
    }
  };
  const shown = value === null || value === undefined ? null : known || `#${value}`;

  return (
    <div className={`combo ${open ? 'open' : ''}`} ref={ref}>
      <div
        ref={box}
        id={id}
        className={`combo-box ${disabled ? 'disabled' : ''}`}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={`value ${shown ? '' : 'placeholder'}`}>
          {shown || placeholder || (field.null ? t('(none)') : t('Choose…'))}
        </span>
        <Icon name="chevronDown" className="muted" />
      </div>
      {open ? (
        <div className="popover">
          <input
            className="input"
            autoFocus
            placeholder={t('Find a {model}', { model: field.target })}
            aria-label={t('Find a {model}', { model: field.target })}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKey}
          />
          <ul className="options" role="listbox" aria-label={field.name}>
            {loading && !data ? (
              <li className="option-empty">
                <Spinner small />
              </li>
            ) : null}
            {options.map((option, index) => {
              const isSelected = String(option.pk) === String(value ?? null);
              return (
                <li
                  key={String(option.pk)}
                  role="option"
                  aria-selected={isSelected}
                  className={`option ${index === focus ? 'focused' : ''} ${isSelected ? 'selected' : ''}`}
                  onMouseEnter={() => setFocus(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                >
                  {option.label}
                  {isSelected ? <Icon name="check" className="check" /> : null}
                </li>
              );
            })}
            {data && !options.length ? <li className="option-empty">{t('Nothing found')}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function FieldInput({ field, id, value, label, onChange, disabled, invalid }) {
  const common = { id, disabled, 'aria-invalid': invalid || undefined };
  switch (field.input) {
    case 'multiselect':
      return (
        <ManyToMany
          field={field}
          id={id}
          value={value}
          labels={label}
          disabled={disabled}
          invalid={invalid}
          onChange={onChange}
        />
      );
    case 'permissions':
    case 'roles':
      return <Picker field={field} id={id} value={value} disabled={disabled} invalid={invalid} onChange={onChange} />;
    case 'checkbox':
      return (
        <Switch id={id} checked={value} disabled={disabled} onChange={onChange} label={value ? t('Yes') : t('No')} />
      );
    case 'choices':
      return (
        <select className="select" {...common} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{field.null ? t('(none)') : t('Choose…')}</option>
          {field.choices.map((choice, index) => (
            <option key={String(choice)} value={String(index)}>
              {field.choiceLabels ? field.choiceLabels[index] : String(choice)}
            </option>
          ))}
        </select>
      );
    case 'select':
      return (
        <ForeignKey
          field={field}
          id={id}
          value={value}
          label={label}
          disabled={disabled}
          invalid={invalid}
          onChange={(pk, chosen) => onChange(pk, chosen)}
        />
      );
    case 'textarea':
      return (
        <textarea
          className="textarea"
          {...common}
          value={value}
          rows={5}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'json':
      return (
        <textarea
          className="textarea code"
          {...common}
          spellCheck={false}
          value={value}
          rows={8}
          placeholder="null"
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'datetime':
      return (
        <input
          className="input"
          type="datetime-local"
          {...common}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'date':
      return (
        <input
          className="input"
          type="date"
          {...common}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <input
          className="input"
          type="number"
          step="any"
          {...common}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'decimal':
      return (
        <input
          className="input"
          inputMode="decimal"
          {...common}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          className="input"
          {...common}
          value={value}
          maxLength={field.maxLength || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
