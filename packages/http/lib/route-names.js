// Routes by name, and their addresses back (Django's path(..., name=) and reverse()): a route with `name` is kept with
// its address (with the prefix of its plugin), and reverse(name, params, { query }) fills its parameters.
//
//   app.get('/books/:id', { name: 'book' }, handler);
//   app.reverse('book', { id: 7 });                    // '/books/7'
//   app.reverse('book', [7], { query: { page: 2 } });  // '/books/7?page=2'
//
// The parameters of an address are those of the router: :name, :name(regex) (the value must match it), :name? (may be
// left out), * (the rest of the address, params['*']), and :: for a colon. Values are encoded as parts of a path (a
// slash is %2F), but * keeps its slashes.
import { createError } from '@xufa/errors';

// Its own error, apart from those of fastify (lib/errors.js has theirs, as upstream).
const XUFA_ERR_ROUTE_NAME = createError('XUFA_ERR_ROUTE_NAME', '%s', 500, TypeError);

class XufaError {
  constructor(kind, message) {
    return Object.assign(new XUFA_ERR_ROUTE_NAME(message), { kind });
  }
}

// The parts of a pattern: texts and parameters { name, regex, optional, wildcard }.
function partsOf(pattern) {
  const parts = [];
  let text = '';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === ':' && pattern[i + 1] === ':') {
      text += ':';
      i += 2;
    } else if (char === ':') {
      let end = i + 1;
      while (end < pattern.length && /[\w$]/.test(pattern[end])) end += 1;
      const name = pattern.slice(i + 1, end);
      let regex = null;
      if (pattern[end] === '(') {
        let depth = 0;
        let close = end;
        for (; close < pattern.length; close += 1) {
          if (pattern[close] === '\\') close += 1;
          else if (pattern[close] === '(') depth += 1;
          else if (pattern[close] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        regex = pattern.slice(end + 1, close);
        end = close + 1;
      }
      const optional = pattern[end] === '?';
      if (optional) end += 1;
      if (text) parts.push(text);
      text = '';
      parts.push({ name, regex, optional, wildcard: false });
      i = end;
    } else if (char === '*') {
      if (text) parts.push(text);
      text = '';
      parts.push({ name: '*', regex: null, optional: true, wildcard: true });
      i += 1;
    } else {
      text += char;
      i += 1;
    }
  }
  if (text) parts.push(text);
  return parts;
}

class RouteNames {
  constructor() {
    this.routes = new Map();
  }

  add(name, url, method) {
    if (typeof name !== 'string' || name === '') throw new XufaError('NAME_INVALID', 'The name of a route is a text');
    const known = this.routes.get(name);
    if (known && known.url !== url) {
      throw new XufaError('NAME_DUPLICATED', `Two routes named ${name}: ${known.url} and ${url}`);
    }
    if (known) known.methods.add(method);
    else {
      const parts = partsOf(url);
      // A route without parameters: its address, made once (templates ask for it in every link of every page).
      const fixed = parts.every((part) => typeof part === 'string') ? parts.join('') || '/' : null;
      this.routes.set(name, { url, methods: new Set([method]), parts, fixed });
    }
  }

  has(name) {
    return this.routes.has(name);
  }

  // The routes by name: { name: { url, methods } }.
  list() {
    return Object.fromEntries(
      [...this.routes].map(([name, route]) => [name, { url: route.url, methods: [...route.methods] }])
    );
  }

  reverse(name, params = {}, { query } = {}) {
    const route = this.routes.get(name);
    if (!route) throw new XufaError('NAME_UNKNOWN', `No route named ${name}`);
    if (route.fixed !== null && !query && !(Array.isArray(params) && params.length)) return route.fixed;
    const given = params === null || params === undefined ? {} : params;
    const list = Array.isArray(given) ? given : null;
    let next = 0; // (the parameters of a list, taken in order)
    let address = '';
    for (const part of route.parts) {
      if (typeof part === 'string') {
        address += part;
        continue;
      }
      let value;
      if (list) {
        value = list[next];
        next += 1;
      } else value = given[part.name];
      if (value === undefined || value === null || value === '') {
        if (part.optional) {
          // An optional parameter left out takes its slash with it (/books/:page? is /books).
          if (address.endsWith('/') && !part.wildcard) address = address.slice(0, -1);
          continue;
        }
        throw new XufaError('PARAM_MISSING', `The route ${name} (${route.url}) needs ${part.name}`);
      }
      // (A number needs no encoding: its text is digits, a point and a sign.)
      if (typeof value === 'number' && part.regex === null && !part.wildcard) {
        address += String(value);
        continue;
      }
      value = String(value instanceof Date ? value.toISOString() : value);
      // (compiled once for each part, not at every reverse)
      if (part.regex !== null && !(part.matcher ||= new RegExp(`^(?:${part.regex})$`)).test(value)) {
        throw new XufaError('PARAM_INVALID', `${part.name} of the route ${name} is not ${part.regex}: ${value}`);
      }
      address += part.wildcard ? value.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value);
    }
    if (list && next < list.length) {
      throw new XufaError(
        'PARAM_EXTRA',
        `The route ${name} (${route.url}) takes ${route.parts.filter((p) => typeof p !== 'string').length} parameters`
      );
    }
    if (query && typeof query === 'object') {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        for (const item of [].concat(value)) search.append(key, String(item));
      }
      const text = search.toString();
      if (text) address += `?${text}`;
    }
    return address || '/';
  }
}

export { RouteNames, partsOf };
