// The parts of lists: the paginator (pages with gaps, rows per page, go to a page), selects of filters, and the head
// of a column that orders.
import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { count } from './format.js';
import { t } from './i18n.js';

// The pages to show: the first, the last, and those around the current one, with gaps ('…').
export function pagesOf(page, last) {
  const shown = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  if (page <= 3) [2, 3, 4].forEach((n) => n <= last && shown.add(n));
  if (page >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => n >= 1 && shown.add(n));
  const sorted = [...shown].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(`gap-${n}`);
    out.push(n);
  });
  return out;
}

export function Paginator({ count: total, page, size, sizes, onPage, onSize }) {
  const last = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const [goto, setGoto] = useState('');
  useEffect(() => setGoto(''), [page]);
  return (
    <div className="pager">
      <span>{t('{from}–{to} of {total}', { from: count(from), to: count(to), total: count(total) })}</span>
      {sizes && onSize ? (
        <label className="nowrap hide-sm">
          {t('Rows')}{' '}
          <select className="select" value={size} onChange={(event) => onSize(Number(event.target.value))}>
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {last > 1 ? (
        <nav className="pages" aria-label={t('Pages')}>
          <button
            type="button"
            className="page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label={t('Previous page')}
          >
            <Icon name="chevronLeft" />
          </button>
          {pagesOf(page, last).map((n) =>
            typeof n === 'string' ? (
              <span key={n} className="muted">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={`page ${n === page ? 'current' : ''}`}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => onPage(n)}
              >
                {n}
              </button>
            )
          )}
          <button
            type="button"
            className="page"
            disabled={page >= last}
            onClick={() => onPage(page + 1)}
            aria-label={t('Next page')}
          >
            <Icon name="chevronRight" />
          </button>
          {last > 7 ? (
            <form
              className="hide-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const n = Number.parseInt(goto, 10);
                if (n >= 1 && n <= last) onPage(n);
              }}
            >
              <input
                className="input goto"
                inputMode="numeric"
                placeholder={t('Go to')}
                aria-label={t('Go to page')}
                value={goto}
                onChange={(event) => setGoto(event.target.value.replace(/\D/g, ''))}
              />
            </form>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

// A select of a filter: "label: all" and its options ([value, text]); highlighted while it filters.
export function FilterSelect({ label, value, options, onChange }) {
  return (
    <select
      className={`select ${value ? 'filter-on' : ''}`}
      aria-label={label}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t('{label}: all', { label })}</option>
      {options.map(([optionValue, text]) => (
        <option key={String(optionValue)} value={String(optionValue)}>
          {text}
        </option>
      ))}
    </select>
  );
}

// The head of a column that orders: by it, by it descending, and back.
export function SortHead({ name, label, order, onOrder, className = '' }) {
  const on = order === name || order === `-${name}`;
  const icon = order === name ? 'sortUp' : order === `-${name}` ? 'sortDown' : 'sort';
  return (
    <th className={className} aria-sort={order === name ? 'ascending' : order === `-${name}` ? 'descending' : 'none'}>
      <button
        type="button"
        className={`sort ${on ? 'on' : ''}`}
        onClick={() => onOrder(order === name ? `-${name}` : name)}
      >
        {label}
        <Icon name={icon} />
      </button>
    </th>
  );
}

// A text that is sent once the typing stops (searches).
export function useDebounced(value, wait = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return settled;
}

export function SkeletonRows({ columns, rows = 6 }) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row}>
      {Array.from({ length: columns }, (__, column) => (
        <td key={column}>
          <div className="skeleton" style={{ width: `${40 + ((row * 7 + column * 13) % 50)}%` }} />
        </td>
      ))}
    </tr>
  ));
}
