// The paths of Express 5's routes (path-to-regexp 8): text, :name (a segment), *name (one or more segments, an array
// of them), {...} (optional), \ to escape; "quoted names"; a RegExp (its groups the params: names or 0, 1...); an
// array of them (any). A path is made a matcher once: matcher(pathname) is { path, params } or false.

const ID_START = /^[$_\p{ID_Start}]$/u;
const ID_CONTINUE = /^[$\u200c\u200d\p{ID_Continue}]$/u;

export class PathError extends TypeError {
  constructor(message, path) {
    super(`${message}${path ? `: ${path}` : ''}; visit https://git.new/pathToRegexpError for info`);
    this.originalPath = path;
  }
}

// The tokens of a path: { type: 'text' | 'param' | 'wildcard' | 'group', value | name | tokens }.
function parse(text) {
  const chars = [...text];
  let index = 0;
  const until = (end) => {
    const output = [];
    let path = '';
    const flush = () => {
      if (path) output.push({ type: 'text', value: path });
      path = '';
    };
    while (index < chars.length) {
      const char = chars[index++];
      if (char === end) {
        flush();
        return output;
      }
      if (char === '\\') {
        if (index === chars.length) throw new PathError(`Unexpected end after \\ at index ${index}`, text);
        path += chars[index++];
        continue;
      }
      if (char === ':' || char === '*') {
        let name = '';
        if (ID_START.test(chars[index])) {
          do name += chars[index++];
          while (ID_CONTINUE.test(chars[index]));
        } else if (chars[index] === '"') {
          let quoteStart = index;
          while (index < chars.length) {
            index += 1;
            if (chars[index] === '"') {
              index += 1;
              quoteStart = 0;
              break;
            }
            if (chars[index] === '\\') index += 1;
            name += chars[index];
          }
          if (quoteStart) throw new PathError(`Unterminated quote at index ${quoteStart}`, text);
        }
        if (!name) throw new PathError(`Missing parameter name at index ${index}`, text);
        flush();
        output.push({ type: char === ':' ? 'param' : 'wildcard', name });
        continue;
      }
      if (char === '{') {
        flush();
        output.push({ type: 'group', tokens: until('}') });
        continue;
      }
      if ('}()[]+?!'.includes(char)) throw new PathError(`Unexpected ${char} at index ${index - 1}`, text);
      path += char;
    }
    if (end) throw new PathError(`Unexpected end at index ${index}, expected ${end}`, text);
    flush();
    return output;
  };
  return until('');
}

const escape = (text) => text.replace(/[.+*?^${}()[\]|/\\]/g, '\\$&');

// Each sequence of tokens a path's optional groups make (with and without each).
function sequences(tokens, index, result, callback) {
  let at = index;
  while (at < tokens.length) {
    const token = tokens[at++];
    if (token.type === 'group') {
      const length = result.length;
      const rest = at;
      sequences(token.tokens, 0, result, (sequence) => sequences(tokens, rest, sequence, callback));
      result.length = length;
      continue;
    }
    result.push(token);
  }
  callback(result);
}

// What a capture may take when it may not take the text a or b (the delimiter, the text after it).
function negate(a, b) {
  if (b.length > a.length) return negate(b, a);
  const other = a === b ? '' : b;
  if (other.length > 1) return `(?:(?!${escape(a)}|${escape(other)})[^])`;
  if (a.length > 1) return `(?:(?!${escape(a)})[^${escape(other)}])`;
  return `[^${escape(a + other)}]`;
}

// The source of a sequence's regexp (path-to-regexp 8's: a param takes a segment, or less when text follows it in
// the segment; a wildcard takes the rest, segments too).
function sourceOf(tokens, keys, path) {
  let result = '';
  let backtrack = '';
  let wildcardBacktrack = '';
  let previous = 0;
  let inSegment = 0;
  const later = (from, type) => {
    for (let i = from; i < tokens.length; i += 1) {
      if (tokens[i].type === type) return true;
      if (tokens[i].type === 'text' && tokens[i].value.includes('/')) break;
    }
    return false;
  };
  const peekText = (from) => {
    let text = '';
    for (let i = from; i < tokens.length && tokens[i].type === 'text'; i += 1) text += tokens[i].value;
    return text;
  };
  tokens.forEach((token, i) => {
    if (token.type === 'text') {
      result += escape(token.value);
      backtrack += token.value;
      if (previous === 2) wildcardBacktrack += token.value;
      if (token.value.includes('/')) inSegment = 0;
      return;
    }
    if (previous && !backtrack) throw new PathError(`Missing text before "${token.name}" ${token.type}`, path);
    if (token.type === 'param') {
      if (inSegment & 2) result += `(${negate('/', backtrack)}+)`;
      else if (later(i + 1, 'wildcard')) result += `(${negate('/', peekText(i + 1))}+)`;
      else if (inSegment & 1) result += `(${negate('/', backtrack)}+|${escape(backtrack)})`;
      else result += `(${negate('/', '')}+)`;
      previous = 1;
      inSegment |= 1;
    } else {
      if (inSegment & 2) result += `(${negate(backtrack, '')}+)`;
      else if (wildcardBacktrack) result += `(${negate(wildcardBacktrack, '')}+|${negate('/', '')}+)`;
      else result += '([^]+)';
      wildcardBacktrack = '';
      previous = 2;
      inSegment |= 2;
    }
    keys.push(token);
    backtrack = '';
  });
  return result;
}

// The params of a match: objects without Object.prototype (a param may be called constructor), of a class, so that V8
// keeps them as fast objects (Object.create(null) would be a dictionary: slower to read and to write as JSON).
export function Params() {}
Params.prototype = Object.create(null);

// The decoding of a param's value: a URIError is a 400 (Failed to decode param '...').
export function decodeParam(value) {
  if (typeof value !== 'string' || value.length === 0 || value.indexOf('%') === -1) return value;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) {
      error.message = `Failed to decode param '${value}'`;
      error.status = 400;
    }
    throw error;
  }
}

// The matcher of a path of text (or an array of them): its regexp, case-insensitive unless sensitive; end: the whole
// path, or a prefix ending at a '/'; trailing: a '/' at the end allowed.
function textMatcher(path, { sensitive, end, trailing }) {
  const keys = [];
  let source = '';
  let combinations = 0;
  (Array.isArray(path) ? path.flat(Infinity) : [path]).forEach((text) => {
    sequences(parse(text), 0, [], (tokens) => {
      if (combinations >= 256) throw new PathError('Too many path combinations', text);
      if (combinations > 0) source += '|';
      source += sourceOf(tokens, keys, text);
      combinations += 1;
    });
  });
  let pattern = `^(?:${source})`;
  if (trailing) pattern += '(?:\\/$)?';
  pattern += end ? '$' : '(?=\\/|$)';
  const regexp = new RegExp(pattern, sensitive ? '' : 'i');
  return (input) => {
    const m = regexp.exec(input);
    if (!m) return false;
    const params = new Params();
    for (let i = 1; i < m.length; i += 1) {
      if (m[i] === undefined) continue;
      const key = keys[i - 1];
      params[key.name] = key.type === 'param' ? decodeParam(m[i]) : m[i].split('/').map(decodeParam);
    }
    return { path: m[0], params };
  };
}

const GROUP = /\((?:\?<(.*?)>)?(?!\?)/g;

// The matcher of a RegExp: its groups the params (named, or 0, 1... in order).
function regexpMatcher(regexp) {
  const keys = [];
  let name = 0;
  let m;
  GROUP.lastIndex = 0;
  while ((m = GROUP.exec(regexp.source))) keys.push(m[1] || name++);
  return (input) => {
    const match = regexp.exec(input);
    if (!match) return false;
    const params = {};
    for (let i = 1; i < match.length; i += 1) {
      const value = decodeParam(match[i]);
      if (value !== undefined) params[keys[i - 1]] = value;
    }
    return { path: match[0], params };
  };
}

// Express's matcher of a layer's path: strict keeps a trailing '/' of the path (otherwise dropped, and allowed at the
// end of a request's); end: a route (the whole path) or a middleware (a prefix).
export function compilePath(path, { sensitive = false, strict = false, end = true } = {}) {
  const one = (item) => {
    if (item instanceof RegExp) return regexpMatcher(item);
    const loosen = (text) => (strict || text === '/' ? text : String(text).replace(/\/+$/, ''));
    const text = Array.isArray(item) ? item.flat(Infinity).map(loosen) : loosen(item);
    return textMatcher(text, { sensitive, end, trailing: !strict });
  };
  const matchers = Array.isArray(path) ? path.map(one) : [one(path)];
  if (matchers.length === 1) return matchers[0];
  return (input) => {
    for (const matcher of matchers) {
      const found = matcher(input);
      if (found) return found;
    }
    return false;
  };
}
