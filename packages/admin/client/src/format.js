// How values are shown: dates, numbers and times relative to now in the language of the page, and the tones of
// statuses.
import { t, locale } from './i18n.js';

const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
const number = new Intl.NumberFormat(locale);

export function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateTime.format(date);
}

export function day(value) {
  if (!value) return '—';
  const date = new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : dateOnly.format(date);
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

// '3 minutes ago', 'in 2 hours'.
export function ago(value, now = Date.now()) {
  if (!value) return '—';
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return String(value);
  if (Math.abs(seconds) < 10) return t('now');
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') return relative.format(Math.round(seconds / size), unit);
  }
  return '';
}

export function duration(from, to) {
  if (!from || !to) return '—';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${Math.round(s % 60)} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const count = (value) => number.format(value || 0);

// The tone of a status: success, danger, warning, info, accent or neutral ('').
const TONES = {
  done: 'success',
  ok: 'success',
  up: 'success',
  ready: 'success',
  failed: 'danger',
  down: 'danger',
  error: 'danger',
  cancelled: '',
  skipped: '',
  waiting: '',
  pending: 'accent',
  running: 'info',
  retrying: 'warning',
  paused: 'warning',
  degraded: 'warning',
};

export const toneOf = (status) => TONES[status] ?? '';

// The word of a status in the language of the page (those of jobs, runs, steps and health: t('running')).
export const statusLabel = (status) => (typeof status === 'string' ? t(status) : status);

export const LIVE = new Set(['running', 'retrying', 'pending']);

// The initials of a name: 'Ada Lovelace' gives AL, 'ada@example.com' gives AD.
export function initials(name) {
  const text = String(name || '?').split('@')[0];
  const words = text.split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

// The label of a field: its own (label of the model), or one of its name.
export function fieldLabel(field) {
  return field.label || humanize(field.name);
}

// The label of a value of a field of choices (its label, or the value).
export function choiceLabel(field, value) {
  const index = field.choices ? field.choices.indexOf(value) : -1;
  return index >= 0 && field.choiceLabels ? field.choiceLabels[index] : String(value);
}

// A label for a name of a field: createdAt gives "Created at", author_id gives "Author id".
export function humanize(name) {
  const text = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
