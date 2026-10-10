import { createElement, Fragment } from 'react';

// The words of the page in the language of the user: the server puts the catalog of the request in the page (a script
// of JSON, #xufa-admin-i18n: { locale, messages }), whose keys are the English texts (t('Save')), with {name}
// parameters. A text without its translation stays in English.
const given = (() => {
  try {
    const element = typeof document === 'undefined' ? null : document.getElementById('xufa-admin-i18n');
    return element ? JSON.parse(element.textContent) : null;
  } catch {
    return null;
  }
})();

export const locale = (given && given.locale) || 'en';
const messages = (given && given.messages) || {};
// The languages the user may choose ([{ tag, name }]: none when the admin has a language of its own).
export const languages = (given && given.languages) || [];

// A language chosen in the page: kept in a cookie (a year), which the server reads, and the page loaded again in it.
export function chooseLanguage(tag) {
  document.cookie = `xufa-admin-language=${encodeURIComponent(tag)}; path=/; max-age=31536000; SameSite=Lax`;
  window.location.reload();
}

const fill = (text, params) =>
  params
    ? text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])))
    : text;

// The text of the language of the page: t('Delete {label}?', { label }).
export function t(text, params) {
  const found = Object.hasOwn(messages, text) ? messages[text] : text;
  return fill(found, params);
}

// One or other (counts): tn(n, '{count} object', '{count} objects').
export function tn(count, one, other, params = {}) {
  return t(count === 1 ? one : other, { count, ...params });
}

// A text with elements in it, as an array for React: tj('{count} due now', { count: <strong>3</strong> }).
export function tj(text, params = {}) {
  const found = Object.hasOwn(messages, text) ? messages[text] : text;
  const parts = [];
  let last = 0;
  found.replace(/\{(\w+)\}/g, (whole, name, offset) => {
    if (offset > last) parts.push(found.slice(last, offset));
    parts.push(params[name] === undefined ? whole : params[name]);
    last = offset + whole.length;
    return whole;
  });
  if (last < found.length) parts.push(found.slice(last));
  // Each part with a key (React asks them in arrays).
  return parts.map((part, index) => createElement(Fragment, { key: index }, part));
}
