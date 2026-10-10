// The API of the admin (under api/ of the page): JSON, the tenant chosen (x-xufa-tenant), and for writes the header of
// the admin and the CSRF token of the session. A 401 of a login sends the page to the login page.
import { useCallback, useEffect, useRef, useState } from 'react';

const settings = { tenant: null, csrf: null };

export function setTenant(id) {
  settings.tenant = id || null;
}

export function setCsrf(token) {
  settings.csrf = token || null;
}

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || (status ? `Error ${status}` : 'Could not reach the server'));
    this.status = status;
    this.data = data || {};
  }
}

// path: under api/ ('Book?page=2'), or of the page itself ('/logout').
export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { accept: 'application/json' };
  if (settings.tenant) headers['x-xufa-tenant'] = settings.tenant;
  if (method !== 'GET') {
    headers['x-xufa-admin'] = '1';
    if (settings.csrf) headers['x-csrf-token'] = settings.csrf;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  const url = path.startsWith('/') ? path.slice(1) : `api/${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, null);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ error: response.statusText }));
  if (response.status === 401 && data && data.login) {
    // Logged out, or the session ended: to the login page (and nothing more here).
    window.location.href = 'login';
    return new Promise(() => {});
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

// The answer of a GET, read again when its path changes or reload() is called: { data, error, loading, reload }. The
// data of the last answer stays while the next one loads (lists do not blink). quiet reloads keep loading false.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: path !== null });
  const [tick, setTick] = useState(0);
  const quiet = useRef(false);
  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    if (!quiet.current) setState((current) => ({ ...current, loading: true }));
    quiet.current = false;
    api(path, { signal: controller.signal }).then(
      (data) => setState({ data, error: null, loading: false }),
      (error) => {
        if (error.name !== 'AbortError') setState((current) => ({ data: current.data, error, loading: false }));
      }
    );
    return () => controller.abort();
  }, [path, tick]);
  const reload = useCallback((options = {}) => {
    quiet.current = Boolean(options.quiet);
    setTick((value) => value + 1);
  }, []);
  return { ...state, reload };
}

// Reads again every `every` ms while `on` (a page of what is running).
export function useInterval(callback, every, on = true) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!on) return undefined;
    const timer = setInterval(() => saved.current(), every);
    return () => clearInterval(timer);
  }, [every, on]);
}
