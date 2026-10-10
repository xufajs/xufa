// Parameters of routes as Django's path converters: /books/<int:pk>/ is /books/:pk(^\d+)/ with request.params.pk a
// number. <str:name> (or <name>) is any text but a slash, <slug:name> letters, digits, - and _, <uuid:name> a uuid
// (lower case), <path:name> the rest of the address (slashes too; the last part of a route). A value that is not of
// its kind is not the route (404).
const CONVERTERS = {
  str: { regex: null },
  int: { regex: '^\\d+', convert: (value) => Number(value) },
  slug: { regex: '^[-a-zA-Z0-9_]+' },
  uuid: { regex: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' },
  path: { regex: null },
};

const PART = /<(?:(\w+):)?([A-Za-z_$][\w$]*)>/g;

// The pattern of the router for a path with converters, and the conversions of its values: { url, convert } (convert
// null when nothing is converted); null for a path without them.
function convertersOf(path) {
  if (typeof path !== 'string' || !path.includes('<')) return null;
  const converted = [];
  let wildcard = null;
  const url = path.replace(PART, (whole, kind = 'str', name, offset) => {
    const converter = CONVERTERS[kind];
    if (!converter) {
      throw new TypeError(`${path}: no converter ${kind} (${Object.keys(CONVERTERS).join(', ')})`);
    }
    if (kind === 'path') {
      if (offset + whole.length !== path.length)
        throw new TypeError(`${path}: <path:${name}> is the last part of a route`);
      wildcard = name;
      return '*';
    }
    if (converter.convert) converted.push([name, converter.convert]);
    return converter.regex ? `:${name}(${converter.regex})` : `:${name}`;
  });
  const convert =
    converted.length || wildcard
      ? function convertParams(request, reply, done) {
          const { params } = request;
          if (params) {
            for (let i = 0; i < converted.length; i += 1) {
              const [name, fn] = converted[i];
              if (params[name] !== undefined) params[name] = fn(params[name]);
            }
            if (wildcard && params['*'] !== undefined) params[wildcard] = params['*'];
          }
          done();
        }
      : null;
  return { url, convert };
}

export { convertersOf, CONVERTERS };
