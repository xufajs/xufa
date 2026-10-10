// Redaction of paths (`req.headers.authorization`, `users[*].password`, `a["b-c"]`) without changing the objects
// logged: the containers on the way to a redacted value are copied.

function parsePath(path) {
  const segments = [];
  let i = 0;
  let current = '';
  const flush = () => {
    if (current !== '') segments.push(current);
    current = '';
  };
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      flush();
      i += 1;
    } else if (ch === '[') {
      flush();
      const end = path.indexOf(']', i);
      if (end === -1) throw new Error(`Invalid redaction path: ${path}`);
      let inner = path.slice(i + 1, end).trim();
      if ((inner[0] === '"' || inner[0] === "'") && inner[inner.length - 1] === inner[0]) inner = inner.slice(1, -1);
      segments.push(inner);
      i = end + 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  flush();
  if (segments.length === 0) throw new Error(`Invalid redaction path: ${path}`);
  return segments;
}

const clone = (value) => (Array.isArray(value) ? value.slice() : { ...value });
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function applyPath(value, segments, index, rule, trail) {
  if (value === null || typeof value !== 'object') return value;
  const segment = segments[index];
  const last = index === segments.length - 1;
  const keys = segment === '*' ? Object.keys(value) : hasOwn(value, segment) ? [segment] : null;
  if (keys === null) return value;
  let copy = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const child = value[key];
    trail.push(key);
    if (last) {
      copy = copy || clone(value);
      if (rule.remove) delete copy[key];
      else copy[key] = rule.censorFn ? rule.censor(child, trail.slice()) : rule.censor;
    } else {
      const replaced = applyPath(child, segments, index + 1, rule, trail);
      if (replaced !== child) {
        copy = copy || clone(value);
        copy[key] = replaced;
      }
    }
    trail.pop();
  }
  return copy || value;
}

// Returns a function giving the object with the paths redacted, or null when there is nothing to redact.
function createRedactor(options) {
  if (!options) return null;
  const opts = Array.isArray(options) ? { paths: options } : options;
  if (!Array.isArray(opts.paths)) throw new Error('pino – redact must contain an array of strings');
  if (opts.paths.length === 0) return null;
  const censor = opts.censor === undefined ? '[Redacted]' : opts.censor;
  const rule = { censor, censorFn: typeof censor === 'function', remove: opts.remove === true };
  const paths = opts.paths.map(parsePath);
  return function redact(obj) {
    let result = obj;
    for (let i = 0; i < paths.length; i += 1) result = applyPath(result, paths[i], 0, rule, []);
    return result;
  };
}

export { createRedactor, parsePath };
