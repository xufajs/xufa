// The routes of the page, in its hash: #/Book?page=2&search=ada. The query of a list is in the address, so going back,
// reloading and sharing a link keep it. A blocker (a form with changes) is asked before the route changes.
import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const at = raw.indexOf('?');
  const path = at < 0 ? raw : raw.slice(0, at);
  const query = at < 0 ? '' : raw.slice(at + 1);
  return {
    parts: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(query)),
    hash: window.location.hash,
  };
}

// The address of a route: its parts, and its query without empty values.
export function href(parts, query = {}) {
  const path = `#/${parts.map((part) => encodeURIComponent(String(part))).join('/')}`;
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== null && value !== '' && value !== false
  );
  if (!entries.length) return path;
  return `${path}?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

let blocker = null;
let current = window.location.hash;
const listeners = new Set();

function emit() {
  current = window.location.hash;
  const route = parse();
  listeners.forEach((listener) => listener(route));
}

// A function asked before leaving (it returns a promise of whether to leave), or null.
export function setBlocker(fn) {
  blocker = fn;
}

window.addEventListener('hashchange', () => {
  if (!blocker || window.location.hash === current) {
    emit();
    return;
  }
  // Back where it was until the blocker says yes.
  const wanted = window.location.hash;
  window.history.replaceState(null, '', current);
  Promise.resolve(blocker()).then((leave) => {
    if (!leave) return;
    blocker = null;
    window.history.pushState(null, '', wanted);
    emit();
  });
});

export function navigate(parts, query, { replace = false } = {}) {
  const target = typeof parts === 'string' ? parts : href(parts, query);
  if (target === window.location.hash) return;
  if (replace && !blocker) {
    window.history.replaceState(null, '', target);
    emit();
    return;
  }
  window.location.hash = target;
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    listeners.add(setRoute);
    return () => listeners.delete(setRoute);
  }, []);
  return route;
}
